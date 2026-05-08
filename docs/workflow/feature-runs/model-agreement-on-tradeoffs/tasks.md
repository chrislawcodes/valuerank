# Tasks

Branch: `ff/model-agreement-on-tradeoffs` (already checked out off `main` at `9c48754b`).

Each slice below ends at `[CHECKPOINT]` and is independently buildable. Diff sizes are estimates; they MUST stay under 300 lines per slice. If a slice exceeds estimate, split before merging.

---

## Slice 1 — Snapshot infrastructure (~150 lines)

**Goal:** snapshot output carries `cellLevelOutcomes` alongside the existing `valuePairModelVotes`, version bumped to `1.12.0`.

**Files (all in `cloud/apps/api/src/services/analysis/`):**
- `domain-analysis-cache-types.ts` — extend type
- `domain-analysis-snapshot-builder.ts` — derive new field
- `domain-analysis-cache.ts` — add reader function

**Implementation:**

1. In `domain-analysis-cache-types.ts`:
   - Add to `DomainAnalysisSnapshotOutput`:
     ```ts
     cellLevelOutcomes?: Record<string, { aChoices: number; bChoices: number; neutrals: number }>;
     ```
     Key format documented in TS comment: `definitionId::modelId::canonicalA::canonicalB::ownLevel::opponentLevel`.
   - Bump `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` from `'1.11.0'` to `'1.12.0'`.

2. In `domain-analysis-snapshot-builder.ts`:
   - Locate the existing `valuePairModelVotes` two-pass loop (lines ~194-231 currently). DO NOT REMOVE IT.
   - Add a new derivation pass AFTER the existing one. Use the pseudocode from plan § A2:
     - Group `cellMap` entries by `(definitionId, modelId, ownLevel, opponentLevel)` (drops `valueKey`)
     - For each group with exactly 2 valueKeys: sort alphabetically, emit one canonical-direction outcome
     - Skip groups with `≠ 2` valueKeys (matches existing skip behavior for non-binary cells)
   - Add the new field to the returned `DomainAnalysisSnapshotOutput` alongside `valuePairModelVotes`.

3. In `domain-analysis-cache.ts`:
   - Add `readCellLevelOutcomesFromSnapshot(scope, domainId, configSignature)` function.
   - Mirrors the existing `readValuePairModelVotesFromSnapshot` pattern: same query, same JSDoc style, returns `Record<string, ...> | null`.

**Verification:**
- Build: `npm run build --workspace @valuerank/api` succeeds.
- Lint: `npm run lint --workspace @valuerank/api` clean (zero new warnings).
- Manual: temporarily add `console.log` in the new derivation, run the snapshot rebuild for one domain, observe `cellLevelOutcomes` populated. Remove the log.
- No tests required at this slice — unit tests are in slice 2.

[CHECKPOINT] — diff review

---

## Slice 2 — Math library + Pothos types (~250 lines)

**Goal:** all kappa/agreement math is implemented as pure functions with full unit-test coverage. GraphQL types are defined.

**Files:**
- `cloud/apps/api/src/services/model-agreement/math.ts` — NEW
- `cloud/apps/api/tests/services/model-agreement/math.test.ts` — NEW
- `cloud/apps/api/src/graphql/types/model-agreement-on-tradeoffs.ts` — NEW

**Implementation:**

1. `math.ts` exports:
   - `MIN_TRIALS_FOR_CONSISTENCY = 2`
   - `KAPPA_TIE_EPSILON = 1e-9`
   - `isTied(proportionA: number): boolean` — returns `Math.abs(proportionA - 0.5) < KAPPA_TIE_EPSILON`
   - `cohensKappa(observedAgreement: number, chanceAgreement: number): number | null` — returns `null` when `chanceAgreement === 1` (degenerate). Throws on inputs outside `[0, 1]` (defensive — these come from internal computation, not user input).
   - `kappaInterpretation(kappa: number | null): string | null` — null in / null out; otherwise mapped per spec.
   - `percentAgreement(matchedCells: number, totalCells: number): number | null` — `null` when `totalCells === 0`.
   - `equalWeightAggregate(perVignetteValues: ReadonlyArray<ReadonlyArray<number>>): number | null` — outer array = vignettes, inner array = cells. Returns `null` if every vignette is empty. Otherwise: mean of per-vignette means (each vignette weighted equally regardless of cell count).

2. `math.test.ts` — must include all unit-test anchors from spec § Verification plan AND plan § Wave 2:
   - `cohensKappa(1.0, 0.5) === 1.0`
   - `cohensKappa(0.5, 0.5) === 0`
   - `cohensKappa(0.0, 0.5) === -1.0`
   - `cohensKappa(0.0, 1.0) === null`
   - `kappaInterpretation(null) === null`
   - `kappaInterpretation(0.65) === 'Substantial'`
   - `kappaInterpretation(0.8) === 'Near-perfect'`
   - `percentAgreement(0, 0) === null`
   - `percentAgreement(5, 10) === 0.5`
   - `equalWeightAggregate([[0.6, 0.6, ... 25 times], [0.6, 0.6, 0.6, 0.6, 0.6]]) === 0.6` (sparse vignette doesn't bias)
   - `equalWeightAggregate([[1.0], [0.0, 0.0, ... 25 times]]) === 0.5` (1-cell vignette weighted same as 25-cell)
   - `equalWeightAggregate([[]]) === null`
   - `isTied(0.5) === true`
   - `isTied(1/2) === true`
   - `isTied(2/4) === true`
   - `isTied(3/6) === true`
   - `isTied(0.5000000001) === true` (within epsilon)
   - `isTied(0.49) === false`
   - `isTied(0.51) === false`

3. `model-agreement-on-tradeoffs.ts` Pothos types — exact shapes from spec § Output schema, with these revisions from plan reconciliation:
   - `ModelAgreementResult` adds `excludedTiedCells: Int!` and `excludedNonBinaryCells: Int!`.
   - All metric fields nullable (handled in spec).

**Verification:**
- Build + lint clean.
- `npm run test --workspace @valuerank/api -- math.test.ts` passes all anchors.

[CHECKPOINT] — diff review

---

## Slice 3 — Resolver implementation (~250 lines)

**Goal:** the two GraphQL queries return correct data driven by the snapshot's `cellLevelOutcomes`.

**Files:**
- `cloud/apps/api/src/graphql/queries/model-agreement-on-tradeoffs.ts` — NEW (both queries in one file)
- `cloud/apps/api/src/graphql/queries/index.ts` — add import
- `cloud/apps/api/tests/graphql/queries/model-agreement-on-tradeoffs.test.ts` — NEW integration tests

**Implementation:**

1. New resolver file with two `builder.queryField` calls:
   - `modelAgreementOnTradeoffs(modelIds, domainId, scope, signature)` — main query
   - `modelPairDivergenceBreakdown(modelAId, modelBId, domainId, scope, signature)` — drilldown query

2. Common shape:
   - Validate args (reuse the validation patterns from the soon-to-be-deleted `model-grouping-significance.ts` resolver — copy and adapt, do NOT import from the delete path).
   - Resolve scope/signature/runs (`resolveDomainAnalysisScopeDefinitions`, `resolveSignatureRuns` — same as current resolver).
   - Read `cellLevelOutcomes` via `readCellLevelOutcomesFromSnapshot`.
   - If null, queue `refresh_domain_analysis_snapshot` and return `pending: true` with empty arrays.

3. Main query computation (after snapshot loaded):
   - Filter `cellLevelOutcomes` to selected `modelIds`.
   - Build `unavailableModels` for any modelId with zero entries.
   - For remaining model pairs, iterate cells and compute:
     - Filter to decisive cells (`aChoices + bChoices > 0` for both models)
     - Filter out tied cells via `isTied(proportionA)` for either model
     - Equal-weight aggregate per vignette per pair
   - Compute `cohensKappa`, `percentAgreement`, `meanAbsoluteDivergence` per pair
   - For each model: compute `meanTrialConsistency` and `cellsObserved` using `MIN_TRIALS_FOR_CONSISTENCY = 2` filter
   - Compute `excludedTiedCells` and `excludedNonBinaryCells` totals at result level

4. Drilldown query computation:
   - Same snapshot read, filter to the two specified models only
   - Group cells by `(canonicalA, canonicalB)` value pair
   - For each value pair: equal-weight aggregate `meanAbsoluteDivergence` and the two `proportionA` averages
   - Sort output by `meanAbsoluteDivergence` descending

5. Update `index.ts` import: add `./model-agreement-on-tradeoffs.js` (DO NOT remove the old `./model-grouping-significance.js` import yet — that happens in slice 5).

6. Integration tests covering:
   - Synthetic snapshot with two perfectly-disagreeing models → `kappa = -1.0`, `percentAgreement = 0`, `meanAbsoluteDivergence = 1.0`
   - Snapshot lacking `cellLevelOutcomes` → resolver returns `pending: true` and queues refresh job
   - Empty model gets put in `unavailableModels`, not in matrix
   - Pair with zero overlapping decisive cells → row exists with `totalCells: 0` and all metrics null
   - Tied cells excluded from both kappa and divergence
   - Async refresh failure scenario: pending stays pending, doesn't crash

**Verification:**
- Build + lint clean.
- All integration tests pass with `npm run db:test:setup` first.
- `npm run test --workspace @valuerank/api` clean.

[CHECKPOINT] — diff review

---

## Slice 4 — Frontend new components (~400 lines)

**Goal:** all new UI components built, GraphQL operations defined and codegen'd. NOT yet wired into the page.

**Files:**
- `cloud/apps/web/src/api/operations/modelAgreementOnTradeoffs.graphql` — NEW (both operations)
- `cloud/apps/web/src/components/models/ModelAgreementHeatmap.tsx` — `git mv` from `ModelGroupingSignificanceHeatmap.tsx` then refactor
- `cloud/apps/web/src/components/models/ModelAgreementHeatmap.test.tsx` — `git mv` from `ModelGroupingSignificanceHeatmap.test.tsx` then refactor
- `cloud/apps/web/src/components/models/ModelAgreementSection.tsx` — NEW (top-level container)
- `cloud/apps/web/src/components/models/PairwiseAgreementMatrixReport.tsx` — NEW
- `cloud/apps/web/src/components/models/PairwiseAgreementMatrixReport.test.tsx` — NEW
- `cloud/apps/web/src/components/models/ModelTrialConsistencyReport.tsx` — NEW
- `cloud/apps/web/src/components/models/ModelTrialConsistencyReport.test.tsx` — NEW
- `cloud/apps/web/src/components/models/PairwiseDivergenceDrilldownReport.tsx` — NEW
- `cloud/apps/web/src/components/models/PairwiseDivergenceDrilldownReport.test.tsx` — NEW

**Implementation:**

1. `modelAgreementOnTradeoffs.graphql` — define both query operations matching the resolver signatures.

2. `ModelAgreementHeatmap.tsx` — git mv the old file then:
   - Change props from p-value matrix to kappa matrix
   - Color scale: red (kappa < 0) → white (kappa = 0) → green (kappa = 1). Use a perceptually-uniform diverging palette (e.g. `interpolateRdYlGn` from d3-scale-chromatic if already present, else compute manually with three stops).
   - "no overlap" cells render as gray with "—" label
   - Tooltip shows: model A label, model B label, kappa value, kappa interpretation, totalCells, percentAgreement, meanAbsoluteDivergence

3. `ModelAgreementSection.tsx`:
   - Fires `ModelAgreementOnTradeoffsQuery` with current scope/signature/modelIds.
   - Owns `selectedPair` state (`{modelAId, modelBId} | null`)
   - On query result: pick default pair via highest-divergence-with-support rule (per A6c) — among rows with `totalCells >= 10`, the highest `meanAbsoluteDivergence`; fallback to most-cells row.
   - Renders three children stacked: Matrix → Consistency → Drilldown
   - Header: "Model Agreement on Value Tradeoffs"

4. `PairwiseAgreementMatrixReport.tsx`:
   - Renders the heatmap and a companion table below.
   - Table rows = pairs sorted by (modelALabel, modelBLabel)
   - Clicking a row updates `selectedPair` (callback prop).
   - Table columns: Model A, Model B, Cells, Kappa, Interpretation, % Agreement, Mean Abs Divergence
   - Empty/null cells render "—"

5. `ModelTrialConsistencyReport.tsx`:
   - Per-model row: model name, cellsObserved count, meanTrialConsistency (formatted as %), noisy badge (if applicable)
   - Hard requirements (Gemini round-2 M2):
     - Info-icon next to "Trial Consistency" column header with tooltip text: "Measures the dominance of a model's modal choice across trials of the same scenario. 1.0 means the model gave the same answer every trial; 0.5 means it split 50/50. This conflates run-to-run variation with scenario-orientation flips and excludes single-trial cells."
     - Footnote below the table with the same explanation
   - Snapshot test asserts both elements present

6. `PairwiseDivergenceDrilldownReport.tsx`:
   - Receives `selectedPair` prop. If null, renders a placeholder ("Select a model pair from the matrix above to see per-value-pair divergence").
   - Fires `ModelPairDivergenceBreakdownQuery` when `selectedPair` changes.
   - Renders a table with columns: Value Pair, Cells Compared, Model A's % chose A, Model B's % chose A, Mean Abs Divergence.
   - Sorted by mean abs divergence descending.

7. After files are created: `npm run codegen --workspace @valuerank/web` (mandatory per MEMORY.md) — verify `graphql.ts` regenerates without errors. Commit the codegen output.

**Verification:**
- Build + lint clean.
- `npm run test --workspace @valuerank/web` passes.
- Codegen artifact (`graphql.ts`) updated and committed.

[CHECKPOINT] — diff review

---

## Slice 5 — Wire-up + delete old (~150 lines net DELETE)

**Goal:** the new section is on the page, the old code is gone, everything ships green.

**Files to modify:**
- `cloud/apps/web/src/pages/ModelsGroups.tsx` — replace section import + usage

**Files to delete:**
- API:
  - `cloud/apps/api/src/graphql/queries/model-grouping-significance.ts`
  - `cloud/apps/api/src/graphql/types/model-grouping-significance.ts`
  - `cloud/apps/api/src/services/model-grouping-significance/math.ts`
  - `cloud/apps/api/tests/services/model-grouping-significance/math.test.ts`
  - `cloud/apps/api/src/services/model-grouping-significance/` (parent folder if now empty)
- Web:
  - `cloud/apps/web/src/api/operations/modelGroupingSignificance.ts`
  - `cloud/apps/web/src/api/operations/modelGroupingSignificance.graphql`
  - `cloud/apps/web/src/components/models/ModelGroupingSignificanceTable.tsx`
  - `cloud/apps/web/src/components/models/ModelGroupingSignificanceTable.test.tsx`
  - `cloud/apps/web/src/components/models/ModelGroupingSignificanceSection.tsx`

**Files to update (imports/registrations):**
- `cloud/apps/api/src/graphql/queries/index.ts` — remove `./model-grouping-significance.js` import (the new one was added in slice 3)

**Implementation:**

1. In `ModelsGroups.tsx`:
   - Remove imports of `ModelGroupingSignificanceQuery*`, `ModelGroupingSignificanceSection`
   - Add imports of `ModelAgreementOnTradeoffsQuery*`, `ModelAgreementSection`
   - Replace the `useQuery` block and the JSX usage. Other parts of the page (cluster analysis, similarity metrics, dendrogram, etc.) are UNCHANGED.

2. Delete files listed above.

3. Re-run codegen: `npm run codegen --workspace @valuerank/web`. Ensures stale operations are scrubbed from `graphql.ts`.

4. Pre-merge sanity: `rg "modelGroupingSignificance|ModelGroupingSignificance" cloud/` returns ZERO matches in production code (excluding generated `graphql.ts` which is regenerated clean).

**Verification — full preflight gate per `cloud/CLAUDE.md`:**
- `npm run lint --workspace @valuerank/shared`
- `npm run lint --workspace @valuerank/db`
- `npm run lint --workspace @valuerank/api`
- `npm run build --workspace @valuerank/api`
- `npm run lint --workspace @valuerank/web`
- `npm run build --workspace @valuerank/web`
- All pass with zero errors.

**Pre-merge:**
- Run the production smoke test from spec § Verification plan: `mcp__valuerank__graphql_query` with `{modelIds: [claude-sonnet-4-5, deepseek-chat, grok-4-1-fast-reasoning], scope: ALL_DOMAINS, signature: vnewt0}`.

[CHECKPOINT] — diff review (final)

---

## Delivery

After slice 5 checkpoint passes:
- Open PR against `chrislawcodes/valuerank` titled "feat(models): replace Statistical Differences report with Model Agreement on Value Tradeoffs"
- PR description: link to `docs/workflow/feature-runs/model-agreement-on-tradeoffs/spec.md` and `plan.md` for context
- Wait for CI green
- Run pre-merge production smoke test
- Squash merge

---

## Parallel work

None of these slices are safely parallelizable. They have a strict dependency chain:
- Slice 1 enables slice 3 (resolver needs `cellLevelOutcomes`)
- Slice 2 enables slice 3 (resolver imports math + types)
- Slices 3 and 4 could run in parallel in theory but slice 4's `.graphql` operations need the schema from slice 3 to codegen correctly — so slice 3 lands first
- Slice 5 needs slices 1-4 done

Recommended: ship sequentially within one PR with internal checkpoints.

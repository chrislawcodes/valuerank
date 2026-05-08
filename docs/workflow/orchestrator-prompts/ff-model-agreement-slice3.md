# Codex Prompt — Model Agreement on Tradeoffs · Slice 3: Resolver Implementation

You are implementing **slice 3 of 5** in a Feature Factory feature. The full design is in:

- Spec: `docs/workflow/feature-runs/model-agreement-on-tradeoffs/spec.md`
- Plan: `docs/workflow/feature-runs/model-agreement-on-tradeoffs/plan.md`
- Tasks: `docs/workflow/feature-runs/model-agreement-on-tradeoffs/tasks.md`

**Read those three docs first. Pay particular attention to spec § Methodology and plan § A2-A7.**

Slices 1 and 2 already shipped. The snapshot has `cellLevelOutcomes` and the math library + Pothos types are in place.

## Repo

- Working branch: `ff/model-agreement-on-tradeoffs`
- Working dir: repo root
- Do NOT push or open a PR.

## What this slice does

Implements the two GraphQL query resolvers that power the new section. Both resolvers read the snapshot's `cellLevelOutcomes` and compute kappa / agreement / divergence with equal-weight aggregation.

**No frontend, no deletes in this slice.** Old `modelGroupingSignificance` resolver stays alongside the new one until slice 5.

## Files (1 new file, 1 update, 1 new test, ~250 lines)

1. NEW: `cloud/apps/api/src/graphql/queries/model-agreement-on-tradeoffs.ts`
2. UPDATE: `cloud/apps/api/src/graphql/queries/index.ts` — add `import './model-agreement-on-tradeoffs.js';`. DO NOT remove the old `model-grouping-significance` import yet.
3. NEW: `cloud/apps/api/tests/graphql/queries/model-agreement-on-tradeoffs.test.ts`

## Implementation details

### File 1 — Resolver

Two `builder.queryField` calls in one file. Use the existing `cloud/apps/api/src/graphql/queries/model-grouping-significance.ts` as a structural reference for arg validation, scope/signature resolution, and pending-snapshot handling. Adapt the patterns; do NOT import from that file.

**Signatures:**

```typescript
builder.queryField('modelAgreementOnTradeoffs', (t) =>
  t.field({
    type: ModelAgreementResultRef,
    args: {
      modelIds: t.arg.idList({ required: true }),
      domainId: t.arg.id({ required: false }),
      scope: t.arg.string({ required: true }),
      signature: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => { /* ... */ },
  }),
);

builder.queryField('modelPairDivergenceBreakdown', (t) =>
  t.field({
    type: PairDivergenceBreakdownRef,
    args: {
      modelAId: t.arg.id({ required: true }),
      modelBId: t.arg.id({ required: true }),
      domainId: t.arg.id({ required: false }),
      scope: t.arg.string({ required: true }),
      signature: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => { /* ... */ },
  }),
);
```

**Common shape (both resolvers):**

1. Validate scope (`'DOMAIN'` or `'ALL_DOMAINS'`), signature non-empty, modelIds: at least 2 distinct (main query) or exactly different A and B (drilldown).
2. Resolve scope data via `resolveDomainAnalysisScopeDefinitions` and runs via `resolveSignatureRuns` — same pattern as the old resolver.
3. Validate `filteredSourceRunIds.length > 0` else `ValidationError`.
4. Read `cellLevelOutcomes` via `readCellLevelOutcomesFromSnapshot`.
5. If null: queue `refresh_domain_analysis_snapshot` via `queueDomainAnalysisRefresh` and return `{ pending: true, ...emptyDefaults }`.
6. Resolve model labels via `getModelsFromDatabase({ activeOnly: true, availableOnly: false })` — same as old resolver.

**Main query computation (after snapshot loaded):**

For each cell-level entry where `parts.length === 6` and `selectedModelIdSet.has(modelId)`:
- Parse key as `defId::modelId::canonicalA::canonicalB::ownLevel::oppLevel`.
- Group cells by physical position: `cellsByPosition: Map<position, Map<modelId, {aChoices, bChoices, neutrals}>>` where `position = ${defId}::${canonicalA}::${canonicalB}::${ownLevel}::${oppLevel}`. This lets you look up "what did model X choose on the same cell as model Y."

Build:
- `unavailableModels` — selected models with zero entries in cellLevelOutcomes.
- `availableModels` — the complement.

For each pair `(A, B)` of available models:
- Per-vignette aggregation: walk `cellsByPosition`, group entries by `definitionId` (the first segment of position).
- For each vignette, find cells where BOTH A and B have decisive trials (`aChoices + bChoices > 0`).
- For each such cell, compute `proportionA_X = aChoices_X / (aChoices_X + bChoices_X)`. If `isTied(proportionA_A) || isTied(proportionA_B)`: increment `excludedTiedCells` and skip this cell for kappa/divergence (per A4).
- Cell metrics:
  - `divergence = |proportionA_A - proportionA_B|`
  - `agreesBinary = 1 if both > 0.5 (canonicalA wins) OR both < 0.5 (canonicalB wins) else 0`
- After processing all cells in the vignette: equal-weight mean of divergence and agreement-binary across the vignette's cells. If vignette had no comparable cells, exclude from outer aggregation.
- Equal-weight outer mean across vignettes via `equalWeightAggregate`.

Compute `cohensKappa` per pair:
- `P_observed` = the equal-weight aggregate of `agreesBinary` across vignettes (same exclusion rules)
- For `P_chance`: compute marginal probabilities `P(A chose canonicalA)` = equal-weight aggregate of `proportionA_A` (which gives the model's average rate of picking canonicalA across the comparison set). Same for B. Then `P_chance = P_A_chose_A * P_B_chose_A + P_A_chose_B * P_B_chose_B = P_A_chose_A * P_B_chose_A + (1 - P_A_chose_A) * (1 - P_B_chose_A)`.
- `kappa = cohensKappa(P_observed, P_chance)` from the math library.

Build `pairwiseAgreementMatrix` rows. For pairs with `totalCells === 0`: emit row with all metrics null.

For `trialConsistency` per available model:
- Walk all cells for the model where `aChoices + bChoices >= MIN_TRIALS_FOR_CONSISTENCY`.
- For each: `consistency = max(proportionA, 1 - proportionA)`.
- Equal-weight aggregate per vignette, then across vignettes via `equalWeightAggregate`.
- `cellsObserved = number of cells that passed the support filter`.
- `noisy = meanTrialConsistency != null && meanTrialConsistency < 0.7 && cellsObserved >= 5`.

Compute `excludedNonBinaryCells` — count physical positions in scope that have only ONE model entry per pair (none reach the cellLevelOutcomes layer because the snapshot builder skipped them; this is best-effort 0 for now since we cannot know the count without re-reading transcripts. Set to 0 with a TODO comment referencing spec § Non-binary cells follow-up).

**Drilldown query computation:**

Same snapshot read. Filter to the two specified models only. Verify both are in cellLevelOutcomes; if either is missing, return `pending: false` with empty `perValuePair` (no error — UI handles).

Group cells by `(canonicalA, canonicalB)` value pair. For each value pair:
- Per-vignette aggregation as above (only cells where both models have decisive trials AND neither is tied)
- `cellsCompared` = sum across vignettes
- `meanAbsoluteDivergence` via equal-weight aggregation
- `modelAProportionA` = equal-weight aggregate of A's `proportionA` across the comparison set (equivalent for B)

Sort the resulting array by `meanAbsoluteDivergence` descending.

**Imports needed:**
- From `'./domain-analysis-cache.js'`: `readCellLevelOutcomesFromSnapshot`, `queueDomainAnalysisRefresh`
- From `'../../services/analysis/domain-analysis-scope-loader.js'`: `resolveDomainAnalysisScopeDefinitions`
- From `'../queries/domain/shared.js'`: `resolveSignatureRuns`
- From `'../../config/models.js'`: `getModelsFromDatabase`
- From `'../../services/model-agreement/math.js'`: `cohensKappa`, `kappaInterpretation`, `percentAgreement`, `equalWeightAggregate`, `isTied`, `MIN_TRIALS_FOR_CONSISTENCY`
- From `'../types/model-agreement-on-tradeoffs.js'`: `ModelAgreementResultRef`, `PairDivergenceBreakdownRef`, plus any shape types

### File 2 — Index registration

Add `import './model-agreement-on-tradeoffs.js';` to `cloud/apps/api/src/graphql/queries/index.ts`. Place it alphabetically near similar imports. DO NOT remove `model-grouping-significance.js` — that's slice 5.

### File 3 — Integration test

Create `cloud/apps/api/tests/graphql/queries/model-agreement-on-tradeoffs.test.ts`. Use the existing `cloud/apps/api/tests/services/model-grouping-significance/math.test.ts` and any GraphQL integration tests in `cloud/apps/api/tests/graphql/` as patterns.

Test cases (use synthetic in-memory snapshot data; no DB needed if you stub `readCellLevelOutcomesFromSnapshot`. If easier, use the existing test-DB pattern):

1. **Perfect disagreement** — two models, every cell: A picks canonicalA always, B picks canonicalB always → `kappa === -1.0`, `percentAgreement === 0`, `meanAbsoluteDivergence === 1.0`.
2. **Pending snapshot** — `readCellLevelOutcomesFromSnapshot` returns null → resolver returns `pending: true`, queues refresh. (Mock the queue.)
3. **Empty model** — modelA has zero entries → modelA appears in `unavailableModels`, NOT in matrix.
4. **No-overlap pair** — two models with non-overlapping cells → row exists with `totalCells: 0` and all metrics null.
5. **Tied cell** — cell where modelA has 3/3 split → cell excluded from kappa AND divergence; `excludedTiedCells` incremented.

## Verification

1. `cd /Users/chrislaw/valuerank/cloud && npm run build --workspace @valuerank/api` — succeeds.
2. `npm run lint --workspace @valuerank/api` — zero NEW warnings.
3. `npm run test --workspace @valuerank/api` — all tests pass (you may need `npm run db:test:setup` first if your tests touch the DB; prefer in-memory mocks).
4. The new GraphQL fields `modelAgreementOnTradeoffs` and `modelPairDivergenceBreakdown` are queryable when running `npm run dev --workspace @valuerank/api` — manual verification optional, lint+build is enough.

## Commit

ONE commit:

```
ff(model-agreement) slice 3: resolver implementation

- Adds modelAgreementOnTradeoffs and modelPairDivergenceBreakdown resolvers
- Reads cellLevelOutcomes via readCellLevelOutcomesFromSnapshot
- Implements equal-weight aggregation per cell within vignette, per vignette
  across pairs (no observation-count bias)
- Excludes tied cells from kappa AND divergence (consistent denominator)
- Trial consistency uses MIN_TRIALS_FOR_CONSISTENCY=2 floor
- Old modelGroupingSignificance resolver remains registered (deleted in slice 5)

Slice 3 of 5. See docs/workflow/feature-runs/model-agreement-on-tradeoffs/.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

## Constraints

- DO NOT modify or delete the old `model-grouping-significance.ts` resolver. Both resolvers coexist after this slice.
- DO NOT modify any frontend file or any other resolver.
- DO NOT push, DO NOT open a PR.
- DO NOT MODIFY: `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `cloud/agents.md`, `MEMORY.md`, `.gitignore`, spec/plan/tasks files in the FF run dir.
- No `@ts-ignore`, no `eslint-disable`, no `any` casts.
- If a sub-step needs reordering or assumptions need clarification (e.g. a method signature you can't reproduce from spec/plan), note it in your output but do not invent. Prefer to halt and ask.

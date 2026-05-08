# Spec: model-agreement-on-tradeoffs

**Author:** Claude Sonnet 4.6, 2026-05-08
**Status:** ready for plan stage
**Delivery path:** Feature Factory
**Prerequisite:** PRs #989, #991, #992 merged (current `modelGroupingSignificance` machinery is what we're replacing).
**Unblocks:** nothing formally. This is a methodology shift on the model-comparison report.

---

## Problem

The current "Statistical Differences in Value Preferences" section on `/models` uses a methodology that is wrong for the data we have.

**Three concrete problems:**

1. **Wrong inferential frame.** The current report runs a Wilcoxon signed-rank test and reports p-values. P-values imply generalization to a population. With AI models, there is no population — each model is a single deterministic-ish entity. Running the test on n=6 value pairs and reporting `p < 0.001` overclaims what the methodology supports.

2. **Aggregation throws away information.** The snapshot's `valuePairModelVotes` collapses every cell, every vignette, every run, every level combination into a single (wins, losses) tuple per (value pair, model). Two models can score identically aggregated win rates while disagreeing on every individual scenario in opposite directions. The current method cannot detect that.

3. **Observation-count bias.** Pairs with more trials currently dominate aggregate metrics by virtue of having more underlying transcripts, not because they're more informative. There is no equal-weighting per cell or per vignette.

The right framing is the chess-roster analogy: we are characterizing a small set of specific players (models) on designed positions (vignettes with level-combination cells), then describing how often any two players make the same move. That maps cleanly onto inter-rater reliability — Cohen's kappa, percent agreement, and run-to-run consistency — which are the standard, AAPOR-defensible tools for this kind of question.

---

## Goal

Replace the "Statistical Differences in Value Preferences" section on `/models` with a new section titled **"Model Agreement on Value Tradeoffs"** that:

- Drops p-values, "Significant / Not significant" verdicts, and the Wilcoxon machinery from the user-facing report.
- Reports three stacked sub-reports in this order:
  1. **Full-roster pairwise agreement matrix** — heatmap + table showing Cohen's kappa and percent agreement for every model pair in the selected set.
  2. **Per-model self-consistency** — one row per selected model showing run-to-run reliability (how often the model chose the same value across multiple trials of the same scenario).
  3. **Per-value-pair divergence drilldown** — for a selected model pair, shows mean absolute divergence per value pair so users can see which tradeoffs the two models disagree on most.
- Computes everything with **equal weight per cell and per vignette** — observation count never inflates a cell's or vignette's contribution.
- Reuses the existing snapshot infrastructure, cell accumulator, math utilities, and UI components (Section / Heatmap / Table) wherever possible.

The cluster analysis, dendrogram, and other parts of `/models` are unchanged.

---

## Non-goals

- No change to the cluster analysis, dendrogram, similarity metrics, or any other section of the `/models` page.
- No change to the underlying transcript ingestion pipeline. Same data, different aggregation.
- No new GraphQL operations beyond what's needed for this section. Existing domain-analysis queries stay.
- No reintroduction of any p-value or significance-test framing. This is a deliberate methodology shift away from null-hypothesis testing.
- No restructuring of `ModelsGroups.tsx` page layout outside the section being replaced.
- No backend-only or frontend-only delivery — both ship together so the user-facing page never serves a stale shape.
- No introduction of the cell-level outcomes field as a public API. It's an internal snapshot field consumed only by the new resolver.

---

## User decisions already made

| # | Question | Decision |
|---|----------|----------|
| 1 | Replace the whole `/models` page or just the section? | **Replace just the significance section.** Cluster analysis and other parts stay unchanged. |
| 2 | Run-to-run reliability: which runs count? | **Use the runs the signature filter already selects.** Reliability and agreement share the same data scope. |
| 3 | Default landing layout? | **No tabs.** Three stacked scroll-down sub-reports, ordered: pairwise matrix → per-model consistency → per-pair drilldown. |
| 4 | Heatmap? | **Adapt the existing `ModelGroupingSignificanceHeatmap` component** to color-encode kappa instead of p-value. |
| 5 | Reuse vs. new modules | **Reuse aggressively.** Extend snapshot/cell-accumulator/UI components rather than create parallel modules. |
| 6 | Weighting | **Equal weight per cell, equal weight per vignette.** Aggregate at cell level first, then average across cells with equal weight, then across vignettes with equal weight. Observation count must never bias the result. |

---

## Affected surfaces — enumerated from `main` at `9c48754b`

### Backend — replace

| File | Disposition |
|------|-------------|
| `cloud/apps/api/src/graphql/queries/model-grouping-significance.ts` | **Delete** the resolver. Replace with new `cloud/apps/api/src/graphql/queries/model-agreement-on-tradeoffs.ts`. |
| `cloud/apps/api/src/graphql/types/model-grouping-significance.ts` | **Delete.** Replace with new `cloud/apps/api/src/graphql/types/model-agreement-on-tradeoffs.ts`. |
| `cloud/apps/api/src/services/model-grouping-significance/math.ts` | **Delete.** Wilcoxon, Holm-Bonferroni, bootstrap CI, rank-biserial r are all now unused. |
| `cloud/apps/api/src/services/model-grouping-significance/` (folder) | **Delete** if it becomes empty after `math.ts` removal. |
| `cloud/apps/api/tests/services/model-grouping-significance/math.test.ts` | **Delete.** Tests target deleted code. |
| `cloud/apps/api/src/graphql/queries/index.ts` | **Update import** from `./model-grouping-significance.js` to `./model-agreement-on-tradeoffs.js`. |

### Backend — extend

| File | What changes |
|------|--------------|
| `cloud/apps/api/src/services/analysis/domain-analysis-cache-types.ts` | Add new optional output field `cellLevelOutcomes: Record<string, { aChoices: number; bChoices: number; neutrals: number }>` keyed by `definitionId::modelId::valueA::valueB::ownLevel::opponentLevel`. `aChoices` = times the model chose `valueA` (alphabetically-first canonical). **Both `valuePairModelVotes` AND `cellLevelOutcomes` are written by the new builder** — the legacy field stays for one release for snapshot-rollback safety. Bump `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` from `'1.11.0'` → `'1.12.0'` so snapshots rebuild with the new field. |
| `cloud/apps/api/src/services/analysis/domain-analysis-snapshot-builder.ts` | After building `cellMap`, derive `cellLevelOutcomes` by collapsing the two valueKey entries per cell into a single canonical-direction entry. **The two-pass `valuePairModelVotes` loop stays put for now** — both the legacy and new fields are written. The legacy loop is removed in a follow-up PR after one full release cycle on `1.12.0`. The new derivation reuses `cellMap` directly without modifying `accumulateTranscriptCells`. `cellMap`'s key already includes `ownLevel` and `opponentLevel` — verified inline:

```typescript
// cloud/apps/api/src/services/analysis/transcript-cell-accumulator.ts:30-32
export function encodeCellKey(key: CellKey): string {
  return `${key.definitionId}::${key.modelId}::${key.valueKey}::${key.ownLevel}::${key.opponentLevel}`;
}
```

No upstream changes are needed. |
| `cloud/apps/api/src/services/analysis/domain-analysis-cache.ts` | Add new function `readCellLevelOutcomesFromSnapshot(scope, domainId, signature)` that returns `Record<string, ...> \| null`. Mirrors the existing `readValuePairModelVotesFromSnapshot` pattern. The old read function is deleted along with its caller. |
| `cloud/apps/api/src/graphql/queries/index.ts` | Already covered — see "replace" section. |

### Backend — new

| File | What it contains |
|------|------------------|
| `cloud/apps/api/src/services/model-agreement/math.ts` | `cohensKappa(observed: number, chance: number): number`, `percentAgreement(matchedCells: number, totalCells: number): number`, `kappaInterpretation(k: number): 'Poor' \| 'Slight' \| 'Fair' \| 'Moderate' \| 'Substantial' \| 'Near-perfect'`, plus the equal-weight aggregation helpers. Pure functions, fully unit-testable. |
| `cloud/apps/api/src/graphql/queries/model-agreement-on-tradeoffs.ts` | New resolver. Two query fields: `modelAgreementOnTradeoffs` (matrix + trial consistency) and `modelPairDivergenceBreakdown` (per-pair drilldown). Both read `cellLevelOutcomes` from the same snapshot. Pending semantics: if snapshot lacks `cellLevelOutcomes`, queue refresh and return `pending: true`. |
| `cloud/apps/api/src/graphql/types/model-agreement-on-tradeoffs.ts` | Pothos type definitions for the new GraphQL output (see § Output schema). |
| `cloud/apps/api/tests/services/model-agreement/math.test.ts` | Unit tests for kappa/agreement math. Anchor cases listed in § Verification plan. |

### Frontend — replace

| File | Disposition |
|------|-------------|
| `cloud/apps/web/src/api/operations/modelGroupingSignificance.ts` | **Delete.** Generated bindings will follow from the new `.graphql` file. |
| `cloud/apps/web/src/api/operations/modelGroupingSignificance.graphql` | **Delete.** Replace with new `cloud/apps/web/src/api/operations/modelAgreementOnTradeoffs.graphql`. |
| `cloud/apps/web/src/components/models/ModelGroupingSignificanceTable.tsx` + `.test.tsx` | **Delete.** Replace with three new section components (see § Frontend new). |
| `cloud/apps/web/src/components/models/ModelGroupingSignificanceSection.tsx` | **Delete.** Replace with new `ModelAgreementSection.tsx`. |

### Frontend — extend

| File | What changes |
|------|--------------|
| `cloud/apps/web/src/components/models/ModelGroupingSignificanceHeatmap.tsx` | **Rename** to `ModelAgreementHeatmap.tsx`. Change the input from p-value matrix to kappa matrix, change color scale (red→green for low→high kappa), update tooltips and ARIA labels. Component structure stays the same. Existing tests at `ModelGroupingSignificanceHeatmap.test.tsx` get updated to match. |
| `cloud/apps/web/src/pages/ModelsGroups.tsx` | Replace the import and usage of `ModelGroupingSignificanceSection` with the new `ModelAgreementSection`. Replace the `useQuery` call with the new operation. Everything else on the page (cluster analysis, similarity metrics, dendrogram, etc.) stays identical. |

### Frontend — new

| File | What it contains |
|------|------------------|
| `cloud/apps/web/src/api/operations/modelAgreementOnTradeoffs.graphql` | Two operations: `ModelAgreementOnTradeoffsQuery` (matrix + consistency) and `ModelPairDivergenceBreakdownQuery` (drilldown). Codegen will generate hooks for both. |
| `cloud/apps/web/src/components/models/ModelAgreementSection.tsx` | Top-level container. Fires the main query, renders the three sub-reports stacked. Owns the model-pair selection state for the drilldown sub-report (default selection: pair with the highest `meanAbsoluteDivergence` in the matrix). |
| `cloud/apps/web/src/components/models/PairwiseAgreementMatrixReport.tsx` | Sub-report 1: kappa heatmap (reused component) + companion table. Receives `pairwiseAgreementMatrix` from the main query. |
| `cloud/apps/web/src/components/models/ModelTrialConsistencyReport.tsx` | Sub-report 2: per-model trial consistency. Receives `trialConsistency` from the main query. **Required UI elements:** info-icon tooltip on the column header explaining what the metric measures and what it doesn't (run-level vs orientation-flip variation), plus a footnote below the table with the same caveat. This is a hard requirement (Gemini round-2 finding M2) — the metric carries methodology risk if presented without explanation. |
| `cloud/apps/web/src/components/models/PairwiseDivergenceDrilldownReport.tsx` | Sub-report 3: fires its own `modelPairDivergenceBreakdown` query when the selected pair changes. Renders per-value-pair divergence ranked highest to lowest. |
| `cloud/apps/web/src/components/models/*.test.tsx` for each new component | Unit tests with the same coverage discipline as the existing significance tests they replace. |

---

## Methodology — the math

### Cell-level outcomes (the foundation)

For each `(definitionId, modelId, valueA, valueB, ownLevel, opponentLevel)` cell, the snapshot stores:

- `aChoices` = number of trials where the model chose `valueA` (alphabetically-first canonical value)
- `bChoices` = number of trials where the model chose `valueB`
- `neutrals` = trials with no clear choice (excluded from agreement / kappa per the AAPOR convention; reported separately)

The cell's "decisive" trial count is `aChoices + bChoices`. Cells with `decisive = 0` are excluded from every metric (zero data).

### Per-cell metrics

For two models X and Y on a cell with at least one decisive trial each:

- `proportionA_X = aChoices_X / (aChoices_X + bChoices_X)` ∈ [0, 1]
- `proportionA_Y = aChoices_Y / (aChoices_Y + bChoices_Y)` ∈ [0, 1]
- `cellDivergence = |proportionA_X − proportionA_Y|` ∈ [0, 1]
- `cellAgreement = 1 − cellDivergence`
- For binary kappa: `modalChoice_X = "A" if proportionA_X > 0.5; "B" if proportionA_X < 0.5; tied if proportionA_X == 0.5`. Same for Y. **Tied cells are excluded from the binary-kappa numerator and denominator entirely** (avoids the directional-bias issue Gemini flagged). Tied cells ARE included in the continuous `cellDivergence` metric.
- `cellAgreesBinary = 1 if modalChoice_X == modalChoice_Y else 0` (only defined when neither is tied)

For trial consistency on one model (renamed from "self-consistency" — see Codex finding M2):

- `cellTrialConsistency = max(proportionA, 1 − proportionA)` ∈ [0.5, 1]. Unitless. 1.0 means the model chose the same value on every trial of this cell; 0.5 means it split 50/50 across trials.

**What this measures and what it doesn't.** The snapshot stores aggregate (wins, losses) counts per cell across all trials in scope and discards run identity — see `domain-analysis-snapshot-builder.ts`. So this metric tells us the dominance of the modal choice across all trials, which IS run-to-run consistency in practice (each transcript = one model query in one run, so multiple trials of the same cell come from multiple runs), but it conflates "different runs" with "scenario-orientation flips" (`scenario.orientationFlipped`). We label this metric "Trial Consistency" in the UI, not "Run-to-run Reliability," to be precise. A future enhancement could preserve run identity in the snapshot and compute a stricter run-by-run kappa.

### Per-vignette aggregation (equal weight per cell)

For every metric above, average over all cells in the vignette where both models had decisive data, with equal weight per cell. Cells where either model is missing data are excluded (not zeroed).

### Per-pair aggregation (equal weight per vignette)

When a value pair has multiple vignettes, average the per-vignette aggregates with equal weight per vignette. A vignette with 25 cells does not get more weight than one with 12.

### Cohen's kappa across the comparison set for a model pair

**Comparison set:** all cells where (a) both models have at least one decisive trial, AND (b) neither model is tied on this cell. This is the strict intersection of decisive untied cells. Marginals (`P(X chose A)` etc.) and the agreement count are both computed on this same set.

Within the comparison set:

- `P_observed` = mean of `cellAgreesBinary` across cells, weighted equally per cell within a vignette and equally per vignette across pairs.
- `P_chance` = (P(X chose A) × P(Y chose A)) + (P(X chose B) × P(Y chose B)), where each probability is computed with the same equal-weight aggregation over the comparison set.
- `kappa = (P_observed − P_chance) / (1 − P_chance)`. Defined unless `P_chance == 1` (degenerate case: both models always chose the same value on every cell). In the degenerate case both `kappa` and `kappaInterpretation` are returned as `null`. The UI renders "n/a" with a tooltip; this requires `kappaInterpretation` to be nullable in the schema (see § Output schema).
- `kappaInterpretation` (only when kappa is non-null):
  - `< 0` → "Poor (worse than chance)"
  - `[0, 0.2)` → "Slight"
  - `[0.2, 0.4)` → "Fair"
  - `[0.4, 0.6)` → "Moderate"
  - `[0.6, 0.8)` → "Substantial"
  - `[0.8, 1.0]` → "Near-perfect"

### Zero-data and no-overlap pairs

If a model pair has zero cells in the comparison set (no overlapping decisive cells), the row appears in the matrix with `totalCells: 0` and every metric (`percentAgreement`, `cohensKappa`, `kappaInterpretation`, `meanAbsoluteDivergence`) returned as `null`. The UI renders "no overlap" in those cells.

If a model has zero cells with decisive data anywhere in scope (the entire model is empty), it is dropped from the response with a `unavailableModels` entry that names it (analogous to the existing `unavailableModels` pattern in the domain-analysis result). The current `modelGroupingSignificance` resolver hard-fails in this case; the new resolver does not. This is a deliberate change from current behavior — explicitly documented.

### Non-binary value-pair cells

The current `accumulateTranscriptCells` and `buildSnapshotOutput` silently skip any (definition, model) cell that does not resolve to exactly two value keys (the `sortedValueKeys.length !== 2` guard in `domain-analysis-snapshot-builder.ts`). The new resolver inherits this behavior: such cells never appear in `cellLevelOutcomes` and therefore never contribute to any agreement metric. **The resolver exposes `excludedNonBinaryCells: Int!` at the top level of the result** so the UI can show a small note when this happens (e.g. "12 cells excluded for non-binary value pairs").

### Per-pair divergence drilldown

For a selected model pair (X, Y), compute mean absolute cell divergence within each value pair (equal-weight aggregation as above). Display the value pairs ranked from highest divergence to lowest.

### Trial consistency reporting

For each selected model: mean `cellTrialConsistency` across all cells with at least one decisive trial (equal-weight aggregation per cell within a vignette, then per vignette across pairs). Reported as a percentage. Models with `meanTrialConsistency < 0.7` AND `cellsObserved >= 5` get a "noisy" badge in the UI to flag that comparisons involving them are unreliable. The `cellsObserved >= 5` threshold prevents false alarms on small-sample models (Codex residual finding #2).

---

## Output schema

The drilldown is **not nested inside every matrix row** (Gemini HIGH #2). Instead, it is a separate top-level query the UI invokes only when the user clicks into a specific pair. The matrix query stays lightweight; the drilldown is paid for only when actually viewed.

### Query 1 — main result (matrix + consistency)

```graphql
type Query {
  modelAgreementOnTradeoffs(
    modelIds: [ID!]!
    domainId: ID
    scope: String!
    signature: String!
  ): ModelAgreementResult!
}

type ModelAgreementResult {
  pending: Boolean!
  models: [ModelInfo!]!
  unavailableModels: [UnavailableModelInfo!]!
  excludedNonBinaryCells: Int!
  pairwiseAgreementMatrix: [PairwiseAgreementRow!]!
  trialConsistency: [ModelTrialConsistency!]!
}

type PairwiseAgreementRow {
  modelAId: ID!
  modelALabel: String!
  modelBId: ID!
  modelBLabel: String!
  totalCells: Int!  # cells in the comparison set; 0 when no overlap
  percentAgreement: Float  # null when totalCells == 0
  cohensKappa: Float  # null when totalCells == 0 OR P_chance == 1
  kappaInterpretation: String  # null whenever cohensKappa is null
  meanAbsoluteDivergence: Float  # null when totalCells == 0
}

type ModelTrialConsistency {
  modelId: ID!
  modelLabel: String!
  cellsObserved: Int!  # cells with at least one decisive trial
  meanTrialConsistency: Float  # [0.5, 1], null when cellsObserved == 0
  noisy: Boolean!  # true when meanTrialConsistency < 0.7 AND cellsObserved >= 5 (avoids small-sample false alarms — Codex residual #2)
}

type ModelInfo {
  modelId: ID!
  label: String!
}

type UnavailableModelInfo {
  modelId: ID!
  label: String!
  reason: String!
}
```

### Query 2 — drilldown for a selected pair

```graphql
type Query {
  modelPairDivergenceBreakdown(
    modelAId: ID!
    modelBId: ID!
    domainId: ID
    scope: String!
    signature: String!
  ): PairDivergenceBreakdown!
}

type PairDivergenceBreakdown {
  pending: Boolean!
  modelAId: ID!
  modelALabel: String!
  modelBId: ID!
  modelBLabel: String!
  perValuePair: [ValuePairDivergence!]!
}

type ValuePairDivergence {
  valueA: String!
  valueB: String!
  cellsCompared: Int!
  meanAbsoluteDivergence: Float  # [0, 1], null when cellsCompared == 0
  modelAProportionA: Float  # null when cellsCompared == 0
  modelBProportionA: Float  # null when cellsCompared == 0
}
```

Both queries read from the same snapshot (one DB read per page load — the second query hits the same snapshot cache). The drilldown query is fired by the UI only when the user picks a pair from the matrix.

---

## Verification plan

### Unit tests (must pass before tasks-checkpoint)

| Anchor | Expected |
|--------|----------|
| `cohensKappa({observed: 1.0, chance: 0.5}) === 1.0` | Perfect agreement, chance 50/50 → kappa = 1 |
| `cohensKappa({observed: 0.5, chance: 0.5}) === 0` | Observed = chance → kappa = 0 |
| `cohensKappa({observed: 0.0, chance: 0.5}) === -1.0` | Worst possible → kappa = -1 |
| `kappaInterpretation(0.65) === 'Substantial'` | Boundary case |
| `kappaInterpretation(0.8) === 'Near-perfect'` | Lower edge of near-perfect |
| Equal-weight aggregation: 1 vignette with 25 cells + 1 vignette with 5 cells, both at 0.6 divergence → mean = 0.6 (not biased toward the bigger vignette) | Confirms equal-weight invariant |
| Cell where one model has 0 decisive trials is excluded, not zeroed | Confirms missing-data handling |
| `cellTrialConsistency` is bounded [0.5, 1] for any non-empty cell | Sanity bound |
| Tied cells (proportionA == 0.5 for either model) are excluded from kappa numerator and denominator but included in `meanAbsoluteDivergence` | Confirms tie-handling |
| Pair with zero overlapping decisive cells returns row with `totalCells: 0` and all metrics null | Confirms no-overlap pair handling |
| Model with zero cells anywhere in scope appears in `unavailableModels`, not in `pairwiseAgreementMatrix` | Confirms empty-model handling (deliberate divergence from current resolver) |
| Snapshot output contains BOTH `valuePairModelVotes` (legacy) AND `cellLevelOutcomes` (new) | Confirms rollback safety |
| `noisy` flag is `false` when `cellsObserved < 5` even if `meanTrialConsistency < 0.7` | Confirms small-sample false-alarm guard |

### Integration test

API integration test that builds a small synthetic snapshot with two models known to disagree perfectly (model A always picks A, model B always picks B) and verifies the resolver returns `kappa = -1.0` (or `null` if treated as degenerate by the chance calculation), `percentAgreement = 0`, and `meanAbsoluteDivergence = 1.0`.

### Production smoke test (required by `/ship` Step 4.5)

After deploy, query `modelAgreementOnTradeoffs` against `claude-sonnet-4-5`, `deepseek-chat`, `grok-4-1-fast-reasoning` with `scope: ALL_DOMAINS, signature: vnewt0`. Confirm:
- All three pairs report non-null `cohensKappa` and `percentAgreement`.
- Self-consistency for each model is between 0.7 and 1.0.
- The drilldown lists 6 value pairs (matching current covered count) with non-zero `meanAbsoluteDivergence`.

### UI smoke test

Load `/models`, select 3+ models, verify the three new sub-reports render in order (matrix → consistency → drilldown), heatmap colors are sensible (high kappa green / low kappa red), no console errors, no p-values or "Significant / Not significant" text anywhere on the page.

---

## Reviewer findings (resolved into spec above)

This section records the reconciliation of the spec checkpoint reviews.

### Codex (feasibility-adversarial) — 2026-05-08

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | Medium | Zero-data / no-overlap pair semantics undefined | **Accepted.** Added explicit "Zero-data and no-overlap pairs" subsection in methodology and made all kappa/agreement/divergence fields nullable in the schema. `unavailableModels` reports models with no data anywhere. |
| 2 | Medium | "Self-consistency" mislabeled — counts don't preserve run identity | **Accepted.** Renamed to "Trial Consistency" (in spec, schema, UI, components). Added explicit caveat in methodology: this measures modal-choice dominance across trials, which IS run-to-run consistency in practice but conflates run variation with orientation flips. |
| 3 | Medium | Non-binary value-pair cells silently skipped | **Accepted.** Added `excludedNonBinaryCells: Int!` to schema so the UI can show the count to users. Behavior matches existing accumulator (skip), but now visible. |
| 4 | Low | Kappa degenerate case + `kappaInterpretation` always-non-null mismatch | **Accepted.** Made `kappaInterpretation` nullable; both kappa and interpretation return null in the `P_chance == 1` case. UI renders "n/a." |
| 5 | Low | Kappa formula underspecified on comparison set | **Accepted.** Added explicit "Comparison set" definition in methodology: strict intersection of decisive untied cells; marginals computed on the same set. |
| Residual 1 | — | Nested drilldown response size (echoes Gemini #2) | **Accepted.** Drilldown moved to a separate `modelPairDivergenceBreakdown` query that the UI fires only on demand. |
| Residual 2 | — | Hard `0.7` cutoff for `noisy` ignores small samples | **Accepted.** Added `cellsObserved >= 5` precondition to the noisy flag. |

### Gemini (requirements-adversarial) — round 1, 2026-05-08

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | High | Contradictory rollback strategy (delete vs. keep `valuePairModelVotes`) | **Accepted.** Spec now unambiguously states: both fields written by new builder, legacy `valuePairModelVotes` loop stays in place for one release, removed in a follow-up PR. Added unit-test anchor confirming both fields exist on snapshot output. |
| 2 | High | Inefficient nested GraphQL schema (drilldown in every row) | **Accepted.** Drilldown moved to a separate top-level query `modelPairDivergenceBreakdown` invoked only when a pair is selected. |
| 3 | Medium | "Hidden Aggregation Complexity — `cellMap` doesn't have ownLevel/opponentLevel" | **Rejected — finding is incorrect.** `cellMap` keys are `definitionId::modelId::valueKey::ownLevel::opponentLevel` (5 segments) per `transcript-cell-accumulator.ts:30-32`. The `accumulateTranscriptCells` function already populates these. Spec now explicitly cites the line numbers so future readers can verify. |
| 4 | Low | Tie-breaking introduces directional bias | **Accepted.** Tied cells are now excluded from binary kappa entirely (no tie-toward-A bias). They remain included in `meanAbsoluteDivergence` since that metric is symmetric. |

### Gemini (requirements-adversarial) — round 2, 2026-05-08

Re-review of the reconciled spec. Round-2 findings:

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | High | "Rollback safety is symbolic — keeping the data field but deleting the code that reads it doesn't help" | **Acknowledged. Re-scoped what 'rollback safety' means.** The dual-write is a backstop for **in-flight stale snapshots during deploy** (web client serves cached old JS bundle for ~minutes after deploy; old client reads new snapshot via the still-deployed old GraphQL resolver). Once the new resolver is deployed and the old one is deleted, a true revert IS a multi-PR operation — that is documented as expected. The spec now states this explicitly under § Risks instead of implying simple rollback. |
| 2 | Medium | "'Trial Consistency' still misleads — labeling alone is insufficient" | **Strengthened.** Spec now requires an inline UI footnote on the trial-consistency report explaining the metric and its caveats, and an info-icon tooltip next to the column header. UI components must include these (see § Frontend new). |
| 3 | Medium | "cellMap ownLevel/opponentLevel claim unverified — Gemini didn't see the file" | **Verified inline.** Spec now embeds the actual `encodeCellKey` source (`return ${key.definitionId}::${key.modelId}::${key.valueKey}::${key.ownLevel}::${key.opponentLevel}`) so future reviewers don't need to navigate to verify. |
| 4 | Low | "Risky deletion of generic math utilities like `meanOfSample`, `normalCdf`" | **Rejected — finding is fabricated.** `math.ts` exports exactly six functions, all significance-specific: `wilcoxonSignedRank`, `rankBiserialCorrelation`, `bootstrapMeanDiffCI`, `holmBonferroni`, `classifyEffectSize`, `classifyVerdict`. There are no `meanOfSample` or `normalCdf` exports. `rg -l "from.*model-grouping-significance/math"` returns only the resolver and test file — both in the delete list. |
| 5 | Low | "Arbitrary 0.7 / 5 thresholds for noisy badge" | **Accepted as heuristic.** Spec now labels the cutoffs as heuristic UI-only thresholds (no statistical theorem behind them) and exposes `cellsObserved` and `meanTrialConsistency` so users can apply their own threshold. The badge is presentational, not a methodological claim. |

---

## Risks (each with verification)

| Risk | Severity | Verification |
|------|----------|--------------|
| **Snapshot version bump leaves users in `pending` for 30+ s.** Same as the 1.10→1.11 transition. Mitigated by the parallel-fetch optimization shipped in #992 but still an issue at first load. | Medium | Smoke-test page load with a fresh snapshot; document expected pending duration in PR description. |
| **Equal-weight aggregation hides genuinely small samples.** A vignette with 1 cell and a vignette with 25 cells contribute equally, even though the 25-cell vignette is more reliable. | Low | Show "cells compared" count in every drilldown row so users can see when a number rests on thin data. Documented in output schema. |
| **Tied cell handling.** When `proportionA == 0.5` the modal-choice rule (tie → A) introduces a small directional bias. | Low | Verified by unit test with a 3/3 cell, kappa computed and asserted. Documented in math section. |
| **Old client reads new snapshot during deploy window.** Web clients hold cached JS bundles. Right after deploy, an old client may fetch from the new resolver but the old resolver code is gone (we deleted it). Conversely, a still-deployed old resolver may read a new snapshot. | Medium | Both `valuePairModelVotes` (legacy) and `cellLevelOutcomes` (new) are written by the new builder. The legacy field-write stays for one release. This protects against **in-flight stale-snapshot reads** during the deploy window only. **A true post-release rollback is multi-PR — it requires reverting both the resolver deletion and the frontend changes.** This is documented and accepted: rollback safety here is about graceful degradation during deploy, not about simple rollback to old code. **Verification:** unit test asserts both fields exist on snapshot output. |
| **Self-consistency requires multiple trials per cell.** If a snapshot only has 1 trial per cell, every cell's self-consistency is 1.0 by construction — could mislead users. | Low | Unit test: cell with `wins=1, losses=0` returns consistency `1.0`; output exposes `cellsObserved` so UI can warn when trial counts are low. |
| **Removing the math library breaks unrelated importer.** | Low | Pre-merge: `rg "from.*model-grouping-significance" cloud/` returns only files listed in the affected-surfaces table. |
| **Heatmap rename breaks tests/snapshots.** | Low | `npm run test --workspace @valuerank/web` after rename, fix any failing snapshots. |
| **`P_chance == 1` degenerate case (both models always picked the same value).** Kappa formula divides by zero. | Low | Unit test asserts the resolver returns `null` for kappa in that case and the UI renders "n/a" without crashing. |

---

## Follow-ups (out of scope for this feature)

1. Bootstrap CI on kappa values (resample at the vignette level, not the cell level — respects the clustering structure).
2. Cluster analysis driven by kappa-based distance instead of log-odds / win-rate. Would replace or augment the existing cluster analysis.
3. Cross-signature reliability comparison (how does Claude's self-consistency on `vnewt0` compare to `vnewtd`?).
4. CSV export of the agreement matrix for downstream analysis.
5. Validation study: do these "agreement" measurements predict anything about model behavior outside the test set? (Construct validity work — see AAPOR critique on file.)

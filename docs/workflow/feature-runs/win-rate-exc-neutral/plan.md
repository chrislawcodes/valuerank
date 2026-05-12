# Plan — Win Rate (Exc. Neutral) Toggle

**Created:** 2026-05-11
**Status:** Plan
**Slug:** win-rate-exc-neutral

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: F-01 accepted: FR-006 updated to require UI indicator when exc-neutral mode is on but data is null (not silent). F-02 accepted: FR-008/FR-009 updated to exclude domains without exc-neutral data from pooled calculation; return null if no domains qualify. F-03 accepted: FR-007 updated to require Phase 2 target by snapshot ID and be a no-op if already superseded. F-04 accepted: Edge case corrected — pre-v1.9.0 pairwise matrix behavior documented accurately. F-05 rejected: toggle state persistence is an explicit non-goal. F-06 acknowledged: aggregation refactor depth will be addressed in the plan.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: High (Phase 2 safety): Accepted. FR-007 updated to require a conditional DB write (WHERE id=$id AND status='CURRENT'). Medium (PairwiseCellDrawer scope gap): Accepted. Added to non-goals. Medium (null conflation): Accepted. FR-006 updated to distinguish two null cases.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: HIGH (missing fallback tests): Accepted. tasks.md adds unit tests for ValuePrioritiesTable, DominanceSection, and DomainShiftsReportSection fallback behavior. MEDIUM (race condition test): Accepted. Integration test will simulate supersede by updating snapshot status before Phase 2. MEDIUM (indicator test): Accepted. Component test added for null pooledWinRateExcNeutral chip. MEDIUM UNVERIFIED (call site check): Accepted. computeCellWeightedDomainRates has one call site (buildSnapshotOutput) which will be updated in Slice 1. LOW (null-denominator test): Accepted. Added to Slice 2 tests. LOW (toggle callback test): Accepted. Added to Slice 3 tests.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: MEDIUM UNVERIFIED (mixed mode screen): Accepted. This is Residual Risk 2 — documented, transient, self-resolves on cache rebuild. MEDIUM UNVERIFIED (aggregation weighting): Accepted as verify-in-implementation. Slice 1 must inspect aggregateValueWinRates weighting to confirm neutrals are not in the weight denominator. MEDIUM UNVERIFIED (Phase 2 permanent partial cache): Accepted. Transient DB errors rely on exception propagation; next cache rebuild fixes it. Supersede case (count=0) is expected no-op by design. LOW UNVERIFIED (double payload): Accepted as low-risk tradeoff over passing excNeutral flag through all function signatures.

## Architecture Decisions

### AD-1: Exc-neutral aggregation via a parallel computation pass in the cell win rates builder

`computeCellWeightedDomainRates` currently produces `ValueRateInput` records with `vignetteRate` = `computePairwiseWinRate(wins, losses, neutrals)`. For exc-neutral, we run the same accumulation with `computePairwiseWinRate(wins, losses, 0)` — treating neutrals as absent — and pass those inputs through the same `aggregateValueWinRates` hierarchy.

This means `computeCellWeightedDomainRates` produces two parallel sets of `ValueRateInput`: one standard, one exc-neutral. The cell accumulation (the expensive part) only happens once. The rate aggregation runs twice on the same inputs — cheap since `aggregateValueWinRates` is a pure O(n) function.

**Alternative considered**: pass a `mode` flag through the aggregation hierarchy. Rejected — it would require changing every function signature in the chain. The parallel-input approach adds no new parameters and touches fewer call sites.

### AD-2: Phase 2 uses a conditional `updateMany` on snapshot ID + CURRENT status

`refreshDomainAnalysisSnapshot` already has `progressSnapshot.id` in scope after Phase 1. Phase 2 runs `db.assumptionAnalysisSnapshot.updateMany({ where: { id: progressSnapshot.id, status: 'CURRENT' } })`. If 0 rows are updated, the snapshot was superseded — Phase 2 logs and returns without error. No new locking primitive needed.

### AD-3: Exc-neutral pairwise matrix is computed on-the-fly in the resolver

`pairwiseWins` and `pairwiseNeutrals` are already stored in the snapshot. `buildPairwiseWinRateModel` receives a new `excNeutral: boolean` parameter. When true, it uses `neutralsIJ = 0` in the formula. Both matrices are returned in the GraphQL response; the frontend picks the right one based on toggle state.

### AD-4: `winRateExcNeutral` on `DomainAnalysisValueScore` is computed in the resolver from stored counts

`DomainAnalysisValueScore` already returns `prioritized`, `deprioritized`, `neutral`. The GraphQL resolver adds `winRateExcNeutral = prioritized / (prioritized + deprioritized)`, null if both are zero. No snapshot changes needed for this field.

### AD-5: Frontend null-case distinction uses existing `prioritized` + `deprioritized` fields

FR-006 requires distinguishing "cache not built yet" from "zero decisive responses." The frontend can tell these apart using fields already in the response:
- `pooledWinRateExcNeutral` null on all values → cache not built, show toggle indicator
- `winRateExcNeutral` null for a specific value AND `prioritized + deprioritized === 0` → show "n/a" for that cell
No additional API field needed.

---

## Implementation Slices

### Slice 1 — Backend: aggregation + snapshot types + Phase 2 write [CHECKPOINT]

**Estimated diff:** ~180 lines changed

**Files:**
- `cloud/apps/api/src/services/analysis/domain-analysis-cache-types.ts`
  - Add `valueWinRatesExcNeutral?: Record<string, number>` to `DomainAnalysisSnapshotModel`
- `cloud/apps/api/src/services/analysis/domain-analysis-cell-win-rates.ts`
  - After computing standard `ValueRateInput` list, compute a parallel exc-neutral list using `computePairwiseWinRate(wins, losses, 0)`
  - Return both from `computeCellWeightedDomainRates` as `{ models, analyzedDefinitionIds, excNeutralInputs }`
- `cloud/apps/api/src/services/analysis/domain-analysis-snapshot-builder.ts`
  - `buildSnapshotOutput` returns `excNeutralInputs` alongside the existing output
  - `refreshDomainAnalysisSnapshot`: after Phase 1 write (line 373), Phase 2:
    1. Call `aggregateValueWinRates(excNeutralInputs)` → `excNeutralResults`
    2. Build `valueWinRatesExcNeutral` map (same 0–100 scale as `valueWinRates`)
    3. `db.assumptionAnalysisSnapshot.updateMany({ where: { id: progressSnapshot.id, status: 'CURRENT' }, data: { output: mergedOutput } })`
    4. Log if `count === 0` (snapshot superseded, Phase 2 is a no-op)

**Tests:**
- Unit test for the parallel exc-neutral `ValueRateInput` computation in `domain-analysis-cell-win-rates.ts`
- Unit test that Phase 2 `updateMany` is called with the snapshot ID and `status: 'CURRENT'` filter

---

### Slice 2 — Backend: GraphQL schema + resolvers [CHECKPOINT]

**Estimated diff:** ~120 lines changed

**Files:**
- `cloud/apps/api/src/graphql/queries/domain/analysis/` — value score type
  - Add `winRateExcNeutral: Float` (nullable): resolver computes `prioritized / (prioritized + deprioritized)`, null if denominator 0
- Pairwise win rate model type
  - Add `winRateExcNeutralMatrix: [[Float]]`: resolver calls `buildPairwiseWinRateModel(pairwiseWins, pairwiseNeutrals, { excNeutral: true })`
- `cloud/apps/api/src/services/analysis/domain-analysis-cache.ts`
  - Add `excNeutral?: boolean` to `buildPairwiseWinRateModel`; when true use `neutralsIJ = 0`
  - Resolver returns both standard and exc-neutral matrices
- `cloud/apps/api/src/graphql/queries/models-analysis.ts`
  - Add `pooledWinRateExcNeutral: Float` — pools `valueWinRatesExcNeutral` from snapshots (same `computePooledWinRate` math; skip domains where `valueWinRatesExcNeutral` is absent)
  - Add `winRateExcNeutral: Float` on domain breakdown — reads `valueWinRatesExcNeutral[valueKey]` from snapshot, null if absent

**Tests:**
- Integration test: `winRateExcNeutral` equals standard win rate for a model with 0 neutral responses
- Integration test: `pooledWinRateExcNeutral` is null when no snapshots have `valueWinRatesExcNeutral`

---

### Slice 3 — Frontend: AnalysisContextBar + page state + API types + codegen [CHECKPOINT]

**Estimated diff:** ~120 lines changed

**Files:**
- `cloud/apps/web/src/components/analysis/AnalysisContextBar.tsx`
  - Add `winRateMode: 'all' | 'exc-neutral'`, `onWinRateModeChange`, `winRateModeDisabled?: boolean` props
  - Render two-button toggle ("All responses" / "Exc. neutral") after the models picker
  - When `winRateModeDisabled`, render grayed out with tooltip: "Only applies when data source is Win Rate"
- `cloud/apps/web/src/pages/DomainAnalysis.tsx`
  - Add `winRateMode` state; pass to `AnalysisContextBar` (not disabled)
- `cloud/apps/web/src/pages/ModelsGroups.tsx`
  - Add `winRateMode` state; pass `winRateModeDisabled={dataSource !== 'win-rate'}` to `AnalysisContextBar`
- `cloud/apps/web/src/api/operations/domainAnalysis.ts`
  - Add `winRateExcNeutral` to value score fragment; `winRateExcNeutralMatrix` to pairwise model fragment
- `cloud/apps/web/src/api/operations/modelsAnalysis.ts`
  - Add `pooledWinRateExcNeutral` and `winRateExcNeutral` to domain breakdown fragment
- Run `npm run codegen --workspace @valuerank/web` from `cloud/`

**Tests:**
- Unit test: `AnalysisContextBar` renders toggle; disabled + tooltip when `winRateModeDisabled=true`

---

### Slice 4 — Frontend: wire reports [CHECKPOINT]

**Estimated diff:** ~200 lines changed

**Win rate page — thread `winRateMode` from `DomainAnalysis.tsx`:**

1. `ValuePrioritiesSection` / `ValuePrioritiesTable`: accept `winRateMode`; use `winRateExcNeutral` when mode is `exc-neutral` and field is non-null; show indicator chip near header when `pooledWinRateExcNeutral` is null across all visible models.

2. `DominanceSection`: accept `winRateMode`; use `winRateExcNeutral` on value scores when `exc-neutral` and non-null.

3. `PairwiseWinRateMatrix`: accept `winRateMode`; use `winRateExcNeutralMatrix` when `exc-neutral` and non-null; fall back to `winRateMatrix`.

4. `DomainShiftsReportSection`: accept `winRateMode`; use `winRateExcNeutral` per domain cell when `exc-neutral` and non-null; fall back to `winRate`.

**Model groups page — thread `winRateMode` from `ModelsGroups.tsx`:**

5. `buildModelEntries` in `ModelsGroups.tsx`: when mode is `exc-neutral` and data source is `win-rate`, populate `winRates` with `pooledWinRateExcNeutral` from model analysis data. `ModelGroupsSection` / cluster charts receive `ModelEntry` with the right rates — no changes needed inside the charts themselves.

**Tests:**
- Unit test: `PairwiseWinRateMatrix` uses exc-neutral matrix when prop is `exc-neutral` and field is non-null
- Unit test: falls back to standard matrix when exc-neutral matrix is null

---

## Residual Risks

1. **Aggregation double-pass performance**: The snapshot builder now runs `aggregateValueWinRates` twice per build. For very large domains this could extend build times.
   **verification:** After Slice 1, trigger `refreshDomainAnalysisSnapshot` manually against the largest production domain via Railway CLI and compare wall time to a pre-feature baseline. If > 10% regression, merge the two passes into one.

2. **Mixed-snapshot pooling in `modelsAnalysis`**: During the deployment window, some domain snapshots will have `valueWinRatesExcNeutral` and some won't. `pooledWinRateExcNeutral` will be based on a subset of domains. This is transient and self-resolves as caches rebuild.
   **verification:** After Slice 2 deploy, query `modelsAnalysis` via MCP `graphql_query` and confirm `pooledWinRateExcNeutral` is null (pre-rebuild) or a plausible number (post-rebuild); confirm it never mixes standard and exc-neutral values in the same pool.

3. **Codegen must be run after schema changes**: Stale generated types break the web build silently.
   **verification:** `npm run codegen --workspace @valuerank/web` exits 0 and `npm run build --workspace @valuerank/web` exits 0 with no type errors.

4. **Pre-v1.9.0 pairwise matrix shows same result in both modes**: When `pairwiseNeutrals` is absent, both matrices are identical (neutrals default to 0). Expected behavior; documented in spec.
   **verification:** Confirm in the UI against a domain with an old snapshot that toggling the pairwise matrix produces identical values in both modes and no error is thrown.

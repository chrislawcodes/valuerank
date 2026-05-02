# Plan: Cell-Weighted Win Rates for Domain Analysis

Slug: `cell-weighted-domain-analysis`
Spec: `spec.md`

## Architecture Decisions

### A1: All metrics from one source — transcripts

`counts`, `pairwiseWins`, `valueWinRates`, and `vignetteCount` all derived from raw transcripts.
`aggregateAnalysisRows` and the `analysis_results` output query are removed from `buildSnapshotOutput`.
The fingerprint query (for cache invalidation) still reads `analysis_results` — unchanged.

### A2: Shared accumulator is pure

`transcript-cell-accumulator.ts` has zero database access. Takes arrays/maps, returns a flat
cell map. Trivially testable.

### A3: Three-level collapse: cell → vignette → domain

1. Cell rate = `computePairwiseWinRate(wins, losses, neutrals)` — neutrals always in denominator
2. Vignette rate = equal-weight mean of non-null cell rates for (definitionId, modelId, valueKey)
3. Domain rate = equal-weight mean of non-null vignette rates for (modelId, valueKey)

Zero-trial cells excluded. Vignettes with no valid cells excluded. No pooling across cells.

### A4: Per-model paginated transcript query

Follow `circumplex/aggregation.ts` lines 140–161: `Promise.all` over per-model queries.

### A5: Code version 1.7.0

Bumped from `1.6.0`. Old snapshots superseded lazily on next request.

---

## Wave Breakdown

### Wave 1: Shared accumulator

**Create:** `cloud/apps/api/src/services/analysis/transcript-cell-accumulator.ts`

Exports `accumulateTranscriptCells(params)` → `Map<string, CellCounts>`.
Reuses helpers from `pressure-sensitivity/value-pair.ts`, `domain/decision-model.ts`, and
`domain-analysis-values.ts`. Parses dimensions from `transcript.definitionSnapshot`.

**Tests:** `cloud/apps/api/tests/services/analysis/transcript-cell-accumulator.test.ts`
- Happy path, neutrals in denominator, unknown direction excluded, missing/deleted scenario excluded,
  missing dimension excluded, runId not in map excluded.

[CHECKPOINT]

### Wave 2: Domain win rate collapse

**Create:** `cloud/apps/api/src/services/analysis/domain-analysis-cell-win-rates.ts`

Exports `computeCellWeightedDomainRates(params)` → `valueWinRates`, `vignetteCount`, `counts`,
`pairwiseWins` per modelId.

**Tests:** `cloud/apps/api/tests/services/analysis/domain-analysis-cell-win-rates.test.ts`
- Equal-weight collapse, zero-trial cell excluded, multiple vignettes averaged equally,
  raw counts tallied correctly, pairwiseWins accumulated.

[CHECKPOINT]

### Wave 3: Wire into snapshot builder + cleanup

**Modify:** `domain-analysis-snapshot-builder.ts` — replace analysis_results output query +
`aggregateAnalysisRows` with per-model transcript query + new functions.

**Modify:** `domain-analysis-cache-types.ts` — bump version to `1.7.0`.

**Modify/Delete:** `domain-analysis-snapshot-aggregator.ts` — remove `aggregateAnalysisRows`
and all supporting code no longer called. Delete file if empty.

[CHECKPOINT]

---

## Residual Risks

### R1: Memory for ALL_DOMAINS scope
**Mitigation:** per-model paginated queries bound each batch.
**verification:** query Domain Analysis ALL_DOMAINS via MCP `graphql_query` before merge;
confirm non-error response and non-null `valueWinRates` for ≥3 models.

### R2: Snapshot coexistence window
**Mitigation:** version bump forces supersession on first request.
**verification:** after deploy, one Domain Analysis query → confirm new methodology applied.

### R3: Win rate delta vs previous methodology
**verification:** query one known domain+model via MCP `graphql_query` BEFORE merge against
production. After deploy, query same pair. Document delta in PR. Expect < 10% relative change.
Large deviations → investigate before marking done.

### R4: aggregateAnalysisRows referenced elsewhere
**verification:** `npm run build --workspace @valuerank/api` passes — catches any dangling imports.

---

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: All three findings addressed by spec update: all fields (counts, pairwiseWins, valueWinRates, vignetteCount) now computed from transcripts only — no dual-source inconsistency. Scalability uses per-model paginated queries. vignetteCount is consistent with win rates since both come from transcripts.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Runner timeout — not a content issue. Re-running Codex review via checkpoint repair.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: F1 (fingerprint): known limitation — fingerprint already tracks analysis_results as proxy for data changes. Making it track transcripts directly is a separate improvement; not making it worse here. F2 (Promise.all fan-out): accepted pattern, same as circumplex aggregation. F3 (counts/pairwiseWins): spec and plan already clarify — raw tally from cells, will be explicit in tasks.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: CRITICAL (NaN): accepted — tasks will require null-return for empty mean, with unit tests. HIGH (integration test): accepted — Wave 3 tasks will include integration test in test DB. MEDIUM (fingerprint): same as Codex F1, deferred. MEDIUM (helper failures): accepted — add tests for invalid helper inputs. LOW (empty inputs): accepted — explicit empty-array tests added to Wave 1 tasks.

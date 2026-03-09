# Order Effect Reversal Metrics Memory

This file tracks shared state for the backend-driven Order Effect reversal metrics feature.

Current status:

- Wave 0 (prep/docs) in progress

Related docs:

- [docs/order-effect-reversal-metrics-spec.md](/Users/chrislaw/valuerank/docs/order-effect-reversal-metrics-spec.md)
- [docs/order-effect-reversal-metrics-test-plan.md](/Users/chrislaw/valuerank/docs/order-effect-reversal-metrics-test-plan.md)
- [docs/order-effect-reversal-metrics-implementation-checklist.md](/Users/chrislaw/valuerank/docs/order-effect-reversal-metrics-implementation-checklist.md)
- [docs/order-effect-reversal-metrics-kickoff-notes.md](/Users/chrislaw/valuerank/docs/order-effect-reversal-metrics-kickoff-notes.md)

## Locked Decisions

- Analytics move out of React and into backend analysis code.
- Metrics are computed from selected trial data in backend code.
- Assumption snapshots are global to the assumption dataset, not scoped to UI model filters.
- Value-order metrics use normalized baseline-oriented interpretation.
- Scale-order pull uses raw visible-number scores from the same `consideredTrials` indices.
- `consideredTrials` is the canonical trial subset for:
  - canonical cell score
  - stability classification
  - disagreement
  - pair drift
  - margin
- Cache is resolver-driven:
  - recompute deterministic hash on query
  - reuse matching CURRENT snapshot
  - otherwise recompute and supersede old CURRENT snapshot
- Cache hit requires exact match on:
  - `assumptionKey`
  - `analysisType`
  - `inputHash`
  - `status = CURRENT`
- Use `AssumptionAnalysisSnapshot` for persistence.
- Use dedicated `AssumptionAnalysisStatus`, not `AnalysisStatus`.
- The new page is `Analysis`.
- The old page remains available as `Analysis (old v1)`.
- Locked routes:
  - `/assumptions/analysis`
  - `/assumptions/analysis-v1`
- Preserve `/assumptions/order-effect` as a migration-time alias or redirect.
- Add `modelMetrics` without breaking existing `rows` payload compatibility.
- Stable-side threshold is `>50%`.
- Do not trim selected sets smaller than 3 items.
- Resolved example: `[4,2,4]` is `lean_high` and eligible under the formal rule.
- Multiple CURRENT snapshots are allowed across different config signatures.
- Supersede only older CURRENT snapshots with the same config signature.

## Off-Limits Symbols

Do not rename these casually once implementation starts:

- `OrderEffectComparisonRecord`
- `AssumptionAnalysisSnapshot`
- `AssumptionAnalysisStatus`
- `valueOrderPull`
- `scaleOrderPull`
- `order_invariance`
- `reversal_metrics_v1`
- `CURRENT`
- `SUPERSEDED`
- pull label constants:
  - `toward first-listed`
  - `toward second-listed`
  - `toward higher numbers`
  - `toward lower numbers`
  - `no clear pull`

## Wave Breakdown

- Wave 0: prep/docs
- Wave 1: schema + migration + cache model
- Wave 2: backend analysis service + unit tests
- Wave 3: GraphQL contract + resolver integration
- Wave 4: web client + new Analysis page + old v1 preservation
- Wave 5: final verification, lint, build, cleanup

## Notes

- Do not move analytics back into the frontend.
- Do not overload `AnalysisResult`.
- Do not change stable-side threshold or cache invalidation strategy without documenting a blocker.
- Cache behavior should be visible through debug logs during implementation and verification.

## Context Compaction Notes

- Reversal metrics are always directional. `directionOnly` affects `matchRate`, not reversal-rate semantics.
- Biggest architectural risk: synchronous cache freshness checking may become expensive before the metric math does.
- Biggest implementation bug risk: mixing normalized and raw score paths.
  - value-order metrics use normalized baseline-oriented scores
  - scale-order pull uses raw visible-number scores from the same `consideredTrials` indices
- Biggest regression risk: breaking the existing `rows` payload while the new leaderboard appears to work.
- Biggest product migration risk: route confusion across:
  - `/assumptions/analysis`
  - `/assumptions/analysis-v1`
  - `/assumptions/order-effect` alias/redirect
- Biggest schema footgun: accidentally using `AnalysisStatus` instead of `AssumptionAnalysisStatus`
- If scope pressure forces cuts, do not cut:
  - backend ownership of analytics
  - `rows` backward compatibility
  - cache hit/miss logging
  - golden fixture coverage

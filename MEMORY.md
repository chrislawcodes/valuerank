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
- Cache hash is based on the selected transcript state that actually drives the analysis, not just transcript ids.
- The analysis service acquires a coarse per-config pipeline lock before reading mutable inputs, so older requests cannot supersede newer CURRENT snapshots for the same config.
- DB also enforces one CURRENT row per `(assumptionKey, analysisType, configSignature)` via a partial unique index.
- DB also enforces one CURRENT row per exact `(assumptionKey, analysisType, inputHash)` cache hit and uses partial indexes for hit/supersede paths.
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
- The authoritative analytics pipeline now belongs in the assumption service layer, not the GraphQL resolver.
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

---

# Level-Set Presets Memory

## Architectural Decisions
- 2026-03-15: `[level]` substituted at expansion time (not creation time) — base template retains `[level]` placeholder
- 2026-03-15: Scale labels strip `[level]` via regex in `labelFromBody` — stable across all 25 conditions
- 2026-03-15: `[achievement]` token stays in narrative sentences — judge needs it to identify values
- 2026-03-15: `LevelPreset` + `LevelPresetVersion` models — versioned like preambles
- 2026-03-15: Domain `defaultLevelPresetVersionId` nullable — no backfill of existing domains
- 2026-03-15: Graceful fallback when no preset: 1 un-expanded scenario (backward compat)
- 2026-03-15: `dimension_values` in each scenario stores `{ [token]: levelScore }` for analysis

## Off-limits Symbols
- `jobChoiceLevels` constant: Wave 5 removes it — do NOT re-add
- `DomainTab` union in Domains.tsx: Wave 7 adds `'defaults'` — check before touching tabs

## Removed/Renamed Symbols (for check-symbols.sh)
- `jobChoiceLevels` constant → removed in Wave 5

## Status
ALL 7 WAVES COMPLETE — PR open: feat/level-set-presets
Branch: feat/level-set-presets
Plan: docs/plans/level-set-presets-plan.md

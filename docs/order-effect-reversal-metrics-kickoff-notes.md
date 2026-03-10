# Order Effect Reversal Metrics Kickoff Notes

This note is the implementation guardrail for the backend-driven Order Effect metrics work.

Its purpose is to reduce churn while the feature is being built.

The rule for this project is:

- do not keep redesigning the metric definitions during implementation unless a real blocker appears

This note should be read together with:

- [order-effect-reversal-metrics-spec.md](/Users/chrislaw/valuerank/docs/order-effect-reversal-metrics-spec.md)
- [order-effect-reversal-metrics-test-plan.md](/Users/chrislaw/valuerank/docs/order-effect-reversal-metrics-test-plan.md)
- [order-effect-reversal-metrics-implementation-checklist.md](/Users/chrislaw/valuerank/docs/order-effect-reversal-metrics-implementation-checklist.md)

---

## 1. Locked Decisions

These decisions are considered locked for implementation unless a true blocker is discovered.

### Architecture

- Analytics move out of React and into backend analysis code.
- Metrics are computed from raw selected trial data.
- Results are persisted in a dedicated assumption-analysis cache table.
- The frontend renders backend-supplied metrics only.
- Assumption snapshots are global to the assumption dataset, not scoped to transient UI model filter selections.

### Persistence

- Do not overload `AnalysisResult`.
- Use a dedicated `AssumptionAnalysisSnapshot` style model for this feature.
- Use a dedicated `AssumptionAnalysisStatus` enum for assumption-analysis snapshots rather than reusing `AnalysisStatus`.

### Core Page Strategy

- The new backend-driven page is the default `Analysis` page.
- The current page is preserved as `Analysis (old v1)`.
- Route targets are locked:
  - new page: `/assumptions/analysis`
  - legacy page: `/assumptions/analysis-v1`
- Preserve `/assumptions/order-effect` as a temporary compatibility alias or redirect during migration.

### GraphQL Compatibility Strategy

- Extend the existing `assumptionsOrderInvariance` response rather than replacing it outright.
- Add `modelMetrics` while preserving the existing `rows` payload for drilldown compatibility.
- Do not break existing `rows` consumers while introducing the new leaderboard contract.

### Metric Priority

- Primary:
  - `matchRate`
  - `valueOrderReversalRate`
  - `scaleOrderReversalRate`
- Secondary:
  - `valueOrderPull`
  - `scaleOrderPull`
- Supporting:
  - denominators / excluded counts
  - `withinCellDisagreementRate`
  - `pairLevelMarginSummary`

### Stability Rule

- Use `consideredTrials`, not an alternate trial subset, for:
  - canonical cell score
  - stability classification
  - disagreement
  - pair drift
  - margin
- For value-order metrics, `consideredTrials` are interpreted on the normalized baseline-oriented scale.
- For scale-order pull, use the same inner-slice indices but apply them to the raw visible prompt-scale decisions before normalization.
- Do not trim selected sets smaller than 3 items.
- The resolved example `[4,2,4]` is `lean_high` and eligible under the formal `>50%` stable-side rule.

### Pull Rule

- Pull labels are computed in backend code.
- Pull labels are required in this implementation.
- Minimum:
  - at least `3` non-zero eligible pairs
  - at least `2/3` directional agreement
  - otherwise `no clear pull`

### Cache Invalidation Strategy

- Cache invalidation is resolver-driven, not job-driven.
- On every `assumptionsOrderInvariance` query, recompute the deterministic input hash.
- Reuse a matching CURRENT snapshot if present.
- Otherwise compute a fresh snapshot and supersede older CURRENT snapshots only for the same config signature.
- Different config signatures may legitimately have different CURRENT snapshots at the same time.
- Cache behavior must be observable during implementation via debug logging for cache hit/miss/warm-path reuse.

---

## 2. Things That Are Explicitly Not Up For Redesign Mid-Implementation

These are the common drift points that should not be reopened casually:

- moving pull logic back into the frontend
- dropping persistence and doing resolver-only analytics as the final design
- reusing `AnalysisResult` with a fake anchor run
- changing page naming away from `Analysis` and `Analysis (old v1)`
- changing route targets away from `/assumptions/analysis` and `/assumptions/analysis-v1`
- bringing back `Δ_P` and `Δ_S` as the main leaderboard metrics
- treating raw score movement as the primary validity metric
- changing the stable-side threshold away from the current `>50%` rule without documenting a blocker first
- replacing resolver-driven cache invalidation with a background invalidation job without documenting a blocker first
- dropping `rows` backward compatibility while adding `modelMetrics`

If one of these needs to change, stop and document the blocker clearly first.

---

## 3. Known Judgment Calls

These are real judgment calls, but they are not blockers.

### Stable-Side Threshold

The current rule is:

- `lean_low` if more than 50% of `consideredTrials` are below midpoint
- `lean_high` if more than 50% are above midpoint
- otherwise unstable

This is a deliberate starting rule, not a claim of final methodological perfection.
It is nevertheless locked for the current implementation unless a blocker is documented.

### Uncertainty Metrics In The UI

The backend contract should include them now.
The exact UI treatment can stay modest for the first implementation.

Examples:

- tooltip
- secondary detail panel
- expanded row

### Future Statistical Refinements

Possible later work:

- stronger neutral-zone handling
- better confidence intervals
- close-call vs clear-win splits

These are follow-on improvements, not reasons to delay the current implementation.

---

## 4. Implementation Order

Even though this is one feature, the work should still be done in a disciplined order:

0. Mandatory prep:
   - read the current resolver in `cloud/apps/api/src/graphql/queries/order-invariance.ts`
   - read the current page in `cloud/apps/web/src/components/assumptions/OrderEffectPanel.tsx`
   - confirm current route/nav wiring for the old page
   - confirm the test directory layout before creating new test files
1. Schema and migration
2. Cache helper
3. Backend analysis service
4. Unit tests alongside service-function implementation in dependency order:
   - classification
   - reversal
   - pull
   - disagreement
   - margin
5. GraphQL contract and resolver
6. Integration tests
7. Web client and page updates
8. Route/nav update for `Analysis` and `Analysis (old v1)`
9. Final verification

This order is meant to reduce breakage, not to turn the work into a multi-phase product rollout.

---

## 5. Review Discipline

Before merging:

- verify that spec, test plan, and checklist still agree with each other
- verify that the implementation matches the spec rather than ad hoc interpretation
- verify that value-order metrics use normalized `consideredTrials`
- verify that scale-order pull uses raw visible-number scores from the same inner-slice indices
- verify that route naming matches the locked page strategy
- verify that route paths match the locked page strategy
- verify that the old page remains reachable
- verify cache hit/miss behavior through logs during manual warm-path checks

If implementation pressure creates a shortcut, write it down explicitly instead of silently changing behavior.

---

## 6. Done Criteria

This feature is done only when all of the following are true:

- backend computes reversal and pull metrics from `consideredTrials`, using normalized scores for value-order metrics and raw visible-number scores for scale-order pull
- frontend does not compute those metrics locally
- assumption-analysis snapshots are cached and reused on stable inputs
- cache hit/miss behavior is observable in logs during verification
- GraphQL exposes the required model metrics
- the new `Analysis` page renders backend metrics correctly
- the old page remains available as `Analysis (old v1)`
- the existing `rows` payload for the drilldown remains correct and backward-compatible
- the required tests from the test plan exist and pass
- lint and build pass

---

## 7. Escalation Rule

If a real blocker appears, pause and document:

- what the blocker is
- whether it is a spec gap, data-shape gap, or code-architecture gap
- what decision is needed

Do not silently change metric semantics during implementation.

# Order Effect Reversal Metrics Test Plan

This document defines the tests that should be in place before implementing the backend-driven Order Effect reversal metrics work.

The goal is simple:

- prove the math before wiring the UI
- prove cache behavior before relying on persistence
- prove the GraphQL contract before refactoring the page

This plan is intentionally written against the current codebase structure.

---

## 1. Testing Strategy

We should test this feature in five layers:

1. Pure metric unit tests
2. Normalization and trimming tests
3. Cache tests
4. GraphQL resolver integration tests
5. Web rendering tests

The order matters:

- first prove the metric logic
- then prove the trial-selection / trimming behavior
- then prove cache correctness
- then prove resolver output
- then prove the frontend is only rendering backend data

---

## 2. Pure Metric Unit Tests

These tests should cover the backend functions that compute:

- value-order reversal rate
- scale-order reversal rate
- value-order pull
- scale-order pull
- too-close-to-call eligibility
- within-cell disagreement
- pair-level margin summaries

### What to verify

- midpoint-crossing reversals are counted correctly
- neutral / unstable / missing pairs are excluded correctly
- directional labels are assigned only when the threshold rule is satisfied
- `directionOnly=true` match uses canonical score side-of-midpoint agreement, not stable-side classification
- margin summaries are calculated from the limiting distance to midpoint

### Suggested location

- new tests alongside the new backend service module, likely under:
  - `cloud/apps/api/src/services/assumptions/__tests__/`
  - or `cloud/apps/api/src/graphql/queries/__tests__/` if the logic stays near the resolver

---

## 3. Normalization And Trimming Tests

These tests should prove that the new logic stays aligned with the current pipeline.

### What to verify

- the same `consideredTrials` subset is used for:
  - canonical cell score
  - stable-side classification
  - within-cell disagreement
  - pair drift
  - pair margin
- `trimOutliers=true` uses the same inner-slice rule as the current `computeMajorityVote(...)`
- `trimOutliers=false` uses the full selected trial set
- arrays with fewer than 3 selected trials are not trimmed
- scale-order pull uses raw visible numerals before normalization
- reversal logic uses baseline-oriented normalized interpretation

### Required example cases

- `[1,5,3,4,4]`
- `trimOutliers=true` on N=1 selected trial => no trimming
- `trimOutliers=true` on N=2 selected trials => no trimming
- `trimOutliers=true` on N=3 selected trials => inner slice of one item
- `[5,5,1,1,3]`
- `[4,2,4]` => `lean_high` under the formal `> 50%` rule
- `[4,3,4]`
- `[3,3,4]`
- concrete raw-vs-normalized scale-pull divergence case:
  - baseline raw decisions `[4,4,4]` on `S_A` => raw baseline score `4`, normalized score `4`, `lean_high`
  - `scale_flipped` raw decisions `[2,2,2]` on `S_B` => raw variant score `2`, normalized score `4`, `lean_high`
  - no reversal, but raw pair drift is `2 - 4 = -2` => `toward lower numbers`

### Suggested location

- likely near existing order-invariance backend tests:
  - `cloud/apps/api/src/graphql/queries/__tests__/`

---

## 4. Cache Tests

These tests should cover the new `AssumptionAnalysisSnapshot` cache behavior.

### What to verify

- cache key generation is deterministic
- identical inputs produce the same hash
- changing one transcript id changes the hash
- changing `trimOutliers` changes the hash
- changing `directionOnly` changes the hash
- changing UI model filters alone does not change the hash if the underlying snapshot model set is unchanged
- changing code version changes the hash
- matching current snapshot is reused
- stale snapshot causes recomputation
- older current snapshots are marked `SUPERSEDED`

### Suggested location

- new backend cache tests, likely under:
  - `cloud/apps/api/src/services/assumptions/__tests__/`
  - and/or db query tests if cache helpers are stored there

---

## 5. GraphQL Resolver Integration Tests

These tests should exercise `assumptionsOrderInvariance` end to end using seeded data.

### What to verify

- resolver returns backend-computed `modelMetrics`
- `matchRate` remains consistent with previous fully-flipped behavior
- reversal denominators are correct
- value-order pull labels are correct
- scale-order pull labels are correct
- excluded pairs are counted correctly
- rows payload still works for drilldown
- no-eligible-data cases return stable null / empty outputs

### Required scenario types

- model with no reversals
- model with value-order reversals only
- model with scale-order reversals only
- model with many excluded pairs
- model with missing / fragmented cells

### Suggested location

- `cloud/apps/api/tests/graphql/queries/`
- or existing order-invariance test area if one is already established

---

## 6. Web Rendering Tests

These tests should prove the web app is no longer doing analytics locally.

### What to verify

- the page renders backend-supplied `modelMetrics`
- the leaderboard does not compute reversal or pull metrics in the component
- `N (Match)` is shown distinctly from reversal pair counts
- the new page is labeled `Analysis`
- the old page remains accessible as `Analysis (old v1)`

### Suggested location

- `cloud/apps/web/tests/components/assumptions/`
- and any page/router tests needed for the renamed routes

---

## 7. Required Concrete Test Cases

These should exist before considering the feature complete.

### Reversal / Exclusion

- baseline `2`, variant `4` => counted as a reversal
- baseline `4`, variant `2` => counted as a reversal
- baseline `3`, variant `5` => excluded
- baseline `4`, variant `4` => not a reversal
- baseline `2`, variant `2` => not a reversal
- baseline `4`, variant `missing` => excluded from denominator
- canonical score not equal to `3` but unstable `consideredTrials` => excluded from denominator

### Unstable / Polarized Cells

- `[5,5,1,1,3]` => unstable / excluded
- `[4,2,4]` => `lean_high` / eligible under the formal `> 50%` rule
- `[3,3,4]` => excluded

### Directional Pull

- `2` non-zero eligible pairs => `no clear pull` because the minimum `3` non-zero pairs is not met
- `3` non-zero eligible pairs with `2` positive and `1` negative => `toward second-listed` because `2/3` exactly meets the threshold
- `3` non-zero eligible pairs with `2` negative and `1` positive => `toward first-listed`
- `3` eligible pairs with all zero drift => `no clear pull`
- `0` eligible pairs => `no clear pull`
- enough eligible positive raw scale drifts => `toward higher numbers`
- enough eligible negative raw scale drifts => `toward lower numbers`
- explicit raw-vs-normalized divergence case:
  - baseline raw `[4,4,4]`, normalized `4`
  - scale-flipped raw `[2,2,2]`, normalized `4`
  - no reversal, but pull label `toward lower numbers`

### All Pairs Excluded

- a model with every value-order pair excluded should return:
  - `valueOrderReversalRate: null`
  - `valueOrderEligibleCount: 0`
  - `valueOrderPull: 'no clear pull'`
- same expectation for scale-order metrics when every scale-order pair is excluded

### Match Rate Modes

- fixture where `directionOnly=true` and `directionOnly=false` produce the same non-match:
  - baseline canonical score `4`, fully-flipped canonical score `2`
- fixture where direction matches but exact score does not:
  - baseline canonical score `4`, fully-flipped canonical score `5`
  - `directionOnly=true` => match
  - `directionOnly=false` => non-match
- capture one concrete regression anchor from the current resolver before refactor and assert the new service preserves that `matchRate`

### Missing Data

- `pickStableTranscripts(...)=insufficient` => excluded from all denominators
- `pickStableTranscripts(...)=fragmented` => excluded from all denominators

### Internal Record Construction

- `matchesBaseline` is computed once during pair construction and reused during model aggregation
- `matchesBaseline` respects `directionOnly=true` vs `directionOnly=false`

### Cache

- identical transcript set => cache hit
- one transcript id changed => cache miss
- config changed => cache miss
- code version changed => cache miss

---

## 8. File-By-File Checklist

Use this checklist before implementation is considered complete.

### Backend Metric Logic

- [ ] Add unit tests for reversal-rate logic
- [ ] Add unit tests for too-close-to-call classification
- [ ] Add a named unit test proving `[4,2,4]` is `lean_high` / eligible under the formal rule
- [ ] Add unit tests for stable-side classification
- [ ] Add unit tests for within-cell disagreement
- [ ] Add unit tests for pair-level margin summaries
- [ ] Add unit tests for value-order pull labels
- [ ] Add unit tests for scale-order pull labels

### Normalization / Trimming

- [ ] Add tests proving `consideredTrials` matches canonical score logic
- [ ] Add tests for `trimOutliers=true`
- [ ] Add tests for `trimOutliers=false`
- [ ] Add tests showing raw scale-number pull is distinct from normalized preference direction

### Cache / Persistence

- [ ] Add tests for deterministic assumption-analysis input hash generation
- [ ] Add tests for cache hit on unchanged inputs
- [ ] Add tests for cache miss on transcript change
- [ ] Add tests for cache miss on config change
- [ ] Add tests for cache miss on code version change
- [ ] Add tests that older snapshots are marked `SUPERSEDED`

### GraphQL

- [ ] Add integration tests for new `modelMetrics` fields
- [ ] Add integration tests for null / no-eligible cases
- [ ] Add integration tests confirming `matchRate` remains backward-compatible
- [ ] Add integration tests for excluded-pair counts
- [ ] Add integration tests for pull labels

### Web

- [ ] Update component/page tests to render backend metrics only
- [ ] Add test proving `N (Match)` is distinct from reversal denominators
- [ ] Add route/nav tests for `Analysis`
- [ ] Add route/nav tests for `Analysis (old v1)`
- [ ] Manual code review check: `OrderEffectPanel` does not contain a `useMemo` or equivalent local logic that computes reversal rates or pull labels from row data

### Verification Commands

- [ ] Run relevant backend unit tests
- [ ] Run relevant GraphQL integration tests
- [ ] Run relevant web tests
- [ ] Run lint
- [ ] Run build

---

## 9. Completion Standard

Do not start calling the feature "done" until:

- metric logic is covered by unit tests
- resolver output is covered by integration tests
- cache behavior is covered by tests
- the frontend no longer computes analytics locally
- both the new `Analysis` page and legacy `Analysis (old v1)` page are test-covered

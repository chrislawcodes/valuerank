# Implementation Spec: Backend-Driven Order Effect Reversal Metrics

This specification replaces the current frontend-heuristic plan for Order Effect reversal metrics with a backend-driven design. The goal is to compute reversal and directional-pull metrics from raw selected trial data during analysis, persist the result, and serve those metrics directly to the UI.

This is a deliberate scope increase. We are choosing to pay the implementation cost now instead of shipping browser-side inference on collapsed cell scores.

---

## 1. Why We Are Changing Direction

The previous Phase 1 plan was not good enough for long-term use:

- The frontend only has access to already-collapsed cell scores (`majorityVoteBaseline`, `majorityVoteFlipped`), not raw trial-level variance.
- Temp=0 runs are not perfectly deterministic, so the raw repeated trials matter.
- Browser-side heuristics such as local un-normalization and directional-consistency rules would create false precision in the UI.
- The product question is methodological: "Do conclusions change because of order?" That logic belongs in the backend analysis layer, not in React render code.

Therefore:

- reversal and directional-pull metrics must be computed in the backend
- the UI must consume precomputed metrics only
- any heuristic or statistical rule must be centralized in one server-side implementation

---

## 2. Scope

### In Scope

- Add backend computation for order-effect reversal and directional-pull metrics
- Use raw selected transcript decisions, not collapsed leaderboard rows, as the input to those metrics
- Persist computed metrics in a dedicated assumption-analysis cache table
- Extend the `assumptionsOrderInvariance` GraphQL response so the UI can render the new metrics directly
- Update the Order Effect page leaderboard to render backend-supplied reversal and pull metrics instead of computing them in the browser
- Preserve the existing `rows` payload for drilldown compatibility while adding the new `modelMetrics` contract

### Out of Scope

- Redesigning the lower 4-cell matrix drilldown UI
- Redesigning the preflight review flow
- Solving all possible methodological questions about confidence intervals or final publication-grade statistics
- Reworking the broader ValueRank reporting system outside the Order Effect page

---

## 3. Product Goal

The Order Effect page should answer two questions:

1. Do the model's conclusions stay the same when presentation changes?
2. When they do not stay the same, does the drift tend to go in a consistent direction?

That means the page should show:

- reversal-oriented metrics as the primary signal
- directional-pull metrics as a secondary explanatory signal
- sample counts that make denominator differences visible

It should not ask the user to interpret `Δ_P` and `Δ_S` as the main leaderboard metrics.

---

## 4. Units of Analysis

These definitions must be used consistently in backend code.

### Raw Trial
One transcript decision for one `model × scenario`.

### Cell
One `model × vignette × condition × variant` bucket containing repeated raw trials.

Examples of `variant`:

- `baseline`
- `presentation_flipped`
- `scale_flipped`
- `fully_flipped`

### Comparison Pair
One comparison between the baseline cell and one variant cell for the same:

- `model`
- `vignette`
- `condition`

Examples:

- baseline vs `presentation_flipped`
- baseline vs `scale_flipped`
- baseline vs `fully_flipped`

### Model Summary
The aggregation of all comparison pairs for a single model across all locked vignettes and supported conditions.

### Batch Handling Rule
Repeated runs inside a cell are repeated measurements, not independent top-level evidence.

That means:

- batches are used to estimate the cell's behavior
- model-level reversal metrics are aggregated over comparison pairs
- we do not count each raw transcript as a separate top-level pairing in the leaderboard

---

## 5. Metric Definitions

All of the following metrics must be computed in backend code.

General rationale:

- these metrics are computed in backend analysis because raw selected trial data contains variance information that cannot be reconstructed from collapsed frontend cell scores
- primary metrics answer "did the conclusion change?"
- secondary metrics answer "which way does the model tend to drift when it changes?"
- supporting metrics answer "is this likely to be real order sensitivity or just baseline instability?"

### 5.1 Match Metrics

These preserve the existing fully-flipped comparison story:

- `matchRate`
- `matchCount`
- `matchEligibleCount`

These remain useful as legacy anchors, but the UI must label their denominator clearly.

#### `matchRate`
- What it measures: the share of eligible `baseline` vs `fully_flipped` comparison pairs where the conclusion still matches under the existing order-invariance logic for the active `directionOnly` mode.
- Why it matters: this is the simplest continuity metric from the current page and gives users a familiar anchor while the rest of the page becomes more reversal-focused.
- Why it belongs in backend output: it shares the same transcript selection and eligibility logic as the new metrics, so it should be computed from the same canonical backend pipeline.
- Priority: primary legacy anchor.

Implementation rule:

- if `directionOnly=true`, match uses canonical-score side-of-midpoint agreement:
  - match when both canonical cell scores are `< 3`
  - or both canonical cell scores are `> 3`
  - do not use stable-side classification for this legacy match rule
- if `directionOnly=false`, match uses exact canonical cell-score equality
- the snapshot cache key must include `directionOnly`

#### `matchCount`
- What it measures: the number of eligible `fully_flipped` pairs that matched.
- Why it matters: percent alone hides how many comparisons actually matched.
- Why it belongs in backend output: the backend owns the eligibility denominator and should expose the numerator directly.
- Priority: supporting context.

#### `matchEligibleCount`
- What it measures: the denominator for `matchRate`.
- Why it matters: the Order Effect page mixes multiple denominators, so this count must be explicit.
- Why it belongs in backend output: the frontend should not infer denominators from row subsets.
- Priority: supporting context.

### 5.2 Reversal Metrics

#### Value-Order Reversal Rate
Computed from baseline vs `presentation_flipped` comparison pairs.

#### Scale-Order Reversal Rate
Computed from baseline vs `scale_flipped` comparison pairs.

#### Pair-Level Summary Score
For each cell, compute a canonical cell score using the same selected trials already chosen by the order-invariance pipeline.

Initial rule:

- use the existing selected transcript set from `pickStableTranscripts(...)`
- if `trimOutliers=true`, derive a `consideredTrials` subset using the same sorted inner-slice rule already used by `computeMajorityVote(...)`
- do not trim arrays smaller than 3 items; for selected set sizes of 1 or 2, `consideredTrials` is the full selected set
- compute the canonical cell score from `consideredTrials`, not from the full selected set
- use the same `consideredTrials` subset for:
  - stable-side classification
  - within-cell disagreement
  - pair-level drift
  - pair-level margin
- if `trimOutliers=false`, `consideredTrials` is the full selected set

The canonical cell score must use the same aggregation rule as the existing `computeMajorityVote(...)` implementation:

- compute the mode of `consideredTrials`
- if there is a single mode, use it
- if there are multiple modes, use the median of `consideredTrials` as the tiebreaker

This keeps every downstream metric aligned with the actual cell score shown in the page and avoids one rule for score computation and a different rule for stability computation.

This keeps the new metrics aligned with the existing order-invariance readback while still preserving raw-trial variance for diagnostics.

#### Too-Close-To-Call Rule
A comparison pair is excluded from reversal denominators if either the baseline cell or the variant cell is not trustworthy enough to support a winner/loser conclusion.

For this implementation, a cell is `too close to call` if **either** of the following is true:

1. Its canonical cell score is exactly the midpoint (`3` on the 1-5 scale).
2. The selected raw trials for that cell do not show a stable side of the midpoint.

Define "stable side of the midpoint" as:

- `lean_low` if more than 50% of `consideredTrials` are `< 3`
- `lean_high` if more than 50% of `consideredTrials` are `> 3`
- `unstable` otherwise

The denominator is always the full `consideredTrials` set, including midpoint (`= 3`) trials.

Examples:

- `[4, 3, 4]` => `lean_high` because `2/3 > 50%`
- `[4, 3, 3, 4]` => `unstable` because `2/4` is not greater than `50%`

That means cells like:

- `[5, 5, 1, 1, 3]`
- `[3, 3, 4]`

must be treated as `too close to call`, even if a simple average or majority-vote artifact might tempt the implementation to assign them a side.

A comparison pair is eligible only if:

- baseline cell is not `too close to call`
- variant cell is not `too close to call`
- neither cell is `missing`

`missing` means `pickStableTranscripts(...)` did not return a usable selected set for that cell:

- `insufficient`
- `fragmented`
- or a null/empty canonical score after selection

All `missing` cells are excluded from every denominator.

This rule must be implemented centrally in backend code and reused by all reversal metrics.

#### Reversal Rule
A reversal occurs when the inferred preference switches sides across the midpoint.

Use the pair-level side labels derived from the stable-side rule above:

- baseline `lean_low` and variant `lean_high`
- or baseline `lean_high` and variant `lean_low`

In plain language:

- baseline favors Attribute A, variant favors Attribute B
- or baseline favors Attribute B, variant favors Attribute A

Reversal eligibility and reversal counting are based on stable-side classification, not canonical scores alone.
Canonical scores are still used for cell summaries and legacy match logic, but a pair with a non-midpoint canonical score can still be excluded if its `consideredTrials` are unstable.

#### `valueOrderReversalRate`
- What it measures: how often changing only value order changes which side wins.
- Why it matters: this is the main validity metric for value-order effects. It answers whether changing presentation changes the conclusion.
- Why it belongs in backend output: it depends on raw selected trial behavior, cell eligibility, and shared denominator logic.
- Priority: primary.

#### `scaleOrderReversalRate`
- What it measures: how often changing only scale order changes which side wins.
- Why it matters: this is the main validity metric for scale-order effects.
- Why it belongs in backend output: it depends on the same backend-only logic plus correct handling of scale orientation.
- Priority: primary.

#### `eligiblePairCount`
- What it measures: the number of comparison pairs that survived the `too close to call` rule for a given metric family.
- Why it matters: reversal rates are meaningless without a visible denominator.
- Why it belongs in backend output: the backend is the source of truth for eligibility.
- Priority: supporting context.

#### `excludedPairCount`
- What it measures: the number of comparison pairs excluded because one or both cells were neutral or unstable.
- Why it matters: a low reversal rate can be misleading if half the data got excluded as too ambiguous.
- Why it belongs in backend output: exclusion logic must be centralized and auditable.
- Priority: supporting context.

### 5.3 Directional Pull Metrics

Directional pull is secondary to reversal rate.

It should answer:

- for value order: does the model tend to drift toward the first-listed or second-listed value?
- for scale order: does the model tend to drift toward higher numbers or lower numbers?

These metrics must be computed from raw selected trial data, not from frontend heuristics over collapsed rows.

Directional pull should be computed from pair-level signed drift, but only after the same pair passes eligibility checks. A pair that is too close to call for reversal should not vote on directional pull either.

Directional pull labels are required in this implementation. Therefore the aggregation rule is not optional:

- compute signed pair-level drift for each eligible pair
- discard zero-drift pairs for the direction-label vote, but keep them available for summary statistics
- require at least `3` non-zero eligible pairs before emitting a directional label
- require at least `2/3` of non-zero eligible pairs to point in the same direction
- otherwise emit `no clear pull`

#### Value-Order Pull
Labels:

- `toward first-listed`
- `toward second-listed`
- `no clear pull`

Computation rule:

- for each eligible baseline vs `presentation_flipped` pair, compute `pairDrift = variantCellScore - baselineCellScore` using normalized canonical cell scores
- classify each non-zero `pairDrift` as positive or negative
- if at least `2/3` of non-zero eligible pairs are positive, emit `toward second-listed`
- if at least `2/3` of non-zero eligible pairs are negative, emit `toward first-listed`
- otherwise emit `no clear pull`

Sign derivation:

- baseline means Attribute A is listed first and `presentation_flipped` means Attribute B is listed first
- normalized scores remain baseline-oriented, so positive `pairDrift = variant - baseline` means the model moved toward the option that became first-listed in the flipped prompt, which is the value listed second in the baseline description

#### `valueOrderPull`
- What it measures: which way value-order changes tend to push the model when a drift exists.
- Why it matters: reversal rate tells you whether the answer changed; pull tells you the story of how it tends to change.
- Why it belongs in backend output: the label depends on raw selected trials and canonical pair-level drift logic.
- Priority: secondary explanatory metric.

#### Scale-Order Pull
Labels:

- `toward higher numbers`
- `toward lower numbers`
- `no clear pull`

Computation rule:

- interpret "higher numbers" and "lower numbers" in terms of the raw numeric response the model saw on the prompt, before normalization
- for each eligible baseline vs `scale_flipped` pair, compute `pairDrift = rawVariantCellScore - rawBaselineCellScore`
- here `rawBaselineCellScore` and `rawVariantCellScore` must both be computed from the raw `consideredTrials` in the prompt's own displayed 1-5 scale using the same aggregation rule as the canonical cell score
- classify each non-zero `pairDrift` as positive or negative
- if at least `2/3` of non-zero eligible pairs are positive, emit `toward higher numbers`
- if at least `2/3` of non-zero eligible pairs are negative, emit `toward lower numbers`
- otherwise emit `no clear pull`

This metric is intentionally about attraction to larger or smaller visible numerals on the response scale, not about normalized value preference direction.

The scale-order pull metric assumes the prompt uses a strict integer 1-5 visible response scale. If that assumption changes in the future, this metric definition must be revisited before implementation.

#### `scaleOrderPull`
- What it measures: which way scale-order changes tend to push the model when a drift exists.
- Why it matters: this distinguishes random scale noise from a directional bias toward higher or lower numbers.
- Why it belongs in backend output: correct interpretation requires access to raw trial orientation before normalization.
- Priority: secondary explanatory metric.

### 5.4 Uncertainty / Stability Metrics

These are supporting metrics. They are not the headline story, but they are necessary to interpret whether reversal rates are meaningful.

At minimum compute:

- `eligiblePairCount`
- `excludedPairCount`
- `withinCellDisagreementRate`
- `pairLevelMarginSummary`

Optional if straightforward:

- standard error of pair-level differences
- confidence interval for mean directional drift

The UI does not need to display all of these initially, but the backend output must include them or retain enough structure to add them later without recomputing raw data logic in the browser.

#### `withinCellDisagreementRate`
- What it measures: how often repeated trials inside a single cell disagree about which side of the midpoint they support.
- How to compute it: for each cell, classify each `consideredTrial` as `< 3`, `= 3`, or `> 3`.
- Determine the majority side-of-midpoint bucket by comparing only the `< 3` and `> 3` counts.
- If `< 3` count is greater, the majority side bucket is `< 3`.
- If `> 3` count is greater, the majority side bucket is `> 3`.
- If `< 3` and `> 3` counts are tied, the cell disagreement rate is `1.0`.
- Midpoint (`= 3`) trials are always included in the denominator and always count as disagreement.
- Otherwise, the cell disagreement rate is the share of all `consideredTrials` that do not belong to the winning side bucket.
- Aggregate per model as the simple mean of per-cell disagreement rates across non-missing cells.
- Why it matters: this is the baseline noise floor. If a model already disagrees heavily with itself under the same prompt, then reversal metrics must be interpreted more cautiously.
- Why it belongs in backend output: the frontend never sees the repeated trial distribution needed to compute this.
- Priority: supporting diagnostic.

#### `pairLevelMarginSummary`
- What it measures: how far each eligible pair sits from the decision boundary after the pair-level summary is computed.
- How to compute it: for each eligible pair, compute `margin = abs(cell_score - 3)` for baseline and variant, then store summary statistics over the smaller of the two margins in the pair. At minimum expose mean, median, and p25/p75 for this "distance from midpoint" margin.
- Why it matters: a reversal among near-midpoint pairs is less alarming than a reversal among pairs with large margins. This metric helps separate fragile close calls from stronger conclusions.
- Why it belongs in backend output: it depends on the same canonical backend pair definitions and eligibility rules.
- Priority: supporting diagnostic.

---

## 6. Canonical Backend Computation Strategy

### 6.1 Do Not Compute These Metrics in React

The web app must stop computing:

- reversal rates
- directional pull labels
- denominator counts for reversal metrics

React should only:

- query the metrics
- render the metrics
- display explanatory text/tooltips

### 6.2 Compute from Raw Selected Trials

The current resolver in [order-invariance.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/queries/order-invariance.ts) already:

- finds the relevant scenario pairs
- filters transcripts
- normalizes decisions by variant type
- selects stable transcript sets with `pickStableTranscripts(...)`

This implementation should reuse that pipeline, but stop throwing away variance too early.

Specifically:

1. For each `model × vignette × condition × variant`, collect the selected transcript decisions.
2. Preserve both:
   - normalized decisions
   - raw decisions in the prompt's displayed scale for scale-order interpretation
3. Build cell-level stability annotations, including:
   - stable-side classification
   - midpoint / unstable exclusion flags
   - within-cell disagreement
4. Build pair-level comparison records from those selected transcript sets and cell-level annotations.
5. Compute reversal and directional-pull metrics from those pair-level records in backend code.
6. Separately compute any UI display row fields that still need cell-level summary values.

### 6.3 Canonical Comparison Record

Introduce a backend-only internal type similar to:

```ts
type OrderEffectComparisonRecord = {
  modelId: string;
  modelLabel: string;
  vignetteId: string;
  vignetteTitle: string;
  conditionKey: string;
  variantType: 'presentation_flipped' | 'scale_flipped' | 'fully_flipped';
  baselineRawDecisions: number[];
  variantRawDecisions: number[];
  baselineNormalizedDecisions: number[];
  variantNormalizedDecisions: number[];
  baselineConsideredTrials: number[]; // normalized considered trials
  variantConsideredTrials: number[]; // normalized considered trials
  rawBaselineConsideredTrials: number[]; // raw un-normalized trials at the same positional inner-slice indices
  rawVariantConsideredTrials: number[]; // raw un-normalized trials at the same positional inner-slice indices
  baselineCellScore: number | null;
  variantCellScore: number | null;
  rawBaselineCellScore: number | null;
  rawVariantCellScore: number | null;
  baselineStableSide: 'lean_low' | 'lean_high' | 'unstable' | 'neutral' | 'missing';
  variantStableSide: 'lean_low' | 'lean_high' | 'unstable' | 'neutral' | 'missing';
  pairDecision: 'baseline_a' | 'baseline_b' | 'neutral' | 'missing';
  matchesBaseline: boolean | null;
  reversed: boolean | null;
  midpointExcluded: boolean;
  withinCellDisagreement: {
    baseline: number | null;
    variant: number | null;
  };
  pairMargin: {
    baseline: number | null;
    variant: number | null;
    limiting: number | null;
  };
};
```

Exact field names may vary, but the backend must have an internal record at roughly this level of detail.

Definitions:

- `neutral` means canonical cell score is exactly `3`
- `unstable` means canonical cell score is not missing, but side-of-midpoint support is not greater than 50% of `consideredTrials`
- `missing` means transcript selection failed or produced no usable canonical cell score
- raw considered trials use the same inner-slice indices as normalized `consideredTrials`, but keep the prompt's displayed numeric orientation
- `pairDecision` is an internal convenience field after baseline-oriented normalization:
  - `baseline_a` means the normalized pair-level conclusion favors the lower side of the baseline-oriented scale
  - `baseline_b` means the normalized pair-level conclusion favors the higher side of the baseline-oriented scale
  - `neutral` means no side wins
  - `missing` means the pair could not be evaluated

Do not add extra summary fields to this record unless they are defined in the metric spec and either used by aggregation or intentionally carried through to GraphQL.

---

## 7. Persistence / Cache Design

### 7.1 Do Not Force This into `AnalysisResult`

The existing `AnalysisResult` model is keyed by `runId` in [schema.prisma](/Users/chrislaw/valuerank/cloud/packages/db/prisma/schema.prisma#L475).

That is the wrong fit here because order-effect metrics are not the analysis of one run. They are a cross-run assumption package spanning:

- multiple scenarios
- multiple variants
- multiple models

Therefore, do not overload `AnalysisResult` with a fake anchor run.

### 7.2 Add a Dedicated Assumption Analysis Cache Table

Add a new Prisma model, tentatively:

```prisma
enum AssumptionAnalysisStatus {
  CURRENT
  SUPERSEDED
}

model AssumptionAnalysisSnapshot {
  id            String   @id @default(cuid())
  assumptionKey String   @map("assumption_key")
  analysisType  String   @map("analysis_type")
  inputHash     String   @map("input_hash")
  codeVersion   String   @map("code_version")
  config        Json     @db.JsonB
  output        Json     @db.JsonB
  status        AssumptionAnalysisStatus @default(CURRENT)
  createdAt     DateTime @default(now()) @map("created_at")
  deletedAt     DateTime? @map("deleted_at")

  @@index([assumptionKey])
  @@index([analysisType])
  @@index([inputHash])
  @@index([status])
  @@index([deletedAt])
  @@index([assumptionKey, analysisType, inputHash, status])
  @@map("assumption_analysis_snapshots")
}
```

Use a dedicated `AssumptionAnalysisStatus` enum for this table. Do not reuse `AnalysisStatus`.
Use `deletedAt` only as a conventional soft-delete column; this feature does not implement snapshot deletion. Cache invalidation uses `SUPERSEDED`, not deletion.
`config` stores the cache key payload object excluding transcript-selection fingerprints and `codeVersion`, so config-signature supersede queries can run without decoding `inputHash`.

### 7.3 Cache Key

The cache key must be deterministic and computed from the exact in-scope inputs used by the analysis.

Use this payload shape before hashing:

```ts
{
  assumptionKey: 'order_invariance',
  analysisType: 'reversal_metrics_v1',
  codeVersion,
  trimOutliers,
  directionOnly,
  requiredTrialCount,
  lockedVignetteIds: [...sorted],
  approvedPairIds: [...sorted],
  snapshotModelIds: [...sorted],
  selectionFingerprints: [...sorted]
}
```

Use a manually bumped code constant for `codeVersion`, for example:

```ts
const REVERSAL_METRICS_CODE_VERSION = 'reversal_metrics_v1';
```

Where:

- `selectionFingerprints` means the stable per-scenario-per-model selection state that actually drives the analysis result:
  - selected transcript ids when a stable selection exists
  - selected transcript decision / model-version / created-at state, so in-place transcript edits invalidate the snapshot
  - explicit `insufficient` / `fragmented` markers when no stable selection exists
- `snapshotModelIds` means all models with relevant data for this assumption snapshot, not the current UI filter state
- `approvedPairIds` means the exact approved `AssumptionScenarioPair` ids included in the computation
- `inputHash` should therefore be insensitive to older irrelevant transcript churn that does not change the selected set

Hash rule:

- JSON stringify the payload with stable key order
- compute SHA-256
- store the first 16 hex chars, matching the existing cache style

### 7.4 Cache Invalidation

Cache must be invalidated when:

- new relevant transcripts appear
- relevant transcripts are deleted or superseded
- code version changes
- metric config changes

Trigger rule:

- do not build a separate invalidation job for this feature
- instead, on every `assumptionsOrderInvariance` query, recompute the current cache payload and hash
- if a CURRENT snapshot exists for the same:
- cache hit requires exact match on:
  - `assumptionKey`
  - `analysisType`
  - `inputHash`
  - `status = CURRENT`
  then reuse it
- otherwise compute a fresh snapshot, write it, and mark older CURRENT snapshots as `SUPERSEDED` only for the same:
  - `assumptionKey`
  - `analysisType`
  - config signature

Config signature means the cache dimensions other than transcript membership and code version:

- `trimOutliers`
- `directionOnly`
- `requiredTrialCount`
- `lockedVignetteIds`
- `approvedPairIds`
- `activeModelIds`

Do not supersede CURRENT snapshots for a different config signature. Multiple CURRENT snapshots for different config signatures are valid.
Do not copy the existing run-based `cache.ts` supersede pattern that updates all CURRENT rows for a broader key. This feature must supersede only rows whose config signature matches exactly.
Use a transactional lock keyed by config signature when writing snapshots so concurrent recomputes do not leave zero CURRENT rows or nondeterministic duplicates.

This should mirror the existing analysis cache pattern in [cache.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/services/analysis/cache.ts).

---

## 8. Where the Computation Should Live

### Recommended Design

Use a dedicated backend service plus cache-backed GraphQL resolver.

#### Service Layer
Add a new service module, for example:

- `cloud/apps/api/src/services/assumptions/order-effect-analysis.ts`
- `cloud/apps/api/src/services/assumptions/order-effect-cache.ts`

Responsibilities:

- load relevant transcripts and pair definitions
- build comparison records
- compute metrics
- read/write cached assumption-analysis snapshots
- expose cache hit / miss / recompute logging

The GraphQL resolver should delegate to this service for the authoritative analytics pipeline rather than re-implementing transcript selection and aggregation inline.

Error-handling rule:

- if cache read or write fails, log the error and continue returning the freshly computed in-memory result
- do not fail the GraphQL query purely because snapshot persistence failed
- do not silently swallow metric-computation errors; log and surface them as server errors if the computation itself cannot complete

#### GraphQL Layer
Keep the public query name:

- `assumptionsOrderInvariance`

But change the resolver so it:

1. computes a cache key
2. attempts to read the current cached snapshot
3. computes and persists a fresh snapshot if cache is missing/stale
4. maps cached output into the GraphQL response

### Why Not Compute at Pure Resolver Time Forever

Pure resolver-time computation would work technically, but it has downsides:

- repeated expensive transcript scans
- no persisted audit trail of metric versions
- harder debugging when numbers change after code deploys
- weaker reproducibility

So:

- resolver-time compute is acceptable only as a short transition step
- persisted snapshot is the target architecture

Cold-cache performance note:

- this analysis runs synchronously during the query in v1
- a slower first request is acceptable for v1 as long as warm-path cache reuse is observable in logs and normal repeated requests hit the snapshot path

---

## 9. GraphQL Contract Changes

Extend the existing `OrderInvarianceSummary` and/or add model-level metric fields so the UI can render the leaderboard without computing analytics locally.

At minimum the backend response must expose, per model:

- `matchRate`
- `matchEligibleCount`
- `valueOrderReversalRate`
- `valueOrderEligibleCount`
- `valueOrderExcludedCount`
- `valueOrderPull`
- `scaleOrderReversalRate`
- `scaleOrderEligibleCount`
- `scaleOrderExcludedCount`
- `scaleOrderPull`
- `withinCellDisagreementRate`
- `pairLevelMarginSummary`

If useful, also expose:

- `valueOrderMeanDrift`
- `scaleOrderMeanDrift`

The exact GraphQL type design is flexible, but the frontend must not have to recompute any of the above from raw rows.

Recommended new model-level type:

```ts
type OrderInvarianceModelMetrics = {
  modelId: string;
  modelLabel: string;
  matchRate: number | null;
  matchCount: number;
  matchEligibleCount: number;
  valueOrderReversalRate: number | null;
  valueOrderEligibleCount: number;
  valueOrderExcludedCount: number;
  valueOrderPull: 'toward first-listed' | 'toward second-listed' | 'no clear pull';
  scaleOrderReversalRate: number | null;
  scaleOrderEligibleCount: number;
  scaleOrderExcludedCount: number;
  scaleOrderPull: 'toward higher numbers' | 'toward lower numbers' | 'no clear pull';
  withinCellDisagreementRate: number | null;
  pairLevelMarginSummary: {
    mean: number | null;
    median: number | null;
    p25: number | null;
    p75: number | null;
  } | null;
};
```

Then add:

- `modelMetrics: [OrderInvarianceModelMetrics!]!`

to the query result.

The existing `rows` payload can remain for drilldown and table details.

---

## 10. Web App Changes

The web app scope becomes smaller and cleaner.

### Required Web Changes

- stop computing reversal rates in `OrderEffectPanel.tsx`
- stop computing directional pull in `OrderEffectPanel.tsx`
- read new backend `modelMetrics` data instead
- render those values directly in the leaderboard
- preserve the existing drilldown behavior by continuing to use the `rows` payload

### UI Labeling Rules

Because denominators differ, the leaderboard must make that visible:

- `N (Match)` for fully-flipped match metrics
- reversal columns show their own eligible pair counts inline

Example columns:

- `Model`
- `N (Match)`
- `Match Rate`
- `Value-Order Reversals`
- `Typical Pull (Value Order)`
- `Scale-Order Reversals`
- `Typical Pull (Scale Order)`

### Top Summary Cards

Remove the top `Δ_P` / `Δ_S` cards from the main Order Effect page once backend reversal metrics exist.

If effect-size metrics are kept at all, they should move to a secondary detail section, not remain the primary summary.

---

## 11. Implementation Plan

We are not doing a phased rollout for this work.

We will implement the backend-first architecture in one pass:

- compute reversal and directional-pull metrics in backend analysis code
- persist them in a dedicated assumption-analysis cache
- expose them through GraphQL
- simplify the frontend to pure rendering of backend-supplied metrics

The reason to do this in one pass is simple:

- we already know the frontend inference approach is wrong
- we already know persisted backend metrics are the target architecture
- building a temporary intermediate state would add churn without real product value

Implementation sequence:

1. Add Prisma schema + migration for `AssumptionAnalysisSnapshot`
2. Add backend cache helper for deterministic hash lookup / write / supersede
3. Refactor order-effect analysis into a dedicated backend service
4. Extend GraphQL types and resolver to read from cached snapshot output
5. Update web API client types
6. Update the new `Analysis` page to render backend metrics only
7. Preserve the current page under a separate route and nav label: `Analysis (old v1)`

### Future Statistical Refinements

The following may still happen later, but they are not separate rollout phases for this feature:

- stronger neutral-zone handling
- confidence intervals
- close-call vs clear-win reversal splits
- distribution-aware directional inference

These are follow-on methodological refinements to the same backend system, not a reason to keep any of the analytics in the browser now.

---

## 12. Files Likely to Change

### Database / Shared Types

- `cloud/packages/db/prisma/schema.prisma`
- migration under `cloud/packages/db/prisma/migrations/`
- shared DB exports if needed

### API / Backend

- `cloud/apps/api/src/graphql/queries/order-invariance.ts`
- new service file(s) under `cloud/apps/api/src/services/assumptions/`
- possible helper types under `cloud/apps/api/src/services/assumptions/`

### Web

- `cloud/apps/web/src/api/operations/order-invariance.ts`
- `cloud/apps/web/src/components/assumptions/OrderEffectPanel.tsx`
- route/navigation files needed to:
  - keep the existing implementation available at a dedicated legacy route such as `/assumptions/analysis-v1`
  - expose the new backend-driven implementation at `/assumptions/analysis`
  - label the routes `Analysis (old v1)` and `Analysis`

---

## 13. Verification Requirements

Before merge, verify all of the following:

1. The frontend does not compute reversal or pull metrics locally.
2. The GraphQL response contains model-level backend-computed reversal and pull metrics.
3. Cache invalidation works when relevant transcripts change.
4. `Match Rate` and `N (Match)` still match prior fully-flipped behavior.
5. Value-order and scale-order reversal counts use their own eligible denominators.
6. Scale-order directional pull is computed in backend code from raw selected trial data, not by UI un-normalization hacks.
7. The 4-cell matrix and transcript drilldown still render correctly.
8. The legacy page remains accessible as `Analysis (old v1)`.
9. The new backend-driven page is the default `Analysis` page.

---

## 14. Open Decisions

These decisions may be refined during implementation, but they do not change the architecture:

- exact uncertainty outputs to expose in GraphQL now vs later
- whether to compute and expose secondary effect-size metrics in the same snapshot

None of these justify keeping the core analytics in the frontend.

---

## 15. Bottom Line

We are intentionally choosing the backend-first path.

That means:

- no browser-side reversal inference
- no browser-side directional-pull heuristics
- no pretending collapsed leaderboard rows can support strong statistical claims

Instead:

- compute from raw selected trials in backend analysis code
- persist/cache the results
- serve a clean metrics contract to the UI
- keep React dumb

UI migration rule:

- preserve the existing page as `Analysis (old v1)` for reference
- ship the backend-driven experience as the primary `Analysis` page
- lock routes as:
  - `/assumptions/analysis`
  - `/assumptions/analysis-v1`
- preserve `/assumptions/order-effect` as a compatibility alias or redirect during migration so existing navigation and bookmarks do not break immediately

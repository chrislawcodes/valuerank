# Same-Signature Aggregate Analysis Plan

## Goal
Allow the new `Analysis` page to use older transcripts when they come from baseline-compatible runs with the same `Signature`.

This plan is specifically about enabling pooled analysis for:
- same-signature baseline runs
- the new vignette `Analysis` page

This plan is not a general aggregate-analysis redesign.

## Why We Want This Feature
The current product behavior is too wasteful for historically accumulated baseline data.

Today, a user can have many older baseline runs that:
- used the same signature
- used the same vignette version and setup
- produced valid transcripts
- are already useful in `Analysis (Old V1)`

But the new `Analysis` page ignores that pooled evidence because aggregate rows still publish only the legacy contract.

That creates three product problems:

1. Useful old transcripts cannot contribute to the new semantics.
   - Users are forced to rerun work they have effectively already done.
   - This is especially costly for larger model batches and expensive providers.

2. The new page is stricter than the actual methodology requires.
   - Under the glossary definition, same-signature runs are explicitly intended to represent the same setup across runs.
   - If they are baseline-compatible, refusing to pool them by default is unnecessarily conservative for preference analysis.

3. Users reasonably expect pooled same-signature evidence to improve confidence.
   - More same-signature baseline transcripts should usually improve preference estimation.
   - In many cases they should also improve reliability estimation, provided repeat structure is preserved.

So the purpose of this feature is:
- reuse valid old baseline transcripts
- avoid unnecessary reruns
- let the new `Analysis` page benefit from same-signature pooled evidence
- do so without weakening the semantic guardrails around baseline reliability

## Why This Is Needed
Today, the new `Analysis` page only trusts runs that publish:
- `preferenceSummary`
- `reliabilitySummary`

Ordinary baseline vignette runs do publish those summaries.

Aggregate runs do not.

Current aggregate output in [aggregate.ts](/Users/chrislaw/valuerank-vignette-analysis/cloud/apps/api/src/services/analysis/aggregate.ts) still writes a legacy-shaped result:
- no `preferenceSummary`
- no `reliabilitySummary`
- `codeVersion: '1.0.0'`
- `perModel.overall` placeholder zeros

Because of that, the new UI currently treats aggregate rows as unsupported for vignette semantics.

That is too strict for same-signature pooled baseline data.

## Canonical Assumption
This plan uses the glossary definition of `Signature` in [canonical-glossary.md](/Users/chrislaw/valuerank/docs/canonical-glossary.md):

> A signature identifies a specific vignette version and run setup, including temperature, and is used to match trials that came from the same setup across different runs.

For this plan, the working assumption is:

- if runs share the same signature, they share the same vignette version and run setup in the product sense
- therefore, pooling those baseline transcripts is methodologically acceptable for some vignette-analysis claims

### Operational Signature For V1
For this feature's first implementation, eligibility must not depend on a future first-class stored signature field.

The operational signature is the exact stored tuple already used by the product today:
- `definitionId`
- `definitionVersion`
- `preambleVersionId`
- `temperature`

This tuple is the authoritative v1 meaning of “same signature” for same-signature aggregate eligibility.

The display formatter in `trial-signature.ts` is not the eligibility source of truth by itself; it is only the user-facing rendering of part of this tuple.

## Product Decision
Same-signature pooled baseline runs should be eligible for the new `Analysis` page.

More precisely:

1. Same-signature pooled baseline runs should publish pooled `preferenceSummary`.
2. Same-signature pooled baseline runs may publish pooled `reliabilitySummary`, but only if reliability is computed from preserved repeated-trial structure rather than broad pooled spread.
3. Aggregate rows that mix signatures, run types, or manipulated-condition runs must remain excluded from the new vignette semantics.

## Statistical Position
The important distinction is not `aggregate` vs `non-aggregate`.

The real distinction is:
- baseline-compatible pooled data from the same signature
- mixed pooled data that changes the meaning of the estimate

With the glossary definition of `Signature`, same-signature pooling is generally acceptable for:
- preference direction
- preference strength

Same-signature pooling is acceptable for reliability only if:
- repeated-trial structure is preserved at the cell level
- reliability is estimated from within-cell / within-condition repeatability
- we do not relabel broad cross-run spread as baseline reliability

## Locked Estimands
This plan is not implementation-ready unless the pooled estimands are explicit.

### Pooled Preference Estimand
For an eligible same-signature pooled aggregate, pooled preference means:

- the per-model mean preference over the planned baseline condition set for that signature
- estimated from observed baseline-compatible transcripts belonging to that signature
- with orientation correction applied exactly as in baseline `analyze_basic.py`

Weighting rule:
- `preferenceDirection.byValue` remains transcript-count weighted, matching the current baseline worker contract
- `overallSignedCenter` and `preferenceStrength` remain condition-mean based, matching the current baseline worker contract
- this mixed weighting is intentional for the first pooled implementation and must match the baseline worker behavior rather than invent a new weighting scheme in aggregate code

Coverage rule:
- pooled preference is only eligible when the pooled source runs jointly cover the full planned baseline condition set for the signature
- partial condition coverage is fail-closed and makes the pooled aggregate ineligible
- deleted or missing scenario rows also make the pooled aggregate ineligible rather than silently changing the estimand

### Pooled Reliability Estimand
For an eligible same-signature pooled aggregate, pooled reliability means:

- per-model repeatability of baseline judgments across the pooled transcript set
- estimated at the canonical repeatability unit of `runId × modelId × conditionId × variant`
- then rolled up across runs for the same signature

Locked rule:
- `runId` remains part of the repeatability unit
- across-run transcripts do not become repeats merely because they share `modelId × conditionId × variant`
- pooled reliability may aggregate within-run repeatability estimates across same-signature runs
- pooled reliability must not treat between-run mean shifts as within-run repeat noise

This means pooled reliability is a weighted combination of within-run repeatability estimates, not a single variance computed after erasing run boundaries.

### Locked Pooled Reliability Rollup Formula
The pooled reliability rollup must not be left to implementer judgment.

For each eligible source run and model:
- first compute the ordinary baseline run-level `reliabilitySummary` using the shared Python semantic path
- only runs with publishable run-level reliability inputs participate in the pooled reliability rollup for that model

Locked weight:
- `weight_i = coverageCount_i`
- where `coverageCount_i` is the run-level number of repeated baseline conditions that actually contributed to that model’s reliability summary in source run `i`

Locked pooled formulas:
- `pooledBaselineReliability = sum(weight_i * baselineReliability_i) / sum(weight_i)`
- `pooledBaselineNoise = sum(weight_i * baselineNoise_i) / sum(weight_i)`
- `pooledDirectionalAgreement = sum(weight_i * directionalAgreement_i) / sum(weight_i)`
- `pooledNeutralShare = sum(weight_i * neutralShare_i) / sum(weight_i)`
- `pooledCoverageCount = sum(coverageCount_i)`
- `pooledUniqueScenarios = count(distinct repeated baseline conditions contributing to the pooled model-level rollup)`

Locked exclusions:
- runs with `coverageCount_i = 0` do not contribute to the reliability rollup for that model
- across-run observations do not become repeats
- a run with available pooled preference but unavailable run-level reliability contributes nothing to pooled reliability

Rationale:
- `coverageCount` is the canonical weight because the run-level reliability metrics are already summaries over repeated baseline conditions
- do not weight by raw transcript count, run count, or pooled scenario count
- do not recompute a global variance after pooling transcripts across runs

### Cross-Run Drift
Between-run shifts within the same signature are not baseline reliability.

For this plan:
- cross-run drift is a separate quantity
- it may be logged, tested, or later surfaced
- but it must not be folded into `baselineNoise` or `baselineReliability`
- if cross-run drift exceeds the warning threshold, pooled reliability remains visible but must be flagged as high-drift rather than silently treated as clean baseline reliability

Locked v1 drift rule:
- compute per-model cross-run drift as the weighted standard deviation of run-level `overallSignedCenter`
- use run-level `coverageCount` as the weight
- warning threshold: `weightedSD(overallSignedCenter) > 0.25`
- UI treatment: show pooled reliability, but surface a high-drift warning state with strong visual emphasis
- recommended first-pass visual treatment: red warning text / badge in the aggregate-specific reliability area

Interpretation rule:
- high drift is a valid finding, not an automatic invalidation
- the warning means `read carefully`, not `ignore this`
- the UI should not hide the result solely because drift is high

## Eligibility Rule
This plan introduces a narrower category than “aggregate run”:

`same-signature pooled baseline analysis`

A pooled run is eligible for new vignette semantics only when all source runs satisfy all of the following:

1. `signature` matches exactly across all pooled source runs.
2. the source runs are baseline vignette runs, not assumptions or manipulated-condition runs
   - locked v1 exception: `temp_zero_determinism` counts as baseline-compatible for this pooled Analysis flow
3. the pooled source runs jointly cover the full planned baseline condition set for that signature
4. the source runs use the same vignette/scenario version for that signature
5. the source runs use the same scoring / transcript summarization contract version
6. the source runs do not include mixed framing/order-effect variants in what is being labeled as baseline semantics
7. model identity is stable at the raw `modelId` level across the pooled source runs; if that cannot be verified from stored metadata, the pooled aggregate is ineligible for all new vignette semantics in this first implementation

If any of these fail, the aggregate stays unsupported for the new `Analysis` page.

### Locked Fail-Closed Eligibility Predicate
The aggregate pipeline must evaluate eligibility from explicit stored fields, not inference by convention.

Required source fields:
- run `definitionId`
- run `definitionVersion`
- run `preambleVersionId`
- run `temperature`
- run/config baseline-vs-assumption indicators
- run tags, including `assumption-run` when present
- run/config `assumptionKey` when present
- scenario set membership for the signature
- transcript summarization / scoring contract version
- source run ids
- model ids
- model snapshot / model-stability verification metadata

Fail-closed rules:
- missing signature tuple fields -> ineligible
- missing run-type metadata -> ineligible
- missing scenario rows needed to prove full condition coverage -> ineligible
- missing scoring-contract metadata -> ineligible
- mixed source run types -> ineligible
- missing model-stability proof -> ineligible

This plan does not permit “best effort” eligibility for historical aggregates with incomplete provenance.

### Locked Manipulated-Run Exclusion
The aggregate eligibility query must use the same effective exclusion logic as baseline `analyze_basic` semantics gating:
- `config.assumptionKey == null`, except `temp_zero_determinism`, which is baseline-compatible in this v1 pooled flow
- no `assumption-run` tag unless the run is the locked `temp_zero_determinism` exception

If equivalent metadata is unavailable for a historical source run, that source run is not eligible for pooled baseline semantics.

### Locked V1 Model-Stability Proof
For the first implementation, model stability is operationalized as:
- exact `modelId` equality across all contributing runs for a pooled model bucket

This is the v1 proof of model stability.

Implications:
- if a pooled model bucket contains mixed `modelId` values, it is ineligible
- if `modelId` is missing, it is ineligible
- provider snapshot/version metadata may be added later, but is not required for v1 eligibility

### Locked Condition / Variant Identity Rule
For the first same-signature pooled aggregate implementation, eligible aggregates are baseline-only.

That means:
- the canonical repeatability and preference condition identity is the stored baseline `scenarioId`
- there is no separate pooled variant dimension in the first implementation
- the effective variant key is implicitly `baseline`
- any source run containing non-baseline framing/order/presentation variants makes the pooled aggregate ineligible

Implementation consequence:
- when this plan refers to `conditionId × variant`, the first implementation must interpret that as `baseline scenarioId`
- do not invent pooled support for multi-variant same-signature aggregates in this slice

## What We Should Reuse
### 1. Preference Direction
Enable for same-signature pooled baseline runs.

Implementation meaning:
- pool baseline-compatible transcripts across source runs
- normalize orientation the same way baseline runs already do
- derive `preferenceSummary.perModel[*].preferenceDirection` from the pooled baseline data

### 2. Preference Strength
Enable for same-signature pooled baseline runs.

Implementation meaning:
- compute from pooled canonical scenario-level means, not from a legacy fallback field
- do not use `perModel.overall.mean` or `perModel.overall.stdDev` from aggregate rows

### 3. Baseline Noise
Enable only if the pooled data preserves true repeated-trial structure.

Implementation meaning:
- use the same within-scenario repeated-trial variance concept already used by baseline `reliabilitySummary`
- do not substitute cross-scenario spread or aggregate-wide dispersion

### 4. Baseline Reliability
Enable only if the pooled data preserves repeated-trial structure and can compute true repeatability.

Implementation meaning:
- derive from pooled repeated-trial cells
- preserve `coverageCount`
- preserve `uniqueScenarios`
- keep `no-repeat-coverage` unavailable behavior when pooled data still has only one sample per scenario

Minimum publishability rule:
- pooled reliability must remain unavailable unless a model has repeated coverage for at least `3` conditions and at least `20%` of the planned condition set
- one repeated condition is not enough for a user-facing reliability claim

Recommended caution threshold:
- if pooled reliability is available with `coverageCount < 5`, show a caution state that says reliability is available but still low-coverage
- in product language: `3` unlocks reliability, `5` is the preferred minimum for a cleaner reliability read

Interpretation rule:
- low repeat coverage means weaker evidence, not invalid evidence
- the UI should keep the result visible and clearly mark it as lower-confidence

## What We Must Not Do
1. Do not treat all aggregate runs as vignette-compatible just because they have more trials.
2. Do not treat cross-run spread as baseline reliability.
3. Do not use `perModel.overall.stdDev` as a fallback for pooled repeatability.
4. Do not infer vignette semantics from mixed-signature source runs.
5. Do not silently include assumptions / order-effect / manipulated runs in pooled baseline semantics.

## Required Backend Contract Changes
The aggregate pipeline must stop emitting only the legacy shape when the pooled run is same-signature baseline-compatible.

For eligible pooled runs, aggregate output must include:
- `preferenceSummary`
- `reliabilitySummary`

For ineligible pooled runs, aggregate output may continue to omit them and the UI should keep showing the unsupported state.

### Required aggregate contract behavior
1. Add explicit aggregate eligibility classification in the aggregate pipeline:
   - `eligible_same_signature_baseline`
   - `ineligible_mixed_signature`
   - `ineligible_run_type`
   - `ineligible_partial_coverage`
   - `ineligible_missing_metadata`
   - `ineligible_missing_repeatability`
   - `ineligible_model_instability`
   - use these exact enum values for the first implementation
2. Stop writing `codeVersion: '1.0.0'` for new aggregate outputs.
3. Stop relying on placeholder `overall: { mean: 0, stdDev: 0, ... }` for any semantics used by the new page.
4. Add explicit aggregate metadata to the output contract. Minimum required fields:
   - `aggregateMetadata.aggregateEligibility`
   - `aggregateMetadata.aggregateIneligibilityReason`
   - `aggregateMetadata.summaryContractVersion`
   - `aggregateMetadata.sourceRunCount`
   - `aggregateMetadata.sourceRunIds`
   - `aggregateMetadata.conditionCoverage`
   - `aggregateMetadata.perModelRepeatCoverage`
   - `aggregateMetadata.perModelDrift`

Locked contract rule:
- `aggregateEligibility` is the authoritative row-level gate for aggregate support on the V2 page
- valid summary presence is still required for section rendering, but it is not the primary row-level eligibility discriminator
- an aggregate row with `analysisType === 'AGGREGATE'` and `aggregateEligibility !== 'eligible_same_signature_baseline'` must remain blocked
- an aggregate row with `analysisType === 'AGGREGATE'` and `aggregateEligibility === 'eligible_same_signature_baseline'` may proceed to normal section-level summary validation

### Locked Aggregate Metadata Schema And Exposure
For the first implementation, the backend contract must expose this exact top-level field on `AnalysisResult.output`:

```ts
type AggregateMetadata = {
  aggregateEligibility:
    | 'eligible_same_signature_baseline'
    | 'ineligible_mixed_signature'
    | 'ineligible_run_type'
    | 'ineligible_partial_coverage'
    | 'ineligible_missing_metadata'
    | 'ineligible_missing_repeatability'
    | 'ineligible_model_instability';
  aggregateIneligibilityReason: string | null;
  summaryContractVersion: 'same-signature-v1';
  sourceRunCount: number;
  sourceRunIds: string[];
  conditionCoverage: {
    plannedConditionCount: number;
    observedConditionCount: number;
    complete: boolean;
  };
  perModelRepeatCoverage: Record<string, {
    repeatCoverageCount: number;
    repeatCoverageShare: number;
    contributingRunCount: number;
  }>;
  perModelDrift: Record<string, {
    weightedOverallSignedCenterSd: number | null;
    exceedsWarningThreshold: boolean;
  }>;
};
```

Transport rule:
- the field name is exactly `aggregateMetadata`
- it lives alongside `preferenceSummary` and `reliabilitySummary` in the stored analysis output JSON
- GraphQL must expose `aggregateMetadata` on `AnalysisResult`
- the web operations layer must expose `aggregateMetadata` to the V2 adapter
- V2 gating must read `aggregateMetadata.aggregateEligibility`, not infer aggregate eligibility from summary presence alone

### Required Phase 2/3 Summary Contract
The phase contract must be internally consistent.

Locked rule:
- eligible pooled aggregates must not reach the new `Analysis` page until they emit a syntactically valid contract for both summary sections

That means:
- Phase 2 may add pooled `preferenceSummary` computation first
- but UI enablement for eligible aggregates cannot happen until the aggregate output also includes a valid `reliabilitySummary` shell

The Phase 2 reliability shell must:
- be structurally valid for the existing V2 adapter contract
- include per-model `coverageCount`, `uniqueScenarios`, and explicit unavailable reliability states
- never rely on a missing `reliabilitySummary` object to mean “preference-only eligible”

### Locked UI Gating Contract
Phase 4 must explicitly relax the current blanket aggregate rejection in the V2 adapter.

Required V2 gating rule:
- if `analysis.analysisType !== 'AGGREGATE'`, keep the normal non-aggregate path
- if `analysis.analysisType === 'AGGREGATE'` and `analysis.aggregateMetadata.aggregateEligibility !== 'eligible_same_signature_baseline'`, return `aggregate-analysis`
- if `analysis.analysisType === 'AGGREGATE'` and `analysis.aggregateMetadata.aggregateEligibility === 'eligible_same_signature_baseline'`, continue to section-level summary validation instead of returning `aggregate-analysis`

This change is mandatory for the aggregate feature. The existing aggregate-first block in the current UI consumer plan does not survive this feature unchanged.

## Required Aggregate Computation Changes
### Locked Implementation Boundary
Do not duplicate pooled semantic math in `aggregate.ts`.

The aggregate service may remain responsible for:
- selecting eligible source runs
- collecting pooled transcripts and metadata
- persisting aggregate metadata

But pooled semantic summary computation must be owned by the same semantic logic source as baseline runs.

Preferred implementation:
- extend the Python worker path to accept eligible pooled aggregate transcript sets and emit `preferenceSummary` / `reliabilitySummary`

This plan does not support long-term duplication of:
- orientation normalization
- signed center computation
- preference strength computation
- reliability rollups
across TypeScript and Python.

### Preference
For eligible pooled runs:
- compute pooled `preferenceSummary` directly from pooled transcripts, not from legacy aggregate placeholders
- use the same orientation-corrected logic already used in baseline `analyze_basic.py`

### Reliability
For eligible pooled runs:
- compute pooled `reliabilitySummary` from preserved repeated-trial structure
- reliability must still mean repeatability of same-signature baseline judgments
- if pooled source runs do not yield repeated-trial coverage for a model, that model remains `no-repeat-coverage`

Locked pooled reliability unit:
- compute per-run repeatability first at `runId × modelId × conditionId × variant`
- then combine those per-run repeatability estimates across same-signature runs
- do not erase `runId` before computing repeatability
- do not count across-run observations as repeats

Locked required transcript fields for pooled reliability:
- `runId`
- `modelId`
- baseline `scenarioId` as the canonical condition id for this first implementation
- `sampleIndex`
- normalized score inputs
- orientation metadata

### Important reliability rule
Pooling many single-sample runs does not magically create repeatability.

If a model still has one observation per scenario after pooling at the reliability cell level, then:
- preference may be available
- reliability remains unavailable

## UI/Product Behavior
### New `Analysis` page
For eligible same-signature pooled baseline runs:
- show pooled vignette semantics in `Overview` and `Decisions`
- only show `Stability` if and when pooled reliability semantics are explicitly supported for that aggregate contract version

For ineligible aggregate runs:
- keep the current unsupported aggregate message

### `Analysis (Old V1)`
No behavior change required.

The legacy page can continue to show aggregate descriptive output regardless of whether the pooled run is eligible for new semantics.

### Locked Tab Behavior For Eligible Aggregates
Phase 2:
- `Overview` may show eligible pooled preference
- `Decisions` may show eligible pooled preference and reliability shell output
- `Stability` stays blocked for aggregates in Phase 2
- when pooled reliability is shown for an eligible aggregate with `perModelDrift[*].exceedsWarningThreshold === true`, the reliability area must show a strong drift warning rather than hiding the metric

Phase 3:
- `Stability` may only be enabled if the pooled aggregate contract explicitly supports pooled repeatability drilldown
- otherwise it remains blocked with aggregate-specific copy

### V1/V2 Discovery Rule
If an aggregate becomes eligible for the new `Analysis` page:
- the V1 detail page must expose a link or banner pointing to the V2 detail page
- users must not be stranded on V1 with no route to the preferred semantic view

## Recommended Output States
The aggregate output path should support three product states:

1. `Eligible pooled baseline aggregate`
- `preferenceSummary` present
- `reliabilitySummary` present or partially present per model
- new `Analysis` page works

2. `Eligible pooled preference only`
- `preferenceSummary` present
- `reliabilitySummary` present as a valid shell and model availability may still be `no-repeat-coverage`
- new `Analysis` page shows preference and correctly unavailable reliability

3. `Ineligible aggregate`
- summaries absent
- new `Analysis` page keeps aggregate unsupported state

## Phased Implementation
### Phase 1: Aggregate Eligibility Contract
Add explicit eligibility classification to aggregate generation.

Deliverables:
- classify same-signature baseline-compatible pooled runs
- stop using aggregate rows as an undifferentiated unsupported bucket
- emit a modern `codeVersion` for new aggregate outputs

### Phase 2: Pooled Preference Summary
Add pooled `preferenceSummary` generation for eligible same-signature baseline aggregates.

This is the highest-value first step because it unlocks meaningful reuse of old transcripts even when repeatability remains unavailable.

### Phase 3: Pooled Reliability Summary
Add pooled `reliabilitySummary` generation for eligible same-signature baseline aggregates.

Guardrails:
- only from preserved repeat structure
- no `overall.stdDev` fallback
- preserve model-level `no-repeat-coverage`

### Phase 4: UI Enablement
Update the new `Analysis` page to treat eligible pooled baseline aggregates as normal supported rows rather than blanket `aggregate-analysis` unsupported rows.

Important:
- do not just remove aggregate gating globally
- gate by aggregate eligibility / summary presence, not by `analysisType === 'AGGREGATE'` alone

## Migration / Backfill Policy
Old aggregate rows in the database will still be legacy-shaped.

This plan should not require immediate backfill for all old aggregate rows.

Recommended behavior:
1. Newly recomputed eligible aggregate rows publish the new summaries and aggregate metadata.
2. Old aggregate rows remain unsupported until recomputed.
3. The product must provide at least one real recompute path for legacy aggregates:
   - admin/backfill job, or
   - explicit aggregate recompute UI, or
   - both
4. UI copy should distinguish:
   - unsupported aggregate design
   - legacy aggregate output that predates pooled summaries
   - eligible pooled aggregate now available on V2

Locked migration choice:
- the authoritative first migration mechanism is an admin/backfill job
- an end-user aggregate recompute UI may be added later, but it is not required for the first release of this feature

## Testing Requirements
### Backend
Add tests for:
- same-signature baseline source runs -> eligible pooled preference summary
- same-signature baseline source runs with repeated cells -> eligible pooled reliability summary
- same-signature baseline source runs with no repeat coverage -> preference available, reliability unavailable
- mixed-signature source runs -> summaries suppressed
- assumption/manipulated source runs -> summaries suppressed
- partial-condition source runs -> ineligible
- deleted/missing scenario rows -> ineligible
- missing eligibility metadata -> ineligible
- mixed scoring-contract versions -> ineligible
- same pooled transcript set analyzed as one run vs split across same-signature runs:
  - pooled preference must be partition-invariant
  - pooled reliability must match the declared within-run estimand or remain unavailable
- between-run drift above warning threshold -> pooled reliability visible with drift warning
- repeat coverage below `3` conditions or below `20%` share -> pooled reliability unavailable
- repeat coverage at `3` or `4` conditions -> pooled reliability available with low-coverage caution

### Web
Add tests for:
- eligible aggregate rows render normally in new `Analysis`
- pooled preference with unavailable reliability renders correctly
- ineligible aggregate rows still show unsupported state
- legacy aggregate rows still show the correct legacy/unsupported copy
- eligible aggregate V1 page exposes a link/banner to V2
- eligible aggregate Stability behavior matches the locked phase contract

## Decision Boundaries Before Implementation
Only the following choices remain open before code changes:

1. What user-facing copy distinguishes:
   - eligible pooled aggregate
   - ineligible aggregate
   - legacy aggregate
2. Exact UI styling for:
   - low repeat coverage caution
   - high drift warning

## Interpretation Rules For Warnings
Warnings in this feature are about confidence and interpretation, not about deleting or invalidating the result.

Locked interpretation rules:
1. High within-condition variability is a valid behavioral finding.
   - It can mean the model wavers at difficult or finely balanced conditions.
   - The UI should not treat this as automatically invalid.
2. High cross-run drift is also a valid finding.
   - It means the result moved across same-signature runs.
   - The UI should still show the result and flag it clearly.
3. Low repeat coverage means the reliability estimate is weaker, not meaningless.
   - If it passes the minimum threshold, show it with caution.
4. Warning language must use high-school-level wording and avoid implying that the result is fake, broken, or unusable unless the metric is truly unavailable by contract.

## Recommended Implementation Order
1. Define aggregate eligibility and metadata.
2. Lock the pooled estimands and thresholds before code.
3. Implement pooled `preferenceSummary` and valid `reliabilitySummary` shell via the shared semantic computation path.
4. Ship preference-first aggregate support only after the valid reliability shell exists.
5. Implement full pooled `reliabilitySummary`.
6. Then relax the new UI’s blanket aggregate exclusion in favor of eligibility-aware behavior.

## Verdict
Same-signature pooled baseline runs should be allowed on the new `Analysis` page.

The current exclusion is mostly an implementation/contract limitation, not a fundamental statistical prohibition.

The safe path is:
- enable pooled preference first
- enable pooled reliability only when repeatability is computed from preserved same-signature repeat structure
- keep mixed or manipulated aggregates excluded

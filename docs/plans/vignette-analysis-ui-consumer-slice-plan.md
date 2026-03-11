# Vignette Analysis UI Consumer Slice Plan

## Goal
Ship the first UI consumer migration for the new vignette-analysis semantics that were added in Phase 0.

This slice should make the current analysis UI read explicit backend semantics from:
- `preferenceSummary`
- `reliabilitySummary`

It should remove the most important semantic misreads in the current UI without redesigning the full analysis product yet.

## Scope
This slice is limited to vignette-analysis semantics in the web consumer layer.

In scope:
- consume `preferenceSummary` for preference direction and preference strength
- consume `reliabilitySummary` for baseline noise and baseline reliability
- stop presenting cross-scenario spread as model consistency / reliability
- add explicit unavailable states for older analysis rows that do not have the new summaries
- keep condition heterogeneity and disagreement views available where they already belong

Out of scope:
- any assumptions / order-effect / framing-sensitivity implementation
- any new backend contract work
- any aggregate-analysis redesign
- any broad tab IA redesign beyond what is needed to stop semantic mislabeling
- any attempt to backfill missing summary fields for historical rows in the UI

## Current State
Phase 0 added baseline-gated `preferenceSummary` and `reliabilitySummary` to the analysis contract, but the main web UI still mostly infers semantics from legacy fields.

Current consumer problems:
- `ModelConsistencyChart.tsx` still treats `perModel.overall.stdDev` as a consistency signal when multi-sample variance is not present.
- `OverviewTab.tsx` is still driven by the condition matrix and scenario means rather than the new preference summary contract.
- `DecisionsTab.tsx` still presents reliability through legacy chart wiring.
- `ScenariosTab.tsx` already acts as the conditions / heterogeneity tab and should keep that job.
- `StabilityTab.tsx` already uses `varianceAnalysis` drilldown semantics and should remain the repeatability detail surface.

Grounding files:
- `cloud/apps/web/src/api/operations/analysis.ts`
- `cloud/apps/web/src/components/analysis/AnalysisPanel.tsx`
- `cloud/apps/web/src/components/analysis/ModelConsistencyChart.tsx`
- `cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx`
- `cloud/apps/web/src/components/analysis/tabs/DecisionsTab.tsx`
- `cloud/apps/web/src/components/analysis/tabs/ScenariosTab.tsx`
- `cloud/apps/web/src/components/analysis/tabs/StabilityTab.tsx`

## Product Semantics For This Slice
The UI must preserve the following ownership split:

Vignette Analysis owns:
- preference direction
- preference strength
- baseline noise
- baseline reliability

Assumptions owns:
- framing sensitivity
- order-effect bias diagnostics

The UI must also keep these distinctions explicit:
- baseline reliability is not cross-scenario spread
- baseline noise is not cross-model disagreement
- cross-scenario heterogeneity still belongs in the conditions surface
- repeatability drilldown still belongs in the stability surface
- Overview-level preference language must use `Overall Lean`, not `Favors A/B`, to avoid conflict with the per-condition direction labels already used in `StabilityTab.tsx`

## Consumer Preconditions And Discriminators
This slice must classify summary availability from the data already exposed to the web client:
- `analysis.codeVersion`
- `analysis.analysisType`
- `analysis.preferenceSummary`
- `analysis.reliabilitySummary`
- `isAggregate`

Locked consumer rules:
1. `isAggregate === true` or `analysis.analysisType === 'AGGREGATE'` means aggregate analysis. This is not a legacy row.
2. Use semver comparison, not string comparison, for `analysis.codeVersion`. Do not compare version strings lexicographically.
3. `analysis.codeVersion` earlier than `1.1.1` and both summary objects are `null` means legacy analysis.
4. `analysis.codeVersion` at or after `1.1.1` and both summary objects are `null` means a current run type that does not publish vignette semantics in this surface. The UI must not assume legacy and must not suggest recompute.
5. A present `reliabilitySummary` with `coverageCount === 0` or `baselineReliability === null` for a model means current single-sample / no-repeat coverage for that model, not missing data.
6. If the raw JSON shape of `preferenceSummary.perModel` or `reliabilitySummary.perModel` is invalid at runtime, the UI must fail closed and show an invalid-summary unavailable state. Do not best-effort read unvalidated JSON.
7. If `analysis.codeVersion >= 1.1.1`, `isAggregate !== true`, and both summary objects are `null`, the adapter must classify the row as `suppressed-run-type`. This is the required classification for current rows with intentionally missing vignette semantics.

Note:
- There is no dedicated assumption-run discriminator in the current analysis result shape.
- For this slice, the UI should use the neutral message `This run type does not publish vignette preference/reliability summaries.` for current non-legacy null-summary rows.
- Do not use the word `assumption` in the unavailable message unless a dedicated run-type flag is added later.
- The `isAggregate` prop from `AnalysisDetail.tsx` is tag-derived and may be false for aggregate runs if tags are missing or renamed. The `analysis.analysisType === 'AGGREGATE'` check in the adapter is load-bearing and must not be removed as “redundant”.

## Decisions Locked For This Slice
1. `preferenceSummary` is the source of truth for user-facing preference direction and preference strength.
2. `reliabilitySummary` is the source of truth for user-facing baseline noise and baseline reliability.
3. The UI must not fall back to `perModel.overall.stdDev` for anything labeled consistency, stability, or reliability.
4. If `preferenceSummary` or `reliabilitySummary` is `null`, the UI must show the correct explicit unavailable state instead of silently re-deriving semantics from legacy fields.
5. `ScenariosTab.tsx` remains the home for conditions, cross-scenario heterogeneity, and disagreement views.
6. `StabilityTab.tsx` remains the drilldown surface for repeated-trial variance details from `varianceAnalysis`.
7. `ConditionDecisionMatrix`, `countsByModel`, and `getSensitivity` are removed from `OverviewTab.tsx` in this slice rather than moved. `ScenariosTab.tsx` already owns the condition surface.
8. `ScenarioVarianceChart` is removed from `DecisionsTab.tsx` in this slice to avoid duplicating repeatability drilldown already owned by `StabilityTab.tsx`.
9. `AnalysisPanel.tsx` constructs the semantics adapter once and passes typed semantic props to `OverviewTab.tsx` and `DecisionsTab.tsx`. Tabs must not parse raw summary JSON independently.

## Adapter Contract
The adapter is not a naming convention. It is the consumer contract for this slice.

Required implementation shape:

```ts
type SemanticUnavailableReason =
  | 'legacy-analysis'
  | 'aggregate-analysis'
  | 'suppressed-run-type'
  | 'unknown-analysis-version'
  | 'no-repeat-coverage'
  | 'insufficient-preference-data'
  | 'invalid-summary-shape';

type AvailabilityState =
  | { status: 'available' }
  | { status: 'unavailable'; reason: SemanticUnavailableReason; message: string };

type PreferenceViewModel = {
  modelId: string;
  overallLean: 'A' | 'B' | 'NEUTRAL' | null;
  overallSignedCenter: number | null;
  preferenceStrength: number | null;
  topPrioritizedValues: string[];
  topDeprioritizedValues: string[];
  neutralValues: string[];
  availability: AvailabilityState;
};

type ReliabilityViewModel = {
  modelId: string;
  baselineReliability: number | null;
  baselineNoise: number | null;
  directionalAgreement: number | null;
  neutralShare: number | null;
  coverageCount: number;
  uniqueScenarios: number;
  availability: AvailabilityState;
};

type AnalysisSemanticsView = {
  preference: {
    rowAvailability: AvailabilityState;
    byModel: Record<string, PreferenceViewModel>;
  };
  reliability: {
    rowAvailability: AvailabilityState;
    byModel: Record<string, ReliabilityViewModel>;
    hasAnyAvailableModel: boolean;
    hasMixedAvailability: boolean;
  };
};
```

Client boundary rule:
- In `cloud/apps/web/src/api/operations/analysis.ts`, `preferenceSummary` and `reliabilitySummary` must remain raw at the web boundary for this slice.
- Do not export them to React consumers as trusted structured summary types.
- Preferred shape at the web boundary:

```ts
type RawPreferenceSummary = { perModel: unknown } | null;
type RawReliabilitySummary = { perModel: unknown } | null;
```

- Only the adapter module may turn these raw fields into trusted view models.
- UI components must not import raw summary types directly.

Runtime summary schema that the adapter must validate:

```ts
type RawPreferenceValueStats = {
  winRate: number;
  count?: {
    prioritized: number;
    deprioritized: number;
    neutral: number;
  };
};

type RawModelPreferenceSummary = {
  preferenceDirection: {
    byValue: Record<string, RawPreferenceValueStats>;
    overallLean: 'A' | 'B' | 'NEUTRAL' | null;
    overallSignedCenter: number | null;
  };
  preferenceStrength: number | null;
};

type RawModelReliabilitySummary = {
  baselineNoise: number | null;
  baselineReliability: number | null;
  directionalAgreement: number | null;
  neutralShare: number | null;
  coverageCount: number;
  uniqueScenarios: number;
};
```

Validation rule:
- if any model entry needed by the current view fails this shape, mark that model unavailable with `invalid-summary-shape`
- if the top-level `perModel` object is not a record, mark the whole section unavailable with `invalid-summary-shape`
- canonical model enumeration comes from `analysis.perModel`
- `AnalysisSemanticsView.preference.byModel` and `AnalysisSemanticsView.reliability.byModel` must include every model key from `analysis.perModel`, even when the corresponding summary entry is missing or invalid
- if a summary section is entirely absent, each model in that section receives the section-level unavailable reason
- if a single model entry is missing or malformed inside an otherwise present summary section, only that model gets `invalid-summary-shape`
- if no model in a section is valid, the whole section is unavailable with `invalid-summary-shape`

Adapter requirements:
- It must runtime-validate the raw JSON shape from `preferenceSummary.perModel` and `reliabilitySummary.perModel`.
- Invalid JSON shape must map to `invalid-summary-shape`, not to silent `undefined` behavior.
- `topPrioritizedValues`, `topDeprioritizedValues`, and `neutralValues` are derived from `preferenceDirection.byValue` using:
  - prioritized: `winRate > 0.5 + epsilon`
  - deprioritized: `winRate < 0.5 - epsilon`
  - neutral: `abs(winRate - 0.5) <= epsilon`
- use `epsilon = 0.000001`
- sort value lists by absolute distance from `0.5`, capped at 3 items per list
- `hasMixedAvailability` is true when at least one model has available reliability and at least one model is unavailable for any reason
- if `overallLean` is `null`, render it as `—`
- row order in the Overview table is alphabetical by model name
- tie-breaker inside value lists is alphabetical by value id after absolute-distance sorting
- `topPrioritizedValues` and `topDeprioritizedValues` render raw value ids in this slice; user-facing label mapping is out of scope for this pass

Adapter-only consumption rules:
- `OverviewTab.tsx` must consume only `AnalysisSemanticsView` for vignette preference semantics.
- `DecisionsTab.tsx` must consume only `AnalysisSemanticsView` for vignette reliability semantics.
- `ModelConsistencyChart.tsx` must consume only `AnalysisSemanticsView['reliability']`.
- `OverviewTab.tsx`, `DecisionsTab.tsx`, and `ModelConsistencyChart.tsx` must not read raw `perModel`, `preferenceSummary`, `reliabilitySummary`, or `varianceAnalysis` to derive vignette preference/reliability semantics.
- `ScenariosTab.tsx` and `StabilityTab.tsx` may continue to consume `visualizationData` and `varianceAnalysis` because they own heterogeneity and repeatability drilldown, not top-level vignette semantics.

Locked consumer prop shapes:

```ts
type ModelConsistencyChartProps = {
  reliability: AnalysisSemanticsView['reliability'];
};

type DecisionsTabProps = {
  visualizationData: VisualizationData | null | undefined;
  dimensionLabels?: Record<string, string>;
  semantics: AnalysisSemanticsView;
};

type OverviewTabProps = {
  semantics: AnalysisSemanticsView;
};
```

Removed props:
- `DecisionsTabProps` removes `perModel`
- `DecisionsTabProps` removes `varianceAnalysis`
- `OverviewTabProps` removes `runId`
- `OverviewTabProps` removes `perModel`
- `OverviewTabProps` removes `visualizationData`
- `OverviewTabProps` removes `varianceAnalysis`
- `OverviewTabProps` removes `dimensionLabels`
- `OverviewTabProps` removes `expectedAttributes`

### Unavailable-State Messages
The adapter must centralize these exact user-facing messages:

- `legacy-analysis`: `This analysis predates vignette preference and reliability summaries. Recompute to populate these views.`
- `aggregate-analysis`: `Aggregate analyses do not publish vignette preference or reliability summaries in this slice.`
- `suppressed-run-type`: `This run type does not publish vignette preference or reliability summaries.`
- `unknown-analysis-version`: `This analysis does not expose enough version metadata to classify summary availability.`
- `no-repeat-coverage`: `This model has one sample per scenario, so baseline reliability is unavailable.`
- `insufficient-preference-data`: `Not enough usable scenario means are available to compute preference strength.`
- `invalid-summary-shape`: `Stored analysis summaries are invalid for this UI version.`

## Proposed Implementation Slice

### 1. Add a Small Analysis Semantics Adapter
Create a small web-layer helper that reads the analysis result and exposes a UI-safe semantic model.

Responsibilities:
- unwrap `preferenceSummary` and `reliabilitySummary`
- provide per-model availability checks
- provide explicit reasons for unavailable states
- prevent any fallback to `perModel.overall.stdDev` for reliability
- centralize legacy-row handling so each component does not invent its own behavior
- validate raw JSON before the UI trusts it

Calling convention:
- instantiate the adapter in `AnalysisPanel.tsx`
- pass `semantics: AnalysisSemanticsView` to `OverviewTab.tsx` and `DecisionsTab.tsx`
- do not let child components parse raw `preferenceSummary` / `reliabilitySummary` independently
- pass `reliability={semantics.reliability}` to `ModelConsistencyChart.tsx`
- if `analysis.codeVersion` cannot be parsed as semver, the adapter must use `unknown-analysis-version` instead of guessing `legacy-analysis`

This helper should live close to the analysis UI, not inside generic API code.

### 2. Migrate Reliability Consumption First
Update the existing reliability consumer path before changing broader preference presentation.

Primary target:
- `cloud/apps/web/src/components/analysis/ModelConsistencyChart.tsx`

Required behavior:
- consume `semantics.reliability.byModel`
- use `baselineReliability` as the charted ranking metric
- use `baselineNoise` only as supporting numeric context in tooltip / detail copy
- if a model has no repeat coverage, exclude it from ranked bars and place it in an unavailable list with the `no-repeat-coverage` message
- if the row has no available reliability models, render a single unavailable callout and no chart bars
- remove the semantic fallback to `stats.overall.stdDev`

Exact code-path dispositions:
- the current `variance: stats.overall.stdDev` field must be removed from the chart data model for this component
- the current non-multi-sample line series must be removed
- the current sort fallback `a.multiSampleVariance ?? a.variance` must be removed
- the current title `Model Decision Consistency` must be replaced with reliability language
- the current tooltip line `Std Dev (across scenarios)` must be removed
- the current `CopyVisualButton` label `model consistency chart` must be replaced with reliability language
- the current `Most Consistent` / `Most Variable` insight panels must become `Most Reliable` / `Least Reliable` and must render only from available `baselineReliability` data
- if there are no available reliability models, both insight panels must be hidden rather than populated from any fallback metric
- the current multi-sample scenario teaser section must be removed from this component; repeatability scenario drilldown remains in `StabilityTab.tsx`

Chart semantics for this slice:
- title: `Baseline Reliability by Model`
- x-axis: model
- y-axis: `baselineReliability` on a `0.0` to `1.0` scale, displayed as percent
- primary bar: `baselineReliability`
- no average-decision bars
- no line series
- tooltip support fields:
  - `Baseline Reliability`
  - `Baseline Noise`
  - `Directional Agreement`
  - `Neutral Share`
  - `Repeat Coverage`
- ranking sort: descending `baselineReliability`
- tiebreaker: ascending `baselineNoise`, then model name
- mixed availability treatment: available models render in the chart; unavailable models render in a separate list below with their availability message

Display rules:
- `baselineReliability` renders as percent with `0` decimals
- `baselineNoise` renders with `2` decimals
- `directionalAgreement` and `neutralShare` render as percent with `0` decimals
- `coverageCount` renders as `X / Y scenarios`
- do not add qualitative buckets such as `high`, `medium`, or `low` in this slice

### 3. Rewire Decisions Tab To The New Reliability Semantics
Update:
- `cloud/apps/web/src/components/analysis/tabs/DecisionsTab.tsx`

Required behavior:
- keep decision distribution content if it is still useful
- make the reliability chart consume the new semantic adapter instead of raw `perModel`
- remove `ScenarioVarianceChart` from `DecisionsTab.tsx`
- remove the current whole-tab early return on missing `visualizationData`
- render sections independently:
  - decision distribution section depends on `visualizationData`
  - reliability section depends on `semantics.reliability`
- if both sections are unavailable or absent, render one tab-level unavailable callout instead of two stacked empty sections
- add a short note beneath the reliability section when it renders: `Repeatability details live in Stability.`

The goal is not to redesign the tab yet. The goal is to stop surfacing the wrong metric under a reliability-flavored label and to stop duplicating repeatability drilldown that belongs in `StabilityTab.tsx`.

### 4. Make Overview The First PreferenceSummary Consumer
Update:
- `cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx`

Required behavior:
- replace the current `ConditionDecisionMatrix` body with a summary-first preference table
- surface preference direction from `preferenceSummary`
- surface preference strength from `preferenceSummary`
- if summary data is unavailable, show the correct adapter-provided unavailable message
- do not infer preference direction or strength from `modelScenarioMatrix`
- remove the `Decision Frequency` table, `countsByModel`, and `getSensitivity` from `OverviewTab.tsx`
- do not move `ConditionDecisionMatrix` into `ScenariosTab.tsx` in this slice
- remove the current matrix/visualization empty-state gates; Overview must render from semantic availability, not from `visualizationData`

Locked Overview layout for this slice:
- section title: `Preference Summary`
- body:
  - if `semantics.preference.rowAvailability` is unavailable, show one callout and stop
  - otherwise render a single per-model table
- table columns:
  - `AI`
  - `Overall Lean`
  - `Signed Center`
  - `Preference Strength`
  - `Top Prioritized Values`
  - `Top Deprioritized Values`
- rendering rules:
  - `Overall Lean` uses `A`, `NEUTRAL`, `B`, never `Favors A/B`
  - `Signed Center` renders `overallSignedCenter` to 2 decimals, or `—` if null
  - `Preference Strength` renders `preferenceStrength` to 2 decimals, or `—` plus an inline muted second line reading `Insufficient data` if null
  - `Top Prioritized Values` and `Top Deprioritized Values` render comma-separated top-3 lists from the adapter, or `None`
- explicitly not shown in this slice:
  - `sampleSize`
  - confidence intervals
  - a separate neutral-values column

This is intentionally plain. The first consumer slice needs correct semantics, not a novel visualization.

Explicit tab-level consequence:
- users lose the current Overview transcript drilldowns in this slice
- transcript drilldowns for condition cells remain available through `ScenariosTab.tsx` and `StabilityTab.tsx`

### 5. Leave Conditions And Stability Mostly In Place
Keep:
- `cloud/apps/web/src/components/analysis/tabs/ScenariosTab.tsx`
- `cloud/apps/web/src/components/analysis/tabs/StabilityTab.tsx`

Expected semantics:
- `ScenariosTab.tsx` continues to show condition effects, heterogeneity, and disagreement
- `StabilityTab.tsx` continues to show variance-analysis drilldown

Only make changes in these files if needed to align labels.

Locked dispositions:
- `ScenariosTab.tsx` keeps the existing condition-analysis surfaces and becomes the only home for cross-scenario matrix-style interpretation in this slice.
- `StabilityTab.tsx` keeps per-condition repeatability direction labels such as `Favors A` / `Favors B`.
- `OverviewTab.tsx` must not reuse `Favors A` / `Favors B` language; it uses `Overall Lean` to avoid semantic collision with `StabilityTab.tsx`.
- `OverviewTab.tsx` no longer receives `visualizationData` or `varianceAnalysis`.
- `ScenariosTab.tsx` becomes the only tab in this slice that depends on `modelScenarioMatrix` for condition-level interpretation.
- aggregate handling:
  - `ScenariosTab.tsx` remains accessible for aggregate rows and may continue to show aggregate condition/hyperogeneity artifacts
  - `StabilityTab.tsx` is gated for aggregate rows with the `aggregate-analysis` callout in this slice, because aggregate variance output must not be presented as baseline repeatability

### 6. Minimal Panel Wiring
Update:
- `cloud/apps/web/src/components/analysis/AnalysisPanel.tsx`

Required behavior:
- resolve `isAggregateAnalysis = isAggregate || analysis.analysisType === 'AGGREGATE'` once in `AnalysisPanel.tsx`
- instantiate the adapter once from `analysis` plus `isAggregateAnalysis`
- pass `semantics` to `OverviewTab.tsx`
- pass `semantics` to `DecisionsTab.tsx`
- keep compatibility with current loading and empty states
- do not redesign overall panel structure in this slice

Prop changes required:
- `OverviewTabProps` becomes `semantics: AnalysisSemanticsView` only
- `DecisionsTabProps` becomes `visualizationData`, `dimensionLabels`, and `semantics: AnalysisSemanticsView`
- `ModelConsistencyChartProps` becomes `reliability: AnalysisSemanticsView['reliability']`
- `AnalysisPanel.tsx` must not pass raw summary JSON to child tabs
- `AnalysisPanel.tsx` must use `isAggregateAnalysis` consistently for panel chrome, recompute visibility, and tab behavior

Section-level availability rules:
- `OverviewTab.tsx` renders only from `semantics.preference`
- `DecisionsTab.tsx` renders the decision distribution section only when `visualizationData` is present
- `DecisionsTab.tsx` renders the reliability section from `semantics.reliability` even when `visualizationData` is absent
- `ScenariosTab.tsx` and `StabilityTab.tsx` keep their current artifact dependencies

## Legacy And Migration Behavior
Historical rows will exist without `preferenceSummary` and `reliabilitySummary`.

For this slice, the UI policy is:
- do not recompute from legacy fields
- do not silently approximate
- show explicit unavailable messaging based on the adapter reason
- only show a recompute prompt for `legacy-analysis`

This behavior is intentional. It avoids presenting false confidence from semantically mismatched legacy metrics.

Run-level unavailable mapping:
- legacy row: recompute prompt
- aggregate row: no recompute prompt
- current suppressed run type: no recompute prompt

Aggregate policy for this slice:
- `OverviewTab.tsx` renders the `aggregate-analysis` callout and no preference table
- `DecisionsTab.tsx` renders the `aggregate-analysis` callout for the reliability section
- `ScenariosTab.tsx` remains accessible
- `StabilityTab.tsx` renders the `aggregate-analysis` callout and no repeatability matrix
- do not attempt to reuse aggregate `perModel.overall` values for vignette preference or reliability semantics

Model-level unavailable mapping:
- no-repeat-coverage: no recompute prompt, because recomputing the same single-sample run will not create repeatability data
- insufficient-preference-data: show `—` in the affected field and the model-level note
- invalid-summary-shape: block the affected surface and show the invalid-summary message

Panel-level recompute policy:
- the global `Recompute` button remains visible for non-aggregate runs
- for `legacy-analysis`, section copy may recommend recompute
- for `suppressed-run-type`, section copy must explicitly say that recomputing this same run will not populate the section
- for `no-repeat-coverage`, section copy must explicitly say that recomputing without additional repeat samples will not populate the section
- for aggregate rows, keep the existing no-recompute behavior

## Non-Goals And Guardrails
- Do not move framing sensitivity or order-effect concepts into Vignette Analysis.
- Do not use `varianceAnalysis` as a substitute for preference direction.
- Do not use `mostContestedScenarios` as a reliability surface.
- Do not use `perModel.overall.stdDev` as a hidden fallback anywhere in the consumer path.
- Do not redesign aggregate-run behavior in this slice.
- Do not compact or rewrite the entire analysis UI first.
- Do not rename `ModelConsistencyChart` in this slice. The component/file name is retained as historical internal naming only; user-facing copy and tests must use reliability language.

## Acceptance Criteria
1. No UI path labels `perModel.overall.stdDev` or any cross-scenario spread as reliability, consistency, or stability.
2. `ModelConsistencyChart.tsx` either consumes validated `reliabilitySummary` data or shows an explicit unavailable state with no ranked fallback panels.
3. `OverviewTab.tsx` reads preference direction and preference strength from `preferenceSummary`, not from matrix inference.
4. Legacy rows, aggregate rows, current suppressed-run-type rows, and single-sample current rows display different unavailable states with the correct message.
5. `ScenariosTab.tsx` still exposes conditions / heterogeneity / disagreement views.
6. `StabilityTab.tsx` still exposes repeatability drilldown from `varianceAnalysis`.
7. No assumptions-language or order-effect language is introduced into the vignette-analysis UI.
8. `OverviewTab.tsx` no longer renders `Decision Frequency`, sensitivity columns, or `ConditionDecisionMatrix`.
9. `DecisionsTab.tsx` no longer renders `ScenarioVarianceChart`.
10. `OverviewTab.tsx` and the reliability section of `DecisionsTab.tsx` still render when `visualizationData` is absent but semantic summaries are present.
11. Aggregate runs show explicit unsupported messaging in Overview/Decisions instead of legacy-gap messaging or zero-derived semantics.
12. Aggregate rows use one canonical aggregate flag across page chrome, tabs, and unavailable copy.
13. `StabilityTab.tsx` does not present aggregate variance as baseline repeatability.

## Implementation Order
1. Add adapter unit tests for legacy, aggregate, suppressed-run-type, single-sample, mixed-availability, and invalid-summary-shape cases.
2. Add the semantic adapter/helper and lock its null / legacy behavior.
3. Remove only assertions and test blocks that directly encode deleted behavior; do not delete whole component test files before replacement coverage exists.
4. Update `ModelConsistencyChart.tsx` to remove the bad fallback and consume reliability semantics.
5. Rewire `DecisionsTab.tsx` to the new reliability path.
6. Update `OverviewTab.tsx` to consume `preferenceSummary`.
7. Make only the minimum pass-through changes in `AnalysisPanel.tsx`.
8. Adjust labels in `ScenariosTab.tsx` / `StabilityTab.tsx` only if required for semantic consistency.
9. Add focused React tests before or alongside each consumer change.

## Test Plan
Add or update component/integration coverage for:
- a current analysis row with populated `preferenceSummary` and `reliabilitySummary`
- a current single-sample row where reliability is intentionally unavailable
- a legacy row where both summary sections are `null`
- a current suppressed-run-type row where both summary sections are `null` but no recompute prompt should appear
- an aggregate row where summaries are unavailable but the message is not the legacy recompute prompt
- a multi-model row where some models have reliability coverage and some do not
- an invalid raw JSON summary payload that must fail closed in the adapter

Tests that must be rewritten or deleted:
- `cloud/apps/web/tests/components/analysis/AnalysisPanel.test.tsx` assertions for:
  - `Decision Frequency`
  - `Condition Decisions`
  - any default-tab assumptions tied to matrix-driven Overview
- `cloud/apps/web/tests/components/analysis/ModelConsistencyChart.test.tsx` assertions for:
  - `Model Decision Consistency`
  - `Most Consistent`
  - `Most Variable`
  - multi-sample scenario teaser copy in this component
- the entire `describe('multi-sample variance', ...)` block in `cloud/apps/web/tests/components/analysis/ModelConsistencyChart.test.tsx`
- `cloud/apps/web/tests/components/analysis/OverviewTab.test.tsx` assertions for:
  - condition-bucket counts
  - matrix-driven weighted means
  - sensitivity/matrix behavior in Overview

Assertions to lock:
- no `overall.stdDev` fallback in reliability rendering, sorting, tooltip copy, title copy, copy-button label, or insight panels
- single-sample runs show preference as available and reliability as unavailable
- legacy rows show the recompute prompt
- suppressed-run-type rows do not show the recompute prompt
- aggregate rows do not show the recompute prompt
- mixed-coverage rows render available models in the reliability chart and unavailable models in a separate list
- preference summary content is sourced from validated `preferenceSummary`
- `OverviewTab.tsx` no longer renders the prior condition-matrix-derived decision frequency or sensitivity view
- `DecisionsTab.tsx` no longer duplicates repeatability drilldown already present in `StabilityTab.tsx`
- `OverviewTab.tsx` does not depend on `visualizationData` or `varianceAnalysis`
- `DecisionsTab.tsx` reliability rendering does not depend on `visualizationData`

## Risks
- The largest product risk is a perceived regression when legacy rows no longer show a pseudo-consistency number. This is acceptable; the previous number was semantically wrong.
- The largest implementation risk is scattering null-handling across multiple components. The semantic adapter is intended to prevent that.
- The largest methodology risk is accidentally preserving a hidden legacy fallback in a tooltip, summary card, or ranking helper.

## Done Means
This slice is done when the existing UI stops mislabeling heterogeneity as reliability and starts consuming the new Phase 0 summary contract for the first user-facing surfaces, without dragging assumptions semantics into vignette analysis.

# Feature Specification: Multi-Sample Runs with Variance Analysis

**Feature Branch**: `feature/023-multi-sample-variance`
**Created**: 2025-01-14
**Status**: Draft
**GitHub Issue**: [#132](https://github.com/chrislawcodes/valuerank/issues/132)
**Input**: Enable runs to do N requests per scenario/AI mix (e.g., 10 iterations per model-scenario pair), then show error bars in the analysis tab to visualize response variance across identical inputs.

---

## Overview

AI models exhibit stochastic behavior - given the same prompt, they may produce different responses across multiple requests. This feature adds multi-sample support to evaluation runs, allowing researchers to measure response variance and compute confidence intervals. By running each scenario-model combination N times, users can determine whether observed value priorities are consistent or highly variable, providing a more statistically robust understanding of model behavior.

---

## User Scenarios & Testing

### User Story 1 - Configure Sample Count When Starting Run (Priority: P1)

As a researcher starting an evaluation run, I need to specify how many times each scenario-model combination should be probed so that I can collect sufficient data to measure response variance.

**Why this priority**: Core enabler for all variance features. Without configurable sample count, no multi-sample data can be collected.

**Independent Test**: Start a run with sample count = 3, verify that 3 transcripts are created per scenario-model combination.

**Acceptance Scenarios**:

1. **Given** I am on the Start Run page with a definition selected, **When** I look for sample configuration options, **Then** I see a "Samples per scenario" input field with a default value of 1.

2. **Given** I set "Samples per scenario" to 5 with 10 scenarios and 2 models selected, **When** I view the estimated job count, **Then** it shows 100 total jobs (10 scenarios × 2 models × 5 samples).

3. **Given** I start a run with samples = 3, **When** the run completes and I examine the transcripts, **Then** each scenario-model pair has exactly 3 transcripts with distinct sample indices.

4. **Given** I start two runs with the same definition and samplePercentage=10 but different samplesPerScenario (5 vs 10), **When** both runs complete, **Then** both runs selected the exact same scenarios (deterministic sampling is independent of sample count).

---

### User Story 2 - View Variance in Analysis Results (Priority: P1)

As a researcher viewing completed run analysis, I need to see variance metrics and error bars for model scores so that I can understand how consistent each model's value priorities are.

**Why this priority**: The primary value proposition - users need to visualize variance to make meaningful comparisons. Without this, multi-sample data has no actionable insight.

**Independent Test**: Complete a multi-sample run, view Analysis tab, verify error bars are displayed on model comparison charts.

**Acceptance Scenarios**:

1. **Given** a completed run with 5 samples per scenario, **When** I view the Analysis tab's model comparison section, **Then** each model's average score is displayed with error bars showing standard deviation or confidence interval.

2. **Given** multi-sample analysis results, **When** I hover over a model's score bar, **Then** I see a tooltip showing: mean score, standard deviation, min, max, and sample count.

3. **Given** a run with only 1 sample per scenario (default), **When** I view the Analysis tab, **Then** no error bars are shown (no variance data available) and the display matches current behavior.

---

### User Story 3 - Track Progress for Multi-Sample Runs (Priority: P1)

As a researcher monitoring a running evaluation, I need to see accurate progress that reflects all samples so that I understand how long the run will take.

**Why this priority**: Essential for user experience during long-running multi-sample evaluations. Without accurate progress, users cannot estimate completion time.

**Independent Test**: Start a multi-sample run, verify progress bar reflects total job count including all samples.

**Acceptance Scenarios**:

1. **Given** I start a run with 10 scenarios, 2 models, and 5 samples, **When** I view the run progress, **Then** the total job count shows 100 (not 20).

2. **Given** a multi-sample run in progress with 50/100 jobs complete, **When** I view the progress display, **Then** it shows "50 of 100 probes completed" (50%).

3. **Given** a multi-sample run, **When** I view the model breakdown in progress, **Then** each model shows its own progress including all samples (e.g., "Model A: 25/50 samples complete").

---

### User Story 4 - View Per-Scenario Variance (Priority: P2)

As a researcher analyzing results, I need to see which scenarios produce the most variable responses so that I can identify where models are least consistent.

**Why this priority**: Important for deeper analysis but not required for basic variance visualization. Helps identify scenarios that may need refinement.

**Independent Test**: View analysis results, see a list of scenarios ranked by response variance.

**Acceptance Scenarios**:

1. **Given** a completed multi-sample run, **When** I view the "Most Variable Scenarios" section, **Then** I see scenarios ranked by variance (standard deviation across samples).

2. **Given** a scenario with high variance, **When** I click to expand details, **Then** I see the distribution of scores across all samples for each model.

3. **Given** the scenario variance view, **When** I compare two models, **Then** I can see which model is more consistent on specific scenarios.

---

### User Story 5 - Compare Variance Across Models (Priority: P2)

As a researcher, I need to understand which models are more consistent in their value priorities so that I can assess reliability alongside accuracy.

**Why this priority**: Adds analytical depth beyond average scores. A model with lower variance may be preferable even if its average is similar to a higher-variance model.

**Independent Test**: View model comparison, see variance metrics alongside average scores.

**Acceptance Scenarios**:

1. **Given** a multi-sample analysis, **When** I view the model comparison table, **Then** I see a "Consistency" or "Variance" column showing each model's overall score variability.

2. **Given** two models with similar average scores but different variance, **When** I compare them visually, **Then** error bars clearly show which model is more consistent.

3. **Given** the analysis view, **When** I sort models, **Then** I can sort by average score OR by variance/consistency.

---

### User Story 6 - Export Multi-Sample Data (Priority: P2)

As a researcher, I need to export all sample data for external statistical analysis so that I can perform custom analyses beyond the built-in visualizations.

**Why this priority**: Power users need raw data access. The built-in analysis may not cover all statistical needs.

**Independent Test**: Export CSV from multi-sample run, verify all samples are included with sample index column.

**Acceptance Scenarios**:

1. **Given** a completed multi-sample run, **When** I export transcripts as CSV, **Then** each row includes a "sample_index" column (0, 1, 2, ...).

2. **Given** exported multi-sample data, **When** I group by scenario-model pair, **Then** I see N rows per combination (where N = samples per scenario).

3. **Given** the JSON export option, **When** I export analysis results, **Then** the output includes variance statistics (stdDev, confidenceInterval, sampleCount) per model.

---

### User Story 7 - Set Default Sample Count (Priority: P3)

As a power user, I want to configure a default sample count for new runs so that I don't have to set it manually each time.

**Why this priority**: Convenience for users who consistently use multi-sample runs. Not essential for feature to be usable.

**Independent Test**: Set default in settings, start new run, verify default is pre-populated.

**Acceptance Scenarios**:

1. **Given** I navigate to settings, **When** I look for run defaults, **Then** I see an option to set default "Samples per scenario" (1-100).

2. **Given** I set default samples to 5, **When** I start a new run, **Then** the samples field is pre-populated with 5.

3. **Given** a default is set, **When** I start a run and change samples to 10, **Then** only this run uses 10 (default is not changed).

---

### User Story 8 - View Sample-Level Transcripts (Priority: P3)

As a researcher debugging unexpected variance, I need to view individual sample transcripts to understand what drove different responses.

**Why this priority**: Diagnostic capability for edge cases. Most users will rely on aggregate statistics.

**Independent Test**: Navigate to a specific scenario-model pair, view all sample transcripts individually.

**Acceptance Scenarios**:

1. **Given** a completed multi-sample run, **When** I view transcript details for a scenario-model pair, **Then** I see tabs or a list showing all N samples.

2. **Given** sample transcripts for a high-variance scenario, **When** I compare sample 1 vs sample 3, **Then** I can see the full dialogue for each and identify where they diverged.

3. **Given** the transcript list view, **When** I filter by scenario, **Then** I see all samples for that scenario grouped by model.

---

## Edge Cases

- **Sample count of 1**: System behaves identically to current (no variance calculations, no error bars).
- **Partial completion**: If some samples fail, variance is computed on available samples with a warning.
- **All samples identical**: If all N samples produce the same score, variance is 0 and error bars collapse to a point.
- **Single scenario**: Multi-sample still works; variance is computed across samples for that one scenario.
- **Mixed sample counts**: Not supported in initial implementation - all scenario-model pairs get the same sample count.
- **Cost explosion**: With high sample counts (e.g., 100) and many models/scenarios, costs scale linearly. UI should show estimated cost before starting.
- **Temperature setting**: Multi-sample is most meaningful with temperature > 0. If temperature = 0, responses may be deterministic and variance artificially low.
- **Existing runs**: Runs created before this feature have implicit sample count of 1. Analysis displays normally without variance.
- **Combined sampling + multi-samples**: The deterministic scenario selection (via `samplePercentage`) is independent of `samplesPerScenario`. Running 10% sampling at 5 samples/scenario selects the exact same scenarios as 10% at 10 samples/scenario. This allows users to collect N× data on a consistent subset of the value space across runs.

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST accept a `samplesPerScenario` parameter (integer, 1-100) when starting a run. Default: 1.
- **FR-002**: System MUST create N separate transcripts per scenario-model combination, where N = samplesPerScenario.
- **FR-003**: Each transcript MUST store a `sampleIndex` field (0 to N-1) to identify its position in the sample set.
- **FR-004**: Run progress tracking MUST reflect total jobs including all samples (scenarios × models × samples).
- **FR-005**: Analysis MUST compute variance statistics (mean, standard deviation, min, max, confidence interval) across samples.
- **FR-006**: Analysis tab MUST display error bars on model score charts when samplesPerScenario > 1.
- **FR-007**: Tooltips on score visualizations MUST show variance details (mean, stdDev, range, sample count).
- **FR-008**: System MUST support computing per-scenario variance to identify inconsistent scenarios.
- **FR-009**: CSV export MUST include a `sample_index` column for multi-sample runs.
- **FR-010**: JSON analysis export MUST include variance statistics in the output structure.
- **FR-011**: System SHOULD display estimated cost that accounts for sample count before run starts.
- **FR-012**: Run configuration stored in `Run.config` MUST include the `samplesPerScenario` value.
- **FR-013**: System MUST handle partial sample completion gracefully, computing variance on available data.
- **FR-014**: Transcript queries MUST support filtering by sampleIndex for diagnostic access.

---

## Success Criteria

- **SC-001**: Users can configure sample count in under 5 seconds (single field input).
- **SC-002**: Error bars render within 500ms of analysis load for runs with up to 1000 transcripts.
- **SC-003**: Variance calculations match industry-standard formulas (population or sample standard deviation, documented in code).
- **SC-004**: Multi-sample runs with 10 samples complete within 10x the time of single-sample runs (linear scaling, no overhead).
- **SC-005**: Exported data can be imported into statistical software (R, Python) without transformation.
- **SC-006**: Users report increased confidence in model comparisons due to visible variance information (qualitative feedback).

---

## Key Entities

### Modified Entities

**Run.config** (JSONB field):
```typescript
{
  models: string[];
  samplePercentage: number;
  sampleSeed?: number;
  samplesPerScenario: number;  // NEW: default 1
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  definitionSnapshot: unknown;
  estimatedCosts: { ... };
}
```

**Transcript** (new field):
```typescript
{
  // ... existing fields
  sampleIndex: number;  // NEW: 0 to N-1, default 0
}
```

**AnalysisResult.output** (new variance fields):
```typescript
{
  perModel: Record<string, {
    // ... existing fields
    mean: number;           // NEW: average across samples
    stdDev: number;         // NEW: standard deviation
    variance: number;       // NEW: variance (stdDev^2)
    confidenceInterval: {   // NEW: 95% CI
      lower: number;
      upper: number;
    };
    sampleCount: number;    // NEW: N used in calculations
    min: number;            // NEW: minimum score
    max: number;            // NEW: maximum score
  }>;

  scenarioVariance: Array<{  // NEW section
    scenarioId: string;
    scenarioName: string;
    overallVariance: number;
    perModelVariance: Record<string, number>;
  }>;

  // ... existing fields
}
```

---

## Assumptions

1. **Temperature > 0**: Multi-sample analysis assumes non-deterministic model behavior. If temperature = 0, users are warned that variance may be artificially low.
2. **Same prompt**: All samples for a scenario-model pair use identical prompts. No A/B variations within a sample set.
3. **Independent samples**: Each sample is an independent API call. No caching or reuse of responses.
4. **Reasonable sample counts**: Initial implementation optimized for 1-20 samples. Higher counts (up to 100) supported but may have performance implications.
5. **Existing deterministic seeding**: The current deterministic scenario sampling (DJB2 hash) applies to which scenarios are selected, not which samples are generated.
6. **Linear cost scaling**: Cost estimate = base estimate × samplesPerScenario. No bulk discounts.
7. **Summarization per transcript**: Each sample transcript is summarized independently by the judge model.
8. **Analysis aggregation**: The analyze_basic worker aggregates scores across samples before computing win rates and other metrics.

---

## Out of Scope

- **Adaptive sampling**: Automatically adjusting sample count based on observed variance (future enhancement).
- **Per-scenario sample counts**: Different N for different scenarios (adds complexity, limited value).
- **Temperature variation**: Testing same scenario with different temperature settings (separate feature).
- **Time-series analysis**: Tracking how model responses change over time for same prompt (different use case).
- **Statistical significance testing**: Formal hypothesis testing between models (enhancement for later).


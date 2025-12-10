# Feature Specification: Stage 11 - Analysis System & Visualizations

> **Feature #008** | Branch: `stage-11-analysis`
> **Created**: 2025-12-07
> **Status**: Draft
> **Dependencies**: Stage 9 (Run Execution) - Complete

## Overview

Implement automated analysis pipeline with visualizations to answer key questions about AI behavior. This stage adds automatic Tier 1 analysis on run completion, computes basic statistics with confidence intervals, and provides visualizations for score distributions, variable impact, and model comparison.

**Input Description**: Auto-analysis trigger on run completion, basic stats computation (win rates, per-model scores), confidence intervals with Wilson score, score distribution visualization (how do AIs tend to answer?), variable impact analysis (which dimensions drive variance?), model comparison (which AIs behave differently?), analysis versioning and caching (input_hash), results viewer UI (charts, tables), statistical method documentation.

**Phase 3 Milestone**: This stage is the first part of Phase 3 - automated analysis and visualizations become available to the team.

---

## User Stories & Testing

### User Story 1 - View Automated Analysis on Run Completion (Priority: P1)

As a researcher, I need to see automated analysis results when my run completes so that I can immediately understand AI behavior patterns without manual computation.

**Why this priority**: Core functionality - the primary value of this stage is automatic analysis. Without this, researchers must export CSV and compute statistics manually, which is slow and error-prone.

**Independent Test**: Complete a run with multiple models, verify analysis is automatically generated, verify results appear in the run detail page within seconds of completion.

**Acceptance Scenarios**:

1. **Given** a run completes all tasks, **When** I view the run detail page, **Then** I see an "Analysis" section with computed statistics
2. **Given** analysis is computing, **When** I view the run, **Then** I see a loading indicator for the analysis section
3. **Given** analysis has completed, **When** I view basic stats, **Then** I see per-model win rates for each of the 14 values
4. **Given** analysis results exist, **When** I examine the data, **Then** I see mean, standard deviation, min, and max scores per model
5. **Given** analysis is displayed, **When** I look at the results, **Then** I see 95% confidence intervals for all point estimates
6. **Given** a run had some failed transcripts, **When** I view analysis, **Then** analysis is computed on successful transcripts with a note about excluded failures

---

### User Story 2 - View Score Distribution Visualization (Priority: P1)

As a researcher, I need to see how AI models tend to answer (score distributions) so that I can understand overall patterns and identify if models cluster around certain behaviors.

**Why this priority**: Core functionality - answers the fundamental question "How do AIs tend to answer?" which is essential for understanding model behavior patterns.

**Independent Test**: View a completed run's analysis, verify histogram/distribution chart is displayed, verify chart shows meaningful distribution of responses across models.

**Acceptance Scenarios**:

1. **Given** I am viewing run analysis, **When** I look for visualizations, **Then** I see a score distribution chart
2. **Given** the distribution chart is displayed, **When** I examine it, **Then** I see how responses are distributed across score ranges (e.g., histogram bins)
3. **Given** multiple models were run, **When** I view the distribution, **Then** I can see separate distributions per model (overlaid or side-by-side)
4. **Given** I hover over a chart element, **When** the tooltip appears, **Then** I see exact counts and percentages
5. **Given** a specific value is selected, **When** the chart updates, **Then** I see the distribution for that value only
6. **Given** the chart is displayed, **When** I look for axis labels, **Then** I see clear labels and a legend explaining what's shown

---

### User Story 3 - View Variable Impact Analysis (Priority: P1)

As a researcher, I need to see which scenario dimensions drive variance in AI responses so that I can understand what factors influence AI decision-making.

**Why this priority**: Core functionality - answers "What causes scores to change?" which is essential for designing effective experiments and understanding which variables matter.

**Independent Test**: View a completed run's analysis, verify variable impact section shows dimensions ranked by effect, verify coefficients or effect sizes are displayed.

**Acceptance Scenarios**:

1. **Given** I am viewing run analysis, **When** I look for variable impact, **Then** I see a section showing dimension influence on scores
2. **Given** the variable impact is displayed, **When** I examine it, **Then** I see dimensions ranked by their effect on variance
3. **Given** impact analysis exists, **When** I view the details, **Then** I see effect sizes (beta coefficients or similar) for each dimension
4. **Given** a dimension has high impact, **When** it's displayed, **Then** it's visually highlighted (size, color, position)
5. **Given** the analysis includes multiple dimensions, **When** I view the summary, **Then** I see the percentage of variance explained (R-squared or similar)
6. **Given** dimensions have different value types (categorical, numeric), **When** analysis is computed, **Then** appropriate methods are used for each type

---

### User Story 4 - Compare Models (Priority: P1)

As a researcher, I need to see which AI models behave differently from each other so that I can identify outliers and understand model-specific patterns.

**Why this priority**: Core functionality - answers "Which AIs behave differently?" which is essential for model comparison and identifying interesting divergence.

**Independent Test**: View a completed run's analysis with multiple models, verify model comparison section exists, verify pairwise differences are shown.

**Acceptance Scenarios**:

1. **Given** I am viewing run analysis with multiple models, **When** I look for comparisons, **Then** I see a model comparison section
2. **Given** model comparison is displayed, **When** I examine it, **Then** I see inter-model agreement scores (correlation or similar)
3. **Given** pairwise comparisons exist, **When** I view them, **Then** I see which model pairs agree/disagree most
4. **Given** an outlier model exists, **When** I view comparisons, **Then** the outlier is visually highlighted
5. **Given** comparison data is shown, **When** I examine the statistics, **Then** I see effect sizes (Cohen's d) for pairwise comparisons
6. **Given** multiple comparisons are made, **When** I view significance, **Then** p-values are corrected for multiple testing (Holm-Bonferroni)

---

### User Story 5 - View Statistical Method Documentation (Priority: P2)

As a researcher, I need to see which statistical methods were used for analysis so that I can trust the results and reproduce them if needed.

**Why this priority**: Important for scientific rigor - researchers need to know how results were computed to cite them properly and verify reproducibility.

**Independent Test**: View analysis results, verify methods section exists, verify it documents tests used, alpha levels, and correction methods.

**Acceptance Scenarios**:

1. **Given** I am viewing analysis results, **When** I look for methodology, **Then** I see a "Methods Used" section or expandable details
2. **Given** methods are documented, **When** I examine them, **Then** I see the specific tests used (e.g., Mann-Whitney U, Spearman's rho)
3. **Given** confidence intervals are shown, **When** I check methodology, **Then** I see the interval method (e.g., Wilson score)
4. **Given** p-values are displayed, **When** I check methodology, **Then** I see the correction method (e.g., Holm-Bonferroni) and alpha level
5. **Given** analysis was versioned, **When** I view methodology, **Then** I see the analysis code version that produced results
6. **Given** any assumptions were violated, **When** I view results, **Then** I see warnings (e.g., "Small sample size", "Non-normal distribution")

---

### User Story 6 - View Analysis with Caching (Priority: P2)

As a researcher, I need analysis results to be cached so that I don't wait for recomputation every time I view the same run.

**Why this priority**: Important for UX - repeated analysis computation wastes time and resources. Caching makes the UI feel responsive.

**Independent Test**: View a run's analysis twice, verify second view loads instantly from cache, verify cache invalidates when new transcripts are added.

**Acceptance Scenarios**:

1. **Given** I view a run's analysis, **When** it has been computed before, **Then** results appear immediately (from cache)
2. **Given** analysis is cached, **When** I check the display, **Then** I see "Last computed at [timestamp]"
3. **Given** new transcripts are added to a run, **When** I view analysis, **Then** the cache is invalidated and analysis recomputes
4. **Given** I want fresh results, **When** I click "Recompute Analysis", **Then** analysis runs again and updates results
5. **Given** cache is used, **When** I verify integrity, **Then** the system uses input_hash to detect if transcripts changed
6. **Given** analysis is being recomputed, **When** I view the page, **Then** I see a loading state with the previous cached results still visible

---

### User Story 7 - Filter Analysis by Model or Value (Priority: P2)

As a researcher, I need to filter analysis results by specific models or values so that I can focus on areas of interest.

**Why this priority**: Important for usability - when runs have many models or analyzing specific values, filtering reduces cognitive load and helps focus investigation.

**Independent Test**: View analysis, apply a model filter, verify charts and tables update to show only filtered data.

**Acceptance Scenarios**:

1. **Given** I am viewing analysis, **When** I see filter controls, **Then** I can filter by model
2. **Given** I apply a model filter, **When** visualizations update, **Then** they show only selected models
3. **Given** I am viewing analysis, **When** I see filter controls, **Then** I can filter by specific value (e.g., Physical_Safety)
4. **Given** I apply a value filter, **When** charts update, **Then** they show distributions only for that value
5. **Given** filters are applied, **When** I view statistics, **Then** they reflect only the filtered subset
6. **Given** filters are active, **When** I want to reset, **Then** I can clear all filters with one click

---

### User Story 8 - View Most Contested Scenarios (Priority: P3)

As a researcher, I need to see which scenarios had the highest disagreement across models so that I can identify interesting edge cases worth investigating.

**Why this priority**: Nice to have - provides valuable insight but researchers can identify contested scenarios manually from the data initially.

**Independent Test**: View analysis, find contested scenarios section, verify scenarios are ranked by variance or disagreement score.

**Acceptance Scenarios**:

1. **Given** I am viewing analysis, **When** I look for contested scenarios, **Then** I see a "Most Contested" section
2. **Given** contested scenarios are listed, **When** I examine them, **Then** I see scenario IDs ranked by cross-model disagreement
3. **Given** a contested scenario is displayed, **When** I click it, **Then** I can navigate to view its transcripts
4. **Given** the list exists, **When** I check the methodology, **Then** I see how "contested" is defined (e.g., max variance across models)
5. **Given** scenarios are ranked, **When** I view the list, **Then** I see the variance or disagreement score for each
6. **Given** I configure limit, **When** I set "Top N", **Then** I can control how many contested scenarios are shown (default 5)

---

## Edge Cases

### Analysis Computation Edge Cases
- **Run with single model**: Show statistics but skip comparative analysis (no pairwise comparisons)
- **Run with single transcript**: Show warning about insufficient data for statistical inference
- **All transcripts failed**: Show "Analysis unavailable - no successful transcripts" message
- **Partial failures**: Compute on successful transcripts, note sample size reduction
- **Very large run (10K+ transcripts)**: Compute asynchronously, show progress indicator
- **Analysis computation fails**: Log error, show "Analysis failed" with retry option

### Visualization Edge Cases
- **No variance in data**: All models gave same scores - show message, not empty chart
- **Extreme outliers**: Handle visualization scale appropriately (don't compress majority of data)
- **Missing dimension values**: Exclude from variable impact, note in methodology
- **Too many models (10+)**: Use scrollable legend or pagination in charts
- **Too many dimensions (20+)**: Show top 10 by impact, allow expanding to see all

### Caching Edge Cases
- **Cache corruption**: Detect via hash mismatch, recompute automatically
- **Concurrent analysis requests**: Deduplicate, return same result to all requesters
- **Cache eviction**: Old analysis results may be evicted; recompute on access
- **Analysis code version change**: Invalidate cache, recompute with new version

### Statistical Edge Cases
- **Non-normal distribution**: Use non-parametric tests, document in methodology
- **Small sample size (n < 10)**: Show warning, use bootstrap methods or wider CIs
- **Tied rankings**: Handle appropriately in rank-based tests
- **Multiple comparison inflation**: Always apply correction, default Holm-Bonferroni
- **Dimension with single value**: Exclude from variable impact (no variance to explain)

---

## Functional Requirements

### Auto-Analysis Trigger
- **FR-001**: System MUST trigger Tier 1 analysis automatically when a run completes
- **FR-002**: System MUST queue an `analyze:basic` job within 5 seconds of run completion
- **FR-003**: System MUST store analysis results in the `analysis_results` table
- **FR-004**: System MUST update run record with analysis status (pending, computing, completed, failed)

### Basic Statistics Computation
- **FR-005**: System MUST compute per-model win rates for each of the 14 canonical values
- **FR-006**: System MUST compute mean, standard deviation, min, and max scores per model
- **FR-007**: System MUST compute 95% confidence intervals using Wilson score for proportions
- **FR-008**: System MUST record sample size (n) for all statistics
- **FR-009**: System MUST handle missing or null values appropriately (exclude from calculations)

### Variable Impact Analysis
- **FR-010**: System MUST analyze which scenario dimensions correlate with score variance
- **FR-011**: System MUST compute effect sizes (beta coefficients) for each dimension
- **FR-012**: System MUST report percentage of variance explained (R-squared) if applicable
- **FR-013**: System MUST handle both categorical and numeric dimension values
- **FR-014**: System MUST rank dimensions by their impact on variance

### Model Comparison
- **FR-015**: System MUST compute inter-model agreement using Spearman's rho
- **FR-016**: System MUST compute pairwise effect sizes using Cohen's d
- **FR-017**: System MUST apply Holm-Bonferroni correction for multiple comparisons
- **FR-018**: System MUST identify and flag outlier models (>2 SD from mean agreement)
- **FR-019**: System MUST report statistical significance at alpha = 0.05 (corrected)

### Analysis Versioning & Caching
- **FR-020**: System MUST compute and store input_hash based on transcript content
- **FR-021**: System MUST return cached results if input_hash matches
- **FR-022**: System MUST invalidate cache when new transcripts are added to run
- **FR-023**: System MUST store analysis code version with results
- **FR-024**: System MUST allow manual recomputation via "Recompute Analysis" action

### Statistical Method Documentation
- **FR-025**: System MUST include `methods_used` object in all analysis results
- **FR-026**: System MUST document: test names, alpha level, correction method, CI method
- **FR-027**: System MUST include `code_version` and `computed_at` timestamp
- **FR-028**: System MUST include warnings for violated assumptions (small sample, non-normality)

### Visualizations (UI)
- **FR-029**: System MUST display score distribution histogram with per-model breakdown
- **FR-030**: System MUST display variable impact chart (bar chart or similar)
- **FR-031**: System MUST display model comparison matrix or chart
- **FR-032**: System MUST support tooltips showing exact values on hover
- **FR-033**: System MUST support filtering by model and by value
- **FR-034**: System MUST display "Most Contested Scenarios" list (top 5 by default)

### Results Viewer
- **FR-035**: System MUST display analysis results in the run detail page
- **FR-036**: System MUST show loading state while analysis is computing
- **FR-037**: System MUST show error state with retry option if analysis fails
- **FR-038**: System MUST show "computed at" timestamp for cached results

---

## Success Criteria

- **SC-001**: Analysis completes within 10 seconds of run completion for runs with up to 1000 transcripts
- **SC-002**: Cached analysis loads in under 1 second
- **SC-003**: Visualizations render in under 2 seconds for typical runs (100-500 transcripts)
- **SC-004**: All confidence intervals are computed correctly (verified by unit tests)
- **SC-005**: Statistical tests produce correct results (verified against reference implementations)
- **SC-006**: 80% code coverage on new analysis components and services (per constitution)
- **SC-007**: All new files under 400 lines (per constitution)
- **SC-008**: No `any` types in TypeScript code (per constitution)
- **SC-009**: Users can identify high-impact dimensions without external tools

---

## Key Entities

### AnalysisResult (new)
```
AnalysisResult {
  id: string                    // cuid
  runId: string                 // Reference to run
  analysisType: string          // 'basic' | 'correlations' | 'deep'

  // Versioning
  inputHash: string             // SHA-256 of transcript content
  codeVersion: string           // Analysis code version (semver)

  // Results (JSONB)
  basicStats: {
    perModel: {
      [modelId: string]: {
        sampleSize: number
        values: {
          [valueId: string]: {
            winRate: number
            confidenceInterval: { lower: number, upper: number }
            mean: number
            stdDev: number
            min: number
            max: number
          }
        }
      }
    }
  }

  modelAgreement: {
    pairwise: {
      [modelPair: string]: {
        spearmanRho: number
        pValue: number
        pValueCorrected: number
        significant: boolean
      }
    }
    outlierModels: string[]
  }

  dimensionAnalysis: {
    dimensions: {
      [dimensionName: string]: {
        effectSize: number
        rank: number
        pValue: number
      }
    }
    varianceExplained: number   // R-squared
  }

  mostContestedScenarios: {
    scenarioId: string
    variance: number
    modelScores: { [modelId: string]: number }
  }[]

  methodsUsed: {
    winRateCI: string           // e.g., "wilson_score"
    modelComparison: string     // e.g., "mann_whitney_u"
    pValueCorrection: string    // e.g., "holm_bonferroni"
    effectSize: string          // e.g., "cohens_d"
    correlation: string         // e.g., "spearman_rho"
    alpha: number               // e.g., 0.05
  }

  warnings: {
    code: string                // e.g., "SMALL_SAMPLE"
    message: string
    recommendation: string
  }[]

  // Timestamps
  createdAt: Date
  computedAt: Date
  durationMs: number
}
```

### Run (enhanced)
```
Run {
  // ... existing fields ...

  // Analysis status
  analysisStatus: 'pending' | 'computing' | 'completed' | 'failed' | null
  analysisError: string | null
}
```

---

## Assumptions

1. **Run execution is working** - Stage 9 completed, runs complete with transcripts
2. **Transcript data includes scores** - Transcripts have `decision` or score data to analyze
3. **14 canonical values are defined** - Values rubric is available for win rate computation
4. **Python scipy/numpy available** - Statistical computations can use Python scientific libraries
5. **Charts library selected** - Will use a charting library (e.g., Recharts, Chart.js, or similar)
6. **Analysis runs in Python worker** - Computation handled by `analyze_basic.py` worker

---

## Dependencies

### Requires from Previous Stages
- Run execution with transcript storage (Stage 9) - Complete
- Queue system with PgBoss (Stage 5) - Complete
- Python worker infrastructure (Stage 6) - Complete
- Frontend with run detail page (Stage 9) - Complete

### New Backend Requirements
- `analyze:basic` job handler in TypeScript orchestrator
- `analyze_basic.py` Python worker for statistical computation
- AnalysisResult Prisma model and migrations
- GraphQL types and queries for analysis results
- Cache validation logic (input_hash computation)

### New Frontend Requirements
- AnalysisPanel component for run detail page
- Score distribution chart component
- Variable impact chart component
- Model comparison chart/matrix component
- Most contested scenarios list component
- Filter controls for model/value filtering

---

## Constitution Validation

### Compliance Check

| Requirement | Status | Notes |
|-------------|--------|-------|
| Files < 400 lines | PASS | Spec splits into focused components (charts, stats, etc.) |
| No `any` types | PASS | SC-008 explicitly requires this |
| Test coverage 80% minimum | PASS | SC-006 explicitly requires this |
| Structured logging | PASS | Analysis workers will use pino logger |
| Type safety | PASS | TypeScript strict mode, Prisma types |
| Custom error classes | PASS | Will use existing AppError pattern |

### Folder Structure Compliance
Per constitution, should follow:
```
apps/api/src/
├── graphql/
│   └── analysis/
│       ├── queries.ts        # analysis query
│       └── types.ts          # AnalysisResult type
├── services/
│   └── analysis/
│       ├── index.ts          # Re-exports
│       ├── trigger.ts        # Auto-trigger on run completion
│       ├── cache.ts          # Cache validation
│       └── compute.ts        # Orchestrate Python worker
├── queue/
│   └── handlers/
│       └── analyze-basic.ts  # Job handler

workers/
├── analyze_basic.py          # Statistical computation
└── stats/
    ├── __init__.py
    ├── basic_stats.py        # Win rates, means, CIs
    ├── model_comparison.py   # Pairwise agreement
    └── dimension_impact.py   # Variable analysis

apps/web/src/
├── components/
│   └── analysis/
│       ├── AnalysisPanel.tsx
│       ├── ScoreDistributionChart.tsx
│       ├── VariableImpactChart.tsx
│       ├── ModelComparisonChart.tsx
│       ├── ContestedScenariosList.tsx
│       ├── MethodsDocumentation.tsx
│       └── AnalysisFilters.tsx
├── hooks/
│   └── useAnalysis.ts
```

**VALIDATION RESULT: PASS** - Spec addresses all constitutional requirements.

---

## Out of Scope

- Tier 2 correlations (on-demand analysis - future stage)
- Tier 3 deep analysis (PCA, LLM summaries - future stage)
- Run comparison (Stage 13)
- MCP read tools for analysis (Stage 12)
- Export of analysis results (Stage 15)
- Cohort analysis API (future)
- Real-time analysis during run (polling on completion is sufficient)

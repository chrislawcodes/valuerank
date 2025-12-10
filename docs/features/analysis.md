# Analysis

Analysis transforms raw transcript data into actionable insights about AI model behavior. Cloud ValueRank automatically runs analysis when runs complete.

> **Original Design:** See [specs/008-stage-11-analysis/spec.md](../../specs/008-stage-11-analysis/spec.md) for the full feature specification.

---

## Overview

The analysis pipeline answers three key questions:

1. **How do AIs tend to answer?** - Score distributions and decision patterns
2. **What causes scores to change?** - Dimension impact analysis
3. **Which AIs behave differently?** - Model comparison and agreement

Analysis runs automatically when a run completes and stores results for instant retrieval on subsequent views.

---

## Analysis Pipeline

When a run reaches `COMPLETED` status:

```
Run Completes
    │
    ▼
triggerBasicAnalysis()
    │
    ▼
Queue analyze_basic job
    │
    ▼
analyze_basic.py worker
    │
    ├─► Per-model statistics
    ├─► Model agreement scores
    ├─► Dimension impact analysis
    ├─► Most contested scenarios
    └─► Visualization data
    │
    ▼
Store AnalysisResult
    │
    ▼
Available via GraphQL
```

---

## Computed Statistics

### Per-Model Statistics

For each model in the run:

```typescript
type ModelStats = {
  sampleSize: number;
  values: Record<string, ValueStats>;  // Per-value metrics
  overall: {
    mean: number;      // Mean score
    stdDev: number;    // Standard deviation
    min: number;       // Minimum score
    max: number;       // Maximum score
  };
};

type ValueStats = {
  winRate: number;                     // prioritized / (prioritized + deprioritized)
  confidenceInterval: {
    lower: number;
    upper: number;
    level: 0.95;
    method: 'wilson_score';
  };
  count: {
    prioritized: number;
    deprioritized: number;
    neutral: number;
  };
};
```

### Win Rate Calculation

Win rate measures how often a model prioritizes a specific value:

```
Win Rate = prioritized / (prioritized + deprioritized)
```

- Neutral responses are excluded from the calculation
- Wilson score confidence intervals handle small samples well
- Returns 0.5 (neutral) if no data available

### Model Agreement

Pairwise comparison between all models:

```typescript
type ModelAgreement = {
  pairwise: Record<string, {
    spearmanRho: number;         // Correlation coefficient
    pValue: number;              // Raw p-value
    pValueCorrected: number;     // Holm-Bonferroni corrected
    significant: boolean;        // At alpha = 0.05
  }>;
  outlierModels: string[];       // Models > 2 SD from mean agreement
};
```

### Dimension Impact

Analyzes which scenario dimensions affect AI decisions:

```typescript
type DimensionAnalysis = {
  dimensions: Record<string, {
    effectSize: number;    // Beta coefficient
    rank: number;          // Impact ranking
    pValue: number;        // Statistical significance
  }>;
  varianceExplained: number;  // R-squared
};
```

### Most Contested Scenarios

Identifies scenarios with highest disagreement across models:

```typescript
type ContestedScenario = {
  scenarioId: string;
  scenarioName: string;
  variance: number;                    // Cross-model variance
  modelScores: Record<string, number>; // Each model's score
};
```

---

## Visualization Data

The analysis generates data optimized for frontend visualizations:

### Decision Distribution

Shows how each model distributes decisions across the 1-5 scale:

```typescript
type DecisionDistribution = {
  // model -> decision code (1-5) -> count
  [modelId: string]: {
    '1': number;
    '2': number;
    '3': number;
    '4': number;
    '5': number;
  };
};
```

### Model-Scenario Matrix

Average score for each model-scenario combination:

```typescript
type ModelScenarioMatrix = {
  // model -> scenario name -> average score
  [modelId: string]: {
    [scenarioName: string]: number;
  };
};
```

---

## Statistical Methods

All analysis results include documentation of methods used:

```typescript
type MethodsUsed = {
  winRateCI: 'wilson_score';           // Confidence interval method
  modelComparison: 'spearman_rho';     // Correlation test
  pValueCorrection: 'holm_bonferroni'; // Multiple comparison correction
  effectSize: 'cohens_d';              // Effect size measure
  dimensionTest: 'kruskal_wallis';     // Dimension impact test
  alpha: 0.05;                         // Significance level
  codeVersion: string;                 // Analysis code version
};
```

### Why These Methods?

- **Wilson Score CI** - Better for small samples and proportions near 0 or 1
- **Spearman's Rho** - Robust to non-normal distributions
- **Holm-Bonferroni** - Controls family-wise error rate for multiple comparisons
- **Kruskal-Wallis** - Non-parametric, handles categorical dimensions

---

## Analysis Caching

Analysis results are cached to avoid recomputation:

### Cache Validation

- **Input Hash** - SHA-256 of transcript content
- **Code Version** - Analysis code version string
- **Status** - `CURRENT` or `SUPERSEDED`

### Cache Invalidation

Cache is invalidated when:
- New transcripts are added to the run
- Analysis code version changes
- User explicitly requests recomputation

### Recomputation

To force recomputation:

```graphql
mutation TriggerAnalysis {
  triggerAnalysis(runId: "run-id", force: true) {
    success
    analysisId
  }
}
```

---

## Warnings

Analysis generates warnings for statistical assumption violations:

| Code | Description | Recommendation |
|------|-------------|----------------|
| `SMALL_SAMPLE` | Model has < 10 samples | Results have wide CIs |
| `MODERATE_SAMPLE` | Model has 10-30 samples | Consider bootstrap CIs |
| `NO_DIMENSIONS` | No dimension data found | Impact analysis empty |

---

## GraphQL Operations

### Queries

```graphql
# Get current analysis for a run
query GetAnalysis($runId: ID!) {
  analysis(runId: $runId) {
    id
    runId
    analysisType
    inputHash
    codeVersion
    status
    output   # JSONB with all computed statistics
    createdAt
  }
}

# Get analysis history (including superseded)
query GetAnalysisHistory($runId: ID!, $limit: Int) {
  analysisHistory(runId: $runId, limit: $limit) {
    id
    status
    createdAt
  }
}
```

### Analysis Output Structure

The `output` field contains:

```json
{
  "perModel": { /* ModelStats per model */ },
  "modelAgreement": { /* pairwise comparisons */ },
  "dimensionAnalysis": { /* dimension impact */ },
  "mostContestedScenarios": [ /* top 5 by variance */ ],
  "visualizationData": {
    "decisionDistribution": { /* counts per model */ },
    "modelScenarioMatrix": { /* averages */ }
  },
  "methodsUsed": { /* statistical methods */ },
  "warnings": [ /* assumption violations */ ],
  "computedAt": "ISO timestamp",
  "durationMs": 1234
}
```

---

## Frontend Visualizations

The web UI displays analysis through several components:

| Component | Purpose |
|-----------|---------|
| `AnalysisPanel` | Main container with tabs |
| `DecisionDistributionChart` | Stacked bar chart of decision codes |
| `ModelConsistencyChart` | Bar/line combo for mean and std dev |
| `ScenarioHeatmap` | Model behavior across scenarios |
| `MethodsDocumentation` | Expandable statistical methods info |

### AnalysisPanel Sections

The analysis panel is organized into 6 tabs:

1. **Overview** - Summary statistics and key metrics
2. **Decisions** - Decision distribution charts
3. **Scenarios** - Most contested scenarios list
4. **Values** - Per-value win rates and CIs
5. **Agreement** - Model comparison matrix
6. **Methods** - Statistical methodology documentation

---

## Database Schema

```prisma
model AnalysisResult {
  id           String         @id @default(cuid())
  runId        String
  analysisType String         // 'basic'
  inputHash    String         // SHA-256 of input data
  codeVersion  String         // Analysis code version
  output       Json           @db.JsonB
  status       AnalysisStatus @default(CURRENT)
  createdAt    DateTime       @default(now())

  run Run @relation(...)

  @@index([runId])
  @@index([analysisType])
  @@index([status])
}

enum AnalysisStatus {
  CURRENT      // Active result
  SUPERSEDED   // Replaced by newer computation
}
```

---

## Key Source Files

### TypeScript (API)

- **Analysis service:** `apps/api/src/services/analysis/`
  - `trigger.ts` - Queue analysis jobs
  - `cache.ts` - Cache validation logic
- **GraphQL queries:** `apps/api/src/graphql/queries/analysis.ts`
- **Job handler:** `apps/api/src/queue/handlers/analyze-basic.ts`

### Python (Workers)

- **Main worker:** `workers/analyze_basic.py`
- **Statistics module:** `workers/stats/`
  - `basic_stats.py` - Win rates, means, aggregation
  - `confidence.py` - Wilson score CI implementation
  - `model_comparison.py` - Spearman's rho, pairwise tests
  - `dimension_impact.py` - Kruskal-Wallis, effect sizes

### Frontend

- **Analysis components:** `apps/web/src/components/analysis/`
- **Analysis hooks:** `apps/web/src/hooks/useAnalysis.ts`

---

## Performance Considerations

- **Computation** - Analysis completes in < 10 seconds for runs up to 1000 transcripts
- **Caching** - Cached results load in < 1 second
- **Visualization** - Charts render in < 2 seconds for typical runs

---

## Best Practices

1. **Wait for completion** - Analysis requires summarized transcripts
2. **Check warnings** - Small samples affect statistical reliability
3. **Compare methods** - Understand what each statistic measures
4. **Use filters** - Focus on specific models or values
5. **Recompute when needed** - Force refresh after code updates

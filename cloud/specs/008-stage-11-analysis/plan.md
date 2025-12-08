# Implementation Plan: Stage 11 - Analysis System & Visualizations

**Branch**: `stage-11-analysis` | **Date**: 2025-12-07 | **Spec**: [spec.md](./spec.md)

## Summary

Implement automated Tier 1 analysis by extending the existing stub infrastructure (analyze_basic.py + TypeScript handler) with real statistical computation, then building React visualization components to display results. The analysis computes win rates, confidence intervals, variable impact, and model comparisons using Python scipy/numpy, stored in the existing AnalysisResult model.

---

## Technical Context

**Language/Version**: TypeScript 5.3+ (API/Web), Python 3.11+ (workers)
**Primary Dependencies**:
- API: pg-boss, prisma, pothos, graphql-yoga (existing)
- Web: React 18, urql, Recharts (new for charts), Tailwind CSS (existing)
- Python: scipy, numpy, pandas (new for statistics)

**Storage**: PostgreSQL with Prisma ORM (existing AnalysisResult model)
**Testing**: Vitest (TypeScript), pytest (Python)
**Target Platform**: Docker Compose (local), Railway (production)
**Performance Goals**:
- Analysis completes within 10s for 1000 transcripts (SC-001)
- Cached results load in <1s (SC-002)
- Visualizations render in <2s (SC-003)

**Constraints**:
- Files must be <400 lines (constitution)
- 80% test coverage minimum (constitution)
- No `any` types (constitution)

---

## Constitution Check

**Status**: PASS

### File Size Limits (per constitution)
- [x] All new files will be under 400 lines
- [x] Python stats modules split by concern (basic_stats, model_comparison, dimension_impact)
- [x] React chart components are single-purpose

### Type Safety (per constitution)
- [x] No `any` types - SC-008 explicitly requires this
- [x] Strict TypeScript mode enabled
- [x] Prisma provides typed database operations

### Testing (per constitution)
- [x] 80% coverage target per SC-006
- [x] Statistical functions unit tested against reference implementations
- [x] React components tested with Testing Library

### Logging (per constitution)
- [x] Using pino-based createLogger (existing pattern)
- [x] Python uses structured JSON logging to stderr (existing pattern)

**Violations/Notes**: None - all requirements addressed in spec and plan.

---

## Architecture Decisions

### Decision 1: Extend Existing Stub vs. New Worker

**Chosen**: Extend existing `analyze_basic.py` stub

**Rationale**:
- Infrastructure already exists (handler, spawn, job queue integration)
- Follows existing patterns from probe.py and summarize.py
- Less new code, lower risk

**Alternatives Considered**:
- Create new analyze_full.py: Would duplicate infrastructure
- Run analysis in TypeScript: Would lose scipy/numpy ecosystem

**Tradeoffs**:
- Pros: Reuse existing tested infrastructure, consistent patterns
- Cons: Must maintain Python/TypeScript interface contract

---

### Decision 2: Statistical Library Selection

**Chosen**: scipy + numpy + pandas

**Rationale**:
- Industry-standard for statistical computing
- Already used in original CLI tool
- Comprehensive statistical tests (Mann-Whitney, Spearman, etc.)
- Handles edge cases properly (ties, small samples)

**Alternatives Considered**:
- statsmodels: Overkill for our needs, larger dependency
- Pure Python: Would need to implement tests ourselves, error-prone
- TypeScript (simple-statistics): Missing advanced tests, CIs

**Tradeoffs**:
- Pros: Battle-tested, correct implementations, comprehensive
- Cons: Python dependency, cold start overhead (~1s)

---

### Decision 3: Charting Library

**Chosen**: Recharts

**Rationale**:
- React-native, composable components
- Good TypeScript support
- Lightweight (~45KB gzipped)
- Responsive and accessible
- Already commonly used with React

**Alternatives Considered**:
- Chart.js + react-chartjs-2: Canvas-based, less React-native
- Nivo: More features but larger bundle
- D3 direct: Too low-level for our needs, more code

**Tradeoffs**:
- Pros: Simple API, good defaults, responsive
- Cons: Less customizable than D3, some chart types limited

---

### Decision 4: Analysis Trigger Strategy

**Chosen**: Auto-trigger via run completion event

**Rationale**:
- Existing pattern: summarize-transcript jobs queued on run completion
- PgBoss handles retries, concurrency, persistence
- Users get analysis without manual action

**Alternatives Considered**:
- On-demand only: Requires user action, delays results
- Inline computation: Blocks run completion, poor UX

**Tradeoffs**:
- Pros: Automatic, consistent, uses existing queue infrastructure
- Cons: Compute cost even if analysis never viewed (acceptable for Tier 1)

---

### Decision 5: Cache Invalidation Strategy

**Chosen**: Input hash comparison (existing pattern)

**Rationale**:
- Already implemented in analyze-basic handler
- Hash of transcript IDs provides reliable change detection
- Simple and deterministic

**Alternatives Considered**:
- Time-based expiry: Would miss content changes
- Always recompute: Wasteful, poor UX

**Tradeoffs**:
- Pros: Deterministic, efficient, existing pattern
- Cons: Must ensure hash includes all relevant inputs

---

## Project Structure

### Backend Changes (apps/api/src/)

```
queue/
├── handlers/
│   └── analyze-basic.ts      # [MODIFY] Update output type, remove stub comments

graphql/
├── types/
│   └── analysis.ts           # [NEW] AnalysisResult GraphQL type
├── queries/
│   └── analysis.ts           # [NEW] analysis query
└── mutations/
    └── analysis.ts           # [NEW] recomputeAnalysis mutation

services/
└── analysis/
    ├── index.ts              # [NEW] Re-exports
    ├── cache.ts              # [NEW] Input hash, cache validation
    └── trigger.ts            # [NEW] Auto-trigger on run completion
```

### Python Workers (workers/)

```
workers/
├── analyze_basic.py          # [MODIFY] Replace stub with real implementation
├── stats/
│   ├── __init__.py           # [NEW]
│   ├── basic_stats.py        # [NEW] Win rates, means, CIs
│   ├── model_comparison.py   # [NEW] Pairwise agreement, outliers
│   ├── dimension_impact.py   # [NEW] Variable analysis
│   └── confidence.py         # [NEW] Wilson score, bootstrap CIs
└── tests/
    └── test_stats.py         # [NEW] Statistical function tests
```

### Frontend (apps/web/src/)

```
components/
└── analysis/
    ├── AnalysisPanel.tsx         # [NEW] Main container
    ├── ScoreDistributionChart.tsx # [NEW] Histogram
    ├── VariableImpactChart.tsx   # [NEW] Bar chart
    ├── ModelComparisonMatrix.tsx # [NEW] Heatmap/matrix
    ├── ContestedScenariosList.tsx # [NEW] Table
    ├── MethodsDocumentation.tsx  # [NEW] Expandable details
    ├── AnalysisFilters.tsx       # [NEW] Model/value filters
    └── StatCard.tsx              # [NEW] Reusable stat display

hooks/
└── useAnalysis.ts                # [NEW] urql query hook

pages/
└── RunDetail.tsx                 # [MODIFY] Add AnalysisPanel
```

---

## Data Flow

```
Run Completes (all jobs done)
       │
       ▼
┌─────────────────────────────────────┐
│ queue:summarize-transcript (existing)│
│ Summarizes each transcript          │
└─────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Run status → COMPLETED              │
│ Triggers analyze_basic job          │
└─────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ queue:analyze_basic handler         │
│ 1. Fetch transcripts from DB        │
│ 2. Compute input hash               │
│ 3. Check cache (existing result?)   │
│ 4. If miss: spawn Python worker     │
│ 5. Store AnalysisResult             │
└─────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Python analyze_basic.py             │
│ 1. Parse transcripts                │
│ 2. Compute win rates + CIs          │
│ 3. Compute model agreement          │
│ 4. Compute dimension impact         │
│ 5. Find contested scenarios         │
│ 6. Return JSON to stdout            │
└─────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ AnalysisResult stored in DB         │
│ - output: JSONB with all stats      │
│ - inputHash: for cache validation   │
│ - codeVersion: for reproducibility  │
└─────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Frontend queries via GraphQL        │
│ run(id) { analysis { ... } }        │
└─────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ React AnalysisPanel renders         │
│ - ScoreDistributionChart            │
│ - VariableImpactChart               │
│ - ModelComparisonMatrix             │
│ - ContestedScenariosList            │
└─────────────────────────────────────┘
```

---

## Analysis Output Schema

The Python worker returns this structure, stored in AnalysisResult.output:

```typescript
type AnalysisOutput = {
  // Per-model statistics
  perModel: {
    [modelId: string]: {
      sampleSize: number;
      values: {
        [valueId: string]: {
          winRate: number;
          confidenceInterval: { lower: number; upper: number; level: number; method: string };
          count: { prioritized: number; deprioritized: number; neutral: number };
        };
      };
      overall: {
        mean: number;
        stdDev: number;
        min: number;
        max: number;
      };
    };
  };

  // Model agreement matrix
  modelAgreement: {
    pairwise: {
      [pair: string]: {  // e.g., "gpt-4:claude-3"
        spearmanRho: number;
        pValue: number;
        pValueCorrected: number;
        significant: boolean;
        effectSize: number;
        effectInterpretation: string;  // "small" | "medium" | "large"
      };
    };
    outlierModels: string[];
    overallAgreement: number;  // Mean pairwise correlation
  };

  // Variable impact (which dimensions drive variance)
  dimensionAnalysis: {
    dimensions: {
      [dimensionName: string]: {
        effectSize: number;
        rank: number;
        pValue: number;
        significant: boolean;
      };
    };
    varianceExplained: number;  // R-squared
    method: string;  // e.g., "anova" or "kruskal_wallis"
  };

  // High-disagreement scenarios
  mostContestedScenarios: Array<{
    scenarioId: string;
    scenarioName: string;
    variance: number;
    modelScores: { [modelId: string]: number };
  }>;

  // Method documentation
  methodsUsed: {
    winRateCI: string;        // "wilson_score"
    modelComparison: string;  // "spearman_rho"
    pValueCorrection: string; // "holm_bonferroni"
    effectSize: string;       // "cohens_d"
    dimensionTest: string;    // "kruskal_wallis"
    alpha: number;            // 0.05
    codeVersion: string;
  };

  // Warnings for violated assumptions
  warnings: Array<{
    code: string;  // "SMALL_SAMPLE" | "NON_NORMAL" | "TIED_RANKS"
    message: string;
    recommendation: string;
  }>;

  // Metadata
  computedAt: string;  // ISO timestamp
  durationMs: number;
};
```

---

## GraphQL Schema Extension

```graphql
# New type for analysis results
type AnalysisResult {
  id: ID!
  runId: ID!
  analysisType: String!
  status: AnalysisStatus!
  computedAt: DateTime!
  durationMs: Int!
  codeVersion: String!

  # Structured output
  perModel: JSON!
  modelAgreement: JSON!
  dimensionAnalysis: JSON
  mostContestedScenarios: [ContestedScenario!]!
  methodsUsed: JSON!
  warnings: [AnalysisWarning!]!
}

type ContestedScenario {
  scenarioId: ID!
  scenarioName: String!
  variance: Float!
  modelScores: JSON!
}

type AnalysisWarning {
  code: String!
  message: String!
  recommendation: String!
}

enum AnalysisStatus {
  CURRENT
  SUPERSEDED
}

# Add to Run type
extend type Run {
  analysis: AnalysisResult
  analysisStatus: String  # 'pending' | 'computing' | 'completed' | 'failed'
}

# Add mutation for manual recompute
type Mutation {
  recomputeAnalysis(runId: ID!): AnalysisResult!
}
```

---

## Dependencies to Add

### Python (workers/requirements.txt)
```
scipy>=1.11.0
numpy>=1.24.0
pandas>=2.0.0
```

### Web (apps/web/package.json)
```json
{
  "dependencies": {
    "recharts": "^2.10.0"
  }
}
```

---

## Testing Strategy

### Python Statistical Functions
- Unit tests comparing outputs to known reference values
- Edge case tests: empty data, single value, all same values
- Test Wilson score CI against scipy.stats.binom confidence intervals
- Test Mann-Whitney against scipy.stats.mannwhitneyu
- Test Spearman against scipy.stats.spearmanr

### TypeScript Handler
- Integration test: queue job → Python worker → DB storage
- Mock Python output for handler logic tests
- Cache hit/miss scenarios

### React Components
- Snapshot tests for chart components
- Testing Library tests for filter interactions
- Loading/error state tests
- Empty data state tests

---

## Migration Notes

No database migrations required - AnalysisResult model already exists with correct schema:
- `output` JSONB field stores full analysis
- `inputHash` for cache validation
- `codeVersion` for reproducibility
- `status` enum (CURRENT, SUPERSEDED)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Python cold start too slow | Low | Medium | Pre-warm worker, optimize imports |
| Statistical edge cases | Medium | High | Comprehensive unit tests, reference comparisons |
| Chart performance with many models | Low | Medium | Limit default display, add pagination |
| Cache invalidation bugs | Medium | Medium | Thorough hash testing, manual recompute fallback |

---

## Implementation Order

1. **Python statistics module** (stats/) - Core computation
2. **Extend analyze_basic.py** - Integrate stats, replace stub
3. **GraphQL types and queries** - Expose analysis data
4. **React chart components** - Visualizations
5. **Integration and testing** - End-to-end validation
6. **Polish and edge cases** - Warnings, errors, empty states

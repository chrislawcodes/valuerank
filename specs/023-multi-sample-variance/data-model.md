# Data Model: Multi-Sample Runs with Variance Analysis

## Modified Entities

### Entity 1: Transcript

**Purpose**: Store individual probe responses with sample tracking for multi-sample runs

**Storage**: `transcripts` table

**Modified Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| sampleIndex | Int | DEFAULT 0, NOT NULL | Sample index within scenario-model pair (0 to N-1) |

**Indexes**:
- Existing indexes remain unchanged
- `sampleIndex` does not need separate index (queries filter by runId first)

**Relationships**: Unchanged - belongs to Run, optionally to Scenario

**Validation Rules**:
- sampleIndex >= 0
- sampleIndex < samplesPerScenario (validated at insert time)

---

### Entity 2: ProbeResult

**Purpose**: Track probe job outcomes with sample-level granularity

**Storage**: `probe_results` table

**Modified Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| sampleIndex | Int | DEFAULT 0, NOT NULL | Sample index for this probe result |

**Modified Constraints**:
- Old: `@@unique([runId, scenarioId, modelId])`
- New: `@@unique([runId, scenarioId, modelId, sampleIndex])`

**Indexes**: Existing indexes remain, unique constraint covers new field

---

### Entity 3: Run.config (JSONB)

**Purpose**: Store run configuration including sample count

**Storage**: `runs.config` JSONB column (no schema change needed)

**Extended Schema**:
```typescript
type RunConfig = {
  models: string[];
  samplePercentage: number;
  sampleSeed?: number;
  samplesPerScenario: number;  // NEW: default 1, range 1-100
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  definitionSnapshot: unknown;
  estimatedCosts: CostEstimate;
};
```

---

### Entity 4: AnalysisResult.output (JSONB)

**Purpose**: Store analysis results including variance statistics

**Storage**: `analysis_results.output` JSONB column (no schema change needed)

**Extended Schema**:
```typescript
type AnalysisOutput = {
  perModel: Record<string, {
    // Existing fields
    sampleSize: number;
    avgScore: number;
    values: Record<string, ValueStats>;

    // NEW variance fields (only present when samplesPerScenario > 1)
    mean?: number;
    stdDev?: number;
    variance?: number;
    confidenceInterval?: {
      lower: number;
      upper: number;
      level: number; // e.g., 0.95 for 95% CI
    };
    sampleCount?: number;  // Number of samples used in variance calc
    min?: number;
    max?: number;
  }>;

  // NEW section for scenario-level variance
  scenarioVariance?: Array<{
    scenarioId: string;
    scenarioName: string;
    overallVariance: number;
    perModelVariance: Record<string, number>;
  }>;

  // Existing fields
  modelAgreement: ModelAgreement;
  dimensionAnalysis: DimensionAnalysis;
  mostContestedScenarios: ContestedScenario[];
  visualizationData: VisualizationData;
  methodsUsed: MethodsUsed;
  warnings: AnalysisWarning[];
  computedAt: string;
  durationMs: number;
};
```

---

## Type Definitions

### TypeScript (API Layer)

```typescript
// packages/db/src/types/run.ts (or inline in services)

export type StartRunInput = {
  definitionId: string;
  models: string[];
  samplePercentage?: number;
  sampleSeed?: number;
  samplesPerScenario?: number;  // NEW: 1-100, defaults to 1
  priority?: string;
  experimentId?: string;
  userId: string;
};

// Job data with sample tracking
export type ProbeScenarioJobData = {
  runId: string;
  scenarioId: string;
  modelId: string;
  sampleIndex: number;  // NEW: 0 to N-1
  config: {
    temperature: number;
    maxTurns: number;
  };
};

// Variance statistics for frontend
export type VarianceStats = {
  mean: number;
  stdDev: number;
  variance: number;
  confidenceInterval: {
    lower: number;
    upper: number;
    level: number;
  };
  sampleCount: number;
  min: number;
  max: number;
};

// Extended per-model stats
export type PerModelStatsWithVariance = {
  sampleSize: number;
  avgScore: number;
  values: Record<string, ValueStats>;
  variance?: VarianceStats;  // Only present when samples > 1
};
```

### Python (Workers)

```python
# workers/stats/variance.py

from dataclasses import dataclass
from typing import Optional

@dataclass
class VarianceStats:
    """Variance statistics for a model's scores across samples."""
    mean: float
    std_dev: float
    variance: float
    confidence_interval_lower: float
    confidence_interval_upper: float
    confidence_level: float  # e.g., 0.95
    sample_count: int
    min_value: float
    max_value: float

    def to_dict(self) -> dict:
        return {
            "mean": round(self.mean, 6),
            "stdDev": round(self.std_dev, 6),
            "variance": round(self.variance, 6),
            "confidenceInterval": {
                "lower": round(self.confidence_interval_lower, 6),
                "upper": round(self.confidence_interval_upper, 6),
                "level": self.confidence_level,
            },
            "sampleCount": self.sample_count,
            "min": round(self.min_value, 6),
            "max": round(self.max_value, 6),
        }


@dataclass
class ScenarioVariance:
    """Variance for a single scenario across models."""
    scenario_id: str
    scenario_name: str
    overall_variance: float
    per_model_variance: dict[str, float]

    def to_dict(self) -> dict:
        return {
            "scenarioId": self.scenario_id,
            "scenarioName": self.scenario_name,
            "overallVariance": round(self.overall_variance, 6),
            "perModelVariance": {
                k: round(v, 6) for k, v in self.per_model_variance.items()
            },
        }
```

---

## Migrations

### Migration: add_sample_index_to_transcripts

```sql
-- Add sampleIndex column to transcripts table
ALTER TABLE transcripts
ADD COLUMN sample_index INTEGER NOT NULL DEFAULT 0;

-- Add sampleIndex column to probe_results table
ALTER TABLE probe_results
ADD COLUMN sample_index INTEGER NOT NULL DEFAULT 0;

-- Drop existing unique constraint on probe_results
ALTER TABLE probe_results
DROP CONSTRAINT IF EXISTS probe_results_run_id_scenario_id_model_id_key;

-- Add new unique constraint including sampleIndex
ALTER TABLE probe_results
ADD CONSTRAINT probe_results_run_id_scenario_id_model_id_sample_index_key
UNIQUE (run_id, scenario_id, model_id, sample_index);
```

### Prisma Schema Changes

```prisma
// In packages/db/prisma/schema.prisma

model Transcript {
  id                 String    @id @default(cuid())
  runId              String    @map("run_id")
  scenarioId         String?   @map("scenario_id")
  modelId            String    @map("model_id")
  modelVersion       String?   @map("model_version")
  sampleIndex        Int       @default(0) @map("sample_index")  // NEW
  // ... rest unchanged

  @@index([runId])
  @@index([scenarioId])
  @@index([modelId])
  @@index([deletedAt])
  @@map("transcripts")
}

model ProbeResult {
  id          String            @id @default(cuid())
  runId       String            @map("run_id")
  scenarioId  String            @map("scenario_id")
  modelId     String            @map("model_id")
  sampleIndex Int               @default(0) @map("sample_index")  // NEW
  status      ProbeResultStatus
  // ... rest unchanged

  @@unique([runId, scenarioId, modelId, sampleIndex])  // UPDATED
  @@index([runId])
  @@index([scenarioId])
  @@index([modelId])
  @@index([status])
  @@map("probe_results")
}
```

---

## Query Patterns

### Get transcripts grouped by sample for analysis

```typescript
// Get all transcripts for a run, grouped for variance calculation
const transcripts = await db.transcript.findMany({
  where: {
    runId,
    deletedAt: null,
    decisionCode: { not: null },  // Only summarized transcripts
  },
  select: {
    id: true,
    scenarioId: true,
    modelId: true,
    sampleIndex: true,
    decisionCode: true,
  },
  orderBy: [
    { scenarioId: 'asc' },
    { modelId: 'asc' },
    { sampleIndex: 'asc' },
  ],
});
```

### Get sample count for a run

```typescript
// From run config
const run = await db.run.findUnique({
  where: { id: runId },
  select: { config: true },
});
const config = run?.config as RunConfig;
const samplesPerScenario = config?.samplesPerScenario ?? 1;
```

### Query transcripts for specific sample

```typescript
// Get first sample only (for display when showing single representative)
const firstSampleTranscripts = await db.transcript.findMany({
  where: {
    runId,
    sampleIndex: 0,
    deletedAt: null,
  },
});
```

---

## Backwards Compatibility

### Existing Data Handling

1. **Transcripts**: All existing transcripts have `sampleIndex = 0` (default)
2. **ProbeResults**: All existing records have `sampleIndex = 0` (default)
3. **Run.config**: Missing `samplesPerScenario` treated as 1 in application code
4. **AnalysisResult.output**: Missing variance fields indicate single-sample run

### Application Code Guards

```typescript
// In startRun service
const samplesPerScenario = input.samplesPerScenario ?? 1;

// In analysis display
const hasVariance = analysis.perModel[modelId]?.sampleCount > 1;
if (hasVariance) {
  // Show error bars
}
```

### GraphQL Schema

```graphql
# Optional variance fields in PerModelStats
type PerModelStats {
  sampleSize: Int!
  avgScore: Float!
  values: JSON!

  # Variance (null when samplesPerScenario = 1)
  mean: Float
  stdDev: Float
  variance: Float
  confidenceInterval: ConfidenceInterval
  sampleCount: Int
  min: Float
  max: Float
}

type ConfidenceInterval {
  lower: Float!
  upper: Float!
  level: Float!
}
```

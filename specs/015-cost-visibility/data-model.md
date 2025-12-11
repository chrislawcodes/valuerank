# Data Model: Cost Visibility

## Entities

### Entity: ModelTokenStatistics

**Purpose**: Stores historical average token usage per model for cost prediction. Updated after each run completes.

**Storage**: `model_token_statistics` table

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (CUID) | PRIMARY KEY | Unique identifier |
| modelId | String | FK → llm_models.id, REQUIRED | Reference to LLM model |
| definitionId | String | FK → definitions.id, NULLABLE | Optional: definition-specific stats (P3) |
| avgInputTokens | Decimal(10,2) | NOT NULL, DEFAULT 100 | Average input tokens per probe |
| avgOutputTokens | Decimal(10,2) | NOT NULL, DEFAULT 900 | Average output tokens per probe |
| sampleCount | Int | NOT NULL, DEFAULT 0 | Number of probes used to compute average |
| lastUpdatedAt | DateTime | NOT NULL | When stats were last recomputed |
| createdAt | DateTime | NOT NULL, DEFAULT now() | When record was created |

**Indexes**:
- `model_token_statistics_model_id_idx` ON (modelId)
- `model_token_statistics_definition_id_idx` ON (definitionId) WHERE definitionId IS NOT NULL
- `model_token_statistics_model_definition_uniq` UNIQUE ON (modelId, definitionId) - allows one global stat (definitionId=NULL) plus per-definition stats

**Relationships**:
- `modelId` → `LlmModel.id` (many-to-one, CASCADE on delete)
- `definitionId` → `Definition.id` (many-to-one, SET NULL on delete)

**Validation Rules**:
- `avgInputTokens` must be >= 0
- `avgOutputTokens` must be >= 0
- `sampleCount` must be >= 0
- Either `definitionId` is NULL (global model stat) or points to valid definition

---

## Type Definitions

### Prisma Schema Addition

```prisma
model ModelTokenStatistics {
  id              String     @id @default(cuid())
  modelId         String     @map("model_id")
  definitionId    String?    @map("definition_id")
  avgInputTokens  Decimal    @default(100) @map("avg_input_tokens") @db.Decimal(10, 2)
  avgOutputTokens Decimal    @default(900) @map("avg_output_tokens") @db.Decimal(10, 2)
  sampleCount     Int        @default(0) @map("sample_count")
  lastUpdatedAt   DateTime   @updatedAt @map("last_updated_at")
  createdAt       DateTime   @default(now()) @map("created_at")

  model      LlmModel    @relation(fields: [modelId], references: [id], onDelete: Cascade)
  definition Definition? @relation(fields: [definitionId], references: [id], onDelete: SetNull)

  @@unique([modelId, definitionId])
  @@index([modelId])
  @@index([definitionId])
  @@map("model_token_statistics")
}
```

### TypeScript Types (API)

```typescript
// packages/api/src/services/cost/types.ts

/**
 * Token statistics for a single model
 */
export type ModelTokenStats = {
  modelId: string;
  avgInputTokens: number;
  avgOutputTokens: number;
  sampleCount: number;
  lastUpdatedAt: Date;
};

/**
 * Cost estimate for a single model
 */
export type ModelCostEstimate = {
  modelId: string;
  displayName: string;
  scenarioCount: number;
  inputTokens: number;       // Predicted total input tokens
  outputTokens: number;      // Predicted total output tokens
  inputCost: number;         // Cost for input tokens ($)
  outputCost: number;        // Cost for output tokens ($)
  totalCost: number;         // Total cost ($)
  avgInputPerProbe: number;  // Average input tokens per probe
  avgOutputPerProbe: number; // Average output tokens per probe
  sampleCount: number;       // Probes used to compute average
  isUsingFallback: boolean;  // True if using all-model avg or system default
};

/**
 * Complete cost estimate for a run
 */
export type CostEstimate = {
  total: number;                    // Total cost ($)
  perModel: ModelCostEstimate[];    // Per-model breakdown
  scenarioCount: number;            // Scenarios to run
  basedOnSampleCount: number;       // Min sample count across models
  isUsingFallback: boolean;         // True if any model using fallback
};

/**
 * Fallback configuration
 */
export const FALLBACK_TOKENS = {
  input: 100,
  output: 900,
} as const;

/**
 * Actual cost summary from completed run
 */
export type ActualCost = {
  total: number;
  perModel: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cost: number;
    probeCount: number;
  }>;
};
```

### GraphQL Type

```graphql
"""Token statistics for cost prediction"""
type ModelTokenStats {
  modelId: ID!
  avgInputTokens: Float!
  avgOutputTokens: Float!
  sampleCount: Int!
  lastUpdatedAt: DateTime!
}

"""Cost estimate for a single model"""
type ModelCostEstimate {
  modelId: ID!
  displayName: String!
  scenarioCount: Int!
  inputTokens: Float!
  outputTokens: Float!
  inputCost: Float!
  outputCost: Float!
  totalCost: Float!
  avgInputPerProbe: Float!
  avgOutputPerProbe: Float!
  sampleCount: Int!
  isUsingFallback: Boolean!
}

"""Complete cost estimate for a run"""
type CostEstimate {
  total: Float!
  perModel: [ModelCostEstimate!]!
  scenarioCount: Int!
  basedOnSampleCount: Int!
  isUsingFallback: Boolean!
}
```

---

## Migrations

### Migration: add_model_token_statistics

```sql
-- CreateTable
CREATE TABLE "model_token_statistics" (
    "id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "definition_id" TEXT,
    "avg_input_tokens" DECIMAL(10,2) NOT NULL DEFAULT 100,
    "avg_output_tokens" DECIMAL(10,2) NOT NULL DEFAULT 900,
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "last_updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_token_statistics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "model_token_statistics_model_id_idx" ON "model_token_statistics"("model_id");

-- CreateIndex
CREATE INDEX "model_token_statistics_definition_id_idx" ON "model_token_statistics"("definition_id");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "model_token_statistics_model_id_definition_id_key" ON "model_token_statistics"("model_id", "definition_id");

-- AddForeignKey
ALTER TABLE "model_token_statistics" ADD CONSTRAINT "model_token_statistics_model_id_fkey"
    FOREIGN KEY ("model_id") REFERENCES "llm_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_token_statistics" ADD CONSTRAINT "model_token_statistics_definition_id_fkey"
    FOREIGN KEY ("definition_id") REFERENCES "definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

---

## Query Patterns

### Get Token Stats for Cost Prediction

```typescript
// Get stats for specific models, falling back to global stats
async function getTokenStats(modelIds: string[]): Promise<Map<string, ModelTokenStats>> {
  const stats = await db.modelTokenStatistics.findMany({
    where: {
      modelId: { in: modelIds },
      definitionId: null, // Global stats only (P1)
    },
  });

  return new Map(stats.map(s => [s.modelId, {
    modelId: s.modelId,
    avgInputTokens: Number(s.avgInputTokens),
    avgOutputTokens: Number(s.avgOutputTokens),
    sampleCount: s.sampleCount,
    lastUpdatedAt: s.lastUpdatedAt,
  }]));
}
```

### Get All-Model Average for Fallback

```typescript
// Calculate average across all models (fallback when model has no stats)
async function getAllModelAverage(): Promise<{ input: number; output: number } | null> {
  const result = await db.modelTokenStatistics.aggregate({
    where: {
      definitionId: null,
      sampleCount: { gt: 0 },
    },
    _avg: {
      avgInputTokens: true,
      avgOutputTokens: true,
    },
  });

  if (result._avg.avgInputTokens === null) return null;

  return {
    input: Number(result._avg.avgInputTokens),
    output: Number(result._avg.avgOutputTokens),
  };
}
```

### Upsert Token Statistics After Run

```typescript
// Update or create token statistics for a model
async function upsertTokenStats(
  modelId: string,
  newAvgInput: number,
  newAvgOutput: number,
  newSampleCount: number
): Promise<void> {
  await db.modelTokenStatistics.upsert({
    where: {
      modelId_definitionId: {
        modelId,
        definitionId: null,
      },
    },
    create: {
      modelId,
      definitionId: null,
      avgInputTokens: newAvgInput,
      avgOutputTokens: newAvgOutput,
      sampleCount: newSampleCount,
    },
    update: {
      avgInputTokens: newAvgInput,
      avgOutputTokens: newAvgOutput,
      sampleCount: newSampleCount,
    },
  });
}
```

---

## Statistics Update Algorithm

When a run completes, compute new averages using exponential moving average (EMA) to weight recent data:

```python
# workers/jobs/compute_token_stats.py

def compute_new_average(
    old_avg: float,
    old_count: int,
    new_values: list[float],
    alpha: float = 0.3  # Weight for new data
) -> tuple[float, int]:
    """
    Compute new average using exponential moving average.

    - alpha=0.3 means new data has 30% weight
    - Provides smooth updates without overreacting to outliers
    """
    if old_count == 0:
        # First data point - just use new average
        return sum(new_values) / len(new_values), len(new_values)

    new_avg = sum(new_values) / len(new_values)
    combined_avg = alpha * new_avg + (1 - alpha) * old_avg
    combined_count = old_count + len(new_values)

    return combined_avg, combined_count
```

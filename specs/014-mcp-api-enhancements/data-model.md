# Data Model: MCP API Enhancements

## Schema Changes

This feature requires adding soft delete support to two existing tables that currently lack the `deletedAt` column.

### Entity: Transcript (Modification)

**Purpose**: Stores conversation transcripts from probe runs. Needs soft delete to cascade from run deletion.

**Current Storage**: `transcripts` table

**New Field**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| deletedAt | DateTime? | nullable, indexed | Soft delete timestamp |

**Index**: `idx_transcripts_deleted_at` on `deleted_at` column

**Query Impact**: All existing queries must add `deletedAt: null` filter

---

### Entity: AnalysisResult (Modification)

**Purpose**: Stores computed analysis results for runs. Needs soft delete to cascade from run deletion.

**Current Storage**: `analysis_results` table

**New Field**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| deletedAt | DateTime? | nullable, indexed | Soft delete timestamp |

**Index**: `idx_analysis_results_deleted_at` on `deleted_at` column

**Query Impact**: All existing queries must add `deletedAt: null` filter

---

## Prisma Schema Updates

### Transcript Model

```prisma
model Transcript {
  id                 String    @id @default(cuid())
  runId              String    @map("run_id")
  scenarioId         String?   @map("scenario_id")
  modelId            String    @map("model_id")
  modelVersion       String?   @map("model_version")
  definitionSnapshot Json?     @map("definition_snapshot") @db.JsonB
  content            Json      @db.JsonB
  turnCount          Int       @map("turn_count")
  tokenCount         Int       @map("token_count")
  durationMs         Int       @map("duration_ms")
  createdAt          DateTime  @default(now()) @map("created_at")
  lastAccessedAt     DateTime? @map("last_accessed_at")
  contentExpiresAt   DateTime? @map("content_expires_at")
  decisionCode       String?   @map("decision_code")
  decisionText       String?   @map("decision_text")
  summarizedAt       DateTime? @map("summarized_at")
  deletedAt          DateTime? @map("deleted_at")  // NEW

  run      Run       @relation(fields: [runId], references: [id], onDelete: Cascade)
  scenario Scenario? @relation(fields: [scenarioId], references: [id])

  @@index([runId])
  @@index([scenarioId])
  @@index([modelId])
  @@index([deletedAt])  // NEW
  @@map("transcripts")
}
```

### AnalysisResult Model

```prisma
model AnalysisResult {
  id           String         @id @default(cuid())
  runId        String         @map("run_id")
  analysisType String         @map("analysis_type")
  inputHash    String         @map("input_hash")
  codeVersion  String         @map("code_version")
  output       Json           @db.JsonB
  status       AnalysisStatus @default(CURRENT)
  createdAt    DateTime       @default(now()) @map("created_at")
  deletedAt    DateTime?      @map("deleted_at")  // NEW

  run Run @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@index([runId])
  @@index([analysisType])
  @@index([status])
  @@index([deletedAt])  // NEW
  @@map("analysis_results")
}
```

---

## Migration SQL

```sql
-- Migration: add_soft_delete_transcript_analysis
-- Description: Add deletedAt column for soft delete support

-- Add deletedAt to transcripts
ALTER TABLE transcripts ADD COLUMN deleted_at TIMESTAMP;
CREATE INDEX idx_transcripts_deleted_at ON transcripts(deleted_at);

-- Add deletedAt to analysis_results
ALTER TABLE analysis_results ADD COLUMN deleted_at TIMESTAMP;
CREATE INDEX idx_analysis_results_deleted_at ON analysis_results(deleted_at);
```

---

## Type Definitions

### DeleteResult Type

```typescript
/**
 * Result of a soft-delete operation.
 */
export type DeleteResult = {
  success: boolean;
  entityType: 'definition' | 'run';
  entityId: string;
  deletedAt: Date;
  deletedCount: {
    primary: number;
    scenarios?: number;      // For definitions
    transcripts?: number;    // For runs
    analysisResults?: number; // For runs
  };
};
```

### Soft Delete Query Helper Types

```typescript
/**
 * Common filter for excluding soft-deleted records.
 */
export type NotDeleted = {
  deletedAt: null;
};

/**
 * Definition with soft-delete filter applied.
 */
export type ActiveDefinition = Definition & NotDeleted;

/**
 * Run with soft-delete filter applied.
 */
export type ActiveRun = Run & NotDeleted;

/**
 * Transcript with soft-delete filter applied.
 */
export type ActiveTranscript = Transcript & NotDeleted;
```

---

## Query Patterns

### Soft Delete a Definition (with cascade)

```typescript
async function softDeleteDefinition(id: string): Promise<DeleteResult> {
  const now = new Date();

  // Verify not already deleted and no running runs
  const definition = await db.definition.findFirst({
    where: { id, deletedAt: null },
    include: {
      runs: { where: { status: 'RUNNING', deletedAt: null } },
      scenarios: { where: { deletedAt: null } },
    },
  });

  if (!definition) {
    throw new NotFoundError('Definition', id);
  }

  if (definition.runs.length > 0) {
    throw new ValidationError('Cannot delete definition with running runs');
  }

  // Cascade soft-delete in transaction
  const [_, scenarioCount] = await db.$transaction([
    db.definition.update({
      where: { id },
      data: { deletedAt: now },
    }),
    db.scenario.updateMany({
      where: { definitionId: id, deletedAt: null },
      data: { deletedAt: now },
    }),
  ]);

  return {
    success: true,
    entityType: 'definition',
    entityId: id,
    deletedAt: now,
    deletedCount: {
      primary: 1,
      scenarios: scenarioCount.count,
    },
  };
}
```

### Soft Delete a Run (with cascade)

```typescript
async function softDeleteRun(id: string): Promise<DeleteResult> {
  const now = new Date();

  // Verify not already deleted
  const run = await db.run.findFirst({
    where: { id, deletedAt: null },
    include: {
      transcripts: { where: { deletedAt: null }, select: { id: true } },
      analysisResults: { where: { deletedAt: null }, select: { id: true } },
    },
  });

  if (!run) {
    throw new NotFoundError('Run', id);
  }

  // Cancel any running jobs first
  if (run.status === 'RUNNING' || run.status === 'PENDING') {
    await cancelRunJobs(id);
  }

  // Cascade soft-delete in transaction
  const [_, transcriptCount, analysisCount] = await db.$transaction([
    db.run.update({
      where: { id },
      data: { deletedAt: now, status: 'CANCELLED' },
    }),
    db.transcript.updateMany({
      where: { runId: id, deletedAt: null },
      data: { deletedAt: now },
    }),
    db.analysisResult.updateMany({
      where: { runId: id, deletedAt: null },
      data: { deletedAt: now },
    }),
  ]);

  return {
    success: true,
    entityType: 'run',
    entityId: id,
    deletedAt: now,
    deletedCount: {
      primary: 1,
      transcripts: transcriptCount.count,
      analysisResults: analysisCount.count,
    },
  };
}
```

### Query Active Records Only

```typescript
// Get all non-deleted definitions
const definitions = await db.definition.findMany({
  where: { deletedAt: null },
  orderBy: { createdAt: 'desc' },
});

// Get run with non-deleted transcripts
const run = await db.run.findUnique({
  where: { id: runId },
  include: {
    transcripts: { where: { deletedAt: null } },
    analysisResults: { where: { deletedAt: null } },
  },
});
```

---

## Existing Tables with Soft Delete (Reference)

These tables already have `deletedAt` support:

| Table | Column | Index |
|-------|--------|-------|
| definitions | deleted_at | Yes |
| runs | deleted_at | Yes |
| scenarios | deleted_at | Yes |
| definition_tags | deleted_at | Yes |

**Pattern Consistency**: The new soft delete columns follow the same pattern for consistency.

---

## Notes

### Index Strategy
- Partial indexes not needed since most queries will filter `deletedAt: null`
- Standard B-tree index sufficient for timestamp column
- Index supports both equality (`deletedAt: null`) and range queries (future pruning)

### Data Retention
- Soft-deleted records persist indefinitely by default
- Future feature can implement pruning based on `deletedAt` age
- Recovery possible by setting `deletedAt: null`

### Performance Considerations
- Adding index during migration is safe (additive, not blocking)
- Queries may see slight overhead from additional filter (negligible)
- Large cascade deletes should use batched updates if needed

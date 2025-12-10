# Data Model: Data Export & CLI Compatibility

## Entities

### Entity: ExportJob

**Purpose**: Tracks async export operations with status, download URL, and expiry.

**Storage**: `export_jobs` table

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PRIMARY KEY | Unique identifier |
| user_id | String (cuid) | FOREIGN KEY, NOT NULL | User who initiated export |
| type | ExportType enum | NOT NULL | Type of export (see enum below) |
| status | ExportJobStatus enum | NOT NULL, DEFAULT PENDING | Current status |
| input | JSONB | NOT NULL | Export parameters (runId, definitionId, format options) |
| output_path | String | NULLABLE | Temporary file path when complete |
| output_url | String | NULLABLE | Signed download URL when complete |
| output_size_bytes | Int | NULLABLE | Size of generated export file |
| record_count | Int | NULLABLE | Number of records exported |
| expires_at | DateTime | NULLABLE | When download URL expires |
| error | String | NULLABLE | Error message if failed |
| created_at | DateTime | NOT NULL, DEFAULT NOW | When job was created |
| started_at | DateTime | NULLABLE | When processing started |
| completed_at | DateTime | NULLABLE | When job completed (success or failure) |

**Enums**:

```prisma
enum ExportType {
  DEFINITION_MD     // Single definition as markdown
  SCENARIOS_YAML    // Scenarios for definition as CLI YAML
  RUN_BUNDLE        // Full run as ZIP (transcripts + manifest)
  BULK_JSONL        // Transcripts as JSON Lines
  BULK_CSV          // Transcripts as CSV
}

enum ExportJobStatus {
  PENDING           // Job queued, waiting for worker
  PROCESSING        // Worker is generating export
  COMPLETED         // Export ready for download
  FAILED            // Export failed
  EXPIRED           // Download URL has expired
}
```

**Indexes**:
- `idx_export_jobs_user_id` on `user_id` (find user's exports)
- `idx_export_jobs_status` on `status` (find pending/processing jobs)
- `idx_export_jobs_expires_at` on `expires_at` WHERE `status = 'COMPLETED'` (cleanup expired)

**Relationships**:
- `User` → many `ExportJob` (one user can have many exports)
- Optional: `Run` → many `ExportJob` (track exports per run for analytics)

**Validation Rules**:
- `output_url` must be set when `status = COMPLETED`
- `error` must be set when `status = FAILED`
- `expires_at` must be in future when `status = COMPLETED`

---

## Type Definitions

### Prisma Schema

```prisma
// packages/db/prisma/schema.prisma

enum ExportType {
  DEFINITION_MD
  SCENARIOS_YAML
  RUN_BUNDLE
  BULK_JSONL
  BULK_CSV
}

enum ExportJobStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  EXPIRED
}

model ExportJob {
  id            String          @id @default(cuid())
  userId        String          @map("user_id")
  type          ExportType
  status        ExportJobStatus @default(PENDING)
  input         Json            @db.JsonB
  outputPath    String?         @map("output_path")
  outputUrl     String?         @map("output_url")
  outputSize    Int?            @map("output_size_bytes")
  recordCount   Int?            @map("record_count")
  expiresAt     DateTime?       @map("expires_at")
  error         String?
  createdAt     DateTime        @default(now()) @map("created_at")
  startedAt     DateTime?       @map("started_at")
  completedAt   DateTime?       @map("completed_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([status])
  @@index([expiresAt])
  @@map("export_jobs")
}

// Add to existing User model
model User {
  // ... existing fields ...
  exportJobs ExportJob[]
}
```

### TypeScript Types

```typescript
// packages/db/src/types.ts

export type ExportJobInput = {
  type: ExportType;
  definitionId?: string;
  runId?: string;
  format?: 'jsonl' | 'csv' | 'zip';
  expiryHours?: number;
};

export type ExportJobResult = {
  id: string;
  status: ExportJobStatus;
  downloadUrl: string | null;
  expiresAt: Date | null;
  recordCount: number | null;
  error: string | null;
};

// Input validation schema
export const ExportJobInputSchema = z.object({
  type: z.enum(['DEFINITION_MD', 'SCENARIOS_YAML', 'RUN_BUNDLE', 'BULK_JSONL', 'BULK_CSV']),
  definitionId: z.string().cuid().optional(),
  runId: z.string().cuid().optional(),
  format: z.enum(['jsonl', 'csv', 'zip']).optional(),
  expiryHours: z.number().int().min(1).max(168).default(24),
}).refine(
  (data) => {
    // Validate required IDs based on export type
    if (['DEFINITION_MD', 'SCENARIOS_YAML'].includes(data.type)) {
      return !!data.definitionId;
    }
    if (['RUN_BUNDLE', 'BULK_JSONL', 'BULK_CSV'].includes(data.type)) {
      return !!data.runId;
    }
    return true;
  },
  { message: 'Required ID not provided for export type' }
);
```

---

## Migration

```sql
-- Migration: Add ExportJob table
-- packages/db/prisma/migrations/YYYYMMDDHHMMSS_add_export_jobs/migration.sql

-- Create enums
CREATE TYPE "ExportType" AS ENUM (
  'DEFINITION_MD',
  'SCENARIOS_YAML',
  'RUN_BUNDLE',
  'BULK_JSONL',
  'BULK_CSV'
);

CREATE TYPE "ExportJobStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'EXPIRED'
);

-- Create export_jobs table
CREATE TABLE "export_jobs" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "type" "ExportType" NOT NULL,
  "status" "ExportJobStatus" NOT NULL DEFAULT 'PENDING',
  "input" JSONB NOT NULL,
  "output_path" TEXT,
  "output_url" TEXT,
  "output_size_bytes" INTEGER,
  "record_count" INTEGER,
  "expires_at" TIMESTAMPTZ,
  "error" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,

  CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "export_jobs_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create indexes
CREATE INDEX "idx_export_jobs_user_id" ON "export_jobs"("user_id");
CREATE INDEX "idx_export_jobs_status" ON "export_jobs"("status");
CREATE INDEX "idx_export_jobs_expires_at" ON "export_jobs"("expires_at")
  WHERE "status" = 'COMPLETED';
```

---

## MD Definition Format Reference

The MD format maps to cloud's `DefinitionContent` type:

### Cloud → MD Mapping

| Cloud Field | MD Section | Notes |
|-------------|------------|-------|
| `definition.name` | frontmatter: `name` | Required |
| `content.preamble` | `# Preamble` | Free text |
| `content.template` | `# Template` | Contains `[placeholder]` syntax |
| `content.dimensions` | `# Dimensions` | Markdown tables |
| `content.matching_rules` | `# Matching Rules` | Optional |
| `tags[0].name` | frontmatter: `category` | First tag as category |

### MD Dimension Table Format

```markdown
## DimensionName

| Score | Label | Options |
|-------|-------|---------|
| 1 | Low | option1, option2 |
| 2 | Medium | option3 |
| 3 | High | option4, option5 |
```

Maps to:
```typescript
{
  name: "DimensionName",
  levels: [
    { score: 1, label: "Low", options: ["option1", "option2"] },
    { score: 2, label: "Medium", options: ["option3"] },
    { score: 3, label: "High", options: ["option4", "option5"] }
  ]
}
```

---

## CLI YAML Scenario Format Reference

### Format Structure

```yaml
preamble: >
  Multi-line preamble text
  from definition...

scenarios:
  scenario_001_Dim1_Dim2:
    base_id: scenario_001
    category: DimensionA_vs_DimensionB
    subject: Human-readable title with dimension values
    body: |
      Full scenario prompt text.
      Multiple paragraphs supported.

      Options or questions at the end.
```

### Cloud → YAML Mapping

| Cloud Field | YAML Field | Notes |
|-------------|-----------|-------|
| `content.preamble` | root `preamble` | Block scalar |
| `scenario.name` | scenario key | e.g., `scenario_001_...` |
| `scenario.content.prompt` | `body` | Block scalar for multi-line |
| `scenario.content.dimension_values` | Used in `subject` | Human-readable |
| First tag | `category` | Or derived from dimensions |

# Implementation Plan: Data Export & CLI Compatibility

**Branch**: `feature/stage-15-data-export` | **Date**: 2025-12-08 | **Spec**: [spec.md](./spec.md)

## Summary

Implement comprehensive data export capabilities with emphasis on round-trip MD definition format and CLI-compatible YAML scenario export. Builds on existing CSV export infrastructure (`services/export/csv.ts`) to add new format serializers and an async export job system for large exports.

---

## Technical Context

**Language/Version**: TypeScript 5.3+, Node.js 20+
**Primary Dependencies**:
- `js-yaml` (YAML serialization - already in devtool, add to cloud)
- `archiver` (ZIP creation for bundles)
- Existing: `@prisma/client`, `express`, `pothos`

**Storage**: PostgreSQL (existing - add ExportJob table)
**Testing**: Vitest (80%+ coverage per constitution)
**Target Platform**: Docker/Railway
**Performance Goals**: 1000 transcripts export < 30 seconds (from spec SC-004)
**Constraints**: Files < 400 lines, no `any` types (per CLAUDE.md)

---

## Constitution Check

**Status**: PASS

Validated against `cloud/CLAUDE.md`:

| Requirement | Compliance |
|-------------|------------|
| File size < 400 lines | Each serializer is a separate file ~150-200 lines |
| No `any` types | Use typed interfaces from existing schema |
| Test coverage 80%+ | Service and route tests required |
| Structured logging | All export operations logged with context |
| Error handling | Use existing AppError patterns |

---

## Architecture Decisions

### Decision 1: Serializer Module Structure

**Chosen**: Separate serializer files per format under `services/export/`

**Rationale**:
- Follows existing pattern from `services/export/csv.ts`
- Each serializer is independently testable
- Keeps files under 400 line limit

**Alternatives Considered**:
- Single large export module: Would exceed file size limits
- Generic serializer factory: Over-engineering for 4 formats

**File Structure**:
```
apps/api/src/services/export/
├── index.ts          # Re-exports public API
├── csv.ts            # Existing CSV serializer
├── md.ts             # NEW: Definition → MD format
├── yaml.ts           # NEW: Scenarios → CLI YAML format
├── bundle.ts         # NEW: Full run bundle (zip)
├── jsonl.ts          # NEW: JSON Lines format
└── types.ts          # Export-related type definitions
```

---

### Decision 2: MD Format Implementation

**Chosen**: Port devtool's `scenarioMd.ts` parser/serializer to cloud

**Rationale**:
- Devtool already has working implementation
- Ensures 100% format compatibility
- Tested round-trip fidelity

**Implementation**:
- Copy parse/serialize functions from `devtool/src/server/utils/scenarioMd.ts`
- Adapt to use cloud's `DefinitionContent` types
- Add mapping layer between cloud schema and MD format fields

**Field Mapping (Cloud → MD)**:
```
DefinitionContent.preamble    → # Preamble section
DefinitionContent.template    → # Template section
DefinitionContent.dimensions  → # Dimensions section (as tables)
DefinitionContent.matching_rules → # Matching Rules section
definition.name               → frontmatter: name
content.base_id (if present)  → frontmatter: base_id
tags                          → frontmatter: category (first tag)
```

---

### Decision 3: YAML Scenario Export

**Chosen**: Generate CLI-compatible YAML matching existing `scenarios/*.yaml` format

**Rationale**:
- CLI tool expects specific format with `preamble` + `scenarios` map
- Must be directly usable by `probe.py` without modification

**Format**:
```yaml
preamble: >
  [definition preamble]

scenarios:
  scenario_001_Dim1_Dim2:
    base_id: scenario_001
    category: [category from tags]
    subject: [generated title]
    body: |
      [scenario prompt text]
```

**Implementation**:
- Build from existing `Scenario` records in database
- Use `js-yaml` library for proper YAML generation
- Block scalar notation (`|`) for multi-line body fields

---

### Decision 4: Async Export Job System

**Chosen**: New `ExportJob` table with polling-based status

**Rationale**:
- Large exports (1000+ transcripts) need async processing
- Consistent with existing run execution polling pattern
- Download URLs with expiry for security

**Flow**:
1. Client requests export → API creates ExportJob, returns job ID
2. Background worker generates file, stores to temp location
3. Client polls job status until `completed`
4. Client downloads via signed URL (24h expiry)

**Alternatives Considered**:
- Synchronous streaming: Won't work for very large exports
- WebSocket notifications: Over-engineering for export use case

---

### Decision 5: Import Implementation

**Chosen**: GraphQL mutations for MD import, REST endpoint for file upload

**Rationale**:
- File uploads work better over REST (multipart/form-data)
- Business logic in GraphQL mutation for consistency
- Validation returns structured errors

**Flow**:
1. `POST /api/import/definition` - Upload MD file
2. Server parses MD, validates structure
3. Creates new Definition via existing mutation logic
4. Returns Definition ID or validation errors

---

## Project Structure

### New Files

```
apps/api/src/
├── services/export/
│   ├── md.ts                    # MD serializer/parser (~200 lines)
│   ├── yaml.ts                  # YAML scenario export (~150 lines)
│   ├── bundle.ts                # ZIP bundle generator (~200 lines)
│   ├── jsonl.ts                 # JSON Lines format (~100 lines)
│   ├── download.ts              # Download URL generation (~100 lines)
│   └── types.ts                 # Export types (~50 lines)
├── services/import/
│   ├── md.ts                    # MD parser + validation (~200 lines)
│   └── types.ts                 # Import types (~30 lines)
├── routes/
│   └── import.ts                # Import REST endpoint (~100 lines)
├── graphql/mutations/
│   └── export.ts                # Export mutations (~150 lines)
├── graphql/queries/
│   └── export.ts                # Export job queries (~100 lines)
├── queue/handlers/
│   └── export.ts                # Async export job handler (~150 lines)

packages/db/prisma/
└── schema.prisma                # Add ExportJob model

apps/web/src/
├── components/export/
│   ├── ExportDialog.tsx         # Export format selection (~200 lines)
│   └── ExportStatus.tsx         # Export job progress (~100 lines)
├── components/import/
│   └── ImportDialog.tsx         # MD file upload (~200 lines)
├── api/
│   └── export.ts                # Export API client (~100 lines)
```

### Modified Files

```
apps/api/src/routes/index.ts     # Add import router
apps/api/src/graphql/index.ts    # Add export queries/mutations
apps/api/src/queue/types.ts      # Add export job type
packages/db/prisma/schema.prisma # Add ExportJob model
```

---

## Key Implementation Details

### MD Serializer (`services/export/md.ts`)

```typescript
// Type mapping from cloud to MD format
interface MDDefinition {
  name: string;
  base_id: string;
  category: string;
  preamble: string;
  template: string;
  dimensions: {
    name: string;
    values: { score: number; label: string; options: string[] }[];
  }[];
  matchingRules: string;
}

// Serialize cloud definition to MD string
export function serializeDefinitionToMd(
  definition: Definition,
  content: DefinitionContent,
  tags: Tag[]
): string

// Parse MD string to cloud-compatible structure
export function parseMdToDefinition(
  mdContent: string
): { name: string; content: DefinitionContent; category?: string }
```

### YAML Scenario Export (`services/export/yaml.ts`)

```typescript
// CLI-compatible YAML structure
interface CLIScenarioFile {
  preamble: string;
  scenarios: Record<string, {
    base_id: string;
    category: string;
    subject: string;
    body: string;
  }>;
}

// Generate CLI-compatible YAML from scenarios
export function serializeScenariosToYaml(
  scenarios: Scenario[],
  preamble: string
): string
```

### Export Job Queue Handler

```typescript
// Job payload for export tasks
type ExportJobPayload = {
  type: 'definition_md' | 'scenarios_yaml' | 'run_bundle' | 'bulk_jsonl';
  params: ExportParams;
  userId: string;
};

// Handler generates file and updates job with download URL
async function handleExportJob(job: Job<ExportJobPayload>): Promise<void>
```

---

## API Contracts

### GraphQL Mutations

```graphql
type Mutation {
  # Synchronous export for small files
  exportDefinitionAsMd(id: ID!): ExportResult!
  exportScenariosAsYaml(definitionId: ID!): ExportResult!

  # Async export for large datasets
  createExportJob(input: ExportJobInput!): ExportJob!
}

type Query {
  exportJob(id: ID!): ExportJob
}

input ExportJobInput {
  type: ExportType!
  runId: ID
  definitionId: ID
  format: ExportFormat
  expiryHours: Int # default 24
}

enum ExportType {
  RUN_BUNDLE
  BULK_JSONL
  BULK_CSV
}

enum ExportFormat {
  JSON_LINES
  CSV
  ZIP
}

type ExportJob {
  id: ID!
  status: ExportJobStatus!
  downloadUrl: String
  expiresAt: DateTime
  error: String
  createdAt: DateTime!
  completedAt: DateTime
}

enum ExportJobStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

type ExportResult {
  content: String!  # For sync exports
  filename: String!
  mimeType: String!
}
```

### REST Endpoints

```
POST /api/import/definition
  Content-Type: multipart/form-data
  Body: { file: <md-file>, name?: string }
  Response: { definitionId: string } | { errors: ValidationError[] }

GET /api/export/download/:jobId
  Response: File stream or 410 Gone if expired
```

---

## Testing Strategy

### Unit Tests

- `services/export/md.test.ts` - MD serialization round-trip
- `services/export/yaml.test.ts` - YAML format validation
- `services/export/bundle.test.ts` - ZIP structure validation
- `services/import/md.test.ts` - MD parsing + validation

### Integration Tests

- `routes/import.test.ts` - File upload handling
- `graphql/mutations/export.test.ts` - Export mutation flow
- `queue/handlers/export.test.ts` - Async export processing

### Round-Trip Tests

Critical: Ensure exported MD can be imported back
```typescript
it('should round-trip definition through MD export/import', async () => {
  const original = await createDefinition(testContent);
  const md = await exportDefinitionAsMd(original.id);
  const imported = await importDefinitionFromMd(md);
  expect(imported.content).toEqual(original.content);
});
```

---

## Dependencies to Add

```json
// apps/api/package.json
{
  "dependencies": {
    "js-yaml": "^4.1.0",
    "archiver": "^6.0.0"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.0",
    "@types/archiver": "^6.0.0"
  }
}
```

---

## Performance Considerations

1. **Streaming for large exports**: Use Node.js streams for ZIP and JSONL generation
2. **Chunked database queries**: Fetch transcripts in batches of 100 to avoid memory issues
3. **Background processing**: All exports > 1000 records go through job queue
4. **Download URL expiry**: 24h default prevents stale downloads consuming storage

---

## Security Considerations

1. **Authentication required**: All export/import endpoints require valid JWT or API key
2. **Audit logging**: Log all export operations with user ID and record counts
3. **Input validation**: Validate MD structure before creating definitions
4. **Download URL signing**: Use time-limited tokens for download URLs
5. **File size limits**: Limit uploaded MD files to 1MB

---

## Rollout Plan

1. **Phase 1**: MD export/import (P1 user stories 1-2)
2. **Phase 2**: YAML scenario export (P1 user story 3)
3. **Phase 3**: Bulk export jobs (P2 user stories 4-6)
4. **Phase 4**: Aggregation export (P3 user stories 7-8)

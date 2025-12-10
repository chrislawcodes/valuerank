# Stage 2: Implementation Plan

> **Spec:** [stage-2-database.md](./stage-2-database.md)
>
> **Goal:** Implement the core PostgreSQL schema with Prisma, including all tables needed for MVP.

---

## Summary

Implement the complete database schema using Prisma, including versioned definitions with ancestry queries, authentication tables, and analysis infrastructure. Add query helpers and a seed script for development.

---

## Technical Context

**Language/Version**: TypeScript 5.3+ (strict mode)
**Primary Dependencies**: Prisma 5.7+, @prisma/client
**Storage**: PostgreSQL 16 (via Docker Compose from Stage 1)
**Testing**: Vitest for query helper tests
**Target Platform**: Local Docker + Railway (production)
**Performance Goals**: Recursive CTE queries < 100ms for 10-level trees
**Constraints**: All JSONB content must include schema_version field

---

## Constitution Check

**Status**: PASS

Per [CLAUDE.md](../CLAUDE.md):

- **No `any` Types**: Prisma generates fully typed client
- **TypeScript Strict Mode**: Schema compatible with all strict options
- **File Size < 400 lines**: Split schema into logical sections if needed
- **Structured Logging**: Query helpers use createLogger
- **Test Coverage**: Query helpers must have tests

---

## Architecture Decisions

### Decision 1: Prisma Schema Organization

**Chosen**: Single schema.prisma file with logical sections via comments

**Rationale**:
- Prisma doesn't natively support multi-file schemas without additional tooling
- Stage 1 established Prisma in packages/db
- Schema under 400 lines with comments is manageable

**Alternatives Considered**:
- Multi-file with prisma-merge: Adds build complexity
- Raw SQL migrations: Loses type generation benefits

**Tradeoffs**:
- Pros: Simple, standard Prisma workflow
- Cons: Single file may grow; mitigate with clear section comments

---

### Decision 2: JSONB Schema Versioning Pattern

**Chosen**: Read-time migration with version field in all JSONB columns

**Rationale**:
- Per database-design.md strategy
- No batch migrations needed
- Additive changes require no migration
- Breaking changes handled at read-time

**Implementation**:
```typescript
// packages/db/src/schema-migration.ts
function loadDefinitionContent(raw: unknown): DefinitionContent {
  const data = raw as { schema_version?: number };
  switch (data.schema_version ?? 0) {
    case 0: return migrateV0toV1(data);
    case 1: return data as DefinitionContent;
    default: throw new Error(`Unknown schema version`);
  }
}
```

**Tradeoffs**:
- Pros: Zero-downtime schema evolution
- Cons: Read-time overhead (minimal for simple migrations)

---

### Decision 3: Recursive CTE vs ltree

**Chosen**: Recursive CTEs for ancestry queries (no ltree extension)

**Rationale**:
- Simpler deployment (no PostgreSQL extension required)
- Sufficient for MVP scale (< 1000 definitions expected)
- Can add ltree later if performance requires

**Alternatives Considered**:
- ltree extension: Better performance at scale, more complex setup

**Tradeoffs**:
- Pros: Standard PostgreSQL, no extension management
- Cons: May need optimization for very deep trees (> 100 levels)

---

### Decision 4: Query Helper Organization

**Chosen**: One file per domain (definitions, runs, transcripts, etc.) in packages/db/src/queries/

**Rationale**:
- Per CLAUDE.md file organization guidelines
- Clear separation of concerns
- Each file < 400 lines

**Structure**:
```
packages/db/src/
├── queries/
│   ├── index.ts           # Re-exports
│   ├── definitions.ts     # Definition CRUD + ancestry
│   ├── runs.ts            # Run CRUD + progress
│   ├── transcripts.ts     # Transcript CRUD
│   ├── users.ts           # User/API key operations
│   └── analysis.ts        # Analysis results + experiments
├── schema-migration.ts    # JSONB versioning helpers
└── seed.ts               # Development seed data
```

---

## Project Structure

Based on Stage 1 scaffolding:

```
packages/db/
├── src/
│   ├── index.ts                 # Re-exports client + queries
│   ├── client.ts                # Prisma client singleton (exists)
│   ├── schema-migration.ts      # NEW: JSONB versioning utilities
│   ├── types.ts                 # NEW: Domain types for JSONB content
│   └── queries/
│       ├── index.ts             # NEW: Query exports
│       ├── definitions.ts       # NEW: Definition queries
│       ├── runs.ts              # NEW: Run queries
│       ├── transcripts.ts       # NEW: Transcript queries
│       ├── users.ts             # NEW: User/auth queries
│       └── analysis.ts          # NEW: Analysis queries
├── prisma/
│   ├── schema.prisma            # MODIFY: Full schema
│   ├── migrations/              # GENERATED: Migration files
│   └── seed.ts                  # NEW: Seed script
├── tests/
│   ├── definitions.test.ts      # NEW: Definition query tests
│   ├── ancestry.test.ts         # NEW: Recursive CTE tests
│   └── schema-migration.test.ts # NEW: JSONB versioning tests
├── package.json                 # MODIFY: Add seed script
└── tsconfig.json               # No changes
```

---

## Data Model

### Prisma Schema Overview

The full schema implements these table groups:

**Authentication (2 tables)**:
- `users` - User accounts with password hashes
- `api_keys` - API access tokens with hashed keys

**Core Domain (4 tables)**:
- `definitions` - Scenario definitions with parent_id for versioning
- `runs` - Pipeline execution records
- `transcripts` - Raw dialogue with metrics
- `scenarios` - Generated scenario variants

**Analysis (4 tables)**:
- `experiments` - Scientific experiment tracking
- `run_comparisons` - Delta analysis between runs
- `analysis_results` - Versioned analysis output
- `rubrics` - Values rubric versions

**Supporting**:
- `run_scenario_selection` - Track sampled scenarios (join table)
- `cohorts` - Segment groupings for analysis

### Key Relationships

```
definitions
  ├─< definitions (self-ref: parent_id)
  ├─< runs
  └─< scenarios

runs
  ├─< transcripts
  ├─< analysis_results
  └─< run_comparisons (baseline + comparison)

users
  └─< api_keys

experiments
  └─< runs
  └─< run_comparisons
```

### JSONB Content Types

All JSONB columns include `schema_version`:

```typescript
// packages/db/src/types.ts

export type DefinitionContent = {
  schema_version: 1;
  preamble: string;
  template: string;
  dimensions: Dimension[];
  matching_rules?: string;
};

export type RunConfig = {
  schema_version: 1;
  models: string[];
  temperature?: number;
  sample_percentage?: number;
};

export type RunProgress = {
  total: number;
  completed: number;
  failed: number;
};

export type AnalysisPlan = {
  schema_version: 1;
  test: string;
  alpha: number;
  correction?: string;
};
```

---

## Query Helper Contracts

### definitions.ts

```typescript
// Create
createDefinition(data: CreateDefinitionInput): Promise<Definition>
forkDefinition(parentId: string, data: ForkDefinitionInput): Promise<Definition>

// Read
getDefinitionById(id: string): Promise<Definition | null>
getDefinitionWithContent(id: string): Promise<DefinitionWithContent | null>
listDefinitions(filters?: DefinitionFilters): Promise<Definition[]>

// Ancestry (recursive CTE)
getAncestors(id: string): Promise<Definition[]>
getDescendants(id: string): Promise<Definition[]>
getDefinitionTree(rootId: string): Promise<DefinitionTreeNode>

// Update
updateDefinition(id: string, data: UpdateDefinitionInput): Promise<Definition>
```

### runs.ts

```typescript
createRun(data: CreateRunInput): Promise<Run>
getRunById(id: string): Promise<Run | null>
getRunWithTranscripts(id: string): Promise<RunWithTranscripts | null>
listRuns(filters?: RunFilters): Promise<Run[]>
updateRunStatus(id: string, status: RunStatus): Promise<Run>
updateRunProgress(id: string, progress: RunProgress): Promise<Run>
getRunsForDefinitionTree(rootDefinitionId: string): Promise<Run[]>
```

### users.ts

```typescript
createUser(email: string, passwordHash: string): Promise<User>
getUserByEmail(email: string): Promise<User | null>
getUserById(id: string): Promise<User | null>

// API Keys
createApiKey(userId: string, name: string, keyHash: string, prefix: string): Promise<ApiKey>
getApiKeyByPrefix(prefix: string): Promise<ApiKey | null>
listApiKeysForUser(userId: string): Promise<ApiKey[]>
deleteApiKey(id: string): Promise<void>
```

---

## Error Handling (Constitution § Error Handling)

Query helpers must use custom error classes from `@valuerank/shared`:

```typescript
// packages/db/src/queries/definitions.ts
import { NotFoundError, ValidationError } from '@valuerank/shared';
import { createLogger } from '@valuerank/shared';

const log = createLogger('db:definitions');

export async function getDefinitionById(id: string): Promise<Definition> {
  log.debug({ id }, 'Fetching definition');
  const def = await prisma.definition.findUnique({ where: { id } });
  if (!def) {
    log.warn({ id }, 'Definition not found');
    throw new NotFoundError('Definition', id);
  }
  return def;
}

export async function createDefinition(data: CreateDefinitionInput): Promise<Definition> {
  if (!data.content) {
    throw new ValidationError('Definition content is required', { field: 'content' });
  }
  log.info({ name: data.name }, 'Creating definition');
  return prisma.definition.create({ data });
}
```

---

## Transaction Safety (Constitution § Database Access)

Multi-step operations must use Prisma transactions:

```typescript
// forkDefinition creates a new definition linked to parent
export async function forkDefinition(
  parentId: string,
  data: ForkDefinitionInput
): Promise<Definition> {
  return prisma.$transaction(async (tx) => {
    // Verify parent exists
    const parent = await tx.definition.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundError('Definition', parentId);

    // Create forked definition
    const forked = await tx.definition.create({
      data: {
        ...data,
        parentId,
        content: data.content ?? parent.content,
      },
    });

    log.info({ parentId, forkedId: forked.id }, 'Definition forked');
    return forked;
  });
}
```

---

## Migration Strategy

### Prisma Workflow

1. Modify `schema.prisma` with all models
2. Run `npx prisma migrate dev --name init_full_schema`
3. Migration creates all tables atomically
4. Run `npx prisma generate` to update client types

### Seed Script

```typescript
// packages/db/prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create sample user
  const user = await prisma.user.upsert({
    where: { email: 'dev@valuerank.ai' },
    update: {},
    create: { email: 'dev@valuerank.ai', passwordHash: '...' },
  });

  // Create definition tree
  const rootDef = await prisma.definition.upsert({...});
  const childDef = await prisma.definition.upsert({
    ...
    parentId: rootDef.id,
  });

  // Create sample run with transcripts
  const run = await prisma.run.create({...});
  await prisma.transcript.createMany({...});
}
```

**package.json script**:
```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

---

## Testing Strategy

### Unit Tests (Vitest)

**Query Helpers**:
- Mock Prisma client for unit tests
- Test each query function in isolation
- Verify correct Prisma calls are made

**Schema Migration**:
- Test v0 → v1 migration
- Test handling of unknown versions
- Test current version pass-through

### Integration Tests

**Database Tests** (using test database):
- Create definition tree, verify ancestry queries
- Create run with transcripts, verify relationships
- Test cascade deletes

### Test Database Setup

```typescript
// packages/db/tests/setup.ts
import { PrismaClient } from '@prisma/client';

export const testDb = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

beforeEach(async () => {
  // Clean tables in dependency order
  await testDb.transcript.deleteMany();
  await testDb.run.deleteMany();
  await testDb.definition.deleteMany();
  // ...
});
```

---

## Quickstart: Manual Testing

### Prerequisites

- [ ] Docker running with PostgreSQL (from Stage 1)
- [ ] `npm install` completed
- [ ] `.env` has DATABASE_URL

### Testing User Story 1: Core Data Tables

**Goal**: Verify tables exist and accept data

**Steps**:
1. Run `npm run db:push` to sync schema
2. Open `npm run db:studio` to view tables
3. Create a user manually in Studio
4. Create a definition with JSONB content
5. Create a run linked to definition
6. Create a transcript linked to run

**Expected**:
- All tables visible in Studio
- Foreign key constraints enforced
- JSONB content stored correctly

### Testing User Story 2: Definition Ancestry

**Goal**: Verify recursive queries work

**Steps**:
1. Run seed script: `npm run db:seed`
2. Execute in psql or Studio:
```sql
WITH RECURSIVE ancestors AS (
  SELECT * FROM definitions WHERE id = '<child-id>'
  UNION ALL
  SELECT d.* FROM definitions d
  JOIN ancestors a ON d.id = a.parent_id
)
SELECT * FROM ancestors;
```

**Expected**:
- Full ancestry chain returned
- Root definition has NULL parent_id

### Testing User Story 3: JSONB Schema Versioning

**Goal**: Verify migrations at read-time

**Steps**:
1. Insert definition with `content = '{"preamble": "test"}'` (no schema_version)
2. Call `getDefinitionWithContent(id)`
3. Verify returned content has `schema_version: 1`

**Expected**:
- Old data migrated automatically
- No database modification required

---

## Next Steps

1. Review this plan for technical accuracy
2. When ready for task breakdown, invoke the **feature-tasks** skill
3. Or refine architecture decisions if needed

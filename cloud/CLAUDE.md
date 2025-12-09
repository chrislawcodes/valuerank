# Cloud ValueRank - Project Constitution

This document defines the coding standards and architectural principles for the Cloud ValueRank project. All code contributions must adhere to these guidelines.

## Git Push Policy

**NEVER push to origin without explicit human confirmation.** Always ask before running `git push`.

---

## Core Principles

1. **Small, focused files** - Easy to read, test, and maintain
2. **Type safety** - Catch errors at compile time, not runtime
3. **Test coverage** - Confidence to refactor and deploy
4. **Observable** - Debug issues in production without guessing

---

## File Size Limits

| File Type | Max Lines | Rationale |
|-----------|-----------|-----------|
| Route handlers | 400 | Single responsibility per route file |
| Services/business logic | 400 | Split into smaller modules if growing |
| Utilities | 400 | Pure functions, single purpose |
| React components | 400 | Extract hooks/subcomponents if larger |
| Test files | 400 | Can be longer due to setup/fixtures |
| Type definitions | 400 | Split by domain if growing |

**When a file exceeds limits:**
1. Extract helper functions to separate modules
2. Split into logical sub-modules
3. Create a folder with `index.ts` re-exporting

```
# Bad: one large file
services/runs.ts (500 lines)

# Good: split by concern
services/runs/
├── index.ts        # Re-exports public API
├── create.ts       # createRun logic
├── query.ts        # listRuns, getRun
├── analysis.ts     # runAnalysis, getResults
└── types.ts        # Run-specific types
```

---

## TypeScript Standards

### No `any` Types

```typescript
// Bad
function processData(data: any): any { ... }

// Good
function processData(data: RunConfig): ProcessedRun { ... }

// If type is truly unknown, use proper typing
function parseJson(input: string): unknown { ... }
function handleError(err: unknown): void { ... }
```

### Strict Mode Required

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### Type Inference vs Explicit Types

```typescript
// Let TypeScript infer when obvious
const count = 0;  // inferred as number
const items = []; // Bad - inferred as never[]
const items: string[] = []; // Good - explicit for empty arrays

// Always type function signatures
function calculateScore(run: Run, model: string): number { ... }

// Always type exported interfaces
export interface RunConfig {
  definitionId: string;
  models: string[];
  samplePercentage?: number;
}
```

### Prefer Types Over Interfaces for Data

```typescript
// Use type for data shapes
type RunStatus = 'pending' | 'running' | 'completed' | 'failed';

type Run = {
  id: string;
  status: RunStatus;
  createdAt: Date;
};

// Use interface for contracts/services
interface RunService {
  create(config: RunConfig): Promise<Run>;
  getById(id: string): Promise<Run | null>;
}
```

---

## Testing Requirements

### Coverage Targets

| Metric | Minimum | Target |
|--------|---------|--------|
| Line coverage | 80% | 90% |
| Branch coverage | 75% | 85% |
| Function coverage | 80% | 90% |

### Test Structure

```typescript
// tests/services/runs.test.ts
describe('RunService', () => {
  describe('create', () => {
    it('creates a run with valid config', async () => { ... });
    it('throws on invalid definition ID', async () => { ... });
    it('queues probe jobs for each model-scenario pair', async () => { ... });
  });

  describe('getById', () => {
    it('returns run when exists', async () => { ... });
    it('returns null when not found', async () => { ... });
  });
});
```

### Test Files Location

```
apps/api/
├── src/
│   └── services/
│       └── runs.ts
└── tests/
    └── services/
        └── runs.test.ts
```

### What to Test

- **Always test**: Business logic, data transformations, edge cases
- **Mock**: Database, external APIs, LLM providers
- **Integration tests**: API routes with test database
- **Skip**: Simple getters, direct ORM pass-through

---

## Logging Standards

### Logger Abstraction

All logging goes through a centralized logger - never use `console.log` directly.

```typescript
// packages/shared/src/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }
    : undefined,
});

export function createLogger(context: string) {
  return logger.child({ context });
}
```

### Usage in Services

```typescript
// services/runs.ts
import { createLogger } from '@valuerank/shared';

const log = createLogger('runs');

export async function createRun(config: RunConfig): Promise<Run> {
  log.info({ definitionId: config.definitionId, models: config.models }, 'Creating run');

  try {
    const run = await db.runs.create({ ... });
    log.info({ runId: run.id, taskCount: tasks.length }, 'Run created, tasks queued');
    return run;
  } catch (err) {
    log.error({ err, config }, 'Failed to create run');
    throw err;
  }
}
```

### Log Levels

| Level | Use For |
|-------|---------|
| `error` | Exceptions, failed operations that need attention |
| `warn` | Recoverable issues, deprecations, retry attempts |
| `info` | Key business events (run started, completed, user action) |
| `debug` | Detailed flow info, useful for local debugging |
| `trace` | Very verbose, rarely used |

### Structured Logging Rules

```typescript
// Always use structured data, not string interpolation
// Bad
log.info(`User ${userId} created run ${runId}`);

// Good
log.info({ userId, runId }, 'User created run');

// Include correlation IDs for request tracing
log.info({ requestId, runId, action: 'create' }, 'Processing request');

// Log errors with full context
log.error({ err, runId, modelId, scenarioId }, 'Probe task failed');
```

### Request Logging Middleware

```typescript
// middleware/requestLogger.ts
export function requestLogger(req, res, next) {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.log = logger.child({ requestId, path: req.path, method: req.method });

  req.log.info('Request started');

  res.on('finish', () => {
    req.log.info({ status: res.statusCode, duration: Date.now() - start }, 'Request completed');
  });

  next();
}
```

---

## Code Organization

### Import Order

```typescript
// 1. Node built-ins
import { readFile } from 'fs/promises';
import path from 'path';

// 2. External packages
import express from 'express';
import { z } from 'zod';

// 3. Internal packages (@valuerank/*)
import { logger } from '@valuerank/shared';
import { db } from '@valuerank/db';

// 4. Relative imports
import { validateRunConfig } from './validation';
import type { RunConfig } from './types';
```

### Folder Structure per App

```
apps/api/src/
├── routes/           # Express route handlers
├── services/         # Business logic
├── middleware/       # Express middleware
├── jobs/             # PgBoss job handlers
├── validation/       # Zod schemas
└── types/            # TypeScript types

apps/web/src/
├── components/       # React components
├── hooks/            # Custom hooks
├── pages/            # Route pages
├── services/         # API client functions
└── types/            # TypeScript types
```

---

## Error Handling

### Custom Error Classes

```typescript
// errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404, { resource, id });
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: unknown) {
    super(message, 'VALIDATION_ERROR', 400, { details });
  }
}
```

### Error Handling in Routes

```typescript
// Always catch and forward to error middleware
router.post('/runs', async (req, res, next) => {
  try {
    const run = await runService.create(req.body);
    res.json(run);
  } catch (err) {
    next(err);
  }
});

// Global error handler
app.use((err, req, res, next) => {
  req.log.error({ err }, 'Request failed');

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.code, message: err.message });
  } else {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong' });
  }
});
```

---

## Database Access

### Use Prisma with Type Safety

```typescript
// Always use typed queries
const run = await prisma.run.findUnique({
  where: { id: runId },
  include: { transcripts: true },
});

// Use transactions for multi-step operations
await prisma.$transaction(async (tx) => {
  const run = await tx.run.create({ ... });
  await tx.job.createMany({ ... });
  return run;
});
```

### Soft Delete Pattern

Entities that support deletion use **soft delete** via a `deletedAt` timestamp column. Records are never physically deleted - instead, `deletedAt` is set to the current timestamp.

**Tables with soft delete:**
- `definitions` - `deletedAt`
- `definition_tags` - `deletedAt`
- `scenarios` - `deletedAt`

**Required query patterns:**

```typescript
// ALWAYS filter out soft-deleted records in queries
const definitions = await prisma.definition.findMany({
  where: { deletedAt: null },  // Required!
});

// When "deleting", set deletedAt instead of using delete()
await prisma.definition.update({
  where: { id: definitionId },
  data: { deletedAt: new Date() },
});

// For cascading soft delete, update related records too
await prisma.$transaction([
  prisma.definition.update({
    where: { id: definitionId },
    data: { deletedAt: new Date() },
  }),
  prisma.definitionTag.updateMany({
    where: { definitionId },
    data: { deletedAt: new Date() },
  }),
]);
```

**GraphQL layer requirements:**
- `deletedAt` field is **NOT exposed** in GraphQL schema
- All GraphQL resolvers must filter `deletedAt: null` automatically
- Deleted records are invisible to API consumers

### Query Helpers in packages/db

```typescript
// packages/db/src/queries/runs.ts
export async function getRunWithTranscripts(id: string) {
  return prisma.run.findUnique({
    where: { id },
    include: {
      transcripts: true,
      definition: true,
    },
  });
}
```

---

## Database Connections

The project uses PostgreSQL running in Docker on port **5433** (not the default 5432).

### Connection URLs

| Environment | Database URL |
|-------------|-------------|
| **Development** | `postgresql://valuerank:valuerank@localhost:5433/valuerank` |
| **Test** | `postgresql://valuerank:valuerank@localhost:5433/valuerank_test` |

### Credentials

- **User**: `valuerank`
- **Password**: `valuerank`
- **Host**: `localhost`
- **Port**: `5433`

### Starting the Database

```bash
# From cloud/ directory
docker-compose up -d postgres

# Verify it's running
docker ps | grep valuerank-postgres
```

### Running Commands with Database Access

Always set the appropriate DATABASE_URL for the target database:

```bash
# Development database
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank" npx prisma studio

# Test database
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" npx prisma studio
```

### Prisma Schema Location

The Prisma schema is at `packages/db/prisma/schema.prisma`. When running Prisma commands from the `cloud/` directory, specify the schema path:

```bash
npx prisma migrate dev --schema packages/db/prisma/schema.prisma
```

---

## Schema Changes (Migrations)

**IMPORTANT: Always use Prisma Migrate for schema changes, never `db push`.**

Migrations are version-controlled SQL files that track schema evolution. Production deployments run `prisma migrate deploy` automatically on startup.

### Creating a Migration

When you modify `packages/db/prisma/schema.prisma`, create a migration:

```bash
# Create migration with descriptive name
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank" \
  npx prisma migrate dev --name add_feature_tables --schema packages/db/prisma/schema.prisma
```

This will:
1. Generate SQL in `packages/db/prisma/migrations/<timestamp>_<name>/migration.sql`
2. Apply the migration to your local database
3. Regenerate Prisma Client

### Migration Naming Convention

Use descriptive, snake_case names:
- `add_oauth_tables` - Adding new tables
- `add_user_preferences` - Adding columns
- `rename_status_column` - Renaming
- `add_index_on_created_at` - Performance improvements

### Applying Migrations

```bash
# Development - creates and applies migration interactively
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank" \
  npx prisma migrate dev --schema packages/db/prisma/schema.prisma

# Production - applies pending migrations (non-interactive)
DATABASE_URL="..." npx prisma migrate deploy --schema packages/db/prisma/schema.prisma

# Check migration status
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank" \
  npx prisma migrate status --schema packages/db/prisma/schema.prisma
```

### Production Deployment

Migrations auto-deploy on Railway. The API start script runs:
```bash
prisma migrate deploy --schema ../db/prisma/schema.prisma && node dist/index.js
```

### Handling Existing Schema (db push recovery)

If you accidentally used `db push` and need to create a migration retroactively:

```bash
# 1. Create migration file manually in packages/db/prisma/migrations/<timestamp>_<name>/
# 2. Mark it as applied (since db push already modified the schema):
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank" \
  npx prisma migrate resolve --applied <migration_name> --schema packages/db/prisma/schema.prisma
```

### Why Migrations Over db push

| `migrate dev` | `db push` |
|---------------|-----------|
| Creates versioned SQL files | No history |
| Safe for production | Development only |
| Supports rollback planning | Destructive |
| Team collaboration | Local only |
| CI/CD friendly | Manual sync needed |

---

## Test Database Provisioning

### Required Environment Variables for Tests

```bash
JWT_SECRET="test-secret-that-is-at-least-32-characters-long"
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test"
```

### Setup Test Database (Quick)

Use the built-in npm scripts which handle everything:

```bash
# From cloud/ directory - sets up schema and runs tests
npm test

# Or just set up the test database schema
npm run db:test:setup
```

### Setup Test Database (Manual)

If tests fail with schema errors, apply migrations to the test database:

```bash
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
  npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

### Reset Test Database (Clean Slate)

If tests have data pollution issues, reset and re-apply migrations:

```bash
npm run db:test:reset

# Or manually:
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
  npx prisma migrate reset --schema packages/db/prisma/schema.prisma --force
```

### Running Tests

```bash
# Run all tests (includes db:test:setup automatically)
npm test

# Run tests with coverage
npm run test:coverage

# Run specific package tests
JWT_SECRET="test-secret-that-is-at-least-32-characters-long" \
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
npx vitest run tests/path/to/test.ts

# Run Python worker tests
cd workers && PYTHONPATH=. pytest tests/ -v
```

### Test User Account

The seed script creates a development user:

- **Email**: `dev@valuerank.ai`
- **Password**: `development`

To seed the development database:

```bash
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank" \
  npx prisma db seed --schema packages/db/prisma/schema.prisma
```

### Troubleshooting Test Failures

1. **"column X does not exist"** - Schema out of sync:
   ```bash
   npm run db:test:setup
   ```

2. **Foreign key constraint violations** - Data pollution from previous runs:
   ```bash
   npm run db:test:reset
   ```

3. **"PgBoss not initialized"** - Test needs to mock `getBoss`:
   ```typescript
   vi.mock('../../../src/queue/boss.js', () => ({
     getBoss: vi.fn().mockReturnValue({
       send: vi.fn().mockResolvedValue('mock-job-id'),
     }),
   }));
   ```

4. **Test isolation issues** - Use unique IDs or upsert:
   ```typescript
   // Use timestamp in test data names
   const testId = 'test-' + Date.now();

   // Or use upsert for shared fixtures
   await db.tag.upsert({
     where: { name: 'test-tag' },
     update: {},
     create: { name: 'test-tag' },
   });
   ```

---

## Railway Production Deployment

### Viewing Production Logs

```bash
# API service logs
railway logs --service api --lines 100

# Web service logs
railway logs --service web --lines 100

# Postgres logs
railway logs --service postgres --lines 100
```

### SSH into Production

```bash
# API container
railway shell --service api

# Postgres container (then use: psql -U postgres -d railway)
railway shell --service postgres
```

### Running Seeds in Production

After deploying schema changes that add new tables needing seed data:

```bash
railway shell --service api
npx tsx packages/db/prisma/seed.ts
```

---

## Quick Reference

```
File size:      < 400 lines
any types:      NEVER (use unknown if truly unknown)
Test coverage:  80% minimum
Console.log:    NEVER (use logger)
Error handling: Custom AppError classes
Imports:        Node → External → Internal → Relative
Prod logs:      railway logs --service api
```

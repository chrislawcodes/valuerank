# Cloud ValueRank - Project Constitution

This document defines the cloud-specific coding standards and push checks for ValueRank.

Repo-wide agent behavior, delivery paths, terminology policy, and memory policy live in the repo-root `AGENTS.md`.

## Push And PR Checks

- Use Pull Requests for changes that will land on `main`.
- Ask the human before running `git push`.
- Run the Preflight Gate before any `git push` or PR creation.

## Workflow State

- For Feature Factory, use the repo-owned workflow docs and `docs/workflow/feature-runs/<slug>/state.json` as the source of truth.
- Repo-root `MEMORY.md` is only a short handoff file for the active feature. Do not use it as long-term archive or as the source of truth for workflow state.

### Pre-push Hook (Preferred)

The pre-push hook automatically detects which workspaces changed and runs lint, test, and build only for those. Install once:

```bash
./scripts/hooks/install-hooks.sh
```

The hook compares your branch to `origin/main` and respects the dependency graph:
- `shared` changes → checks shared, db, api, web
- `db` changes → checks db, api
- `api` changes → checks api only
- `web` changes → checks web only
- Root config changes (`turbo.json`, `package.json`, etc.) → checks everything

### Manual Preflight (If Hook Not Installed)

Run from `cloud/` for the workspaces you changed:

```bash
# Always run for the workspaces you touched:
npx turbo lint --filter=@valuerank/<workspace>
npx turbo test --filter=@valuerank/<workspace>
npx turbo build --filter=@valuerank/<workspace>

# If you touched db or api, also set up the test database first:
npm run db:test:setup
```

**Hard rules:**
- Do not push if any preflight command fails.
- Do not use `git push --no-verify` except emergency hotfix with explicit human approval.
- If unrelated local files break checks, validate in a clean worktree from `origin/main` before push.
- Every PR must include a `Validation` section listing exact commands run and pass/fail results.

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

**When a file exceeds limits:** extract helpers, split into sub-modules, or create a folder with `index.ts` re-exporting.

---

## TypeScript Standards

### No `any` Types

Never use `any`. Use the actual type, or `unknown` if the type is truly dynamic:

```typescript
function parseJson(input: string): unknown { ... }
function handleError(err: unknown): void { ... }
```

### Strict Mode Required

`tsconfig.json` must have `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`, `noUncheckedIndexedAccess: true`.

### Strict Boolean Checks

Use explicit checks for `null` and `undefined` — do not rely on truthiness for numbers or strings (linting error):

```typescript
// Bad - fails strict-boolean-expressions
if (!value) { ... }

// Good
if (value != null) { ... }
if (value === 0) { ... }
```

### Types vs Interfaces

Use `type` for data shapes; use `interface` for service contracts.

---

## Testing Requirements

### Coverage Targets

| Metric | Minimum | Target |
|--------|---------|--------|
| Line coverage | 80% | 90% |
| Branch coverage | 75% | 85% |
| Function coverage | 80% | 90% |

### What to Test

- **Always test**: Business logic, data transformations, edge cases
- **Mock**: Database, external APIs, LLM providers
- **Integration tests**: API routes with test database
- **Skip**: Simple getters, direct ORM pass-through

### Required Environment Variables for Tests

```bash
JWT_SECRET="test-secret-that-is-at-least-32-characters-long"
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test"
```

Setup test DB: `npm run db:test:setup` (from `cloud/`). Reset on data pollution: `npm run db:test:reset`.

---

## Logging Standards

All logging goes through the centralized logger — never use `console.log` directly.

```typescript
import { createLogger } from '@valuerank/shared';
const log = createLogger('runs');

log.info({ runId: run.id }, 'Run created');
log.error({ err, config }, 'Failed to create run');
```

Always use structured data (object + message), never string interpolation.

### Log Levels

| Level | Use For |
|-------|---------|
| `error` | Exceptions, failed operations that need attention |
| `warn` | Recoverable issues, deprecations, retry attempts |
| `info` | Key business events (run started, completed, user action) |
| `debug` | Detailed flow info, useful for local debugging |

---

## Code Organization

### Import Order

1. Node built-ins (`fs`, `path`)
2. External packages (`express`, `zod`)
3. Internal packages (`@valuerank/shared`, `@valuerank/db`)
4. Relative imports (`./validation`, `./types`)

### Folder Structure

```
apps/api/src/
├── routes/       # Express route handlers
├── services/     # Business logic
├── middleware/   # Express middleware
├── jobs/         # PgBoss job handlers
└── types/        # TypeScript types

apps/web/src/
├── components/   # React components
├── hooks/        # Custom hooks
├── pages/        # Route pages
└── types/        # TypeScript types
```

---

## Error Handling

Use custom error classes (`AppError`, `NotFoundError`, `ValidationError`) from `packages/shared`. Always catch and forward to error middleware in routes — never swallow errors silently.

---

## Database Access

### Use Prisma with Type Safety

Use typed queries and `$transaction` for multi-step operations.

### Soft Delete Pattern

Entities use soft delete via `deletedAt` timestamp. **Never physically delete** — set `deletedAt` instead.

**Tables with soft delete:** `definitions`, `definition_tags`, `scenarios`

```typescript
// ALWAYS filter out soft-deleted records
const definitions = await prisma.definition.findMany({
  where: { deletedAt: null },  // Required!
});

// When "deleting", set deletedAt
await prisma.definition.update({
  where: { id: definitionId },
  data: { deletedAt: new Date() },
});
```

`deletedAt` is **never exposed** in GraphQL schema. All resolvers must filter `deletedAt: null` automatically.

---

## Database Connections

The project uses PostgreSQL with PgBouncer for connection pooling.

**Application** (via PgBouncer): `DATABASE_URL` — include `?pgbouncer=true` to disable prepared statements.

**Migrations** (direct): `DIRECT_URL` — Prisma Migrate requires a direct connection, not a pooler.

```bash
# .env
DATABASE_URL="postgresql://valuerank:valuerank@localhost:6432/valuerank?pgbouncer=true"
DIRECT_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank"
```

Start local DB: `docker-compose up -d` from `cloud/`.

---

## Schema Changes (Migrations)

**Always use Prisma Migrate — never `db push`.**

```bash
# Create and apply a migration
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank" \
  npx prisma migrate dev --name add_feature_tables --schema packages/db/prisma/schema.prisma
```

Production deployments run `prisma migrate deploy` automatically on startup.

---

## Quick Reference

```
File size:      < 400 lines
any types:      NEVER (use unknown if truly unknown)
Test coverage:  80% minimum
Console.log:    NEVER (use logger)
Error handling: Custom AppError classes
Imports:        Node → External → Internal → Relative
```

---

## Terminology

Canonical source: `docs/canonical-glossary.md`

- Follow the terminology policy in repo-root `AGENTS.md`.
- In cloud code, older names like `definition`, `dimension`, and `scenario` may still appear in code, schema, or APIs. Map them to glossary terms instead of renaming them casually.

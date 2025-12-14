# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)

## Code Quality (per constitution cloud/CLAUDE.md)

- [ ] TypeScript strict mode enabled
  - Reference: Constitution "TypeScript Standards" - `strict: true`
- [ ] No `any` types used
  - Reference: Constitution "No `any` Types"
  - Use `unknown` for truly unknown types
- [ ] File size < 400 lines per file
  - Reference: Constitution "File Size Limits"
- [ ] Functions have single responsibility
  - Reference: Constitution "Core Principles"

## Logging (per constitution)

- [ ] Use `createLogger` from `@valuerank/shared` (never `console.log`)
  - Reference: Constitution "Logging Standards"
  - Pattern: `const log = createLogger('mcp:tools:recover-run')`
- [ ] Structured logging with context objects
  - Example: `log.info({ runId, queuedCount }, 'Run recovered')`
- [ ] Log levels appropriate (error/warn/info/debug)
  - Reference: Constitution "Log Levels" table

## Error Handling (per constitution)

- [ ] Use custom error classes (`NotFoundError`, `RunStateError`)
  - Reference: Constitution "Error Handling"
- [ ] Errors caught and formatted for MCP response
  - Pattern: `formatError('NOT_FOUND', message)`
- [ ] Errors logged with full context
  - Pattern: `log.error({ err, runId }, 'Operation failed')`

## MCP Tool Pattern (from existing code)

- [ ] Use Zod for input schema validation
  - Pattern: `z.string().describe('...')`
- [ ] Register tool via `addToolRegistrar`
  - Reference: `apps/api/src/mcp/tools/registry.ts`
- [ ] Return structured JSON via `formatSuccess`/`formatError`
- [ ] Include audit logging via `logAuditEvent`

## Database Access (per constitution)

- [ ] Use Prisma with type safety
  - Reference: Constitution "Database Access"
- [ ] Handle missing PgBoss tables gracefully
  - Catch errors, return empty results
- [ ] Soft delete filtering (`deletedAt: null`)
  - Reference: Constitution "Soft Delete Pattern"

## Import Order (per constitution)

- [ ] Node built-ins first
- [ ] External packages second
- [ ] Internal packages (`@valuerank/*`) third
- [ ] Relative imports last

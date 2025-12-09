# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)

## Code Quality (per constitution)

- [ ] All files under 400 lines
  - Reference: Constitution § File Size Limits
  - Each MCP tool in separate file

- [ ] No `any` types in TypeScript
  - Reference: Constitution § TypeScript Standards
  - Use `unknown` if type is truly unknown

- [ ] Strict mode enabled
  - Reference: Constitution § TypeScript Standards
  - `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`

- [ ] Type function signatures explicitly
  - Reference: Constitution § Type Inference vs Explicit Types
  - All MCP tool handler types defined

## Logging (per constitution)

- [ ] Use `createLogger` from `@valuerank/shared`
  - Reference: Constitution § Logging Standards
  - Never use `console.log` directly

- [ ] Structured logging with context
  - Reference: Constitution § Structured Logging Rules
  - Log objects, not string interpolation

- [ ] Audit logging for all write operations
  - Reference: Constitution § Logging Standards
  - Use existing `mcp/audit.ts` patterns

## Error Handling (per constitution)

- [ ] Use custom `AppError` classes
  - Reference: Constitution § Error Handling
  - `NotFoundError`, `ValidationError` for common cases

- [ ] Format errors consistently for MCP
  - Reference: Existing `formatError` pattern in `create-definition.ts`
  - `{ error: code, message: string, details?: unknown }`

## Database Access (per constitution)

- [ ] Use Prisma with type safety
  - Reference: Constitution § Database Access
  - Typed queries, no raw SQL unless necessary

- [ ] Soft delete pattern followed
  - Reference: Constitution § Soft Delete Pattern
  - Filter `deletedAt: null` in all queries
  - Set `deletedAt = now()` instead of delete()

- [ ] Use transactions for multi-step operations
  - Reference: Constitution § Database Access
  - Cascading deletes in single transaction

- [ ] Schema changes via Prisma Migrate
  - Reference: Constitution § Schema Changes
  - Never use `db push` in shared environments

## Import Order (per constitution)

- [ ] Imports ordered correctly
  - Reference: Constitution § Import Order
  - Node → External → Internal (@valuerank/*) → Relative

## MCP Tool Patterns

- [ ] Follow existing tool registration pattern
  - Reference: `create-definition.ts`
  - Use `addToolRegistrar` for auto-registration

- [ ] Zod schemas for input validation
  - Reference: Existing MCP tools
  - Descriptive schema properties

- [ ] Response size within limits
  - Reference: spec.md FR-030, FR-032, FR-037, FR-043
  - 3KB/5KB/8KB limits per tool

## Security

- [ ] No hardcoded credentials or secrets
  - Reference: Constitution (implicit)
  - Use environment variables

- [ ] Input validation before database operations
  - Reference: spec.md FR-085
  - Zod schemas validate all inputs

# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [stage-3-tasks.md](../stage-3-tasks.md)

## Code Quality (per CLAUDE.md)

- [ ] No `any` types - use `unknown` for truly unknown types
  - Reference: CLAUDE.md § TypeScript Standards
  - ESLint rule: `@typescript-eslint/no-explicit-any: error`

- [ ] TypeScript strict mode enabled
  - Reference: CLAUDE.md § TypeScript Standards
  - Config: `strict: true, noImplicitAny: true, strictNullChecks: true`

- [ ] File size limits respected (< 400 lines per file)
  - Reference: CLAUDE.md § File Size Limits
  - Split: types/, queries/, mutations/, dataloaders/ folders

- [ ] Type inference vs explicit types
  - Reference: CLAUDE.md § Type Inference vs Explicit Types
  - Always type function signatures
  - Always type exported interfaces

## Logging (per CLAUDE.md)

- [ ] Use project logging utilities (never console.log)
  - Reference: CLAUDE.md § Logging Standards
  - Import: `createLogger` from `@valuerank/shared`
  - Pattern: `ctx.log.info({ data }, 'message')`

- [ ] Structured logging with context
  - Reference: CLAUDE.md § Structured Logging Rules
  - Include: requestId, entity IDs, operation name
  - Format: `log.info({ definitionId, operation: 'create' }, 'Definition created')`

- [ ] Appropriate log levels
  - Reference: CLAUDE.md § Log Levels
  - `error`: Exceptions, failed operations
  - `info`: Key business events (query executed, mutation completed)
  - `debug`: Detailed flow (DataLoader batching)

## Error Handling (per CLAUDE.md)

- [ ] Use custom error classes
  - Reference: CLAUDE.md § Custom Error Classes
  - Classes: `AppError`, `NotFoundError`, `ValidationError`
  - Import from: `@valuerank/shared`

- [ ] GraphQL errors include code and message
  - Format: `errors: [{ message: "...", extensions: { code: "NOT_FOUND" }}]`
  - Map AppError to GraphQL error format

## Database Access (per CLAUDE.md)

- [ ] Use Prisma with type safety
  - Reference: CLAUDE.md § Database Access
  - Always use typed queries from Prisma client

- [ ] Use transactions for multi-step operations
  - Reference: CLAUDE.md § Database Access
  - Pattern: `db.$transaction(async (tx) => { ... })`
  - Apply to: forkDefinition (check parent + create)

## Code Organization (per CLAUDE.md)

- [ ] Import order followed
  - Reference: CLAUDE.md § Import Order
  - Order: Node built-ins → External → Internal (@valuerank/*) → Relative

- [ ] Folder structure matches plan
  - Reference: stage-3-plan.md § Project Structure
  - graphql/{types,queries,mutations,dataloaders}/

## GraphQL-Specific Quality

- [ ] DataLoaders created per-request in context
  - Pattern: `createContext()` instantiates new loaders
  - No global/shared DataLoader instances

- [ ] Nullable vs non-nullable correctly modeled
  - Single entity queries: nullable (null for not found)
  - List queries: non-nullable array `[Type!]!`
  - Required relations: non-nullable

- [ ] Pagination has sensible defaults and limits
  - Default limit: 20
  - Max limit: 100 (prevent abuse)

- [ ] Input validation using Zod or Pothos validation plugin
  - Validate before database operations
  - Return ValidationError for invalid input

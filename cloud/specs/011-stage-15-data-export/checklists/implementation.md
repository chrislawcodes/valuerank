# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)

## Code Quality (per constitution cloud/CLAUDE.md)

- [ ] All files under 400 lines
  - Reference: Constitution § File Size Limits
- [ ] No `any` types - use proper TypeScript typing
  - Reference: Constitution § TypeScript Standards
- [ ] Strict mode enabled in tsconfig
  - Reference: Constitution § TypeScript Standards
- [ ] Consistent import order (Node → External → Internal → Relative)
  - Reference: Constitution § Code Organization

## Logging (per constitution)

- [ ] Use `createLogger()` from @valuerank/shared (not console.*)
  - Reference: Constitution § Logging Standards
- [ ] Structured logging with context objects
  - Reference: Constitution § Structured Logging Rules
- [ ] All export operations logged with userId, exportType, recordCount
  - Reference: Spec FR-017

## Error Handling (per constitution)

- [ ] Use custom AppError classes (ExportError, ImportError, ValidationError)
  - Reference: Constitution § Error Handling
- [ ] Errors include context for debugging
  - Reference: Constitution § Custom Error Classes
- [ ] Validation errors return specific, actionable messages
  - Reference: Spec FR-004

## Database Access (per constitution)

- [ ] Use Prisma with typed queries
  - Reference: Constitution § Database Access
- [ ] Filter soft-deleted records (deletedAt: null)
  - Reference: Constitution § Soft Delete Pattern
- [ ] Use transactions for multi-step operations
  - Reference: Constitution § Use Prisma with Type Safety

## File Paths (from plan.md)

- [ ] Export services in apps/api/src/services/export/
- [ ] Import services in apps/api/src/services/import/
- [ ] GraphQL mutations in apps/api/src/graphql/mutations/export.ts
- [ ] GraphQL queries in apps/api/src/graphql/queries/export.ts
- [ ] REST endpoints in apps/api/src/routes/export.ts and import.ts
- [ ] Queue handlers in apps/api/src/queue/handlers/export.ts
- [ ] Web components in apps/web/src/components/export/ and import/

## Service Size Limits

- [ ] md.ts (serializer) ≤ 200 lines
- [ ] yaml.ts (serializer) ≤ 150 lines
- [ ] bundle.ts (serializer) ≤ 200 lines
- [ ] jsonl.ts (serializer) ≤ 100 lines
- [ ] download.ts (URLs) ≤ 100 lines
- [ ] types.ts (export) ≤ 50 lines
- [ ] import/md.ts (parser) ≤ 200 lines

# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)

## Code Quality (per Constitution)

- [ ] Strict TypeScript mode enabled (no `any` types)
  - Reference: Constitution § TypeScript Standards
- [ ] No `console.log` - use pino logger from `@valuerank/shared`
  - Reference: Constitution § Logging Standards
- [ ] File size <400 lines per file
  - Reference: Constitution § File Size Limits
- [ ] Functions have clear, single purpose
  - Reference: Constitution § Core Principles

## Logging (per Constitution)

- [ ] Use `createLogger('audit')` for audit service
  - Reference: Constitution § Logger Abstraction
- [ ] Structured logging with objects, not string interpolation
  - Reference: Constitution § Structured Logging Rules
- [ ] Error level for failures, info for successful audits
  - Reference: Constitution § Log Levels

## Database Access (per Constitution)

- [ ] Use Prisma with type safety
  - Reference: Constitution § Database Access
- [ ] Use transactions for multi-step operations
  - Reference: Constitution § Use Prisma with Type Safety
- [ ] Follow soft delete pattern for queries
  - Reference: Constitution § Soft Delete Pattern
- [ ] Migration created via `prisma migrate dev`, not `db push`
  - Reference: Constitution § Schema Changes

## Error Handling (per Constitution)

- [ ] Use custom AppError classes from `@valuerank/shared`
  - Reference: Constitution § Custom Error Classes
- [ ] Errors caught and forwarded to error middleware
  - Reference: Constitution § Error Handling in Routes

## Code Organization (per Constitution)

- [ ] Import order: Node → External → Internal → Relative
  - Reference: Constitution § Import Order
- [ ] Service split if exceeds 400 lines
  - Reference: Constitution § File Size Limits

## Feature-Specific Quality

- [ ] AuditLog entries are immutable (no update/delete mutations)
- [ ] createdByUserId set from `ctx.user.id` in mutations
- [ ] deletedByUserId set from `ctx.user.id` in delete mutations
- [ ] SYSTEM_ACTOR_ID used for background job audits
- [ ] Audit log creation is async (non-blocking)
- [ ] All 27 mutations wrapped with audit logging
- [ ] GraphQL field resolvers use DataLoader if N+1 risk

## Security

- [ ] Audit log query requires authentication
- [ ] Users cannot modify or delete audit entries
- [ ] Sensitive data (passwords, tokens) not logged in metadata

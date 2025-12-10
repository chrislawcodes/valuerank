# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)

## Code Quality (per CLAUDE.md Constitution)

- [ ] All new files under 400 lines
  - Reference: CLAUDE.md "File Size Limits"
  - Split into smaller modules if growing
- [ ] No `any` types in TypeScript code
  - Reference: CLAUDE.md "No `any` Types"
  - Use `unknown` if type truly unknown
- [ ] Strict TypeScript mode enabled
  - Reference: CLAUDE.md "Strict Mode Required"
  - noImplicitAny, strictNullChecks, noUncheckedIndexedAccess
- [ ] Correct import order maintained
  - Reference: CLAUDE.md "Import Order"
  - Node → External → Internal → Relative

## Logging (per CLAUDE.md Constitution)

- [ ] Use `createLogger` from @valuerank/shared
  - Reference: CLAUDE.md "Logger Abstraction"
  - Never use console.log directly
- [ ] Structured logging with context objects
  - Reference: CLAUDE.md "Structured Logging Rules"
  - `log.info({ requestId, tool }, 'MCP request')`
- [ ] Appropriate log levels (error, warn, info, debug)
  - Reference: CLAUDE.md "Log Levels"

## Error Handling (per CLAUDE.md Constitution)

- [ ] Use custom error classes (AppError, AuthenticationError)
  - Reference: CLAUDE.md "Custom Error Classes"
- [ ] Never expose stack traces in production
  - Reference: CLAUDE.md "Error Handling in Routes"
- [ ] Return structured error responses
  - `{ error: 'CODE', message: 'Description' }`

## MCP-Specific Quality

- [ ] All tool responses include metadata (bytes, truncated, executionMs)
- [ ] Token budgets enforced per spec (1KB-10KB depending on tool)
- [ ] Rate limiting headers present (X-RateLimit-*)
- [ ] API key authentication required on all endpoints
- [ ] Mutations blocked in graphql_query tool
- [ ] Schema introspection allowed

## Database Access (per CLAUDE.md Constitution)

- [ ] Use Prisma with type safety
  - Reference: CLAUDE.md "Use Prisma with Type Safety"
- [ ] Filter soft-deleted records (deleted_at IS NULL)
  - Reference: CLAUDE.md "Soft Delete Pattern"
- [ ] Use query helpers from packages/db when available

## Security

- [ ] Input validation with Zod schemas
- [ ] No SQL injection vulnerabilities
- [ ] API key hashing maintained
- [ ] User context properly propagated
- [ ] No sensitive data in logs

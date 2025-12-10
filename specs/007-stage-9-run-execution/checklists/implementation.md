# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)

## Code Quality (per constitution cloud/CLAUDE.md)

### File Size Limits

- [ ] Route handlers < 400 lines
  - Reference: Constitution "File Size Limits" table
- [ ] Services/business logic < 400 lines
  - Reference: Constitution "File Size Limits" table
- [ ] React components < 400 lines
  - Reference: Constitution "File Size Limits" table
- [ ] Test files can be longer (due to setup/fixtures)

### TypeScript Standards

- [ ] No `any` types used
  - Reference: Constitution "No `any` Types" section
  - Use `unknown` for truly unknown types
- [ ] Strict mode enabled (verify tsconfig.json)
  - Reference: Constitution "Strict Mode Required" section
- [ ] Function signatures explicitly typed
  - Reference: Constitution "Type Inference vs Explicit Types"
- [ ] Use `type` for data shapes, `interface` for contracts
  - Reference: Constitution "Prefer Types Over Interfaces for Data"

## Logging (per constitution cloud/CLAUDE.md)

- [ ] Use structured logging (`createLogger` from @valuerank/shared)
  - Reference: Constitution "Logger Abstraction" section
  - Never use `console.log` directly
- [ ] Log levels used appropriately
  - `error`: Exceptions, failed operations
  - `warn`: Recoverable issues, retry attempts
  - `info`: Key business events (run started, completed)
  - `debug`: Detailed flow info
- [ ] Structured data, not string interpolation
  - Good: `log.info({ runId, status }, 'Run updated')`
  - Bad: `log.info(\`Run ${runId} updated to ${status}\`)`

## Code Organization (per constitution cloud/CLAUDE.md)

- [ ] Import order followed
  - Reference: Constitution "Import Order" section
  - 1. Node built-ins → 2. External → 3. @valuerank/* → 4. Relative
- [ ] Folder structure per constitution
  - API: routes/, services/, middleware/, types/
  - Web: components/, hooks/, pages/, types/

## Error Handling (per constitution cloud/CLAUDE.md)

- [ ] Use custom error classes (AppError, NotFoundError, ValidationError)
  - Reference: Constitution "Custom Error Classes" section
- [ ] Errors caught and forwarded to error middleware
- [ ] Error context included in logs

## Database Access (per constitution cloud/CLAUDE.md)

- [ ] Use Prisma with type safety
  - Reference: Constitution "Use Prisma with Type Safety"
- [ ] Transactions for multi-step operations
- [ ] Soft delete pattern NOT needed for runs/transcripts (only definitions)

## React Component Standards

- [ ] Components focused and single-purpose
- [ ] Custom hooks extract reusable logic
- [ ] Error boundaries for isolated failures
- [ ] Loading states for async operations
- [ ] Empty states for no-data scenarios

## GraphQL Standards

- [ ] Use Pothos code-first schema
- [ ] DataLoaders for N+1 prevention
- [ ] Authentication required for protected mutations
- [ ] Structured logging in resolvers

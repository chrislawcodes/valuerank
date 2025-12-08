# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)
**Constitution**: [CLAUDE.md](../../../CLAUDE.md)

## File Size Limits (per constitution)

- [ ] Route handlers < 400 lines
  - Reference: CLAUDE.md § File Size Limits
- [ ] Services/business logic < 400 lines
  - Reference: CLAUDE.md § File Size Limits
- [ ] Utilities < 400 lines
  - Reference: CLAUDE.md § File Size Limits
- [ ] Test files < 400 lines (can be longer due to setup/fixtures)
  - Reference: CLAUDE.md § File Size Limits

## TypeScript Standards (per constitution)

- [ ] No `any` types - use `unknown` if type truly unknown
  - Reference: CLAUDE.md § TypeScript Standards - No any Types
- [ ] Strict mode compiles without errors
  - Reference: CLAUDE.md § TypeScript Standards - Strict Mode Required
- [ ] All function signatures have explicit types
  - Reference: CLAUDE.md § TypeScript Standards - Type Inference
- [ ] Prefer `type` over `interface` for data shapes
  - Reference: CLAUDE.md § TypeScript Standards - Prefer Types Over Interfaces

## Logging Standards (per constitution)

- [ ] All logging via `createLogger` from shared package
  - Reference: CLAUDE.md § Logging Standards - Logger Abstraction
- [ ] No `console.log` in production code
  - Reference: CLAUDE.md § Logging Standards
- [ ] Structured logging with context objects
  - Reference: CLAUDE.md § Logging Standards - Structured Logging Rules
  - Example: `log.info({ runId, jobId, status }, 'Job completed')`
- [ ] Appropriate log levels used:
  - `error`: Exceptions, failed operations
  - `warn`: Recoverable issues, retries
  - `info`: Key business events (run started, job completed)
  - `debug`: Detailed flow info

## Error Handling (per constitution)

- [ ] Custom error classes extend AppError
  - Reference: CLAUDE.md § Error Handling - Custom Error Classes
- [ ] QueueError, JobValidationError, RunStateError defined
- [ ] Errors include context (jobId, runId, etc.)
- [ ] All routes use try/catch with next(err)
  - Reference: CLAUDE.md § Error Handling - Error Handling in Routes

## Database Access (per constitution)

- [ ] All queries use typed Prisma methods
  - Reference: CLAUDE.md § Database Access - Use Prisma with Type Safety
- [ ] Transactions used for multi-step operations (run + jobs creation)
  - Reference: CLAUDE.md § Database Access
- [ ] Query helpers in packages/db for reusable queries
  - Reference: CLAUDE.md § Database Access - Query Helpers

## Code Organization (per constitution)

- [ ] Import order: Node built-ins → External → Internal (@valuerank/*) → Relative
  - Reference: CLAUDE.md § Code Organization - Import Order
- [ ] Module structure follows folder pattern from plan.md
  - Reference: CLAUDE.md § Code Organization - Folder Structure per App

## Queue-Specific Quality

- [ ] Job data passed by reference (IDs), not full content
- [ ] Progress updates are atomic (use PostgreSQL operators)
- [ ] Graceful shutdown implemented (complete in-flight jobs)
- [ ] Retry logic distinguishes retryable vs non-retryable errors
- [ ] All job types have TypeScript interfaces

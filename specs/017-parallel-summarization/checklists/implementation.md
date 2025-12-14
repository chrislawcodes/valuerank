# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)

## Code Quality (per constitution cloud/CLAUDE.md)

- [ ] File size limits respected (< 400 lines per file)
  - Reference: Constitution § File Size Limits
- [ ] No `any` types used (use proper typing)
  - Reference: Constitution § TypeScript Standards
- [ ] Strict mode enabled in tsconfig
  - Reference: Constitution § Strict Mode Required
- [ ] Functions have clear, single purpose
  - Reference: Constitution § Core Principles

## Logging (per constitution cloud/CLAUDE.md)

- [ ] Use `createLogger()` for all new services
  - Reference: Constitution § Logging Standards
  - Find utilities: `import { createLogger } from '@valuerank/shared'`
- [ ] No `console.log` or `console.error` calls
  - Reference: Constitution § Logger Abstraction
- [ ] Structured logging with context objects
  - Reference: Constitution § Structured Logging Rules
- [ ] Appropriate log levels (info for business events, debug for flow)
  - Reference: Constitution § Log Levels

## Error Handling (per constitution cloud/CLAUDE.md)

- [ ] Use custom error classes (`AppError`, `NotFoundError`, `ValidationError`)
  - Reference: Constitution § Custom Error Classes
- [ ] Errors caught and forwarded properly in routes
  - Reference: Constitution § Error Handling in Routes
- [ ] Error context included in logs
  - Reference: Constitution § Structured Logging Rules

## Database Access (per constitution cloud/CLAUDE.md)

- [ ] Use Prisma with typed queries
  - Reference: Constitution § Use Prisma with Type Safety
- [ ] Filter `deletedAt: null` for soft-deleted entities
  - Reference: Constitution § Soft Delete Pattern
- [ ] Use transactions for multi-step operations
  - Reference: Constitution § Database Access

## Import Order (per constitution cloud/CLAUDE.md)

- [ ] Node built-ins first
- [ ] External packages second
- [ ] Internal packages (@valuerank/*) third
- [ ] Relative imports last
  - Reference: Constitution § Import Order

## API Patterns

- [ ] GraphQL mutations require authentication
- [ ] Audit logging for all mutations
- [ ] Proper error responses for invalid states
- [ ] Idempotent operations where possible

## MCP Tool Patterns

- [ ] Follow existing tool structure (delete-run.ts pattern)
- [ ] Use Zod for input validation
- [ ] Return structured JSON responses
- [ ] Include comprehensive tool descriptions

# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)

## Code Quality (per constitution - cloud/CLAUDE.md)

- [ ] All files under 400 lines
  - Reference: Constitution "File Size Limits" section
  - Split large files per guidance in constitution

- [ ] No `any` types in TypeScript
  - Reference: Constitution "No `any` Types" section
  - Use `unknown` if type is truly unknown

- [ ] Strict TypeScript mode enabled
  - Reference: Constitution "Strict Mode Required"
  - `noImplicitAny`, `strictNullChecks` enabled

## Logging (per constitution)

- [ ] Use createLogger from @valuerank/shared, not console.*
  - Reference: Constitution "Logger Abstraction" section
  - Import: `import { createLogger } from '@valuerank/shared'`

- [ ] Structured logging with context objects
  - Reference: Constitution "Structured Logging Rules"
  - Pattern: `log.info({ runId, status }, 'Message')`

- [ ] Appropriate log levels (error, warn, info, debug)
  - Reference: Constitution "Log Levels" table

## Error Handling (per constitution)

- [ ] Use custom AppError classes
  - Reference: Constitution "Custom Error Classes"
  - Import from existing error utilities

- [ ] Errors caught and forwarded to error middleware
  - Reference: Constitution "Error Handling in Routes"

## Database Access (per constitution)

- [ ] Use Prisma with typed queries
  - Reference: Constitution "Use Prisma with Type Safety"

- [ ] Filter soft-deleted records (deletedAt: null)
  - Reference: Constitution "Soft Delete Pattern"

## Code Organization

- [ ] Import order: Node → External → Internal → Relative
  - Reference: Constitution "Import Order"

- [ ] Folder structure follows constitution patterns
  - Reference: Constitution "Folder Structure per App"

## Python Code

- [ ] Type hints on all functions
- [ ] Docstrings for public functions
- [ ] JSON logging to stderr (not print statements)
- [ ] Error handling with proper error codes

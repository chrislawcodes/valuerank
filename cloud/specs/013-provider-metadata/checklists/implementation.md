# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)
**Constitution**: [cloud/CLAUDE.md](../../../CLAUDE.md)

## File Size Limits (per constitution)

- [ ] Route handlers < 400 lines
- [ ] Services/business logic < 400 lines
- [ ] React components < 400 lines
- [ ] Type definitions < 400 lines
- [ ] Test files < 400 lines (can be longer due to fixtures)
  - Reference: Constitution § File Size Limits

## TypeScript Standards (per constitution)

- [ ] No `any` types (use `unknown` if truly unknown)
- [ ] Strict mode enabled in tsconfig
- [ ] All function signatures typed
- [ ] Empty arrays have explicit type annotation
- [ ] Use `type` for data shapes, `interface` for contracts
  - Reference: Constitution § TypeScript Standards

## Logging Standards (per constitution)

- [ ] No `console.log` statements (use `createLogger()`)
- [ ] Structured logging with context objects
- [ ] Log levels appropriate (error, warn, info, debug)
- [ ] Include correlation IDs where applicable
  - Reference: Constitution § Logging Standards
  - Find utilities: `import { createLogger } from '@valuerank/shared'`

## Error Handling (per constitution)

- [ ] Use custom AppError classes (NotFoundError, ValidationError)
- [ ] Routes catch errors and forward to middleware
- [ ] Error responses include code and message
  - Reference: Constitution § Error Handling

## Database Access (per constitution)

- [ ] Use Prisma with type-safe queries
- [ ] Transactions for multi-step operations
- [ ] Query helpers in `packages/db/src/queries/`
- [ ] Follow existing patterns in schema.prisma
  - Reference: Constitution § Database Access

## Import Order (per constitution)

- [ ] Node built-ins first
- [ ] External packages second
- [ ] Internal packages (@valuerank/*) third
- [ ] Relative imports last
  - Reference: Constitution § Code Organization

## GraphQL Patterns (per codebase)

- [ ] Types in `apps/api/src/graphql/types/`
- [ ] Queries in `apps/api/src/graphql/queries/`
- [ ] Mutations in `apps/api/src/graphql/mutations/`
- [ ] Dataloaders for N+1 prevention
- [ ] Follow Pothos builder patterns

## React Patterns (per codebase)

- [ ] Components in `apps/web/src/components/`
- [ ] Pages in `apps/web/src/pages/`
- [ ] Operations in `apps/web/src/api/operations/`
- [ ] Use urql for GraphQL
- [ ] Follow existing UI component patterns

## Python Standards (per workers)

- [ ] Type hints on all functions
- [ ] Dataclasses for structured data
- [ ] Structured logging (no print statements)
- [ ] Follow existing patterns in `workers/common/`

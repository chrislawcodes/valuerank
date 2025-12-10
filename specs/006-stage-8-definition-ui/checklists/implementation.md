# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)
**Constitution**: [cloud/CLAUDE.md](../../../CLAUDE.md)

## File Size Limits (per Constitution)

- [ ] All route handlers < 400 lines
  - Reference: Constitution § File Size Limits
- [ ] All services/business logic files < 400 lines
  - Reference: Constitution § File Size Limits
- [ ] All React components < 400 lines (SC-008)
  - Reference: Constitution § File Size Limits
- [ ] All utility files < 400 lines
  - Reference: Constitution § File Size Limits

**When file exceeds limits**: Extract helpers, split into sub-modules, create folder with index.ts

## TypeScript Standards (per Constitution)

- [ ] No `any` types in new code (SC-009)
  - Reference: Constitution § TypeScript Standards - "No `any` Types"
  - Use `unknown` for truly unknown types
- [ ] Strict mode enabled (verify tsconfig.json)
  - Reference: Constitution § TypeScript Standards - "Strict Mode Required"
- [ ] Function signatures explicitly typed
  - Reference: Constitution § TypeScript Standards
- [ ] Empty arrays explicitly typed (e.g., `const items: string[] = []`)
  - Reference: Constitution § TypeScript Standards - "Type Inference vs Explicit Types"
- [ ] Exported interfaces properly typed
  - Reference: Constitution § TypeScript Standards

## Import Order (per Constitution)

- [ ] Imports ordered correctly:
  1. Node built-ins
  2. External packages
  3. Internal packages (@valuerank/*)
  4. Relative imports
  - Reference: Constitution § Code Organization - "Import Order"

## Logging Standards (per Constitution)

- [ ] Backend: Use logger from `@valuerank/shared`, not `console.log`
  - Reference: Constitution § Logging Standards
- [ ] Use structured logging with context objects
  - Reference: Constitution § Logging Standards - "Structured Logging Rules"
- [ ] Appropriate log levels: error, warn, info, debug
  - Reference: Constitution § Logging Standards - "Log Levels"

## Error Handling (per Constitution)

- [ ] Use custom AppError classes for known errors
  - Reference: Constitution § Error Handling - "Custom Error Classes"
- [ ] GraphQL errors return appropriate error codes
  - Reference: Constitution § Error Handling
- [ ] All async functions have try/catch or .catch()
  - Reference: Constitution § Error Handling - "Error Handling in Routes"

## Database Access (per Constitution)

- [ ] Use Prisma with typed queries
  - Reference: Constitution § Database Access
- [ ] Use transactions for multi-step operations
  - Reference: Constitution § Database Access
- [ ] Query helpers in packages/db for reusable queries
  - Reference: Constitution § Database Access - "Query Helpers"

## GraphQL Patterns

- [ ] Use DataLoaders for N+1 prevention
  - Reference: Stage 3 patterns, existing dataloaders/
- [ ] Follow existing Pothos builder patterns
  - Reference: apps/api/src/graphql/builder.ts
- [ ] Input validation with @pothos/plugin-validation
  - Reference: existing mutations/definition.ts

## React Patterns

- [ ] Use urql hooks for GraphQL (useQuery, useMutation)
  - Reference: Stage 7 patterns, existing hooks
- [ ] Follow existing component structure
  - Reference: apps/web/src/components/
- [ ] Use Tailwind CSS for styling
  - Reference: Stage 7, apps/web/tailwind.config.js

## Security

- [ ] All GraphQL mutations require authentication
  - Reference: Stage 4 auth middleware
- [ ] Input validation before database operations
  - Reference: Constitution § Error Handling
- [ ] No user-controlled data in raw SQL (use Prisma params)
  - Reference: Constitution § Database Access

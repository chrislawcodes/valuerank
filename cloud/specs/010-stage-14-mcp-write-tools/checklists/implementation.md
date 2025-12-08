# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)

## Code Quality (per Constitution)

- [ ] All new files under 400 lines
  - Reference: Constitution § File Size Limits
  - Check: `wc -l apps/api/src/mcp/tools/*.ts apps/api/src/mcp/resources/*.ts`

- [ ] No `any` types in TypeScript code
  - Reference: Constitution § TypeScript Standards
  - Check: `grep -r "any" apps/api/src/mcp/tools/*.ts` should be empty

- [ ] TypeScript strict mode enabled
  - Reference: Constitution § TypeScript Standards
  - Verify: tsconfig.json has `"strict": true`

- [ ] Typed function signatures on all exported functions
  - Reference: Constitution § TypeScript Standards
  - All tool handlers have explicit return types

## Logging (per Constitution)

- [ ] Use structured logging via `createLogger`, never `console.log`
  - Reference: Constitution § Logging Standards
  - Import pattern: `import { createLogger } from '@valuerank/shared'`

- [ ] All MCP write operations logged with requestId correlation
  - Reference: Constitution § Logging Standards (Request Logging Middleware)
  - Pattern: `log.info({ requestId, definitionId }, 'Definition created')`

- [ ] Audit events use `mcp:audit` logger context
  - Reference: plan.md § Audit Logging
  - Pattern: `createLogger('mcp:audit')`

## Error Handling (per Constitution)

- [ ] Use AppError classes for structured errors
  - Reference: Constitution § Error Handling
  - Import from `@valuerank/shared`

- [ ] Never expose stack traces in production
  - Reference: Constitution § Error Handling
  - MCP errors return code + message, not stack

- [ ] Log errors with full context
  - Reference: Constitution § Logging Standards
  - Pattern: `log.error({ err, requestId, args }, 'Failed to create definition')`

## Database (per Constitution)

- [ ] Always filter `deletedAt: null` for soft-deleted entities
  - Reference: Constitution § Soft Delete Pattern
  - Applies to: definitions, scenarios

- [ ] Use Prisma with type safety
  - Reference: Constitution § Database Access
  - No raw SQL unless necessary

- [ ] Use transactions for multi-step operations
  - Reference: Constitution § Database Access
  - Definition creation + scenario expansion should be consistent

## Code Organization (per Constitution)

- [ ] Import order: Node → External → Internal → Relative
  - Reference: Constitution § Code Organization

- [ ] Tools in `apps/api/src/mcp/tools/` directory
  - Reference: Constitution § Folder Structure

- [ ] Tests mirror source structure in `apps/api/tests/`
  - Reference: Constitution § Test Files Location

## MCP-Specific Patterns

- [ ] All tools use `addToolRegistrar` pattern
  - Reference: Existing pattern in `mcp/tools/list-definitions.ts`

- [ ] Tools registered in `mcp/tools/index.ts`
  - Consistent with Stage 12 implementation

- [ ] Response format uses `buildMcpResponse` utilities
  - Import from `services/mcp/response.ts`

- [ ] Input validation uses Zod schemas
  - Pattern: `const InputSchema = { field: z.string()... }`

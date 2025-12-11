# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)

## Code Quality (per constitution § TypeScript Standards)

- [ ] No `any` types - all cost data properly typed
  - Reference: Constitution § TypeScript Standards
  - Types defined in `apps/api/src/services/cost/types.ts`
- [ ] Strict mode enabled - no implicit any, strict null checks
  - Reference: Constitution § TypeScript Standards
- [ ] Decimal type used for cost calculations (prevent floating point errors)
  - Use Prisma Decimal, convert to Number only for display

## File Size Limits (per constitution § File Size Limits)

- [ ] Services < 400 lines each
  - Reference: Constitution § File Size Limits
  - Split cost service: types.ts, estimate.ts, statistics.ts, index.ts
- [ ] React components < 400 lines
  - Reference: Constitution § File Size Limits
  - CostBreakdown.tsx should be < 100 lines

## Logging (per constitution § Logging Standards)

- [ ] Use `createLogger` for all new services (not console.log)
  - Reference: Constitution § Logging Standards
  - Import from `@valuerank/shared`
- [ ] Structured logging with context objects
  - Log: `log.info({ modelId, estimatedCost }, 'Cost calculated')`
  - Not: `log.info('Cost calculated for ' + modelId)`
- [ ] Include correlation IDs (runId) in all log entries

## Error Handling (per constitution § Error Handling)

- [ ] Custom error classes for cost-specific errors
  - Reference: Constitution § Error Handling
  - Use ValidationError for invalid inputs
- [ ] Graceful handling of missing data (fallback to system defaults)
- [ ] All async operations wrapped in try/catch

## Database Access (per constitution § Database Access)

- [ ] Use Prisma with full type safety
  - Reference: Constitution § Database Access
- [ ] Transactions for multi-step operations (upsert stats)
- [ ] Soft delete patterns followed (if applicable)

## API Design

- [ ] GraphQL types match contracts/cost-schema.graphql
- [ ] MCP tool response format matches plan.md specification
- [ ] Consistent naming: camelCase in code, snake_case in DB

## Code Organization (per constitution § Code Organization)

- [ ] Import order: Node → External → Internal → Relative
  - Reference: Constitution § Code Organization
- [ ] Services in `apps/api/src/services/cost/`
- [ ] GraphQL types in `apps/api/src/graphql/types/`
- [ ] Components in `apps/web/src/components/runs/`

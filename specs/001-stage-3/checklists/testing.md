# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [stage-3-tasks.md](../stage-3-tasks.md)

## Test Coverage (per CLAUDE.md)

- [ ] Line coverage ≥ 80%
  - Reference: CLAUDE.md § Testing Requirements
  - Command: `npm run test:coverage`
  - Directory: apps/api/src/graphql/

- [ ] Branch coverage ≥ 75%
  - Reference: CLAUDE.md § Testing Requirements
  - Cover: error paths, null checks, filter combinations

- [ ] Function coverage ≥ 80%
  - Reference: CLAUDE.md § Testing Requirements
  - All resolvers and DataLoader functions tested

## Test Structure (per CLAUDE.md)

- [ ] Test files in tests/ directory
  - Reference: CLAUDE.md § Test Files Location
  - Pattern: `apps/api/tests/graphql/**/*.test.ts`

- [ ] Descriptive test structure
  - Reference: CLAUDE.md § Test Structure
  - Pattern: `describe('Type', () => describe('method', () => it('behavior')))`

- [ ] Clear test names
  - Format: `it('returns definition when exists')`
  - Format: `it('returns null when not found')`
  - Format: `it('throws NotFoundError for invalid parentId')`

## What to Test (per CLAUDE.md)

- [ ] Business logic tested
  - Reference: CLAUDE.md § What to Test
  - Focus: ensureSchemaVersion, DataLoader batching

- [ ] Edge cases covered
  - Null parent_id for root definitions
  - Empty arrays vs null
  - Invalid JSON in mutations
  - Non-existent IDs

- [ ] Database mocked appropriately
  - Reference: CLAUDE.md § What to Test
  - Mock: Prisma client for unit tests
  - Use: Test database for integration tests

## GraphQL-Specific Tests

- [ ] Query tests verify response shape
  - All expected fields returned
  - Correct types (ID, String, JSON, etc.)
  - Nullable fields can be null

- [ ] Mutation tests verify persistence
  - Entity created in database
  - Correct field values stored
  - Relationships established

- [ ] DataLoader tests verify batching
  - Multiple loads result in single query
  - Null handling for missing keys
  - Per-request isolation

- [ ] Error tests verify GraphQL error format
  - `errors` array present
  - `extensions.code` matches error type
  - Message is user-friendly

## Integration Test Setup

- [ ] Test database configured
  - Separate DATABASE_URL for tests
  - Reset between test suites
  - Seed with known test data

- [ ] GraphQL client for tests
  - Use supertest with Express app
  - Send POST to /graphql
  - Parse JSON response

## Pre-Commit Verification

- [ ] All tests pass before commit
  - Command: `npm run test`

- [ ] Build succeeds
  - Command: `npm run build`

- [ ] Linting passes
  - Command: `npm run lint`

- [ ] Type checking passes
  - Command: `npm run typecheck`

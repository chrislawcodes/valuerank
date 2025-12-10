# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)

## Pre-Commit Requirements (per Constitution)

- [ ] All tests pass
  - Command: `npm test` from `cloud/` directory
  - Reference: Constitution § Testing Requirements
- [ ] Build succeeds
  - Command: `npx turbo build`
  - Reference: Constitution § Testing Requirements
- [ ] No TypeScript errors
  - Command: `npx tsc --noEmit`

## Test Coverage (per Constitution)

- [ ] Line coverage ≥ 80% (target 90%)
  - Reference: Constitution § Coverage Targets
- [ ] Branch coverage ≥ 75% (target 85%)
  - Reference: Constitution § Coverage Targets
- [ ] Function coverage ≥ 80% (target 90%)
  - Reference: Constitution § Coverage Targets

## Test Structure (per Constitution)

- [ ] Tests in `apps/api/tests/` mirroring `src/` structure
  - Reference: Constitution § Test Files Location
- [ ] Describe blocks for each service/function
  - Reference: Constitution § Test Structure
- [ ] Clear test names describing behavior

## What to Test (per Constitution)

- [ ] Business logic: audit service create/query functions
  - Reference: Constitution § What to Test
- [ ] Data transformations: audit log filters
- [ ] Edge cases: null userId, system actor, empty metadata
- [ ] Mock: Database calls in unit tests
- [ ] Integration tests: GraphQL queries with test database

## Feature-Specific Tests

### Audit Service Tests (`apps/api/tests/services/audit/`)

- [ ] createAuditLog creates entry with all required fields
- [ ] createAuditLog handles null userId (system actor)
- [ ] queryAuditLogs filters by entityType/entityId
- [ ] queryAuditLogs filters by userId
- [ ] queryAuditLogs filters by date range
- [ ] queryAuditLogs paginates correctly

### GraphQL Query Tests (`apps/api/tests/graphql/queries/`)

- [ ] auditLogs query returns paginated results
- [ ] auditLogs query filters work correctly
- [ ] entityAuditHistory returns entity-specific history
- [ ] Queries require authentication

### GraphQL Type Tests (`apps/api/tests/graphql/types/`)

- [ ] Definition.createdBy resolves user
- [ ] Definition.deletedBy resolves user when deleted
- [ ] Run.createdBy resolves user
- [ ] Run.deletedBy resolves user when deleted
- [ ] Tag.createdBy resolves user
- [ ] LlmModel.createdBy resolves user

### Mutation Integration Tests

- [ ] createDefinition sets createdByUserId
- [ ] createDefinition creates audit log entry
- [ ] deleteDefinition sets deletedByUserId
- [ ] deleteDefinition creates audit log entry
- [ ] startRun sets createdByUserId
- [ ] startRun creates audit log entry
- [ ] All 27 mutations create audit entries (comprehensive test)

## Test Database (per Constitution)

- [ ] Tests use `valuerank_test` database
  - Reference: Constitution § Database Connections
- [ ] Test data cleaned up or isolated
  - Reference: Constitution § Troubleshooting Test Failures
- [ ] PgBoss mocked for queue tests
  - Reference: Constitution § Troubleshooting Test Failures

## Performance Tests

- [ ] Audit log creation completes in <10ms
- [ ] Audit log queries return in <500ms
- [ ] No N+1 queries in createdBy/deletedBy resolvers

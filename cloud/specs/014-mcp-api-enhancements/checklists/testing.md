# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)

## Pre-Commit Requirements (per constitution)

- [ ] All tests pass
  - Command: `npm test`
  - Reference: Constitution § Testing Requirements

- [ ] Build succeeds
  - Command: `npx turbo build`
  - Reference: Constitution § Testing Requirements

- [ ] No TypeScript errors
  - Command: `npx tsc --noEmit`
  - Reference: Constitution § TypeScript Standards

## Test Coverage (per constitution)

- [ ] Line coverage ≥ 80%
  - Command: `npm run test:coverage`
  - Reference: Constitution § Coverage Targets
  - Minimum: 80%, Target: 90%

- [ ] Branch coverage ≥ 75%
  - Reference: Constitution § Coverage Targets
  - Minimum: 75%, Target: 85%

- [ ] Function coverage ≥ 80%
  - Reference: Constitution § Coverage Targets
  - Minimum: 80%, Target: 90%

## Test Structure (per constitution)

- [ ] Test files mirror source structure
  - Reference: Constitution § Test Files Location
  - `apps/api/tests/mcp/tools/*.test.ts`

- [ ] Descriptive test names
  - Reference: Constitution § Test Structure
  - `describe('ToolName', () => { describe('scenario', () => { it('behavior', ...) }) })`

## What to Test (per constitution)

- [ ] Business logic tested
  - Reference: Constitution § What to Test
  - Validation rules, cascading behavior

- [ ] Data transformations tested
  - Reference: Constitution § What to Test
  - Input parsing, response formatting

- [ ] Edge cases covered
  - Reference: Constitution § What to Test
  - Already deleted, not found, running runs

- [ ] Error scenarios tested
  - Reference: Constitution § What to Test
  - 404, validation errors, conflicts

## Test Mocking (per constitution)

- [ ] Database mocked appropriately
  - Reference: Constitution § What to Test
  - Use Prisma mocks or test database

- [ ] PgBoss mocked for job cancellation
  - Reference: Constitution § Troubleshooting Test Failures
  - Mock `getBoss` for delete_run tests

- [ ] External APIs mocked
  - Reference: Constitution § What to Test
  - No real LLM calls in unit tests

## Test Isolation

- [ ] Tests don't pollute shared state
  - Reference: Constitution § Troubleshooting Test Failures
  - Use unique IDs or cleanup after tests

- [ ] Each test can run independently
  - Reference: Constitution § Test Structure
  - No test ordering dependencies

## Feature-Specific Test Cases

### Delete Operations

- [ ] Soft delete sets `deletedAt` timestamp
- [ ] Cascading delete affects related entities
- [ ] Already-deleted entity returns appropriate response
- [ ] Non-existent entity returns 404
- [ ] Running run blocks definition delete
- [ ] Job cancellation works for running runs

### LLM Read Operations

- [ ] Empty provider list returns empty array
- [ ] Filters work correctly (provider_id, status)
- [ ] Response size within limits
- [ ] Include_models parameter works

### LLM Write Operations

- [ ] Create model validates provider exists
- [ ] Duplicate model_id returns conflict error
- [ ] Update respects immutable fields
- [ ] Deprecate promotes new default
- [ ] Set default validates model is ACTIVE

### System Settings

- [ ] List returns all settings
- [ ] Key filter returns single setting
- [ ] Set infra model validates purpose

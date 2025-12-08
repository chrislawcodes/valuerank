# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)

## Coverage Requirements (per Constitution)

- [ ] Line coverage ≥ 80% minimum (90% target)
  - Reference: Constitution § Testing Requirements
  - Command: `npm run test:coverage`

- [ ] Branch coverage ≥ 75% minimum (85% target)
  - Reference: Constitution § Testing Requirements

- [ ] Function coverage ≥ 80% minimum (90% target)
  - Reference: Constitution § Testing Requirements

## Test Structure (per Constitution)

- [ ] Tests follow `describe` → `describe` → `it` pattern
  - Reference: Constitution § Test Structure
  - Example: `describe('CreateDefinitionTool')` → `describe('create')` → `it('creates with valid input')`

- [ ] Test files in `apps/api/tests/` mirroring source structure
  - Reference: Constitution § Test Files Location
  - Pattern: `src/mcp/tools/create-definition.ts` → `tests/mcp/tools/create-definition.test.ts`

## What to Test (per Constitution)

- [ ] Business logic tested (validation, transformation)
  - Reference: Constitution § What to Test

- [ ] Edge cases tested (limits, missing fields, not found)
  - Reference: Constitution § What to Test

- [ ] Database operations mocked
  - Reference: Constitution § What to Test
  - Pattern: `vi.mock('@valuerank/db', ...)`

- [ ] PgBoss operations mocked
  - Reference: Constitution § Troubleshooting Test Failures
  - Pattern: `vi.mock('../../queue/boss.js', ...)`

## Pre-Commit Requirements

- [ ] All tests pass
  - Command: `npm test`

- [ ] TypeScript compiles without errors
  - Command: `npm run typecheck`

- [ ] Linting passes
  - Command: `npm run lint`

## Test Coverage by Component

### Write Tools
- [ ] `create-definition.test.ts` - valid input, validation errors, missing fields, audit log
- [ ] `fork-definition.test.ts` - valid fork, partial changes, parent not found, soft-deleted parent
- [ ] `validate-definition.test.ts` - valid content, errors, warnings, scenario count
- [ ] `start-run.test.ts` - valid run, definition not found, invalid model, job queuing
- [ ] `generate-scenarios-preview.test.ts` - valid preview, definition not found, sample limit

### Services
- [ ] `validation.test.ts` - all limits, error messages, warnings
- [ ] `audit.test.ts` - log entry format, structured logging

### Resources
- [ ] `resources/index.test.ts` - all 4 resources accessible, unknown resource error

### Integration
- [ ] `integration.test.ts` - end-to-end MCP write flow with audit verification

## Test Isolation

- [ ] Each test uses unique IDs or timestamps
  - Reference: Constitution § Troubleshooting Test Failures
  - Pattern: `const testId = 'test-' + Date.now()`

- [ ] Tests don't depend on global state
  - Each test creates its own fixtures

- [ ] Database mocked consistently
  - Pattern: `vi.mock('@valuerank/db', ...)`

## Environment Variables for Tests

- [ ] JWT_SECRET set for test runs
  - Value: `"test-secret-that-is-at-least-32-characters-long"`
  - Reference: Constitution § Required Environment Variables

- [ ] DATABASE_URL set to test database
  - Value: `"postgresql://valuerank:valuerank@localhost:5433/valuerank_test"`
  - Reference: Constitution § Required Environment Variables

# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)
**Constitution**: [cloud/CLAUDE.md](../../../CLAUDE.md)

## Coverage Targets (per constitution)

- [ ] Line coverage ≥ 80% (minimum)
- [ ] Branch coverage ≥ 75% (minimum)
- [ ] Function coverage ≥ 80% (minimum)
  - Reference: Constitution § Testing Requirements
  - Command: `npm run test:coverage`

## Test Structure (per constitution)

- [ ] Tests in `tests/` directory mirroring `src/` structure
- [ ] Use describe/it blocks for organization
- [ ] Descriptive test names
  - Reference: Constitution § Test Structure

## What to Test (per constitution)

- [ ] Business logic tested
- [ ] Data transformations tested
- [ ] Edge cases covered
- [ ] Database mocked appropriately
- [ ] External APIs mocked
  - Reference: Constitution § What to Test

## Test Database (per constitution)

- [ ] Tests use `valuerank_test` database
- [ ] Test database setup: `npm run db:test:setup`
- [ ] Test database reset if needed: `npm run db:test:reset`
  - Reference: Constitution § Test Database Provisioning

## Pre-Commit Requirements

- [ ] All TypeScript tests pass: `npm test`
- [ ] All Python tests pass: `cd workers && PYTHONPATH=. pytest tests/ -v`
- [ ] TypeScript builds without errors
- [ ] No lint errors

## Test Types Required

### Unit Tests

- [ ] Prisma query helpers (`packages/db/tests/llm.test.ts`)
- [ ] GraphQL resolvers (mock database)
- [ ] Cost calculation helpers
- [ ] Rate limit detection logic
- [ ] Python model metadata fetching

### Integration Tests

- [ ] GraphQL queries with test database
- [ ] GraphQL mutations with test database
- [ ] Model lifecycle (create → edit → deprecate)
- [ ] Run creation with model validation

### Manual Tests (per quickstart.md)

- [ ] View models in Settings UI
- [ ] Add new model via UI
- [ ] Edit model costs via UI
- [ ] Deprecate model via UI
- [ ] Set default model via UI
- [ ] Configure infrastructure model
- [ ] Verify parallelism enforcement
- [ ] Verify cost display in run details

## Environment Variables for Tests

```bash
JWT_SECRET="test-secret-that-is-at-least-32-characters-long"
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test"
```

## Troubleshooting (per constitution)

- [ ] "column X does not exist" → Run `npm run db:test:setup`
- [ ] Foreign key violations → Run `npm run db:test:reset`
- [ ] "PgBoss not initialized" → Mock `getBoss` in test
- [ ] Test isolation issues → Use unique IDs or upsert
  - Reference: Constitution § Troubleshooting Test Failures

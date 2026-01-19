# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)

## Pre-Commit Requirements (per constitution cloud/CLAUDE.md)

- [ ] All tests pass before commit
  - Command: `DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" JWT_SECRET="test-secret-that-is-at-least-32-characters-long" npx turbo run test`
  - Reference: Constitution § Running Tests
- [ ] Build succeeds
  - Command: `npx turbo run build`
- [ ] Lint passes
  - Command: `npx turbo run lint`
- [ ] Pre-push hook passes (lint + build)
  - Reference: Constitution § Pre-push Hook

## Test Coverage (per constitution)

- [ ] Line coverage ≥ 80% minimum
  - Reference: Constitution § Coverage Targets
- [ ] Branch coverage ≥ 75% minimum
- [ ] Function coverage ≥ 80% minimum
- [ ] Coverage command: `npx turbo run test:coverage`

## Test Structure (per constitution)

- [ ] Tests use describe/it blocks
- [ ] Tests in `tests/` directory parallel to `src/`
- [ ] Test file naming: `*.test.ts`
- [ ] Reference: Constitution § Test Structure

## Required Unit Tests

### API Layer (TypeScript)

- [ ] `startRun` with samplesPerScenario=3 creates correct job count
- [ ] `startRun` validation rejects samplesPerScenario < 1 or > 100
- [ ] `startRun` defaults samplesPerScenario to 1 when not provided
- [ ] Progress total reflects scenarios × models × samples
- [ ] Transcript creation includes sampleIndex
- [ ] ProbeResult creation includes sampleIndex

### Python Workers

- [ ] Variance computation accuracy (compare to known values)
- [ ] Confidence interval calculation (95% CI)
- [ ] Scenario variance computation
- [ ] analyze_basic with multi-sample transcripts
- [ ] analyze_basic with single-sample (no variance fields)

### Frontend (if applicable)

- [ ] Error bar component renders when sampleCount > 1
- [ ] Error bars hidden when sampleCount = 1
- [ ] Tooltip displays variance stats

## Integration Tests

- [ ] Full pipeline: start run → probe → summarize → analyze → verify variance
- [ ] Export includes sample_index column
- [ ] GraphQL queries return variance fields
- [ ] MCP tool accepts samples_per_scenario

## Edge Case Tests

- [ ] Sample count of 1 behaves like current system
- [ ] Partial sample completion (some failures)
- [ ] All samples identical (variance = 0)
- [ ] Maximum sample count (100)
- [ ] Existing runs without samplesPerScenario config

## Test Database

- [ ] Tests use `valuerank_test` database
  - URL: `postgresql://valuerank:valuerank@localhost:5433/valuerank_test`
- [ ] Test database migrated: `npm run db:test:setup`
- [ ] Reference: Constitution § Test Database Provisioning

## Test Isolation

- [ ] Use unique IDs or timestamps in test data
- [ ] Use upsert for shared fixtures
- [ ] Mock PgBoss in unit tests
- [ ] Reference: Constitution § Test isolation issues

## Manual Testing

- [ ] Complete quickstart.md scenarios
- [ ] Visual verification of error bars
- [ ] Tooltip shows correct variance info
- [ ] Progress tracking reflects total samples
- [ ] Export verification

## Test Commands Reference

```bash
# Run all tests
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
JWT_SECRET="test-secret-that-is-at-least-32-characters-long" \
npx turbo run test

# Run with coverage
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
JWT_SECRET="test-secret-that-is-at-least-32-characters-long" \
npx turbo run test:coverage

# Run specific test file
cd cloud/apps/api && \
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
JWT_SECRET="test-secret-that-is-at-least-32-characters-long" \
npx vitest run tests/services/run/start.test.ts

# Run Python tests
cd cloud/workers && PYTHONPATH=. pytest tests/ -v

# Setup test database
npm run db:test:setup

# Reset test database (clean slate)
npm run db:test:reset
```

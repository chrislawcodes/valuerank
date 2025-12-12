# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)

## Test Coverage (per constitution)

Per `/Users/chrisanderson/Code/valuerank/cloud/CLAUDE.md`:

- [ ] Line coverage ≥ 80% (minimum)
  - Reference: Constitution § Coverage Targets
  - Command: `npx turbo run test:coverage`
- [ ] Branch coverage ≥ 75% (minimum)
  - Reference: Constitution § Coverage Targets
- [ ] Function coverage ≥ 80% (minimum)
  - Reference: Constitution § Coverage Targets

## Test Structure (per constitution)

- [ ] Tests use describe/it blocks with clear descriptions
  - Reference: Constitution § Test Structure
- [ ] Tests located in parallel directory structure (`tests/` mirrors `src/`)
  - Reference: Constitution § Test Files Location

## What to Test (per constitution)

- [ ] Business logic tested
- [ ] Data transformations tested
- [ ] Edge cases covered
- [ ] Database mocked (not real DB in unit tests)
- [ ] External APIs mocked
  - Reference: Constitution § What to Test

## Pre-Commit Requirements

- [ ] All tests pass before commit
  - Command: `DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" JWT_SECRET="test-secret-that-is-at-least-32-characters-long" npx turbo run test`
- [ ] Build succeeds
  - Command: `npx turbo build`
- [ ] No TypeScript errors
  - Command: `npx tsc --noEmit`

## Test Quality

- [ ] Tests are maintainable (not brittle)
- [ ] Tests have clear assertions
- [ ] Test data is representative
- [ ] Tests run in isolation (no shared state between tests)
- [ ] Async operations properly awaited

## Component Tests (React)

- [ ] AnalysisCard renders correctly for all states
- [ ] AnalysisListFilters interactions work
- [ ] AnalysisDetail handles loading/error states
- [ ] Navigation between pages works

## Hook Tests

- [ ] useRunsWithAnalysis fetches correctly
- [ ] Hook handles loading state
- [ ] Hook handles error state
- [ ] Hook refetch works

## API Tests

- [ ] `runs` query with `hasAnalysis` filter returns correct results
- [ ] `runs` query with `analysisStatus` filter returns correct results
- [ ] Pagination works with new filters

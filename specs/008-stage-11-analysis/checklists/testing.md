# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)

## Coverage Requirements (per constitution - cloud/CLAUDE.md)

- [ ] Line coverage ≥ 80% minimum
  - Reference: Constitution "Coverage Targets" table
  - Target: 90%

- [ ] Branch coverage ≥ 75% minimum
  - Reference: Constitution "Coverage Targets" table
  - Target: 85%

- [ ] Function coverage ≥ 80% minimum
  - Reference: Constitution "Coverage Targets" table
  - Target: 90%

## Test Structure (per constitution)

- [ ] Tests follow describe/it pattern
  - Reference: Constitution "Test Structure" section
  - Pattern: `describe('Service', () => { describe('method', () => { it('does X', ...) }) })`

- [ ] Tests located in parallel tests/ directory
  - Reference: Constitution "Test Files Location"
  - Pattern: `src/services/foo.ts` → `tests/services/foo.test.ts`

## What to Test (per constitution)

- [ ] Business logic tested
- [ ] Data transformations tested
- [ ] Edge cases tested
- [ ] Database mocked appropriately
- [ ] External APIs mocked

## Pre-Commit Requirements

- [ ] All tests pass: `npm run test`
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] Lint passes: `npm run lint`
- [ ] No console.log statements (use logger)

## Python-Specific Testing

- [ ] pytest tests in workers/tests/
- [ ] Statistical functions verified against scipy reference
- [ ] Edge cases: empty data, single value, ties
- [ ] Coverage report: `pytest --cov=workers`

## React Component Testing

- [ ] Testing Library used for component tests
- [ ] User interactions tested
- [ ] Loading states tested
- [ ] Error states tested
- [ ] Empty states tested

## Integration Testing

- [ ] End-to-end flow: run completion → analysis → display
- [ ] GraphQL queries return expected data
- [ ] Cache hit/miss scenarios verified
- [ ] Python worker integration tested

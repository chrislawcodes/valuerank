# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)

## Pre-Commit Requirements (per constitution)

- [ ] All tests pass before commit
  - Command: `DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" JWT_SECRET="test-secret-that-is-at-least-32-characters-long" npx turbo run test`
- [ ] TypeScript compiles without errors
  - Command: `npx turbo build`
- [ ] Coverage meets threshold
  - Reference: Constitution "Coverage Targets" - 80% line coverage minimum

## Test Coverage (per constitution)

- [ ] Line coverage ≥ 80%
  - Reference: Constitution "Testing Requirements"
- [ ] Branch coverage ≥ 75%
- [ ] Function coverage ≥ 80%
- [ ] Command: `npx turbo run test:coverage`

## Test Structure (per constitution)

- [ ] Tests follow `describe`/`it` structure
  - Reference: Constitution "Test Structure"
- [ ] Test files mirror source structure
  - Source: `src/mcp/tools/recover-run.ts`
  - Test: `tests/mcp/tools/recover-run.test.ts`
- [ ] Mock external dependencies (Prisma, PgBoss)

## Test Quality

- [ ] Happy path tested for each tool
- [ ] Error cases tested (NOT_FOUND, INVALID_STATE)
- [ ] Edge cases tested (empty results, large datasets)
- [ ] Acceptance scenarios from spec covered

## Test Data

- [ ] Use test database (`valuerank_test`)
- [ ] Unique IDs per test to avoid conflicts
- [ ] Clean up test data or use transactions

## Integration Tests

- [ ] MCP tool registration works
- [ ] End-to-end recovery flow tested
- [ ] Job queue queries return accurate counts

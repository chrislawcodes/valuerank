# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)

## Pre-Commit Requirements (per constitution cloud/CLAUDE.md)

- [ ] All tests pass
  - Command: `npm test` in cloud/
- [ ] Build succeeds
  - Command: `npx turbo build` in cloud/
- [ ] No TypeScript errors
  - Command: `npx tsc --noEmit` in cloud/apps/api and cloud/apps/web

## Test Coverage (per constitution cloud/CLAUDE.md)

- [ ] Line coverage ≥ 80% (minimum)
  - Reference: Constitution § Coverage Targets
  - Command: `npm run test:coverage`
- [ ] Branch coverage ≥ 75% (minimum)
- [ ] Function coverage ≥ 80% (minimum)

## Test Structure (per constitution cloud/CLAUDE.md)

- [ ] Tests organized by feature/module
  - Reference: Constitution § Test Structure
- [ ] Descriptive test names (describe/it blocks)
- [ ] Test files in appropriate `tests/` directories
  - Reference: Constitution § Test Files Location

## What to Test (per constitution cloud/CLAUDE.md)

- [ ] Business logic covered
- [ ] Data transformations tested
- [ ] Edge cases handled
- [ ] Error conditions verified
  - Reference: Constitution § What to Test

## Mocking (per constitution cloud/CLAUDE.md)

- [ ] Database mocked in unit tests
- [ ] PgBoss mocked appropriately
- [ ] External APIs mocked
  - Reference: Constitution § What to Test - Mock section

## Test Database (per constitution cloud/CLAUDE.md)

- [ ] Integration tests use test database
  - URL: `postgresql://valuerank:valuerank@localhost:5433/valuerank_test`
- [ ] Test database schema up to date
  - Command: `npm run db:test:setup`
  - Reference: Constitution § Test Database Provisioning

## Feature-Specific Tests

### Service Tests
- [ ] `summarization-parallelism.test.ts` - Setting CRUD, cache, validation
- [ ] `run/summarization.test.ts` - Cancel/restart logic, edge cases

### GraphQL Tests
- [ ] `cancel-summarization.test.ts` - Mutation with auth, audit logging
- [ ] `restart-summarization.test.ts` - Mutation modes, validation

### MCP Tests
- [ ] `set-summarization-parallelism.test.ts` - Tool invocation, validation
- [ ] `cancel-summarization.test.ts` - Tool invocation, error handling
- [ ] `restart-summarization.test.ts` - Tool invocation, force mode

### UI Tests
- [ ] `SummarizationControls.test.tsx` - Button visibility, interactions

## Manual Testing

- [ ] Complete all scenarios in [quickstart.md](../quickstart.md)
- [ ] Test cancel mid-summarization
- [ ] Test restart with failed transcripts
- [ ] Test force re-summarize
- [ ] Test UI button interactions
- [ ] Test MCP tools via Claude Code

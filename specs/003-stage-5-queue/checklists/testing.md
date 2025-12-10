# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)
**Constitution**: [CLAUDE.md](../../../CLAUDE.md)

## Coverage Requirements (per constitution)

- [ ] Line coverage ≥ 80% on queue code
  - Reference: CLAUDE.md § Testing Requirements - Coverage Targets
  - Command: `npm run test:coverage`
- [ ] Branch coverage ≥ 75%
  - Reference: CLAUDE.md § Testing Requirements - Coverage Targets
- [ ] Function coverage ≥ 80%
  - Reference: CLAUDE.md § Testing Requirements - Coverage Targets

## Test Structure (per constitution)

- [ ] Tests organized in `tests/` mirroring `src/` structure
  - Reference: CLAUDE.md § Testing Requirements - Test Files Location
  - `tests/queue/` mirrors `src/queue/`
  - `tests/services/run/` mirrors `src/services/run/`
- [ ] Describe blocks group related tests
  - Reference: CLAUDE.md § Testing Requirements - Test Structure
- [ ] Test names clearly state what is being tested

## What to Test (per constitution)

- [ ] Business logic tested (run creation, progress updates)
  - Reference: CLAUDE.md § Testing Requirements - What to Test
- [ ] Data transformations tested (job data formatting)
- [ ] Edge cases tested (empty scenarios, large runs)
- [ ] Database mocked in unit tests
- [ ] External APIs mocked (PgBoss)
- [ ] Integration tests for API routes with test database

## Pre-Commit Requirements

- [ ] All tests pass before commit
  - Command: `npm test`
- [ ] TypeScript compiles without errors
  - Command: `npm run typecheck`
- [ ] Linting passes
  - Command: `npm run lint`

## Queue-Specific Tests

### Unit Tests Required

- [ ] `tests/queue/boss.test.ts` - PgBoss initialization
- [ ] `tests/queue/spawn.test.ts` - spawnPython utility (mock process)
- [ ] `tests/queue/handlers/probe-scenario.test.ts` - Job handler logic
- [ ] `tests/services/run/start.test.ts` - Run creation and job queuing
- [ ] `tests/services/run/progress.test.ts` - Progress tracking
- [ ] `tests/services/run/control.test.ts` - Pause/resume/cancel

### Integration Tests Required

- [ ] `tests/graphql/mutations/run.test.ts` - startRun, pauseRun, resumeRun, cancelRun
- [ ] `tests/graphql/queries/queue.test.ts` - queueStatus
- [ ] `tests/graphql/mutations/queue.test.ts` - pauseQueue, resumeQueue

### Test Scenarios from Spec

- [ ] US1: Start run creates correct number of jobs
- [ ] US1: Sampling with seed is deterministic
- [ ] US2: Progress updates are visible after job completion
- [ ] US2: Run status transitions correctly
- [ ] US3: Pause stops new job dispatch
- [ ] US3: Resume continues processing
- [ ] US4: Cancel removes pending jobs
- [ ] US4: Cancel preserves completed results
- [ ] US5: Queue status returns accurate counts
- [ ] US6: Global pause stops all processing
- [ ] US7: Failed jobs retry with backoff
- [ ] US8: High priority jobs processed first

## Performance Tests

- [ ] Job creation for 1000+ scenarios completes in <5 seconds
  - Reference: spec.md NFR-001
- [ ] Progress query responds in <100ms
  - Reference: spec.md NFR-002

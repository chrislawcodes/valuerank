# Tasks: Stage 5 - Queue System & Job Infrastructure

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [contracts/queue-schema.graphql](./contracts/queue-schema.graphql)

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1, US2, etc.) - only in user story phases
- Paths reference plan.md structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and dependency installation

- [X] T001 Install pg-boss dependency: `npm install pg-boss` in `apps/api`
- [X] T002 [P] Add pg-boss types if needed: `npm install @types/pg-boss -D`
  - Note: Types bundled with pg-boss, no separate package needed
- [X] T003 [P] Add queue-related environment variables to `apps/api/.env.example`

**Checkpoint**: Dependencies installed and ready for implementation

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Core queue infrastructure that MUST be complete before ANY user story

⚠️ **CRITICAL**: No user story work can begin until this phase is complete

### Queue Core

- [ ] T004 Create queue types file: `apps/api/src/queue/types.ts`
  - Define JobType union type
  - Define ProbeScenarioJobData interface
  - Define AnalyzeBasicJobData interface
  - Define AnalyzeDeepJobData interface
  - Define job options interfaces

- [ ] T005 Create PgBoss initialization: `apps/api/src/queue/boss.ts`
  - Initialize PgBoss with DATABASE_URL
  - Configure maintenance interval (30s)
  - Configure archive retention (24h)
  - Export singleton instance
  - Add startup/shutdown hooks

- [ ] T006 Create queue configuration: `apps/api/src/config.ts` (extend existing)
  - Add PGBOSS_MAINTENANCE_INTERVAL
  - Add PGBOSS_ARCHIVE_AFTER
  - Add QUEUE_WORKER_CONCURRENCY

### Python Spawn Utility

- [ ] T007 Create spawnPython utility: `apps/api/src/queue/spawn.ts`
  - Implement spawnPython<T> generic function
  - JSON stdin/stdout communication
  - Timeout handling
  - Error propagation with stderr capture
  - Add structured logging

### Stub Handlers

- [ ] T008 Create handler index: `apps/api/src/queue/handlers/index.ts`
  - Export handler registration function
  - Define handler interface

- [ ] T009 [P] Create probe:scenario stub handler: `apps/api/src/queue/handlers/probe-scenario.ts`
  - Log job receipt
  - Simulate work with configurable delay
  - Return mock transcript data
  - Handle test failure injection

- [ ] T010 [P] Create analyze:basic stub handler: `apps/api/src/queue/handlers/analyze-basic.ts`
  - Log job receipt
  - Return mock analysis results

- [ ] T011 [P] Create analyze:deep stub handler: `apps/api/src/queue/handlers/analyze-deep.ts`
  - Log job receipt
  - Return mock deep analysis results

### Orchestrator

- [ ] T012 Create orchestrator: `apps/api/src/queue/orchestrator.ts`
  - Subscribe to all job types
  - Configure concurrency per type
  - Handle graceful shutdown
  - Add structured logging for job lifecycle

- [ ] T013 Create queue module index: `apps/api/src/queue/index.ts`
  - Export public API (boss, orchestrator, types)

### Error Classes

- [ ] T014 Add queue error classes to: `apps/api/src/errors.ts` or `packages/shared/src/errors.ts`
  - QueueError extends AppError
  - JobValidationError extends AppError
  - RunStateError extends AppError

### GraphQL Foundation Types

- [ ] T015 Create QueueStatus GraphQL type: `apps/api/src/graphql/types/queue-status.ts`
  - QueueStatus type
  - JobTypeStatus type
  - Build with Pothos

- [ ] T016 [P] Create RunProgress GraphQL type: `apps/api/src/graphql/types/run-progress.ts`
  - RunProgress type
  - TaskResult type
  - TaskStatus enum
  - Extend Run type with progress field

- [ ] T017 [P] Create RunPriority enum: `apps/api/src/graphql/types/enums.ts` (extend existing)
  - Add RunPriority enum (LOW, NORMAL, HIGH)

- [ ] T018 Create StartRunInput type: `apps/api/src/graphql/types/inputs/start-run.ts`
  - definitionId, models, samplePercentage, sampleSeed, priority, experimentId

- [ ] T019 Update GraphQL types index: `apps/api/src/graphql/types/index.ts`
  - Export new types

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Start a Run via GraphQL (Priority: P1) 🎯 MVP

**Goal**: Users can start evaluation runs that queue jobs for each model-scenario combination

**Independent Test**: Call startRun mutation, verify run created and jobs appear in PgBoss queue

### Run Service Implementation

- [ ] T020 [US1] Create run service directory: `apps/api/src/services/run/`

- [ ] T021 [US1] Implement startRun service: `apps/api/src/services/run/start.ts`
  - Validate definition exists and has scenarios
  - Validate models list non-empty
  - Implement deterministic scenario sampling (samplePercentage, sampleSeed)
  - Create Run record with PENDING status
  - Create definition snapshot in run config
  - Batch-create probe:scenario jobs in PgBoss
  - Initialize progress: {total: N, completed: 0, failed: 0}
  - Use transaction for atomicity

- [ ] T022 [US1] Create run service index: `apps/api/src/services/run/index.ts`
  - Export startRun and future functions

### GraphQL Mutation

- [ ] T023 [US1] Create startRun mutation: `apps/api/src/graphql/mutations/run.ts`
  - Input validation with Zod
  - Call run service
  - Return Run with progress
  - Require authentication

- [ ] T024 [US1] Update mutations index: `apps/api/src/graphql/mutations/index.ts`
  - Export run mutations

### Server Integration

- [ ] T025 [US1] Integrate queue startup in server: `apps/api/src/server.ts`
  - Start PgBoss on server init
  - Start orchestrator after PgBoss ready
  - Add graceful shutdown for queue

### Tests

- [ ] T026 [US1] Unit tests for startRun service: `apps/api/tests/services/run/start.test.ts`
  - Test job creation count matches model × scenario
  - Test sampling with deterministic seed
  - Test validation errors (no scenarios, invalid definition)
  - Test progress initialization

- [ ] T027 [US1] Integration tests for startRun mutation: `apps/api/tests/graphql/mutations/run.test.ts`
  - Test authenticated request succeeds
  - Test unauthenticated request fails
  - Test run and jobs created in database

**Checkpoint**: User Story 1 complete - can start runs and see jobs queued

---

## Phase 4: User Story 2 - View Run Progress via Polling (Priority: P1) 🎯 MVP

**Goal**: Users can poll for run progress and see completed/failed job counts

**Independent Test**: Start run, complete some jobs via test helper, query progress and verify counts

### Progress Tracking

- [ ] T028 [US2] Implement progress service: `apps/api/src/services/run/progress.ts`
  - updateProgress(runId, {completed?: +1, failed?: +1})
  - Use PostgreSQL JSONB operators for atomic increment
  - Update run status based on progress (RUNNING when first job, COMPLETED when all done)
  - Calculate byModel breakdown (optional)

- [ ] T029 [US2] Wire progress updates into handlers: `apps/api/src/queue/handlers/probe-scenario.ts`
  - Call progress.incrementCompleted on success
  - Call progress.incrementFailed on failure
  - Store transcript result on success

### GraphQL Queries

- [ ] T030 [US2] Implement Run.progress resolver: `apps/api/src/graphql/types/run.ts` (extend)
  - Return progress from run.progress JSONB
  - Calculate percentComplete

- [ ] T031 [US2] Implement Run.recentTasks resolver: `apps/api/src/graphql/types/run.ts` (extend)
  - Query recent completed/failed jobs from PgBoss archive
  - Transform to TaskResult type
  - Apply limit parameter

### Tests

- [ ] T032 [US2] Unit tests for progress service: `apps/api/tests/services/run/progress.test.ts`
  - Test atomic increment
  - Test status transitions
  - Test concurrent updates

- [ ] T033 [US2] Integration tests for progress polling: `apps/api/tests/graphql/queries/run-progress.test.ts`
  - Test progress query returns correct counts
  - Test recentTasks returns completed jobs

**Checkpoint**: User Story 2 complete - can poll progress and see status updates

---

## Phase 5: User Story 3 - Pause and Resume a Run (Priority: P1) 🎯 MVP

**Goal**: Users can pause runs to stop new job dispatch and resume to continue

**Independent Test**: Start run, pause, verify no new jobs dispatched, resume, verify processing continues

### Run Control Service

- [ ] T034 [US3] Implement pauseRun service: `apps/api/src/services/run/control.ts`
  - Validate run is in pauseable state (PENDING, RUNNING)
  - Update run status to PAUSED
  - Mark pending jobs as paused in PgBoss (custom state handling)

- [ ] T035 [US3] Implement resumeRun service: `apps/api/src/services/run/control.ts` (extend)
  - Validate run is PAUSED
  - Update run status to RUNNING
  - Resume paused jobs in PgBoss

- [ ] T036 [US3] Update run service index: `apps/api/src/services/run/index.ts`
  - Export pauseRun, resumeRun

### GraphQL Mutations

- [ ] T037 [US3] Create pauseRun mutation: `apps/api/src/graphql/mutations/run.ts` (extend)
  - Input validation
  - Call control service
  - Return updated Run

- [ ] T038 [US3] Create resumeRun mutation: `apps/api/src/graphql/mutations/run.ts` (extend)
  - Input validation
  - Call control service
  - Return updated Run

### Tests

- [ ] T039 [US3] Unit tests for pause/resume: `apps/api/tests/services/run/control.test.ts`
  - Test pause from RUNNING
  - Test pause from PENDING
  - Test resume from PAUSED
  - Test error on invalid state transitions

- [ ] T040 [US3] Integration tests for pause/resume mutations: `apps/api/tests/graphql/mutations/run.test.ts` (extend)
  - Test pause mutation
  - Test resume mutation
  - Test error responses

**Checkpoint**: User Story 3 complete - can pause and resume runs

---

## Phase 6: User Story 4 - Cancel a Run (Priority: P1) 🎯 MVP

**Goal**: Users can cancel runs, removing pending jobs while preserving completed results

**Independent Test**: Start run, let some jobs complete, cancel, verify pending removed, completed preserved

### Cancel Service

- [ ] T041 [US4] Implement cancelRun service: `apps/api/src/services/run/control.ts` (extend)
  - Validate run not already completed/cancelled
  - Update run status to CANCELLED
  - Remove pending jobs from PgBoss queue
  - Preserve completed job results

### GraphQL Mutation

- [ ] T042 [US4] Create cancelRun mutation: `apps/api/src/graphql/mutations/run.ts` (extend)
  - Input validation
  - Call control service
  - Return updated Run

### Tests

- [ ] T043 [US4] Unit tests for cancel: `apps/api/tests/services/run/control.test.ts` (extend)
  - Test cancel removes pending jobs
  - Test completed jobs preserved
  - Test idempotent cancel
  - Test error on already completed

- [ ] T044 [US4] Integration tests for cancel mutation: `apps/api/tests/graphql/mutations/run.test.ts` (extend)
  - Test cancel mutation
  - Test progress after cancel

**Checkpoint**: User Story 4 complete - can cancel runs preserving results

---

## Phase 7: User Story 5 - View Queue Status (Priority: P2)

**Goal**: Admins can see overall queue health with job counts by type and state

**Independent Test**: Query queueStatus and verify it returns accurate job counts

### Queue Status Service

- [ ] T045 [US5] Implement queueStatus service: `apps/api/src/services/queue/status.ts`
  - Query PgBoss for job counts by type
  - Group by state (pending, active, completed, failed)
  - Calculate totals

- [ ] T046 [US5] Create queue service index: `apps/api/src/services/queue/index.ts`
  - Export status functions

### GraphQL Query

- [ ] T047 [US5] Create queueStatus query: `apps/api/src/graphql/queries/queue.ts`
  - Return QueueStatus type
  - Require authentication

- [ ] T048 [US5] Update queries index: `apps/api/src/graphql/queries/index.ts`
  - Export queue query

### Tests

- [ ] T049 [US5] Integration tests for queueStatus: `apps/api/tests/graphql/queries/queue.test.ts`
  - Test returns accurate counts
  - Test empty queue returns zeros
  - Test breakdown by job type

**Checkpoint**: User Story 5 complete - can view queue status

---

## Phase 8: User Story 6 - Pause and Resume Global Queue (Priority: P2)

**Goal**: Admins can pause/resume entire queue for maintenance

**Independent Test**: Pause queue, start run, verify jobs queued but not processed, resume, verify processing starts

### Queue Control

- [ ] T050 [US6] Implement pauseQueue service: `apps/api/src/services/queue/control.ts`
  - Stop PgBoss workers
  - Track paused state

- [ ] T051 [US6] Implement resumeQueue service: `apps/api/src/services/queue/control.ts` (extend)
  - Resume PgBoss workers
  - Update paused state

### GraphQL Mutations

- [ ] T052 [US6] Create pauseQueue mutation: `apps/api/src/graphql/mutations/queue.ts`
  - Call control service
  - Return QueueStatus

- [ ] T053 [US6] Create resumeQueue mutation: `apps/api/src/graphql/mutations/queue.ts` (extend)
  - Call control service
  - Return QueueStatus

### Tests

- [ ] T054 [US6] Integration tests for queue control: `apps/api/tests/graphql/mutations/queue.test.ts`
  - Test pause stops processing
  - Test resume continues processing
  - Test idempotent operations

**Checkpoint**: User Story 6 complete - can pause/resume global queue

---

## Phase 9: User Story 7 - Job Retry on Failure (Priority: P2)

**Goal**: Failed jobs automatically retry with exponential backoff

**Independent Test**: Configure retry policy, force job failure, verify job re-queued with backoff

### Retry Configuration

- [ ] T055 [US7] Configure retry options in handlers: `apps/api/src/queue/handlers/probe-scenario.ts` (extend)
  - Set retryLimit: 3
  - Set retryDelay: 5 (base seconds)
  - Set retryBackoff: true (exponential)

- [ ] T056 [US7] Add retryable error detection: `apps/api/src/queue/handlers/probe-scenario.ts` (extend)
  - Detect network errors (retryable)
  - Detect rate limit 429 (retryable)
  - Detect validation errors (not retryable)
  - Detect auth errors (not retryable)

### Tests

- [ ] T057 [US7] Unit tests for retry behavior: `apps/api/tests/queue/handlers/probe-scenario.test.ts`
  - Test retryable errors trigger retry
  - Test non-retryable errors fail immediately
  - Test max retries exhausted marks permanent failure

**Checkpoint**: User Story 7 complete - jobs retry automatically

---

## Phase 10: User Story 8 - Job Priority Ordering (Priority: P3)

**Goal**: Urgent runs can be prioritized over background jobs

**Independent Test**: Create high and normal priority runs, verify high priority processed first

### Priority Support

- [ ] T058 [US8] Add priority to job options: `apps/api/src/services/run/start.ts` (extend)
  - Map RunPriority to PgBoss priority values
  - LOW = 0, NORMAL = 5, HIGH = 10

### Tests

- [ ] T059 [US8] Integration tests for priority: `apps/api/tests/services/run/start.test.ts` (extend)
  - Test high priority jobs created with correct priority
  - Test ordering verification

**Checkpoint**: User Story 8 complete - priority ordering works

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Testing, documentation, and final verification

### Documentation

- [ ] T060 [P] Update API README with queue documentation
- [ ] T061 [P] Add JSDoc comments to all public queue functions

### Final Testing

- [ ] T062 Run full test suite and verify 80%+ coverage on queue code
- [ ] T063 Run quickstart.md manual testing scenarios
- [ ] T064 [P] Performance test: 1000+ job creation under 5 seconds
- [ ] T065 [P] Performance test: progress query under 100ms

### Integration

- [ ] T066 Verify graceful shutdown doesn't lose jobs
- [ ] T067 Verify PgBoss maintenance runs without blocking

**Checkpoint**: Stage 5 complete - queue system fully operational

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup
    ↓
Phase 2: Foundation (BLOCKS all user stories)
    ↓
Phase 3-6: P1 User Stories (MVP)
    ├── US1: Start Run (foundational)
    ├── US2: Progress (depends on US1)
    ├── US3: Pause/Resume (depends on US1)
    └── US4: Cancel (depends on US1)
    ↓
Phase 7-9: P2 User Stories
    ├── US5: Queue Status (independent)
    ├── US6: Global Queue Control (independent)
    └── US7: Retry (independent)
    ↓
Phase 10: P3 User Stories
    └── US8: Priority (independent)
    ↓
Phase 11: Polish
```

### Parallel Opportunities

**Phase 2 (Foundation)**:
- T009, T010, T011: Stub handlers (different files)
- T016, T017: GraphQL types (different files)

**Phase 3-6 (P1 Stories)**:
- US3 and US4 can be developed in parallel after US1 complete

**Phase 7-9 (P2 Stories)**:
- US5, US6, US7 are independent - can work in parallel

### Critical Path (MVP)

```
T001-T003 → T004-T019 → T020-T027 → T028-T033 → T034-T044 → T062-T067
  Setup      Foundation    US1         US2         US3+US4     Polish
```

---

## Task Statistics

- **Total Tasks**: 67
- **Phase 1 (Setup)**: 3 tasks
- **Phase 2 (Foundation)**: 16 tasks ⚠️ BLOCKING
- **Phase 3-6 (P1 MVP)**: 25 tasks
- **Phase 7-9 (P2)**: 15 tasks
- **Phase 10 (P3)**: 2 tasks
- **Phase 11 (Polish)**: 8 tasks
- **Parallel opportunities**: 15 tasks marked [P]

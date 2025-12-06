# Stage 5: Queue System & Job Infrastructure

> Part of [High-Level Implementation Plan](../high-level.md)
>
> Must adhere to [Project Constitution](../../CLAUDE.md)
>
> Design reference: [API & Queue System](../../docs/api-queue-system.md)

**Goal:** Set up PgBoss queue with TypeScript orchestrator and job lifecycle management to enable long-running AI evaluation tasks.

---

## Deliverables Summary

| Deliverable | Description |
|-------------|-------------|
| PgBoss initialization | Configure PgBoss with PostgreSQL, connection pooling, maintenance settings |
| Job type definitions | `probe:scenario`, `analyze:basic`, `analyze:deep` job schemas |
| TypeScript orchestrator | Worker service that subscribes to queue and dispatches jobs |
| `spawnPython` utility | Spawn Python scripts with JSON stdin/stdout communication |
| Job progress tracking | Real-time progress updates stored in Run.progress |
| Basic job handlers | Stub handlers for each job type (full implementation in Stage 6) |
| Queue status GraphQL | Query for queue statistics and pending job counts |
| Run mutations | `startRun`, `pauseRun`, `resumeRun`, `cancelRun` mutations |
| Queue mutations | `pauseQueue`, `resumeQueue` for system-wide queue control |

---

## User Scenarios & Testing

### User Story 1 - Start a Run via GraphQL (Priority: P1)

As a user, I need to start an evaluation run via GraphQL so that I can queue AI model evaluations for execution.

**Why this priority**: Starting runs is the core functionality - without it, no evaluations can happen. This is the entry point for all queue operations.

**Independent Test**: Call `startRun` mutation with valid definition ID and verify job records created in PgBoss queue.

**Acceptance Scenarios**:

1. **Given** authenticated user and valid definition ID, **When** calling `startRun` mutation, **Then** run record created with status `PENDING`
2. **Given** successful run creation, **When** checking queue, **Then** `probe:scenario` jobs created for each model-scenario pair
3. **Given** definition with 10 scenarios and 3 models, **When** starting run, **Then** 30 `probe:scenario` jobs queued
4. **Given** run config with `samplePercentage: 10`, **When** starting run, **Then** only 10% of scenarios queued (deterministic sampling)
5. **Given** successful `startRun`, **When** response returned, **Then** includes run ID, initial progress `{total: N, completed: 0, failed: 0}`
6. **Given** non-existent definition ID, **When** starting run, **Then** NotFoundError returned
7. **Given** definition with no scenarios, **When** starting run, **Then** ValidationError explaining no scenarios available

---

### User Story 2 - View Run Progress via Polling (Priority: P1)

As a user, I need to poll for run progress so that I can see how many jobs have completed, failed, or are pending.

**Why this priority**: Progress visibility is essential for UX - users need to know their runs are executing and see incremental results.

**Independent Test**: Start a run, mark jobs as complete via test helper, poll progress query and verify counts update.

**Acceptance Scenarios**:

1. **Given** run with 30 queued jobs, **When** querying `run(id)`, **Then** progress shows `{total: 30, completed: 0, failed: 0}`
2. **Given** 5 jobs completed successfully, **When** polling progress, **Then** shows `{total: 30, completed: 5, failed: 0}`
3. **Given** 2 jobs failed, **When** polling progress, **Then** shows `{total: 30, completed: 5, failed: 2}`
4. **Given** all jobs completed, **When** checking run status, **Then** run status transitions to `COMPLETED`
5. **Given** any job failed, **When** run completes, **Then** run still shows `COMPLETED` (failures don't block completion)
6. **Given** run in progress, **When** polling recentTasks, **Then** returns last N completed/failed tasks with scenario IDs

---

### User Story 3 - Pause and Resume a Run (Priority: P1)

As a user, I need to pause and resume runs so that I can temporarily stop processing without losing progress.

**Why this priority**: Essential for cost control and interruption handling - users need to be able to stop runs mid-execution.

**Independent Test**: Start run, pause via mutation, verify no new jobs start, resume, verify processing continues.

**Acceptance Scenarios**:

1. **Given** running run, **When** calling `pauseRun` mutation, **Then** run status becomes `PAUSED`
2. **Given** paused run, **When** checking queue, **Then** pending jobs for this run not dispatched
3. **Given** in-flight jobs when pausing, **When** jobs complete, **Then** results still saved (graceful pause)
4. **Given** paused run, **When** calling `resumeRun` mutation, **Then** run status becomes `RUNNING`
5. **Given** resumed run, **When** checking queue, **Then** remaining jobs continue processing
6. **Given** completed or failed run, **When** attempting to pause, **Then** ValidationError (cannot pause finished run)

---

### User Story 4 - Cancel a Run (Priority: P1)

As a user, I need to cancel runs so that I can stop runs that are no longer needed without waiting for completion.

**Why this priority**: Cost control and error recovery - users need to be able to abandon runs that have issues.

**Independent Test**: Start run with many jobs, cancel, verify pending jobs removed and run marked cancelled.

**Acceptance Scenarios**:

1. **Given** running or paused run, **When** calling `cancelRun` mutation, **Then** run status becomes `CANCELLED`
2. **Given** cancelled run, **When** checking queue, **Then** all pending jobs for this run removed
3. **Given** in-flight jobs when cancelling, **When** jobs complete, **Then** results saved (graceful cancellation)
4. **Given** already cancelled run, **When** cancelling again, **Then** no error (idempotent)
5. **Given** completed run, **When** attempting to cancel, **Then** ValidationError (cannot cancel finished run)
6. **Given** cancelled run, **When** checking progress, **Then** shows jobs completed before cancellation

---

### User Story 5 - View Queue Status (Priority: P2)

As an admin, I need to see overall queue status so that I can monitor system health and identify bottlenecks.

**Why this priority**: Operational visibility - helpful for debugging and capacity planning but not blocking core functionality.

**Independent Test**: Query `queueStatus` and verify it returns job counts by type and state.

**Acceptance Scenarios**:

1. **Given** jobs in various states, **When** querying `queueStatus`, **Then** returns counts by job type
2. **Given** queue status, **When** checking fields, **Then** includes `pending`, `active`, `completed`, `failed` counts
3. **Given** multiple job types, **When** querying status, **Then** shows breakdown per job type (`probe:scenario`, etc.)
4. **Given** no jobs in queue, **When** querying status, **Then** returns zero counts (not error)
5. **Given** queue paused, **When** querying status, **Then** `isPaused: true` in response

---

### User Story 6 - Pause and Resume Global Queue (Priority: P2)

As an admin, I need to pause the entire queue so that I can perform maintenance or handle system issues.

**Why this priority**: Operational control - important for system maintenance but not needed for basic functionality.

**Independent Test**: Pause queue, start new run, verify jobs queued but not processed, resume queue, verify processing starts.

**Acceptance Scenarios**:

1. **Given** running queue, **When** calling `pauseQueue` mutation, **Then** `isPaused: true` in response
2. **Given** paused queue, **When** new jobs created, **Then** jobs queued but not picked up by workers
3. **Given** in-flight jobs when pausing, **When** jobs complete, **Then** results saved normally
4. **Given** paused queue, **When** calling `resumeQueue` mutation, **Then** `isPaused: false` and processing resumes
5. **Given** already paused queue, **When** pausing again, **Then** no error (idempotent)

---

### User Story 7 - Job Retry on Failure (Priority: P2)

As a system, I need failed jobs to retry automatically so that transient failures don't require manual intervention.

**Why this priority**: Reliability feature - important for handling API rate limits and network issues but can use defaults initially.

**Independent Test**: Configure job with retry policy, force job failure, verify job re-queued with backoff.

**Acceptance Scenarios**:

1. **Given** job fails with retryable error, **When** retry policy configured, **Then** job re-queued after backoff
2. **Given** `probe:scenario` job, **When** job fails, **Then** retries up to 3 times with exponential backoff
3. **Given** job exceeds max retries, **When** final failure, **Then** job marked as permanently failed
4. **Given** job with non-retryable error (validation), **When** job fails, **Then** no retry, immediate failure
5. **Given** retry in progress, **When** querying progress, **Then** job counted as pending (not failed until exhausted)

---

### User Story 8 - Job Priority Ordering (Priority: P3)

As a user, I need to set priority on runs so that urgent evaluations execute before background jobs.

**Why this priority**: Enhancement - useful optimization but basic FIFO ordering is acceptable for initial release.

**Independent Test**: Create high-priority and normal-priority runs, verify high-priority jobs processed first.

**Acceptance Scenarios**:

1. **Given** run with `priority: high`, **When** jobs created, **Then** jobs have higher priority in queue
2. **Given** high and normal priority jobs pending, **When** worker picks job, **Then** high priority picked first
3. **Given** default (no priority specified), **When** run created, **Then** uses normal priority
4. **Given** in-flight normal priority job, **When** high priority job arrives, **Then** high priority waits for worker (no preemption)

---

## Edge Cases

- **Empty definition**: Definition with no scenarios should fail validation at `startRun`
- **Large run**: Run with 10,000+ jobs should batch-insert jobs efficiently (not one-by-one)
- **Concurrent starts**: Multiple users starting runs simultaneously should not conflict
- **Orphaned jobs**: Jobs for deleted runs should be cleaned up (cascade or background task)
- **Database connection loss**: Workers should reconnect gracefully without losing jobs
- **Worker crash**: In-flight jobs should be marked failed and retried (PgBoss handles this)
- **Clock skew**: Job scheduling should use database time, not worker time
- **Job data too large**: Scenario content should be referenced by ID, not embedded in job data
- **Duplicate job prevention**: Same run cannot create duplicate jobs for same scenario-model pair
- **Progress counter race**: Multiple workers completing jobs must update progress atomically

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST initialize PgBoss on API server startup
- **FR-002**: System MUST create `probe:scenario` jobs for each model-scenario combination when run starts
- **FR-003**: System MUST support job types: `probe:scenario`, `analyze:basic`, `analyze:deep`
- **FR-004**: System MUST track job progress in `runs.progress` JSONB field
- **FR-005**: System MUST update progress atomically when jobs complete or fail
- **FR-006**: System MUST provide `startRun` mutation accepting definition ID, models, and options
- **FR-007**: System MUST provide `pauseRun` mutation that stops new job dispatch for a run
- **FR-008**: System MUST provide `resumeRun` mutation that resumes paused run processing
- **FR-009**: System MUST provide `cancelRun` mutation that stops run and removes pending jobs
- **FR-010**: System MUST provide `queueStatus` query returning job counts by type and state
- **FR-011**: System MUST provide `pauseQueue` and `resumeQueue` mutations for global queue control
- **FR-012**: System MUST implement retry logic with exponential backoff for transient failures
- **FR-013**: System MUST transition run status to `COMPLETED` when all jobs finish
- **FR-014**: System MUST transition run status to `RUNNING` when first job starts
- **FR-015**: System MUST preserve completed job results when run is cancelled
- **FR-016**: System MUST provide `spawnPython` utility for TypeScript-Python communication
- **FR-017**: System MUST validate run config before queuing jobs (sample percentage, models list)
- **FR-018**: System SHOULD support deterministic scenario sampling with seed parameter
- **FR-019**: System SHOULD support job priority for urgent runs

### Non-Functional Requirements

- **NFR-001**: Job creation for 1000+ scenarios MUST complete within 5 seconds
- **NFR-002**: Progress query MUST respond within 100ms
- **NFR-003**: PgBoss maintenance MUST run every 30 seconds without blocking workers
- **NFR-004**: Worker MUST handle graceful shutdown (complete in-flight job before exit)
- **NFR-005**: All queue operations MUST be logged with job ID and run ID context (per CLAUDE.md)
- **NFR-006**: No `any` types in queue/job code (per CLAUDE.md)
- **NFR-007**: Queue services MUST have 80%+ test coverage (per CLAUDE.md)
- **NFR-008**: Queue files MUST be under 400 lines each (per CLAUDE.md)
- **NFR-009**: Job handlers SHOULD be idempotent where possible

---

## Success Criteria

- **SC-001**: Can start a run via GraphQL and see jobs queued in PgBoss
- **SC-002**: Progress updates visible within 5 seconds of job completion
- **SC-003**: Can pause, resume, and cancel runs via GraphQL
- **SC-004**: Queue status shows accurate job counts by type and state
- **SC-005**: Failed jobs retry automatically with exponential backoff
- **SC-006**: Worker handles graceful shutdown without job loss
- **SC-007**: Run transitions to `COMPLETED` automatically when all jobs finish
- **SC-008**: 80%+ test coverage on queue services and job handlers
- **SC-009**: Can pause/resume global queue for maintenance
- **SC-010**: Large runs (1000+ jobs) queue efficiently without timeout

---

## Key Entities

### Job Types

```typescript
type JobType = 'probe:scenario' | 'analyze:basic' | 'analyze:deep';
```

### Job Data Schemas

```typescript
// probe:scenario job data
interface ProbeScenarioJobData {
  runId: string;
  scenarioId: string;
  modelId: string;           // e.g., "gpt-4"
  modelVersion?: string;     // e.g., "gpt-4-0125-preview"
  definitionSnapshot: Json;  // Copy of definition content at run time
  config: {
    temperature: number;
    maxTurns: number;
  };
}

// analyze:basic job data
interface AnalyzeBasicJobData {
  runId: string;
  transcriptIds: string[];   // All transcripts to analyze
}

// analyze:deep job data (Stage 11)
interface AnalyzeDeepJobData {
  runId: string;
  analysisType: 'correlations' | 'pca' | 'outliers';
}
```

### Queue Status

```typescript
interface QueueStatus {
  isPaused: boolean;
  jobs: {
    [jobType: string]: {
      pending: number;
      active: number;
      completed: number;
      failed: number;
    };
  };
  totalPending: number;
  totalActive: number;
}
```

### Run Progress

```typescript
interface RunProgress {
  total: number;
  completed: number;
  failed: number;
  // Optional detailed status
  byModel?: {
    [modelId: string]: {
      completed: number;
      failed: number;
    };
  };
}
```

### GraphQL Schema Additions

```graphql
# New input types
input StartRunInput {
  definitionId: ID!
  models: [String!]!
  samplePercentage: Int        # 1-100, default 100
  sampleSeed: Int              # For deterministic sampling
  priority: RunPriority        # Default: NORMAL
}

enum RunPriority {
  LOW
  NORMAL
  HIGH
}

# Extended Run type
extend type Run {
  progress: RunProgress!
  recentTasks(limit: Int = 5): [TaskResult!]!
}

type RunProgress {
  total: Int!
  completed: Int!
  failed: Int!
}

type TaskResult {
  scenarioId: String!
  modelId: String!
  status: TaskStatus!
  error: String
  completedAt: DateTime
}

enum TaskStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
}

# Queue queries and mutations
extend type Query {
  queueStatus: QueueStatus!
}

type QueueStatus {
  isPaused: Boolean!
  jobs: [JobTypeStatus!]!
  totalPending: Int!
  totalActive: Int!
}

type JobTypeStatus {
  type: String!
  pending: Int!
  active: Int!
  completed: Int!
  failed: Int!
}

extend type Mutation {
  startRun(input: StartRunInput!): Run!
  pauseRun(id: ID!): Run!
  resumeRun(id: ID!): Run!
  cancelRun(id: ID!): Run!
  pauseQueue: QueueStatus!
  resumeQueue: QueueStatus!
}
```

---

## Assumptions

1. **PgBoss as sole queue**: No Redis or other queue system needed (PgBoss uses same PostgreSQL)
2. **Single worker process initially**: One worker handling all job types (can scale later)
3. **Stub handlers in Stage 5**: Actual Python execution implemented in Stage 6
4. **Job data by reference**: Large data (definition content) passed by ID, not embedded
5. **FIFO ordering acceptable**: Priority is P3, basic FIFO sufficient for MVP
6. **30-second maintenance interval**: PgBoss maintenance runs every 30s (tunable)
7. **3 retries default**: Jobs retry up to 3 times with exponential backoff
8. **24-hour job retention**: PgBoss archives completed jobs for 24 hours
9. **Run status machine**: PENDING → RUNNING → COMPLETED/FAILED/CANCELLED
10. **Progress stored in Run**: Not separate table, uses Run.progress JSONB

---

## Constitution Compliance

**Status**: PASS

Validated against [CLAUDE.md](../../CLAUDE.md):

| Requirement | Implementation |
|-------------|----------------|
| **No `any` Types** | All job types explicitly defined with TypeScript interfaces; NFR-006 |
| **TypeScript Strict Mode** | Queue code compiles under strict mode |
| **Test Coverage 80%** | Queue services and handlers have unit tests; NFR-007 |
| **No console.log** | All logging via createLogger with job/run context; NFR-005 |
| **File Size < 400 lines** | Split into queue/boss.ts, queue/handlers/, queue/services/; NFR-008 |
| **Structured Logging** | Log job events with jobId, runId, jobType, status |
| **Custom Error Classes** | QueueError, JobValidationError extend AppError |
| **Prisma Transactions** | Use transactions for run creation + job insertion |

---

## Dependencies

- **Stage 1** (complete): Express server, logging, error handling
- **Stage 2** (complete): Prisma schema with Run, Transcript, Scenario models
- **Stage 3** (complete): GraphQL API with Pothos, context, and resolver patterns
- **Stage 4** (complete): Authentication for protected mutations

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Python worker execution | Stage 6 - this stage creates stubs only |
| LLM API integration | Stage 6 - Python workers call LLMs |
| Analysis computation | Stage 11 - analyze jobs are stubs |
| Real-time subscriptions | WebSocket updates deferred; polling sufficient |
| Distributed workers | Single worker initially; scale later |
| Dead letter queue | Use PgBoss default retry then fail |
| Job scheduling (cron) | Not needed for MVP |
| Cost tracking | Stage 10 - experiment framework |

---

## Next Steps

1. Review this spec for accuracy
2. When ready for technical planning, invoke the **feature-plan** skill
3. Or ask clarifying questions if requirements need refinement

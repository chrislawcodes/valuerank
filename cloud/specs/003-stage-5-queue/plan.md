# Implementation Plan: Stage 5 - Queue System & Job Infrastructure

**Branch**: `003-stage-5-queue` | **Date**: 2025-12-06 | **Spec**: [spec.md](./spec.md)

## Summary

Implement PgBoss-based job queue with TypeScript orchestrator for managing long-running AI evaluation tasks. The system uses a hybrid architecture where TypeScript manages the queue and job lifecycle, while Python workers (Stage 6) execute the actual LLM calls. This stage creates the queue infrastructure and stub handlers.

---

## Technical Context

**Language/Version**: TypeScript 5.3+ (Node.js 20+)
**Primary Dependencies**: pg-boss (queue), Prisma (ORM), GraphQL Yoga + Pothos (API)
**Storage**: PostgreSQL (existing, PgBoss uses same database)
**Testing**: Vitest (existing test framework)
**Target Platform**: Docker (local), Railway (production)
**Performance Goals**: Job creation <5s for 1000+ jobs, progress query <100ms
**Constraints**: Must integrate with existing GraphQL schema and auth middleware
**Scale/Scope**: MVP supports single worker process, can scale later

---

## Constitution Check

**Status**: PASS

Validated against [CLAUDE.md](../../CLAUDE.md):

### File Size Limits
- [x] Route handlers < 400 lines - Split mutations into separate files
- [x] Services < 400 lines - Queue service, job service, orchestrator separate
- [x] Utilities < 400 lines - `spawnPython` utility isolated

### TypeScript Standards
- [x] No `any` types - All job data typed with interfaces
- [x] Strict mode required - Existing tsconfig enforces this
- [x] Type function signatures - All queue functions typed

### Testing Requirements
- [x] 80% coverage minimum - Unit tests for services, integration for mutations
- [x] Test structure per constitution - `tests/queue/` mirrors `src/queue/`

### Logging Standards
- [x] Logger abstraction - Use existing `createLogger` from shared package
- [x] Structured logging - Log with jobId, runId, jobType context
- [x] No console.log - Already enforced project-wide

### Error Handling
- [x] Custom error classes - QueueError, JobValidationError extend AppError

---

## Architecture Decisions

### Decision 1: PgBoss as Queue Backend

**Chosen**: PgBoss (PostgreSQL-backed queue)

**Rationale**:
- Uses existing PostgreSQL database - no additional infrastructure
- Transactional job creation with application data (atomic run + jobs creation)
- Built-in retry, backoff, scheduling, and maintenance
- Per architecture-overview.md: "Same DB as app data, no Redis needed"

**Alternatives Considered**:
- **BullMQ + Redis**: More features but requires Redis infrastructure
- **Custom PostgreSQL queue**: More control but significant implementation effort
- **SQS/Cloud queues**: Vendor lock-in, harder local development

**Tradeoffs**:
- Pros: Simple deployment, transactional consistency, good observability via SQL
- Cons: Less throughput than Redis at extreme scale (acceptable for our volume)

---

### Decision 2: TypeScript Orchestrator Pattern

**Chosen**: TypeScript worker subscribes to PgBoss, spawns Python for compute

**Rationale**:
- Per api-queue-system.md: "Native PgBoss + Python data science ecosystem"
- TypeScript has native PgBoss bindings (full API access)
- Python workers remain stateless (easy to debug, test)
- JSON stdin/stdout communication is simple and portable

**Alternatives Considered**:
- **Pure Python worker with PgBoss polling**: Would need custom PostgreSQL polling
- **Python PgBoss client**: No official Python client, would need custom code
- **gRPC between TS and Python**: More complex, overkill for stdin/stdout

**Tradeoffs**:
- Pros: Best of both worlds, native queue API, flexible Python execution
- Cons: Process spawning overhead (acceptable for long-running LLM tasks)

---

### Decision 3: Stub Handlers in Stage 5

**Chosen**: Create handler infrastructure with stub implementations

**Rationale**:
- Stage 5 focuses on queue infrastructure, Stage 6 adds Python workers
- Stubs allow testing queue behavior without LLM costs
- Clear separation of concerns - queue logic vs. execution logic

**Implementation**:
- Stub handlers log receipt and return mock success/failure
- Can inject failure for testing retry behavior
- Real Python execution added in Stage 6

---

### Decision 4: Progress Tracking via Run.progress JSONB

**Chosen**: Store progress in existing `runs.progress` JSONB field

**Rationale**:
- Already defined in Prisma schema (`progress Json? @db.JsonB`)
- Avoids additional table or join queries
- Atomic increment via PostgreSQL JSONB operators
- Progress queries use existing Run DataLoader

**Alternatives Considered**:
- **Separate progress table**: More normalized but extra joins
- **PgBoss job counts only**: Doesn't persist after job completion
- **Redis counters**: Faster but adds infrastructure

**Tradeoffs**:
- Pros: Simple, no schema changes, fast polling via existing queries
- Cons: Slightly more complex update logic (JSONB increment)

---

### Decision 5: Run Status State Machine

**Chosen**: Explicit state transitions managed by orchestrator

**State Machine**:
```
PENDING → RUNNING → COMPLETED
                 ↘ FAILED
    ↓
  PAUSED → RUNNING
    ↓
CANCELLED
```

**Transition Rules**:
- PENDING → RUNNING: First job starts executing
- RUNNING → COMPLETED: All jobs finished (success or fail)
- RUNNING → PAUSED: User calls pauseRun
- PAUSED → RUNNING: User calls resumeRun
- RUNNING/PAUSED → CANCELLED: User calls cancelRun
- Cannot transition from COMPLETED/FAILED/CANCELLED

---

### Decision 6: Job Data by Reference

**Chosen**: Store IDs in job data, not full content

**Rationale**:
- Definition snapshots can be large (10-50KB each)
- PgBoss has job data size limits
- Definition snapshot already stored on Run, reference it

**Job Data Structure**:
```typescript
{
  runId: string;        // Reference to Run (has definition snapshot)
  scenarioId: string;   // Reference to Scenario
  modelId: string;      // Model identifier
}
```

---

## Project Structure

### New Files/Directories

```
cloud/apps/api/src/
├── queue/
│   ├── index.ts              # Public exports
│   ├── boss.ts               # PgBoss initialization and configuration
│   ├── orchestrator.ts       # Worker that subscribes to queue
│   ├── types.ts              # Job type definitions and interfaces
│   ├── spawn.ts              # spawnPython utility
│   └── handlers/
│       ├── index.ts          # Handler registration
│       ├── probe-scenario.ts # probe:scenario handler (stub)
│       ├── analyze-basic.ts  # analyze:basic handler (stub)
│       └── analyze-deep.ts   # analyze:deep handler (stub)
├── services/
│   └── run/
│       ├── index.ts          # Re-exports
│       ├── start.ts          # startRun logic (creates jobs)
│       ├── control.ts        # pause/resume/cancel logic
│       └── progress.ts       # Progress tracking helpers
├── graphql/
│   ├── types/
│   │   ├── queue-status.ts   # QueueStatus type
│   │   └── run-progress.ts   # RunProgress type (extend Run)
│   ├── queries/
│   │   └── queue.ts          # queueStatus query
│   └── mutations/
│       └── run.ts            # startRun, pauseRun, resumeRun, cancelRun

cloud/apps/api/tests/
├── queue/
│   ├── boss.test.ts          # PgBoss initialization tests
│   ├── orchestrator.test.ts  # Worker behavior tests
│   ├── spawn.test.ts         # spawnPython tests
│   └── handlers/
│       └── probe-scenario.test.ts
├── services/
│   └── run/
│       ├── start.test.ts
│       ├── control.test.ts
│       └── progress.test.ts
└── graphql/
    └── mutations/
        └── run.test.ts       # Integration tests

cloud/workers/                 # Python worker scripts (created in Stage 6)
├── __init__.py
├── probe.py                  # Stub for now
└── common/
    └── __init__.py
```

### Modified Files

```
cloud/apps/api/src/
├── index.ts                  # Start orchestrator on server startup
├── server.ts                 # Add queue initialization
├── config.ts                 # Add PgBoss configuration
└── graphql/
    ├── types/index.ts        # Export new types
    ├── queries/index.ts      # Export queue query
    └── mutations/index.ts    # Export run mutations

cloud/packages/db/
└── prisma/schema.prisma      # No changes (Run.progress already exists)

cloud/package.json            # Add pg-boss dependency
```

---

## Implementation Phases

### Phase 1: PgBoss Setup & Configuration
- Initialize PgBoss with PostgreSQL connection
- Configure maintenance interval (30s)
- Configure job retention (24h)
- Create startup/shutdown hooks

### Phase 2: Job Type Definitions
- Define TypeScript interfaces for all job types
- Create job data validators (Zod schemas)
- Define job options (retry, backoff, priority)

### Phase 3: Orchestrator & Handlers
- Create orchestrator class that subscribes to job types
- Implement stub handlers for each job type
- Add structured logging for job lifecycle

### Phase 4: spawnPython Utility
- Create utility for spawning Python processes
- Implement JSON stdin/stdout communication
- Add timeout handling and error propagation

### Phase 5: Run Services
- Implement startRun service (validate, create run, queue jobs)
- Implement progress tracking (atomic increments)
- Implement pause/resume/cancel control

### Phase 6: GraphQL Layer
- Add run mutations (startRun, pauseRun, resumeRun, cancelRun)
- Add queueStatus query
- Extend Run type with progress field

### Phase 7: Testing & Polish
- Unit tests for services and handlers
- Integration tests for mutations
- End-to-end queue flow tests

---

## Key Interfaces

### PgBoss Configuration

```typescript
interface QueueConfig {
  // Connection
  connectionString: string;  // From DATABASE_URL

  // Maintenance
  maintenanceIntervalSeconds: number;  // 30

  // Job retention
  archiveCompletedAfterSeconds: number;  // 86400 (24h)

  // Monitoring
  monitorStateIntervalSeconds: number;  // 30
}
```

### Job Registration

```typescript
interface JobHandler<T> {
  name: string;           // e.g., 'probe:scenario'
  options: {
    teamSize: number;     // Concurrent jobs per type
    teamConcurrency: number;
    retryLimit: number;
    retryDelay: number;   // Base delay in seconds
    retryBackoff: boolean;
    expireInSeconds: number;
  };
  handler: (job: Job<T>) => Promise<void>;
}
```

### Run Service Interface

```typescript
interface RunService {
  start(input: StartRunInput, userId: string): Promise<Run>;
  pause(runId: string, userId: string): Promise<Run>;
  resume(runId: string, userId: string): Promise<Run>;
  cancel(runId: string, userId: string): Promise<Run>;
  updateProgress(runId: string, update: ProgressUpdate): Promise<void>;
}
```

---

## Error Handling Strategy

### Custom Errors

```typescript
// Queue-specific errors
class QueueError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'QUEUE_ERROR', 500, context);
  }
}

class JobValidationError extends AppError {
  constructor(message: string, details: unknown) {
    super(message, 'JOB_VALIDATION_ERROR', 400, { details });
  }
}

class RunStateError extends AppError {
  constructor(runId: string, currentState: string, action: string) {
    super(
      `Cannot ${action} run in ${currentState} state`,
      'RUN_STATE_ERROR',
      400,
      { runId, currentState, action }
    );
  }
}
```

### Retry Strategy

| Error Type | Retry? | Backoff |
|------------|--------|---------|
| Network timeout | Yes | Exponential |
| Rate limit (429) | Yes | Exponential |
| Validation error | No | - |
| Auth error | No | - |
| Server error (5xx) | Yes | Exponential |

---

## Testing Strategy

### Unit Tests
- PgBoss initialization and configuration
- Job data validation
- Progress update logic
- State transition validation
- spawnPython utility (mock process)

### Integration Tests
- GraphQL mutations (startRun, pause, resume, cancel)
- Queue status query
- End-to-end: start run → jobs queued → progress updates
- Error handling: validation errors, state errors

### Test Utilities

```typescript
// Test helper to create mock jobs
function createTestJob(overrides?: Partial<ProbeScenarioJobData>): Job;

// Test helper to simulate job completion
async function completeJob(boss: PgBoss, jobId: string): Promise<void>;

// Test helper to check progress
async function getRunProgress(runId: string): Promise<RunProgress>;
```

---

## Dependencies

### New npm Packages

```json
{
  "pg-boss": "^9.0.0"
}
```

### Existing Dependencies Used
- `@valuerank/db` - Prisma client, Run model
- `@valuerank/shared` - Logger, errors
- `graphql-yoga` - GraphQL server
- `@pothos/core` - Schema builder
- `zod` - Validation

---

## Deployment Considerations

### Environment Variables

```bash
# Existing (no changes)
DATABASE_URL=postgresql://...

# New (optional, has defaults)
PGBOSS_MAINTENANCE_INTERVAL=30      # seconds
PGBOSS_ARCHIVE_AFTER=86400          # seconds (24h)
QUEUE_WORKER_CONCURRENCY=5          # jobs per type
```

### Docker Changes

None required - PgBoss uses existing PostgreSQL container.

### Railway Deployment

Worker can run in same process as API (single service) or separate service:
- **Stage 5-6**: Same process (simpler)
- **Future**: Separate worker service for scaling

---

## Next Steps

1. Review this plan for technical accuracy
2. When ready for task breakdown, invoke the **feature-tasks** skill
3. Or refine architecture decisions if needed

# Implementation Plan: MCP Operations Tools

**Branch**: `feat/018-mcp-operations-tools` | **Date**: 2025-12-14 | **Spec**: [spec.md](./spec.md)

## Summary

Add 4 new MCP tools for production operations (recover_run, trigger_recovery, get_job_queue_status, get_unsummarized_transcripts), fix the existing byModel progress resolver, and optionally add recompute_analysis tool. These tools wrap existing services and GraphQL mutations to provide AI agents with operational capabilities.

---

## Technical Context

| Attribute | Value |
|-----------|-------|
| **Language/Version** | TypeScript 5.3+ |
| **Primary Dependencies** | `@modelcontextprotocol/sdk`, `zod`, `@valuerank/db` (Prisma) |
| **Storage** | PostgreSQL (PgBoss for job queue) |
| **Testing** | Vitest |
| **Target Platform** | Railway (Docker) |
| **Performance Goals** | Job queue queries < 2s for 10k jobs |
| **Constraints** | MCP response < 10KB token budget |

---

## Constitution Check

**Status**: PASS

| Requirement | Compliance |
|-------------|------------|
| Logging via `createLogger` | All new tools use structured logging |
| No `any` types | Typed responses defined in spec |
| Error handling with `AppError` | Uses `NotFoundError`, `RunStateError` |
| Test coverage 80%+ | Required for all new files |
| File size < 400 lines | Each MCP tool is self-contained (~150 lines) |

---

## Architecture Decisions

### Decision 1: Wrap Existing Services (Not Reimplementing)

**Chosen**: MCP tools wrap existing GraphQL mutation resolvers and services

**Rationale**:
- Recovery logic already exists in `services/run/recovery.ts`
- GraphQL mutations (`recoverRun`, `triggerRecovery`) already tested and deployed
- DRY principle - avoid duplicating business logic
- Feature 017 pattern (restart-summarization.ts) follows this approach

**Alternatives Considered**:
- Direct service calls: Would bypass GraphQL layer, lose middleware benefits
- New service layer: Over-engineering, services already exist

**Tradeoffs**:
- Pros: Reuse tested code, consistent behavior with GraphQL API
- Cons: Slight indirection, need to import resolvers

### Decision 2: Direct DB Query for Job Queue Status (Not PgBoss API)

**Chosen**: Query `pgboss.job` table directly via Prisma raw SQL

**Rationale**:
- `countJobsForRun` in recovery.ts already does this pattern
- PgBoss `getJobs` API doesn't support filtering by custom data fields
- Need aggregated counts by state, not individual job objects
- Performance: Single aggregated query vs multiple API calls

**Alternatives Considered**:
- PgBoss `getJobById` API: Can't filter by runId in job data
- Create new PgBoss views: Over-engineering for read-only query

**Tradeoffs**:
- Pros: Fast, single query, flexible filtering
- Cons: Depends on PgBoss schema (stable since v5)

### Decision 3: Fix byModel in Resolver (Not MCP Tool)

**Chosen**: Implement `byModel` resolver in `run.ts` GraphQL type, not as separate MCP tool

**Rationale**:
- `byModel` field already exists on `RunProgress` type (returns null)
- Fix at the source benefits both GraphQL and MCP users
- MCP `get_run_summary` already returns progress data

**Alternatives Considered**:
- New MCP tool `get_model_progress`: Unnecessary duplication
- GraphQL-only fix: That's what we're doing

**Tradeoffs**:
- Pros: Single fix benefits all consumers, cleaner API
- Cons: Requires database query per progress resolution

---

## Project Structure

### Files to Create

```
apps/api/src/
├── mcp/tools/
│   ├── recover-run.ts           # NEW: Wraps recoverRun mutation (US1)
│   ├── trigger-recovery.ts      # NEW: Wraps triggerRecovery mutation (US2)
│   ├── get-job-queue-status.ts  # NEW: Queries PgBoss (US3)
│   └── get-unsummarized-transcripts.ts  # NEW: Queries transcripts (US4)
├── services/run/
│   └── job-queue.ts             # NEW: Job queue status service (US3)

apps/api/tests/
├── mcp/tools/
│   ├── recover-run.test.ts
│   ├── trigger-recovery.test.ts
│   ├── get-job-queue-status.test.ts
│   └── get-unsummarized-transcripts.test.ts
└── services/run/
    └── job-queue.test.ts
```

### Files to Modify

```
apps/api/src/
├── graphql/types/
│   └── run.ts                   # FIX: Implement byModel resolver (US5)
├── mcp/tools/
│   └── index.ts                 # ADD: Export new tools
```

### Optional Files (P3)

```
apps/api/src/mcp/tools/
└── recompute-analysis.ts        # OPTIONAL: Wraps recomputeAnalysis mutation (US6)
```

---

## Implementation Phases

### Phase 1: P1 Tools (recover_run, trigger_recovery)

**Scope**: US1, US2 - Recovery operations via MCP

**Approach**:
1. Create `recover-run.ts` MCP tool
   - Import `recoverRun` from GraphQL mutations or service layer
   - Follow `restart-summarization.ts` pattern exactly
   - Add audit logging with `createOperationsAudit` helper

2. Create `trigger-recovery.ts` MCP tool
   - Call `recoverOrphanedRuns` from `services/run/recovery.ts`
   - Return list of recovered run IDs with counts

**Dependencies**: None (services exist)

### Phase 2: P1 Tool (get_job_queue_status)

**Scope**: US3 - Job queue visibility

**Approach**:
1. Create `services/run/job-queue.ts`
   - `getJobQueueStatus(runId: string, options?: { includeFailures?: boolean })`
   - Query: `SELECT name, state, COUNT(*) FROM pgboss.job WHERE data->>'runId' = $1 GROUP BY name, state`
   - Transform to `JobQueueStatus` type from spec

2. Create `get-job-queue-status.ts` MCP tool
   - Input: `run_id`, `include_recent_failures` (optional)
   - Return: `JobQueueStatus` object

**Dependencies**: Phase 1 (testing pattern established)

### Phase 3: P2 Features (transcripts, byModel fix)

**Scope**: US4, US5 - Diagnostic queries

**Approach**:
1. Create `get-unsummarized-transcripts.ts` MCP tool
   - Query: `SELECT id, modelId, scenarioId FROM transcripts WHERE runId = $1 AND summarizedAt IS NULL LIMIT 100`
   - Include total count for pagination awareness

2. Fix `byModel` resolver in `run.ts`
   - Query: `SELECT modelId, COUNT(*) FILTER (WHERE summarizedAt IS NOT NULL), COUNT(*) FILTER (WHERE decisionCode = 'error') FROM transcripts WHERE runId = $1 GROUP BY modelId`
   - Cache in progress computation (avoid N+1)

**Dependencies**: Phase 2 complete

### Phase 4: P3 Optional (recompute_analysis)

**Scope**: US6 - Analysis recomputation

**Approach**:
1. Create `recompute-analysis.ts` MCP tool (if time permits)
   - Wrap existing `recomputeAnalysis` mutation
   - Return job ID for tracking

**Dependencies**: Phase 3 complete, low priority

---

## API Contracts

### recover_run Tool

```typescript
// Input Schema (Zod)
const RecoverRunInputSchema = {
  run_id: z.string().describe('ID of the run to recover'),
};

// Success Response
{
  success: true,
  run_id: string,
  status: string,
  action: 'recovered' | 'no_recovery_needed',
  requeued_count: number,
  run_progress: { total, completed, failed, percentComplete },
}

// Error Response
{
  error: 'NOT_FOUND' | 'INVALID_STATE' | 'INTERNAL_ERROR',
  message: string,
}
```

### trigger_recovery Tool

```typescript
// Input Schema (no inputs)
const TriggerRecoveryInputSchema = {};

// Success Response
{
  success: true,
  detected_count: number,
  recovered_count: number,
  recovered_runs: Array<{
    run_id: string,
    action: string,
    requeued_count: number,
  }>,
  errors: Array<{
    run_id: string,
    error: string,
  }>,
}
```

### get_job_queue_status Tool

```typescript
// Input Schema
const GetJobQueueStatusInputSchema = {
  run_id: z.string().describe('ID of the run to check'),
  include_recent_failures: z.boolean().optional().default(false)
    .describe('Include details of recent failed jobs'),
};

// Success Response
{
  run_id: string,
  by_job_type: {
    probe_scenario?: { pending, running, completed, failed },
    summarize_transcript?: { pending, running, completed, failed },
    analyze_basic?: { pending, running, completed, failed },
  },
  total_pending: number,
  total_running: number,
  total_completed: number,
  total_failed: number,
  recent_failures?: Array<{
    job_id: string,
    job_type: string,
    error: string,
    failed_at: string,
    transcript_id?: string,
    scenario_id?: string,
    model_id?: string,
  }>,
}
```

### get_unsummarized_transcripts Tool

```typescript
// Input Schema
const GetUnsummarizedTranscriptsInputSchema = {
  run_id: z.string().describe('ID of the run to check'),
  include_failed: z.boolean().optional().default(false)
    .describe('Include transcripts with error status'),
  limit: z.number().optional().default(50)
    .describe('Maximum transcripts to return'),
};

// Success Response
{
  run_id: string,
  total_count: number,
  returned_count: number,
  transcripts: Array<{
    id: string,
    model_id: string,
    scenario_id: string,
    created_at: string,
    decision_code?: string,  // if include_failed=true
  }>,
}
```

---

## Testing Strategy

### Unit Tests

| Component | Test File | Coverage Target |
|-----------|-----------|-----------------|
| `recover-run.ts` | `recover-run.test.ts` | 90% |
| `trigger-recovery.ts` | `trigger-recovery.test.ts` | 90% |
| `get-job-queue-status.ts` | `get-job-queue-status.test.ts` | 85% |
| `get-unsummarized-transcripts.ts` | `get-unsummarized-transcripts.test.ts` | 85% |
| `job-queue.ts` service | `job-queue.test.ts` | 90% |

### Integration Tests

- Test recovery flow end-to-end with actual PgBoss queue
- Test job queue status with various job states
- Test byModel resolver with multi-model runs

### Test Patterns (from existing tests)

```typescript
// Mock PgBoss for unit tests
vi.mock('../../queue/boss.js', () => ({
  getBoss: vi.fn().mockReturnValue({
    send: vi.fn().mockResolvedValue('mock-job-id'),
  }),
}));

// Mock Prisma for unit tests
vi.mock('@valuerank/db', () => ({
  db: {
    run: { findUnique: vi.fn(), update: vi.fn() },
    transcript: { findMany: vi.fn(), count: vi.fn() },
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));
```

---

## Error Handling

| Error Case | Error Code | HTTP-equiv | Handling |
|------------|------------|------------|----------|
| Run not found | `NOT_FOUND` | 404 | Return error, don't throw |
| Invalid state for operation | `INVALID_STATE` | 400 | Return error with allowed states |
| PgBoss not initialized | `QUEUE_UNAVAILABLE` | 503 | Return empty results, log warning |
| Database error | `INTERNAL_ERROR` | 500 | Log error, return generic message |

---

## Performance Considerations

### Job Queue Query Optimization

```sql
-- Create index for efficient job queue queries (if not exists)
CREATE INDEX IF NOT EXISTS idx_pgboss_job_run_data
  ON pgboss.job USING gin ((data->'runId'));

-- Efficient aggregation query
SELECT
  name,
  state,
  COUNT(*) as count
FROM pgboss.job
WHERE data->>'runId' = $1
  AND state IN ('created', 'retry', 'active', 'completed', 'failed')
GROUP BY name, state;
```

### byModel Query Optimization

```sql
-- Efficient per-model progress query
SELECT
  model_id,
  COUNT(*) FILTER (WHERE summarized_at IS NOT NULL) as completed,
  COUNT(*) FILTER (WHERE decision_code = 'error') as failed,
  COUNT(*) as total
FROM transcripts
WHERE run_id = $1 AND deleted_at IS NULL
GROUP BY model_id;
```

---

## Rollout Plan

1. **Phase 1**: Deploy recovery tools (US1, US2) - Low risk, wraps existing
2. **Phase 2**: Deploy job queue status (US3) - Read-only, no risk
3. **Phase 3**: Deploy transcript query + byModel fix (US4, US5) - Read-only
4. **Phase 4**: Optional recompute_analysis (US6) - If time permits

All phases can be deployed independently. No migrations required.

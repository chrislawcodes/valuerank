# Feature Specification: MCP Operations Tools

> **Feature #018** | Branch: `feat/018-mcp-operations-tools`
> **Created**: 2025-12-14
> **Status**: Draft
> **Dependencies**: Stage 14 (MCP Write Tools) - Complete, Feature 017 (Parallel Summarization) - In Progress

## Overview

Add MCP tools for operational tasks: recovering stuck runs, monitoring job queues, and diagnosing issues. Currently, when runs get stuck (e.g., summarization at 496/500 with no failures), operators cannot recover them via MCP because mutation support is blocked. This feature adds safe operational mutations and diagnostic queries to enable AI-assisted production support.

**Input Description**: Discovered during investigation of stuck run `cmj53ll6k00hg145ceazzr9qx` which was stuck at 496/500 summarization with 0 failures. The MCP tools could query the status but could not:
1. Call `recoverRun` mutation to re-queue missing jobs
2. Query job queue status to see pending/running/failed counts
3. Filter transcripts to identify which 4 were stuck
4. See per-model progress breakdown (byModel returned null)

**Business Value**: Enable AI agents (Claude Code, Cursor, etc.) to diagnose and resolve production issues without requiring direct database access or manual GraphQL mutations. Reduces incident response time from hours to minutes.

---

## User Stories & Testing

### User Story 1 - Recover Stuck Run via MCP (Priority: P1)

As an operator using Claude Code, I need to recover stuck runs through MCP so that I can resolve production incidents without switching to the web UI or running manual GraphQL mutations.

**Why this priority**: Critical for production operations. When runs get stuck (jobs lost from queue, API restarts, etc.), the only recovery mechanism is the `recoverRun` mutation which MCP currently blocks. This is the primary gap discovered in the investigation.

**Independent Test**: When a run is stuck in SUMMARIZING state at 496/500 with no active jobs, calling `recover_run` via MCP re-queues the 4 missing summarize jobs and the run progresses to completion.

**Acceptance Scenarios**:

1. **Given** a run stuck in SUMMARIZING with no active jobs, **When** I call `recover_run(run_id)`, **Then** missing summarize jobs are re-queued and the run continues
2. **Given** a run stuck in RUNNING with no active jobs, **When** I call `recover_run(run_id)`, **Then** missing probe jobs are re-queued
3. **Given** a run in a healthy state (jobs processing normally), **When** I call `recover_run`, **Then** the tool reports "no recovery needed" with current job counts
4. **Given** a run that doesn't exist, **When** I call `recover_run`, **Then** a clear NOT_FOUND error is returned
5. **Given** recovery succeeds, **When** the response is returned, **Then** it includes queued_count, run status, and updated progress

---

### User Story 2 - Trigger System-Wide Recovery via MCP (Priority: P1)

As an operator, I need to trigger a system-wide scan for orphaned runs so that I can recover all stuck runs at once after an incident (API restart, queue failure, etc.).

**Why this priority**: Critical for incident recovery. After infrastructure issues, multiple runs may be stuck. A single command to recover all is essential for rapid response.

**Independent Test**: After simulating an API restart with runs in progress, calling `trigger_recovery` detects all orphaned runs and re-queues their missing jobs.

**Acceptance Scenarios**:

1. **Given** multiple runs stuck in RUNNING/SUMMARIZING, **When** I call `trigger_recovery`, **Then** all orphaned runs are detected and recovered
2. **Given** no runs are stuck, **When** I call `trigger_recovery`, **Then** the response shows 0 runs recovered
3. **Given** recovery is triggered, **When** the response is returned, **Then** it includes a list of recovered run IDs and their job counts
4. **Given** some runs cannot be recovered (e.g., missing definition), **When** recovery runs, **Then** errors are reported per-run without blocking others

---

### User Story 3 - Query Job Queue Status via MCP (Priority: P1)

As an operator, I need to see job queue status for a run so that I can diagnose whether jobs are pending, running, failed, or missing.

**Why this priority**: Critical for diagnosis. When a run appears stuck, operators need to know the job queue state. Currently MCP has no visibility into PgBoss job states.

**Independent Test**: For a run in SUMMARIZING state, calling `get_job_queue_status(run_id)` returns counts of pending, running, completed, and failed summarize_transcript jobs.

**Acceptance Scenarios**:

1. **Given** a run with jobs in various states, **When** I call `get_job_queue_status(run_id)`, **Then** I see counts by job type (probe_scenario, summarize_transcript) and state (pending, running, completed, failed)
2. **Given** a run with failed jobs, **When** I query status, **Then** I see failure count and can optionally see error details
3. **Given** a run with no jobs in queue, **When** I query status, **Then** I see 0 pending/running and understand jobs may have expired
4. **Given** the run doesn't exist, **When** I query status, **Then** a clear NOT_FOUND error is returned
5. **Given** I want recent job history, **When** I include `include_recent_failures=true`, **Then** I see the last N failed jobs with error messages

---

### User Story 4 - Query Unsummarized Transcripts via MCP (Priority: P2)

As an operator, I need to identify which specific transcripts are missing summarization so that I can diagnose stuck runs and potentially retry specific items.

**Why this priority**: Important for diagnosis. Knowing that 4 transcripts are stuck is useful, but knowing WHICH 4 (by model, scenario) enables targeted investigation.

**Independent Test**: For a run at 496/500 summarization, calling `get_unsummarized_transcripts(run_id)` returns the 4 transcript IDs with their model and scenario info.

**Acceptance Scenarios**:

1. **Given** a run with unsummarized transcripts, **When** I call `get_unsummarized_transcripts(run_id)`, **Then** I get a list of transcript IDs with modelId and scenarioId
2. **Given** a fully summarized run, **When** I call the tool, **Then** an empty list is returned
3. **Given** I want to see failed summaries too, **When** I include `include_failed=true`, **Then** transcripts with `decisionCode='error'` are also returned
4. **Given** the response is large, **When** there are many unsummarized, **Then** the response is limited (e.g., first 50) with a total count

---

### User Story 5 - Per-Model Progress Breakdown via MCP (Priority: P2)

As an operator, I need to see summarization progress broken down by model so that I can identify if a specific model is causing issues.

**Why this priority**: Important for diagnosis. The existing `summarizeProgress.byModel` field returns null. This prevents identifying model-specific issues (e.g., "all stuck transcripts are grok-4").

**Independent Test**: For a run with 4 models at 496/500, calling `get_run_summary` or querying `summarizeProgress.byModel` returns per-model completed/failed counts.

**Acceptance Scenarios**:

1. **Given** a run with multiple models, **When** I query summarizeProgress.byModel, **Then** I see completed/failed counts for each model
2. **Given** one model has all the failures, **When** I view byModel breakdown, **Then** the problematic model is clearly identifiable
3. **Given** the run is in PROBING state, **When** I query runProgress.byModel, **Then** I see per-model probe progress
4. **Given** some models finished faster than others, **When** I view byModel, **Then** I can see the relative progress

---

### User Story 6 - Recompute Analysis via MCP (Priority: P3)

As a researcher using Claude Code, I need to trigger analysis recomputation so that I can regenerate analysis after fixing data issues without using the web UI.

**Why this priority**: Nice-to-have. The web UI has this button, but MCP users should have parity for common operations.

**Independent Test**: After manually fixing transcript data, calling `recompute_analysis(run_id)` queues a new analysis job and returns the job status.

**Acceptance Scenarios**:

1. **Given** a completed run, **When** I call `recompute_analysis(run_id)`, **Then** a new analyze_basic job is queued
2. **Given** analysis is recomputed, **When** the job completes, **Then** the old analysis is marked SUPERSEDED
3. **Given** the run is not completed, **When** I call recompute, **Then** an error explains analysis requires completed run
4. **Given** recompute is triggered, **When** the response is returned, **Then** it includes job_id for tracking

---

## Edge Cases

- **Run has active jobs but appears stuck**: Recovery should detect active jobs and report "no recovery needed" rather than re-queuing duplicates
- **Job queue table doesn't exist**: Some environments may not have PgBoss initialized; tools should handle gracefully
- **Run deleted during recovery**: Recovery should handle concurrent deletion without crashing
- **Very large runs (10k+ transcripts)**: Job queue queries and transcript lists should be paginated or limited
- **Concurrent recovery attempts**: Multiple recovery calls for same run should not create duplicate jobs
- **Expired jobs vs failed jobs**: Jobs that expired from queue (default 30 min) look different from jobs that failed with errors; both should be recoverable

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST provide `recover_run` MCP tool that calls the recoverRun GraphQL mutation (Supports US1)
- **FR-002**: System MUST provide `trigger_recovery` MCP tool that calls the triggerRecovery GraphQL mutation (Supports US2)
- **FR-003**: System MUST provide `get_job_queue_status` MCP tool that queries PgBoss job states for a run (Supports US3)
- **FR-004**: System MUST return job counts grouped by job type (probe_scenario, summarize_transcript, analyze_basic) and state (pending, running, completed, failed) (Supports US3)
- **FR-005**: System MUST provide `get_unsummarized_transcripts` MCP tool that returns transcripts where summarizedAt IS NULL (Supports US4)
- **FR-006**: System MUST implement `summarizeProgress.byModel` resolver to return per-model progress (Supports US5)
- **FR-007**: System MUST implement `runProgress.byModel` resolver to return per-model probe progress (Supports US5)
- **FR-008**: System SHOULD provide `recompute_analysis` MCP tool that calls the recomputeAnalysis GraphQL mutation (Supports US6)
- **FR-009**: All new MCP tools MUST include audit logging with requestId, userId, and action details (Constitution: audit requirements)
- **FR-010**: All new MCP tools MUST return structured JSON responses with consistent error format (Supports all US)
- **FR-011**: Job queue queries MUST handle missing PgBoss tables gracefully (return empty results, not errors)
- **FR-012**: Transcript list queries MUST be limited to prevent response size issues (max 100 items, include total count)

### Non-Functional Requirements

- **NFR-001**: Job queue status queries MUST complete in under 2 seconds for runs with up to 10,000 jobs
- **NFR-002**: Recovery operations MUST be idempotent (calling twice produces same result)
- **NFR-003**: MCP tool responses MUST stay within the 10KB token budget defined in existing tools

---

## Success Criteria

- **SC-001**: Operators can recover a stuck run in under 30 seconds using only MCP tools (vs 5+ minutes with manual GraphQL)
- **SC-002**: When a run is stuck at 496/500, `get_job_queue_status` correctly shows 0 pending/running jobs, indicating recovery needed
- **SC-003**: After calling `recover_run`, the stuck run progresses to completion within the normal processing time
- **SC-004**: `get_unsummarized_transcripts` correctly identifies all transcripts missing summarization
- **SC-005**: `summarizeProgress.byModel` returns accurate per-model counts that sum to total progress
- **SC-006**: All new MCP tools follow the existing patterns in mcp/tools/ for consistency

---

## Key Entities

### JobQueueStatus (new response type)

```typescript
type JobQueueStatus = {
  runId: string;
  byJobType: {
    probe_scenario?: JobTypeCounts;
    summarize_transcript?: JobTypeCounts;
    analyze_basic?: JobTypeCounts;
  };
  totalPending: number;
  totalRunning: number;
  totalCompleted: number;
  totalFailed: number;
  recentFailures?: JobFailure[]; // if include_recent_failures=true
};

type JobTypeCounts = {
  pending: number;
  running: number;
  completed: number;
  failed: number;
};

type JobFailure = {
  jobId: string;
  jobType: string;
  error: string;
  failedAt: string;
  transcriptId?: string;
  scenarioId?: string;
  modelId?: string;
};
```

### ByModelProgress (fix existing type)

```typescript
type ByModelProgress = {
  modelId: string;
  displayName: string;
  completed: number;
  failed: number;
  total: number;
  percentComplete: number;
};
```

---

## Assumptions

1. **PgBoss job states are queryable**: We assume the pgboss.job table is accessible and has the expected schema (name, state, data jsonb)
2. **Mutation wrapper pattern is acceptable**: We assume wrapping existing GraphQL mutations in MCP tools is the preferred approach (vs reimplementing logic)
3. **Auth context available in MCP**: We assume MCP tools will have access to user context for audit logging (currently uses 'mcp-user' placeholder)
4. **Job expiry is the common failure mode**: We assume most "stuck" runs are due to jobs expiring from the queue (30 min default) rather than actual failures

---

## Out of Scope

- **Direct database write access**: MCP tools will not allow arbitrary SQL writes
- **Job retry with different parameters**: Recovery re-queues with same parameters; changing parameters requires a new run
- **Real-time job monitoring**: This spec covers point-in-time status queries, not live streaming
- **Cancel individual jobs**: Recovery is all-or-nothing; granular job control is future work

---

## Constitution Validation

**Checked against**: `cloud/CLAUDE.md`

| Requirement | Status | Notes |
|-------------|--------|-------|
| Logging via logger abstraction | PASS | FR-009 requires audit logging |
| No `any` types | PASS | Spec defines typed response structures |
| Error handling with AppError | PASS | FR-010 requires consistent error format |
| Test coverage 80%+ | PASS | Implicit in development workflow |
| File size < 400 lines | TBD | Implementation should follow this |

**Validation Result**: PASS - Spec addresses all relevant constitutional requirements.

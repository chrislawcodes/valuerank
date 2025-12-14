# Tasks: MCP Operations Tools

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1-US6)
- Include exact file paths from plan.md

---

## Phase 1: Setup

**Purpose**: Create feature branch and verify development environment

- [X] T001 Create feature branch `feat/018-mcp-operations-tools` from main
- [X] T002 Verify dev environment (`npm run dev` works, PostgreSQL on 5433)
- [X] T003 Review existing MCP tools pattern in `apps/api/src/mcp/tools/restart-summarization.ts`

**Checkpoint**: Development environment ready, patterns understood

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Shared infrastructure for all MCP operations tools

⚠️ **CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Create job queue service `apps/api/src/services/run/job-queue.ts`
  - Export `getJobQueueStatus(runId, options)` function
  - Query PgBoss `pgboss.job` table for job counts
  - Handle missing PgBoss tables gracefully
- [X] T005 [P] Create shared MCP response helpers in `apps/api/src/mcp/tools/helpers.ts`
  - Extract `formatError` and `formatSuccess` from existing tools
  - Add `createOperationsAudit` helper for audit logging
- [X] T006 [P] Add TypeScript types for job queue in `apps/api/src/services/run/types.ts`
  - `JobQueueStatus` type from spec
  - `JobTypeCounts` type
  - `JobFailure` type
- [X] T007 Create unit tests for job queue service `apps/api/tests/services/run/job-queue.test.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Recover Stuck Run (Priority: P1) 🎯 MVP

**Goal**: Enable recovery of individual stuck runs via MCP

**Independent Test**: Call `recover_run` on a stuck run, verify jobs are re-queued

### Implementation for User Story 1

- [ ] T008 [US1] Create `apps/api/src/mcp/tools/recover-run.ts`
  - Input schema: `run_id` (required)
  - Call existing `recoverRun` service or mutation
  - Return `{ success, run_id, status, action, requeued_count, run_progress }`
- [ ] T009 [US1] Add audit logging for recover_run in `recover-run.ts`
  - Use `logAuditEvent` with `createOperationsAudit`
- [ ] T010 [US1] Register tool in `apps/api/src/mcp/tools/index.ts`
  - Import and export `registerRecoverRunTool`
- [ ] T011 [US1] Create tests `apps/api/tests/mcp/tools/recover-run.test.ts`
  - Test successful recovery
  - Test "no recovery needed" case
  - Test NOT_FOUND error
  - Test INVALID_STATE error

**Checkpoint**: User Story 1 complete - `recover_run` tool working and tested

---

## Phase 4: User Story 2 - Trigger System Recovery (Priority: P1) 🎯 MVP

**Goal**: Enable system-wide recovery scan via MCP

**Independent Test**: Call `trigger_recovery`, verify all orphaned runs are detected and recovered

### Implementation for User Story 2

- [ ] T012 [US2] Create `apps/api/src/mcp/tools/trigger-recovery.ts`
  - No input parameters
  - Call `recoverOrphanedRuns` from `services/run/recovery.ts`
  - Return `{ success, detected_count, recovered_count, recovered_runs, errors }`
- [ ] T013 [US2] Add audit logging for trigger_recovery
- [ ] T014 [US2] Register tool in `apps/api/src/mcp/tools/index.ts`
- [ ] T015 [US2] Create tests `apps/api/tests/mcp/tools/trigger-recovery.test.ts`
  - Test with multiple stuck runs
  - Test with no stuck runs
  - Test partial failure (some runs recovered, some errored)

**Checkpoint**: User Story 2 complete - `trigger_recovery` tool working and tested

---

## Phase 5: User Story 3 - Job Queue Status (Priority: P1) 🎯 MVP

**Goal**: Enable job queue visibility for diagnosis

**Independent Test**: Call `get_job_queue_status` on a run, see accurate job counts by state

### Implementation for User Story 3

- [ ] T016 [US3] Create `apps/api/src/mcp/tools/get-job-queue-status.ts`
  - Input schema: `run_id` (required), `include_recent_failures` (optional)
  - Call `getJobQueueStatus` from `services/run/job-queue.ts`
  - Return `{ run_id, by_job_type, total_pending, total_running, ... }`
- [ ] T017 [US3] Register tool in `apps/api/src/mcp/tools/index.ts`
- [ ] T018 [US3] Create tests `apps/api/tests/mcp/tools/get-job-queue-status.test.ts`
  - Test with jobs in various states
  - Test with `include_recent_failures=true`
  - Test with empty queue
  - Test NOT_FOUND for invalid run

**Checkpoint**: User Story 3 complete - all P1 tools working

---

## Phase 6: User Story 4 - Unsummarized Transcripts Query (Priority: P2)

**Goal**: Identify which specific transcripts are stuck

**Independent Test**: Call `get_unsummarized_transcripts` on partially summarized run, see exact list

### Implementation for User Story 4

- [ ] T019 [US4] Create `apps/api/src/mcp/tools/get-unsummarized-transcripts.ts`
  - Input schema: `run_id`, `include_failed` (optional), `limit` (optional, default 50)
  - Query transcripts where `summarizedAt IS NULL`
  - Return `{ run_id, total_count, returned_count, transcripts }`
- [ ] T020 [US4] Register tool in `apps/api/src/mcp/tools/index.ts`
- [ ] T021 [US4] Create tests `apps/api/tests/mcp/tools/get-unsummarized-transcripts.test.ts`
  - Test with unsummarized transcripts
  - Test with fully summarized run (empty result)
  - Test with `include_failed=true`
  - Test limit parameter

**Checkpoint**: User Story 4 complete - diagnostic queries working

---

## Phase 7: User Story 5 - Per-Model Progress Fix (Priority: P2)

**Goal**: Fix `byModel` field on progress resolvers to show per-model breakdown

**Independent Test**: Query `summarizeProgress.byModel` via GraphQL, see per-model counts

### Implementation for User Story 5

- [ ] T022 [US5] Update `apps/api/src/graphql/types/run.ts`
  - Implement `byModel` resolver for `summarizeProgress`
  - Query: `SELECT model_id, COUNT(*) FILTER (...) FROM transcripts GROUP BY model_id`
- [ ] T023 [US5] Update `runProgress` resolver with same `byModel` pattern
- [ ] T024 [US5] Create tests for byModel resolver in `apps/api/tests/graphql/types/run.test.ts`
  - Test multi-model run
  - Test single-model run
  - Test empty run

**Checkpoint**: User Story 5 complete - GraphQL progress queries show per-model breakdown

---

## Phase 8: User Story 6 - Recompute Analysis Tool (Priority: P3)

**Goal**: Allow recomputing analysis via MCP

**Independent Test**: Call `recompute_analysis` on completed run, verify job queued

### Implementation for User Story 6 (Optional)

- [ ] T025 [US6] Create `apps/api/src/mcp/tools/recompute-analysis.ts`
  - Input schema: `run_id`
  - Call existing `recomputeAnalysis` mutation
  - Return `{ success, run_id, job_id }`
- [ ] T026 [US6] Register tool in `apps/api/src/mcp/tools/index.ts`
- [ ] T027 [US6] Create tests `apps/api/tests/mcp/tools/recompute-analysis.test.ts`

**Checkpoint**: User Story 6 complete (optional P3 feature)

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation, and cleanup

- [ ] T028 Run all tests: `npm run test:coverage` - verify 80%+ coverage
- [ ] T029 [P] Update MCP server documentation in `apps/api/src/mcp/README.md`
- [ ] T030 [P] Manual testing per `quickstart.md` scenarios
- [ ] T031 Review constitution compliance per `checklists/implementation.md`

**Checkpoint**: Feature complete and validated

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundation) ─────────────────┐
    ↓                                 │
    ├─→ Phase 3 (US1: recover_run)    │ BLOCKS all
    │       ↓                         │ user story
    ├─→ Phase 4 (US2: trigger_recovery) │ phases
    │       ↓                         │
    └─→ Phase 5 (US3: job_queue_status) │
            ↓                         │
        Phase 6 (US4: transcripts) ←──┘
            ↓
        Phase 7 (US5: byModel fix)
            ↓
        Phase 8 (US6: recompute) [Optional]
            ↓
        Phase 9 (Polish)
```

### Parallel Opportunities

| Phase | Parallel Tasks | Notes |
|-------|----------------|-------|
| Phase 2 | T005, T006 | Different files |
| Phase 9 | T029, T030 | Independent validation |

### User Story Independence

All user stories (US1-US6) can be tested independently after Foundation (Phase 2) is complete. Each checkpoint marks a fully functional, testable increment.

### Recommended Execution Order (Single Developer)

1. Phase 1-2: Setup + Foundation (blocking)
2. Phase 3: US1 recover_run (most critical)
3. Phase 5: US3 job_queue_status (needed for diagnosis)
4. Phase 4: US2 trigger_recovery (uses same patterns)
5. Phase 6: US4 unsummarized transcripts
6. Phase 7: US5 byModel fix
7. Phase 8: US6 recompute (if time)
8. Phase 9: Polish

**Estimated Tasks**: 31 total (24 required P1/P2, 3 optional P3, 4 polish)

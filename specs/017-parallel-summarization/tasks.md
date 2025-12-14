# Tasks: Parallel Summarization

**Prerequisites**: plan.md, spec.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel
- **[Story]**: User story (US1-US9)
- Include exact file paths from plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and branch setup

- [X] T001 Create feature branch `feat/017-parallel-summarization`
- [X] T002 Verify local dev environment running (`npm run dev` in cloud/)

**Checkpoint**: Branch ready, dev environment verified

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

**No new database migrations required** - Uses existing `SystemSetting` table

### Summarization Parallelism Service

- [X] T003 Create `cloud/apps/api/src/services/summarization-parallelism/index.ts`:
  - `getMaxParallelSummarizations()` - Returns cached value or default 8
  - `setMaxParallelSummarizations(value)` - Updates DB and clears cache
  - `clearSummarizationCache()` - Cache invalidation
  - Cache with 60s TTL matching provider parallelism pattern

- [X] T004 Add unit tests in `cloud/apps/api/tests/services/summarization-parallelism.test.ts`

### Handler Re-registration Support

- [X] T005 Update `cloud/apps/api/src/queue/handlers/index.ts`:
  - Add `reregisterSummarizeHandler(boss)` function
  - Follow `reregisterProviderHandler` pattern
  - Clear cache, then boss.offWork() then boss.work(newBatchSize)

- [X] T006 Update `cloud/apps/api/src/services/run/progress.ts`:
  - Import `getMaxParallelSummarizations`
  - Use dynamic batchSize in `queueSummarizeJobs()`
  - NOTE: No changes needed - batchSize controls worker concurrency (handled in T005), not job queueing

**Checkpoint**: Foundation ready - parallelism setting infrastructure complete

---

## Phase 3: User Story 1 - Configure Summarization Parallelism (Priority: P1) 🎯 MVP

**Goal**: Administrators can configure how many summarization jobs run in parallel

**Independent Test**: Set value via MCP, verify it persists and is retrievable

### Implementation for User Story 1

- [ ] T007 [US1] Create `cloud/apps/api/src/mcp/tools/set-summarization-parallelism.ts`:
  - Input schema: `max_parallel` (integer, 1-100)
  - Calls `setMaxParallelSummarizations()`
  - Calls `reregisterSummarizeHandler()` for hot reload
  - Returns success with new value

- [ ] T008 [US1] Register tool in `cloud/apps/api/src/mcp/tools/registry.ts`

- [ ] T009 [US1] Update `cloud/apps/api/src/mcp/tools/list-system-settings.ts`:
  - Ensure `infra_max_parallel_summarizations` appears in output
  - Show default value (8) if not configured

- [ ] T010 [US1] Add MCP tool tests in `cloud/apps/api/tests/mcp/tools/set-summarization-parallelism.test.ts`

**Checkpoint**: US1 complete - parallelism configurable via MCP

---

## Phase 4: User Story 2 - Parallel Summarization Execution (Priority: P1) 🎯 MVP

**Goal**: Summarization runs in parallel with its own pool separate from probing

**Independent Test**: Start run, observe summarization jobs processing at configured limit

### Implementation for User Story 2

- [ ] T011 [US2] Verify `cloud/apps/api/src/queue/handlers/summarize-transcript.ts`:
  - Confirm handler already supports batch processing
  - No changes needed if already compatible

- [ ] T012 [US2] Add integration test in `cloud/apps/api/tests/queue/summarize-parallelism.test.ts`:
  - Mock PgBoss to verify batchSize from setting
  - Test default value (8) behavior

**Checkpoint**: US2 complete - summarization uses configurable parallelism

---

## Phase 5: User Story 3 - Summarization Job Queueing (Priority: P1) 🎯 MVP

**Goal**: Individual jobs per transcript with proper retry semantics

**Independent Test**: Start run, verify individual jobs in PgBoss per transcript

### Implementation for User Story 3

- [ ] T013 [US3] Verify existing implementation in `cloud/apps/api/src/services/run/progress.ts`:
  - `queueSummarizeJobs()` already creates individual jobs per transcript
  - Confirm retry options from `DEFAULT_JOB_OPTIONS`

- [ ] T014 [US3] Add test in `cloud/apps/api/tests/services/run/progress.test.ts`:
  - Verify individual jobs per transcript
  - Verify retry configuration

**Checkpoint**: US3 complete - granular job control verified

---

## Phase 6: User Story 4 - Cancel Summarization (Priority: P1) 🎯 MVP

**Goal**: Operators can cancel pending summarization jobs while preserving completed summaries

**Independent Test**: Cancel mid-summarization, verify pending cancelled but completed preserved

### Implementation for User Story 4

- [ ] T015 [US4] Create `cloud/apps/api/src/services/run/summarization.ts`:
  - `cancelSummarization(runId)` function
  - Cancel pending `summarize_transcript` jobs via SQL (same pattern as `control.ts`)
  - Update `summarizeProgress` to reflect cancelled jobs
  - Return cancelled count
  - Preserve completed summaries

- [ ] T016 [US4] Add unit tests in `cloud/apps/api/tests/services/run/summarization.test.ts`:
  - Test cancel with pending jobs
  - Test cancel on completed run (no-op)
  - Test preservation of completed summaries

- [ ] T017 [US4] Add GraphQL mutation in `cloud/apps/api/src/graphql/mutations/run.ts`:
  - `cancelSummarization(runId: ID!)` mutation
  - Returns `CancelSummarizationPayload { run, cancelledCount }`
  - Require authentication
  - Add audit logging

- [ ] T018 [US4] Add GraphQL tests in `cloud/apps/api/tests/graphql/mutations/cancel-summarization.test.ts`

**Checkpoint**: US4 complete - cancel summarization operational

---

## Phase 7: User Story 5 - Restart Summarization (Priority: P1) 🎯 MVP

**Goal**: Operators can restart summarization for failed transcripts without re-running probing

**Independent Test**: Restart run with failed summaries, verify only failed transcripts re-queued

### Implementation for User Story 5

- [ ] T019 [US5] Add to `cloud/apps/api/src/services/run/summarization.ts`:
  - `restartSummarization(runId, force?)` function
  - Validate run is in terminal state (COMPLETED/FAILED/CANCELLED)
  - Cancel any pending summarize jobs first (avoid duplicates)
  - Query transcripts: if force → all, else → WHERE summarizedAt IS NULL OR decisionCode = 'error'
  - Queue new jobs
  - Update `summarizeProgress` and set status to SUMMARIZING
  - Return queued count

- [ ] T020 [US5] Add unit tests for restart logic in `cloud/apps/api/tests/services/run/summarization.test.ts`:
  - Test default mode (failed only)
  - Test force mode (all transcripts)
  - Test rejection on running run
  - Test with no failed transcripts

- [ ] T021 [US5] Add GraphQL mutation in `cloud/apps/api/src/graphql/mutations/run.ts`:
  - `restartSummarization(runId: ID!, force: Boolean)` mutation
  - Returns `RestartSummarizationPayload { run, queuedCount }`
  - Require authentication
  - Add audit logging

- [ ] T022 [US5] Add GraphQL tests in `cloud/apps/api/tests/graphql/mutations/restart-summarization.test.ts`

**Checkpoint**: US5 complete - restart summarization operational

---

## Phase 8: User Story 6 - MCP Tool for Summarization Settings (Priority: P2)

**Goal**: AI agents can view and modify summarization parallelism via MCP

**Independent Test**: Use MCP tools to get/set parallelism

### Implementation for User Story 6

- [ ] T023 [US6] Verify `set_summarization_parallelism` tool works (from US1)

- [ ] T024 [US6] Verify `list_system_settings` shows the setting (from US1)

- [ ] T025 [US6] Add integration test for full MCP workflow in `cloud/apps/api/tests/mcp/tools/summarization-settings.test.ts`

**Checkpoint**: US6 complete - MCP settings tools verified

---

## Phase 9: User Story 7 - UI Buttons for Cancel/Restart Summarization (Priority: P1) 🎯 MVP

**Goal**: Users can manage summarization from the web UI

**Independent Test**: View run detail, see buttons, click to cancel/restart

### Implementation for User Story 7

- [ ] T026 [P] [US7] Add GraphQL operations in `cloud/apps/web/src/api/operations/summarization.ts`:
  - `CANCEL_SUMMARIZATION_MUTATION`
  - `RESTART_SUMMARIZATION_MUTATION`
  - Export types

- [ ] T027 [P] [US7] Create `cloud/apps/web/src/hooks/useSummarizationMutations.ts`:
  - `cancelSummarization(runId)` function
  - `restartSummarization(runId, force?)` function
  - Loading and error states

- [ ] T028 [US7] Create `cloud/apps/web/src/components/runs/SummarizationControls.tsx`:
  - Cancel button with confirmation dialog (visible when summarizing with pending jobs)
  - Restart button (visible when failed/missing summaries)
  - Re-summarize All button (visible when all complete, for force mode)
  - Loading states during operations
  - Toast notifications for results

- [ ] T029 [US7] Update `cloud/apps/web/src/pages/RunDetail.tsx`:
  - Import and render `SummarizationControls`
  - Pass run state, summarizeProgress
  - Position near existing RunControls

- [ ] T030 [US7] Add component tests in `cloud/apps/web/tests/components/runs/SummarizationControls.test.tsx`:
  - Test button visibility based on state
  - Test confirmation dialog
  - Test loading states

**Checkpoint**: US7 complete - UI buttons functional

---

## Phase 10: User Story 8 - MCP Tools for Cancel/Restart (Priority: P2)

**Goal**: AI agents can cancel/restart summarization via MCP

**Independent Test**: Use MCP tools to cancel and restart summarization

### Implementation for User Story 8

- [ ] T031 [US8] Create `cloud/apps/api/src/mcp/tools/cancel-summarization.ts`:
  - Input schema: `run_id` (string, required)
  - Calls `cancelSummarization(runId)`
  - Returns success with cancelled count

- [ ] T032 [US8] Create `cloud/apps/api/src/mcp/tools/restart-summarization.ts`:
  - Input schema: `run_id` (string, required), `force` (boolean, default false)
  - Calls `restartSummarization(runId, force)`
  - Returns success with queued count

- [ ] T033 [US8] Register both tools in `cloud/apps/api/src/mcp/tools/registry.ts`

- [ ] T034 [US8] Add MCP tool tests in `cloud/apps/api/tests/mcp/tools/cancel-summarization.test.ts`

- [ ] T035 [US8] Add MCP tool tests in `cloud/apps/api/tests/mcp/tools/restart-summarization.test.ts`

**Checkpoint**: US8 complete - MCP cancel/restart tools operational

---

## Phase 11: User Story 9 - Graceful Setting Changes (Priority: P3)

**Goal**: Parallelism changes apply gracefully without disrupting in-flight jobs

**Independent Test**: Change setting while jobs running, verify graceful transition

### Implementation for User Story 9

- [ ] T036 [US9] Verify `reregisterSummarizeHandler` in `cloud/apps/api/src/queue/handlers/index.ts`:
  - Uses `boss.offWork()` which is graceful (in-flight complete)
  - New handler starts with updated batchSize

- [ ] T037 [US9] Add integration test for graceful transition in `cloud/apps/api/tests/queue/summarize-reregistration.test.ts`:
  - Start jobs at batchSize 8
  - Change setting to 4
  - Verify in-flight complete
  - Verify new jobs use new limit

**Checkpoint**: US9 complete - graceful setting changes verified

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation

- [ ] T038 [P] Run full test suite: `npm run test:coverage` in cloud/
- [ ] T039 [P] Manual testing per quickstart.md scenarios
- [ ] T040 [P] Verify MCP tool descriptions are accurate and helpful
- [ ] T041 Review and update feature documentation if needed
- [ ] T042 Create PR with comprehensive description

**Checkpoint**: Feature complete and ready for review

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundation) ← BLOCKS all user stories
    ↓
┌───┴───┬───────┬───────┬───────┬───────┐
│       │       │       │       │       │
US1     US2     US3     US4     US5     US7
(P3)    (P4)    (P5)    (P6)    (P7)    (P9)
│       │       │       │       │
└───┬───┴───────┴───────┴───────┘
    │
US6 (P8) ← Depends on US1
    │
US8 (P10) ← Depends on US4, US5
    │
US9 (P11) ← Depends on Foundation
    │
Polish (P12) ← Depends on all user stories
```

### Parallel Opportunities

**Within Phase 2 (Foundation)**:
- T003 and T005 can run in parallel (different files)

**Within Phase 9 (UI)**:
- T026 and T027 can run in parallel (different files)

**Cross-Phase Parallelism** (if multiple developers):
- US1, US2, US3 can proceed in parallel after Foundation
- US4 and US5 can proceed in parallel
- US7 depends on US4 and US5 being complete (needs mutations)

### Task Count Summary

| Phase | Tasks | Parallel |
|-------|-------|----------|
| Setup | 2 | 0 |
| Foundation | 4 | 0 |
| US1 (Config) | 4 | 0 |
| US2 (Execution) | 2 | 0 |
| US3 (Queueing) | 2 | 0 |
| US4 (Cancel) | 4 | 0 |
| US5 (Restart) | 4 | 0 |
| US6 (MCP Settings) | 3 | 0 |
| US7 (UI) | 5 | 2 |
| US8 (MCP Control) | 5 | 0 |
| US9 (Graceful) | 2 | 0 |
| Polish | 5 | 3 |
| **Total** | **42** | **5** |

# Feature Specification: Parallel Summarization

**Feature Branch**: `feat/017-parallel-summarization`
**Created**: 2025-12-13
**Status**: Draft
**Input Description**: Add parallel summarization with separate pool/budget from probing, configurable via infrastructure settings, with cancel and restart capabilities

---

## Overview

Currently, summarization jobs run on a single `summarize_transcript` queue with a fixed batch size. Probing has sophisticated per-provider parallelism controls, but summarization doesn't benefit from the same configurability. Additionally, there's no way to cancel or restart summarization independently of the full run lifecycle. This feature adds:

1. A configurable `max_parallel_summarizations` setting in the infrastructure section
2. Separate job queuing for summarization that respects this parallelism limit
3. Default to 8 parallel summarizations when not configured
4. Ability to cancel pending/running summarization jobs for a run
5. Ability to restart summarization for transcripts that need it

---

## User Scenarios & Testing

### User Story 1 - Configure Summarization Parallelism (Priority: P1)

As an administrator, I need to configure how many summarization jobs run in parallel so that I can optimize throughput based on my LLM provider's rate limits without affecting probing performance.

**Why this priority**: Core functionality - enables independent tuning of summarization throughput.

**Independent Test**:
1. Access infrastructure settings (via MCP or future UI)
2. Set `max_parallel_summarizations` to a value (e.g., 4)
3. Verify the setting is persisted and retrievable
4. Observe summarization jobs respecting the new limit

**Acceptance Scenarios**:

1. **Given** infrastructure settings are accessible, **When** I set `max_parallel_summarizations` to 4, **Then** the system saves the setting and confirms the new value.

2. **Given** `max_parallel_summarizations` is set to 4, **When** I query the current settings, **Then** I see `max_parallel_summarizations: 4` in the response.

3. **Given** the setting doesn't exist in the database, **When** the system needs to process summarization jobs, **Then** it uses the default value of 8.

---

### User Story 2 - Parallel Summarization Execution (Priority: P1)

As a system operator, I need summarization to run in parallel with its own pool separate from probing so that summarization throughput is optimized independently and doesn't compete for probing slots.

**Why this priority**: Core functionality - ensures summarization and probing don't interfere with each other's throughput.

**Independent Test**:
1. Start a run with multiple scenarios and models
2. Wait for probing to complete
3. Observe summarization jobs processing in parallel up to the configured limit
4. Verify probing parallelism is unaffected by summarization activity

**Acceptance Scenarios**:

1. **Given** `max_parallel_summarizations` is 8 and a run with 20 transcripts completes probing, **When** summarization begins, **Then** up to 8 summarization jobs run concurrently.

2. **Given** probing and summarization are both active, **When** summarization reaches its parallelism limit, **Then** probing continues at its configured rate unimpeded.

3. **Given** a summarization job completes, **When** more jobs are queued, **Then** a new job starts immediately up to the parallelism limit.

---

### User Story 3 - Summarization Job Queueing (Priority: P1)

As a system, I need individual summarization jobs for each transcript so that failed jobs can be retried independently without affecting other transcripts.

**Why this priority**: Core reliability - granular job control enables proper retry semantics and failure isolation.

**Independent Test**:
1. Start a run that produces 10 transcripts
2. Query the job queue to see 10 individual `summarize_transcript` jobs
3. Force one job to fail
4. Verify only that job retries, others complete normally

**Acceptance Scenarios**:

1. **Given** probing produces 10 transcripts, **When** summarization is triggered, **Then** 10 separate `summarize_transcript` jobs are created in PgBoss.

2. **Given** one summarization job fails with a retryable error, **When** it retries, **Then** other jobs are unaffected and continue processing.

3. **Given** the summarization queue has 50 pending jobs, **When** the parallelism limit is 8, **Then** exactly 8 jobs are active at any time.

---

### User Story 4 - Cancel Summarization (Priority: P1)

As an operator, I need to cancel pending summarization jobs for a run so that I can stop wasting resources on summaries I no longer need (e.g., wrong model configured, run no longer relevant).

**Why this priority**: Core operational control - enables cost savings and resource management when summarization is running incorrectly.

**Independent Test**:
1. Start a run with many scenarios/models that produces 100+ transcripts
2. Wait for probing to complete and summarization to begin
3. Call cancel summarization for the run
4. Verify pending summarization jobs are cancelled
5. Verify in-flight jobs complete gracefully
6. Verify already-completed summaries are preserved

**Acceptance Scenarios**:

1. **Given** a run with 50 pending summarization jobs and 5 active jobs, **When** I cancel summarization, **Then** the 50 pending jobs are cancelled, the 5 active jobs complete, and existing summaries are preserved.

2. **Given** summarization is cancelled for a run, **When** I query the run status, **Then** I see accurate counts of completed vs cancelled summaries.

3. **Given** a run in COMPLETED status, **When** I try to cancel summarization, **Then** the operation succeeds (no-op) since no jobs are pending.

4. **Given** a run with no pending summarization jobs, **When** I cancel summarization, **Then** the operation returns success with 0 jobs cancelled.

---

### User Story 5 - Restart Summarization (Priority: P1)

As an operator, I need to restart summarization for a run so that I can re-process transcripts after fixing configuration issues (e.g., changed summarizer model) or to retry failed summaries.

**Why this priority**: Core operational control - enables recovery from failures and configuration changes without re-running the entire evaluation.

**Independent Test**:
1. Complete a run with summarization
2. Change the summarizer model in infrastructure settings
3. Call restart summarization for the run
4. Verify new summarization jobs are queued for transcripts without summaries (or all transcripts if "force" option used)
5. Verify existing summaries can optionally be re-processed

**Acceptance Scenarios**:

1. **Given** a run with 10 transcripts where 3 have failed summaries, **When** I restart summarization (default mode), **Then** 3 new summarization jobs are queued for the failed transcripts.

2. **Given** a run with 10 transcripts all successfully summarized, **When** I restart summarization with `force: true`, **Then** 10 new summarization jobs are queued and existing summaries will be overwritten.

3. **Given** a run with 10 transcripts all successfully summarized, **When** I restart summarization (default mode), **Then** 0 jobs are queued and a message indicates all transcripts are already summarized.

4. **Given** summarization was cancelled leaving 20 transcripts unsummarized, **When** I restart summarization, **Then** 20 new jobs are queued for the unsummarized transcripts.

5. **Given** a run in RUNNING status (probing not complete), **When** I try to restart summarization, **Then** the operation fails with an appropriate error message.

---

### User Story 6 - MCP Tool for Summarization Settings (Priority: P2)

As an AI agent user, I need MCP tools to view and modify summarization parallelism settings so that I can configure the system without direct database access.

**Why this priority**: Important for MCP-based workflows but system functions without it.

**Independent Test**:
1. Use `list_system_settings` MCP tool
2. See `max_parallel_summarizations` in the output
3. Use a new `set_summarization_parallelism` tool (or extend existing infra tools)
4. Verify the setting is updated

**Acceptance Scenarios**:

1. **Given** I have MCP access, **When** I call `list_system_settings`, **Then** I see `max_parallel_summarizations` with its current value or default.

2. **Given** I have MCP access, **When** I set `max_parallel_summarizations` via the appropriate tool, **Then** the setting is persisted and the queue behavior changes to match.

---

### User Story 7 - UI Buttons for Cancel/Restart Summarization (Priority: P1)

As a user viewing a run in the web UI, I need buttons to cancel and restart summarization so that I can manage summarization without using CLI tools or MCP.

**Why this priority**: Core UX - most users interact via the web UI, not MCP or GraphQL directly.

**Independent Test**:
1. Navigate to a run detail page where summarization is in progress
2. See "Cancel Summarization" button in the run actions area
3. Click cancel and see confirmation dialog
4. After cancellation, see "Restart Summarization" button appear
5. Click restart and see summarization begin again

**Acceptance Scenarios**:

1. **Given** I'm viewing a run where summarization is in progress (pending jobs exist), **When** the page loads, **Then** I see a "Cancel Summarization" button.

2. **Given** I click "Cancel Summarization", **When** the confirmation dialog appears and I confirm, **Then** summarization is cancelled and I see a success toast with the count of cancelled jobs.

3. **Given** a run has unsummarized or failed transcripts, **When** I view the run detail page, **Then** I see a "Restart Summarization" button.

4. **Given** I click "Restart Summarization", **When** the action completes, **Then** I see a success toast with the count of queued jobs and the summarization progress updates.

5. **Given** a run has all transcripts successfully summarized, **When** I view the run detail page, **Then** I see a "Re-summarize All" button (for force restart) instead of "Restart Summarization".

6. **Given** summarization is actively running, **When** I view the run, **Then** the buttons show appropriate loading/disabled states during operations.

---

### User Story 8 - MCP Tools for Cancel/Restart (Priority: P2)

As an AI agent user, I need MCP tools to cancel and restart summarization so that I can manage summarization workflows without direct database access.

**Why this priority**: Important for MCP-based workflows, complements the settings tool.

**Independent Test**:
1. Use MCP to start a run
2. Use `cancel_summarization` MCP tool to cancel pending summaries
3. Use `restart_summarization` MCP tool to restart failed summaries
4. Verify operations complete successfully

**Acceptance Scenarios**:

1. **Given** I have MCP access, **When** I call `cancel_summarization` with a run ID, **Then** pending summarization jobs are cancelled and I receive a count of cancelled jobs.

2. **Given** I have MCP access, **When** I call `restart_summarization` with a run ID, **Then** summarization is restarted for unsummarized transcripts and I receive a count of queued jobs.

3. **Given** I have MCP access, **When** I call `restart_summarization` with `force: true`, **Then** all transcripts are re-summarized regardless of existing summaries.

---

### User Story 9 - Graceful Setting Changes (Priority: P3)

As an operator, I need the system to apply parallelism changes gracefully so that in-flight jobs complete normally when I change the setting.

**Why this priority**: Nice-to-have for operational flexibility, but rare operation.

**Independent Test**:
1. Start a run with many transcripts
2. While summarization is running, change `max_parallel_summarizations` from 8 to 4
3. Verify in-flight jobs complete
4. Verify new job pickups respect the new limit

**Acceptance Scenarios**:

1. **Given** 8 summarization jobs are running, **When** I reduce `max_parallel_summarizations` to 4, **Then** the 8 running jobs complete and new jobs start at the rate of 4.

2. **Given** 4 summarization jobs are running, **When** I increase `max_parallel_summarizations` to 12, **Then** additional jobs start immediately up to 12 concurrent.

---

## Edge Cases

- **No transcripts to summarize**: If all transcripts already have summaries, no jobs are created
- **Setting value of 0**: Should be validated and rejected (minimum is 1)
- **Setting value very high (e.g., 1000)**: System allows it but practical limits are imposed by LLM provider rate limits
- **Database unavailable when fetching setting**: Use default value of 8 and log warning
- **Concurrent setting updates**: Last write wins (standard SystemSetting behavior)
- **Run cancelled during summarization**: Existing job cancellation logic applies
- **Cancel during active summarization**: In-flight jobs complete, only pending jobs are cancelled
- **Restart with force while jobs active**: Should cancel pending jobs first, then queue new jobs for all transcripts
- **Restart on run still probing**: Should be rejected with clear error - probing must complete first
- **Restart on run with no transcripts**: Should return success with 0 jobs queued
- **Cancel on already-completed run**: No-op, return success with 0 jobs cancelled
- **Multiple rapid cancel/restart calls**: Each operation is idempotent, safe to call repeatedly
- **Failed transcript detection**: Transcripts with `decisionCode = 'error'` are considered failed and eligible for restart
- **UI button visibility during polling**: Buttons should update as run status changes via polling
- **User clicks button during network latency**: Button shows loading state, prevents double-submission
- **Operation fails (network error)**: Show error toast, button returns to clickable state

---

## Requirements

### Functional Requirements

**Parallelism Configuration:**
- **FR-001**: System MUST store `max_parallel_summarizations` setting in the `SystemSetting` table with key `infra_max_parallel_summarizations`
- **FR-002**: System MUST default to 8 parallel summarizations when the setting is not configured (null or missing)
- **FR-003**: System MUST create individual PgBoss jobs for each transcript requiring summarization
- **FR-004**: System MUST limit concurrent summarization job processing to the configured `max_parallel_summarizations` value
- **FR-005**: System MUST maintain separate parallelism pools for probing and summarization (no shared limits)
- **FR-006**: System MUST allow setting values from 1 to 100 (inclusive)
- **FR-007**: System MUST expose the setting via the `list_system_settings` MCP tool
- **FR-008**: System MUST provide a mechanism to update the setting (extend existing MCP tools or add new one)
- **FR-009**: System MUST apply setting changes without restarting the server (hot reload)

**Cancel Summarization:**
- **FR-010**: System MUST provide a `cancelSummarization(runId)` operation accessible via GraphQL and MCP
- **FR-011**: Cancel operation MUST remove all pending `summarize_transcript` jobs for the specified run from the PgBoss queue
- **FR-012**: Cancel operation MUST allow in-flight summarization jobs to complete gracefully
- **FR-013**: Cancel operation MUST preserve existing completed summaries (never delete summary data)
- **FR-014**: Cancel operation MUST return the count of cancelled jobs
- **FR-015**: Cancel operation MUST be idempotent (safe to call multiple times)

**Restart Summarization:**
- **FR-016**: System MUST provide a `restartSummarization(runId, force?)` operation accessible via GraphQL and MCP
- **FR-017**: Restart operation (default mode) MUST queue jobs only for transcripts without valid summaries (`summarizedAt IS NULL` OR `decisionCode = 'error'`)
- **FR-018**: Restart operation with `force: true` MUST queue jobs for ALL transcripts, clearing existing summary data before processing
- **FR-019**: Restart operation MUST reject runs that are still in PENDING or RUNNING status (probing not complete)
- **FR-020**: Restart operation MUST cancel any pending summarization jobs before queuing new ones (to avoid duplicates)
- **FR-021**: Restart operation MUST return the count of queued jobs
- **FR-022**: Restart operation MUST update run's `summarizeProgress` to reflect the new job counts

**UI Components:**
- **FR-023**: Run detail page MUST display a "Cancel Summarization" button when summarization jobs are pending or active
- **FR-024**: Run detail page MUST display a "Restart Summarization" button when transcripts have failed or missing summaries
- **FR-025**: Run detail page MUST display a "Re-summarize All" button when all transcripts are successfully summarized (for force restart)
- **FR-026**: Cancel button MUST show a confirmation dialog before executing
- **FR-027**: Buttons MUST show loading state during operation and be disabled to prevent double-clicks
- **FR-028**: UI MUST display toast notifications with operation results (jobs cancelled/queued count)
- **FR-029**: UI MUST update summarization progress display after cancel/restart operations complete

### Non-Functional Requirements

- **NFR-001**: Setting retrieval MUST be cached with a TTL (similar to provider limits) to avoid database calls per job
- **NFR-002**: Cache invalidation MUST occur within 60 seconds of a setting change
- **NFR-003**: Job queueing latency MUST remain under 100ms per job

---

## Success Criteria

- **SC-001**: Operators can configure summarization parallelism independently from probing
- **SC-002**: Summarization throughput scales linearly with the parallelism setting up to LLM rate limits
- **SC-003**: Probing performance is unaffected when summarization is at maximum parallelism
- **SC-004**: Setting changes take effect within 60 seconds without server restart
- **SC-005**: Default behavior (8 parallel) works correctly on fresh deployments with no configuration
- **SC-006**: Operators can cancel summarization within 5 seconds of initiating the operation
- **SC-007**: Operators can restart summarization for failed transcripts without re-running probing
- **SC-008**: Cancel/restart operations are accessible via GraphQL, MCP, and web UI
- **SC-009**: Users can manage summarization directly from the run detail page without technical knowledge

---

## Key Entities

### SystemSetting (existing table)

New setting key:
- `infra_max_parallel_summarizations`: JSON value `{ "value": 8 }` (or just the integer, matching existing patterns)

### Queue Architecture

Current:
```
summarize_transcript (single queue, fixed batchSize from config)
```

After:
```
summarize_transcript (single queue, batchSize from SystemSetting with default 8)
```

Note: Unlike probing which has per-provider queues, summarization uses a single queue since it typically uses one configured model (the `summarizer` infra model).

---

## Assumptions

1. **Single summarization model**: Summarization uses the configured `infra_model_summarizer`, so per-provider parallelism isn't needed (unlike probing which targets multiple providers)
2. **PgBoss batchSize is sufficient**: We can control parallelism via PgBoss worker `batchSize` option, similar to how probe queues work
3. **Dynamic handler re-registration**: We can re-register the summarize handler with updated batchSize when settings change (similar to `reregisterProviderHandler`)
4. **Existing job structure is adequate**: The current `SummarizeTranscriptJobData` type already supports individual jobs per transcript

---

## Out of Scope

- Per-model summarization parallelism (only needed if supporting multiple summarizer models)
- Rate limiting for summarization (beyond parallelism - could be added later)
- UI for configuring parallelism setting (MCP-only for now; cancel/restart UI is in scope)
- Automatic parallelism tuning based on error rates
- Bulk cancel/restart across multiple runs (single run operations only)

---

## Related Files (for implementation reference)

**Queue & Parallelism:**
- `cloud/apps/api/src/queue/handlers/summarize-transcript.ts` - Current handler
- `cloud/apps/api/src/queue/handlers/index.ts` - Handler registration
- `cloud/apps/api/src/services/parallelism/index.ts` - Provider parallelism (pattern to follow)
- `cloud/apps/api/src/services/run/progress.ts` - Where summarize jobs are queued

**Run Control (patterns for cancel/restart):**
- `cloud/apps/api/src/services/run/control.ts` - Existing pause/resume/cancel run logic
- `cloud/apps/api/src/services/run/recovery.ts` - Recovery logic that queues summarize jobs
- `cloud/apps/api/src/graphql/mutations/run.ts` - GraphQL mutations for run control

**MCP Tools:**
- `cloud/apps/api/src/mcp/tools/set-infra-model.ts` - MCP tool pattern for settings
- `cloud/apps/api/src/mcp/tools/list-system-settings.ts` - Existing settings tool
- `cloud/apps/api/src/mcp/tools/delete-run.ts` - Pattern for run-specific MCP tools

**Frontend (UI buttons):**
- `cloud/apps/web/src/pages/RunDetail.tsx` - Run detail page where buttons will be added
- `cloud/apps/web/src/hooks/useRunMutations.ts` - Existing run mutation hooks (pause/resume/cancel)
- `cloud/apps/web/src/api/operations/runs.ts` - GraphQL operations for runs

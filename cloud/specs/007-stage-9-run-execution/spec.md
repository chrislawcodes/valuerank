# Feature Specification: Stage 9 - Run Execution & Basic Export

> **Feature #007** | Branch: `feature/stage-9-run-execution`
> **Created**: 2025-12-07
> **Status**: Draft
> **Dependencies**: Stage 5 (Queue System), Stage 6 (Python Workers), Stage 8 (Definition UI) - All Complete

## Overview

Implement end-to-end run execution from UI to results, with CSV export for external analysis. This stage connects the definition management UI to the existing queue system and Python workers, enabling team members to execute evaluations and export results for analysis in external tools (Jupyter, R, pandas).

**Input Description**: Run creation form (select definition, models, options), model version selection, run dashboard with status table, polling-based progress updates (5s interval), run detail page showing per-model progress, run controls (pause/resume/cancel), CSV export endpoint for run results, basic results viewer (scores table, per-model breakdown), transcript storage with model version capture, access tracking middleware, re-run capability.

**Phase 1 Milestone**: This stage completes Phase 1 - team can create definitions, run evaluations, and export results for external analysis.

---

## User Stories & Testing

### User Story 0 - Verify System Health & View Expanded Scenarios (Priority: P0 - Prerequisite)

As a researcher, I need to verify that the system is operational (LLM providers connected, queue running, workers ready) and see the expanded scenarios before starting a run so that I can be confident the evaluation will succeed.

**Why this priority**: Prerequisite - without end-to-end validation, runs will fail mysteriously. This unblocks all other user stories and validates Stages 5-6 integration.

**Independent Test**: Navigate to Settings, verify LLM provider status shows connectivity. View a definition, verify expanded scenarios are listed. Start a test run, verify queue processes it.

**Acceptance Scenarios**:

1. **Given** I navigate to Settings, **When** I view the System Health section, **Then** I see status for each LLM provider (connected/disconnected/error)
2. **Given** I view provider status, **When** a provider has a valid API key, **Then** I see a health check result showing the key works
3. **Given** I view provider status, **When** a provider key is missing or invalid, **Then** I see a clear error message
4. **Given** I view a definition, **When** scenarios have been expanded, **Then** I see a list of expanded scenarios with their dimension values
5. **Given** I view expanded scenarios, **When** I click on one, **Then** I see the full prompt text that will be sent to LLMs
6. **Given** the queue worker is not running, **When** I check system status, **Then** I see a warning that the worker is offline
7. **Given** I start a test run with 1 scenario, **When** the job completes, **Then** I see a transcript was created (end-to-end validation)

---

### User Story 1 - Create and Start a Run (Priority: P1)

As a researcher, I need to create an evaluation run by selecting a definition and target models so that I can evaluate AI behavior on my scenario.

**Why this priority**: Core functionality - the system's primary purpose is running evaluations. Without this, users cannot test their definitions against AI models.

**Independent Test**: Navigate to a definition, click "Start Run", select models, configure options, start the run, verify jobs are queued.

**Acceptance Scenarios**:

1. **Given** I am viewing a definition, **When** I click "Start Run", **Then** I see a run configuration form
2. **Given** I am configuring a run, **When** I see the model selection, **Then** I can select one or more target models from available providers
3. **Given** I am selecting models, **When** I expand a model, **Then** I can optionally select a specific model version (e.g., `gemini-1.5-pro-002`)
4. **Given** I have configured a run, **When** I click "Start Run", **Then** the run is created and jobs are queued for each model-scenario combination
5. **Given** a run has been started, **When** I am redirected, **Then** I see the run detail page with "Pending" or "Running" status
6. **Given** I start a run, **When** jobs are created, **Then** each job includes the definition snapshot and model version information

---

### User Story 2 - Monitor Run Progress (Priority: P1)

As a researcher, I need to see real-time progress of my running evaluations so that I know how long until completion and can identify any issues early.

**Why this priority**: Core functionality - without progress visibility, users cannot estimate completion time or detect failures, leading to poor UX and wasted time.

**Independent Test**: Start a run, observe progress bar/counter updating every 5 seconds, verify counts match actual job completions.

**Acceptance Scenarios**:

1. **Given** I am viewing an active run, **When** I observe the page, **Then** I see a progress indicator showing completed/total tasks
2. **Given** a run is in progress, **When** 5 seconds pass, **Then** the progress updates automatically (polling)
3. **Given** a run has failures, **When** I view the progress, **Then** I see the count of failed tasks distinctly from completed tasks
4. **Given** I am viewing run progress, **When** I see task breakdown, **Then** I can see progress per model (e.g., "GPT-4: 45/100, Claude: 38/100")
5. **Given** a run completes all tasks, **When** the final poll occurs, **Then** the status changes to "Completed" and polling stops
6. **Given** I navigate away and return, **When** I view the run, **Then** I see current progress state (not stale data)

---

### User Story 3 - View Run Results (Priority: P1)

As a researcher, I need to view the results of completed evaluations so that I can understand how different AI models responded to my scenarios.

**Why this priority**: Core functionality - viewing results is the payoff for running evaluations. Without this, the entire system provides no value.

**Independent Test**: View a completed run, verify results table shows scores per model, verify individual transcript data is accessible.

**Acceptance Scenarios**:

1. **Given** a run has completed, **When** I view the run detail page, **Then** I see a results summary with per-model scores
2. **Given** I am viewing results, **When** I look at the summary table, **Then** I see each model with its overall score/win rate
3. **Given** I am viewing results, **When** I expand a model row, **Then** I see per-scenario breakdowns
4. **Given** I want to see raw data, **When** I click on a specific transcript, **Then** I can view the full conversation
5. **Given** results are displayed, **When** I look at the data, **Then** I see model version information (e.g., "gemini-1.5-pro-002")
6. **Given** I am viewing a transcript, **When** the page loads, **Then** the `lastAccessedAt` timestamp is updated

---

### User Story 4 - Export Results as CSV (Priority: P1)

As a researcher, I need to export run results as CSV so that I can analyze the data in external tools like Jupyter notebooks, R, or pandas.

**Why this priority**: Critical for Phase 1 - CSV export enables team to work with data immediately using their preferred analysis tools, unblocking analysis while we build more features.

**Independent Test**: View a completed run, click "Export CSV", verify downloaded file contains expected columns and all result rows.

**Acceptance Scenarios**:

1. **Given** I am viewing a completed run, **When** I look for export options, **Then** I see an "Export CSV" button
2. **Given** I click "Export CSV", **When** the export completes, **Then** I download a CSV file with run results
3. **Given** I open the exported CSV, **When** I examine columns, **Then** I see: scenario_id, model_id, model_version, score, decision, timestamp
4. **Given** the run has many transcripts, **When** I export, **Then** all transcripts are included (not just visible ones)
5. **Given** I want to analyze in pandas, **When** I load the CSV, **Then** the data types are appropriate (numbers as numbers, dates as ISO strings)
6. **Given** I export results, **When** the download starts, **Then** the filename includes run ID and date (e.g., `run_abc123_2025-12-07.csv`)

---

### User Story 5 - Browse Run Dashboard (Priority: P2)

As a researcher, I need to see all my runs in a dashboard so that I can find previous evaluations and track what's currently running.

**Why this priority**: Important for organization but users can bookmark run URLs initially. Becomes critical as run count grows.

**Independent Test**: Navigate to Runs page, verify all runs are listed with status, verify filtering works.

**Acceptance Scenarios**:

1. **Given** I am logged in, **When** I navigate to the Runs tab, **Then** I see a list of all runs sorted by creation date (newest first)
2. **Given** runs exist, **When** I view the list, **Then** each run shows: definition name, status, progress, creation date
3. **Given** I am viewing runs, **When** I filter by status (Running, Completed, Failed), **Then** only matching runs are shown
4. **Given** I click on a run, **When** I navigate, **Then** I go to the run detail page
5. **Given** no runs exist, **When** I view the Runs page, **Then** I see an empty state with a CTA to create a run
6. **Given** runs are loading, **When** I view the page, **Then** I see a loading skeleton

---

### User Story 6 - Pause and Resume Runs (Priority: P2)

As a researcher, I need to pause running evaluations and resume them later so that I can manage API costs or prioritize other work.

**Why this priority**: Important for cost control but runs can complete unattended. Becomes critical for expensive or long-running evaluations.

**Independent Test**: Start a run, click Pause, verify no new jobs execute, click Resume, verify jobs continue processing.

**Acceptance Scenarios**:

1. **Given** a run is in "Running" status, **When** I view the run, **Then** I see a "Pause" button
2. **Given** I click "Pause", **When** the action completes, **Then** the run status changes to "Paused"
3. **Given** a run is paused, **When** I observe the queue, **Then** no new jobs for this run are processed
4. **Given** a run is paused, **When** I view the run, **Then** I see a "Resume" button
5. **Given** I click "Resume", **When** the action completes, **Then** the run status changes to "Running" and jobs continue
6. **Given** a paused run has completed jobs, **When** I resume, **Then** those results are preserved and only remaining jobs are processed

---

### User Story 7 - Cancel Runs (Priority: P2)

As a researcher, I need to cancel a running evaluation so that I can stop wasted processing when I realize the definition is wrong.

**Why this priority**: Important for cost control and error recovery. Without cancel, users must wait for completion or leave broken runs in the system.

**Independent Test**: Start a run, click Cancel, verify run status changes to Cancelled, verify no further jobs are processed.

**Acceptance Scenarios**:

1. **Given** a run is in "Running" or "Paused" status, **When** I view the run, **Then** I see a "Cancel" button
2. **Given** I click "Cancel", **When** prompted for confirmation, **Then** I must confirm the cancellation
3. **Given** I confirm cancellation, **When** the action completes, **Then** the run status changes to "Cancelled"
4. **Given** a run is cancelled, **When** I view results, **Then** I can see partial results from completed jobs
5. **Given** a run is cancelled, **When** I check the queue, **Then** pending jobs for this run are removed
6. **Given** a run is cancelled, **When** I view the run, **Then** I cannot pause/resume/cancel again

---

### User Story 8 - Re-run Against Different Model Version (Priority: P3)

As a researcher, I need to re-run a scenario against a newer model version so that I can compare how model updates affect value priorities.

**Why this priority**: Nice to have - enables valuable model version comparisons but researchers can manually create new runs initially.

**Independent Test**: View a completed run, click "Re-run", select a different model version, start run, verify new run references original.

**Acceptance Scenarios**:

1. **Given** I am viewing a completed run, **When** I look for re-run options, **Then** I see a "Re-run" button
2. **Given** I click "Re-run", **When** the dialog opens, **Then** I see the original model configuration with version options
3. **Given** I am configuring a re-run, **When** I select a different model version, **Then** I can start the run with the new version
4. **Given** a re-run is created, **When** I view the new run, **Then** I see it references the original run as "parent"
5. **Given** re-runs exist, **When** I view a run, **Then** I can see related runs (parent/children) in the UI
6. **Given** I want to compare versions, **When** I have both runs complete, **Then** I can see them side-by-side (basic view)

---

## Edge Cases

### Run Creation Edge Cases
- **Definition with no dimensions**: Create run anyway (single scenario)
- **Definition with many scenarios (1000+)**: Show warning about cost/time, allow proceeding
- **No models selected**: Validation prevents starting run
- **Model API key missing**: Show error before run starts, not during
- **Rapid "Start Run" clicks**: Debounce, prevent duplicate runs

### Progress Monitoring Edge Cases
- **All jobs fail**: Show "Failed" status with error summary
- **Partial failures**: Show "Completed with errors" status
- **Long-running jobs (timeout)**: Show jobs as timed out after 5 minutes
- **Browser closed during run**: Run continues, progress visible on return
- **Network disconnection**: Resume polling when reconnected, show stale indicator

### Results Edge Cases
- **No completed transcripts**: Show "No results yet" instead of empty table
- **Missing model version**: Display "unknown" with data migration note
- **Transcript content very long**: Truncate with "Show more" option
- **Special characters in responses**: Handle properly in display and CSV

### Export Edge Cases
- **Very large export (10K+ rows)**: Show progress indicator, don't timeout
- **Export during active run**: Include only completed transcripts, note partial
- **Non-ASCII characters**: UTF-8 encoding with BOM for Excel compatibility
- **Empty run (all failed)**: Export with headers only, no data rows

### Pause/Resume/Cancel Edge Cases
- **Pause with jobs in progress**: Jobs complete, no new ones start
- **Resume immediately after pause**: Should work (idempotent)
- **Cancel with jobs in progress**: Jobs may complete but results are included
- **Network error during pause**: Retry with clear error message
- **Concurrent pause/cancel**: Last action wins, UI reflects final state

### System Health Edge Cases
- **No API keys configured**: Show clear message with setup instructions
- **API key invalid/expired**: Show error from provider with troubleshooting steps
- **Worker process crashed**: Show offline status, suggest restart command
- **Database connection lost**: Show error, prevent run creation
- **Partial provider availability**: Allow runs with available providers only

---

## Functional Requirements

### System Health & Validation (US0)
- **FR-000a**: System MUST display LLM provider status in Settings (configured, connected, error)
- **FR-000b**: System MUST test provider connectivity via health check endpoint
- **FR-000c**: System MUST display queue worker status (online/offline)
- **FR-000d**: System MUST display expanded scenarios for a definition with dimension values
- **FR-000e**: System MUST allow viewing full prompt text for each expanded scenario
- **FR-000f**: System MUST validate Python worker health before first run
- **FR-000g**: System MUST provide a "Test Run" capability to validate end-to-end flow

### Run Creation
- **FR-001**: System MUST allow creating a run by selecting a definition and one or more target models
- **FR-002**: System MUST allow selecting specific model versions when available (e.g., `gemini-1.5-pro-002`)
- **FR-003**: System MUST snapshot the definition content when creating a run (stored in each transcript)
- **FR-004**: System MUST queue one `probe_scenario` job per model-scenario combination
- **FR-005**: System MUST record `model_id` and `model_version` for each transcript
- **FR-006**: System MUST prevent creating runs with no models selected

### Progress Tracking
- **FR-007**: System MUST poll for progress updates every 5 seconds for active runs
- **FR-008**: System MUST display progress as completed/total with percentage
- **FR-009**: System MUST show per-model progress breakdown
- **FR-010**: System MUST show failed task count separately from completed
- **FR-011**: System MUST update run status to "Completed" when all jobs finish
- **FR-012**: System MUST stop polling when run reaches terminal state (Completed, Failed, Cancelled)

### Results Viewing
- **FR-013**: System MUST display results table with per-model scores when run completes
- **FR-014**: System MUST allow viewing individual transcript details
- **FR-015**: System MUST show model version in results display
- **FR-016**: System MUST update `lastAccessedAt` when viewing transcripts or run details

### CSV Export
- **FR-017**: System MUST provide CSV export for completed runs
- **FR-018**: System MUST include columns: scenario_id, model_id, model_version, decision, timestamp, run_id
- **FR-019**: System MUST use UTF-8 encoding with BOM for Excel compatibility
- **FR-020**: System MUST generate filename with run ID and export date
- **FR-021**: System MUST include all transcripts, not just visible ones

### Run Dashboard
- **FR-022**: System MUST list all runs sorted by creation date descending
- **FR-023**: System MUST display for each run: definition name, status, progress, created date
- **FR-024**: System MUST allow filtering by status (Running, Completed, Failed, Cancelled, Paused)
- **FR-025**: System MUST link to definition from run list

### Run Controls
- **FR-026**: System MUST allow pausing running runs
- **FR-027**: System MUST allow resuming paused runs
- **FR-028**: System MUST allow cancelling running or paused runs
- **FR-029**: System MUST require confirmation before cancelling
- **FR-030**: System MUST preserve completed results when cancelling

### Access Tracking
- **FR-031**: System MUST update `lastAccessedAt` on runs when viewed
- **FR-032**: System MUST update `lastAccessedAt` on transcripts when viewed
- **FR-033**: System MUST update `lastAccessedAt` on definitions when starting a run

### Re-run Capability
- **FR-034**: System MUST allow creating a new run from a completed run with different model versions
- **FR-035**: System MUST link re-runs to parent run via `parent_run_id`
- **FR-036**: System MUST show related runs (parent/children) on run detail page

---

## Success Criteria

- **SC-001**: Users can start a run and see results within expected timeframe based on scenario count
- **SC-002**: Progress updates appear within 6 seconds of job completion (5s poll + 1s buffer)
- **SC-003**: CSV export downloads complete within 10 seconds for runs with up to 1000 transcripts
- **SC-004**: Pause action takes effect within 10 seconds (no new jobs started after pause)
- **SC-005**: Run creation workflow completes in under 30 seconds for typical configuration
- **SC-006**: Results page loads in under 2 seconds for runs with up to 1000 transcripts
- **SC-007**: 80% code coverage on new components and services (per constitution)
- **SC-008**: All new files under 400 lines (per constitution)
- **SC-009**: No `any` types in TypeScript code (per constitution)

---

## Key Entities

### Run (existing, enhanced)
```
Run {
  id: string                    // cuid
  definitionId: string          // Reference to definition
  parentRunId: string | null    // For re-runs, reference to original
  status: RunStatus             // 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  runType: string               // 'full' | 'sample' | 'rerun'

  // Timestamps
  createdAt: Date
  queuedAt: Date | null         // When jobs were queued
  startedAt: Date | null        // First job started
  completedAt: Date | null      // All jobs finished
  lastAccessedAt: Date | null   // Updated on read

  // Progress
  progress: {
    total: number
    completed: number
    failed: number
  }

  // Config snapshot
  config: {
    models: ModelConfig[]
    options: RunOptions
  }
}

ModelConfig {
  modelId: string               // e.g., "gemini-1.5-pro"
  modelVersion: string | null   // e.g., "gemini-1.5-pro-002"
  providerId: string            // e.g., "google"
}

RunOptions {
  samplePercentage: number      // 100 for full runs
  sampleSeed: number | null     // For reproducibility
}
```

### Transcript (existing, key fields)
```
Transcript {
  id: string
  runId: string
  scenarioId: string

  // Model versioning
  modelId: string               // Provider model name
  modelVersion: string | null   // Specific version

  // Definition snapshot
  definitionSnapshot: object    // Copy of definition at run time

  // Content
  content: string               // Full markdown transcript
  turns: Turn[]                 // Structured turn data

  // Metrics
  turnCount: number
  wordCount: number
  tokenCount: number

  // Timestamps
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
  durationMs: number | null
  lastAccessedAt: Date | null

  // Extracted results (for analysis)
  decision: string | null       // Extracted decision
  extractedFeatures: object     // Key values mentioned, sentiment, etc.
}
```

### Available Models (reference data)
```
AvailableModel {
  id: string                    // e.g., "gemini-1.5-pro"
  providerId: string            // e.g., "google"
  displayName: string           // e.g., "Gemini 1.5 Pro"
  versions: string[]            // e.g., ["gemini-1.5-pro-001", "gemini-1.5-pro-002"]
  defaultVersion: string | null
  isAvailable: boolean          // API key configured
}
```

---

## Assumptions

1. **Queue system is working** - Stage 5 completed, PgBoss jobs can be queued and processed
2. **Python workers are functional** - Stage 6 completed, `probe_scenario` jobs execute successfully
3. **Definition UI is complete** - Stage 8 completed, users can create and view definitions
4. **Model configuration is centralized** - Available models are configured server-side with API keys
5. **Single-user runs** - No real-time collaboration on runs; one user creates/monitors each run
6. **Polling is acceptable** - 5-second polling provides sufficient UX (per product spec)
7. **CSV is sufficient** - More export formats (Parquet, JSON Lines) deferred to Stage 15
8. **Basic results only** - Detailed analysis visualizations are Stage 11; this stage shows raw scores

---

## Dependencies

### Requires from Previous Stages
- Authentication system (Stage 4) - Already implemented
- Queue system with PgBoss (Stage 5) - Already implemented
- Python workers with LLM adapters (Stage 6) - Already implemented
- Frontend foundation with urql (Stage 7) - Already implemented
- Definition management UI (Stage 8) - Already implemented

### New Backend Requirements
- Run mutations: `createRun`, `pauseRun`, `resumeRun`, `cancelRun`
- Run queries: `run`, `runs` with filtering
- Transcript queries: `transcripts` for a run, `transcript` by ID
- CSV export endpoint: `GET /api/export/run/:id/csv`
- Available models query: `availableModels`
- Access tracking middleware for lastAccessedAt updates

### Existing Backend to Leverage
- PgBoss job queuing (`probe_scenario` job type)
- Python probe worker (stdin/stdout JSON interface)
- Transcript creation in job completion handler

---

## Constitution Validation

### Compliance Check

| Requirement | Status | Notes |
|-------------|--------|-------|
| Files < 400 lines | PASS | Spec splits into focused components (RunForm, RunProgress, RunResults, etc.) |
| No `any` types | PASS | SC-009 explicitly requires this |
| Test coverage 80% minimum | PASS | SC-007 explicitly requires this |
| Structured logging | PASS | Run service will use pino logger |
| Type safety | PASS | urql provides typed GraphQL operations; Prisma for DB |
| Custom error classes | PASS | Will use existing AppError pattern |

### Folder Structure Compliance
Per constitution, should follow:
```
apps/api/src/
├── graphql/
│   └── runs/
│       ├── mutations.ts      # createRun, pauseRun, etc.
│       ├── queries.ts        # run, runs
│       └── types.ts          # Run GraphQL type
├── services/
│   └── runs/
│       ├── index.ts          # Re-exports
│       ├── create.ts         # Run creation logic
│       ├── control.ts        # Pause/resume/cancel
│       ├── query.ts          # Run queries
│       └── export.ts         # CSV export
├── routes/
│   └── export.ts             # CSV download endpoint

apps/web/src/
├── components/
│   └── runs/
│       ├── RunForm.tsx       # Configuration form
│       ├── RunProgress.tsx   # Progress display
│       ├── RunResults.tsx    # Results table
│       ├── RunControls.tsx   # Pause/resume/cancel buttons
│       └── TranscriptViewer.tsx
├── hooks/
│   ├── useRuns.ts
│   ├── useRun.ts
│   ├── useRunProgress.ts     # Polling hook
│   └── useAvailableModels.ts
├── pages/
│   ├── Runs.tsx             # Dashboard
│   └── RunDetail.tsx        # Single run view
```

**VALIDATION RESULT: PASS** - Spec addresses all constitutional requirements.

---

## Out of Scope

- Real-time WebSocket progress (polling is acceptable per product spec)
- Advanced export formats (Parquet, JSON Lines - Stage 15)
- Cost estimation before run (Stage 10)
- Auto-analysis on completion (Stage 11)
- Visualizations and charts (Stage 11)
- Run comparison view (Stage 13)
- Batch/sampling configuration (Stage 16)
- Experiment linking (Stage 10)

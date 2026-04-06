# Feature 028 — Stall Watchdog

**Branch**: feat/028-stall-watchdog
**Created**: 2026-03-22
**Status**: Reviewed (post-checkpoint reconciliation)
**Input**: Detect and surface RUNNING runs that have stopped making per-model progress, replacing the existing (broken) billing/budget failure detection.

---

## Background

During a production incident, 14 PAIRED_BATCH runs stalled because xAI Grok ran out of credits. The runs had active/retrying PgBoss jobs (so orphan detection never fired), but no probes were completing. The existing "budget failure banner" in RunDetail never surfaced the issue because it relied on finding billing keywords in failed probe records — which never materialized since the jobs kept cycling through retries. The stall lasted until credits were manually restored with no operator visibility. This feature closes that gap.

---

## User Stories

### User Story 1 — Operator sees a warning when a run stalls (Priority: P1)

An operator is monitoring a long-running batch. One provider exhausts its API credits. The other providers keep completing probes but that provider's models make no progress. The operator needs to know something is wrong before they check the run hours later and find it incomplete.

**Why this priority**: Without this, stalls are invisible until a human notices incomplete results or a run never completes. This is the core safety net.

**Independent Test**: Start a run with two models. Block one model's probes (simulate provider failure). After 3 minutes, confirm a warning appears in server logs and the RunDetail page shows a stall banner listing the blocked model.

**Acceptance Scenarios**:

1. **Given** a RUNNING run where model `grok-4-0709` has had no new *successful* probe completions for 3 minutes AND still has pending or active jobs, **When** the scheduler tick runs, **Then** `grok-4-0709` is added to the run's `stalledModels` list AND a `warn`-level log entry is written identifying the run ID and stalled model IDs.

2. **Given** a run's `stalledModels` list is non-empty and the run is still RUNNING, **When** the RunDetail page is loaded, **Then** a warning banner is displayed listing the stalled model IDs.

3. **Given** a RUNNING run where all models are actively completing probes, **When** the scheduler tick runs, **Then** no stall is detected and `stalledModels` remains empty.

4. **Given** a RUNNING run where a model is failing every probe (but still retrying), **When** the scheduler tick runs, **Then** the model IS flagged as stalled — failed ProbeResult records do not count as progress.

---

### User Story 2 — Stall banner clears automatically when the run resumes (Priority: P1)

An operator tops up API credits for a blocked provider. The stalled models start completing probes again. The operator expects the warning to go away on its own without any manual action.

**Why this priority**: A stale warning that doesn't clear is noise. Operators lose trust in alerts that don't self-heal.

**Independent Test**: Set a model to stalled in the DB. Then insert a new successful ProbeResult for that model with `createdAt = now()`. Confirm the next scheduler tick removes the model from `stalledModels`.

**Acceptance Scenarios**:

1. **Given** model `grok-4-0709` is in `stalledModels` for a run, **When** a new successful probe completes for `grok-4-0709` and the next scheduler tick runs, **Then** `grok-4-0709` is removed from `stalledModels`.

2. **Given** all stalled models have resumed progress, **When** the next scheduler tick runs, **Then** `stalledModels` is empty and the UI banner is no longer shown.

---

### User Story 3 — Misleading billing detection is removed (Priority: P1)

The existing "budget failure banner" code scans failed probe records for billing keywords. It never fires for the cycling-retries pattern that caused the production incident. Keeping it implies the system detects billing issues when it does not.

**Why this priority**: Dead code that creates false confidence in a safety feature is worse than no code. Removing it is a correctness fix, not a cleanup.

**Independent Test**: Verify the following are deleted: `getBudgetFailureBanner()`, `isBudgetFailure()`, and any UI text or banner referencing budget or billing failure in RunDetail. Confirm the TypeScript build passes after removal.

**Acceptance Scenarios**:

1. **Given** a run with failed probes containing billing-related error messages, **When** RunDetail is loaded, **Then** no billing/budget banner appears (the detection code no longer exists).

2. **Given** the codebase after this feature, **When** `npm run build` is run, **Then** there are no TypeScript errors and no references to `getBudgetFailureBanner` or `isBudgetFailure` remain.

---

## Edge Cases

- **Run with no probes yet**: A RUNNING run that just started has no ProbeResult rows. This is not a stall — only flag a model if at least one *successful* probe has completed for it AND there are still pending/active jobs.
- **Model fully finished**: A model where all probes are done has no pending/active jobs. It MUST NOT be flagged as stalled even if its last completion was long ago.
- **Entire run stalls**: All models stall simultaneously. All model IDs appear in `stalledModels`. The banner lists all of them.
- **PAIRED_BATCH runs**: Each model is tracked independently. One model stalling does not affect others' stall status. The plan must verify that per-model job counts can be isolated from paired job structures.
- **Run completes normally**: When status transitions to COMPLETED or FAILED, `stalledModels` MUST be cleared to empty (stale data should not persist past the run).
- **PAUSED / RESUMED**: When a run is paused, `stalledModels` is cleared. When it resumes (transitions back to RUNNING), stall detection MUST NOT fire on the first scheduler tick — the last successful completion will be older than 3 minutes simply due to the pause. A grace period of one full scheduler cycle (5 minutes) must pass after the RUNNING transition before detection is active for that run.
- **Scheduler keeps running during a stall**: The recovery scheduler shuts off after 1 hour of no new run starts. A run that stalls but has no new runs created will cause the scheduler to eventually go dormant. To prevent this, stall detection MUST call `signalRunActivity()` whenever it detects at least one stalled model, keeping the scheduler alive as long as the stall persists.
- **Log deduplication**: The warn log MUST only fire when a model transitions from not-stalled to stalled (new stall onset), not on every scheduler tick while already stalled.
- **Persistent failures, not just slow models**: The 3-minute threshold is calibrated for the normal probe completion time (<60 seconds). Models that legitimately take longer than 3 minutes per probe may produce false positives. This is a known limitation. The plan should verify this is not a problem for any model currently in use.

---

## Functional Requirements

- **FR-001**: System MUST detect a per-model stall when a model has at least one prior *successful* `ProbeResult` completion, still has pending or active PgBoss jobs, and has had no new successful `ProbeResult` completion in the last 3 minutes. Failed `ProbeResult` records (status ≠ COMPLETED) MUST NOT reset the stall timer. (Supports US1)
- **FR-002**: System MUST write the list of currently-stalled model IDs to a `stalledModels` field on the Run record after each detection pass. (Supports US1, US2)
- **FR-003**: System MUST clear a model from `stalledModels` when it resumes successful probe completions. (Supports US2)
- **FR-004**: System MUST emit a `warn`-level server log entry only when a model newly enters stalled state (was not in `stalledModels` on the prior tick). Repeat ticks while already stalled MUST NOT re-emit the log. (Supports US1)
- **FR-005**: System MUST expose `stalledModels` as a string array field on the GraphQL `Run` type. (Supports US1, US2)
- **FR-006**: The RunDetail page MUST display a warning banner when `stalledModels` is non-empty and run status is `RUNNING`. The banner MUST list the stalled model IDs. (Supports US1, US2)
- **FR-007**: System MUST remove `getBudgetFailureBanner()`, `isBudgetFailure()`, and all associated billing-keyword detection code from RunDetail. (Supports US3)
- **FR-008**: Stall detection MUST only evaluate runs in `RUNNING` status. Completed, failed, cancelled, and paused runs MUST be skipped. (Supports US1)
- **FR-009**: When a run transitions out of `RUNNING` status (to any terminal or paused state), `stalledModels` MUST be reset to an empty array at the time of the transition. (Supports US2 edge case)
- **FR-010**: The `stalledModels` field MUST be included in the existing `RUN_FRAGMENT` GraphQL fragment so all run queries automatically include it. (Supports US1, US2)
- **FR-011**: When stall detection finds at least one stalled model during a scheduler pass, it MUST call `signalRunActivity()` to extend the recovery scheduler's activity window and prevent the scheduler from going dormant while stalls persist. (Supports US1 edge case)
- **FR-012**: Stall detection MUST skip a RUNNING run that transitioned from PAUSED within the last scheduler cycle (grace period), to avoid false positives immediately after resume. (Supports edge case)

---

## Success Criteria

- **SC-001**: A stall is surfaced in server logs and visible in the UI within 8 minutes of onset (one scheduler tick after the 3-minute threshold is crossed).
- **SC-002**: When a stall resolves, the UI banner disappears within 8 minutes (next scheduler tick after models resume successful completions).
- **SC-003**: Normal runs (all models completing probes continuously) produce zero stall detections and zero stall log entries.
- **SC-004**: No references to `getBudgetFailureBanner`, `isBudgetFailure`, or billing-keyword scanning remain in the codebase after this feature ships.
- **SC-005**: TypeScript build passes with zero errors after all changes.

---

## Key Entities

### Run (modified)

New field added:

| Field | Type | Description |
|-------|------|-------------|
| `stalledModels` | `String[]` | Model IDs currently detected as stalled. Empty array when no stall. Cleared on run completion or pause. |

**Migration requirement**: The Prisma migration MUST define this column as `NOT NULL DEFAULT '{}'` (Postgres array) so existing runs default to an empty array rather than NULL.

Schema change requires a Prisma migration.

---

## Assumptions

- The `ProbeResult` table has a `modelId` column and a `createdAt` timestamp that can be used to find the most recent *successful* completion per model per run. The plan must confirm the exact column name and filtering condition for "successful" status.
- PgBoss job state (`retry`, `active`, `created`) can be queried per run AND per model ID. The existing `countJobsForRun()` queries the full run; the plan must verify whether it can be extended to scope by modelId, or a new query is needed.
- The 3-minute stall threshold is hardcoded. No configuration UI or environment variable override is needed at this time.
- The stall watchdog runs inside the existing recovery scheduler cycle — no new scheduler or interval is introduced.
- `stalledModels` is stored as a Postgres text array (`String[]` in Prisma), not JSON, since it is a flat list of IDs.
- The 8-minute detection latency (3-min threshold + 5-min scheduler tick) is acceptable for a log+alert-only feature.

---

## Known Limitations

- **Detection latency**: Up to 8 minutes from stall onset to UI visibility. Not suitable for real-time alerting.
- **Threshold vs. slow models**: The 3-minute threshold assumes probes complete in <60 seconds under normal conditions. If any model routinely exceeds 3 minutes, it will generate false stall reports. The plan should verify maximum observed probe durations.
- **Log flapping**: A model hovering near the 3-minute threshold could alternate between stalled/not-stalled across ticks, generating repetitive log entries. FR-004 suppresses duplicate onset logs but does not prevent rapid cycling.
- **Stale banner on recovery**: The UI banner persists for up to one scheduler cycle (~5 min) after credits are restored and probes resume.

---

## Constitution Validation

**Checked against `cloud/CLAUDE.md`:**

| Requirement | Status |
|-------------|--------|
| Type safety — no `any`, strict mode | PASS — all new fields will be typed |
| File size ≤ 400 lines per module | WARN — `recovery.ts` is already ~500 lines; the plan MUST extract stall detection into a new `stall-detection.ts` module |
| Small focused files | WARN — same as above |
| Test coverage ≥ 80% | PASS — all FRs map to unit-testable functions |
| Observable / loggable | PASS — FR-004 requires warn-level log on new stall onset |
| PRs via branch, never direct to main | PASS — feature branch specified |

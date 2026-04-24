# Feature 033 — Run State Reconciliation

**Branch**: feat/033-run-state-reconciliation
**Created**: 2026-04-23
**Status**: Draft

---

## Background

Many paired batch runs end as `COMPLETED` with silent partial failures: some probes never produced a transcript, some transcripts were never summarized, and the run's `progress` JSONB counters disagree with the authoritative `ProbeResult` and `Transcript` rows. Root cause analysis lives in `docs/backend/paired-batch-run-flow.md` (sections 11 and 12).

The mechanism: today, workers write to two JSONB counters on `Run` — `progress` (probe outcomes) and `summarizeProgress` (summarization outcomes). Completion decisions read those counters. The counters drift vs. the authoritative tables in several ways:

1. **Stranded transcripts.** Transcripts that commit after the 5-second settle window in `progress.ts:224` are never queued for summarization; their `summarizedAt` stays `NULL` forever. The run still flips to `COMPLETED`.
2. **Read-then-write race.** `progress.ts` increments the counter in one SQL statement, then reads and conditionally flips status in a separate statement. Two handlers finishing simultaneously can both attempt the transition.
3. **Dead-letter / late-success double-count.** When a probe is dead-lettered (`JOB_EXPIRED`) and a late worker finally succeeds, the `ProbeResult` upsert flips `FAILED → SUCCESS` but both counter increments already fired — so `completed + failed > total`.
4. **No partial-success signal.** Runs with `progress.failed > 0` still transition to `COMPLETED` silently. Downstream analysis treats them as clean.
5. **Pair asymmetry invisible.** Paired batch runs share a `jobChoiceBatchGroupId` in `Run.config`. Today there is no signal when one side of the pair succeeds at 98% and the other at 40% — the partial failure is only visible by running analysis and noticing nothing lines up.
6. **Model-specific shortfall invisible.** When a single model (e.g., Mistral) systemically fails to produce transcripts, no alert surfaces — the run just has more failures than expected.

This feature replaces the drift-prone JSONB counters with reads off the authoritative tables, moves completion to an atomic compare-and-swap, and adds a periodic reconciliation sweep that auto-completes stuck runs and records anomalies.

Discovery: all six design choices are recorded in `state.json` discovery. Delivery path is Feature Factory. Counter approach is hard replacement (no cache). Migration is hard cutover (no dual-write). Completion stays event-driven with the sweep as a safety net. Anomalies auto-surface to a new `RunAnomaly` table.

---

## User Stories

### US-1 (P0): Progress counts match reality

**As an** operator investigating a run,
**I want** the `progress` and `summarizeProgress` numbers I see in GraphQL and the UI to equal the real count of `ProbeResult` and `Transcript` rows for that run,
**so that** I can trust the run's state without cross-checking the database by hand.

**Acceptance criteria:**
- For every existing run, a GraphQL read returns `progress.completed` equal to `COUNT(ProbeResult WHERE runId=run.id AND status='SUCCESS')` and `progress.failed` equal to `COUNT(ProbeResult WHERE runId=run.id AND status='FAILED')`.
- For every existing run, `summarizeProgress.completed` equals `COUNT(Transcript WHERE runId=run.id AND deletedAt IS NULL AND summarizedAt IS NOT NULL)` and `summarizeProgress.failed` equals the count of transcripts that hit terminal summarize failure (see Design).
- The JSONB counter values stored on the row may lag or mismatch; resolvers ignore them for `completed`/`failed`.

### US-2 (P0): No more counter-increment writes from handlers

**As the** probe and summarize handlers,
**I want** to stop writing `progress.completed`, `progress.failed`, `summarizeProgress.completed`, and `summarizeProgress.failed` on every job,
**so that** the counters cannot drift out of sync with authoritative tables.

**Acceptance criteria:**
- `applyProgressDelta()` (or the code that mutates those JSONB counters) is removed from `probe-scenario/handler.ts`, `summarize-transcript.ts`, and `summarize-persistence.ts`.
- `Run.progress.total` and `Run.summarizeProgress.total` are still written **once at launch** by the job-planner (those values never change and are not drift-prone).
- No production code path calls `jsonb_set` on `progress.completed`, `progress.failed`, `summarizeProgress.completed`, or `summarizeProgress.failed`.

### US-3 (P0): Atomic SUMMARIZING → COMPLETED transition

**As the** completion path,
**I want** the status flip from `SUMMARIZING` to `COMPLETED` (and from `RUNNING` to `SUMMARIZING`) to be a single conditional UPDATE that is driven by authoritative row counts,
**so that** two concurrent handlers cannot both believe they are the last completer.

**Acceptance criteria:**
- `maybeCompleteRun()` executes a single SQL statement of the form: `UPDATE Run SET status='COMPLETED', completedAt=NOW() WHERE id=$1 AND status='SUMMARIZING' AND <derived-count predicate>`.
- If the UPDATE returns 0 rows affected, the caller treats it as "someone else won" and does not run post-completion side effects.
- If the UPDATE returns 1 row, the caller runs the existing post-completion side effects (analysis, token stats, balance deduction) exactly once.
- The same atomic pattern is used for `RUNNING → SUMMARIZING` in event-driven completion.

### US-4 (P1): Event-driven completion still flips happy-path runs in seconds

**As the** probe and summarize handlers,
**I want** each terminal outcome (probe success/fail, summarize success/fail) to trigger `maybeCompleteRun()` immediately,
**so that** a healthy run's state transitions happen in seconds, not minutes.

**Acceptance criteria:**
- After every terminal outcome, the handler calls `maybeCompleteRun(runId)` using the derived-count query.
- For a run where every probe succeeds and every summarize succeeds, the run reaches `COMPLETED` status within seconds of the last handler finishing (no reliance on the sweep).

### US-5 (P0): Reconciliation sweep auto-heals stuck runs

**As the** system,
**I want** a periodic job that scans non-terminal runs and (a) queues summarize jobs for stranded transcripts, (b) retries the atomic completion flip when the event-driven path missed it,
**so that** runs no longer require human `recover_run` intervention to reach a clean terminal state.

**Acceptance criteria:**
- A new `run_state_reconcile` job runs on a singleton, periodic cadence (every recovery-scheduler tick, currently 5 minutes — see Design).
- For each non-terminal run (`RUNNING`, `SUMMARIZING`), the handler: queues summarize jobs for any `Transcript` rows where `summarizedAt IS NULL AND deletedAt IS NULL`; attempts the `maybeCompleteRun()` flip; records anomalies (US-6).
- The handler is idempotent: running it twice in a row on the same run produces the same state.
- A run that was stranded in `SUMMARIZING` with one unsummarized transcript will reach `COMPLETED` within one sweep interval once that transcript summarizes.

### US-6 (P0): Anomalies surface to a queryable `RunAnomaly` table

**As an** operator,
**I want** the reconciliation sweep to record structured anomaly rows for the six classes of silent partial failure,
**so that** I can query "which runs had partial failures and why" without reading logs.

**Acceptance criteria:**
- A new `RunAnomaly` table is created with columns: `id`, `runId`, `type` (enum), `subject` (NOT NULL string, default `""` — `modelId` for per-model shortfalls, pair group id for asymmetry, `""` for run-level anomalies), `details` (JSONB), `firstSeenAt`, `lastSeenAt`, `resolvedAt` (nullable), `acknowledgedByUserId` (nullable).
- Unique constraint on `(runId, type, subject)` so re-running the sweep updates `lastSeenAt` instead of creating duplicates. Empty-string default on `subject` ensures the PostgreSQL unique constraint dedupes run-level anomalies (NULL would not).
- The sweep detects and records all six anomaly types at launch (see "Anomaly Catalog" below). `PROBE_COUNT_OVERFLOW` was replaced with `SCHEDULED_COUNT_MISMATCH` during spec review.
- Anomalies are readable via a new GraphQL query on `Run` (e.g., `run.anomalies: [RunAnomaly!]!`).
- No UI polish in this feature — just the data surface.

### US-7 (P1): In-flight runs at deploy time reach a correct terminal state

**As the** system,
**I want** runs that are `RUNNING` or `SUMMARIZING` at the moment of deploy to continue to a correct terminal state under the new rules,
**so that** the cutover does not cause double-completion, lost data, or permanently stuck runs.

**Acceptance criteria:**
- Any in-flight probe/summarize job whose handler runs after deploy succeeds under the new no-counter-write code path.
- Any run that was `SUMMARIZING` before deploy reaches `COMPLETED` within one sweep interval after deploy if its derived counts satisfy the completion predicate.
- No run flips to `COMPLETED` twice (the atomic CAS prevents it).
- No run that previously flipped to `COMPLETED` regresses.

---

## What is NOT in scope

- Provider idempotency keys (meta-fix #2 prerequisite — separate PR).
- Provider health tracker / circuit breaker (meta-fix #2).
- Retry-After header handling.
- Non-retryable transcript-shape fix at `probe-scenario/handler.ts:214`.
- UI polish beyond exposing `RunAnomaly` via GraphQL.
- Changes to pair grouping at launch time.
- `JOB_EXPIRED` rate alerting and cost-deviation anomalies (deferred; belong with meta-fix #2).
- `maxBudgetUsd` enforcement (not actively used in practice).
- Dropping the `Run.progress` / `Run.summarizeProgress` JSONB columns from the schema (keep them; just stop writing to `.completed` / `.failed`). Column removal is a follow-up.
- Backfilling `RunAnomaly` rows for historical runs — the sweep only records anomalies for non-terminal runs going forward. A one-shot backfill is a follow-up.
- CLAUDE.md, AGENTS.md, cloud/CLAUDE.md, cloud/AGENTS.md, MEMORY.md, .gitignore, or any file not listed in the Files in Scope section.

---

## Design

### Derived progress query

A single service-layer helper `computeRunProgress(runId)` returns:

```
{
  total: number,              // from Run.progress.total (written once at launch)
  completed: number,          // COUNT(ProbeResult WHERE runId = $1 AND status = 'SUCCESS' AND deletedAt IS NULL)
  failed: number,             // COUNT(ProbeResult WHERE runId = $1 AND status = 'FAILED' AND deletedAt IS NULL)
  summarizeTotal: number,     // derived on demand — see "Summarize total accounting" below
  summarizeCompleted: number, // COUNT(Transcript WHERE runId = $1 AND deletedAt IS NULL AND summarizedAt IS NOT NULL)
  summarizeFailed: number,    // see "Summarize failure accounting" below
}
```

**Soft-delete filter.** All `ProbeResult` and `Transcript` counts in the derived query include `deletedAt IS NULL`. The schema exposes `deletedAt` on both tables and soft-deleted rows must not influence run progress.

**Summarize total accounting.** Instead of pre-computing `summarizeProgress.total` at the `RUNNING → SUMMARIZING` transition (which re-introduces the original race — a slow-committing transcript would be left out of the denominator), the derived helper computes `summarizeTotal` on demand as `COUNT(Transcript WHERE runId=$1 AND deletedAt IS NULL)` each time it is called. This means the denominator grows if late transcripts arrive, and the `SUMMARIZING → COMPLETED` CAS (below) is the only authority on "are we done summarizing."

**Summarize failure accounting (MANDATORY — no option).** The existing handler calls `persistSummarizeFailure()` on terminal summarize failure and sets `summarizedAt = now()` plus `decisionText = "Summary failed..."` plus `decisionMetadata = NULL`. Under the new rules a transcript with `summarizedAt IS NOT NULL` is counted as summarized; keeping the old behavior would cause the new derived query to mis-count failures as successes **and** cause the SUMMARIZING → COMPLETED CAS (below) to fire prematurely.

The change:
- Add `summarizeFailedAt: DateTime?` to `Transcript`.
- `persistSummarizeFailure()` now writes `summarizeFailedAt = now()` and does **not** set `summarizedAt`. `decisionText` keeps the human-readable failure reason for operator debugging.
- Derived `summarizeCompleted` counts `summarizedAt IS NOT NULL AND summarizeFailedAt IS NULL`.
- Derived `summarizeFailed` counts `summarizeFailedAt IS NOT NULL`.
- `resolveSummarizeJob()` in `summarize-transcript.ts` treats a transcript as terminal when `summarizedAt IS NOT NULL OR summarizeFailedAt IS NOT NULL`. Without this, the sweep re-queues failure rows forever (livelock).
- `calculatePercentComplete()` (currently reads JSONB counters) is rewritten to consume `computeRunProgress(runId)` output. Any resolver that calls it gets the same derived numbers as the rest of the system.
- **Data backfill in the same migration** — see Files in Scope for the exact SQL.

**Migration brittleness acceptance.** The backfill uses `decision_text LIKE 'Summary failed%' AND decision_metadata IS NULL` to identify existing failure rows. This is a text-pattern match and is inherently brittle. We accept it because:
1. Both conditions together are the complete signature of `persistSummarizeFailure()` today — all success paths write a non-null `decisionMetadata` (verified against the current handler).
2. The backfill runs once at deploy; it does not need to be robust to future changes.
3. A more structured alternative (e.g., adding a boolean column before backfill) would require a two-phase deploy. The cost of that complexity is higher than the risk of the LIKE match.
  verification (this item is tracked in Residual Risks below): before merge, run the backfill WHERE clause as a `SELECT COUNT(*)` against a dev DB seeded with production-shaped data; confirm the count equals the number of known failure rows from recent logs and is zero on test rows with successful summaries.

### Completion CAS (compare-and-swap)

Replaces the read-then-write in `progress.ts:140` and the conditional `UPDATE` in `summarize-persistence.ts:123`. Two flavors:

```sql
-- RUNNING / PAUSED → SUMMARIZING (no pre-computed transcript denominator)
UPDATE runs
SET status = 'SUMMARIZING'
WHERE id = $runId
  AND status IN ('RUNNING', 'PAUSED')
  AND (SELECT COUNT(*) FROM probe_results
        WHERE run_id = $runId AND status IN ('SUCCESS', 'FAILED') AND deleted_at IS NULL) >= (progress->>'total')::int;
```

`PAUSED` is included in the predicate because the existing `determineStatus()` already flips a `PAUSED` run with all probes finished into `SUMMARIZING`; the new CAS must preserve that behavior.

**Not in scope: `PENDING → RUNNING` transition.** The current probe handler sets `startedAt` and clears `stalledModels` when the first probe completes on a `PENDING` run. That code path stays as-is; this feature does not rewrite it because the transition is not drift-prone (a single first-probe event decides it, not a cumulative counter).

```sql
-- SUMMARIZING → COMPLETED
UPDATE runs
SET status = 'COMPLETED',
    completed_at = NOW(),
    stalled_models = ARRAY[]::text[]
WHERE id = $runId
  AND status = 'SUMMARIZING'
  AND NOT EXISTS (
    SELECT 1 FROM transcripts
    WHERE run_id = $runId AND deleted_at IS NULL AND summarized_at IS NULL AND summarize_failed_at IS NULL
  );
```

Both UPDATEs return a rowCount. Caller uses `rowCount === 1` as "I won the race". Post-completion side effects (`triggerBasicAnalysis`, `queueComputeTokenStats`, `deductActualProviderBalancesForRun`) run only in the winner path.

**No pre-computed transcript denominator at the RUNNING → SUMMARIZING transition.** The original 5-second settle timeout existed because the code needed to pre-compute "how many transcripts are there" before transitioning. The new design removes that need: `SUMMARIZING → COMPLETED` succeeds only when there are zero unsummarized transcripts, regardless of how the transcript count changed during SUMMARIZING. Late transcripts that commit after the status flip simply delay the next successful CAS by one cycle.

**`Run.progress.total`.** Written once at launch. This is the probe denominator and never changes.

**`Run.summarizeProgress.total`.** No longer a persistent column value. `computeRunProgress` computes `summarizeTotal` by counting live `Transcript` rows on demand. The JSONB column's `total` field stays in the schema for backward compatibility but is ignored by resolvers.

### Event-driven trigger — unchanged call sites, new implementation

In `probe-scenario/handler.ts`, `probe-scenario/retry.ts`, and `summarize-transcript.ts`, every terminal outcome replaces `applyProgressDelta(...)` with a call to `maybeAdvanceRunStatus(runId)`.

**`maybeAdvanceRunStatus` control flow (unambiguous):**
1. Run the `RUNNING/PAUSED → SUMMARIZING` CAS UPDATE. Capture `rowCount`. If it returned 1, the run just entered `SUMMARIZING` — queue summarize jobs for all committed transcripts on the run (see "Summarize job fan-out at the status flip" below).
2. **Unconditionally** (regardless of the first CAS result) run the `SUMMARIZING → COMPLETED` CAS UPDATE. Capture `rowCount`. If it returned 1, run the post-completion side effects (`triggerBasicAnalysis`, `queueComputeTokenStats`, `deductActualProviderBalancesForRun`).

Both CAS UPDATEs are safe no-ops when their precondition is not met, so running the second one unconditionally has no cost when the run is not in `SUMMARIZING`. This matters for the summarize handler path: a summarize job starts with the run already in `SUMMARIZING`, so the first CAS is a no-op but the second must still run to potentially flip the run to `COMPLETED`.

**Summarize job fan-out at the RUNNING → SUMMARIZING transition.** When the first CAS wins, the caller enqueues a `summarize_transcript` job (singleton on `transcriptId`) for every `Transcript` row belonging to the run with `summarizedAt IS NULL AND summarizeFailedAt IS NULL AND deletedAt IS NULL`. This replaces the old 5-second settle + `queueSummarizeJobs()` path; the sweep's late-transcript rescue catches anything that commits after this fan-out.

**Stalled-model metadata reset.** The existing completion path clears `Run.stalledModels` when a run finishes. The `SUMMARIZING → COMPLETED` CAS UPDATE SET list includes `stalled_models = ARRAY[]::text[]` so downstream UI/alerting sees a clean slate after completion.

### Fast path for late transcripts

The existing probe handler has a branch that queues a summarize job immediately when a probe finishes and the run is already in `SUMMARIZING`. **This branch is preserved** to keep the happy path for late transcripts — the reconciliation sweep is a safety net, not the primary trigger for a single late transcript. Concretely, after `maybeAdvanceRunStatus` runs in the probe handler, if the run is `SUMMARIZING` and the just-produced transcript has `summarizedAt IS NULL`, the handler enqueues a `summarize_transcript` singleton for that transcript before returning.

### Preserve existing ProbeResult reconstruction from Transcript

The probe handler today reconstructs a missing `ProbeResult` row from an existing `Transcript` (same `(runId, scenarioId, modelId, sampleIndex)` key). This path is kept: the new completion gate depends on `ProbeResult` counts, so a missing row would block completion forever. The reconciliation sweep additionally performs the same reconstruction for orphan transcripts it finds — before recording `ORPHAN_TRANSCRIPT` as an anomaly, the sweep attempts to create the missing `ProbeResult` row and only records the anomaly if reconstruction fails.

### Reconciliation sweep scheduling (must run independent of activity window)

The existing `runRecoveryJob()` in `scheduler.ts` stops when the system has been idle for ~1 hour. Piggybacking the reconciliation sweep naively would inherit that shutdown — stuck `SUMMARIZING` runs would be stranded if the system is quiet. Instead:

- The reconciliation sweep runs on the same tick as `runRecoveryJob` **while** any run exists with status ∈ `{RUNNING, SUMMARIZING}` (regardless of whether new runs have been launched recently).
- Activation condition: `SELECT 1 FROM runs WHERE status IN ('RUNNING','SUMMARIZING') AND deleted_at IS NULL LIMIT 1`. If this returns a row, the reconciliation tick keeps running even when the recovery-activity window has expired.
- Plan phase decides whether this is a change to `scheduler.ts`'s existing activity logic, or a separate ticker dedicated to reconciliation.

### Reconciliation sweep

New PgBoss job type: `run_state_reconcile`. Piggybacks on the existing `runRecoveryJob()` tick in `scheduler.ts` — same cadence (5 min) and same scheduling hook. Enqueues singleton `run_state_reconcile` per non-terminal run per tick.

Handler:
1. Load the run. Always run steps 2 (late-transcript rescue) and 4 (anomaly scan) for runs in `{RUNNING, SUMMARIZING, PAUSED, COMPLETED}`. Skip entirely only for `{FAILED, CANCELLED}` or soft-deleted runs. Step 3 (status advancement) runs for `{RUNNING, SUMMARIZING, PAUSED}` only.
2. **Late-transcript rescue (runs in all scanned statuses including `COMPLETED`):** find all `Transcript` rows where `runId = $runId AND deletedAt IS NULL AND summarizedAt IS NULL AND summarizeFailedAt IS NULL`, enqueue a `summarize_transcript` job per transcript (singleton on `transcriptId`). This is the safety net for a transcript that committed after the run already flipped to `COMPLETED`.
3. Call `maybeAdvanceRunStatus(runId)` — same CAS path as event-driven. Skipped for `COMPLETED` runs.
4. Evaluate anomalies (see catalog) and upsert into `RunAnomaly`. For `COMPLETED` runs, only `STRANDED_TRANSCRIPT`, `ORPHAN_TRANSCRIPT`, `PAIR_ASYMMETRY`, and `MODEL_TRANSCRIPT_SHORTFALL` are evaluated. `SUMMARIZING_STALL` and `SCHEDULED_COUNT_MISMATCH` only apply to non-terminal runs.

**Why the sweep scans `COMPLETED` runs.** A transcript can commit after the SUMMARIZING → COMPLETED CAS succeeds — the run is already terminal but the row lands a moment later. Without a rescue pass on `COMPLETED` runs, that transcript is stranded permanently.

**Re-triggering post-completion side effects when a late transcript is summarized on a `COMPLETED` run.** If the sweep's late-transcript rescue summarizes a transcript belonging to a `COMPLETED` run, all three post-completion side effects become stale — analysis aggregates, token stats, and balance deduction were all computed before this transcript existed. To prevent silent "completed-but-stale" runs:
- After each successful late summarization on a `COMPLETED` run, the `summarize-transcript` handler calls **all three side effects**: `triggerBasicAnalysis(runId)`, `queueComputeTokenStats(runId)`, and `deductActualProviderBalancesForRun(runId)`. Each must be idempotent on its own side — plan phase verifies this, with special attention to `deductActualProviderBalancesForRun` which debits a balance and must either check "already deducted for this transcript" or operate on a delta basis rather than re-deducting the full run.
- The sweep does not revert the run's status from `COMPLETED` back to `SUMMARIZING`. Run status is a coarse signal of "work is done enough to publish"; side-effect regeneration is the fine-grained correctness path.

### Reconciliation scheduler activation

The reconciliation tick runs whenever **either** condition holds:
- `SELECT 1 FROM runs WHERE status IN ('RUNNING','SUMMARIZING','PAUSED') AND deleted_at IS NULL LIMIT 1` returns a row, **OR**
- `SELECT 1 FROM transcripts WHERE deleted_at IS NULL AND summarized_at IS NULL AND summarize_failed_at IS NULL LIMIT 1` returns a row (catches the "COMPLETED run with stranded transcript" case where the run is terminal but a transcript still needs rescue).

This keeps the sweep alive precisely when it can do useful work and lets it idle otherwise. Plan phase decides whether to extend the existing `runRecoveryJob` activity check or build a parallel ticker.

**Summarize dead-letter equivalence.** There is no dedicated PgBoss dead-letter handler for `summarize_transcript` jobs today, and this feature does not add one. Expired or dropped summarize jobs are surfaced by the reconciliation sweep's late-transcript rescue (step 2 above) — the sweep re-enqueues any unsummarized transcript on every tick, which is the canonical recovery path for this feature.

**Resolution behavior.** Once an anomaly's condition no longer holds (e.g., a stranded transcript gets summarized), the next sweep sets `resolvedAt = NOW()` for that `RunAnomaly` row. Operators can also manually acknowledge via MCP tooling in a follow-up.

### Anomaly catalog

| # | Type | Subject | Detection |
|---|---|---|---|
| 1 | `STRANDED_TRANSCRIPT` | empty string (run-level) | Run is `COMPLETED`, `SUMMARIZING` > threshold, or otherwise has ≥ 1 `Transcript` with `summarizedAt IS NULL AND summarizeFailedAt IS NULL AND deletedAt IS NULL`. The sweep queues summarize for these transcripts (late-transcript rescue) and records the anomaly so operators see the gap after the run's original completion. One anomaly row per run; `details` lists transcript ids. |
| 2 | `ORPHAN_TRANSCRIPT` | empty string (run-level) | A `Transcript` row older than the orphan-age threshold (default: 60 s after `createdAt`) exists with no matching `ProbeResult` row on `(runId, scenarioId, modelId, sampleIndex)`. **The sweep first attempts to reconstruct the missing `ProbeResult` from the transcript — this anomaly only fires when reconstruction fails.** One row per run; `details` lists orphan transcript ids. The age filter prevents false positives from in-flight probe writes (transcript is written before `ProbeResult` in the same transaction). |
| 3 | `PAIR_ASYMMETRY` | `jobChoiceBatchGroupId` | Two runs share `Run.config.jobChoiceBatchGroupId` and their success rates differ by more than a configured threshold (default: 20 percentage points, with a minimum 10 scheduled probes per side to avoid noise). One anomaly recorded on each run in the pair. **Note:** launch-time downgrades (incomplete pair → singleton run without `jobChoiceBatchGroupId`) are **not** detected by this anomaly and are a separate follow-up (a launch-time anomaly type would live closer to `launch-orchestrator.ts`). |
| 4 | `SUMMARIZING_STALL` | empty string (run-level) | Run status = `SUMMARIZING` and `updatedAt` older than a configured threshold (default: 30 min) with no progress since. One row per run. |
| 5 | `MODEL_TRANSCRIPT_SHORTFALL` | `modelId` | Within a single run: a model has ≥ N scheduled probes (default: 10) and success rate is either (a) below an absolute threshold (default: < 30%, catches systemic failures where every model fails equally) **or** (b) materially lower than peer models (success rate < X% where X = 50% default AND peer-median success rate > Y% where Y = 80% default). **Scheduled count per model** = `COUNT(RunScenarioSelection WHERE runId=$id) × samplesPerScenario` (the same formula recovery/coverage logic uses). `RunScenarioSelection` has fields `runId`, `scenarioId`, `createdAt` on table `run_scenario_selections`; it is populated at launch by the job planner and is the canonical scheduled-scenario set (not `Run.config.scenarioIds`, which can drift). **Success rate per model** = `COUNT(ProbeResult WHERE runId=$id AND modelId=$m AND status='SUCCESS' AND deletedAt IS NULL) / scheduled_count`. One row per (run, model). |
| 6 | `SCHEDULED_COUNT_MISMATCH` | empty string (run-level) | `Run.progress.total` disagrees with the deterministic expected scheduled count derived from `RunScenarioSelection` rows (uniquely selected scenarios for this run) times `modelIds.length × samplesPerScenario` (both read from `Run.config`). Replaces the dropped `PROBE_COUNT_OVERFLOW`. **Auto-repair:** when this anomaly fires, the sweep also updates `Run.progress.total` to the canonical derived value so the CAS predicate is unblocked — the anomaly record stays as an audit trail. Detects the "undercounted launch" edge case where `progress.total` got stored with a wrong value and the new CAS would otherwise complete too early or stall forever. One row per run. |

**Subject convention.** PostgreSQL unique constraints do not dedupe `NULL`, so a nullable `subject` would let run-level anomalies duplicate. Schema uses `subject String @default("") NOT NULL` — run-level anomalies carry the empty string, making `(runId, type, subject)` a real upsert key.

**Catalog change during review.** The original catalog had `PROBE_COUNT_OVERFLOW`; it was dropped during spec review because the `ProbeResult` unique constraint makes count > total impossible under the new data model. It is replaced by `SCHEDULED_COUNT_MISMATCH`, which detects the actual real-world problem — a wrong-valued `progress.total` — that the dropped anomaly was ostensibly meant to catch. Final launch set: **six anomaly types**, as originally agreed.

Thresholds live as constants in the sweep handler; plan phase may move them to runtime config.

### Schema additions

```prisma
enum RunAnomalyType {
  STRANDED_TRANSCRIPT
  ORPHAN_TRANSCRIPT
  PAIR_ASYMMETRY
  SUMMARIZING_STALL
  MODEL_TRANSCRIPT_SHORTFALL
  SCHEDULED_COUNT_MISMATCH
}

model RunAnomaly {
  id                    String         @id @default(cuid())
  runId                 String         @map("run_id")
  type                  RunAnomalyType
  subject               String         @default("")    // modelId, pair group id, or "" for run-level
  details               Json           @db.JsonB
  firstSeenAt           DateTime       @default(now()) @map("first_seen_at")
  lastSeenAt            DateTime       @default(now()) @map("last_seen_at")
  resolvedAt            DateTime?      @map("resolved_at")
  acknowledgedByUserId  String?        @map("acknowledged_by_user_id")

  run Run @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@unique([runId, type, subject])
  @@index([runId])
  @@index([type, resolvedAt])
  @@map("run_anomalies")
}
```

Subject is `NOT NULL` with a default of the empty string so the unique constraint actually dedupes run-level anomalies (see "Subject convention" in the anomaly catalog).

**Composite indexes added to existing tables:**

```prisma
// ProbeResult — existing @@index([runId]) and @@index([status]) are both single-column.
// The derived progress COUNT query filters by runId + status, so a composite index is required.
@@index([runId, status])

// Transcript — the summarize-completion NOT EXISTS query filters by runId + summarizedAt
// + summarizeFailedAt + deletedAt. A partial index (in raw-SQL migration) covers the
// exact predicate; schema also gets a composite for plain lookups.
@@index([runId, summarizedAt])
```

The partial index on transcripts is declared in the migration SQL rather than schema.prisma because Prisma does not support conditional indexes in its DSL.

Plus (pending plan approval of Option A for summarize-failure accounting):

```prisma
// On Transcript:
summarizeFailedAt DateTime? @map("summarize_failed_at")
```

Run relation to anomalies: `anomalies RunAnomaly[]`.

### Migration and cutover

Single PR. Hard cutover. Migration steps:
1. Add `RunAnomaly` table + enum.
2. Add `Transcript.summarizeFailedAt` (if Option A confirmed in plan).
3. No data migration needed for existing `Run.progress` JSONB — resolvers simply stop trusting `completed`/`failed` on those columns and compute from tables. Existing `total` values stay.
4. No data backfill required for `RunAnomaly` — sweep populates going forward.

In-flight safety: handlers that were mid-job at deploy read the new code path when they commit. The CAS pattern tolerates concurrent attempts. The reconciliation sweep runs within 5 minutes of deploy and heals any run that the event-driven path missed during the cutover window.

---

## Files in Scope

| File | Change |
|---|---|
| `cloud/packages/db/prisma/schema.prisma` | Add `RunAnomaly` model + `RunAnomalyType` enum (6 values); add `Transcript.summarizeFailedAt`; add `Run.anomalies` relation; add composite index `ProbeResult(run_id, status)` (existing single-column indexes are not enough for the derived COUNT query); add composite index `Transcript(run_id, summarized_at)`; note the migration file also adds a raw-SQL partial index for the completion-CAS NOT EXISTS query |
| `cloud/packages/db/prisma/migrations/<timestamp>_run_state_reconciliation/migration.sql` | New migration matching schema additions **plus** (a) the failure-row backfill: `UPDATE transcripts SET summarize_failed_at = summarized_at, summarized_at = NULL WHERE decision_text LIKE 'Summary failed%' AND decision_metadata IS NULL AND summarize_failed_at IS NULL` — the combined `decision_text LIKE` + `decision_metadata IS NULL` guard distinguishes failure rows from unusual-but-valid summaries (see "Migration brittleness acceptance" below); (b) a raw-SQL partial index: `CREATE INDEX transcripts_unsummarized_idx ON transcripts (run_id) WHERE deleted_at IS NULL AND summarized_at IS NULL AND summarize_failed_at IS NULL` to keep the SUMMARIZING → COMPLETED NOT EXISTS query fast regardless of run size |
| `cloud/apps/api/src/services/run/progress.ts` | Remove `applyProgressDelta`; rewrite `maybeAdvanceRunStatus` using the CAS UPDATEs; remove the 5s settle-timeout branch in favor of `maybeAdvanceRunStatus` running at the right moment |
| `cloud/apps/api/src/services/run/derived-progress.ts` | **New** — `computeRunProgress(runId)` service helper |
| `cloud/apps/api/src/queue/handlers/probe-scenario/handler.ts` | Replace `applyProgressDelta` calls with `maybeAdvanceRunStatus`; remove JSONB counter writes; keep the existing `ProbeResult` reconstruction branch that rebuilds a missing `ProbeResult` from an existing `Transcript` (new completion gate depends on it) |
| `cloud/apps/api/src/queue/handlers/probe-scenario/retry.ts` | **Was missing from initial scope.** Has its own `applyProgressDelta()` calls on retry paths — must be updated to the new `maybeAdvanceRunStatus` flow so retry handling does not bypass the new state machine |
| `cloud/apps/api/src/services/run/recovery.ts` | **Was missing from initial scope.** Has a direct `UPDATE status = 'COMPLETED'` path for stuck runs — must route through `maybeAdvanceRunStatus` or be removed in favor of the sweep, so there is no path that skips the derived-count predicate |
| `cloud/apps/api/src/queue/handlers/summarize-transcript.ts` | Same — replace counter writes; call `maybeAdvanceRunStatus` on terminal outcomes; write `summarizeFailedAt` on terminal summarize failure; **update `resolveSummarizeJob()` "already done" check to treat a transcript as terminal when EITHER `summarizedAt !== null` OR `summarizeFailedAt !== null`** (otherwise failure rows look pending forever and the sweep will re-queue them indefinitely — livelock) |
| `cloud/apps/api/src/queue/handlers/summarize-persistence.ts` | Replace `checkAllSummarized` + read-then-write transition with the `SUMMARIZING → COMPLETED` CAS UPDATE; side effects only on winner |
| `cloud/apps/api/src/queue/handlers/run-state-reconcile.ts` | **New** — reconciliation sweep handler |
| `cloud/apps/api/src/queue/handlers/index.ts` | Register `run_state_reconcile` handler |
| `cloud/apps/api/src/queue/types.ts` | Add `run_state_reconcile` job type and `RunStateReconcileJobData` |
| `cloud/apps/api/src/services/run/scheduler.ts` | Enqueue singleton `run_state_reconcile` per non-terminal run each recovery tick |
| `cloud/apps/api/src/services/run/anomaly-detection.ts` | **New** — pure detection functions for the six anomaly types, called by the sweep handler |
| `cloud/apps/api/src/services/run/anomaly-persistence.ts` | **New** — upsert helpers on `RunAnomaly` (including `resolvedAt` flip when a condition clears) |
| `cloud/apps/api/src/graphql/types/run.ts` (or equivalent) | Expose `run.progress`, `run.summarizeProgress` via the derived helper; expose `run.anomalies` |
| `cloud/apps/api/src/graphql/types/run-anomaly.ts` | **New** — GraphQL type + enum for `RunAnomaly` |
| `cloud/apps/api/src/graphql/resolvers/run-progress.ts` (or wherever `run.progress` resolves today) | Resolve `progress` / `summarizeProgress` via `computeRunProgress`, not from the JSONB column's `completed`/`failed` fields |
| `cloud/apps/api/tests/...` | Unit tests for CAS UPDATE semantics, sweep handler, each anomaly detector, derived progress helper |

Exact file list is subject to small adjustments during planning — the plan phase validates these paths.

---

## Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-1 | `computeRunProgress(runId)` returns numbers that match direct SQL `COUNT(...)` on `ProbeResult` / `Transcript` for 100% of runs in a test fixture containing ≥ 50 historical runs across multiple statuses |
| AC-2 | `applyProgressDelta()` (or its successor) is removed from all probe and summarize handlers — verified by grep |
| AC-3 | `RUNNING → SUMMARIZING` and `SUMMARIZING → COMPLETED` each execute as a single `UPDATE` statement with the predicate in the `WHERE` clause; no read-then-write anywhere |
| AC-4 | Two concurrent handlers calling `maybeAdvanceRunStatus(runId)` for the same run result in exactly one CAS winner per transition (test with in-process concurrency) |
| AC-5 | A run with one stranded transcript (summarize job never fired) is auto-completed by the sweep within one tick after the transcript is summarized |
| AC-6 | `RunAnomaly` rows are created for all six anomaly types in fixture-driven unit tests |
| AC-7 | `RunAnomaly` rows are upserted (not duplicated) when the sweep sees the same anomaly condition twice |
| AC-8 | `RunAnomaly` rows gain `resolvedAt` when the condition clears |
| AC-9 | `run.anomalies` returns the expected shape via GraphQL; schema includes all six enum values |
| AC-10 | TypeScript build passes with zero errors and no `@ts-ignore` |
| AC-11 | Full test suite passes; coverage for new files ≥ 80% lines |
| AC-12 | A run in `SUMMARIZING` pre-deploy completes correctly post-deploy — verified by a migration smoke test against a seeded database |
| AC-13 | No production code path calls `jsonb_set` on `progress.completed`, `progress.failed`, `summarizeProgress.completed`, or `summarizeProgress.failed` — verified by grep |

---

## Edge Cases

| Case | Behavior |
|---|---|
| Two probe handlers finish simultaneously and both try `maybeAdvanceRunStatus` | CAS predicate ensures only one rowCount-1 result; loser exits cleanly |
| A probe dead-letters as `JOB_EXPIRED` then a late worker succeeds | Upsert flips `ProbeResult.status` to `SUCCESS`; derived counts are consistent on next read; sweep records no anomaly (because the counts still satisfy `completed + failed = total`) |
| A transcript commits 6 seconds after the last probe finishes (past the old 5s settle window) | Event-driven path may miss it, so status stays `SUMMARIZING`; sweep finds it within one tick, queues summarize, then flips to `COMPLETED` on the following tick |
| A run has `progress.total` mismatch — e.g., user started 200 probes but `progress.total` says 180 | Anomaly `SCHEDULED_COUNT_MISMATCH` fires with the expected count (from `RunScenarioSelection × modelIds × samplesPerScenario`) in `details`. The sweep **auto-repairs** `progress.total` to the canonical derived value during the anomaly-detection step, so the CAS predicate is unblocked. The anomaly row stays as an audit trail. |
| Pair of runs, one side has 0 scheduled probes (all probes skipped at launch) | `PAIR_ASYMMETRY` threshold requires ≥ 10 probes per side, so the anomaly does not fire; a separate anomaly class for "pair side was never launched" is out of scope |
| `SUMMARIZING` stall threshold trips on a slow-but-valid run | Anomaly is recorded but run state is unchanged; operator reviews |
| A run is manually `CANCELLED` while the sweep is mid-evaluation | Sweep re-checks status at the start of its loop; the CAS UPDATE on a `CANCELLED` run affects 0 rows and exits cleanly |
| `RunAnomaly` already exists with same `(runId, type, subject)` | Upsert updates `lastSeenAt` and optionally `details`; does not re-fire notifications (there are no notifications yet) |
| Deploy happens mid-run | In-flight handlers read new code after their next dispatch; no state corruption |
| Historical runs completed before this feature | Resolvers immediately read from tables for those runs; cached JSONB `completed`/`failed` values become decorative |

---

## Open Questions for Plan Phase

1. **Reconciliation cadence** — confirm 5-minute tick (piggyback on existing `runRecoveryJob`) vs. dedicated shorter cadence.
2. **Anomaly thresholds** — confirm hardcoded vs. runtime-configurable (defaults are in the catalog table above).
3. **Reconciliation scheduler activation** — confirm the approach to decouple from `runRecoveryJob`'s 1-hour idle shutdown (extend the activity check vs. separate ticker).
4. **Should a `COMPLETED` run revert to `SUMMARIZING` when a late transcript arrives?** Currently the sweep queues summarize for the transcript but leaves the run `COMPLETED`. Alternative: revert status, finish summarizing, re-flip to `COMPLETED`. Plan phase decides.
5. **GraphQL resolver strategy** — confirm we compute `progress` once per request (field-level resolver) vs. cache within a single request for nested queries.

---

## Constitution Validation

| Requirement | Status |
|---|---|
| Type safety — no `any`, strict mode | PASS — all new types explicit; derived helper has a structured return type |
| File size ≤ 400 lines production / ≤ 800 tests | PASS — new files planned as small focused modules |
| Test coverage ≥ 80% | PASS — unit tests planned for CAS semantics, each anomaly detector, sweep handler, derived progress helper |
| No `console.log` — use centralized logger | PASS — sweep handler logs via `createLogger('run-reconcile')` |
| Observable | PASS — sweep emits structured logs per run per tick; anomaly creation logs at `warn`; completion flips log at `info` |
| Migrations use `prisma migrate dev` (never `db push`) | PASS — one new migration for schema additions |
| Respects soft-delete pattern (`deletedAt` filter) | PASS — all transcript queries filter `deletedAt: null` |
| PRs via branch, never direct to main | PASS — feature branch `feat/033-run-state-reconciliation` |
| Do not touch protected files (CLAUDE.md, AGENTS.md, MEMORY.md, etc.) | PASS — see "What is NOT in scope" |

---

## Residual Risks (must include `verification:` per workflow rule)

- **Risk: derived-count query is slow on large runs (e.g., 10k probes × 1 run).**
  verification: before merge, run `EXPLAIN ANALYZE` on the derived progress query against a local copy of the largest production run; confirm indexed plan on `probe_results(run_id, status)` and `transcripts(run_id, summarized_at)`; add/confirm indexes if plan is sequential.

- **Risk: atomic CAS under PostgreSQL's default READ COMMITTED isolation allows the subquery count to advance between two concurrent UPDATEs, resulting in double side-effects.**
  verification: write an integration test that launches two concurrent `maybeAdvanceRunStatus` calls against a staged row and asserts exactly one rowCount-1 result; run against the test database before merge.

- **Risk: reconciliation sweep fires `run_state_reconcile` for every non-terminal run every tick, producing O(runs) PgBoss inserts per tick in a loaded system.**
  verification: before merge, measure sweep tick cost against a fixture of 200 non-terminal runs; confirm inserts are batched or deduplicated via singleton keys; if tick > 5s, adjust scheduling to run-status-filtered batch.

- **Risk: `PAIR_ASYMMETRY` detection joins two runs by `Run.config.jobChoiceBatchGroupId` (a JSON path lookup), which may be slow without a functional index.**
  verification: before merge, run `EXPLAIN` on the pair-asymmetry query in the sweep against a production-sized fixture; if the plan is sequential, add a functional index on `(config ->> 'jobChoiceBatchGroupId')` in the migration.

- **Risk: replacing `applyProgressDelta` in every handler is a wide touch; a missed call site continues writing counters and creates silent state confusion.**
  verification: before merge, run `grep -RIn "progress.*jsonb_set\|applyProgressDelta\|summarizeProgress.*jsonb_set" cloud/apps/api/src` and assert the only matches are in the authoritative `computeRunProgress` helper and the launch-time `total` writes.

- **Risk: removing the 5-second settle-timeout branch loses the "wait for in-flight transcripts" behavior the event-driven path used to rely on; happy-path runs could fall through to sweep-driven completion instead of completing in seconds.**
  verification: before merge, run the run-lifecycle integration test with a realistic probe timing fixture and assert that a clean 25-probe run reaches `COMPLETED` within 10 seconds of the last probe finishing (not 5 minutes); confirm the preserved "fast path for late transcripts" branch fires in the test.

- **Risk: the reconciliation sweep re-queues probe or summarize jobs whose original worker crashed mid-API-call, producing double-billing at the provider.**
  verification: meta-fix #2 (provider idempotency keys) is the structural fix; until that ships, before merge quantify the exposure by measuring the probe dead-letter rate and summarize-failure rate against the last week of production; if the rates are low (< 0.5% of probes) ship as-is, otherwise block on idempotency keys landing first.

- **Risk: the reconciliation sweep runs for every non-terminal run every tick, and can stall if the existing `runRecoveryJob` activity window shuts off.**
  verification: before merge, extend the scheduler activation check so the reconciliation tick also fires when `SELECT 1 FROM runs WHERE status IN ('RUNNING','SUMMARIZING')` returns a row; write a test that idles the system for > 1 hour and confirms the sweep still runs while a non-terminal run exists.

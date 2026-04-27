# Tasks — Feature 033: Run State Reconciliation

Organized into waves matching `plan.md`. Each wave ends with `[CHECKPOINT]` so the diff review stays under ~300 lines. `[P: files]` annotations mark safe parallel work within a wave.

---

## Wave 1 — Schema + migration + backfill

### T1-1 — Schema additions
**File**: `cloud/packages/db/prisma/schema.prisma`

- [ ] Add enum `RunAnomalyType` with 6 values: `STRANDED_TRANSCRIPT`, `ORPHAN_TRANSCRIPT`, `PAIR_ASYMMETRY`, `SUMMARIZING_STALL`, `MODEL_TRANSCRIPT_SHORTFALL`, `SCHEDULED_COUNT_MISMATCH`.
- [ ] Add model `RunAnomaly` with fields: `id cuid`, `runId`, `type RunAnomalyType`, `subject String @default("")`, `details Json @db.JsonB`, `firstSeenAt`, `lastSeenAt`, `resolvedAt?`, `acknowledgedByUserId?`. Unique `(runId, type, subject)`. Indexes on `runId` and `(type, resolvedAt)`.
- [ ] Add back-reference `anomalies RunAnomaly[]` on `Run`.
- [ ] Add `summarizeFailedAt DateTime? @map("summarize_failed_at")` on `Transcript`.
- [ ] Add `costDebitedAt DateTime? @map("cost_debited_at")` on `Transcript` (idempotency marker for provider balance debits).
- [ ] Add composite index `@@index([runId, status])` on `ProbeResult`.
- [ ] Add composite index `@@index([runId, summarizedAt])` on `Transcript`.

### T1-2 — Migration SQL
**File**: `cloud/packages/db/prisma/migrations/<timestamp>_run_state_reconciliation/migration.sql`

- [ ] Generate migration via `prisma migrate dev --name run_state_reconciliation` against the local DB.
- [ ] Append: `UPDATE transcripts SET summarize_failed_at = summarized_at, summarized_at = NULL WHERE decision_text LIKE 'Summary failed%' AND decision_metadata IS NULL AND summarize_failed_at IS NULL`.
- [ ] Append: `CREATE INDEX transcripts_unsummarized_idx ON transcripts (run_id) WHERE deleted_at IS NULL AND summarized_at IS NULL AND summarize_failed_at IS NULL`.
- [ ] Dry-run the backfill as `SELECT COUNT(*)` with the same WHERE clause; record the count in the PR description.

### T1-3 — Update `reverseDeductionForRun` to clear `costDebitedAt`
**File**: `cloud/apps/api/src/services/budget/deduct.ts`

- [ ] Inside the existing transaction in `reverseDeductionForRun()`, also execute `UPDATE transcripts SET cost_debited_at = NULL WHERE run_id = $runId`. Required so re-opened runs can be charged again without skipping rows on the next completion.

[CHECKPOINT]

---

## Wave 2 — `computeRunProgress()` service helper

### T2-1 — Helper
**File**: `cloud/apps/api/src/services/run/derived-progress.ts` (new)

- [ ] Export `RunProgress` type: `{ total, completed, failed, summarizeTotal, summarizeCompleted, summarizeFailed }`, all `number`.
- [ ] Export `computeRunProgress(runId: string): Promise<RunProgress>`.
- [ ] Use `db.probeResult.groupBy({ by: ['status'], where: { runId, deletedAt: null } })` for completed/failed counts.
- [ ] `total` from `run.progress.total` via a single `findUnique`.
- [ ] `summarizeTotal` = `COUNT(Transcript WHERE runId=$id AND deletedAt IS NULL)`.
- [ ] `summarizeCompleted` = `COUNT(… AND summarizedAt IS NOT NULL AND summarizeFailedAt IS NULL)`.
- [ ] `summarizeFailed` = `COUNT(… AND summarizeFailedAt IS NOT NULL)`.
- [ ] Structured log at debug per call.

### T2-2 — Unit tests [P: after T2-1]
**File**: `cloud/apps/api/tests/services/run/derived-progress.test.ts` (new)

- [ ] 10-probe fixture (6 SUCCESS, 2 FAILED, 2 no-result) → assert completed=6, failed=2.
- [ ] 5-transcript fixture (3 summarized, 1 failed, 1 in-flight) → assert summarizeCompleted=3, summarizeFailed=1, summarizeTotal=5.
- [ ] Soft-deleted probe excluded.
- [ ] Empty run → all counts 0.

[CHECKPOINT]

---

## Wave 3 — CAS UPDATEs and `maybeAdvanceRunStatus`

### T3-1 — Implement the two-CAS helper
**File**: `cloud/apps/api/src/services/run/progress.ts`

- [ ] Remove `applyProgressDelta()` and helpers; remove the 5-second `waitForTranscriptSettle` branch.
- [ ] Add `maybeAdvanceRunStatus(runId)` returning `{ enteredSummarizing, completed }`.
- [ ] First CAS (RUNNING/PAUSED → SUMMARIZING) — raw SQL from plan. Capture rowCount.
- [ ] If first CAS wins, enqueue `summarize_transcript` per unsummarized transcript (singleton `transcriptId`).
- [ ] Second CAS (SUMMARIZING → COMPLETED) **issued unconditionally** — the WHERE clause enforces the invariant. Capture rowCount.
- [ ] If second CAS wins, call `triggerBasicAnalysis`, `queueComputeTokenStats`, `deductActualProviderBalancesForRun`.
- [ ] Docstring documents the two-gate chain (CAS 1 = probe gate, CAS 2 = transcript gate; together they replace `checkAllSummarized` + `findMissingProbes`).

### T3-2 — Zero-probe branch
**File**: `cloud/apps/api/src/services/run/progress.ts` + `cloud/apps/api/src/services/run/start-queue.ts`

- [ ] Extend `maybeAdvanceRunStatus` with a PENDING → COMPLETED short-circuit when `progress.total == 0`.
- [ ] In `start-queue.ts`, call `maybeAdvanceRunStatus(runId)` synchronously after run persistence.

### T3-3 — `deductActualProviderBalancesForRun` sets `costDebitedAt`
**File**: `cloud/apps/api/src/services/budget/deduct.ts`

- [ ] Wrap per-provider debit + per-transcript marker update in a single Prisma transaction.
- [ ] After successful `atomicDeduct`, `UPDATE transcripts SET cost_debited_at = NOW() WHERE id IN (...those_charged...) AND cost_debited_at IS NULL`.
- [ ] Only aggregate transcripts where `summarizedAt IS NOT NULL AND summarizeFailedAt IS NULL AND costDebitedAt IS NULL`.

### T3-4 — `calculatePercentComplete` consumes `RunProgress`
**File**: `cloud/apps/api/src/services/run/progress.ts`

- [ ] Change signature to accept `RunProgress`.
- [ ] Update every caller (grep for usages).

### T3-5 — Tests [P: after T3-1]
**File**: `cloud/apps/api/tests/services/run/progress.test.ts`

- [ ] CAS winner-exactly-once under 3 concurrent calls.
- [ ] Summarize fan-out: 10 transcripts → 10 summarize jobs (mocked PgBoss client counts).
- [ ] Side effects run only on second-CAS winner.
- [ ] Zero-probe run completes at launch.
- [ ] Stranded transcript keeps the run at SUMMARIZING.

[CHECKPOINT]

---

## Wave 4 — Handler refactor + `summarizeFailedAt` awareness everywhere

### T4-1 — Probe scenario handler
**File**: `cloud/apps/api/src/queue/handlers/probe-scenario/handler.ts`

- [ ] Replace each `applyProgressDelta` call with `await maybeAdvanceRunStatus(runId)` — including idempotent early-exit branches.
- [ ] Leave the existing "ProbeResult reconstruction from Transcript" branch untouched.

### T4-2 — Probe retry handler [P: T4-1 independent file]
**File**: `cloud/apps/api/src/queue/handlers/probe-scenario/retry.ts`

- [ ] Replace `applyProgressDelta` on all retry terminal paths.

### T4-3 — Summarize transcript handler
**File**: `cloud/apps/api/src/queue/handlers/summarize-transcript.ts`

- [ ] `resolveSummarizeJob()`: transcript is terminal when `summarizedAt IS NOT NULL OR summarizeFailedAt IS NOT NULL`.
- [ ] Replace `applyProgressDelta` with `maybeAdvanceRunStatus`.
- [ ] If the run's status is already `COMPLETED` when this summary lands: call `triggerBasicAnalysis`, `queueComputeTokenStats`, and `deductSingleTranscriptBalance(transcriptId)` — never `deductActualProviderBalancesForRun`.

### T4-4 — Summarize persistence
**File**: `cloud/apps/api/src/queue/handlers/summarize-persistence.ts`

- [ ] `persistSummarizeFailure()`: write `summarizeFailedAt = NOW()`, **not** `summarizedAt`. Keep the `decisionText = "Summary failed: …"` for operator debugging.
- [ ] `checkAllSummarized()`: treat `summarizedAt IS NOT NULL OR summarizeFailedAt IS NOT NULL` as terminal.
- [ ] Delete `maybeCompleteRun()` export; every caller now uses `maybeAdvanceRunStatus`.

### T4-5 — `deductSingleTranscriptBalance` helper
**File**: `cloud/apps/api/src/services/budget/deduct.ts`

- [ ] New export `deductSingleTranscriptBalance(transcriptId): Promise<void>`.
- [ ] Inside a Prisma transaction: check `costDebitedAt`; compute cost; convert `Float`→`Decimal`; `atomicDeduct`; `UPDATE transcripts SET cost_debited_at = NOW() WHERE id = $1`.
- [ ] Early-return if already debited or cost ≤ 0 (but in the ≤ 0 case still set `costDebitedAt` so the guard is sticky).

### T4-6 — Recovery + adjacent read paths
**File**: `cloud/apps/api/src/services/run/recovery.ts` + 3 others

- [ ] `recovery.ts`: remove/route-through the direct `UPDATE status='COMPLETED'` path. Update `recoverOrphanedRun()`'s unsummarized-count check to include `summarizeFailedAt: null`.
- [ ] `cloud/apps/api/src/services/run/summarization.ts`: transcript queries filtering `summarizedAt: null` also filter `summarizeFailedAt: null`.
- [ ] `cloud/apps/api/src/services/run/recovery-jobs.ts`: same.
- [ ] `cloud/apps/api/src/mcp/tools/get-unsummarized-transcripts.ts`: same.

### T4-7 — Grep sweep
- [ ] `grep -RIn "summarizedAt.*null\|summarized_at.*null" cloud/apps/api/src` — every hit either filters `summarizeFailedAt` too, or carries a one-line comment explaining why it's intentionally inclusive.
- [ ] `grep -RIn "applyProgressDelta\|jsonb_set.*progress\|jsonb_set.*summarize_progress" cloud/apps/api/src` returns zero matches.

[CHECKPOINT]

---

## Wave 5 — Reconciliation sweep job + scheduler integration

### T5-1 — Register `run_state_reconcile` job type
**File**: `cloud/apps/api/src/queue/types.ts`

- [ ] Add `RunStateReconcileJobData = { runId: string }`.
- [ ] Defaults: `expireInSeconds: 120`, `retryLimit: 0`.

### T5-2 — Sweep handler
**File**: `cloud/apps/api/src/queue/handlers/run-state-reconcile.ts` (new)

- [ ] Skip run if status ∈ `{FAILED, CANCELLED}` or `deletedAt != null`.
- [ ] **Step 1 — late-transcript rescue**: find unsummarized transcripts; enqueue `summarize_transcript` singleton `transcriptId` each.
- [ ] **Step 2 — status advancement**: if status ∈ `{RUNNING, PAUSED, SUMMARIZING}`, call `maybeAdvanceRunStatus(runId)`.
- [ ] **Step 3 — anomaly scan**: each detector wrapped in its own try/catch so one failure doesn't block siblings. For `COMPLETED` runs, skip `SUMMARIZING_STALL` and `SCHEDULED_COUNT_MISMATCH`.
- [ ] **Step 4 — explicit repair**: if `SCHEDULED_COUNT_MISMATCH` fired, call `repairScheduledCount(runId, canonicalTotal)` separately.
- [ ] Structured log per step, structured log on overall outcome.

### T5-3 — Register handler [P: T5-1 done]
**File**: `cloud/apps/api/src/queue/handlers/index.ts`

- [ ] Register the new handler.

### T5-4 — Scheduler integration
**File**: `cloud/apps/api/src/services/run/scheduler.ts`

- [ ] Extend activity check: any non-terminal run OR any recent (`updated_at > NOW() - INTERVAL '30 days'`) COMPLETED run with unsummarized transcripts.
- [ ] Inside the tick, enqueue singleton `run_state_reconcile` per qualifying run.

### T5-5 — Tests
**File**: `cloud/apps/api/tests/queue/handlers/run-state-reconcile.test.ts` (new)

- [ ] Stranded transcript on COMPLETED run → sweep queues summarize; status unchanged.
- [ ] SUMMARIZING run with all transcripts done → sweep flips to COMPLETED.
- [ ] Sweep is idempotent (run twice on the same state → second is a no-op).
- [ ] A failing detector does not block the others (inject failure via Prisma mock).
- [ ] Scheduler keeps sweep alive when only stranded-transcript-on-COMPLETED runs exist.

[CHECKPOINT]

---

## Wave 6 — Anomaly detection + persistence

### T6-1 — Thresholds constants
**File**: `cloud/apps/api/src/services/run/anomaly-thresholds.ts` (new)

- [ ] Named constants: `PAIR_ASYMMETRY_THRESHOLD_PCT = 20`, `PAIR_ASYMMETRY_MIN_PROBES = 10`, `SUMMARIZING_STALL_MINUTES = 30`, `MODEL_SHORTFALL_MIN_PROBES = 10`, `MODEL_SHORTFALL_ABSOLUTE_RATE = 0.30`, `MODEL_SHORTFALL_RELATIVE_RATE = 0.50`, `MODEL_SHORTFALL_PEER_RATE = 0.80`, `ORPHAN_TRANSCRIPT_MIN_AGE_SECONDS = 60`.

### T6-2 — Pure detectors [P: T6-1 done]
**File**: `cloud/apps/api/src/services/run/anomaly-detection.ts` (new)

- [ ] `detectStrandedTranscript(run)`.
- [ ] `detectOrphanTranscript(run)` — detect only; reconstruction happens in the sweep orchestrator.
- [ ] `detectPairAsymmetry(run)` — joins via `Run.config->>'jobChoiceBatchGroupId'`.
- [ ] `detectSummarizingStall(run)`.
- [ ] `detectModelTranscriptShortfall(run): AnomalyDraft[]` — uses `RunScenarioSelection` count × `modelIds.length` × `samplesPerScenario` as denominator; fires on absolute OR relative threshold.
- [ ] `detectScheduledCountMismatch(run)` — pure detect; includes canonical count in details.
- [ ] All queries filter `deletedAt: null`.

### T6-3 — Anomaly persistence + explicit repair
**File**: `cloud/apps/api/src/services/run/anomaly-persistence.ts` (new)

- [ ] `upsertAnomaly(draft)` — upsert on `(runId, type, subject)`; set `lastSeenAt = NOW()`.
- [ ] `resolveAnomaly(runId, type, subject)` — set `resolvedAt = NOW()` when a prior anomaly's condition is no longer true.
- [ ] `repairScheduledCount(runId, canonicalTotal)` — transactional write of `progress.total`; no-op if already canonical.

### T6-4 — Functional index on config JSON path
**File**: `cloud/packages/db/prisma/migrations/<timestamp>_run_state_reconciliation/migration.sql`

- [ ] `EXPLAIN` the `PAIR_ASYMMETRY` query; if sequential scan, append `CREATE INDEX runs_pair_group_idx ON runs ((config->>'jobChoiceBatchGroupId')) WHERE deleted_at IS NULL`.

### T6-5 — Tests
**Files**: `cloud/apps/api/tests/services/run/anomaly-detection.test.ts`, `cloud/apps/api/tests/services/run/anomaly-persistence.test.ts`

- [ ] One positive + one negative fixture per detector.
- [ ] Upsert dedupes on repeated firing.
- [ ] `resolveAnomaly` flips `resolvedAt` correctly.
- [ ] `repairScheduledCount` idempotent on the second call.

[CHECKPOINT]

---

## Wave 7 — GraphQL exposure

### T7-1 — Derived progress resolver
**File**: `cloud/apps/api/src/graphql/types/run.ts`

- [ ] Field-level resolver: `progress.completed/failed` and `summarizeProgress.completed/failed` come from `computeRunProgress(runId)`. `total` continues to read from the JSONB column.

### T7-2 — `RunAnomaly` GraphQL type [P: T7-1 done]
**File**: `cloud/apps/api/src/graphql/types/run-anomaly.ts` (new)

- [ ] Define object type and enum.
- [ ] Resolver `run.anomalies` reads `run_anomalies` for the run, ordered by `firstSeenAt DESC`.

### T7-3 — Integration tests
**File**: `cloud/apps/api/tests/graphql/run.test.ts`

- [ ] `run.progress` derived values match direct SQL counts on a fixture.
- [ ] `run.anomalies` shape correct on a run with seeded anomalies.

[CHECKPOINT]

---

## Wave 8 — Verification + soak

- [ ] Full preflight: lint+test+build for `@valuerank/db` and `@valuerank/api`; `npm run db:test:setup` before tests.
- [ ] Seed local DB with ≥ 50 historical runs; assert derived progress matches `COUNT(*)` queries.
- [ ] `EXPLAIN ANALYZE` on derived progress queries against the largest real run snapshot. Assert plan uses both new indexes (composite + partial). Target < 50 ms p99.
- [ ] Integration test: 25-probe run reaches `COMPLETED` within 10 s of the last probe.
- [ ] Integration test: late-transcript rescue triggers all three side effects and `deductSingleTranscriptBalance` debits the transcript exactly once (re-run is a no-op).
- [ ] Repeat grep sweep from T4-7.
- [ ] Rounding-dust simulation: 10,000 synthetic transcript costs; lifetime drift < 1¢.
- [ ] PR description's Validation section lists every command + result.

[CHECKPOINT]

---

## Parallelization summary

Within each wave, `[P: …]` annotations mark tasks that can run in parallel once their prerequisites land. Cross-wave parallelism is not safe — each wave's `[CHECKPOINT]` must pass diff review before the next begins.

| Wave | Parallel opportunities |
|---|---|
| 1 | T1-1, T1-3 can run after schema change generates; T1-2 depends on T1-1 |
| 2 | T2-2 depends on T2-1 |
| 3 | T3-1 and T3-3 touch separate files, can run in parallel; T3-4 depends on T3-1 |
| 4 | T4-1 and T4-2 are separate files; T4-6 sub-files are disjoint |
| 5 | T5-1, T5-2, T5-4 are separate files |
| 6 | T6-1 first; T6-2, T6-3 after |
| 7 | T7-1, T7-2 are separate files |

---

## Constitution Check

| Requirement | Status |
|---|---|
| Each wave ends with `[CHECKPOINT]` | PASS |
| No slice exceeds ~300 lines | PASS — largest (Wave 4) projected ~280 |
| Dependencies tracked | PASS |
| Every task is executable | PASS — each names file(s), concrete action, and verification |
| Tests co-authored with code | PASS — every new prod file has a paired test task |

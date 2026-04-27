# Plan — Feature 033: Run State Reconciliation

**Branch**: feat/033-run-state-reconciliation
**Source spec**: `spec.md` in this directory
**Status**: Draft — post spec checkpoint, judge panel voted `advance` with 2 unresolved concerns carried into this plan.

---

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: HIGH late-transcript race: fixed — sweep rescues COMPLETED runs, fast-path preserved, resolveSummarizeJob check updated. MEDIUM PENDING→RUNNING: explicitly out of scope (not drift-prone). MEDIUM SCHEDULED_COUNT_MISMATCH: fixed — sweep auto-repairs progress.total. MEDIUM summarize livelock: fixed — resolveSummarizeJob treats summarizeFailedAt as terminal.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: HIGH missing side effects: fixed — all three (triggerBasicAnalysis, queueComputeTokenStats, deductActualProviderBalancesForRun) are re-triggered; this plan picks the safe deduction approach (see Unresolved Concern 1). MEDIUM stalled_models reset: fixed in CAS UPDATE SET. MEDIUM migration brittleness: accepted with verification. MEDIUM summarize dead-letter: documented — sweep IS the dead-letter path. LOW calculatePercentComplete drift: fixed — helper now consumes computeRunProgress output.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: HIGH analysis staleness: fixed — all three side effects re-triggered on late summarize. HIGH composite index missing: fixed — ProbeResult(runId,status) composite + Transcript partial index added. MEDIUM PAUSED coverage: fixed — included in CAS and sweep scope. MEDIUM recovery.ts direct status update: fixed — added to Files in Scope. MEDIUM Option A vs B: fixed — Option A is mandatory. LOW launch-total SPOF: accepted with sweep auto-repair.

**Unresolved concerns from judge panel** (carried into this plan and resolved below in "Resolving the Two Unresolved Concerns"):
1. `deductActualProviderBalancesForRun` idempotency — can the sweep safely re-call it without double-debiting?
2. Scheduler integration — extend `runRecoveryJob` activity window vs. build a separate ticker?

---

## Resolving the Two Unresolved Concerns

### Concern 1 — Provider balance deduction idempotency

**Reality from the code.** `deductActualProviderBalancesForRun(runId)` at [cloud/apps/api/src/services/budget/deduct.ts:68](cloud/apps/api/src/services/budget/deduct.ts:68) loads **all** transcripts for a run, aggregates cost by provider, and calls `atomicDeduct(provider, total_cost)`. It is **not** idempotent at the transcript level — a second call double-debits.

**Review feedback (plan-stage HIGH).** The original plan draft said "safe because a transcript is only summarized once" — but a transcript with `summarizeFailedAt` set has ALREADY been included in the original aggregated debit at the moment the run first completed (via `extractTranscriptCost` — which returns 0 for rows lacking `costSnapshot`, so failed transcripts contribute 0 to that aggregate). When the sweep later succeeds at summarizing that transcript, `extractTranscriptCost` returns a real value — and `deductSingleTranscriptBalance` would debit it a second time (once at 0 from the original aggregation, once at real cost from the delta path). Net: under-debit originally + real-cost late = correct total by accident, not by design. **Fragile.**

**Resolution — add a durable per-transcript debit marker.**

Schema addition to Wave 1:

```prisma
// On Transcript:
costDebitedAt DateTime? @map("cost_debited_at")
```

Behavior:
- `deductActualProviderBalancesForRun(runId)` at original run completion updates every transcript it debits with `costDebitedAt = now()` inside the same transaction as the provider `atomicDeduct`.
- `deductSingleTranscriptBalance(transcriptId)` (new helper) checks `costDebitedAt IS NULL` and the real cost; if both are true, debits and sets `costDebitedAt`. If `costDebitedAt IS NOT NULL`, no-op.
- Aggregate debit still operates on cost summed across all transcripts at original completion — but it only includes transcripts where `summarizedAt IS NOT NULL` (not-yet-summarized transcripts contribute 0 under the new marker check, instead of the old accidental 0).
- The late-transcript rescue path on a COMPLETED run calls `deductSingleTranscriptBalance` — which is now truly idempotent by the DB marker.

This makes the per-transcript debit **atomic with its marker write**: a crash between the debit and the marker set would leave inconsistent state. To prevent that:
- `deductSingleTranscriptBalance` runs both operations inside a single Prisma transaction.
- `deductActualProviderBalancesForRun` already aggregates outside a transaction but now wraps the per-provider debit + per-transcript marker-update block in a transaction.

**Reopen-flow compatibility.** `cloud/apps/api/src/cli/reopen-premature-runs.ts` calls `reverseDeductionForRun()` to credit provider balances back when re-opening a prematurely completed run. With the new marker, **`reverseDeductionForRun()` must also clear `costDebitedAt` on every transcript it credits back** — otherwise the next completion path sees `costDebitedAt IS NOT NULL` and skips charging. This is a one-line addition to the existing function in the same transaction. Wave 1 includes the update.

**Rounding-dust note (plan-review MEDIUM).** Transcript cost is stored as `Float` in `Transcript.estimatedCost`; provider balance is `Decimal(10,4)`. Per-transcript delta debits will accumulate small rounding errors that per-run aggregate debits smooth over. For this feature, we accept the drift (sub-cent per transcript; lifetime drift negligible vs. the value of idempotency). Residual risk tracked below.

**Verification**: unit test writes a run with 2 transcripts; completes it (aggregate debit sets `costDebitedAt` on both); adds a 3rd late transcript with real cost; summarizes via sweep path; asserts provider balance equals `initial - sum(all three costs)` and **re-running** `deductSingleTranscriptBalance(transcript3.id)` is a no-op (checked by asserting balance unchanged on second call).

### Concern 2 — Scheduler integration

**Options considered.**

| Option | Pros | Cons |
|---|---|---|
| A. Extend `runRecoveryJob` activity window to also fire when unsummarized transcripts exist; reconcile inside the same tick. | One scheduler surface; reuses activity-detection machinery; small change. | Couples reconciliation lifetime to recovery job — future edits to recovery scope may accidentally affect reconcile. |
| B. Build a new periodic ticker `run_state_reconcile_tick` on an independent PgBoss schedule. | Decoupled from recovery; reconciliation behavior is explicit and independent. | Two tickers to reason about; more code; duplicate activity-detection logic. |

**Picked: A.** The activity check is a small, local change to `scheduler.ts`. Coupling cost is tolerable because recovery and reconciliation are semantically adjacent (both heal stuck runs). If they diverge later, splitting into B is straightforward.

**Concrete change to `scheduler.ts`** (see Step 5 below):
- Existing activity check: `SELECT 1 FROM runs WHERE status IN ('RUNNING','SUMMARIZING') AND deleted_at IS NULL LIMIT 1`
- New activity check (union — scoped to recent runs to avoid a single-ancient-orphan keeping the scheduler running forever):
  ```sql
  SELECT 1 WHERE EXISTS (
    SELECT 1 FROM runs
    WHERE status IN ('RUNNING','SUMMARIZING','PAUSED')
      AND deleted_at IS NULL
  ) OR EXISTS (
    SELECT 1 FROM transcripts t
    JOIN runs r ON r.id = t.run_id
    WHERE t.deleted_at IS NULL
      AND t.summarized_at IS NULL
      AND t.summarize_failed_at IS NULL
      AND r.deleted_at IS NULL
      AND r.updated_at > NOW() - INTERVAL '30 days'
  )
  ```
  The 30-day scope matches typical operator-investigation windows and prevents a single legitimately-abandoned unsummarized transcript (from a very old failed run) from keeping the scheduler active forever. Operators who need to reconcile something older can trigger the sweep manually via the existing MCP `trigger_recovery` path.
- Inside the tick, after the existing recovery steps, enqueue a singleton `run_state_reconcile` job per non-terminal run AND any recent COMPLETED run that has at least one `summarized_at IS NULL AND summarize_failed_at IS NULL AND deleted_at IS NULL` transcript.

---

## Implementation Waves

Each wave is a `[CHECKPOINT]` boundary. Targeting ≤ 300 lines changed per wave.

### Wave 1 — Schema + migration + backfill [CHECKPOINT]

**Files**
- `cloud/packages/db/prisma/schema.prisma`: add `RunAnomaly` model and `RunAnomalyType` enum (6 values); add `Transcript.summarizeFailedAt`; **add `Transcript.costDebitedAt` (for per-transcript debit idempotency — see Concern 1 resolution)**; add `Run.anomalies` back-reference; add composite index `ProbeResult(runId, status)`; add composite index `Transcript(runId, summarizedAt)`.
- `cloud/packages/db/prisma/migrations/<timestamp>_run_state_reconciliation/migration.sql`: schema DDL plus (a) backfill `UPDATE transcripts SET summarize_failed_at = summarized_at, summarized_at = NULL WHERE decision_text LIKE 'Summary failed%' AND decision_metadata IS NULL AND summarize_failed_at IS NULL`; (b) partial index `CREATE INDEX transcripts_unsummarized_idx ON transcripts (run_id) WHERE deleted_at IS NULL AND summarized_at IS NULL AND summarize_failed_at IS NULL`.

**Estimated size**: ~80 lines (schema + migration SQL).

### Wave 2 — `computeRunProgress()` service helper [CHECKPOINT]

**Files**
- `cloud/apps/api/src/services/run/derived-progress.ts` (new): `computeRunProgress(runId)` returns `{ total, completed, failed, summarizeTotal, summarizeCompleted, summarizeFailed }`. Pure read helper; uses Prisma `groupBy` or raw count queries with `deletedAt IS NULL` guards.
- `cloud/apps/api/tests/services/run/derived-progress.test.ts` (new): fixture-driven tests covering SUCCESS/FAILED probes, summarizedAt/summarizeFailedAt transcripts, soft-deleted rows excluded, empty runs.

**Estimated size**: ~150 lines (helper + tests).

### Wave 3 — CAS UPDATEs and `maybeAdvanceRunStatus` [CHECKPOINT]

**Files**
- `cloud/apps/api/src/services/run/progress.ts`: replace `applyProgressDelta` + read-then-write transition with `maybeAdvanceRunStatus(runId)`. Runs both CAS UPDATEs; the second CAS is issued **unconditionally from the caller's perspective**, but the UPDATE's WHERE clause still contains the full derived-count predicate (`status = 'SUMMARIZING' AND NOT EXISTS unsummarized transcripts`). "Unconditionally" means we always issue the SQL; the invariant is enforced by the predicate, not by pre-checking in application code. Winner of the first CAS (RUNNING/PAUSED → SUMMARIZING) fans out summarize jobs; winner of the second (SUMMARIZING → COMPLETED) runs post-completion side effects. The existing `calculatePercentComplete(progress)` is rewritten to consume `computeRunProgress` output.
- **Also in this wave**: the empty-run fast path in `queueSummarizeJobs()` (direct `UPDATE status = 'COMPLETED'` when a run has zero transcripts) is removed — but **zero-probe runs need an explicit advancement trigger** since no probe handler will ever fire to call `maybeAdvanceRunStatus`. `maybeAdvanceRunStatus` gains an additional CAS branch: `PENDING → COMPLETED` when `(progress->>'total')::int = 0`. This branch is called from the launch path (`start-queue.ts`) right after the run is persisted so zero-probe runs complete synchronously at creation. The test fixture covers this explicitly.
- `cloud/apps/api/tests/services/run/progress.test.ts`: tests for CAS winner-exactly-once under concurrency; correct fan-out of summarize jobs; correct side-effect firing; **empty-run completion through the CAS path** (no bypass).

**Estimated size**: ~220 lines.

### Wave 4 — Probe/summarize handler refactor + `summarizeFailedAt` awareness everywhere [CHECKPOINT]

**Files**
- `cloud/apps/api/src/queue/handlers/probe-scenario/handler.ts`: remove `applyProgressDelta` calls; call `maybeAdvanceRunStatus` at all terminal-outcome points including the idempotent early-exit branches; keep the existing `ProbeResult`-reconstruction-from-Transcript branch.
- `cloud/apps/api/src/queue/handlers/probe-scenario/retry.ts`: same — replace `applyProgressDelta` on retry paths.
- `cloud/apps/api/src/queue/handlers/summarize-transcript.ts`: update `resolveSummarizeJob()` to treat `summarizedAt IS NOT NULL OR summarizeFailedAt IS NOT NULL` as "already done"; replace `applyProgressDelta` with `maybeAdvanceRunStatus`; on late-summarize of a COMPLETED run, call the three side effects (`triggerBasicAnalysis`, `queueComputeTokenStats`, **`deductSingleTranscriptBalance(transcriptId)`** — NOT `deductActualProviderBalancesForRun`).
- `cloud/apps/api/src/queue/handlers/summarize-persistence.ts`: `persistSummarizeFailure()` writes `summarizeFailedAt = now()` and does NOT set `summarizedAt`. `checkAllSummarized()` is updated to treat a transcript as terminal when `summarizedAt IS NOT NULL OR summarizeFailedAt IS NOT NULL` (otherwise runs with failed summaries never complete). `maybeCompleteRun` is removed in favor of `maybeAdvanceRunStatus`.
- `cloud/apps/api/src/queue/handlers/summarize-persistence.ts` — the existing `checkAllSummarized()` has two gates: (1) no unsummarized transcripts and (2) `findMissingProbes(runId)` returns empty. The new CAS `SUMMARIZING → COMPLETED` predicate only covers gate (1). Gate (2) — no missing probes — is already enforced by the RUNNING → SUMMARIZING CAS predicate (`probe_results >= progress.total`), but only if `progress.total` is correct. The `SCHEDULED_COUNT_MISMATCH` anomaly + repair path (Wave 6) is the load-bearing correction for that. Document the two-gate chain explicitly in the CAS helper's docstring so implementers understand why the SUMMARIZING → COMPLETED CAS doesn't need to call `findMissingProbes` directly.
- `cloud/apps/api/src/services/run/recovery.ts`: (a) remove/route-through the existing direct `UPDATE status = 'COMPLETED'` path so no code path bypasses the CAS; (b) update `recoverOrphanedRun()` — its `unsummarizedCount = count({ summarizedAt: null })` check must include the `summarizeFailedAt IS NULL` clause; **(c)** preserve the "reopen terminal run before requeueing missing probes" flow (`status: 'RUNNING'`, clear `completedAt`, call `reverseDeductionForRun`) — `reverseDeductionForRun` already clears `costDebitedAt` after the Wave-1 update, so the recovery flow is compatible with the new marker without further changes. The existing `isRunTerminal` check in `probe-scenario/handler.ts` continues to work correctly because recovery flips `status` to `RUNNING` before requeueing.
- `cloud/apps/api/src/services/run/summarization.ts`, `cloud/apps/api/src/services/run/recovery-jobs.ts`, `cloud/apps/api/src/mcp/tools/get-unsummarized-transcripts.ts`: **ALSO IN SCOPE** — each reads or queues transcripts where `summarizedAt IS NULL` and must now also filter `summarizeFailedAt IS NULL`. The wave-4 grep sweep (below) verifies no site is missed.

**Grep sweep before marking wave complete** — `grep -RIn "summarizedAt.*null\|summarized_at.*null" cloud/apps/api/src` and verify every hit either (a) also filters `summarizeFailedAt`, or (b) is in a code path that explicitly wants to include failed transcripts. Each exception documented inline.

**Estimated size**: ~280 lines touched across 5 files.

### Wave 5 — Reconciliation sweep job [CHECKPOINT]

**Files**
- `cloud/apps/api/src/queue/types.ts`: add `run_state_reconcile` job type and `RunStateReconcileJobData = { runId: string }`. Defaults: `expireInSeconds: 120`, `retryLimit: 0`, `singletonKey = runId`.
- `cloud/apps/api/src/queue/handlers/run-state-reconcile.ts` (new): sweep handler. For a single run: late-transcript rescue (queue summarize for unsummarized transcripts, singleton on transcriptId); call `maybeAdvanceRunStatus`; evaluate + upsert anomalies.
- `cloud/apps/api/src/queue/handlers/index.ts`: register handler.
- `cloud/apps/api/src/services/run/scheduler.ts`: extend activity check per Concern 2 resolution; enqueue singleton `run_state_reconcile` for each non-terminal run AND each COMPLETED run with unsummarized transcripts.
- `cloud/apps/api/tests/queue/handlers/run-state-reconcile.test.ts`: tests for idempotency, late-transcript rescue, CAS winner-exactly-once under sweep vs. event-driven concurrency.

**Estimated size**: ~300 lines.

### Wave 6 — Anomaly detection + persistence [CHECKPOINT]

**Files**
- `cloud/apps/api/src/services/run/anomaly-detection.ts` (new): **pure** detector functions for each anomaly type (no state mutation, no I/O except reads).
  - `detectStrandedTranscript(run)`
  - `detectOrphanTranscript(run)` — detects only; sweep orchestrator (in `run-state-reconcile.ts`) attempts `ProbeResult` reconstruction before persisting the anomaly.
  - `detectPairAsymmetry(run)` — joins against sibling run sharing `Run.config.jobChoiceBatchGroupId`
  - `detectSummarizingStall(run, thresholdMinutes)`
  - `detectModelTranscriptShortfall(run)` — uses `RunScenarioSelection × modelIds × samplesPerScenario` as denominator; fires on absolute (< 30%) or relative (<50% with peer median >80%) threshold
  - `detectScheduledCountMismatch(run)` — detects only; returns the canonical expected total in the anomaly details. **Auto-repair is moved out** of the detector per plan-review feedback (detection should not mutate state). The sweep handler (`run-state-reconcile.ts`) reads the anomaly details and runs a separate, explicit `repairScheduledCount(runId, canonicalTotal)` call. The distinction makes the mutation auditable and easy to disable.
- All thresholds live in a single named-export constants file `cloud/apps/api/src/services/run/anomaly-thresholds.ts` so tuning doesn't require touching detector code. Values at launch match the spec catalog; runtime-config is a follow-up.
- `cloud/apps/api/src/services/run/anomaly-persistence.ts` (new): upsert helpers for `RunAnomaly` keyed on `(runId, type, subject)`; flip `resolvedAt` when a detector returns null for a previously recorded anomaly.
- `cloud/apps/api/tests/services/run/anomaly-detection.test.ts`: one test per detector with positive + negative fixtures.

**Estimated size**: ~400 lines. If this exceeds the ~300-line checkpoint budget, split into 6a (pure detectors) and 6b (persistence + sweep integration).

### Wave 7 — GraphQL exposure [CHECKPOINT]

**Files**
- `cloud/apps/api/src/graphql/types/run.ts` (or wherever `run.progress` resolves today): resolve `progress` and `summarizeProgress` via `computeRunProgress`. Add `anomalies: [RunAnomaly!]!` resolver.
- `cloud/apps/api/src/graphql/types/run-anomaly.ts` (new): GraphQL object type + enum for `RunAnomaly`.
- `cloud/apps/api/tests/graphql/run.test.ts`: integration tests against a seeded fixture verifying derived progress output and anomaly shape.

**Estimated size**: ~150 lines.

### Wave 8 — Verification + soak [CHECKPOINT]

Before merge:
1. Run full preflight (lint, test, build) for `@valuerank/db`, `@valuerank/api`.
2. Seed a local DB with ≥ 50 historical runs, run GraphQL reads, confirm progress numbers match direct SQL counts.
3. `EXPLAIN ANALYZE` on the derived queries against the largest real run; assert the partial index and composite indexes are used.
4. Integration test: start a 25-probe run, assert COMPLETED within 10 seconds of last probe; verify late-transcript rescue + side-effect re-triggering in a separate fixture.
5. Grep sweep: `applyProgressDelta` appears zero times in `cloud/apps/api/src`; `jsonb_set` on `progress.completed/failed/summarizeProgress.completed/failed` appears zero times.

---

## Residual Risks (each with verification)

- **Risk: derived-count query is slow on runs with 10k+ probes.**
  verification: wave-8 `EXPLAIN ANALYZE` against the largest production run snapshot; confirm partial index on transcripts and composite index on probe_results are in plan; target < 50 ms at p99.

- **Risk: concurrent CAS under PostgreSQL READ COMMITTED allows subquery counts to be stale.**
  verification: wave-3 concurrency test launches two parallel `maybeAdvanceRunStatus` calls against a staged row; asserts exactly one rowCount-1 per transition.

- **Risk: missing file scope — `probe-scenario/retry.ts` + `recovery.ts` hold pre-existing counter writes and direct completion paths that would bypass the new state machine if missed.**
  verification: wave-4 grep sweep (included in AC-13) verifies `applyProgressDelta` has zero callers and no direct `UPDATE status='COMPLETED'` exists outside `maybeAdvanceRunStatus`.

- **Risk: migration backfill `LIKE 'Summary failed%'` pattern misses some historical rows.**
  verification: before merge, run the WHERE clause as a `SELECT COUNT(*)` against a dev DB seeded with production-shaped data; cross-check against recent logs of `persistSummarizeFailure` calls; if any mismatches, widen the pattern.

- **Risk: `deductSingleTranscriptBalance` double-debits if the original run-completion deduction already included the transcript.**
  verification: wave-4 integration test seeds two scenarios — (a) transcript exists at SUMMARIZING→COMPLETED flip (original path debits it), (b) transcript arrives after COMPLETED (sweep path debits it). Assert the provider balance equals `initial - sum(all_transcript_costs)` in both cases — exactly once per transcript.

- **Risk: `PAIR_ASYMMETRY` query joins on `Run.config->>'jobChoiceBatchGroupId'` with no functional index — sequential scan on the runs table.**
  verification: wave-6 `EXPLAIN` against a production-sized fixture; if sequential, add functional index `CREATE INDEX runs_pair_group_idx ON runs ((config->>'jobChoiceBatchGroupId')) WHERE deleted_at IS NULL` in the wave-1 migration.

- **Risk: coupling reconcile tick to `runRecoveryJob` activity check means future edits to recovery scope could accidentally disable reconciliation.**
  verification: add a test in wave-5 that exercises the "system has been idle for 2 hours but there's a stranded transcript on a COMPLETED run" scenario; assert the sweep still fires.

- **Risk: `calculatePercentComplete` rewrite may change rounding in one UI location and cause visible drift.**
  verification: wave-7 snapshot tests on every GraphQL consumer of `progress.completed / progress.total` verify identical output before and after the cutover on the same fixture.

- **Risk: per-transcript debit via `Float` transcript cost accumulates rounding dust vs. the old `Decimal` aggregate debit.**
  verification: before merge, run a simulation — sum 10,000 random transcript costs as (a) aggregate then round to Decimal(10,4), (b) convert each to Decimal(10,4) then sum. If the delta exceeds 1 cent total, the provider-balance deduction step in `deductSingleTranscriptBalance` must convert `Float` → `Decimal` at the boundary before the `atomicDeduct` call.

- **Risk: `summarizeFailedAt` is not recognized everywhere — `checkAllSummarized` and `recoverOrphanedRun` are the two explicit known sites, but a grep-sweep may surface others.**
  verification: before merge, `grep -RIn "summarized.?at.*null\|summarizedAt.*null" cloud/apps/api/src` and confirm every hit either also filters `summarizeFailedAt` or is in a code path that explicitly wants failed transcripts included. Document each exception.

- **Risk: auto-repair of `Run.progress.total` inside an anomaly-detection code path would be a hidden side effect; moving it to an explicit step in the sweep (per plan-review feedback) is good, but the sweep must not double-repair on re-runs.**
  verification: wave-6 test — seed a run with wrong `progress.total`, run sweep twice, assert the second run is a no-op (repair sees the already-canonical value and skips).

- **Risk: empty-run completion path no longer has a fast exit — every empty run now goes through the CAS.**
  verification: wave-3 test — fixture with a run that has zero probes scheduled reaches `COMPLETED` via the CAS path at launch (synchronous); assert no direct `UPDATE status` call elsewhere.

- **Risk: `triggerBasicAnalysis` may not be idempotent — re-running it for a late-summarized transcript on a COMPLETED run could produce duplicate `AnalysisResult` rows.**
  verification: before wave-4 merge, inspect `triggerBasicAnalysis` (likely in `cloud/apps/api/src/services/analysis/`) and `AnalysisResult` schema; if not idempotent (no unique key or upsert), add an idempotency guard in the late-summarize path (delete-then-reinsert the run's analysis, or compute-and-compare-before-write). If that's too invasive, downgrade the late-summarize trigger to log-only and document as known-limitation until analysis is refactored.

- **Risk: monolithic sweep handler couples unrelated responsibilities — a bug in one anomaly detector could break status advancement for the same run.**
  verification: wave-5 sweep handler wraps each sub-step (late-transcript rescue, `maybeAdvanceRunStatus`, each anomaly detector, `repairScheduledCount`) in its own try/catch that logs failure and continues to the next sub-step. Unit tests assert that injecting a failure in one sub-step does not prevent the others from running.

---

## Verification Before Push

Per `cloud/CLAUDE.md` preflight:
1. `npx turbo lint --filter=@valuerank/db`
2. `npx turbo lint --filter=@valuerank/api`
3. `npm run db:test:setup`
4. `npx turbo test --filter=@valuerank/api`
5. `npx turbo build --filter=@valuerank/api`

Validation section in the PR description lists each command and pass/fail.

---

## Constitution Validation (plan-level)

| Requirement | Status |
|---|---|
| Type safety | PASS — `computeRunProgress` return type is a named interface; no `any` |
| File size ≤ 400 lines prod | PASS — largest new file (`run-state-reconcile.ts`) expected ~250 |
| Test coverage ≥ 80% | PASS — each wave includes a tests bullet |
| Structured logging only | PASS — all new log lines use `createLogger` |
| Prisma migrate, never `db push` | PASS — wave-1 produces a migration file |
| Soft delete filtering (`deletedAt: null`) | PASS — every derived query filters `deletedAt: null` for both `probe_results` and `transcripts` |
| PR to chrislawcodes/valuerank, branch only | PASS — feat branch specified |
| Protected files untouched | PASS — scope excludes CLAUDE.md, AGENTS.md, MEMORY.md, .gitignore |

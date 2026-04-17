# Feature 032 — Queue Depth Governor

**Branch**: feat/032-queue-depth-governor
**Created**: 2026-04-16
**Status**: Draft

---

## Background

On 2026-04-16, a user relaunched a paired batch multiple times after it appeared stuck.
This flooded PgBoss with ~40,000+ probe jobs. Jobs expire after 7 minutes
(`expireInSeconds: 420`). With rate-limited workers and a flooded queue, thousands of
jobs expired before workers reached them, leaving 158 runs stuck in RUNNING with zero
active jobs — requiring manual recovery.

Root failure: `enqueueRunJobs()` inserts the entire job set at once. Launching many
simultaneous runs saturates every provider queue. Jobs sitting past the 7-minute TTL
silently disappear.

The fix: cap how many probe jobs any single run can have pending **per provider queue**
at any time, and top up as jobs complete. Provider queues are the right boundary because
that is where rate limiting already operates.

---

## User Stories

### US-1 (P0): Runs do not flood a provider queue on launch

**As the** system,
**I want** each run to insert at most `PROBE_QUEUE_DEPTH_PER_PROVIDER` pending probe
jobs into each provider queue at launch,
**so that** launching many runs simultaneously does not saturate any one provider queue
or cause jobs to expire before workers reach them.

**Acceptance criteria:**
- After `enqueueRunJobs()`, the number of pending `probe_scenario` jobs from this run
  in any single provider queue is at most `PROBE_QUEUE_DEPTH_PER_PROVIDER` (default: 15)
- If a run has fewer than 15 jobs for a provider, all of them are inserted (no change)
- `run.progress.total` reflects the true total job count, not the capped count

### US-2 (P0): Remaining jobs top up per-provider as probes complete

**As the** system,
**I want** the queue to be refilled toward `PROBE_QUEUE_DEPTH_PER_PROVIDER` per
provider after each probe completes,
**so that** workers are never starved and runs progress continuously without manual
recovery.

**Acceptance criteria:**
- After each probe completes, a singleton top-up job is enqueued for that run
  (singleton per run — simultaneous completions collapse to one top-up)
- The top-up handler computes missing probes per provider for this run and inserts
  enough to bring each provider back to the cap
- If a provider is already at or above cap, that provider is skipped
- If all jobs have been queued or completed, top-up is a no-op (run completes normally)

### US-3 (P1): Recovery scheduler backstop tops up runs below cap

**As the** system,
**I want** the existing 5-minute recovery tick to also top up runs that have fallen
below the per-provider cap,
**so that** missed top-up events do not permanently stall a run.

**Acceptance criteria:**
- The recovery scheduler checks each RUNNING run and enqueues a `top_up_probes`
  singleton for any run that has at least one provider queue below half the cap
- This is a backstop only — the probe-completion path (US-2) is the primary mechanism

---

## What is NOT in scope

- Changing the PgBoss job TTL (`expireInSeconds: 420` stays)
- Any UI changes
- Any schema/migration changes
- Changing summarization or analysis job enqueueing
- Changing job plan construction (`buildRunJobPlan`)
- Duplicate run detection or user-facing warnings
- CLAUDE.md, AGENTS.md, MEMORY.md, .gitignore, or any file not listed in scope

---

## Key Constant

| Constant | Value | Meaning |
|---|---|---|
| `PROBE_QUEUE_DEPTH_PER_PROVIDER` | `15` | Max pending probe jobs per (run, provider queue) |

15 is chosen so that at 5 probes/min per provider, the queue drains in ~3 minutes —
safely under the 7-minute TTL — while giving workers a continuous supply.

---

## Design

### Launch: per-provider capped insertion

`enqueueRunJobs()` builds the full job list (grouped by `queueName`), then for each
provider queue inserts only `min(PROBE_QUEUE_DEPTH_PER_PROVIDER, providerJobs.length)`
jobs. Remaining jobs are not persisted separately — the top-up handler recomputes them
on demand.

**Integrity check update (critical):** `enqueueRunJobs()` currently throws `RUN_INIT_FAILED`
when `jobIds.length !== totalJobs`. This must be changed to compare against the *capped
initial count* rather than the full total. Pass `expectedInitialCount` (sum of per-provider
capped counts) and verify against that. The `progress.total` in the run record remains
the true total — only the launch integrity check changes.

### Top-up: singleton job per run

After each probe reaches a **terminal outcome** in the `probe-scenario` handler, enqueue
a `top_up_probes` singleton for that run. Terminal outcomes are:
- **SUCCESS** — `applyProgressDelta(runId, ..., 'SUCCESS')` path
- **Final FAILED** (non-retryable) — `applyProgressDelta(runId, ..., 'FAILED')` path
- **Idempotent early-exit** — if the handler returns early because a `ProbeResult` with
  SUCCESS or FAILED already exists (lines 80–105 of `handler.ts`), a slot is freed but
  no `applyProgressDelta` runs. The top-up singleton must also be enqueued at these
  early-exit points so the queue is replenished.

Do NOT enqueue a top-up for retryable failures that throw to PgBoss — those jobs remain
in the queue and are retried automatically; the slot is not freed.

PgBoss deduplicates via `singletonKey = runId`: multiple simultaneous completions collapse
to one pending `top_up_probes` job.

The `top_up_probes` handler:
1. Exits early if run status is not RUNNING
2. Rebuilds job plan from run config (models, scenarioIds, samplesPerScenario, **temperature**) —
   temperature must be fetched from the run record and passed through to enqueued jobs, the same
   way `startRun()` passes it at launch. Failing to do so silently corrupts results for any run
   using a non-default temperature.
3. Calls a new **queue-aware** missing-probe helper that returns probes with:
   - No `ProbeResult` row with status SUCCESS or FAILED (terminal outcomes), AND
   - No pending/active PgBoss job in the relevant provider queue
   
   This is **not** the existing `findMissingProbes` utility, which only checks transcript
   rows and does not query PgBoss state. The new helper must query both to avoid
   re-enqueuing probes that are already pending but haven't produced a ProbeResult yet.
4. Groups missing probes by provider queue (using `getQueueNameForModel(modelId)`)
5. For each provider queue: counts current pending + active jobs for this run in that
   queue; inserts `min(missing, max(0, cap - pending))` new jobs into the correct
   provider queue (not the default `probe_scenario` fallback queue)

### Recovery scheduler backstop (US-3)

Inside the existing `runRecoveryJob()` tick, after orphan detection, add a sweep:
for each RUNNING run, count pending jobs per provider queue; if any provider is below
`PROBE_QUEUE_DEPTH_PER_PROVIDER / 2`, enqueue a `top_up_probes` singleton for that run.
The singleton deduplication means this is cheap when the probe-completion path is working.

---

## New Job Type: `top_up_probes`

| Property | Value |
|---|---|
| Job type | `top_up_probes` |
| `singletonKey` | `runId` |
| `expireInSeconds` | `60` |
| `retryLimit` | `0` |
| Data | `{ runId: string }` |

Short TTL and no retries: if the top-up job expires, the scheduler backstop (US-3)
handles it within 5 minutes.

---

## Files in Scope

| File | Change |
|---|---|
| `cloud/apps/api/src/services/run/start-queue.ts` | Cap per-provider insertion; update integrity check to compare against capped count; export `PROBE_QUEUE_DEPTH_PER_PROVIDER` |
| `cloud/apps/api/src/queue/types.ts` | Add `top_up_probes` job type and `TopUpProbesJobData` |
| `cloud/apps/api/src/queue/handlers/index.ts` | Register `top_up_probes` handler |
| `cloud/apps/api/src/queue/handlers/top-up-probes.ts` | New file — top-up handler with queue-aware missing-probe logic |
| `cloud/apps/api/src/queue/handlers/probe-scenario/handler.ts` | On terminal outcome (success or final failure): enqueue singleton `top_up_probes` |
| `cloud/apps/api/src/services/run/recovery-jobs.ts` | Update queue-name pattern in `countJobsForRun()` and related helpers to include `probe_${providerName}` queues, not just `probe_scenario%` |
| `cloud/apps/api/src/services/run/stall-detection.ts` | Update queue-name pattern to match provider queues |
| `cloud/apps/api/src/services/run/scheduler.ts` | Add backstop top-up sweep: enqueue `top_up_probes` singleton for runs below half-cap |
| `cloud/apps/api/src/services/run/control.ts` | Update cancel-run job cancellation query to include provider queues (exclude `probe_dead_letter`) |
| `cloud/apps/api/src/mcp/tools/delete-run.ts` | Same queue-name pattern update for run deletion |
| `cloud/apps/api/src/services/run/recovery.ts` | Update `detectAndRecoverStuckJobs()` zombie-kill pattern to include provider queues |

---

## Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-1 | A run with 200 jobs across 4 providers inserts at most 60 jobs at launch (4 × 15) |
| AC-2 | `run.progress.total` = 200 (true total), not 60 |
| AC-3 | After each probe completes, the provider queue trends back toward 15 pending for this run |
| AC-4 | A run with 10 jobs on one provider inserts all 10 at launch (cap not hit) |
| AC-5 | Launching 10 simultaneous 200-job runs inserts at most 600 probe jobs per provider (not 2000) |
| AC-6 | A run completes normally end-to-end with the governor active |
| AC-7 | TypeScript build passes with zero errors |
| AC-8 | Unit tests cover: capped launch, top-up when below cap, top-up no-op when at cap, early exit on non-RUNNING run |

---

## Edge Cases

| Case | Behavior |
|---|---|
| Run ≤ 15 jobs per provider | All inserted at launch; top-up is always a no-op |
| Top-up fires after run COMPLETED | Handler exits early on non-RUNNING status |
| All jobs queued or done | `findMissingProbes` returns empty; no-op |
| Worker restart mid-run | Scheduler backstop catches within 5 minutes |
| Concurrent completions | PgBoss `singletonKey = runId` collapses to one top-up |
| New provider added mid-run | `findMissingProbes` covers all providers; top-up works correctly |
| Multiple simultaneous active runs | Each run has its own singleton key; no interference |

---

## Constitution Validation

| Requirement | Status |
|---|---|
| Type safety — no `any`, strict mode | PASS — all new types explicit |
| File size ≤ 400 lines | PASS — `top-up-probes.ts` will be ~100 lines |
| Test coverage ≥ 80% | PASS — new handler is unit-testable with mocked DB/PgBoss |
| Observable / loggable | PASS — top-up events logged at `debug`; errors at `warn` |
| PRs via branch, never direct to main | PASS — feature branch specified |

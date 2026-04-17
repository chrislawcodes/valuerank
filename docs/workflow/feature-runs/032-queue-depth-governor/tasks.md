# Tasks

## T1 — Add `top_up_probes` job type

**File**: `cloud/apps/api/src/queue/types.ts`

- [ ] Add `TopUpProbesJobData` interface: `{ runId: string }`
- [ ] Add `top_up_probes` to the job name union type
- [ ] Add default job options: `expireInSeconds: 60`, `retryLimit: 0`

---

## T2 — Cap per-provider insertion in `enqueueRunJobs()`

**File**: `cloud/apps/api/src/services/run/start-queue.ts`

- [ ] Export `PROBE_QUEUE_DEPTH_PER_PROVIDER = 15`
- [ ] After building the full job list, group jobs by `queueName` into a `Map<string, Job[]>`
- [ ] For each provider queue: slice to `min(PROBE_QUEUE_DEPTH_PER_PROVIDER, providerJobs.length)`
- [ ] Compute `expectedInitialCount` = sum of all per-provider capped counts
- [ ] Update integrity check to compare `jobIds.length !== expectedInitialCount`
- [ ] Confirm `run.progress.total` still = `totalJobs` (true total, unchanged)

---

## T3 — Create `top-up-probes` handler

**File**: `cloud/apps/api/src/queue/handlers/top-up-probes.ts` (new file)

- [ ] Exit early if run status is not RUNNING
- [ ] Fetch run: `models`, `scenarioIds`, `samplesPerScenario`, `temperature`
- [ ] Rebuild full job plan using `buildRunJobPlan(run)` (individual tuples with `sampleIndex`)
- [ ] Implement queue-aware missing-probe filter:
  - Exclude probes with terminal `ProbeResult` (SUCCESS or FAILED)
  - Exclude probes with pending/active PgBoss job in the provider queue
  - Query: `SELECT FROM pgboss.job WHERE name = $queue AND data->>'runId' = $runId AND state IN ('created','retry','active')`
- [ ] For each provider queue:
  - Count current pending + active jobs for this run
  - Insert `min(missing, max(0, PROBE_QUEUE_DEPTH_PER_PROVIDER - pending))` jobs
  - Use `getQueueNameForModel(modelId)` for queue name (not default `probe_scenario`)
  - Pass `temperature` in each job's data

---

## T4 — Register `top_up_probes` handler

**File**: `cloud/apps/api/src/queue/handlers/index.ts`

- [ ] Import and register `topUpProbesHandler` for `top_up_probes`

---

## T5 — Enqueue top-up from probe-scenario handler

**File**: `cloud/apps/api/src/queue/handlers/probe-scenario/handler.ts`

- [ ] Enqueue `top_up_probes` singleton (`singletonKey = runId`) at:
  - SUCCESS path (after `applyProgressDelta(..., 'SUCCESS')`)
  - Final FAILED path (after `applyProgressDelta(..., 'FAILED')`)
  - Idempotent early-exit paths (~L80–105): where handler returns because ProbeResult already exists
- [ ] Do NOT enqueue for retryable throws (job still in queue, slot not freed)

---

## T6 — Fix queue-name pattern in recovery and stall detection

**File**: `cloud/apps/api/src/services/run/recovery-jobs.ts`
**File**: `cloud/apps/api/src/services/run/stall-detection.ts`

- [ ] Update SQL pattern from `name = 'probe_scenario' OR name LIKE 'probe_scenario_%'`
  to `name = 'probe_scenario' OR (name LIKE 'probe_%' AND name != 'probe_dead_letter')`
- [ ] Apply to all relevant helpers in both files

---

## T7 — Fix cancellation and deletion paths

**File**: `cloud/apps/api/src/services/run/control.ts`
**File**: `cloud/apps/api/src/mcp/tools/delete-run.ts`
**File**: `cloud/apps/api/src/services/run/recovery.ts`

- [ ] `control.ts` (~L128–137): update cancel-run job query to same pattern as T6
- [ ] `delete-run.ts` (~L63–73): same pattern update
- [ ] `recovery.ts` (~L308–318): update `detectAndRecoverStuckJobs()` zombie-kill to same pattern

---

## T8 — Add backstop sweep to scheduler

**File**: `cloud/apps/api/src/services/run/scheduler.ts`

- [ ] Inside `runRecoveryJob()`, after existing recovery calls, add sweep:
  - For each RUNNING run: count pending jobs per provider queue
  - If any provider is below `PROBE_QUEUE_DEPTH_PER_PROVIDER / 2`: enqueue `top_up_probes` singleton
  - Use `singletonKey = runId`

---

## T9 — Unit tests

**File**: `cloud/apps/api/src/queue/handlers/top-up-probes.test.ts` (new file)
**File**: `cloud/apps/api/src/services/run/start-queue.test.ts` (extend existing or new)

- [ ] Capped launch: 200-job run across 4 providers inserts ≤ 60 jobs at launch
- [ ] Capped launch integrity: `progress.total` = 200, not 60
- [ ] Uncapped launch: ≤ 15 jobs per provider inserts all at launch
- [ ] Top-up when below cap: missing probes enqueued up to cap
- [ ] Top-up no-op when at cap: no jobs inserted when provider at cap
- [ ] Top-up skips probes already in PgBoss (queue-aware filter)
- [ ] Early exit on non-RUNNING run
- [ ] Temperature propagated to topped-up jobs
- [ ] Dead-letter queue excluded from all job count queries

---

## T10 — Build + lint verification

- [ ] `npm run build --workspace @valuerank/api` — zero errors
- [ ] `npm run lint --workspace @valuerank/api` — zero errors
- [ ] `npm run test --workspace @valuerank/api` — all tests pass

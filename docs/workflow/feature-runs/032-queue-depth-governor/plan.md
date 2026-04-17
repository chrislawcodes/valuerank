# Plan

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: HIGH RUN_INIT_FAILED: fixed in spec — integrity check now compares against capped initial count. MEDIUM findMissingProbes: fixed — spec requires queue-aware helper that checks PgBoss state. MEDIUM scheduler scope: lightweight backstop only; residual risk accepted.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: HIGH RUN_INIT_FAILED: already addressed. HIGH queue-pattern mismatch: fixed — recovery-jobs.ts and stall-detection.ts added to scope. MEDIUM top_up_probes visibility: LOW priority, not blocking.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: F-1 RUN_INIT_FAILED: fixed. F-2 idempotency skips: top-up also triggered at early-exit paths. F-3 temperature propagation: added to spec. F-4 SQL pattern: existing pattern is wrong — spec correctly requires update to match probe_.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: HIGH dead-letter pattern: fixed — query now excludes probe_dead_letter. MEDIUM requeueMissingProbes bypass: pre-existing issue, not in scope. MEDIUM sampleIndex: clarified in plan — buildRunJobPlan emits individual job tuples with sampleIndex, not reconstructed from counts. MEDIUM scheduler timeout: lightweight backstop; accepted residual.
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: HIGH cancel path: fixed — control.ts and delete-run.ts added to scope. HIGH zombie-kill: fixed — recovery.ts added to scope. MEDIUM queue health APIs: pre-existing gap, not in scope for this feature.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: HIGH singleton flooding: PgBoss singleton collapses concurrent inserts by design — this is the intended usage. MEDIUM brittle SQL: no better alternative without a provider registry; document as known constraint. MEDIUM race condition: accepted residual per spec. LOW tests: added capped-launch and dead-letter tests to Step 10.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: MEDIUM non-retryable top-up: by design — scheduler backstop is recovery path (US-3). MEDIUM terminal states: SUCCESS and FAILED are the only terminal states in the schema. MEDIUM broader blast radius: probe_dead_letter excluded; no other probe-prefixed queues exist.
- review: reviews/tasks.codex.dependency-order-adversarial.review.md | status: accepted | note: MEDIUM integrity check: per-provider grouping prevents cross-provider compensation — each bucket capped independently. MEDIUM terminal states: only SUCCESS/FAILED in schema. MEDIUM naming inconsistency: getQueueNameForModel always returns probe_, consistent with probe_% pattern. MEDIUM concurrent race: accepted residual — singleton key serializes execution.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: HIGH thundering herd: PgBoss singleton collapses concurrent inserts by design. MEDIUM cancelled run race: low impact — expired jobs rejected. MEDIUM test coverage: accepted residual. MEDIUM backstop scalability: low concurrent run count in practice. LOW filtering: implementation should use DB query not in-memory. LOW failure window: acknowledged in spec.

## Implementation Steps

### Step 1 — Add `top_up_probes` job type

**File**: `cloud/apps/api/src/queue/types.ts`

Add `TopUpProbesJobData` interface and register `top_up_probes` job defaults:

```typescript
export interface TopUpProbesJobData {
  runId: string;
}
```

Job defaults:
- `expireInSeconds: 60`
- `retryLimit: 0`
- `singletonKey`: set at call site (= runId)

### Step 2 — Cap per-provider insertion in `enqueueRunJobs()`

**File**: `cloud/apps/api/src/services/run/start-queue.ts`

1. Export `PROBE_QUEUE_DEPTH_PER_PROVIDER = 15`
2. After building the full job list, group by `queueName` into a `Map<string, Job[]>`
3. For each provider queue: take only `min(PROBE_QUEUE_DEPTH_PER_PROVIDER, providerJobs.length)` jobs,
   where `providerJobs` is the per-provider slice (not the total run size)
4. Compute `expectedInitialCount` = sum of per-provider capped counts (not `totalJobs`)
5. Update integrity check: compare `jobIds.length` against `expectedInitialCount`
6. `run.progress.total` = `totalJobs` (unchanged — true total, not capped count)

### Step 3 — Create `top-up-probes` handler

**File**: `cloud/apps/api/src/queue/handlers/top-up-probes.ts` (new file)

Logic:
1. Exit early if run status is not RUNNING
2. Fetch run config: `models`, `scenarioIds`, `samplesPerScenario`, `temperature`
3. Rebuild full job plan using `buildRunJobPlan(run)` — this produces individual probe job
   descriptors each with their own `(scenarioId, modelId, sampleIndex)` tuple. The top-up
   handler works from this full list, not from sample counts; `sampleIndex` values are never
   reconstructed from counts.
4. Call queue-aware missing-probe helper (see below)
5. For each provider queue:
   - Count current pending + active PgBoss jobs for this run in that queue
   - Insert `min(missing, max(0, PROBE_QUEUE_DEPTH_PER_PROVIDER - pending))` new jobs
   - Use correct provider queue name (from `getQueueNameForModel(modelId)`), not default `probe_scenario`
   - Pass `temperature` through to each job's data

**Queue-aware missing-probe helper** (inline in handler or shared util):
- Returns probes that have NEITHER a terminal `ProbeResult` (SUCCESS or FAILED) NOR a pending/active PgBoss job in the relevant queue
- Query: `SELECT * FROM pgboss.job WHERE name = $queueName AND data->>'runId' = $runId AND state IN ('created', 'retry', 'active')`
- This is NOT `findMissingProbes` — that helper only checks transcript rows

### Step 4 — Register handler

**File**: `cloud/apps/api/src/queue/handlers/index.ts`

Register `top_up_probes` → `topUpProbesHandler`

### Step 5 — Enqueue top-up from probe-scenario handler

**File**: `cloud/apps/api/src/queue/handlers/probe-scenario/handler.ts`

Enqueue `top_up_probes` singleton at ALL terminal paths:
- SUCCESS path (`applyProgressDelta(..., 'SUCCESS')`)
- Final FAILED path (`applyProgressDelta(..., 'FAILED')`)
- Idempotent early-exit paths (lines ~80–105 where handler returns early because ProbeResult already exists)

Use `singletonKey = runId`. Do NOT enqueue for retryable throws.

### Step 6 — Fix queue-name pattern in recovery and stall detection

**File**: `cloud/apps/api/src/services/run/recovery-jobs.ts`

Update `countJobsForRun()` and related helpers to match provider queues:
- Current pattern: `name = 'probe_scenario' OR name LIKE 'probe_scenario_%'`
- New pattern: `name = 'probe_scenario' OR (name LIKE 'probe_%' AND name != 'probe_dead_letter')`
- This covers `probe_anthropic`, `probe_openai`, `probe_google`, etc. while excluding the
  `probe_dead_letter` queue (a real PgBoss queue in this system — see `handler-config.ts`)

**File**: `cloud/apps/api/src/services/run/stall-detection.ts`

Same pattern update.

### Step 7 — Fix cancellation and deletion paths

**File**: `cloud/apps/api/src/services/run/control.ts`

Update the cancel-run job cancellation query (around L128–137) to match provider queues:
- Same pattern as Step 6: `name = 'probe_scenario' OR (name LIKE 'probe_%' AND name != 'probe_dead_letter')`

**File**: `cloud/apps/api/src/mcp/tools/delete-run.ts`

Same pattern update (around L63–73).

**File**: `cloud/apps/api/src/services/run/recovery.ts`

Update `detectAndRecoverStuckJobs()` zombie-kill path (around L308–318) to match provider queues with the same pattern.

### Step 9 — Add backstop sweep to scheduler

**File**: `cloud/apps/api/src/services/run/scheduler.ts`

Inside `runRecoveryJob()`, after existing recovery calls, add:
- For each RUNNING run: count pending jobs per provider queue
- If any provider is below `PROBE_QUEUE_DEPTH_PER_PROVIDER / 2`: enqueue `top_up_probes` singleton for that run
- Use `singletonKey = runId` (deduplication is cheap)

### Step 10 — Unit tests

**File**: `cloud/apps/api/src/queue/handlers/top-up-probes.test.ts` (new file)

Cover:
- Capped launch: run with 200 jobs across 4 providers inserts ≤ 60 at launch
- Capped launch integrity: `progress.total` = 200, not 60
- Run with ≤ 15 jobs per provider inserts all at launch (cap not hit)
- Top-up when below cap: missing probes are enqueued up to cap
- Top-up no-op when at cap: no jobs inserted when provider is full
- Top-up skips probes already in PgBoss (queue-aware filter)
- Early exit on non-RUNNING run
- Temperature propagated correctly to topped-up jobs
- Dead-letter queue excluded from all job count queries

## Key Constraints

- No schema migrations
- No UI changes
- No changes to `buildRunJobPlan`
- `progress.total` always = true total job count
- All new code: no `any`, strict TypeScript
- `top-up-probes.ts` target: ~100 lines

# Plan: stall-watchdog

## Architecture

Four layers of change, each independently committable:

1. **DB schema** — add `stalledModels String[] @default([])` to `Run` model
2. **Backend detection** — new `stall-detection.ts` module + integration into recovery scheduler
3. **GraphQL + API types** — expose `stalledModels` on Run type and in `RUN_FRAGMENT`
4. **Frontend** — remove broken billing banner, add stall banner using `stalledModels`

---

## Layer 1 — DB Schema

**File:** `cloud/packages/db/prisma/schema.prisma`

Add to the `Run` model (near the other array fields):
```prisma
stalledModels String[] @default([]) @map("stalled_models")
```
(No other decorators. Just `String[]`, `@default([])`, `@map("stalled_models")`.)

**Migration:** Generate with `prisma migrate dev --name add_stalled_models`.
The migration SQL MUST produce `text[] NOT NULL DEFAULT '{}'`. Verify the generated SQL before applying.

**Existing rows:** Prisma default `[]` → Postgres `DEFAULT '{}'` automatically backfills existing rows on migration.

No other schema changes required.

---

## Layer 2 — Backend Detection (`stall-detection.ts`)

**New file:** `cloud/apps/api/src/services/run/stall-detection.ts`

This module is intentionally separate from `recovery.ts` to keep both files under 400 lines.

### `STALL_THRESHOLD_MS = 3 * 60 * 1000`

### `getModelsWithPendingJobs(runId: string): Promise<string[]>`

Query PgBoss job table for modelIds with pending/active jobs for this run:

```sql
SELECT DISTINCT data->>'modelId' as model_id
FROM pgboss.job
WHERE (name = 'probe_scenario' OR name LIKE 'probe_scenario_%')
  AND state IN ('created', 'retry', 'active')
  AND data->>'runId' = $runId
```

Returns array of model IDs that still have work in flight.

### `getLastSuccessfulCompletionByModel(runId: string): Promise<Map<string, Date>>`

Query `ProbeResult` for the most recent successful completion per model:

```sql
SELECT model_id, MAX(completed_at) as last_completion
FROM probe_results
WHERE run_id = $runId
  AND status = 'SUCCESS'
  AND completed_at IS NOT NULL
GROUP BY model_id
```

Returns a `Map<modelId, lastCompletionDate>`.

### `detectStalledModels(runId: string, runStartedAt: Date): Promise<string[]>`

Combines the two queries:

1. Get `modelsWithPendingJobs` — models with active work
2. Get `lastSuccessfulByModel` — models with at least one success
3. For each model in `modelsWithPendingJobs`:
   - If no entry in `lastSuccessfulByModel`:
     - If `runStartedAt < now - STALL_THRESHOLD_MS`: mark stalled (run has been going 3+ min but this model never succeeded)
     - Otherwise: skip (run too new, give it time to produce its first result)
   - If `lastSuccessfulByModel.get(modelId) < now - STALL_THRESHOLD_MS`: mark stalled
4. Return array of stalled model IDs

**Note**: `runStartedAt` must be passed in from the caller query. The `detectAndUpdateStalledRuns()` function must include `startedAt` in its `db.run.findMany` select.

### `updateRunStalledModels(run: { id: string; stalledModels: string[] }, newStalled: string[]): Promise<void>`

1. Compute `newlyStalled = newStalled.filter(m => !run.stalledModels.includes(m))`
2. If `newlyStalled.length > 0`: emit `log.warn({ runId: run.id, newlyStalled }, 'Stall detected: models not making progress')`
3. If `newStalled` differs from `run.stalledModels`: write `db.run.update({ where: { id: run.id }, data: { stalledModels: newStalled } })`

### FR-012 (PAUSED/RESUMED grace period) — Implementation Decision

FR-012 requires skipping stall detection on the first tick after a run resumes from PAUSED. Implementing this correctly requires either a schema addition (`resumedAt` timestamp) or a complex state comparison.

**Decision:** Drop FR-012 as a hard implementation requirement. Rationale: when a run is paused, `stalledModels` is cleared (FR-009). On resume, jobs restart. Probes complete in <60 seconds under normal conditions. The first scheduler tick after resume (up to 5 min later) may briefly flag a stall, but the next tick (5 min after) will clear it once probes are completing. This is a UX nuisance (brief false positive banner), not a correctness problem. Acceptable for a log+alert-only feature. Documented in Known Limitations.

---

## Layer 3 — Recovery Scheduler Integration

**File:** `cloud/apps/api/src/services/run/recovery.ts`

Add `detectAndUpdateStalledRuns()` function at the bottom of the file. If adding this causes the file to exceed 400 lines, move it and any helpers to `stall-detection.ts` instead.

```typescript
export async function detectAndUpdateStalledRuns(): Promise<{ checked: number; newStalls: number; totalStalled: number }> {
  const runningRuns = await db.run.findMany({
    where: { status: 'RUNNING' },
    select: { id: true, stalledModels: true, startedAt: true },
  });

  let newStalls = 0;
  let totalStalled = 0;
  for (const run of runningRuns) {
    const stalled = await detectStalledModels(run.id, run.startedAt ?? new Date());
    const newlyStalled = stalled.filter(m => !run.stalledModels.includes(m));
    if (newlyStalled.length > 0) newStalls++;
    if (stalled.length > 0) totalStalled++;
    await updateRunStalledModels(run, stalled);
  }

  return { checked: runningRuns.length, newStalls, totalStalled };
}
```

**File:** `cloud/apps/api/src/services/run/scheduler.ts`

In `runRecoveryJob()`, add after the existing recovery calls:

```typescript
const stallResult = await detectAndUpdateStalledRuns();
if (stallResult.totalStalled > 0) {
  // Keep scheduler alive while stalls persist (not just when new stalls appear)
  signalRunActivity();
}
```

**Clearing on status transition (FR-009):**

Add `stalledModels: []` to the following confirmed `db.run.update` calls:

| File | Line (approx) | Status set |
|------|--------------|-----------|
| `cloud/apps/api/src/services/run/control.ts` | ~47 | PAUSED |
| `cloud/apps/api/src/services/run/control.ts` | ~146 | CANCELLED |
| `cloud/apps/api/src/services/run/progress.ts` | ~222 | COMPLETED |
| `cloud/apps/api/src/services/run/start.ts` | ~893 | FAILED (start failure) |
| `cloud/apps/api/src/services/run/recovery.ts` | ~339 | COMPLETED (recovery) |
| `cloud/apps/api/src/services/run/summarization.ts` | ~111 | (set to SUMMARIZING or COMPLETED — check and add if non-RUNNING) |
| `cloud/apps/api/src/queue/handlers/summarize-transcript.ts` | ~103 | COMPLETED |

The implementor MUST grep for all `db.run.update` calls and verify each one. Any call that sets `status` to a non-RUNNING value MUST also set `stalledModels: []`.

---

## Layer 4 — GraphQL + API Types

**File:** `cloud/apps/api/src/graphql/types/run.ts`

Add to the Run type fields:
```typescript
stalledModels: t.exposeStringList('stalledModels', {
  description: 'Model IDs currently detected as stalled (no progress for 3+ minutes while jobs are pending)',
}),
```

**File:** `cloud/apps/web/src/api/operations/runs.ts`

Add to `Run` type:
```typescript
stalledModels: string[];
```

Add to `RUN_FRAGMENT`:
```graphql
stalledModels
```

---

## Layer 5 — Frontend

**File:** `cloud/apps/web/src/pages/RunDetail/RunDetail.tsx`

**Delete:**
- `getBudgetFailureBanner()` function
- `isBudgetFailure()` function (or helper)
- All call sites and any JSX that renders the billing banner

**Add** `getStalledModelsBanner(run: Run): React.ReactNode | null`:

```typescript
function getStalledModelsBanner(run: Run): React.ReactNode | null {
  if (run.status !== 'RUNNING') return null;
  if (!run.stalledModels || run.stalledModels.length === 0) return null;
  return (
    <WarningBanner>
      {`${run.stalledModels.length} model${run.stalledModels.length > 1 ? 's are' : ' is'} stalled (no progress for 3+ minutes): ${run.stalledModels.join(', ')}`}
    </WarningBanner>
  );
}
```

Use whatever warning banner component is already in use in RunDetail.tsx for consistency.

---

## Implementation Slices

### Slice 1 — Schema + GraphQL + API types [CHECKPOINT]
- Prisma: add `stalledModels` field + migration
- GraphQL type: add `stalledModels` field on Run
- Frontend types: add `stalledModels` to `Run` type and `RUN_FRAGMENT`
- Verify: `npm run build` passes

### Slice 2 — Backend detection [CHECKPOINT]
- Create `cloud/apps/api/src/services/run/stall-detection.ts` with all functions
- Wire `detectAndUpdateStalledRuns()` into `recovery.ts`
- Wire call + `signalRunActivity()` into `scheduler.ts`
- Add `stalledModels: []` clear to all status transition sites
- Verify: `npm run build` passes; add unit tests for `detectStalledModels()`

### Slice 3 — Frontend [CHECKPOINT]
- Remove `getBudgetFailureBanner()` and `isBudgetFailure()` from RunDetail.tsx
- Add `getStalledModelsBanner()` with stall banner
- Verify: `npm run build` passes; no references to old billing functions remain

---

## Risk Callouts

1. **PgBoss modelId in job data** — Verified: `data->>'modelId'` is set in all `probe_scenario` jobs (recovery.ts line 224). The per-model job count query is feasible. The existing `recovery.ts` already queries `data->>'runId'` in production without reported performance issues, so no new index is needed. The implementor should confirm `pgboss.job` has an expression index or GIN index on `data`; if not, consider adding `CREATE INDEX CONCURRENTLY ... ON pgboss.job ((data->>'runId'))` separately from the feature migration.

2. **ProbeResult SUCCESS status** — Verified: `ProbeResultStatus` enum has `SUCCESS` (not `COMPLETED`). Stall detection must filter on `status = 'SUCCESS'`.

3. **ProbeResult completedAt nullable** — `completedAt` is `DateTime?`. The query must include `AND completed_at IS NOT NULL` to avoid treating in-progress records as having completed.

4. **recovery.ts line count** — Currently 499 lines. Adding `detectAndUpdateStalledRuns()` (~20 lines) and its imports will push it to ~520. MUST move the new function to `stall-detection.ts` and import it.

5. **Status transition sites** — The clearing of `stalledModels` (FR-009) requires finding all sites where run status changes to non-RUNNING. Implementation must grep for `status: 'PAUSED'`, `status: 'COMPLETED'`, `status: 'FAILED'`, `status: 'CANCELLED'` in Prisma update calls and add the clear.

6. **FR-012 dropped** — PAUSED/RESUMED grace period not implemented (see Layer 2 decision). Brief false positive banner on resume is the accepted tradeoff.

---

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: FR-001 updated: successful completions only; failed probes do not reset stall timer. FR-011 added: signalRunActivity on stall. FR-012 added: PAUSED/RESUMED grace period. Schema NOT NULL DEFAULT specified. Latency deferred: acceptable for log+alert-only. Clock skew rejected: NTP infra. Codex#1 rejected: retries-exhausted is orphan detection scope.
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: FR-001 clarified: successful-only progress. FR-012 added: grace period after PAUSED->RUNNING. FR-009: stalledModels cleared on pause. PAIRED_BATCH attribution flagged for plan. Clock skew rejected: theoretical. Query perf deferred to plan.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: FR-001: successful-only completions. FR-011: signalRunActivity keeps scheduler alive. Schema NOT NULL DEFAULT added. Codex#1 rejected: retries-exhausted is orphan detection scope. Threshold risk in Known Limitations.
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: Schema annotation fixed. signalRunActivity gated on totalStalled>0 not newStalls>0. First-probe stall fixed: use run.startedAt as fallback baseline. Status transition sites enumerated in plan. PgBoss index noted. N+1 deferred: acceptable at current scale. Race condition rejected: one-tick window, acceptable. FR-012 maintained dropped: false positive <3min resolves before next scheduler cycle. Infinite scheduler loop rejected: desired behavior.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Status transition sites enumerated explicitly in plan. First-probe stall fixed via run.startedAt. FR-012 dropped test case noted: brief false positive expected on first tick after resume, clears on next. Time-based logic: tests should mock Date.now(). Job name coupling acknowledged as implementation gotcha.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: First-probe stall fixed: use run.startedAt as baseline when no SUCCESS exists. signalRunActivity gated on totalStalled>0. Status transition sites enumerated in plan. FR-012 dropped: maintained decision, false positive <3min. Concurrent writers: acceptable last-write-wins at current scheduler frequency.
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: Schema syntax in tasks.md is correct — corruption was in plan.md only. null startedAt: skip with error log instead of fallback to new Date(). Use job.createdOn deferred: runStartedAt is sufficient approximation for v1. Model ID display rejected: model IDs are human-readable strings not CUIDs. Grep step added to T2.3.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: Unit tests added as T2.4 (9 cases). Schema syntax correct in tasks.md. Threshold 3min acknowledged as Known Limitation. Scalability deferred. null startedAt: skip with error log. Grep added to T2.3.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: null startedAt: skip with error log, no fallback. T2.3 grep step added. Unit tests added as T2.4. Prisma migrate note updated to use --create-only first. Model ID display: IDs are human-readable.

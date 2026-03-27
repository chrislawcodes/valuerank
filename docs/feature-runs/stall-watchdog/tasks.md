# Tasks: stall-watchdog

Each slice is independently committable. No slice should exceed ~300 lines changed. Build must pass at each `[CHECKPOINT]`.

---

## Slice 1 — DB schema + GraphQL + frontend types [CHECKPOINT]

### T1.1 — Add `stalledModels` to Prisma schema

**File:** `cloud/packages/db/prisma/schema.prisma`

In the `Run` model, add after the existing array fields:
```prisma
stalledModels String[] @default([]) @map("stalled_models")
```

Run from `cloud/`:
```bash
npx prisma migrate dev --create-only --name add_stalled_models
```
Review the generated migration SQL to confirm it contains `text[] NOT NULL DEFAULT '{}'`. Then apply:
```bash
npx prisma migrate deploy
```
Or commit the migration file and let Codex verify with `npx prisma generate`.

**Estimated diff:** ~5 lines (schema + migration file)

### T1.2 — Expose `stalledModels` in GraphQL Run type

**File:** `cloud/apps/api/src/graphql/types/run.ts`

Find the Run type field definitions. Add:
```typescript
stalledModels: t.exposeStringList('stalledModels', {
  description: 'Model IDs currently detected as stalled (no successful probe completion for 3+ minutes while jobs are pending)',
}),
```

**Estimated diff:** ~5 lines

### T1.3 — Add `stalledModels` to frontend types and fragment

**File:** `cloud/apps/web/src/api/operations/runs.ts`

Add to the `Run` type:
```typescript
stalledModels: string[];
```

Add to `RUN_FRAGMENT`:
```graphql
stalledModels
```

**Estimated diff:** ~5 lines

### T1 verification

```bash
cd cloud && npm run build --workspace @valuerank/api && npm run build --workspace @valuerank/web
```

Build must pass with zero TypeScript errors.

---

## Slice 2 — Backend stall detection module [CHECKPOINT]

### T2.1 — Create `stall-detection.ts`

**New file:** `cloud/apps/api/src/services/run/stall-detection.ts`

Implement:

```typescript
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('services:run:stall-detection');

export const STALL_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

export async function getModelsWithPendingJobs(runId: string): Promise<string[]> {
  const result = await db.$queryRaw<Array<{ model_id: string }>>`
    SELECT DISTINCT data->>'modelId' as model_id
    FROM pgboss.job
    WHERE (name = 'probe_scenario' OR name LIKE 'probe_scenario_%')
      AND state IN ('created', 'retry', 'active')
      AND data->>'runId' = ${runId}
  `;
  return result.map(r => r.model_id).filter(Boolean);
}

export async function getLastSuccessfulCompletionByModel(runId: string): Promise<Map<string, Date>> {
  const result = await db.$queryRaw<Array<{ model_id: string; last_completion: Date }>>`
    SELECT model_id, MAX(completed_at) as last_completion
    FROM probe_results
    WHERE run_id = ${runId}
      AND status = 'SUCCESS'
      AND completed_at IS NOT NULL
    GROUP BY model_id
  `;
  const map = new Map<string, Date>();
  for (const row of result) {
    map.set(row.model_id, row.last_completion);
  }
  return map;
}

export async function detectStalledModels(runId: string, runStartedAt: Date): Promise<string[]> {
  const now = Date.now();
  const threshold = now - STALL_THRESHOLD_MS;
  const runIsOldEnough = runStartedAt.getTime() < threshold;

  const pendingModels = await getModelsWithPendingJobs(runId);
  if (pendingModels.length === 0) return [];

  const lastSuccess = await getLastSuccessfulCompletionByModel(runId);
  const stalled: string[] = [];

  for (const modelId of pendingModels) {
    const lastSuccessTime = lastSuccess.get(modelId);
    if (lastSuccessTime === undefined) {
      // Never succeeded — stall only if run has been running long enough
      if (runIsOldEnough) stalled.push(modelId);
    } else if (lastSuccessTime.getTime() < threshold) {
      stalled.push(modelId);
    }
  }

  return stalled;
}

export async function updateRunStalledModels(
  run: { id: string; stalledModels: string[] },
  newStalled: string[]
): Promise<void> {
  const newlyStalled = newStalled.filter(m => !run.stalledModels.includes(m));
  if (newlyStalled.length > 0) {
    log.warn({ runId: run.id, newlyStalled }, 'Stall detected: models not making progress');
  }

  const changed =
    newStalled.length !== run.stalledModels.length ||
    newStalled.some(m => !run.stalledModels.includes(m));

  if (changed) {
    await db.run.update({
      where: { id: run.id },
      data: { stalledModels: newStalled },
    });
  }
}

export async function detectAndUpdateStalledRuns(): Promise<{
  checked: number;
  newStalls: number;
  totalStalled: number;
}> {
  const runningRuns = await db.run.findMany({
    where: { status: 'RUNNING' },
    select: { id: true, stalledModels: true, startedAt: true },
  });

  let newStalls = 0;
  let totalStalled = 0;

  for (const run of runningRuns) {
    if (run.startedAt == null) {
      log.error({ runId: run.id }, 'RUNNING run has null startedAt — skipping stall detection');
      continue;
    }
    const stalled = await detectStalledModels(run.id, run.startedAt);
    const newlyStalled = stalled.filter(m => !run.stalledModels.includes(m));
    if (newlyStalled.length > 0) newStalls++;
    if (stalled.length > 0) totalStalled++;
    await updateRunStalledModels(run, stalled);
  }

  return { checked: runningRuns.length, newStalls, totalStalled };
}
```

**Estimated diff:** ~90 lines

### T2.2 — Wire stall detection into recovery scheduler

**File:** `cloud/apps/api/src/services/run/scheduler.ts`

Add import at top:
```typescript
import { detectAndUpdateStalledRuns } from './stall-detection.js';
```

In `runRecoveryJob()`, add after the existing `recoverOrphanedRuns` and `detectAndRecoverStuckJobs` calls:
```typescript
const stallResult = await detectAndUpdateStalledRuns();
if (stallResult.totalStalled > 0) {
  // Keep scheduler alive while stalls persist (not just when new stalls appear)
  signalRunActivity();
}
```

**Estimated diff:** ~8 lines

### T2.3 — Clear `stalledModels` on status transitions (FR-009)

Add `stalledModels: []` to every `db.run.update` call that sets a non-RUNNING status.

Confirmed sites (verify each by reading the file before editing):

1. `cloud/apps/api/src/services/run/control.ts` — pauseRun (`status: 'PAUSED'`)
2. `cloud/apps/api/src/services/run/control.ts` — cancelRun (`status: 'CANCELLED'`)
3. `cloud/apps/api/src/services/run/progress.ts` — run completion (`status: 'COMPLETED'`)
4. `cloud/apps/api/src/services/run/start.ts` — start failure (`status: 'FAILED'`)
5. `cloud/apps/api/src/services/run/recovery.ts` — recovery completion (`status: 'COMPLETED'`)
6. `cloud/apps/api/src/services/run/summarization.ts` — post-summarization status update
7. `cloud/apps/api/src/queue/handlers/summarize-transcript.ts` — transcript completion

For each file, read it first, find the `db.run.update` call(s) with non-RUNNING status, and add `stalledModels: []` to the `data` object.

After all edits, run this grep to catch any missed sites:
```bash
grep -rn "db\.run\.update" cloud/apps/api/src/ --include="*.ts" | grep -v "test\|spec"
```
For each result in the grep output, verify that if `status` is set to a non-RUNNING value, `stalledModels: []` is also present.

**Estimated diff:** ~14 lines (2 lines per site × 7 sites)

### T2.4 — Unit tests for `stall-detection.ts`

**New file:** `cloud/apps/api/tests/services/run/stall-detection.test.ts`

Required test cases (mock `db.$queryRaw` and `db.run.update`):

1. **Model with pending jobs and last success >3 min ago → stalled**
2. **Model with pending jobs and last success <3 min ago → not stalled**
3. **Model with pending jobs, no prior success, run started >3 min ago → stalled** (never-succeeded case)
4. **Model with pending jobs, no prior success, run started <3 min ago → not stalled** (new run grace)
5. **Model with NO pending jobs → not stalled** (even if last success was long ago)
6. **Failed ProbeResult records do not reset stall timer** (last success is old, but failed record exists recently)
7. **Run with null `startedAt` → skipped with error log** (data integrity guard)
8. **`updateRunStalledModels`: only logs on newly stalled models** (already-stalled model does not re-log)
9. **`updateRunStalledModels`: no DB write if stalledModels unchanged**

**Estimated diff:** ~100 lines

### T2 verification

```bash
cd cloud && npm run build --workspace @valuerank/api
npm run test --workspace @valuerank/api
```

Build and tests must pass with zero errors. The 9 test cases in T2.4 must all pass.

---

## Slice 3 — Frontend: remove billing banner, add stall banner [CHECKPOINT]

### T3.1 — Remove `getBudgetFailureBanner` and `isBudgetFailure`

**File:** `cloud/apps/web/src/pages/RunDetail/RunDetail.tsx`

Search for `getBudgetFailureBanner` and `isBudgetFailure`. Delete:
- Both function definitions
- All call sites
- Any billing/budget-related banner JSX or helper strings

After deletion, confirm with `grep -n "getBudgetFailureBanner\|isBudgetFailure\|budget.*fail\|billing.*fail" cloud/apps/web/src/pages/RunDetail/RunDetail.tsx` returns no results.

**Estimated diff:** ~20-40 lines removed (exact count depends on how much billing code exists)

### T3.2 — Add stall warning banner

**File:** `cloud/apps/web/src/pages/RunDetail/RunDetail.tsx`

Add function (use whatever warning/alert component is already in the file for stylistic consistency):
```typescript
function getStalledModelsBanner(run: Run): React.ReactNode | null {
  if (run.status !== 'RUNNING') return null;
  if (run.stalledModels == null || run.stalledModels.length === 0) return null;
  const count = run.stalledModels.length;
  const label = count === 1 ? 'model is' : 'models are';
  return (
    <WarningBanner>
      {`${count} ${label} stalled (no progress for 3+ minutes): ${run.stalledModels.join(', ')}`}
    </WarningBanner>
  );
}
```

Replace `WarningBanner` with the actual component used in RunDetail.tsx. Call this function in the same location where `getBudgetFailureBanner` was called.

**Estimated diff:** ~15 lines

### T3 verification

```bash
cd cloud && npm run build --workspace @valuerank/web
npm run test --workspace @valuerank/web
grep -rn "getBudgetFailureBanner\|isBudgetFailure" cloud/apps/web/src/ && echo "FAIL: billing refs remain" || echo "PASS: no billing refs"
```

Build and tests must pass. Grep must return no results.

---

## Review Reconciliation

- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: Schema syntax in tasks.md is correct — corruption was in plan.md only. null startedAt: skip with error log instead of fallback to new Date(). Use job.createdOn deferred: runStartedAt is sufficient approximation for v1. Model ID display rejected: model IDs are human-readable strings not CUIDs. Grep step added to T2.3.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: Unit tests added as T2.4 (9 cases). Schema syntax correct in tasks.md. Threshold 3min acknowledged as Known Limitation. Scalability deferred. null startedAt: skip with error log. Grep added to T2.3.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: null startedAt: skip with error log, no fallback. T2.3 grep step added. Unit tests added as T2.4. Prisma migrate note updated to use --create-only first. Model ID display: IDs are human-readable.

# Tasks: run-status-visualization

## Wave 1 — API Data Layer [CHECKPOINT]

### T1.1 Add totalRetries to ExecutionMetrics GraphQL type
File: `cloud/apps/api/src/graphql/types/execution-metrics.ts`
- Add `totalRetries: number` to the backing type for `ExecutionMetrics` objectRef
- Add `totalRetries: t.exposeInt('totalRetries', { description: 'Total retry attempts across all probe jobs for this run' })` field

### T1.2 Add totalRetries to executionMetrics resolver
File: `cloud/apps/api/src/graphql/types/run.ts`
- Locate the `executionMetrics` field resolver
- Add `totalRetries` to the returned object via:
  ```ts
  (await db.probeResult.aggregate({
    _sum: { retryCount: true },
    where: { runId: run.id },
  }))._sum.retryCount ?? 0
  ```

### T1.3 Update web types and fragment
File: `cloud/apps/web/src/api/operations/runs.ts`
- Add `totalRetries: number` to `ExecutionMetrics` type
- Add `totalRetries` to the `executionMetrics { ... }` block in `RUN_WITH_TRANSCRIPTS_FRAGMENT`
- Add `byModel?: Array<{ modelId: string; completed: number; failed: number }>` to `RunProgress` type
- Add `byModel { modelId completed failed }` to the `runProgress { ... }` block in `RUN_WITH_TRANSCRIPTS_FRAGMENT`

### T1.4 Verify Wave 1
From `cloud/`:
```bash
npm run build --workspace @valuerank/api
npm run build --workspace @valuerank/web
```
Both must pass before committing.

---

## Wave 2 — UI Redesign [CHECKPOINT]

### T2.1 Rewrite ExecutionProgress.tsx
File: `cloud/apps/web/src/components/runs/ExecutionProgress.tsx`

Full rewrite. Keep: `PROVIDER_CONFIG`, `getProviderConfig`, `formatTime`.
Remove: `ConcurrencyGauge`, `ProviderProgressBar`, old `ProviderCard`, `RecentCompletionsFeed`.

New props:
```ts
type ExecutionProgressProps = {
  metrics: ExecutionMetrics;
  runStatus: RunStatus;
  runProgress: RunProgress | null;
  summarizeProgress: RunProgress | null;
  analysisStatus: string | null;
};
```

New structure:
1. **Stage pills row** — `① Probe › ② Summarize › ③ Analyse`, active pill has pulsing dot
2. **Job queue strip** — "N trials pending dispatch · X/min dispatch rate" (from `metrics.totalQueued`, computed from all `recentCompletions`)
3. **Provider cards grid** (3-column) — per provider:
   - Header: colored dot + provider name
   - Per-model rows: model name (font-mono) | done count | X/min throughput
   - Totals: "X done total · Y/min"
   - Footer: fill-bar (activeJobs/maxParallel) | "X/Y slots" | "N queued" | retry badge
4. **Summarize section** — slim dimmed bar from `summarizeProgress`
5. **Analyse section** — slim dimmed line from `analysisStatus`

Model-to-provider mapping: `new Set([...provider.activeModelIds, ...provider.recentCompletions.map(c => c.modelId)])` joined with `runProgress?.byModel` by modelId.

Retry badge: `metrics.totalRetries / runProgress.total` — green <0.10, amber 0.10–0.25, red >0.25. Hide entirely when `runProgress?.total` is 0 or null.

Throughput: count `recentCompletions` (filtered by modelId if per-model) with `completedAt` within last 60s.

### T2.2 Update RunProgress.tsx call site
File: `cloud/apps/web/src/components/runs/RunProgress.tsx`
- Add `runStatus`, `runProgress`, `summarizeProgress`, `analysisStatus` to the `<ExecutionProgress>` call

### T2.3 Verify Wave 2
From `cloud/`:
```bash
npm run lint --workspace @valuerank/web
npm run test --workspace @valuerank/web
npm run build --workspace @valuerank/web
```
All must pass.

---

## Quality Gate

Before PR:
1. `npm run lint --workspace @valuerank/shared`
2. `npm run lint --workspace @valuerank/db`
3. `npm run lint --workspace @valuerank/api`
4. `npm run test --workspace @valuerank/api`
5. `npm run build --workspace @valuerank/api`
6. `npm run lint --workspace @valuerank/web`
7. `npm run test --workspace @valuerank/web`
8. `npm run build --workspace @valuerank/web`

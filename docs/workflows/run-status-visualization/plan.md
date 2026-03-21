# Plan: run-status-visualization

Two independent waves. Wave 2 depends on Wave 1.

---

## Wave 1 — API Data Layer (~25 lines changed, LOW risk)

Additive changes only. Existing queries continue to work unchanged.

### execution-metrics.ts
Add `totalRetries: Int!` to the `ExecutionMetrics` objectRef backing type and the Pothos field definition.

### run.ts
In the `executionMetrics` resolver (already exists), add `totalRetries` to the returned object:
```ts
totalRetries: (await db.probeResult.aggregate({
  _sum: { retryCount: true },
  where: { runId: run.id },
}))._sum.retryCount ?? 0
```

### runs.ts (web)
1. Add `totalRetries: number` to the `ExecutionMetrics` TypeScript type
2. Add `totalRetries` to the `executionMetrics { ... }` block in `RUN_WITH_TRANSCRIPTS_FRAGMENT`
3. Add `byModel?: Array<{ modelId: string; completed: number; failed: number }>` to the `RunProgress` type
4. Add `byModel { modelId completed failed }` to the `runProgress { ... }` block in `RUN_WITH_TRANSCRIPTS_FRAGMENT`

**Verification:** `npm run build --workspace @valuerank/api && npm run build --workspace @valuerank/web` from `cloud/`

---

## Wave 2 — UI Redesign (~200 lines changed, MEDIUM risk)

Full rewrite of `ExecutionProgress.tsx`. Only `RunProgress.tsx` imports it — TypeScript enforces the prop contract at build time.

### ExecutionProgress.tsx — new props interface
```ts
type ExecutionProgressProps = {
  metrics: ExecutionMetrics;                 // existing (now includes totalRetries)
  runStatus: RunStatus;                      // NEW — stage pills
  runProgress: RunProgress | null;           // NEW — byModel done counts + retry badge denominator
  summarizeProgress: RunProgress | null;     // NEW — Summarize section
  analysisStatus: string | null;             // NEW — Analyse section
};
```

### Model-to-provider mapping strategy
`byModel` has no provider field. For each provider card, derive modelIds:
```ts
const providerModelIds = new Set([
  ...provider.activeModelIds,
  ...provider.recentCompletions.map(c => c.modelId),
]);
```
Join with `runProgress.byModel` by `modelId` for done counts.

### Per-model throughput
```ts
function computeRatePerMin(completions: CompletionEvent[], modelId?: string): number {
  const now = Date.now();
  const relevant = modelId ? completions.filter(c => c.modelId === modelId) : completions;
  return relevant.filter(c => now - new Date(c.completedAt).getTime() < 60_000).length;
}
```

### Keep from existing file
- `PROVIDER_CONFIG` color map and `getProviderConfig` helper (all 6 providers present)
- `formatTime` helper

### Remove from existing file
- `ConcurrencyGauge` (dot-pill) → replaced by fill-bar
- `ProviderProgressBar` (old) → replaced
- `ProviderCard` (old) → replaced with new inline version
- `RecentCompletionsFeed` → removed

### RunProgress.tsx — call site update
```tsx
// Before:
<ExecutionProgress metrics={run.executionMetrics} />

// After:
<ExecutionProgress
  metrics={run.executionMetrics}
  runStatus={run.status}
  runProgress={run.runProgress}
  summarizeProgress={run.summarizeProgress}
  analysisStatus={run.analysisStatus}
/>
```

**Verification:** `npm run build --workspace @valuerank/web` + `npm run lint --workspace @valuerank/web` + `npm run test --workspace @valuerank/web` from `cloud/`

---

## Risk Notes

- Wave 1: purely additive — no breaking changes to existing resolvers or fragments
- Wave 2: prop interface change is contained to one caller (`RunProgress.tsx`); TypeScript will catch any mismatch
- No migrations, no data at risk

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: See plan.md Review Reconciliation for full finding-by-finding notes.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: See plan.md Review Reconciliation for full finding-by-finding notes.
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: See plan.md Review Reconciliation for full finding-by-finding notes.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: See plan.md Review Reconciliation for full notes.
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: See plan.md Review Reconciliation for full notes.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: See plan.md Review Reconciliation for full notes.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: F1 rejected: byModel already implemented in run-progress.ts:78 and run.ts resolver. F2 rejected: provider data (recentCompletions, activeModelIds, queuedJobs) already in ProviderExecutionMetrics via metrics prop. F3 accepted: tasks.md updated to hide retry badge when runProgress?.total is 0 or null.
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: F1 rejected: byModel already server-side implemented. F2 rejected: recentCompletions and activeModelIds are in metrics.providers[]. F3 rejected: retryCount column already exists in Prisma schema. F4 accepted: API tests covered in quality gate step 4.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: Critical F1-F3 rejected: byModel already implemented server-side; provider data available in metrics.providers[]; stage pills logic fully specified in spec.md. Minor gaps covered by quality gate and spec.

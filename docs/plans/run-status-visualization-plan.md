# Run Status Visualization — Wave Plan

Generated: 2026-03-20
Feature: run-status-visualization — redesign ExecutionProgress to show provider swim-lane cards with per-model rows, stage pills, job queue strip, utilization bar, and retry badge.

## Design Summary

Replaces the existing ExecutionProgress.tsx (dot-pill ConcurrencyGauge + RecentCompletionsFeed) with:

1. **Stage pills**: Probe (active, pulsing dot) → Summarize (pending) → Analyse (pending) — driven by `run.status`
2. **Job queue strip**: "N trials pending dispatch" + "dispatch rate X/min"
3. **Per-provider cards** (3-column grid):
   - Header: colored dot + provider name
   - Per-model rows: model name (monospace) | done count | throughput rate (X/min derived from recentCompletions timestamps)
   - Totals line: "X done total · Y/min + pulsing dot"
   - Footer: utilization fill-bar (activeJobs/maxParallel) | "X/Y slots" | "N queued" | retry badge
4. **Retry badge**: totalRetries / runProgress.total — green <10%, amber 10–25%, red >25%
5. **Summarize section**: slim dimmed progress bar + counter (from `summarizeProgress`)
6. **Analyse section**: slim dimmed status line (from `analysisStatus`)

## Waves

### Wave 1 — API Data Layer
**Files**:
- `cloud/apps/api/src/graphql/types/execution-metrics.ts`
- `cloud/apps/api/src/graphql/types/run.ts`
- `cloud/apps/web/src/api/operations/runs.ts`

**Changes**:
- `execution-metrics.ts`: Add `totalRetries: Int!` field to `ExecutionMetrics` GraphQL type
- `run.ts`: In the `executionMetrics` resolver, compute `totalRetries` via `db.probeResult.aggregate({ _sum: { retryCount: true }, where: { runId: run.id } })._sum.retryCount ?? 0` and include it in the returned object
- `runs.ts` (web): Add `totalRetries` to the `ExecutionMetrics` TypeScript type and to the `executionMetrics { ... }` section of `RUN_WITH_TRANSCRIPTS_FRAGMENT`
- `runs.ts` (web): Add `byModel { modelId completed failed }` to the `runProgress { ... }` section of `RUN_WITH_TRANSCRIPTS_FRAGMENT`
- `runs.ts` (web): Add `byModel?: Array<{ modelId: string; completed: number; failed: number }>` to the `RunProgress` TypeScript type

**Do NOT touch**: Any React components. Rate-limiter service. Summarize/Analyse resolvers.

**Removed/renamed symbols**: none

**Risk**: LOW — additive schema changes. Existing queries continue to work. No UI changes.

**Verification**: `npm run build --workspace @valuerank/api` + `npm run build --workspace @valuerank/web` from `cloud/`.

---

### Wave 2 — UI Redesign
**Files**:
- `cloud/apps/web/src/components/runs/ExecutionProgress.tsx` (full rewrite in place)
- `cloud/apps/web/src/components/runs/RunProgress.tsx` (update import + props passed to ExecutionProgress)

**Changes**:
- `ExecutionProgress.tsx`: Full rewrite. New props interface:
  ```ts
  type ExecutionProgressProps = {
    metrics: ExecutionMetrics;           // existing
    runStatus: RunStatus;               // NEW — for stage pills
    runProgress: RunProgress | null;    // NEW — for byModel done counts
    summarizeProgress: RunProgress | null; // NEW — for Summarize section
    analysisStatus: string | null;      // NEW — for Analyse section
  };
  ```
  Implement all new UI per design summary above.
  **Model-to-provider mapping strategy**: For each provider card, collect unique modelIds from `Set([...provider.activeModelIds, ...provider.recentCompletions.map(c => c.modelId)])`. Join with `runProgress.byModel` by modelId for done counts.
  **Per-model throughput**: Filter `provider.recentCompletions` by `modelId`, compute rate from `completedAt` timestamps (count completions in last 60s → X/min).
  Remove inline subcomponents: `ConcurrencyGauge`, `ProviderProgressBar`, `ProviderCard` (old), `RecentCompletionsFeed` — all defined inside the current file, replace with new inline subcomponents.
  Keep `PROVIDER_CONFIG` color map and `getProviderConfig` helper (update to add any missing providers).

- `RunProgress.tsx`: Update the `<ExecutionProgress>` call site to pass new props:
  ```tsx
  <ExecutionProgress
    metrics={run.executionMetrics}
    runStatus={run.status}
    runProgress={run.runProgress}
    summarizeProgress={run.summarizeProgress}
    analysisStatus={run.analysisStatus}
  />
  ```

**Do NOT touch**: API layer. Any other components. Test files for the API.

**Removed/renamed symbols**: none (file stays named `ExecutionProgress.tsx`, export stays `ExecutionProgress`)

**Risk**: MEDIUM — touching the component shown on active runs. The prop interface change is contained: only `RunProgress.tsx` imports `ExecutionProgress`. TypeScript will catch any mismatch at build time.

**Verification**: `npm run build --workspace @valuerank/web` + `npm run lint --workspace @valuerank/web` + `npm run test --workspace @valuerank/web`. Visual check against the approved mockup.

---

## Human Gates
- **After Wave 2**: Visual review of the redesigned component against the mockup screenshot. Confirm: model names untruncated, stage pills correct, retry badge visible, Summarize/Analyse sections render when applicable.

## Cross-wave Dependencies
- Wave 2 depends on Wave 1: the new `ExecutionProgress` uses `metrics.totalRetries` (added in Wave 1) and `runProgress.byModel` (added to fragment in Wave 1). Wave 1 must be merged before Wave 2 is built.

## Adversarial Findings Addressed
1. **Subcomponent file confusion**: Gemini's plan listed `ConcurrencyGauge.tsx`, `ProviderCard.tsx`, `RecentCompletionsFeed.tsx` as standalone files to delete. Verification confirms these are all inline functions inside `ExecutionProgress.tsx` — no separate files exist. Wave 2 simply replaces them in place.
2. **Model-to-provider mapping gap**: `runProgress.byModel` has no provider field. Resolved by building a per-provider modelId set from `activeModelIds ∪ recentCompletions.map(c => c.modelId)` at render time — pragmatic and correct for the UI.
3. **V1/V2 rename over-engineering**: Gemini's Wave 2 staged a `ExecutionProgressV1` rename + scaffold. Unnecessary given that (a) only one caller exists, (b) TypeScript enforces the prop contract at build time. Collapsed to a direct in-place rewrite.
4. **Fragment name**: Gemini referred to "RunPageRunFragment" — actual name in codebase is `RUN_WITH_TRANSCRIPTS_FRAGMENT`. Wave 1 spec uses the correct name.

## Post-Deploy Verification Checklist
Not applicable — no database migrations or backfills in this feature.

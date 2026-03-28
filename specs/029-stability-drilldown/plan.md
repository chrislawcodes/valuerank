# Implementation Plan: Stability Cell Drilldown — Transcript List

**Branch**: `feat/029-stability-drilldown` | **Date**: 2026-03-28 | **Spec**: [spec.md](./spec.md)

## Summary

Unlock stability cell drilldown in paired/pooled mode by passing per-run `conditionIds` separately to `AnalysisTranscripts`, and extend the transcript page to render two labeled sections (one per vignette order) when both are present. No new GraphQL queries needed — companion data is already fetched.

---

## Technical Context

**Language/Version**: TypeScript 5.3+ / React (Vite)
**Primary Dependencies**: React Router (useSearchParams, useNavigate), existing hooks (`useRun`, `useAnalysis`)
**Storage**: None — pure frontend feature, no DB changes
**Testing**: Vitest + React Testing Library
**Target Platform**: Web app (`cloud/apps/web/`)
**Performance Goals**: SC-001 — transcript list visible within 2 seconds (no new network round-trips)
**Constraints**: `conditionIds` can collide across runs — must be passed as two separate URL params
**Scale/Scope**: Two files touched: `OverviewTab.tsx`, `AnalysisTranscripts.tsx`

---

## Constitution Check

**Status**: PASS

- **File size**: Both files are large but targeted edits stay within 400-line rule for new code blocks
- **Type safety**: No `any` types; strict boolean checks required (see constitution § TypeScript Standards)
- **Testing**: Component tests required for new rendering paths
- **Router context**: All test renders must be wrapped in `<MemoryRouter>` per constitution § Frontend Component Testing

---

## Assumption Verification (MUST DO FIRST)

**Assumption 1 verified**: `AnalysisTranscripts.tsx` already fetches companion run transcripts via:
```typescript
const { run: companionRun } = useRun({ id: companionRunId, ... });
const { analysis: companionAnalysis } = useAnalysis({ runId: companionRunId, ... });
```
No new GraphQL queries needed. The companion data is available once `companionRunId` is passed via URL.

---

## Architecture Decisions

### Decision 1: Pass Per-Run `conditionIds` Separately in URL

**Chosen**: Two separate URL params — `primaryConditionIds` and `companionConditionIds`.

**Rationale**: `conditionIds` are `${rowVal}||${colVal}` strings. Both runs can produce identical IDs for the same attribute-level pairs. A single merged list loses the run attribution needed to filter each section correctly.

**How it works**:
- Before merging, call `getRepeatPatternMetrics()` per source to get each run's conditionIds for the clicked pattern
- Navigate with `primaryConditionIds=a||b,c||d&companionConditionIds=a||b,e||f`
- `AnalysisTranscripts` reads these as separate arrays and filters each run independently

**Alternatives considered**:
- Merged conditionIds with de-duplication: loses run attribution, can't split sections
- Pass `repeatPattern` only and recompute on transcripts page: would require fetching full varianceAnalysis on transcripts page (more code, more coupling)

---

### Decision 2: New `PairedPatternMetricButton` Component (small wrapper)

**Chosen**: A new focused component alongside `PatternMetricButton` in `OverviewTab.tsx`.

**Rationale**: `PatternMetricButton` takes a single merged `RepeatPatternMetrics` and constructs a URL with `conditionIds`. The paired case needs access to per-source metrics to extract per-run conditionIds. Extending the existing button adds optional props that only apply in one mode — a small new component is cleaner.

**Alternatives considered**:
- Overloading `PatternMetricButton` with optional props: adds branching to a component that's already working
- Inline button in the render: duplicates navigation logic

---

### Decision 3: Two-Section Layout in `AnalysisTranscripts`

**Chosen**: Detect `primaryConditionIds` + `companionRunId` in URL params. When both are present, render two `<section>` blocks with headings. Fall back to existing single-list layout when absent.

**Rationale**: No changes to existing single-run drilldown path. Backward-compatible — existing URLs with just `conditionIds` continue to work.

**Section labels**: Use the vignette's `name` from each run's analysis if available; otherwise label as "Run 1 / Run 2".

---

## Project Structure

### Files to Modify

```
cloud/apps/web/src/
├── components/analysis/tabs/
│   └── OverviewTab.tsx              ← Add PairedPatternMetricButton; update render condition
└── pages/
    └── AnalysisTranscripts.tsx      ← Read new URL params; add two-section layout; add repeatPattern heading
```

### Test Files to Add/Modify

```
cloud/apps/web/src/
├── components/analysis/tabs/
│   └── OverviewTab.test.tsx         ← Add paired-mode drilldown test cases
└── pages/
    └── AnalysisTranscripts.test.tsx ← Add two-section render tests + heading tests
```

---

## Implementation Steps

### Phase 1 — `OverviewTab.tsx` Changes

**1a. Extract per-run metrics for paired button**

In the render block where `isPooledAcrossRuns === true`, before rendering the static cell, compute per-source metrics:

```typescript
// Inside the per-model render loop, when isPooledAcrossRuns
const perSourceMetrics = repeatPatternSources.map((source) =>
  getRepeatPatternMetrics(modelId, source.varianceAnalysis, source.conditionRows)
);
const primaryMetrics = perSourceMetrics[0];
const companionMetrics = perSourceMetrics[1]; // defined when isPooledAcrossRuns
```

**1b. New `PairedPatternMetricButton` component**

```typescript
type PairedPatternMetricButtonProps = {
  runId: string;
  companionRunId: string;
  analysisBasePath: AnalysisBasePath;
  analysisSearchParams?: URLSearchParams | string;
  modelId: string;
  pattern: RepeatPattern;
  primaryMetrics: Extract<RepeatPatternMetrics, { status: 'available' }>;
  companionMetrics: Extract<RepeatPatternMetrics, { status: 'available' }>;
  title: string;
  rowDim: string;
  colDim: string;
};
```

Navigates to `AnalysisTranscripts` with:
- `runId`, `companionRunId`, `modelId`, `repeatPattern=<pattern>`
- `primaryConditionIds=<comma-joined>`, `companionConditionIds=<comma-joined>`
- `rowDim`, `colDim`

**1c. Update render condition**

```typescript
// Before:
{repeatMetrics.status === 'available' && !isPooledAcrossRuns ? (
  <PatternMetricButton ... />
) : (
  <SummaryCell ...>{...}</SummaryCell>
)}

// After:
{repeatMetrics.status === 'available' && repeatMetrics.counts[pattern] > 0
  ? isPooledAcrossRuns && companionRunId && primaryMetrics?.status === 'available' && companionMetrics?.status === 'available'
    ? <PairedPatternMetricButton ... />
    : !isPooledAcrossRuns
      ? <PatternMetricButton ... />
      : <SummaryCell ...>{formatPercent(...)}</SummaryCell>
  : <SummaryCell ...>{/* static text, 0% or classified count */}</SummaryCell>
}
```

Note: When `isPooledAcrossRuns` but companion isn't available (loading/failed), fall back to static cell with appropriate tooltip (see Edge Cases below).

**1d. Update tooltip for pooled cells**

When `repeatMetrics.status === 'available'` but drilldown is blocked (companion loading/failed), tooltip must NOT say "not available yet" — use loading/failed message from Edge Cases spec.

---

### Phase 2 — `AnalysisTranscripts.tsx` Changes

**2a. Read new URL params**

```typescript
const primaryConditionIdsParam = searchParams.get('primaryConditionIds') ?? '';
const companionConditionIdsParam = searchParams.get('companionConditionIds') ?? '';
const repeatPatternParam = searchParams.get('repeatPattern') as RepeatPattern | null;

const primaryConditionIds = primaryConditionIdsParam ? primaryConditionIdsParam.split(',') : [];
const companionConditionIds = companionConditionIdsParam ? companionConditionIdsParam.split(',') : [];

const isStabilityDrilldown = repeatPatternParam != null;
const isPairedStabilityDrilldown = isStabilityDrilldown && companionRunId !== '' && primaryConditionIds.length > 0;
```

**2b. Per-section filtering for paired mode**

```typescript
// Primary section
const primaryTranscripts = isPairedStabilityDrilldown
  ? filterTranscriptsForConditionIds(
      primaryRunTranscripts,
      modelId,
      primaryConditionIds,
      primaryScenarioDimensions,
      rowDim,
      colDim,
    )
  : filteredTranscripts; // existing path

// Companion section
const companionSectionTranscripts = isPairedStabilityDrilldown
  ? filterTranscriptsForConditionIds(
      companionRunTranscripts,
      modelId,
      companionConditionIds,
      companionScenarioDimensions,
      rowDim,
      colDim,
    )
  : [];
```

**2c. Page heading (FR-006)**

When `isStabilityDrilldown`:
```tsx
<h2>{REPEAT_PATTERN_LABELS[repeatPatternParam]} — {modelDisplayName}</h2>
{isPairedStabilityDrilldown && <p>Showing transcripts from both vignette orderings</p>}
```

`REPEAT_PATTERN_LABELS` maps `'noisy'` → `'Unstable'` (already defined in OverviewTab; export or duplicate).

**2d. Two-section layout**

```tsx
{isPairedStabilityDrilldown ? (
  <>
    <section>
      <h3>Primary vignette order</h3>
      {primaryTranscripts.length > 0
        ? <TranscriptList transcripts={primaryTranscripts} />
        : <p>No transcripts matched this pattern for this vignette order.</p>}
    </section>
    <section>
      <h3>Companion vignette order</h3>
      {companionSectionTranscripts.length > 0
        ? <TranscriptList transcripts={companionSectionTranscripts} />
        : <p>No transcripts matched this pattern for this vignette order.</p>}
    </section>
    {primaryTranscripts.length === 0 && companionSectionTranscripts.length === 0 && (
      <p>No transcripts match the selected stability pattern.</p>
    )}
  </>
) : (
  // existing single-list render
)}
```

---

## Edge Cases in Code

| Case | Behavior |
|------|----------|
| Companion loading (`repeatMetrics.status === 'available'`, `isPooledAcrossRuns`, companion data not yet loaded) | Static cell, tooltip: "Loading companion run data…" |
| Companion failed/not found | Static cell, tooltip: "Companion run unavailable — drilldown disabled." |
| One section empty, one populated | Render both sections; empty section shows "No transcripts matched…" |
| Both sections empty | Render both sections + top-level "No transcripts match the selected stability pattern." |
| `repeatPattern=noisy` in URL | Display label "Unstable" (from `REPEAT_PATTERN_LABELS`) |
| Direct URL navigation to transcripts page with missing params | Graceful fallback to existing single-list behavior |

---

## URL Format Reference

**Single-run drilldown (existing)**:
```
/analysis/runs/{runId}/transcripts?modelId=X&repeatPattern=stable&rowDim=A&colDim=B&conditionIds=a||b,c||d
```

**Paired-mode drilldown (new)**:
```
/analysis/runs/{runId}/transcripts?modelId=X&repeatPattern=stable&rowDim=A&colDim=B
  &companionRunId=Y
  &primaryConditionIds=a||b,c||d
  &companionConditionIds=a||b,e||f
```

---

## Constitution Compliance

| Requirement | This Plan |
|-------------|-----------|
| No `any` types | All new props/variables typed; use `Extract<RepeatPatternMetrics, { status: 'available' }>` |
| Strict boolean checks | Use `repeatMetrics.counts[pattern] > 0` not `!repeatMetrics.counts[pattern]` |
| File size < 400 lines | OverviewTab and AnalysisTranscripts are both already large; edits are targeted additions only |
| Router context in tests | New component tests wrapped in `<MemoryRouter>` |
| No console.log | None added |

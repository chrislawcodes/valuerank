# Implementation Plan: Pivot Canonical Fix

**Branch**: `pivot-canonical-fix` | **Date**: 2026-03-27 | **Spec**: [spec.md](./spec.md)

## Summary

Replace the raw 1-5 `modelScenarioMatrix` aggregation in `PivotAnalysisTable` with the canonical 0-2 preference scoring already used by `ConditionDecisionsTable`, and thread `companionRunId` from the pivot cell click through to `AnalysisConditionDetail` so paired mode shows both orientations.

---

## Technical Context

**Language/Version**: TypeScript 5.x, React 18
**Primary Dependencies**: Already in project — `canonicalConditionSummary.ts` (copy from worktree), no new deps
**Storage**: No database changes
**Testing**: Vitest (web) — add unit tests for canonical pivot scoring
**Target Platform**: React SPA (web app)
**Performance Goals**: No new data fetching; transcripts already available in `AnalysisPanel`
**Constraints**: Must not break single-mode behavior; must be backwards compatible with old URLs lacking `companionRunId`
**Scale/Scope**: 5 frontend files only

---

## Constitution Check

**Status**: PASS

- ✅ No `any` types — uses typed `Transcript[]` and `CanonicalConditionSummary`
- ✅ No `console.log` — no logging needed in UI component
- ✅ React components ≤ 400 lines — `PivotAnalysisTable` (371 lines) stays under limit after edits
- ✅ TypeScript strict mode — no new `any` introduced
- ✅ Frontend component tests wrapped in `<MemoryRouter>` where needed

---

## Architecture Decisions

### Decision 1: Where transcripts come from for PivotAnalysisTable

**Chosen**: Thread `transcripts` down from `AnalysisPanel` → `ScenariosTab` → `PivotAnalysisTable`

**Rationale**: Transcripts are already fetched and available in `AnalysisPanel` via `run.transcripts` (and `companionRun.transcripts` for paired mode). The canonical transcript index can be built once in `PivotAnalysisTable` using `buildCanonicalTranscriptIndex(transcripts)`. No extra fetching needed.

**Alternatives Considered**:
- Compute at AnalysisPanel level: Adds complexity at the wrong layer; pivot-specific aggregation belongs in PivotAnalysisTable
- Add a new GraphQL query: Unnecessary — transcripts already loaded on the page

**Tradeoffs**:
- Pros: Zero new network calls; consistent with how `ConditionDecisionsTable` (already canonical) receives transcripts in the worktree
- Cons: Slightly deeper prop drilling (3 hops), acceptable given the component hierarchy

---

### Decision 2: Handling paired mode — prefixing transcript scenario IDs

**Chosen**: Build `scenariosTranscripts` in `AnalysisPanel` using `prefixTranscriptScenarioIds` (same approach as worktree). In paired mode, prefix canonical transcripts as `canonical:<scenarioId>` and flipped transcripts as `flipped:<scenarioId>` to match the prefixed keys in `decisionsVisualizationData.scenarioDimensions`.

**Rationale**: `mergePairedVisualizationData` already prefixes scenario IDs in `scenarioDimensions` and `modelScenarioMatrix`. The canonical transcript index must use the same keys to match transcripts to the right pivot cells.

**Alternatives Considered**:
- Match by original scenario ID and de-prefix at lookup time: Fragile; would require reverse-mapping logic
- Don't support paired mode in pivot: Leaves the bug partially unfixed

**Tradeoffs**:
- Pros: Exactly mirrors the existing paired approach in the worktree; transcript lookup is O(1) via the Map index
- Cons: Transcripts are shallow-cloned with a mutated `scenarioId` — acceptable since it's a derived view

---

### Decision 3: Companion run discovery in AnalysisConditionDetail

**Chosen**: Read `companionRunId` from URL search params first; if not present, fall back to the existing `findCompanionPairedRun` heuristic.

**Rationale**: The heuristic (`findCompanionPairedRun`) loads 1000 runs and pattern-matches — it works but can be slow or fail. When `PivotAnalysisTable` explicitly passes `companionRunId`, we can skip the heuristic entirely. Adding the URL-param hint is a backwards-compatible additive change.

**Tradeoffs**:
- Pros: Fast path for new navigation; old URLs still work
- Cons: None — purely additive

---

## Project Structure

Files changed (5 total, all under `cloud/apps/web/src/`):

```
cloud/apps/web/src/
├── utils/
│   └── canonicalConditionSummary.ts       ← NEW (copied from worktree)
├── components/analysis/
│   ├── AnalysisPanel.tsx                  ← Add prefixTranscriptScenarioIds,
│   │                                         scenariosTranscripts, pass to ScenariosTab
│   ├── PivotAnalysisTable.tsx             ← Switch to canonical scoring,
│   │                                         add transcripts + companionRunId props,
│   │                                         fix handleCellClick
│   └── tabs/
│       └── ScenariosTab.tsx               ← Add transcripts prop, pass to PivotAnalysisTable
└── pages/
    └── AnalysisConditionDetail.tsx        ← Read companionRunId from URL first
```

---

## Implementation Steps

### Phase 1 — Canonical utility (1 file, ~159 lines, copy-only)

1. Copy `canonicalConditionSummary.ts` from `.worktrees/analysis-transcripts-canonical-v2-cleanup/cloud/apps/web/src/utils/` to `cloud/apps/web/src/utils/canonicalConditionSummary.ts`. No modifications needed.

---

### Phase 2 — Thread transcripts down the prop chain (3 files)

**AnalysisPanel.tsx** changes:
- Add `prefixTranscriptScenarioIds(transcripts, prefix)` helper function (copied from worktree)
- Add `scenariosTranscripts` memo: single mode = `transcripts ?? []`; paired mode = `[...prefixTranscriptScenarioIds(transcripts ?? [], 'canonical'), ...prefixTranscriptScenarioIds(companionRun?.transcripts ?? [], 'flipped')]`
- Pass `transcripts={scenariosTranscripts}` to `<ScenariosTab>`

**ScenariosTab.tsx** changes:
- Add `transcripts?: Transcript[]` to `ScenariosTabProps`
- Accept `transcripts` in destructure
- Pass `transcripts={transcripts}`, `analysisMode={analysisMode}`, `companionRunId={analysisMode === 'paired' ? companionRunId ?? null : null}` to `<PivotAnalysisTable>`

**PivotAnalysisTable.tsx** changes:
- Add `transcripts?: Transcript[]` and `companionRunId?: string | null` to `PivotAnalysisTableProps`
- Import `buildCanonicalTranscriptIndex`, `collectCanonicalConditionTranscripts`, `summarizeCanonicalConditionTranscripts`, `getCanonicalConditionBackground`, `getCanonicalConditionTextColor` from `../../utils/canonicalConditionSummary`
- Add `transcriptIndex` memo: `useMemo(() => buildCanonicalTranscriptIndex(transcripts), [transcripts])`
- Replace `pivotData` computation: instead of `{ sum, count }` per cell, collect scenarioIds per cell then call `collectCanonicalConditionTranscripts(transcriptIndex, selectedModel, scenarioIds)` and `summarizeCanonicalConditionTranscripts(cellTranscripts)` → store `CanonicalConditionSummary`
- Replace `getHeatmapColor(mean)` with `getCanonicalConditionBackground(summary.displayScore, summary.isOpponent)` (only when `displayScore != null`)
- Replace `getScoreTextColor(mean)` with `getCanonicalConditionTextColor(summary.isOpponent)`
- Display `summary.displayScore?.toFixed(2)` instead of `mean.toFixed(2)`
- Update `legendCounts` to use canonical buckets (strongly → low, neutral → neutral, opponentStrongly → high) based on per-transcript counts across all scenarios
- Add `companionRunId` to `handleCellClick` params object when truthy

---

### Phase 3 — AnalysisConditionDetail companion run hint (1 file)

**AnalysisConditionDetail.tsx** changes:
- Extract `companionRunIdHint = searchParams.get('companionRunId') ?? null`
- When `analysisMode === 'paired'`:
  - If `companionRunIdHint` is non-null: skip `useRuns` call and use `companionRunIdHint` directly as the companion run ID to fetch
  - If `companionRunIdHint` is null: fall back to existing `findCompanionPairedRun` logic (no regression)

---

## Key Types

```typescript
// From canonicalConditionSummary.ts (already defined)
type CanonicalConditionSummary = {
  strongly: number; somewhat: number; neutral: number;
  opponentSomewhat: number; opponentStrongly: number;
  unknownCount: number; totalTrials: number;
  selectedValueWinRate: number | null;
  meanPreferenceScore: number | null;
  opponentMeanPreferenceScore: number | null;
  displayScore: number | null;  // whichever side wins; 0-2
  isOpponent: boolean;
};

// PivotAnalysisTable pivotData cell changes from:
//   { sum: number, count: number }
// to:
//   { summary: CanonicalConditionSummary, scenarioIds: string[] }
```

---

## Preflight Gate

Run from `cloud/`:
```bash
npm run lint --workspace @valuerank/web
npm run test --workspace @valuerank/web
npm run build --workspace @valuerank/web
```

All must pass before PR creation.

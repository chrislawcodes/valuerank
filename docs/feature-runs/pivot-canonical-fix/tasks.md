# Tasks: Pivot Canonical Fix

**Prerequisites**: spec.md, plan.md
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in the same phase
- **[US1]**: Pivot cells show correct 0-2 preference score
- **[US2]**: Paired mode pivot cell click shows all 10 transcripts
- Include exact file paths from plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the feature branch and copy the canonical utility.

- [ ] T001 Create feature branch: `git checkout -b pivot-canonical-fix`
- [ ] T002 Copy `canonicalConditionSummary.ts` from `.worktrees/analysis-transcripts-canonical-v2-cleanup/cloud/apps/web/src/utils/canonicalConditionSummary.ts` → `cloud/apps/web/src/utils/canonicalConditionSummary.ts` (no modifications)

**Checkpoint**: `canonicalConditionSummary.ts` exists and exports `summarizeCanonicalConditionTranscripts`, `buildCanonicalTranscriptIndex`, `collectCanonicalConditionTranscripts`, `getCanonicalConditionBackground`, `getCanonicalConditionTextColor`

---

## Phase 2: Foundation — Thread Transcripts Down the Prop Chain

**Purpose**: Wire `transcripts` (prefixed for paired mode) from `AnalysisPanel` through `ScenariosTab` to `PivotAnalysisTable`. Must complete before canonical scoring (US1) and companion-run threading (US2) can be tested end-to-end.

⚠️ **CRITICAL**: US1 and US2 both depend on T003–T005.

- [ ] T003 [US1] `cloud/apps/web/src/components/analysis/AnalysisPanel.tsx` — Add `prefixTranscriptScenarioIds(transcripts, prefix)` helper (same logic as worktree): map each transcript to `{ ...transcript, scenarioId: \`${prefix}:${transcript.scenarioId}\` }` (skip if `scenarioId` is null/empty)
- [ ] T004 [US1] `cloud/apps/web/src/components/analysis/AnalysisPanel.tsx` — Add `scenariosTranscripts` useMemo: single mode = `transcripts ?? []`; paired mode = `[...prefixTranscriptScenarioIds(transcripts ?? [], 'canonical'), ...prefixTranscriptScenarioIds(companionRun?.transcripts ?? [], 'flipped')]`
- [ ] T005 [US1] `cloud/apps/web/src/components/analysis/AnalysisPanel.tsx` — Pass `transcripts={scenariosTranscripts}` to `<ScenariosTab>` (add to existing ScenariosTab call at line ~593)
- [ ] T006 [US1] `cloud/apps/web/src/components/analysis/tabs/ScenariosTab.tsx` — Add `transcripts?: Transcript[]` to `ScenariosTabProps` type and destructure; add import `import type { Transcript } from '../../../api/operations/runs'`
- [ ] T007 [US1] `cloud/apps/web/src/components/analysis/tabs/ScenariosTab.tsx` — Pass `transcripts={transcripts}`, `analysisMode={analysisMode}`, `companionRunId={analysisMode === 'paired' ? companionRunId ?? null : null}` to `<PivotAnalysisTable>`

**Checkpoint**: TypeScript compiles; `ScenariosTab` now accepts and forwards transcripts. PivotAnalysisTable receives transcripts but still uses old scoring (will be fixed in Phase 3).

---

## Phase 3: User Story 1 — Canonical Scoring in PivotAnalysisTable (P1) 🎯 MVP

**Goal**: Replace raw 1-5 aggregation with canonical 0-2 scoring in all cell computations, heatmap colors, and legend counts.

**Independent Test**: Open any vignette Scenarios tab. No cell should show > 2.0. All-strongly-support cells should show 2.0.

### Implementation

- [ ] T008 [US1] `cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx` — Add props `transcripts?: Transcript[]` and `companionRunId?: string | null` to `PivotAnalysisTableProps`; add import of `Transcript` from `../../api/operations/runs`
- [ ] T009 [US1] `cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx` — Add imports: `buildCanonicalTranscriptIndex`, `collectCanonicalConditionTranscripts`, `summarizeCanonicalConditionTranscripts`, `getCanonicalConditionBackground`, `getCanonicalConditionTextColor` from `../../utils/canonicalConditionSummary`
- [ ] T010 [US1] `cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx` — Add `transcriptIndex` memo: `const transcriptIndex = useMemo(() => buildCanonicalTranscriptIndex(transcripts), [transcripts])`
- [ ] T011 [US1] `cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx` — Replace `pivotData` cell accumulation: instead of `{ sum, count }`, build `scenarioIdsByCell: Record<string, Record<string, string[]>>` keyed by `[rVal][cVal]`, then for each cell call `collectCanonicalConditionTranscripts(transcriptIndex, selectedModel, scenarioIds)` and `summarizeCanonicalConditionTranscripts(cellTranscripts)` to produce `CanonicalConditionSummary`; store summary in grid
- [ ] T012 [US1] `cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx` — Update cell rendering: replace `getHeatmapColor(mean)` with `getCanonicalConditionBackground(summary.displayScore ?? 0, summary.isOpponent)` (only apply when `summary.displayScore != null`); replace `getScoreTextColor(mean)` with `getCanonicalConditionTextColor(summary.isOpponent)`; display `summary.displayScore?.toFixed(2)` instead of `mean.toFixed(2)`; show `—` when `summary.displayScore == null || summary.totalTrials === 0`
- [ ] T013 [US1] `cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx` — Update `legendCounts` useMemo: iterate all transcripts for selected model, count `strongly` + `somewhat` → low, `neutral` → neutral, `opponentStrongly` + `opponentSomewhat` → high using canonical buckets (remove old 1-5 thresholds)
- [ ] T014 [US1] `cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx` — Remove now-unused `getHeatmapColor` and `getScoreTextColor` functions (they relied on 1-5 scale and are fully replaced)

**Checkpoint**: Pivot cells show 0-2 scores. No cell exceeds 2.0. All-strongly cells show 2.0. Colors are blue (selected) or orange (opponent).

---

## Phase 4: User Story 2 — Thread companionRunId Through Cell Click (P1)

**Goal**: Clicking a pivot cell in paired mode passes `companionRunId` in the URL; `AnalysisConditionDetail` uses it directly.

**Independent Test**: Click a paired-mode pivot cell → URL contains `companionRunId` → detail page shows Pooled row with ~10 transcripts.

### Implementation

- [ ] T015 [US2] `cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx` — Update `handleCellClick`: add `if (companionRunId) params.set('companionRunId', companionRunId)` before navigate call
- [ ] T016 [US2] `cloud/apps/web/src/pages/AnalysisConditionDetail.tsx` — Add `const companionRunIdHint = searchParams.get('companionRunId')` after existing `useSearchParams` call (line ~153)
- [ ] T017 [US2] `cloud/apps/web/src/pages/AnalysisConditionDetail.tsx` — Update companion run logic: if `analysisMode === 'paired' && companionRunIdHint != null`, skip `useRuns` (pass `pause: true`) and use `companionRunIdHint` directly as the companion run ID for `useRun`; if `companionRunIdHint` is null, use existing `findCompanionPairedRun` path (no regression)

**Checkpoint**: Navigating from pivot cell in paired mode → URL has `companionRunId` → detail page shows Pooled row with both run's transcripts.

---

## Phase 5: Polish & Validation

**Purpose**: Ensure no regressions, TypeScript passes, preflight gate passes.

- [ ] T018 Verify `npm run build --workspace @valuerank/web` passes (no TS errors)
- [ ] T019 Verify `npm run lint --workspace @valuerank/web` passes
- [ ] T020 Verify `npm run test --workspace @valuerank/web` passes
- [ ] T021 Manual test: open single-mode vignette Scenarios tab — pivot table renders, no scores > 2.0
- [ ] T022 Manual test: open paired-mode vignette Scenarios tab — click a cell — URL contains `companionRunId` — detail page Pooled row shows combined transcript count

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies
- **Phase 2 (Foundation)**: Depends on Phase 1 (needs utility file)
- **Phase 3 (US1 Canonical Scoring)**: Depends on Phase 2
- **Phase 4 (US2 CompanionRunId)**: T015 depends on Phase 2 (T007 must pass `companionRunId` prop); T016–T017 are independent of Phase 3
- **Phase 5 (Polish)**: Depends on Phases 3 + 4

### Task-Level Dependencies

- T003 → T004 → T005 (sequential: all in AnalysisPanel, order matters)
- T006 → T007 (sequential: type must exist before passing)
- T008 → T009 → T010 → T011 → T012 (sequential: each builds on previous)
- T013 can run after T010 (independent of T011/T012)
- T014 runs after T012 (removes functions only after they're no longer used)
- T015 depends on T007 (needs `companionRunId` prop to be wired)
- T016, T017 are independent of Phase 3 — can start any time after Phase 2

### Parallel Opportunities

- Phase 3 (T008–T014) and Phase 4 T016/T017 can proceed in parallel once Phase 2 is done

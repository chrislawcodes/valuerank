# Tasks: Stability Cell Drilldown — Transcript List (029)

**Prerequisites**: plan.md, spec.md
**Branch**: `feat/029-stability-drilldown`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in same phase
- **[US#]**: User story label (user story phases only)
- Exact file paths from plan.md

---

## Phase 1: Foundation (Shared Prerequisites)

**Purpose**: Shared code needed by multiple phases. No user story work can begin until this is complete.

- [ ] T001 Verify assumption: confirm `AnalysisTranscripts.tsx` already fetches companion run transcripts via `useRun`/`useAnalysis` hooks for `companionRunId` — read lines 200–220 of `cloud/apps/web/src/pages/AnalysisTranscripts.tsx` and confirm no new GraphQL query is needed
- [ ] T002 Export `REPEAT_PATTERN_LABELS` from `cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx` (currently defined inline) so `AnalysisTranscripts.tsx` can use it for heading display without duplication

**Checkpoint**: Assumption confirmed; `REPEAT_PATTERN_LABELS` exported — user story implementation can begin.

---

## Phase 2: User Story 2 — Paired/pooled drilldown (Priority: P1) 🎯 MVP

**Goal**: Researchers can click stability cells in paired mode and see a two-section transcript list.

**Independent Test**: Open a paired analysis, click a non-zero stability cell → transcript list shows two labeled sections, one per vignette order. See quickstart.md § Testing User Story 2.

### OverviewTab Changes

- [ ] T003 [US2] In `cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx`: compute per-source metrics before merging — add `const perSourceMetrics = repeatPatternSources.map(...)` in the per-model render loop using the existing `getRepeatPatternMetrics` function
- [ ] T004 [US2] Create `PairedPatternMetricButton` component in `cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx` (alongside existing `PatternMetricButton`) with props: `runId`, `companionRunId`, `analysisBasePath`, `analysisSearchParams`, `modelId`, `pattern`, `primaryMetrics`, `companionMetrics`, `title`, `rowDim`, `colDim`
- [ ] T005 [US2] Implement navigation in `PairedPatternMetricButton`: build URL with `primaryConditionIds` and `companionConditionIds` as separate comma-joined params (per plan.md URL Format Reference), plus `repeatPattern`, `runId`, `companionRunId`, `modelId`, `rowDim`, `colDim`
- [ ] T006 [US2] Update the render condition in `OverviewTab.tsx` that currently blocks paired drilldown: replace the `!isPooledAcrossRuns` guard with the three-way branch described in plan.md § Phase 1c — render `PairedPatternMetricButton` when pooled + companion available + count > 0; render `PatternMetricButton` when single-run + count > 0; render static `SummaryCell` otherwise
- [ ] T007 [US2] Update tooltip text on static cells for pooled mode: when companion is loading show "Loading companion run data…"; when companion failed/not found show "Companion run unavailable — drilldown disabled." — remove the old "transcript drilldown is not available from this pooled summary cell yet" text (FR-007)

### AnalysisTranscripts Changes

- [ ] T008 [US2] In `cloud/apps/web/src/pages/AnalysisTranscripts.tsx`: read three new URL params — `primaryConditionIds`, `companionConditionIds`, `repeatPattern` — and compute `primaryConditionIds: string[]`, `companionConditionIds: string[]`, `isStabilityDrilldown: boolean`, `isPairedStabilityDrilldown: boolean` from them
- [ ] T009 [US2] Add per-section filtering for paired stability drilldown in `AnalysisTranscripts.tsx`: when `isPairedStabilityDrilldown`, call `filterTranscriptsForConditionIds` twice — once with primary run transcripts + `primaryConditionIds`, once with companion run transcripts + `companionConditionIds` (each section uses its own run's `scenarioDimensions`)
- [ ] T010 [US2] Render two-section layout in `AnalysisTranscripts.tsx` when `isPairedStabilityDrilldown`: "Primary vignette order" section + "Companion vignette order" section, each with its own filtered transcript list; if a section is empty show "No transcripts matched this pattern for this vignette order."; if BOTH are empty show "No transcripts match the selected stability pattern." (per FR-005)

**Checkpoint**: US2 fully functional — paired stability cells clickable, two-section transcript list renders correctly.

---

## Phase 3: User Story 1 — Single-run drilldown verification (Priority: P1)

**Goal**: Confirm existing single-run behavior is preserved and zero-count cells remain non-clickable.

**Independent Test**: Open single-run analysis, click non-zero cell → transcript list; find 0% cell → static text. See quickstart.md § Testing User Story 1.

- [ ] T011 [US1] Verify that the Phase 2 render condition changes in `OverviewTab.tsx` preserve existing single-run behavior: non-zero cells still render `PatternMetricButton`; zero-count cells still render static `SummaryCell` — read the updated render block and confirm no regression
- [ ] T012 [US1] Add/update tests in `cloud/apps/web/src/components/analysis/tabs/OverviewTab.test.tsx` (or create if missing): (a) single-run, count > 0 → `PatternMetricButton` rendered; (b) single-run, count = 0 → static text, no click; (c) paired, count > 0, companion available → `PairedPatternMetricButton` rendered; (d) paired, count > 0, companion loading → static cell with loading tooltip

**Checkpoint**: US1 behavior confirmed; regressions covered by tests.

---

## Phase 4: User Story 3 — Transcript list page heading (Priority: P2)

**Goal**: Page heading identifies stability pattern name and human-readable model name.

**Independent Test**: Click any stability cell → heading shows e.g. "Torn — GPT-4o"; clicking Unstable cell shows "Unstable" (not "noisy"). See quickstart.md § Testing User Story 3.

- [ ] T013 [US3] In `cloud/apps/web/src/pages/AnalysisTranscripts.tsx`: when `isStabilityDrilldown`, render a heading/subtitle that shows `REPEAT_PATTERN_LABELS[repeatPattern]` (imported from T002 export) and the human-readable model name (look up from the run's model list, fall back to `modelId` if not found)
- [ ] T014 [US3] In `AnalysisTranscripts.tsx`: when `isPairedStabilityDrilldown`, add secondary label below heading: "Showing transcripts from both vignette orderings" (per US3 acceptance scenario 2)
- [ ] T015 [US3] Add tests in `cloud/apps/web/src/pages/AnalysisTranscripts.test.tsx`: (a) `repeatPattern=torn` → heading contains "Torn"; (b) `repeatPattern=noisy` → heading contains "Unstable" not "noisy"; (c) `isPairedStabilityDrilldown` → secondary label present

**Checkpoint**: US3 complete — page heading is descriptive; "noisy"→"Unstable" label mapping confirmed.

---

## Phase 5: Polish & Validation

**Purpose**: Preflight gate, cross-cutting cleanup.

- [ ] T016 [P] Run preflight from `cloud/`: `npm run lint --workspace @valuerank/web`
- [ ] T017 [P] Run preflight from `cloud/`: `npm run test --workspace @valuerank/web`
- [ ] T018 Run preflight from `cloud/`: `npm run build --workspace @valuerank/web`
- [ ] T019 Manual smoke test against local dev server per quickstart.md — all three user stories

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundation (Phase 1)**: No dependencies — do first
- **US2 (Phase 2)**: Depends on Phase 1 (needs T001 confirmation + T002 export)
- **US1 (Phase 3)**: Depends on Phase 2 (tests verify Phase 2 render condition)
- **US3 (Phase 4)**: Depends on Phase 1 T002 export only — can overlap with Phase 3
- **Polish (Phase 5)**: Depends on Phases 2–4 complete

### Parallel Opportunities Within Phases

- **Phase 2**: T003–T007 (OverviewTab) and T008–T010 (AnalysisTranscripts) can be worked in parallel by two developers — different files, no intra-phase dependency
- **Phase 5**: T016 and T017 can run in parallel (lint vs test)

### Critical Path

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T016/T017/T018 → T019

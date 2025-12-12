# Tasks: Analysis Tab

**Prerequisites**: plan.md, spec.md
**Branch**: `feat/016-analysis-tab`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1-US5)
- Include exact file paths from plan.md

---

## Phase 1: Setup

**Purpose**: Create feature branch and verify environment

- [X] T001 Create feature branch `feat/016-analysis-tab` from main
- [X] T002 Verify dev environment running (`npm run dev` in cloud/)
- [X] T003 Verify test database has runs with analysis data

**Checkpoint**: Environment ready for development

---

## Phase 2: Foundation (Backend API Extension)

**Purpose**: Extend GraphQL API to support filtering runs by analysis status - BLOCKS all frontend work

- [X] T004 Add `hasAnalysis` filter parameter to `runs` query in `apps/api/src/graphql/queries/run.ts`
- [X] T005 Add `analysisStatus` filter parameter to `runs` query (for CURRENT/SUPERSEDED filtering)
- [X] T006 Write API test for new filter parameters in `apps/api/tests/graphql/queries/run.test.ts`
- [X] T007 [P] Update `apps/web/src/api/operations/runs.ts` - add `hasAnalysis` and `analysisStatus` to RUNS_QUERY variables

**Checkpoint**: Backend API supports analysis filtering - frontend work can begin

---

## Phase 3: User Story 1 - Browse Analysis Results (Priority: P1)

**Goal**: Users can browse completed analysis results in a dedicated tab

**Independent Test**: Navigate to /analysis tab, see list of runs with analysis, verify sorting by computed date

### Implementation for User Story 1

- [X] T008 [P] [US1] Create `apps/web/src/hooks/useRunsWithAnalysis.ts` - hook wrapping useRuns with hasAnalysis:true
- [X] T009 [P] [US1] Create `apps/web/src/components/analysis/AnalysisCard.tsx` - card displaying run with analysis info
- [X] T010 [US1] Create `apps/web/src/pages/Analysis.tsx` - list page using useRunsWithAnalysis and AnalysisCard
- [X] T011 [US1] Add `/analysis` route to `apps/web/src/App.tsx`
- [X] T012 [US1] Write test for AnalysisCard in `apps/web/src/components/analysis/AnalysisCard.test.tsx`

**Checkpoint**: User Story 1 complete - users can browse analysis list at /analysis

---

## Phase 4: User Story 2 - Filter and Search Analysis (Priority: P1)

**Goal**: Users can filter and organize analysis results with status, tags, and view modes

**Independent Test**: On Analysis tab, apply filters, verify results update correctly

### Implementation for User Story 2

- [X] T013 [P] [US2] Create `apps/web/src/components/analysis/AnalysisListFilters.tsx` - filters for status, tags, view mode
- [X] T014 [P] [US2] Create `apps/web/src/components/analysis/AnalysisFolderView.tsx` - folder view grouped by definition tags
- [X] T015 [US2] Update `apps/web/src/pages/Analysis.tsx` - integrate AnalysisListFilters and AnalysisFolderView
- [X] T016 [US2] Add pagination controls to Analysis.tsx (10 per page, flat view only)
- [X] T017 [US2] Write test for AnalysisListFilters in `apps/web/src/components/analysis/AnalysisListFilters.test.tsx`

**Checkpoint**: User Story 2 complete - filtering, view modes, and pagination work

---

## Phase 5: User Story 3 - View Analysis Detail Page (Priority: P1)

**Goal**: Users can access a dedicated analysis detail page with all 6 tabs

**Independent Test**: Navigate to /analysis/<runId>, see full AnalysisPanel with all tabs

### Implementation for User Story 3

- [X] T018 [US3] Create `apps/web/src/pages/AnalysisDetail.tsx` - detail page wrapping AnalysisPanel
- [X] T019 [US3] Add header with "Back to Analysis" button and "View Run" link to AnalysisDetail.tsx
- [X] T020 [US3] Add `/analysis/:id` route to `apps/web/src/App.tsx`
- [X] T021 [US3] Handle error state in AnalysisDetail.tsx for invalid/missing analysis
- [X] T022 [US3] Write test for AnalysisDetail in `apps/web/src/pages/AnalysisDetail.test.tsx`

**Checkpoint**: User Story 3 complete - analysis detail page shows all information

---

## Phase 6: User Story 4 - Access Analysis from Run Detail (Priority: P2)

**Goal**: Users can quickly navigate from run detail to analysis

**Independent Test**: On /runs/<id>, see "View Analysis" link, click to navigate to /analysis/<id>

### Implementation for User Story 4

- [X] T023 [US4] Modify `apps/web/src/pages/RunDetail.tsx` - add "View Analysis" link in header area
- [X] T024 [US4] Modify `apps/web/src/pages/RunDetail.tsx` - remove embedded AnalysisPanel from bottom
- [X] T025 [US4] Handle analysis states in RunDetail.tsx: available (link), computing (status), unavailable (hidden)
- [X] T026 [US4] Update RunDetail tests to verify new behavior in `apps/web/src/pages/RunDetail.test.tsx`

**Checkpoint**: User Story 4 complete - run detail links to analysis, no embedded panel

---

## Phase 7: User Story 5 - Analysis Tab Navigation (Priority: P2)

**Goal**: Analysis tab appears in main navigation with correct highlighting

**Independent Test**: Log in, see Analysis tab between Runs and Experiments, verify highlighting

### Implementation for User Story 5

- [X] T027 [US5] Modify `apps/web/src/components/layout/NavTabs.tsx` - add Analysis tab with BarChart2 icon
- [X] T028 [US5] Verify tab highlighting works on /analysis and /analysis/:id routes
- [X] T029 [US5] Update barrel export in `apps/web/src/components/analysis/index.ts`

**Checkpoint**: User Story 5 complete - navigation includes Analysis tab

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, edge cases, and documentation

- [X] T030 [P] Add empty state to Analysis.tsx for "No analysis results yet"
- [X] T031 [P] Add loading state to Analysis.tsx consistent with Runs.tsx
- [X] T032 Handle edge case: analysis computing/pending (show in list but indicate status)
- [X] T033 Handle edge case: superseded analysis (muted styling, badge)
- [X] T034 Run full test suite: `npm run test:coverage`
- [X] T035 Manual QA using quickstart.md scenarios
- [X] T036 Verify build succeeds: `npm run build`

**Checkpoint**: Feature complete and validated

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup
    │
    ▼
Phase 2: Foundation (API) ─────────────────────────────────┐
    │                                                       │
    ▼                                                       │
Phase 3: US1 - Browse (P1)                                 │
    │                                                       │
    ▼                                                       │
Phase 4: US2 - Filter (P1)                                 │
    │                                                       │
    ▼                                                       │
Phase 5: US3 - Detail (P1)                                 │
    │         │                                            │
    │         └──────────────┐                             │
    ▼                        ▼                             │
Phase 6: US4 - Run Link (P2)  Phase 7: US5 - Nav (P2)     │
    │                              │                        │
    └──────────────┬───────────────┘                       │
                   ▼                                        │
             Phase 8: Polish                                │
                   │                                        │
                   └────────────────────────────────────────┘
```

### User Story Dependencies

| Story | Depends On | Can Parallel With |
|-------|------------|-------------------|
| US1 (Browse) | Foundation | - |
| US2 (Filter) | US1 | - |
| US3 (Detail) | US1 | US2 |
| US4 (Run Link) | US3 | US5 |
| US5 (Nav) | US1 | US4 |

### Parallel Opportunities

**Within Phase 2 (Foundation)**:
- T007 can run parallel to T004-T006 (frontend vs backend)

**Within Phase 3 (US1)**:
- T008, T009 can run in parallel (different files)

**Within Phase 4 (US2)**:
- T013, T014 can run in parallel (different components)

**Within Phase 8 (Polish)**:
- T030, T031 can run in parallel (different concerns)

**Cross-Phase**:
- US4 and US5 can proceed in parallel after US3

---

## Task Statistics

- **Total Tasks**: 36
- **Phase 1 (Setup)**: 3 tasks
- **Phase 2 (Foundation)**: 4 tasks
- **Phase 3 (US1 - Browse)**: 5 tasks
- **Phase 4 (US2 - Filter)**: 5 tasks
- **Phase 5 (US3 - Detail)**: 5 tasks
- **Phase 6 (US4 - Run Link)**: 4 tasks
- **Phase 7 (US5 - Nav)**: 3 tasks
- **Phase 8 (Polish)**: 7 tasks

**Parallel Opportunities**: 8 tasks marked [P]
**MVP Tasks (P1 Stories)**: 15 tasks (US1 + US2 + US3)

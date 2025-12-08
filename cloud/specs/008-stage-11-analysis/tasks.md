# Tasks: Stage 11 - Analysis System & Visualizations

**Prerequisites**: spec.md, plan.md
**Branch**: `stage-11-analysis`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1-US8)
- Include exact file paths from plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and dependency installation

- [X] T001 Verify feature branch `stage-11-analysis` created from `cloud-planning`
- [X] T002 Install Python dependencies: `pip install scipy numpy pandas` in workers/
- [X] T003 Install web dependency: `npm install recharts` in apps/web/
- [X] T004 Run tests to verify existing functionality: `npm run test`

**Checkpoint**: Environment ready for development

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

⚠️ **CRITICAL**: No user story work can begin until this phase is complete

### Python Statistics Module

- [X] T005 Create workers/stats/__init__.py with module exports
- [X] T006 [P] Create workers/stats/confidence.py - Wilson score CI implementation
- [X] T007 [P] Create workers/stats/basic_stats.py - Win rates, means, std dev calculation
- [X] T008 [P] Create workers/stats/model_comparison.py - Spearman's rho, Cohen's d, outlier detection
- [X] T009 [P] Create workers/stats/dimension_impact.py - Variable analysis, R-squared
- [X] T010 Create workers/tests/test_stats.py - Unit tests for all stats modules (validate against scipy reference)

### Extend analyze_basic.py

- [X] T011 Update workers/analyze_basic.py - Replace stub with real implementation that uses stats/ modules
- [X] T012 Add input parsing: read transcripts, extract decision codes, scenario dimensions
- [X] T013 Add output formatting: return full AnalysisOutput schema per plan.md
- [X] T014 Create workers/tests/test_analyze_basic.py - Integration tests for full analysis

### GraphQL Types

- [X] T015 Create apps/api/src/graphql/types/analysis.ts - AnalysisResult, ContestedScenario, AnalysisWarning types
- [X] T016 Update apps/api/src/graphql/types/index.ts - Export new analysis types
- [X] T017 Update apps/api/src/graphql/types/run.ts - Add analysis and analysisStatus fields

### GraphQL Queries

- [X] T018 Create apps/api/src/graphql/queries/analysis.ts - analysis(runId) query
- [X] T019 Update apps/api/src/graphql/queries/index.ts - Export analysis query

### GraphQL Mutations

- [X] T020 Create apps/api/src/graphql/mutations/analysis.ts - recomputeAnalysis mutation
- [X] T021 Update apps/api/src/graphql/mutations/index.ts - Export analysis mutation

### Update Handler

- [X] T022 Update apps/api/src/queue/handlers/analyze-basic.ts - Update output type, bump CODE_VERSION to 1.0.0
- [X] T023 Create apps/api/tests/queue/handlers/analyze-basic.test.ts - Handler integration tests

**Checkpoint**: Foundation ready - Python computes real stats, GraphQL exposes data

---

## Phase 3: User Story 1 - View Automated Analysis on Run Completion (Priority: P1) 🎯 MVP

**Goal**: Users see analysis results when run completes

**Independent Test**: Complete a run, verify analysis section appears with per-model statistics

### Implementation for User Story 1

- [X] T024 [US1] Create apps/api/src/services/analysis/trigger.ts - Queue analyze_basic job on run completion
- [X] T025 [US1] Update apps/api/src/queue/handlers/index.ts - Wire up analysis trigger to run completion event
- [X] T026 [US1] Create apps/api/tests/services/analysis/trigger.test.ts - Unit tests for trigger logic
- [X] T027 [US1] Create apps/web/src/hooks/useAnalysis.ts - urql query hook for analysis data
- [X] T028 [US1] Create apps/web/src/components/analysis/AnalysisPanel.tsx - Main container component
- [X] T029 [US1] Create apps/web/src/components/analysis/StatCard.tsx - Reusable stat display card
- [X] T030 [US1] Update apps/web/src/pages/RunDetail.tsx - Add AnalysisPanel to run detail page
- [X] T031 [US1] Create apps/web/tests/components/analysis/AnalysisPanel.test.tsx - Component tests
- [X] T032 [US1] Create apps/web/tests/hooks/useAnalysis.test.ts - Hook tests

**Checkpoint**: US1 complete - Analysis auto-triggers and displays basic stats

---

## Phase 4: User Story 2 - View Score Distribution Visualization (Priority: P1) 🎯 MVP

**Goal**: Users see histogram of how models respond

**Independent Test**: View analysis, verify histogram shows score distribution per model

### Implementation for User Story 2

- [X] T033 [P] [US2] Create apps/web/src/components/analysis/ScoreDistributionChart.tsx - Recharts histogram
- [X] T034 [US2] Add score distribution data transformation in apps/web/src/components/analysis/AnalysisPanel.tsx
- [X] T035 [US2] Create apps/web/tests/components/analysis/ScoreDistributionChart.test.tsx - Chart tests
- [X] T036 [US2] Add value selector for filtering distribution by specific value

**Checkpoint**: US2 complete - Score distribution histogram visible

---

## Phase 5: User Story 3 - View Variable Impact Analysis (Priority: P1) 🎯 MVP

**Goal**: Users see which dimensions drive variance

**Independent Test**: View analysis, verify dimension ranking with effect sizes displayed

### Implementation for User Story 3

- [X] T037 [P] [US3] Create apps/web/src/components/analysis/VariableImpactChart.tsx - Bar chart of dimension effects
- [X] T038 [US3] Add dimension analysis data transformation in AnalysisPanel.tsx
- [X] T039 [US3] Create apps/web/tests/components/analysis/VariableImpactChart.test.tsx - Chart tests
- [X] T040 [US3] Handle edge case: definition with no dimensions (show appropriate message)

**Checkpoint**: US3 complete - Variable impact chart visible with rankings

---

## Phase 6: User Story 4 - Compare Models (Priority: P1) 🎯 MVP

**Goal**: Users see model comparison with pairwise agreement scores

**Independent Test**: View analysis with 3+ models, verify comparison matrix/chart displays

### Implementation for User Story 4

- [X] T041 [P] [US4] Create apps/web/src/components/analysis/ModelComparisonMatrix.tsx - Heatmap or comparison table
- [X] T042 [US4] Add model agreement data transformation in AnalysisPanel.tsx
- [X] T043 [US4] Create apps/web/tests/components/analysis/ModelComparisonMatrix.test.tsx - Chart tests
- [X] T044 [US4] Add outlier model highlighting (visual indicator for >2 SD from mean)
- [X] T045 [US4] Handle edge case: single model run (hide comparison section)

**Checkpoint**: US4 complete - Model comparison visible with pairwise statistics

---

## Phase 7: User Story 5 - View Statistical Method Documentation (Priority: P2)

**Goal**: Users see which methods were used for analysis

**Independent Test**: View analysis, verify methods section shows test names, alpha, correction

### Implementation for User Story 5

- [ ] T046 [P] [US5] Create apps/web/src/components/analysis/MethodsDocumentation.tsx - Expandable methods panel
- [ ] T047 [US5] Add methods data display in AnalysisPanel.tsx
- [ ] T048 [US5] Create apps/web/tests/components/analysis/MethodsDocumentation.test.tsx - Component tests
- [ ] T049 [US5] Display warnings (small sample, non-normal) with visual indicators

**Checkpoint**: US5 complete - Methods documentation visible and warnings displayed

---

## Phase 8: User Story 6 - View Analysis with Caching (Priority: P2)

**Goal**: Cached analysis loads instantly, cache invalidates on transcript changes

**Independent Test**: View analysis twice, verify second load is instant; add transcript, verify recompute

### Implementation for User Story 6

- [ ] T050 [P] [US6] Create apps/api/src/services/analysis/cache.ts - Input hash computation and validation
- [ ] T051 [US6] Update apps/api/src/queue/handlers/analyze-basic.ts - Check cache before computing
- [ ] T052 [US6] Create apps/api/tests/services/analysis/cache.test.ts - Cache logic tests
- [ ] T053 [US6] Add "computed at" timestamp display in AnalysisPanel.tsx
- [ ] T054 [US6] Add "Recompute Analysis" button wired to recomputeAnalysis mutation

**Checkpoint**: US6 complete - Caching works, recompute available

---

## Phase 9: User Story 7 - Filter Analysis by Model or Value (Priority: P2)

**Goal**: Users can filter analysis visualizations by model and/or value

**Independent Test**: Apply model filter, verify charts update; apply value filter, verify update

### Implementation for User Story 7

- [ ] T055 [P] [US7] Create apps/web/src/components/analysis/AnalysisFilters.tsx - Filter dropdowns
- [ ] T056 [US7] Add filter state management in AnalysisPanel.tsx
- [ ] T057 [US7] Update ScoreDistributionChart.tsx to respect filters
- [ ] T058 [US7] Update VariableImpactChart.tsx to respect filters
- [ ] T059 [US7] Update ModelComparisonMatrix.tsx to respect filters
- [ ] T060 [US7] Create apps/web/tests/components/analysis/AnalysisFilters.test.tsx - Filter tests
- [ ] T061 [US7] Add "Clear filters" button functionality

**Checkpoint**: US7 complete - Filtering works across all visualizations

---

## Phase 10: User Story 8 - View Most Contested Scenarios (Priority: P3)

**Goal**: Users see which scenarios had highest disagreement across models

**Independent Test**: View analysis, verify contested scenarios list shows top 5 ranked by variance

### Implementation for User Story 8

- [ ] T062 [P] [US8] Create apps/web/src/components/analysis/ContestedScenariosList.tsx - Table with ranking
- [ ] T063 [US8] Add contested scenarios data in AnalysisPanel.tsx
- [ ] T064 [US8] Create apps/web/tests/components/analysis/ContestedScenariosList.test.tsx - Component tests
- [ ] T065 [US8] Add navigation: click scenario → view transcripts for that scenario
- [ ] T066 [US8] Add "Top N" limit control (default 5)

**Checkpoint**: US8 complete - Contested scenarios list functional

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, edge cases, and documentation

### Testing & Coverage

- [ ] T067 Run full Python test suite: `pytest workers/tests/` - verify 80%+ coverage
- [ ] T068 Run full API test suite: `npm run test:coverage` in apps/api/ - verify 80%+ coverage
- [ ] T069 Run full web test suite: `npm run test:coverage` in apps/web/ - verify tests pass

### Edge Cases

- [ ] T070 Handle empty run (no successful transcripts) - show "Analysis unavailable" message
- [ ] T071 Handle analysis failure - show error with retry button
- [ ] T072 Handle very large runs (10K+ transcripts) - show progress indicator

### Documentation

- [ ] T073 Update apps/web/src/components/analysis/index.ts - Export all analysis components
- [ ] T074 Validate all user stories per quickstart.md
- [ ] T075 Typecheck passes: `npm run typecheck`
- [ ] T076 Lint passes: `npm run lint`

**Checkpoint**: Feature complete and validated

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup
    └── Phase 2: Foundation (BLOCKS all user stories)
            ├── Phase 3: US1 - Auto-analysis (P1) 🎯
            │       └── Phase 4: US2 - Score Distribution (P1) 🎯
            │               └── Phase 5: US3 - Variable Impact (P1) 🎯
            │                       └── Phase 6: US4 - Model Comparison (P1) 🎯
            │
            ├── Phase 7: US5 - Methods Documentation (P2) [can parallel with US1-4]
            ├── Phase 8: US6 - Caching (P2) [can parallel with US1-4]
            └── Phase 9: US7 - Filters (P2) [depends on US2-4 charts existing]

Phase 10: US8 - Contested Scenarios (P3) [can start after Foundation]
Phase 11: Polish [after desired stories complete]
```

### User Story Dependencies

| Story | Priority | Dependencies | Can Parallel With |
|-------|----------|--------------|-------------------|
| US1   | P1       | Foundation   | None (first)      |
| US2   | P1       | US1          | US3, US4          |
| US3   | P1       | US1          | US2, US4          |
| US4   | P1       | US1          | US2, US3          |
| US5   | P2       | Foundation   | US1-4             |
| US6   | P2       | Foundation   | US1-5             |
| US7   | P2       | US2-4        | US5, US6          |
| US8   | P3       | Foundation   | Any               |

### Parallel Opportunities

**Within Foundation (Phase 2)**:
- T006, T007, T008, T009 can all run in parallel (different Python files)
- T015, T018, T020 can run in parallel (different TS files)

**Within User Stories**:
- T033 (US2), T037 (US3), T041 (US4) can run in parallel (different React components)

**Across Stories**:
- US5, US6, US8 can be developed in parallel with US1-4

---

## Task Statistics

- **Total Tasks**: 76
- **Phase 1 (Setup)**: 4 tasks
- **Phase 2 (Foundation)**: 19 tasks ⚠️ BLOCKS
- **Phase 3-10 (User Stories)**: 43 tasks
- **Phase 11 (Polish)**: 10 tasks
- **Parallel Opportunities**: 15 tasks marked [P]

### MVP Scope (P1 Stories Only)

To deliver MVP, complete:
- Phase 1: Setup (T001-T004)
- Phase 2: Foundation (T005-T023)
- Phase 3: US1 (T024-T032)
- Phase 4: US2 (T033-T036)
- Phase 5: US3 (T037-T040)
- Phase 6: US4 (T041-T045)

**MVP Total**: 45 tasks

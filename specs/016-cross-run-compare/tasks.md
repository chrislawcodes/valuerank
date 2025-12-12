# Tasks: Cross-Run Comparison

**Prerequisites**: plan.md, spec.md, contracts/compare-schema.graphql

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with adjacent [P] tasks
- **[Story]**: User story label (US1-US10)
- Paths reference plan.md project structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create feature branch and verify development environment

- [X] T001 Create feature branch `feature/cross-run-compare` from main
- [X] T002 Verify dev environment running (`npm run dev` in cloud/)
- [X] T003 Verify test runs exist with completed analysis (at least 2-3)

**Checkpoint**: Development environment ready, test data available

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

⚠️ **CRITICAL**: No user story work can begin until this phase is complete

### Types & Contracts

- [X] T004 [P] Create comparison types in `cloud/apps/web/src/components/compare/types.ts`
  - ComparisonConfig, ComparisonFilters, RunWithAnalysis, ComparisonStatistics
- [X] T005 [P] Create visualization registry types in `cloud/apps/web/src/components/compare/visualizations/registry.ts`
  - VisualizationRegistration, ComparisonVisualizationProps
- [X] T006 Create GraphQL operations in `cloud/apps/web/src/api/operations/comparison.ts`
  - RUNS_WITH_ANALYSIS_QUERY, fragment, types

### Backend Query

- [X] T007 Add `runsWithAnalysis` query to `cloud/apps/api/src/graphql/queries/run.ts`
  - Limit to 10 runs max, use existing dataloader
- [X] T008 Add tests for runsWithAnalysis query in `cloud/apps/api/tests/graphql/queries/run.test.ts`

### Statistical Utilities

- [X] T009 [P] Create lib/statistics directory and index in `cloud/apps/web/src/lib/statistics/index.ts`
- [X] T010 [P] Implement Cohen's d calculator in `cloud/apps/web/src/lib/statistics/cohens-d.ts`
  - Include interpretation (negligible/small/medium/large)
- [X] T011 [P] Implement KS statistic calculator in `cloud/apps/web/src/lib/statistics/ks-test.ts`
  - Simplified ECDF comparison
- [X] T012 Add tests for statistical utilities in `cloud/apps/web/tests/lib/statistics/`

### Navigation & Routing

- [X] T013 Add Compare tab to `cloud/apps/web/src/components/layout/NavTabs.tsx`
  - Position between Analysis and Experiments
  - Use GitCompare icon from lucide-react
- [X] T014 Add /compare route to `cloud/apps/web/src/App.tsx`
  - Protected route with Layout wrapper
- [X] T015 Create empty Compare page stub in `cloud/apps/web/src/pages/Compare.tsx`

**Checkpoint**: Foundation ready - routing works, types defined, backend query available

---

## Phase 3: User Story 1 - Select Runs for Comparison (Priority: P1) 🎯 MVP

**Goal**: Enable researchers to select multiple runs for comparison with URL persistence

**Independent Test**: Navigate to /compare, select runs, verify URL updates, share link

### Implementation for User Story 1

- [X] T016 [P] [US1] Create useComparisonState hook in `cloud/apps/web/src/hooks/useComparisonState.ts`
  - Parse URL params (runs, viz, model, value, display)
  - Update URL on state change
  - Handle invalid IDs gracefully
- [X] T017 [P] [US1] Create useComparisonData hook in `cloud/apps/web/src/hooks/useComparisonData.ts`
  - Fetch runs with analysis using new GraphQL query
  - Handle loading/error states
  - Validate selected runs have analysis
- [X] T018 [US1] Create RunSelectorItem component in `cloud/apps/web/src/components/compare/RunSelectorItem.tsx`
  - Display run name, definition, models, date, sample size
  - Selection checkbox/toggle
  - Analysis status indicator
- [X] T019 [US1] Create RunSelector component in `cloud/apps/web/src/components/compare/RunSelector.tsx`
  - List available runs with analysis
  - Multi-select with max 10 limit
  - Search/filter functionality
  - Uses RunSelectorItem
- [X] T020 [US1] Create ComparisonHeader component in `cloud/apps/web/src/components/compare/ComparisonHeader.tsx`
  - Display selected runs summary
  - Quick deselect chips
  - Warning if any run lacks complete analysis
- [X] T021 [US1] Integrate RunSelector into Compare page `cloud/apps/web/src/pages/Compare.tsx`
  - Wire up useComparisonState and useComparisonData
  - Left panel: RunSelector, Right panel: placeholder for visualizations
- [X] T022 [US1] Add tests for useComparisonState in `cloud/apps/web/tests/hooks/useComparisonState.test.ts`
- [X] T023 [US1] Add tests for RunSelector in `cloud/apps/web/tests/components/compare/RunSelector.test.tsx`

**Checkpoint**: US1 complete - can select runs, URL updates, shareable links work

---

## Phase 4: User Story 2 - View Aggregate Comparison Overview (Priority: P1)

**Goal**: Show high-level overview comparing aggregate statistics across runs

**Independent Test**: Select 2+ runs, verify overview shows stats, effect sizes, common models

### Implementation for User Story 2

- [x] T024 [US2] Create visualization registry structure in `cloud/apps/web/src/components/compare/visualizations/registry.ts`
  - Registration function, lookup, list
  - Validate minRuns requirement
- [X] T025 [US2] Create VisualizationNav component in `cloud/apps/web/src/components/compare/VisualizationNav.tsx`
  - Tab navigation for registered visualizations
  - Disable tabs when minRuns not met
  - Sync with URL viz parameter
- [x] T026 [US2] Create OverviewViz component in `cloud/apps/web/src/components/compare/visualizations/OverviewViz.tsx`
  - Summary table with run stats (name, definition, models, sample size, mean)
  - Effect sizes (Cohen's d) between run pairs
  - Common vs unique models indicator
  - Hover for additional metadata
- [x] T027 [US2] Register OverviewViz in registry and integrate into Compare page
- [X] T028 [US2] Add tests for OverviewViz in `cloud/apps/web/tests/components/compare/visualizations/OverviewViz.test.tsx`

**Checkpoint**: US2 complete - overview visualization shows comparative statistics

---

## Phase 5: User Story 3 - Compare Decision Distributions (Priority: P1)

**Goal**: Compare how decision distributions differ across runs with visual charts

**Independent Test**: Select runs, view Decisions tab, toggle overlay/side-by-side

### Implementation for User Story 3

- [X] T029 [US3] Create ComparisonFilters component in `cloud/apps/web/src/components/compare/ComparisonFilters.tsx`
  - Model filter dropdown
  - Display mode toggle (overlay/side-by-side)
  - Sync filters with URL
- [X] T030 [US3] Create DecisionsViz component in `cloud/apps/web/src/components/compare/visualizations/DecisionsViz.tsx`
  - Histogram/bar chart with Recharts
  - Overlay mode: stacked bars with colors per run
  - Side-by-side mode: small multiples
  - KS statistic display
  - Model aggregation toggle
- [X] T031 [US3] Register DecisionsViz in registry
- [X] T032 [US3] Add tests for DecisionsViz in `cloud/apps/web/tests/components/compare/visualizations/DecisionsViz.test.tsx`

**Checkpoint**: US3 complete - decision distribution comparison works with both display modes

---

## Phase 6: User Story 4 - Compare Value Prioritization Patterns (Priority: P1)

**Goal**: Compare win rates for each value across runs to detect shifts

**Independent Test**: Select runs, view Values tab, verify grouped bars, click for detail

### Implementation for User Story 4

- [X] T033 [US4] Create ValuesViz component in `cloud/apps/web/src/components/compare/visualizations/ValuesViz.tsx`
  - Grouped bar chart (Recharts BarChart)
  - Each value has bars for each run
  - Highlight significant changes (>10% difference)
  - Click to show confidence intervals
  - Model filter integration
- [X] T034 [US4] Register ValuesViz in registry
- [X] T035 [US4] Add tests for ValuesViz in `cloud/apps/web/tests/components/compare/visualizations/ValuesViz.test.tsx`

**Checkpoint**: US4 complete - value win rate comparison shows patterns and significance

---

## Phase 7: User Story 5 - URL-Based State for Sharing (Priority: P1)

**Goal**: Complete URL state management with browser history support

**Independent Test**: Full flow - select runs, choose viz, filter, share URL, back/forward

### Implementation for User Story 5

- [X] T036 [US5] Enhance useComparisonState to handle all filter parameters
  - viz, model, value, display mode
  - Ensure history.pushState vs replaceState used correctly
- [X] T037 [US5] Add browser history navigation tests in `cloud/apps/web/tests/hooks/useComparisonState.test.ts`
  - Back/forward navigation
  - Invalid parameter handling
  - URL length edge cases
- [X] T038 [US5] Integration test for full comparison flow in `cloud/apps/web/tests/pages/Compare.test.tsx`

**Checkpoint**: US5 complete - URL captures full state, shareable links work perfectly

---

## Phase 8: User Story 6 - Extensible Visualization System (Priority: P2)

**Goal**: Ensure visualization registry is properly extensible for future additions

**Independent Test**: Create mock visualization, register it, verify it appears

### Implementation for User Story 6

- [X] T039 [US6] Refine registry.ts with full documentation and example registration
- [X] T040 [US6] Create re-export index in `cloud/apps/web/src/components/compare/index.ts`
- [X] T041 [US6] Add developer documentation in `cloud/apps/web/src/components/compare/README.md`
  - How to add new visualizations
  - Interface contract explanation
  - Example code

**Checkpoint**: US6 complete - adding new visualization is straightforward (<50 lines)

---

## Phase 9: User Story 7 - Model Version Tracking Comparison (Priority: P2)

**Goal**: Timeline visualization for detecting model behavioral drift over time

**Independent Test**: Select 3+ runs with same model, view Timeline, see drift

### Implementation for User Story 7

- [X] T042 [US7] Create TimelineViz component in `cloud/apps/web/src/components/compare/visualizations/TimelineViz.tsx`
  - Line chart with Recharts LineChart/ComposedChart
  - X-axis: run completion dates
  - Y-axis: mean decision (selectable metric)
  - Multiple lines for common models
  - Model filter for single-model view
  - Tooltips with run details and links
- [X] T043 [US7] Register TimelineViz in registry
- [X] T044 [US7] Add tests for TimelineViz in `cloud/apps/web/tests/components/compare/visualizations/TimelineViz.test.tsx`

**Checkpoint**: US7 complete - timeline shows model behavioral drift over time

---

## Phase 10: User Story 8 - Scenario-Level Delta Analysis (Priority: P2)

**Goal**: Compare individual scenario responses across runs (optional enhancement)

**Independent Test**: Select runs with overlapping scenarios, see ranked deltas

### Implementation for User Story 8

- [ ] T045 [US8] Create ScenariosViz component in `cloud/apps/web/src/components/compare/visualizations/ScenariosViz.tsx`
  - Table or heatmap of scenario deltas
  - Ranked by cross-run variance
  - Click to see per-run breakdown
  - Dimension filter capability
- [ ] T046 [US8] Register ScenariosViz in registry (optional visualization)
- [ ] T047 [US8] Add tests for ScenariosViz

**Checkpoint**: US8 complete - scenario-level delta analysis available

---

## Phase 11: User Story 9 - Definition Diff View (Priority: P3)

**Goal**: Show VS Code-style side-by-side diff of definition content between runs

**Independent Test**: Select runs with different definitions, view Definition tab, see highlighted diffs

**Technical Approach**: Use Monaco Editor's built-in `DiffEditor` component from `@monaco-editor/react` (already installed). This provides GitHub/VS Code-style side-by-side diff visualization with syntax highlighting.

### Implementation for User Story 9

- [ ] T048 [US9] Research Monaco DiffEditor options and configuration
  - Review existing TemplateEditor.tsx for Monaco patterns
  - Test DiffEditor with renderSideBySide option
  - Reference: [@monaco-editor/react docs](https://monaco-react.surenatoyan.com/)
- [ ] T049 [P] [US9] Create DefinitionDiffContent component in `cloud/apps/web/src/components/compare/DefinitionDiffContent.tsx`
  - Extract preamble and template from each run's definition
  - Format content for Monaco (add section headers)
  - Handle null/missing content gracefully
- [ ] T050 [P] [US9] Create DefinitionDiffViz component in `cloud/apps/web/src/components/compare/visualizations/DefinitionDiffViz.tsx`
  - Use Monaco DiffEditor component for side-by-side diff
  - Toggle between preamble diff and template diff
  - Show "Definitions identical" message when no diff
  - Custom theme matching app (teal accents)
  - Read-only mode (no editing)
  - Options: renderSideBySide, enableSplitViewResizing
- [ ] T051 [US9] Add run selector for diff comparison (when >2 runs selected)
  - Dropdown to select which two runs to diff
  - Default to first two selected
  - Show parent-child relationship if forked definitions
- [ ] T052 [US9] Register DefinitionDiffViz in registry
  - Label: "Definition"
  - Icon: FileCode or FileDiff from lucide-react
  - minRuns: 2
- [ ] T053 [US9] Add tests for DefinitionDiffViz in `cloud/apps/web/tests/components/compare/visualizations/DefinitionDiffViz.test.tsx`
  - Renders diff view
  - Handles identical definitions
  - Handles missing definitions
  - Section toggle works

**Checkpoint**: US9 complete - definition diff shows VS Code-style comparison

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, optimization, and cleanup

### Validation & Testing

- [ ] T054 Run full test suite, ensure 80% coverage on new code
- [ ] T055 Validate against quickstart.md manual testing scenarios
- [ ] T056 Performance check: visualizations render < 3s for 5 runs

### Documentation & Cleanup

- [ ] T057 [P] Update hooks/index.ts to export new hooks
- [ ] T058 [P] Ensure all components have prop types documented
- [ ] T059 Review and remove any console.log statements

### Pre-Commit Checks

- [ ] T060 Run typecheck (`npm run typecheck`)
- [ ] T061 Run lint (`npm run lint`)
- [ ] T062 Run build (`npm run build`)

**Checkpoint**: Feature complete, tested, documented, ready for PR

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup           → No dependencies
Phase 2: Foundation      → Depends on Setup, BLOCKS all user stories
Phase 3: US1 (Select)    → Depends on Foundation
Phase 4: US2 (Overview)  → Depends on US1 (needs run selection)
Phase 5: US3 (Decisions) → Can parallel with US2, US4
Phase 6: US4 (Values)    → Can parallel with US2, US3
Phase 7: US5 (URL)       → Depends on US1-US4 (enhances existing)
Phase 8: US6 (Extensible)→ Can parallel with US7, US8, US9
Phase 9: US7 (Timeline)  → Depends on Foundation
Phase 10: US8 (Scenarios)→ Depends on Foundation
Phase 11: US9 (Def Diff) → Depends on Foundation (uses existing Monaco)
Phase 12: Polish         → Depends on all desired user stories
```

### User Story Dependencies

| Story | Priority | Depends On | Can Parallel With |
|-------|----------|------------|-------------------|
| US1 (Select) | P1 | Foundation | - |
| US2 (Overview) | P1 | US1 | US3, US4 |
| US3 (Decisions) | P1 | US1 | US2, US4 |
| US4 (Values) | P1 | US1 | US2, US3 |
| US5 (URL) | P1 | US1-US4 | - |
| US6 (Extensible) | P2 | US2-US4 | US7, US8, US9 |
| US7 (Timeline) | P2 | Foundation | US6, US8, US9 |
| US8 (Scenarios) | P2 | Foundation | US6, US7, US9 |
| US9 (Def Diff) | P3 | Foundation | US6, US7, US8 |

### Parallel Opportunities

**Within phases**: Tasks marked [P] can run in parallel
**Across phases**: US2, US3, US4 can be developed simultaneously after US1

### Minimum Viable Feature (P1 Only)

For MVP delivery, complete:
- Phase 1: Setup (T001-T003)
- Phase 2: Foundation (T004-T015)
- Phase 3: US1 Select (T016-T023)
- Phase 4: US2 Overview (T024-T028)
- Phase 5: US3 Decisions (T029-T032)
- Phase 6: US4 Values (T033-T035)
- Phase 7: US5 URL (T036-T038)
- Phase 11: Polish (T048-T056)

**Total MVP Tasks**: 44 tasks

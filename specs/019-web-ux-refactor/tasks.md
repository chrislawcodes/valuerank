# Tasks: Web UX Refactor

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md)

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel with other [P] tasks
- **[Story]**: User story label (US1-US6)
- All file paths relative to `cloud/apps/web/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and create foundational utilities

- [X] T001 Create feature branch `feat/019-web-ux-refactor`
- [X] T002 Install CVA dependencies: `npm install class-variance-authority clsx tailwind-merge`
- [X] T003 Create `lib/utils.ts` with `cn()` utility function per plan.md Decision 5
- [X] T004 Add ESLint rule to warn on raw `<button>` elements per plan.md Decision 3

**Checkpoint**: Setup complete - component library work can begin

---

## Phase 2: Foundation - Component Library (Blocking Prerequisites)

**Purpose**: Build atomic UI components that ALL user stories depend on

⚠️ **CRITICAL**: No file decomposition or migration work can begin until this phase is complete

### Core Components

- [X] T005 [P] [US1] Refactor `components/ui/Button.tsx` to CVA pattern, add iconOnly variant
- [X] T006 [P] [US1] Create `components/ui/Card.tsx` with variants: default, bordered, elevated, interactive
- [X] T007 [P] [US1] Create `components/ui/Badge.tsx` with variants: success, warning, error, info, tag, count
- [X] T008 [P] [US1] Create `components/ui/Modal.tsx` with focus trap, escape handling, backdrop click
- [X] T009 [P] [US1] Create `components/ui/Select.tsx` with keyboard navigation and ARIA compliance
- [X] T010 [P] [US1] Create `components/ui/Avatar.tsx` with fallback initials
- [X] T011 [P] [US1] Create `components/ui/Tooltip.tsx` for contextual information
- [X] T012 [P] [US1] Refactor `components/ui/Input.tsx` to CVA pattern for consistency
- [X] T013 [P] [US1] Refactor `components/ui/Tabs.tsx` to CVA pattern for consistency

### Component Tests

- [X] T014 [P] [US1] Create `tests/components/ui/Card.test.tsx` - variants, onClick, hover
- [X] T015 [P] [US1] Create `tests/components/ui/Badge.test.tsx` - variants, truncation
- [X] T016 [P] [US1] Create `tests/components/ui/Modal.test.tsx` - focus trap, escape, backdrop
- [X] T017 [P] [US1] Create `tests/components/ui/Select.test.tsx` - keyboard nav, selection

### Barrel Export

- [X] T018 [US1] Create `components/ui/index.ts` barrel export for all UI components

**Checkpoint**: Component library complete - file decomposition can now begin

---

## Phase 3: User Story 2 - Large File Decomposition: Settings (Priority: P1) 🎯 MVP

**Goal**: Reduce InfraPanel.tsx (756 lines) and ModelsPanel.tsx (687 lines) to under 400 lines each

**Independent Test**: Run `wc -l` on refactored files; all should be under 400 lines

### InfraPanel Decomposition (756 → ~150 + sub-components)

- [X] T019 [US2] Create `components/settings/infra/` folder structure
- [X] T020 [P] [US2] Extract `components/settings/infra/ModelSelectorCard.tsx` - single model selection UI
- [X] T021 [P] [US2] Extract `components/settings/infra/ExpansionSettings.tsx` - code generation toggle
- [X] T022 [P] [US2] Extract `components/settings/infra/ParallelismSettings.tsx` - summarization controls
- [X] T023 [P] [US2] Create `components/settings/infra/types.ts` - shared types
- [X] T024 [US2] Refactor `components/settings/infra/InfraPanel.tsx` to orchestration only (<150 lines)
- [X] T025 [US2] Create `components/settings/infra/index.ts` barrel export
- [X] T026 [US2] Update imports in `pages/Settings.tsx` to use new infra/ path

### ModelsPanel Decomposition (687 → ~150 + sub-components)

- [X] T027 [US2] Create `components/settings/models/` folder structure
- [X] T028 [P] [US2] Extract `components/settings/models/ProviderSection.tsx` - provider accordion
- [X] T029 [P] [US2] Extract `components/settings/models/ModelForm.tsx` - add/edit form
- [X] T030 [P] [US2] Extract `components/settings/models/ModelRow.tsx` - single model display
- [X] T031 [P] [US2] Create `components/settings/models/types.ts` - shared types
- [X] T032 [US2] Refactor `components/settings/models/ModelsPanel.tsx` to orchestration only
- [X] T033 [US2] Create `components/settings/models/index.ts` barrel export
- [X] T034 [US2] Update imports in `pages/Settings.tsx` to use new models/ path

**Checkpoint**: Settings panels under 400 lines - verify with `wc -l`

---

## Phase 4: User Story 2 - Large File Decomposition: Pages (Priority: P1) 🎯 MVP

**Goal**: Reduce RunDetail.tsx (642 lines) and DefinitionDetail.tsx (562 lines)

**Independent Test**: Run `wc -l` on refactored files; all should be under 400 lines

### RunDetail Decomposition (642 → ~180 + sub-components)

- [X] T035 [US2] Create `pages/RunDetail/` folder structure
- [X] T036 [P] [US2] Extract `pages/RunDetail/RunHeader.tsx` - title, status, actions
- [X] T037 [P] [US2] Extract `pages/RunDetail/RunMetadata.tsx` - dates, duration, definition link
- [X] T038 [P] [US2] Extract `pages/RunDetail/DeleteConfirmModal.tsx` - confirmation dialog (use Modal)
- [X] T039 [US2] Refactor `pages/RunDetail/RunDetail.tsx` to page orchestration only
- [X] T040 [US2] Create `pages/RunDetail/index.ts` barrel export
- [X] T041 [US2] Update route imports in `App.tsx` to use new RunDetail/ path

### DefinitionDetail Decomposition (562 → 314 lines)

- [X] T042 [US2] Create `pages/DefinitionDetail/` folder structure
- [X] T043 [P] [US2] Extract `pages/DefinitionDetail/DefinitionHeader.tsx` - back button and actions
- [X] T044 [P] [US2] Extract `pages/DefinitionDetail/DefinitionMetadata.tsx` - date, run count, forks
- [X] T045 [P] [US2] Extract `pages/DefinitionDetail/DefinitionContentView.tsx` - preamble, template, dimensions
- [X] T045b [P] [US2] Extract `pages/DefinitionDetail/DeleteDefinitionModal.tsx` - delete confirmation
- [X] T045c [P] [US2] Extract `pages/DefinitionDetail/RunFormModal.tsx` - run form dialog
- [X] T046 [US2] Refactor `pages/DefinitionDetail/DefinitionDetail.tsx` to page orchestration
- [X] T047 [US2] Create `pages/DefinitionDetail/index.ts` barrel export
- [X] T048 [US2] Update route imports in `App.tsx` to use new DefinitionDetail/ path

**Checkpoint**: Page files under 400 lines - verify with `wc -l`

---

## Phase 5: User Story 2 - Large File Decomposition: Analysis & Viz (Priority: P1) 🎯 MVP

**Goal**: Reduce AnalysisPanel.tsx (516 lines) and visualization components (477, 441, 422, 410 lines)

**Independent Test**: Run `wc -l` on refactored files; all should be under 400 lines

### AnalysisPanel Decomposition (516 → 351 lines)

- [X] T049 [US2] Create `components/analysis/tabs/` folder structure
- [X] T050 [P] [US2] Extract `components/analysis/tabs/OverviewTab.tsx`
- [X] T051 [P] [US2] Extract `components/analysis/tabs/DecisionsTab.tsx`
- [X] T052 [P] [US2] Extract `components/analysis/tabs/ScenariosTab.tsx`
- [X] T053 [P] [US2] Extract `components/analysis/tabs/ValuesTab.tsx`
- [X] T054 [P] [US2] Extract `components/analysis/tabs/AgreementTab.tsx`
- [X] T055 [P] [US2] Extract `components/analysis/tabs/MethodsTab.tsx`
- [X] T056 [US2] Refactor `components/analysis/AnalysisPanel.tsx` to tab orchestration only
- [X] T057 [US2] Create `components/analysis/tabs/index.ts` barrel export

### Visualization Decomposition

- [X] T058 [US2] Create `components/compare/charts/` folder for shared chart primitives
- [X] T059 [P] [US2] Extract `components/compare/charts/DistributionChart.tsx` from DecisionsViz
- [X] T060 [P] [US2] Extract `components/compare/charts/ValueBarChart.tsx` from ValuesViz
- [X] T061 [P] [US2] Extract `components/compare/charts/TimelineChart.tsx` from TimelineViz
- [X] T062 [US2] Refactor `components/compare/visualizations/ValuesViz.tsx` to composition (340 lines)
- [X] T063 [US2] Refactor `components/compare/visualizations/TimelineViz.tsx` to composition (252 lines)
- [X] T064 [US2] Refactor `components/compare/visualizations/DecisionsViz.tsx` to composition (268 lines)

### ExpandedScenarios Decomposition (410 → 189 + sub-components)

- [X] T065 [P] [US2] Extract `components/definitions/scenarios/ScenarioCard.tsx` from ExpandedScenarios
- [X] T066 [P] [US2] Extract `components/definitions/scenarios/ExpansionStatusBadge.tsx` from ExpandedScenarios
- [X] T067 [US2] Refactor `components/definitions/ExpandedScenarios.tsx` to composition (189 lines)

**Checkpoint**: All files under 400 lines - run final verification

---

## Phase 6: User Story 3 - Button Standardization (Priority: P2)

**Goal**: Replace all 103 raw `<button>` elements with Button component

**Independent Test**: `grep -r "<button" --include="*.tsx" | grep -v "import" | wc -l` should return 0

### Button Migration by Component Area

- [X] T068 [US3] Migrate buttons in `components/settings/` to Button component
- [X] T069 [P] [US3] Migrate buttons in `components/analysis/` to Button component
- [X] T070 [P] [US3] Migrate buttons in `components/compare/` to Button component
- [X] T071 [P] [US3] Migrate buttons in `components/definitions/` to Button component
- [X] T072 [P] [US3] Migrate buttons in `components/runs/` to Button component
- [X] T073 [P] [US3] Migrate buttons in `components/layout/` to Button component
- [X] T074 [P] [US3] Migrate buttons in `pages/` to Button component

### Final Button Sweep

- [X] T075 [US3] Run grep to find any remaining raw buttons and migrate
- [X] T076 [US3] Promote ESLint rule from warn to error for raw `<button>`

**Checkpoint**: Zero raw buttons - verify with grep command

---

## Phase 7: User Story 4 - Responsive Layout Foundation (Priority: P2)

**Goal**: Make application usable at 375px viewport width

**Independent Test**: Open at 375px viewport; all pages navigable without horizontal scroll

### Mobile Navigation

- [X] T077 [US4] Create `components/layout/MobileNav.tsx` hamburger menu component
- [X] T078 [US4] Add viewport detection hook `hooks/useViewport.ts`
- [X] T079 [US4] Update `components/layout/Layout.tsx` to conditionally render MobileNav on mobile
- [X] T080 [US4] Update `components/layout/Header.tsx` with hamburger trigger on mobile

### Responsive Table Component

- [X] T081 [US4] Create `components/ui/Table.tsx` with responsive card fallback for mobile

### Filter Collapsibility

- [X] T082 [P] [US4] Update `components/runs/RunFilters.tsx` to collapse on mobile
- [X] T083 [P] [US4] Update `components/definitions/DefinitionFilters.tsx` to collapse on mobile
- [X] T084 [P] [US4] Update `components/analysis/AnalysisFilters.tsx` to collapse on mobile
- [X] T085 [P] [US4] Update `components/compare/ComparisonFilters.tsx` to collapse on mobile

### Touch Target Sizing

- [X] T086 [US4] Audit and update touch targets to minimum 44x44px across all interactive elements

**Checkpoint**: Mobile navigation works, no horizontal scroll at 375px

---

## Phase 8: User Story 5 - Badge Standardization (Priority: P2)

**Goal**: Replace hardcoded status styles with Badge component

**Independent Test**: Visual audit - all status indicators use Badge with consistent colors

### Status Badge Migration

- [X] T087 [US5] Update `components/runs/RunCard.tsx` to use Badge for run status
- [X] T088 [P] [US5] Update `components/runs/RunProgress.tsx` to use Badge for status indicators
- [X] T089 [P] [US5] Update `components/analysis/AnalysisCard.tsx` to use Badge for status
- [X] T090 [P] [US5] Create status-to-variant mapping utility `lib/statusBadge.ts`

### Tag Badge Migration

- [X] T091 [US5] Update `components/definitions/TagChips.tsx` to use Badge with tag variant
- [X] T092 [US5] Update `components/definitions/TagSelector.tsx` to use Badge for selected tags

**Checkpoint**: All status indicators use Badge component with semantic colors

---

## Phase 9: User Story 6 - Card Standardization (Priority: P3)

**Goal**: Migrate list items to use Card component for visual consistency

**Independent Test**: Visual audit - all list cards have consistent styling

### Card Migration

- [ ] T093 [US6] Update `components/definitions/DefinitionCard.tsx` to use Card as base
- [ ] T094 [P] [US6] Update `components/runs/RunCard.tsx` to use Card as base
- [ ] T095 [P] [US6] Update `components/analysis/AnalysisCard.tsx` to use Card as base
- [ ] T096 [P] [US6] Update `components/compare/RunSelectorItem.tsx` to use Card as base

**Checkpoint**: All list cards use Card component with consistent hover effects

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, cleanup, and documentation

### Validation

- [ ] T097 Run file size check: `find . -name "*.tsx" -exec wc -l {} \; | awk '$1 > 400'`
- [ ] T098 Run button check: `grep -r "<button" --include="*.tsx" | grep -v "import" | wc -l`
- [ ] T099 Run test suite: `npm test` - ensure no regressions
- [ ] T100 Run build: `npm run build` - ensure no TypeScript errors
- [ ] T101 Run lint: `npm run lint` - ensure no ESLint errors

### Manual Testing

- [ ] T102 Execute quickstart.md testing scenarios for all user stories
- [ ] T103 Run Lighthouse accessibility audit - target score >90
- [ ] T104 Test mobile navigation at 375px viewport

### Cleanup

- [ ] T105 Remove any dead code or unused imports from refactored files
- [ ] T106 Update component documentation/comments where needed

**Checkpoint**: All validation passes - feature complete

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup
    ↓
Phase 2: Foundation (Component Library) ← BLOCKS ALL SUBSEQUENT PHASES
    ↓
Phases 3-5: File Decomposition (US2) - Can run sequentially
    ↓
Phases 6-9: Migrations (US3-US6) - Can run in parallel after Phase 5
    ↓
Phase 10: Polish
```

### User Story Dependencies

| Story | Priority | Depends On | Can Parallelize With |
|-------|----------|------------|---------------------|
| US1 (Component Library) | P1 | Setup | - |
| US2 (File Decomposition) | P1 | US1 | - |
| US3 (Button Migration) | P2 | US2 | US4, US5, US6 |
| US4 (Responsive) | P2 | US2 | US3, US5, US6 |
| US5 (Badge Standardization) | P2 | US2 | US3, US4, US6 |
| US6 (Card Standardization) | P3 | US2 | US3, US4, US5 |

### Parallel Opportunities

**Within phases**, tasks marked `[P]` can run in parallel:
- Phase 2: All component creation tasks (T005-T013)
- Phase 3: InfraPanel and ModelsPanel extraction
- Phase 5: Tab extractions, chart extractions
- Phases 6-9: Migration tasks across different component areas

### Estimated Task Counts

| Phase | Tasks | Parallel Opportunities |
|-------|-------|----------------------|
| 1: Setup | 4 | 0 |
| 2: Foundation | 14 | 12 |
| 3: Settings Decomp | 16 | 8 |
| 4: Pages Decomp | 14 | 6 |
| 5: Analysis/Viz Decomp | 19 | 10 |
| 6: Button Migration | 9 | 6 |
| 7: Responsive | 10 | 4 |
| 8: Badge Migration | 6 | 3 |
| 9: Card Migration | 4 | 3 |
| 10: Polish | 10 | 0 |
| **Total** | **106** | **52** |

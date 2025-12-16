# Tasks: Definition Diff View

**Prerequisites**: plan.md, spec.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1, US2, US3)
- All paths from plan.md Project Structure section

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create feature branch and verify environment

- [X] T001 Create feature branch `feature/021-definition-diff-view`
- [X] T002 Verify @monaco-editor/react is installed (`npm ls @monaco-editor/react`)
- [X] T003 Verify definitionContent is populated in useComparisonData hook

**Checkpoint**: Environment ready for development

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Core components that MUST be complete before user story integration

⚠️ **CRITICAL**: No user story work can begin until foundation components exist

- [X] T004 Create DefinitionDiff.tsx skeleton in cloud/apps/web/src/components/compare/visualizations/
- [X] T005 [P] Create DefinitionGroups.tsx skeleton in cloud/apps/web/src/components/compare/visualizations/
- [X] T006 [P] Create DefinitionViz.tsx orchestrator in cloud/apps/web/src/components/compare/visualizations/
- [X] T007 Register 'definition' visualization in cloud/apps/web/src/components/compare/visualizations/registry.tsx

**Checkpoint**: Foundation ready - visualization appears in Compare nav (empty placeholder)

---

## Phase 3: User Story 1 - View Template Diff Between Two Runs (Priority: P1) 🎯 MVP

**Goal**: Monaco diff editor shows definition differences for 2 selected runs

**Independent Test**: Select 2 runs with different definitions, navigate to Definition tab, verify side-by-side diff

### Implementation for User Story 1

- [X] T008 [US1] Implement Monaco DiffEditor integration in DefinitionDiff.tsx
- [X] T009 [US1] Add header row showing run names/definition names in DefinitionDiff.tsx
- [X] T010 [US1] Add Template/Preamble tab switcher in DefinitionDiff.tsx
- [X] T011 [US1] Handle "identical definitions" case with read-only single view in DefinitionDiff.tsx
- [X] T012 [US1] Handle missing definitionContent with placeholder text in DefinitionDiff.tsx
- [X] T013 [US1] Update DefinitionViz.tsx to route 2-run case to DefinitionDiff
- [X] T014 [US1] Write unit tests for DefinitionDiff in cloud/apps/web/tests/components/compare/visualizations/DefinitionDiff.test.tsx
- [X] T015 [US1] Write unit tests for DefinitionViz (2-run routing) in cloud/apps/web/tests/components/compare/visualizations/DefinitionViz.test.tsx

**Checkpoint**: User Story 1 complete - 2-run diff view fully functional

---

## Phase 4: User Story 2 - Multi-Run Definition Preview (Priority: P2)

**Goal**: Card layout groups runs by definition when 3+ runs selected

**Independent Test**: Select 3+ runs, navigate to Definition tab, verify card layout with groupings

### Implementation for User Story 2

- [X] T016 [US2] Implement run grouping by definition ID in DefinitionGroups.tsx
- [X] T017 [US2] Create card component layout with definition name, run badges, template preview in DefinitionGroups.tsx
- [X] T018 [US2] Add summary header showing "X definitions across Y runs" in DefinitionGroups.tsx
- [X] T019 [US2] Update DefinitionViz.tsx to route 3+-run case to DefinitionGroups
- [X] T020 [US2] Write unit tests for DefinitionGroups in cloud/apps/web/tests/components/compare/visualizations/DefinitionGroups.test.tsx
- [X] T021 [US2] Update DefinitionViz tests for 3+-run routing in cloud/apps/web/tests/components/compare/visualizations/DefinitionViz.test.tsx

**Checkpoint**: User Story 2 complete - multi-run grouping view functional

---

## Phase 5: User Story 3 - Copy and Export Definition Text (Priority: P3)

**Goal**: Copy definition text to clipboard for external documentation

**Independent Test**: View diff, click copy button, verify clipboard content

### Implementation for User Story 3

- [ ] T022 [US3] Add "Copy Left" button in DefinitionDiff.tsx header
- [ ] T023 [US3] Add "Copy Right" button in DefinitionDiff.tsx header
- [ ] T024 [US3] Implement clipboard copy with header metadata (run/definition info)
- [ ] T025 [US3] Add toast notification on copy success
- [ ] T026 [US3] Write unit tests for copy functionality in DefinitionDiff.test.tsx

**Checkpoint**: User Story 3 complete - copy functionality works

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final quality checks and documentation

- [ ] T027 [P] Run full test suite and verify 80% coverage on new files
- [ ] T028 [P] Verify all files under 400 lines per constitution
- [ ] T029 [P] Verify no `any` types in new TypeScript files
- [ ] T030 Run manual testing per quickstart.md
- [ ] T031 Run lint and build to verify no errors

**Checkpoint**: Feature complete and ready for PR

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup
    │
    ▼
Phase 2: Foundation (T004-T007)
    │
    ▼
┌───┴───┬───────┐
│       │       │
▼       ▼       ▼
Phase 3 Phase 4 Phase 5   (User Stories - can run in parallel)
US1     US2     US3
│       │       │
└───┬───┴───────┘
    │
    ▼
Phase 6: Polish
```

### Phase Details

- **Setup (Phase 1)**: No dependencies, verify environment
- **Foundation (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Stories (Phase 3-5)**: Depend on Foundation
  - Can proceed in parallel (if staffed)
  - Or sequentially by priority (P1 → P2 → P3)
- **Polish (Phase 6)**: Depends on desired user stories complete

### User Story Independence

| Story | Depends On | Can Skip? |
|-------|------------|-----------|
| US1 (P1) | Foundation only | No (MVP) |
| US2 (P2) | Foundation only | Yes |
| US3 (P3) | US1 (adds to DefinitionDiff) | Yes |

### Parallel Opportunities

Within phases, tasks marked [P] can run in parallel:
- **Phase 2**: T004, T005, T006 can be developed simultaneously
- **Phase 6**: T027, T028, T029 can run in parallel

### Minimum Viable Feature

To ship MVP (US1 only):
1. Phase 1: T001-T003
2. Phase 2: T004, T006, T007 (skip T005)
3. Phase 3: T008-T015
4. Phase 6: T027-T031

Total MVP tasks: 18 tasks

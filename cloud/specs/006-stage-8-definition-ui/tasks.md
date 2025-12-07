# Tasks: Stage 8 - Definition Management UI

**Prerequisites**: spec.md, plan.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel
- **[Story]**: User story (US1-US8)
- Include exact file paths from plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and branch setup

- [X] T001 Create feature branch `stage-8-definition-ui` from main
- [X] T002 Verify development environment running (docker, npm run dev)

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

⚠️ **CRITICAL**: No user story work can begin until this phase is complete

### Database Schema

- [X] T003 Add Tag and DefinitionTag models to `packages/db/prisma/schema.prisma` per data-model.md
- [X] T004 Generate Prisma migration: `npx prisma migrate dev --name add_definition_tags`
- [X] T005 Run `npm run db:generate` to update Prisma client types

### GraphQL API - Core Types

- [X] T006 [P] Create Tag GraphQL type in `apps/api/src/graphql/types/tag.ts` per contracts/
- [X] T007 [P] Create Tag DataLoader in `apps/api/src/graphql/dataloaders/tag.ts`
- [X] T008 Update `apps/api/src/graphql/dataloaders/index.ts` to export tag loader

### GraphQL API - Tag Mutations

- [X] T009 Create tag mutations (createTag, deleteTag) in `apps/api/src/graphql/mutations/tag.ts`
- [X] T010 Create definition-tag mutations (addTagToDefinition, removeTagFromDefinition, createAndAssignTag) in `apps/api/src/graphql/mutations/definition-tags.ts`
- [X] T011 Update `apps/api/src/graphql/mutations/index.ts` to export tag mutations

### GraphQL API - Enhanced Queries

- [X] T012 Create tags query in `apps/api/src/graphql/queries/tag.ts`
- [X] T013 Add updateDefinition mutation to `apps/api/src/graphql/mutations/definition.ts`
- [X] T014 Enhance definitions query with search, tagIds, hasRuns filters in `apps/api/src/graphql/queries/definition.ts`
- [X] T015 Add ancestors/descendants fields to Definition type in `apps/api/src/graphql/types/definition.ts`
- [X] T016 Create definitionAncestors query in `apps/api/src/graphql/queries/definition.ts`
- [X] T017 Create definitionDescendants query in `apps/api/src/graphql/queries/definition.ts`

### GraphQL Schema Registration

- [X] T018 Update `apps/api/src/graphql/queries/index.ts` to export tag queries
- [X] T019 Verify GraphQL playground shows new types/queries/mutations

### Frontend GraphQL Setup

- [X] T020 [P] Create definition GraphQL queries/mutations in `apps/web/src/api/operations/definitions.ts`
- [X] T021 [P] Create tag GraphQL queries/mutations in `apps/web/src/api/operations/tags.ts`

### API Integration Tests

- [X] T022 Write integration tests for tag CRUD in `apps/api/tests/graphql/mutations/tag.test.ts`
- [X] T023 Write integration tests for enhanced definition queries in `apps/api/tests/graphql/definitions.test.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Browse Definition Library (Priority: P1) 🎯 MVP

**Goal**: Users can see all available scenario definitions in a browsable list

**Independent Test**: Navigate to Definitions page, verify definitions listed with name, version info, creation date

### Implementation for User Story 1

- [X] T024 [P] [US1] Create DefinitionCard component in `apps/web/src/components/definitions/DefinitionCard.tsx`
- [X] T025 [P] [US1] Create useDefinitions hook in `apps/web/src/hooks/useDefinitions.ts`
- [X] T026 [US1] Create DefinitionList component in `apps/web/src/components/definitions/DefinitionList.tsx`
- [X] T027 [US1] Update Definitions page to render DefinitionList in `apps/web/src/pages/Definitions.tsx`
- [X] T028 [US1] Add empty state for no definitions in DefinitionList
- [X] T029 [US1] Add loading skeleton for definition list
- [X] T030 [US1] Write component tests for DefinitionCard in `apps/web/tests/components/definitions/DefinitionCard.test.tsx`
- [X] T031 [US1] Write component tests for DefinitionList in `apps/web/tests/components/definitions/DefinitionList.test.tsx`

**Checkpoint**: User Story 1 complete - can browse definition library

---

## Phase 4: User Story 2 - Create New Definition (Priority: P1) 🎯 MVP

**Goal**: Users can create new scenario definitions with preamble, template, and dimensions

**Independent Test**: Click "New Definition", fill fields, save, verify in library

### Implementation for User Story 2

- [X] T032 [P] [US2] Create DimensionLevelEditor component in `apps/web/src/components/definitions/DimensionLevelEditor.tsx`
- [X] T033 [P] [US2] Create useDefinitionMutations hook in `apps/web/src/hooks/useDefinitionMutations.ts`
- [X] T034 [US2] Create DimensionEditor component in `apps/web/src/components/definitions/DimensionEditor.tsx`
- [X] T035 [US2] Create DefinitionEditor component in `apps/web/src/components/definitions/DefinitionEditor.tsx`
- [X] T036 [US2] Add syntax highlighting for template placeholders `[name]` in DefinitionEditor
- [X] T037 [US2] Create DefinitionDetail page in `apps/web/src/pages/DefinitionDetail.tsx`
- [X] T038 [US2] Add route for definition detail/create `/definitions/:id` and `/definitions/new` in `apps/web/src/App.tsx`
- [X] T039 [US2] Add "New Definition" button to DefinitionList
- [X] T040 [US2] Implement create mode in DefinitionEditor with validation
- [X] T041 [US2] Write tests for DimensionEditor in `apps/web/tests/components/definitions/DimensionEditor.test.tsx`
- [X] T042 [US2] Write tests for DefinitionEditor in `apps/web/tests/components/definitions/DefinitionEditor.test.tsx`

**Checkpoint**: User Story 2 complete - can create definitions

---

## Phase 5: User Story 3 - Edit Existing Definition (Priority: P1) 🎯 MVP

**Goal**: Users can modify an existing definition

**Independent Test**: Open definition, change fields, save, verify persistence

### Implementation for User Story 3

- [X] T043 [P] [US3] Create useDefinition hook for single definition in `apps/web/src/hooks/useDefinition.ts`
- [X] T044 [US3] Implement edit mode in DefinitionEditor (load existing data)
- [X] T045 [US3] Add "Edit" button to definition detail view in DefinitionDetail.tsx
- [X] T046 [US3] Implement unsaved changes detection and prompt in DefinitionEditor
- [X] T047 [US3] Add updateDefinition mutation call to useDefinitionMutations
- [X] T048 [US3] Write tests for edit flow in `apps/web/tests/components/definitions/DefinitionEditor.test.tsx`

**Checkpoint**: User Story 3 complete - can edit definitions

---

## Phase 6: User Story 4 - Fork Definition (Priority: P1) 🎯 MVP

**Goal**: Users can create variants while preserving original and lineage

**Independent Test**: Fork definition, verify new definition created with parent reference

### Implementation for User Story 4

- [X] T049 [P] [US4] Create ForkDialog component in `apps/web/src/components/definitions/ForkDialog.tsx`
- [X] T050 [US4] Add forkDefinition mutation to useDefinitionMutations hook
- [X] T051 [US4] Add "Fork" button to definition detail view in DefinitionDetail.tsx
- [X] T052 [US4] Display parent info on forked definitions in DefinitionDetail
- [X] T053 [US4] Display children count on definition card in DefinitionCard
- [X] T054 [US4] Write tests for ForkDialog in `apps/web/tests/components/definitions/ForkDialog.test.tsx`

**Checkpoint**: User Story 4 complete - can fork definitions

---

## Phase 7: User Story 5 - Manage Tags (Priority: P2)

**Goal**: Users can create, assign, and filter by tags

**Independent Test**: Create tag, assign to definition, filter by tag

### Implementation for User Story 5

- [X] T055 [P] [US5] Create useTags hook in `apps/web/src/hooks/useTags.ts`
- [X] T056 [P] [US5] Create TagChips component in `apps/web/src/components/definitions/TagChips.tsx`
- [X] T057 [US5] Create TagSelector component in `apps/web/src/components/definitions/TagSelector.tsx`
- [X] T058 [US5] Add TagChips to DefinitionCard to display assigned tags
- [X] T059 [US5] Add TagSelector to DefinitionDetail for tag assignment
- [X] T060 [US5] Add tag filter dropdown to DefinitionFilters (created in US6)
- [X] T061 [US5] Implement inline tag creation in TagSelector
- [X] T062 [US5] Write tests for TagSelector in `apps/web/tests/components/definitions/TagSelector.test.tsx`
- [X] T063 [US5] Write tests for TagChips in `apps/web/tests/components/definitions/TagChips.test.tsx`

**Checkpoint**: User Story 5 complete - can manage tags

---

## Phase 8: User Story 6 - Search and Filter (Priority: P2)

**Goal**: Users can search by name and filter by criteria

**Independent Test**: Enter search, verify filtered results; apply filters, verify

### Implementation for User Story 6

- [X] T064 [P] [US6] Create DefinitionFilters component in `apps/web/src/components/definitions/DefinitionFilters.tsx`
- [X] T065 [US6] Add search input with debounce to DefinitionFilters
- [X] T066 [US6] Add "Root only" toggle filter to DefinitionFilters
- [X] T067 [US6] Add "Has runs" toggle filter to DefinitionFilters
- [X] T068 [US6] Add "Clear filters" button to DefinitionFilters
- [X] T069 [US6] Integrate DefinitionFilters into DefinitionList
- [X] T070 [US6] Update useDefinitions hook to accept filter parameters
- [X] T071 [US6] Write tests for DefinitionFilters in `apps/web/tests/components/definitions/DefinitionFilters.test.tsx`

**Checkpoint**: User Story 6 complete - can search and filter

---

## Phase 9: User Story 7 - Version Tree/Lineage (Priority: P2)

**Goal**: Users can visualize definition version tree

**Independent Test**: View forked definition, verify tree shows lineage

### Implementation for User Story 7

- [X] T072 [P] [US7] Create useVersionTree hook in `apps/web/src/hooks/useVersionTree.ts`
- [X] T073 [US7] Create VersionTree component in `apps/web/src/components/definitions/VersionTree.tsx`
- [X] T074 [US7] Add VersionTree panel to DefinitionDetail page
- [X] T075 [US7] Implement node click navigation in VersionTree
- [X] T076 [US7] Add hover tooltip with node details (name, date) in VersionTree
- [X] T077 [US7] Highlight current definition in VersionTree
- [X] T078 [US7] Write tests for VersionTree in `apps/web/tests/components/definitions/VersionTree.test.tsx`

**Checkpoint**: User Story 7 complete - can view version lineage

---

## Phase 10: User Story 8 - Preview Generated Scenarios (Priority: P3)

**Goal**: Users can preview scenarios that would be generated

**Independent Test**: Open definition, click preview, verify combinations shown

### Implementation for User Story 8

- [X] T079 [P] [US8] Create useScenarioPreview hook in `apps/web/src/hooks/useScenarioPreview.ts`
- [X] T080 [US8] Create ScenarioPreview component in `apps/web/src/components/definitions/ScenarioPreview.tsx`
- [X] T081 [US8] Implement client-side cartesian product generation in useScenarioPreview
- [X] T082 [US8] Add "Preview Scenarios" button to DefinitionEditor
- [X] T083 [US8] Display scenario count and sample (max 10) in ScenarioPreview
- [X] T084 [US8] Show filled template for each preview scenario
- [X] T085 [US8] Write tests for useScenarioPreview in `apps/web/tests/hooks/useScenarioPreview.test.ts`
- [X] T086 [US8] Write tests for ScenarioPreview in `apps/web/tests/components/definitions/ScenarioPreview.test.tsx`

**Checkpoint**: User Story 8 complete - can preview scenarios

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements, testing, documentation

### Testing & Coverage

- [ ] T087 [P] Run full test suite and verify 80% coverage target (SC-007)
- [ ] T088 [P] Fix any failing tests and coverage gaps
- [ ] T089 Run TypeScript type checking: `npm run typecheck`

### UI Polish

- [ ] T090 [P] Ensure all components < 400 lines (SC-008, constitution)
- [ ] T091 [P] Review empty/loading/error states for all components
- [ ] T092 Verify no `any` types in new code (SC-009, constitution)

### Documentation & Validation

- [ ] T093 [P] Update components index file `apps/web/src/components/definitions/index.ts`
- [ ] T094 [P] Update hooks index file `apps/web/src/hooks/index.ts`
- [ ] T095 Run manual validation per quickstart.md scenarios
- [ ] T096 Create commit with Stage 8 implementation

**Checkpoint**: Stage 8 complete - all user stories functional

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundation (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Stories (Phase 3-10)**: Depend on Foundation
  - P1 stories (US1-4) should complete first
  - P2 stories (US5-7) depend on P1 infrastructure
  - P3 stories (US8) can proceed after P2
- **Polish (Phase 11)**: Depends on all user stories complete

### User Story Dependencies

```
Foundation (BLOCKING)
    │
    ├── US1 (Browse) ─────► US6 (Search/Filter)
    │       │
    │       └──────────────► US5 (Tags) uses DefinitionCard
    │
    ├── US2 (Create) ─────► US3 (Edit) uses DefinitionEditor
    │       │
    │       └──────────────► US4 (Fork)
    │       │
    │       └──────────────► US8 (Preview) uses DefinitionEditor
    │
    └── US7 (Version Tree) - Independent after Foundation
```

### Parallel Opportunities

- Tasks marked [P] can run in parallel within each phase
- US1, US2 can proceed in parallel (different files)
- US5, US6, US7 can proceed in parallel after US1, US2 complete
- Different developers can work on different user stories simultaneously

---

## Task Statistics

| Phase | Tasks | User Story |
|-------|-------|------------|
| Setup | 2 | - |
| Foundation | 21 | - |
| US1 Browse | 8 | P1 |
| US2 Create | 11 | P1 |
| US3 Edit | 6 | P1 |
| US4 Fork | 6 | P1 |
| US5 Tags | 9 | P2 |
| US6 Search | 8 | P2 |
| US7 Tree | 7 | P2 |
| US8 Preview | 8 | P3 |
| Polish | 10 | - |
| **Total** | **96** | - |

### MVP (P1 only): 31 tasks + 23 foundation = 54 tasks
### Full Feature: 96 tasks

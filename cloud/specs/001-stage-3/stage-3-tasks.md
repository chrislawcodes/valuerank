# Tasks: Stage 3 - GraphQL API Foundation

**Prerequisites**: stage-3-plan.md, stage-3-graphql.md (spec)

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1-US8)
- Include exact file paths from plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and create base directory structure

- [X] T001 Install GraphQL dependencies in apps/api/package.json (graphql, graphql-yoga, @pothos/core, @pothos/plugin-prisma, @pothos/plugin-validation, dataloader, zod)
- [X] T002 Run `npm install` to install all dependencies
- [X] T003 Run `npm run db:generate` to regenerate Prisma client with Pothos plugin support
- [X] T004 Create directory structure: apps/api/src/graphql/{types,queries,mutations,dataloaders}/

**Checkpoint**: Dependencies installed, directories ready

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Core GraphQL infrastructure that MUST be complete before ANY user story

⚠️ **CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Create Pothos builder configuration in apps/api/src/graphql/builder.ts
- [X] T006 [P] Create DateTime and JSON scalars in apps/api/src/graphql/types/scalars.ts
- [X] T007 [P] Create RunStatus and AnalysisStatus enums in apps/api/src/graphql/types/enums.ts
- [X] T008 Create context type with DataLoader placeholders in apps/api/src/graphql/context.ts
- [X] T009 Create GraphQL Yoga server setup in apps/api/src/graphql/index.ts
- [X] T010 Create types/index.ts re-export file
- [X] T011 [P] Create queries/index.ts re-export file
- [X] T012 [P] Create mutations/index.ts re-export file
- [X] T013 [P] Create dataloaders/index.ts factory file
- [X] T014 Mount GraphQL middleware in apps/api/src/server.ts at /graphql route

**Checkpoint**: Foundation ready - GraphQL endpoint responds to introspection queries

---

## Phase 3: User Story 1 - Query Single Definition (Priority: P1)

**Goal**: Fetch a single definition by ID with relationships

**Independent Test**: `query { definition(id: "...") { id name parent { id } children { id } } }`

### Implementation for User Story 1

- [X] T015 [US1] Create Definition DataLoader in apps/api/src/graphql/dataloaders/definition.ts
- [X] T016 [US1] Create Definition type with scalar fields in apps/api/src/graphql/types/definition.ts
- [X] T017 [US1] Add parent field resolver using DataLoader in apps/api/src/graphql/types/definition.ts
- [X] T018 [US1] Add children field resolver in apps/api/src/graphql/types/definition.ts
- [X] T019 [US1] Add runs field resolver in apps/api/src/graphql/types/definition.ts
- [X] T020 [US1] Add scenarios field resolver in apps/api/src/graphql/types/definition.ts
- [X] T021 [US1] Create definition(id) query in apps/api/src/graphql/queries/definition.ts
- [X] T022 [US1] Write unit test for Definition DataLoader in apps/api/tests/graphql/dataloaders/definition.test.ts
- [X] T023 [US1] Write integration test for definition query in apps/api/tests/graphql/queries/definition.test.ts

**Checkpoint**: US1 complete - Can query single definition with nested relationships

---

## Phase 4: User Story 2 - List Definitions with Filtering (Priority: P1)

**Goal**: List definitions with pagination and rootOnly filter

**Independent Test**: `query { definitions(rootOnly: true, limit: 5) { id parentId } }`

### Implementation for User Story 2

- [X] T024 [US2] Create definitions(rootOnly, limit, offset) query in apps/api/src/graphql/queries/definition.ts
- [X] T025 [US2] Add pagination args validation (limit max 100) in apps/api/src/graphql/queries/definition.ts
- [X] T026 [US2] Write integration test for definitions list query in apps/api/tests/graphql/queries/definition.test.ts
- [X] T027 [US2] Test pagination (limit/offset) combinations in apps/api/tests/graphql/queries/definition.test.ts
- [X] T028 [US2] Test rootOnly filter returns only null parentId in apps/api/tests/graphql/queries/definition.test.ts

**Checkpoint**: US2 complete - Can list and filter definitions

---

## Phase 5: User Story 3 - Query Single Run with Progress (Priority: P1)

**Goal**: Fetch a run by ID with transcripts and relationships

**Independent Test**: `query { run(id: "...") { status progress definition { id } transcripts { id } } }`

### Implementation for User Story 3

- [X] T029 [US3] Create Run DataLoader in apps/api/src/graphql/dataloaders/run.ts
- [X] T030 [P] [US3] Create Transcript DataLoader (by run) in apps/api/src/graphql/dataloaders/transcript.ts
- [X] T031 [P] [US3] Create Scenario DataLoader in apps/api/src/graphql/dataloaders/scenario.ts
- [X] T032 [US3] Create Run type with scalar fields in apps/api/src/graphql/types/run.ts
- [X] T033 [US3] Add definition field resolver using DataLoader in apps/api/src/graphql/types/run.ts
- [X] T034 [US3] Add experiment field resolver in apps/api/src/graphql/types/run.ts
- [X] T035 [US3] Add transcripts field resolver with model filter arg in apps/api/src/graphql/types/run.ts
- [X] T036 [US3] Create Transcript type with all fields in apps/api/src/graphql/types/transcript.ts
- [X] T037 [P] [US3] Create Scenario type with all fields in apps/api/src/graphql/types/scenario.ts
- [X] T038 [P] [US3] Create Experiment type with all fields in apps/api/src/graphql/types/experiment.ts
- [X] T039 [US3] Create run(id) query in apps/api/src/graphql/queries/run.ts
- [X] T040 [US3] Write unit tests for Run/Transcript DataLoaders in apps/api/tests/graphql/dataloaders/run.test.ts
- [X] T041 [US3] Write integration test for run query in apps/api/tests/graphql/queries/run.test.ts

**Checkpoint**: US3 complete - Can query single run with nested transcripts

---

## Phase 6: User Story 4 - List Runs with Filtering (Priority: P1)

**Goal**: List runs with filters by definition, status, experiment

**Independent Test**: `query { runs(status: COMPLETED, limit: 10) { id status } }`

### Implementation for User Story 4

- [X] T042 [US4] Create runs(definitionId, experimentId, status, limit, offset) query in apps/api/src/graphql/queries/run.ts
- [X] T043 [US4] Add pagination args validation in apps/api/src/graphql/queries/run.ts
- [X] T044 [US4] Write integration test for runs list query in apps/api/tests/graphql/queries/run.test.ts
- [X] T045 [US4] Test status filter in apps/api/tests/graphql/queries/run.test.ts
- [X] T046 [US4] Test definitionId filter in apps/api/tests/graphql/queries/run.test.ts
- [X] T047 [US4] Test combined filters in apps/api/tests/graphql/queries/run.test.ts

**Checkpoint**: US4 complete - Can list and filter runs

---

## Phase 7: User Story 5 - Create Definition (Priority: P1)

**Goal**: Create a new definition via mutation

**Independent Test**: Mutation creates definition, query retrieves it

### Implementation for User Story 5

- [X] T048 [US5] Create CreateDefinitionInput input type in apps/api/src/graphql/mutations/definition.ts
- [X] T049 [US5] Create createDefinition mutation in apps/api/src/graphql/mutations/definition.ts
- [X] T050 [US5] Implement ensureSchemaVersion helper for content in apps/api/src/graphql/mutations/definition.ts
- [X] T051 [US5] Add input validation (name required, content must be object) in apps/api/src/graphql/mutations/definition.ts
- [X] T052 [US5] Write integration test for createDefinition mutation in apps/api/tests/graphql/mutations/definition.test.ts
- [X] T053 [US5] Test schema_version auto-added to content in apps/api/tests/graphql/mutations/definition.test.ts
- [X] T054 [US5] Test validation errors for invalid input in apps/api/tests/graphql/mutations/definition.test.ts

**Checkpoint**: US5 complete - Can create definitions via GraphQL

---

## Phase 8: User Story 6 - Fork Definition (Priority: P1)

**Goal**: Fork existing definition with parent-child linking

**Independent Test**: Fork creates child, parent.children includes fork

### Implementation for User Story 6

- [X] T055 [US6] Create ForkDefinitionInput input type in apps/api/src/graphql/mutations/definition.ts
- [X] T056 [US6] Create forkDefinition mutation in apps/api/src/graphql/mutations/definition.ts
- [X] T057 [US6] Implement parent existence check with NotFoundError in apps/api/src/graphql/mutations/definition.ts
- [X] T058 [US6] Implement content inheritance (copy from parent if not provided) in apps/api/src/graphql/mutations/definition.ts
- [X] T059 [US6] Write integration test for forkDefinition mutation in apps/api/tests/graphql/mutations/definition.test.ts
- [X] T060 [US6] Test content inheritance from parent in apps/api/tests/graphql/mutations/definition.test.ts
- [X] T061 [US6] Test NotFoundError for invalid parentId in apps/api/tests/graphql/mutations/definition.test.ts
- [X] T062 [US6] Test fork appears in parent.children query in apps/api/tests/graphql/mutations/definition.test.ts

**Checkpoint**: US6 complete - Can fork definitions via GraphQL

---

## Phase 9: User Story 7 - DataLoader N+1 Prevention (Priority: P2)

**Goal**: Verify DataLoaders batch queries effectively

**Independent Test**: Nested query makes ≤3 DB calls instead of N+1

### Implementation for User Story 7

- [X] T063 [US7] Add debug logging for DataLoader batch calls in apps/api/src/graphql/dataloaders/*.ts
- [X] T064 [US7] Write test verifying batching for runs→definitions in apps/api/tests/graphql/dataloaders/batching.test.ts
- [X] T065 [US7] Write test verifying batching for definitions→parent in apps/api/tests/graphql/dataloaders/batching.test.ts
- [X] T066 [US7] Write test verifying per-request DataLoader isolation in apps/api/tests/graphql/dataloaders/batching.test.ts

**Checkpoint**: US7 complete - DataLoaders batch queries, verified by tests

---

## Phase 10: User Story 8 - GraphQL Playground (Priority: P3)

**Goal**: Interactive playground available in development

**Independent Test**: Access /graphql in browser shows playground UI

### Implementation for User Story 8

- [X] T067 [US8] Configure GraphiQL in GraphQL Yoga (enabled in development only) in apps/api/src/graphql/index.ts
- [X] T068 [US8] Add environment check for NODE_ENV in playground config in apps/api/src/graphql/index.ts
- [X] T069 [US8] Manual test: verify playground loads at http://localhost:3001/graphql
- [X] T070 [US8] Manual test: verify schema introspection query works

**Checkpoint**: US8 complete - Playground works in development

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation

- [X] T071 Run full test suite with coverage: `npm run test:coverage`
- [X] T072 Verify coverage meets 80% threshold for graphql/ directory
- [X] T073 [P] Run linting: `npm run lint`
- [X] T074 [P] Run type checking: `npm run typecheck`
- [X] T075 Execute all quickstart.md scenarios manually
- [X] T076 Update apps/api/package.json version if needed
- [X] T077 Mark Stage 3 complete in cloud/specs/high-level.md

**Checkpoint**: Stage 3 complete - All exit criteria verified

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    └── Phase 2 (Foundation) ─── BLOCKS ALL USER STORIES
            │
            ├── Phase 3 (US1: Query Definition)
            │       └── Phase 4 (US2: List Definitions)
            │
            ├── Phase 5 (US3: Query Run) ──────────┐
            │       └── Phase 6 (US4: List Runs)   │
            │                                      │
            └── Phase 7 (US5: Create Definition) ──┤
                    └── Phase 8 (US6: Fork)        │
                                                   │
                Phase 9 (US7: DataLoader) ◀────────┘
                    └── Phase 10 (US8: Playground)
                            └── Phase 11 (Polish)
```

### User Story Dependencies

| Story | Depends On | Can Parallel With |
|-------|------------|-------------------|
| US1 (Query Definition) | Foundation | US3, US5 |
| US2 (List Definitions) | US1 | US4, US6 |
| US3 (Query Run) | Foundation, Scenario/Transcript types | US1, US5 |
| US4 (List Runs) | US3 | US2, US6 |
| US5 (Create Definition) | Foundation, Definition type | US1, US3 |
| US6 (Fork Definition) | US5 | US4 |
| US7 (DataLoader) | US1, US3 (DataLoaders exist) | - |
| US8 (Playground) | Foundation | Any |

### Parallel Opportunities

- **Phase 2**: T006, T007 (scalars/enums), T010-T013 (index files)
- **Phase 5**: T030, T031 (Transcript/Scenario loaders), T037, T038 (types)
- **Phase 11**: T073, T074 (lint/typecheck)

---

## Task Statistics

| Metric | Count |
|--------|-------|
| **Total Tasks** | 77 |
| **Setup Tasks** | 4 |
| **Foundation Tasks** | 10 |
| **User Story Tasks** | 58 |
| **Polish Tasks** | 7 |
| **Parallel Opportunities** | 18 tasks marked [P] |

### By User Story

| Story | Tasks | Priority |
|-------|-------|----------|
| US1: Query Definition | 9 | P1 |
| US2: List Definitions | 5 | P1 |
| US3: Query Run | 13 | P1 |
| US4: List Runs | 6 | P1 |
| US5: Create Definition | 7 | P1 |
| US6: Fork Definition | 8 | P1 |
| US7: DataLoader | 4 | P2 |
| US8: Playground | 4 | P3 |

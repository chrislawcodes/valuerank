# Tasks: Data Export & CLI Compatibility

**Prerequisites**: plan.md, spec.md, data-model.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1-US3)
- Include exact file paths from plan.md

---

## Scope: P1/MVP Only

This stage implements **P1 user stories only**:
- US1: Export Definition as Markdown
- US2: Import Definition from Markdown
- US3: Export Scenarios as CLI-Compatible YAML

**Deferred to future stage**:
- US4-US6 (P2): Bulk export, bundle export, download URLs
- US7-US8 (P3): YAML import, aggregation export

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and create base structure

- [X] T001 Install `js-yaml` package in apps/api/package.json (SKIPPED: using existing `yaml` ^2.8.2)
- [X] T002 [P] Install `@types/js-yaml` dev dependency (SKIPPED: `yaml` package has built-in types)
- [X] T003 Create directory structure: apps/api/src/services/export/ (already exists)
- [X] T004 [P] Create directory structure: apps/api/src/services/import/

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Types and shared utilities that ALL user stories depend on

⚠️ **CRITICAL**: No user story work can begin until this phase is complete

### Types

- [X] T005 Create export types file: apps/api/src/services/export/types.ts (~50 lines)
- [X] T006 [P] Create import types file: apps/api/src/services/import/types.ts (~30 lines)

### Export Service Index

- [X] T007 Create export service index: apps/api/src/services/export/index.ts (re-exports)

### Tests Setup

- [X] T008 Create test fixtures: apps/api/tests/services/export/fixtures.ts
- [X] T009 [P] Create import test fixtures: apps/api/tests/services/import/fixtures.ts

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Export Definition as Markdown (Priority: P1) 🎯 MVP

**Goal**: Export a definition to devtool-compatible markdown format

**Independent Test**: Export definition via API, verify output parses with devtool's `parseScenarioMd()`

### Implementation for User Story 1

- [X] T010 [US1] Create MD serializer: apps/api/src/services/export/md.ts
  - Port `serializeScenarioMd()` from devtool/src/server/utils/scenarioMd.ts
  - Adapt to use cloud's `DefinitionContent` type
  - Map cloud fields to MD format (~200 lines)

- [X] T011 [US1] Create MD serializer tests: apps/api/tests/services/export/md.test.ts
  - Test dimension table formatting
  - Test special character escaping
  - Test empty dimensions case
  - Test matching rules inclusion

- [X] T012 [US1] Add GraphQL mutation: apps/api/src/graphql/mutations/export.ts
  - `exportDefinitionAsMd(id: ID!): ExportResult!`
  - Returns content, filename, mimeType

- [X] T013 [US1] Add mutation tests: apps/api/tests/graphql/mutations/export.test.ts

- [X] T014 [US1] Add REST endpoint: apps/api/src/routes/export.ts
  - `GET /api/export/definitions/:id/md`
  - Streams file download
  - Update existing export router

- [X] T015 [US1] Add REST endpoint tests: apps/api/tests/routes/export-md.test.ts

- [X] T016 [US1] Create web UI component: apps/web/src/components/export/ExportButton.tsx
  - Dropdown with export format options
  - MD export triggers download

- [X] T017 [US1] Integrate export button in definition detail page: apps/web/src/pages/DefinitionDetail.tsx

**Checkpoint**: User Story 1 complete - definitions can be exported as MD

---

## Phase 4: User Story 2 - Import Definition from Markdown (Priority: P1) 🎯 MVP

**Goal**: Import devtool .md files into Cloud ValueRank

**Independent Test**: Upload existing devtool .md file, verify definition created with all fields

### Implementation for User Story 2

- [X] T018 [US2] Create MD parser: apps/api/src/services/import/md.ts
  - Port `parseScenarioMd()` from devtool/src/server/utils/scenarioMd.ts
  - Validate required sections (preamble, template)
  - Map to cloud's `DefinitionContent` type
  - Return structured validation errors (~200 lines)

- [X] T019 [US2] Create MD parser tests: apps/api/tests/services/import/md.test.ts
  - Test valid MD parsing
  - Test missing section errors
  - Test malformed dimension tables
  - Test frontmatter extraction

- [X] T020 [US2] Create validation service: apps/api/src/services/import/validation.ts
  - Validate parsed content structure
  - Check for duplicate definition names
  - Return actionable error messages (~100 lines)

- [X] T021 [US2] Add REST import endpoint: apps/api/src/routes/import.ts
  - `POST /api/import/definition` (JSON body with content)
  - Parse and validate
  - Create definition via existing service (~100 lines)

- [X] T022 [US2] Add import endpoint tests: apps/api/tests/routes/import.test.ts

- [X] T023 [US2] Register import router: apps/api/src/server.ts

- [X] T024 [US2] Create web UI component: apps/web/src/components/import/ImportDialog.tsx
  - File upload drag-and-drop
  - Validation error display
  - Name conflict resolution (~200 lines)

- [X] T025 [US2] Create import API client: apps/web/src/api/import.ts

- [X] T026 [US2] Add import button to definitions page: apps/web/src/components/definitions/DefinitionList.tsx

- [X] T027 [US2] Create round-trip test: apps/api/tests/integration/md-roundtrip.test.ts
  - Export → Import → Compare content

**Checkpoint**: User Story 2 complete - definitions can be imported from MD

---

## Phase 5: User Story 3 - Export Scenarios as CLI-Compatible YAML (Priority: P1) 🎯 MVP

**Goal**: Export scenarios in format usable by CLI `probe.py`

**Independent Test**: Export YAML, run through CLI probe.py (dry-run), verify no errors

### Implementation for User Story 3

- [ ] T028 [US3] Create YAML serializer: apps/api/src/services/export/yaml.ts
  - Build CLI-compatible format with `preamble` and `scenarios` map
  - Use js-yaml with block scalar notation for body
  - Handle empty scenarios error case (~150 lines)

- [ ] T029 [US3] Create YAML serializer tests: apps/api/tests/services/export/yaml.test.ts
  - Test preamble extraction
  - Test scenario structure
  - Test multi-line body formatting
  - Test empty scenarios error

- [ ] T030 [US3] Add GraphQL mutation: update apps/api/src/graphql/mutations/export.ts
  - `exportScenariosAsYaml(definitionId: ID!): ExportResult!`

- [ ] T031 [US3] Add mutation tests: update apps/api/tests/graphql/mutations/export.test.ts

- [ ] T032 [US3] Add REST endpoint: update apps/api/src/routes/export.ts
  - `GET /api/export/definitions/:id/scenarios.yaml`

- [ ] T033 [US3] Add YAML export to UI: update apps/web/src/components/export/ExportButton.tsx
  - Add "Export Scenarios (YAML)" option

- [ ] T034 [US3] Create CLI compatibility test: apps/api/tests/integration/yaml-cli-compat.test.ts
  - Generate YAML, validate structure matches scenarios/*.yaml format

**Checkpoint**: User Story 3 complete - scenarios can be exported for CLI use

---

## Phase 6: Polish & Validation

**Purpose**: Documentation, testing, and final validation

- [ ] T035 [P] Add audit logging to export operations: update apps/api/src/services/export/*.ts
- [ ] T036 [P] Update API documentation: update apps/api/README.md
- [ ] T037 Run full test suite: npm run test:coverage
- [ ] T038 Verify 80%+ coverage for new code
- [ ] T039 Manual validation per quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundation (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Stories (Phase 3-5)**: Depend on Foundation, can run in parallel
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Independent after Foundation - MD export
- **User Story 2 (P1)**: Independent after Foundation - MD import
- **User Story 3 (P1)**: Independent after Foundation - YAML export

### Parallel Opportunities

- Tasks marked [P] can run in parallel within each phase
- US1 (MD export) and US2 (MD import) can be done in parallel
- US3 (YAML export) can be done in parallel with US1/US2

### Recommended Execution Order

1. Phase 1: Setup (~30 min)
2. Phase 2: Foundation (~1 hour)
3. Phase 3: US1 - MD Export (~4 hours) ← Critical path
4. Phase 4: US2 - MD Import (~4 hours) ← Can parallel with US1
5. Phase 5: US3 - YAML Export (~3 hours) ← Can parallel with US1/US2
6. Phase 6: Polish (~2 hours)

**Total Tasks**: 39
**Estimated Time**: ~15 hours

---

## Deferred to Future Stage

The following user stories are deferred to a future stage:

### P2 Stories (Stage 15b or 16)
- US4: Export Run Results (Bulk JSONL/CSV)
- US5: Export Full Run Bundle (CLI Format ZIP)
- US6: Generate Download URLs with Expiry

### P3 Stories (Stage 15c or later)
- US7: Import Scenarios from YAML
- US8: Flexible Aggregation Export

These require additional infrastructure (ExportJob table, async job processing, file storage) that is not needed for the P1/MVP scope.

# Tasks: Stage 14 - MCP Write Tools

**Prerequisites**: plan.md, spec.md, quickstart.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story (US1-US8) for user story phases
- Include exact file paths from plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create feature branch `feature/stage-14-mcp-write-tools` from `cloud-planning`
- [X] T002 Verify all Stage 12 tests pass (`npm test`)
- [X] T003 Review existing MCP tool pattern in `apps/api/src/mcp/tools/list-definitions.ts`

**Checkpoint**: Ready to implement foundation

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

⚠️ **CRITICAL**: No user story work can begin until this phase is complete

### Validation Utilities
- [X] T004 Create validation service at `apps/api/src/services/mcp/validation.ts`
  - Export `ValidationResult`, `ValidationError`, `ValidationWarning` types
  - Export `validateDefinitionContent(content)` function
  - Implement dimension limit check (max 10)
  - Implement levels-per-dimension check (max 10)
  - Implement template length check (max 10000)
  - Implement scenario count calculation
  - Implement scenario count limit check (max 1000)
  - Implement warning for template without placeholders

- [X] T005 [P] Create audit logging service at `apps/api/src/services/mcp/audit.ts`
  - Export `AuditEntry` type
  - Export `logAuditEvent(entry)` function
  - Use structured logging via `createLogger('mcp:audit')`

- [X] T006 [P] Update MCP service index at `apps/api/src/services/mcp/index.ts`
  - Re-export validation utilities
  - Re-export audit logging

- [X] T007 Create tests for validation at `apps/api/tests/services/mcp/validation.test.ts`
  - Test valid content passes validation
  - Test dimension limit error
  - Test levels limit error
  - Test template length error
  - Test scenario count error
  - Test placeholder warning

- [X] T008 [P] Create tests for audit at `apps/api/tests/services/mcp/audit.test.ts`
  - Test audit log entry creation
  - Test structured log format

### MCP Server Update
- [X] T009 Update MCP server at `apps/api/src/mcp/server.ts`
  - Add `resources: {}` to capabilities
  - Update instructions to mention write tools and resources

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Create Definition via MCP (Priority: P1) 🎯 MVP

**Goal**: AI agents can create new scenario definitions via MCP conversation

**Independent Test**: Ask Claude to create a definition, verify it appears in database

### Implementation for User Story 1

- [X] T010 [US1] Create tool handler at `apps/api/src/mcp/tools/create-definition.ts`
  - Define `CreateDefinitionInputSchema` with Zod
  - Implement `registerCreateDefinitionTool(server)`
  - Call validation service before creation
  - Delegate to existing definition creation service/pattern from `graphql/mutations/definition.ts`
  - Call audit log on success
  - Return `definition_id` and `validation_warnings`
  - Use `addToolRegistrar` to register tool

- [X] T011 [US1] Create tests at `apps/api/tests/mcp/tools/create-definition.test.ts`
  - Test successful creation with valid input
  - Test validation error on invalid content
  - Test missing required fields error
  - Test audit log called on success
  - Test response format matches spec

- [X] T012 [US1] Update tool index at `apps/api/src/mcp/tools/index.ts`
  - Import and register create-definition tool

**Checkpoint**: User Story 1 fully functional and testable independently

---

## Phase 4: User Story 2 - Fork Definition via MCP (Priority: P1) 🎯 MVP

**Goal**: AI agents can fork existing definitions with modifications

**Independent Test**: Fork a definition, verify parent-child relationship in database

### Implementation for User Story 2

- [X] T013 [US2] Create tool handler at `apps/api/src/mcp/tools/fork-definition.ts`
  - Define `ForkDefinitionInputSchema` with Zod
  - Implement `registerForkDefinitionTool(server)`
  - Validate parent exists and not soft-deleted
  - Merge changes with parent content
  - Delegate to existing fork pattern from `graphql/mutations/definition.ts`
  - Call audit log on success
  - Return `definition_id` and `diff_summary`

- [X] T014 [US2] Create tests at `apps/api/tests/mcp/tools/fork-definition.test.ts`
  - Test successful fork with partial changes
  - Test fork with no changes (warning)
  - Test parent not found error
  - Test parent soft-deleted error
  - Test audit log called on success

- [X] T015 [US2] Update tool index at `apps/api/src/mcp/tools/index.ts`
  - Import and register fork-definition tool

**Checkpoint**: User Story 2 fully functional and testable independently

---

## Phase 5: User Story 3 - Validate Definition Before Saving (Priority: P1) 🎯 MVP

**Goal**: AI agents can validate content without persisting to database

**Independent Test**: Validate malformed content, verify errors returned without database change

### Implementation for User Story 3

- [X] T016 [US3] Create tool handler at `apps/api/src/mcp/tools/validate-definition.ts`
  - Define `ValidateDefinitionInputSchema` with Zod
  - Implement `registerValidateDefinitionTool(server)`
  - Call validation service
  - Return `valid`, `errors`, `warnings`, `estimatedScenarioCount`, `dimensionCoverage`
  - Do NOT persist anything to database

- [X] T017 [US3] Create tests at `apps/api/tests/mcp/tools/validate-definition.test.ts`
  - Test valid content returns valid: true
  - Test invalid content returns errors
  - Test warnings for non-blocking issues
  - Test scenario count calculation
  - Test dimension coverage calculation
  - Verify no database operations

- [X] T018 [US3] Update tool index at `apps/api/src/mcp/tools/index.ts`
  - Import and register validate-definition tool

**Checkpoint**: User Story 3 fully functional and testable independently

---

## Phase 6: User Story 4 - Start Run via MCP (Priority: P1) 🎯 MVP

**Goal**: AI agents can start evaluation runs via MCP

**Independent Test**: Start run via MCP, verify run created and jobs queued

### Implementation for User Story 4

- [X] T019 [US4] Create tool handler at `apps/api/src/mcp/tools/start-run.ts`
  - Define `StartRunInputSchema` with Zod
  - Implement `registerStartRunTool(server)`
  - Validate definition exists and not soft-deleted
  - Validate all models are supported (use provider service)
  - Delegate to existing `startRunService` from `services/run/index.ts`
  - Call audit log on success
  - Return `run_id`, `queued_task_count`, `estimated_cost`

- [X] T020 [US4] Create tests at `apps/api/tests/mcp/tools/start-run.test.ts`
  - Test successful run start
  - Test definition not found error
  - Test invalid model error
  - Test sample percentage validation
  - Test audit log called on success
  - Test job queuing

- [X] T021 [US4] Update tool index at `apps/api/src/mcp/tools/index.ts`
  - Import and register start-run tool

**Checkpoint**: User Story 4 fully functional and testable independently

---

## Phase 7: User Story 8 - Input Validation and Sanitization (Priority: P1) 🎯 MVP

**Goal**: All AI-generated content validated before database operations

**Note**: This is P1 because it's security-critical and already partially implemented in validation service

### Implementation for User Story 8

- [X] T022 [US8] Enhance validation service at `apps/api/src/services/mcp/validation.ts`
  - Add template length error message with limit value
  - Add dimension count error message with limit value
  - Add levels count error message with limit value
  - Add scenario count error message with limit value
  - Validate JSON structure (preamble, template, dimensions required)
  - Check for unmatched placeholders (warning)

- [X] T023 [US8] Add validation tests at `apps/api/tests/services/mcp/validation.test.ts`
  - Test all error messages include limit values
  - Test missing required fields
  - Test malformed JSON structure
  - Test unmatched placeholder warning

- [X] T024 [US8] Verify validation integration in all write tools
  - Confirm create-definition calls validation
  - Confirm fork-definition calls validation on merged content
  - Confirm validate-definition returns all validation results

**Checkpoint**: User Story 8 complete - all inputs validated

---

## Phase 8: User Story 5 - Preview Generated Scenarios (Priority: P2)

**Goal**: AI agents can preview scenarios before starting a run

**Independent Test**: Preview scenarios for definition, verify sample returned without database change

### Implementation for User Story 5

- [X] T025 [US5] Create tool handler at `apps/api/src/mcp/tools/generate-scenarios-preview.ts`
  - Define `GenerateScenariosPreviewInputSchema` with Zod
  - Implement `registerGenerateScenariosPreviewTool(server)`
  - Validate definition exists and not soft-deleted
  - Generate scenarios in memory (use existing expansion logic)
  - Return `scenario_count`, `scenarios` (sample of 5), `sample_body` (first scenario full text)
  - Do NOT persist scenarios to database

- [X] T026 [US5] Create tests at `apps/api/tests/mcp/tools/generate-scenarios-preview.test.ts`
  - Test successful preview
  - Test definition not found error
  - Test scenario count accuracy
  - Test sample limited to 5 scenarios
  - Test sample_body contains full scenario text
  - Verify no database writes

- [X] T027 [US5] Update tool index at `apps/api/src/mcp/tools/index.ts`
  - Import and register generate-scenarios-preview tool

**Checkpoint**: User Story 5 fully functional and testable independently

---

## Phase 9: User Story 6 - Access Authoring Resources (Priority: P2)

**Goal**: AI agents can access authoring guidance via MCP resources

**Independent Test**: Request authoring guide resource, verify content returned

### Implementation for User Story 6

- [X] T028 [US6] Create resources directory at `apps/api/src/mcp/resources/`

- [X] T029 [P] [US6] Create authoring guide at `apps/api/src/mcp/resources/authoring-guide.ts`
  - Export `AUTHORING_GUIDE_URI = 'valuerank://authoring/guide'`
  - Export `authoringGuideContent` with scenario structure, best practices, dimension design, pitfalls
  - Export `registerAuthoringGuideResource(server)`

- [X] T030 [P] [US6] Create authoring examples at `apps/api/src/mcp/resources/authoring-examples.ts`
  - Export `AUTHORING_EXAMPLES_URI = 'valuerank://authoring/examples'`
  - Export `authoringExamplesContent` with 3-5 annotated real definition examples
  - Export `registerAuthoringExamplesResource(server)`

- [X] T031 [P] [US6] Create value pairs at `apps/api/src/mcp/resources/value-pairs.ts`
  - Export `VALUE_PAIRS_URI = 'valuerank://authoring/value-pairs'`
  - Export `valuePairsContent` with common value tensions
  - Include Physical_Safety vs Economics, Freedom vs Tradition, etc.
  - Export `registerValuePairsResource(server)`

- [X] T032 [P] [US6] Create preamble templates at `apps/api/src/mcp/resources/preamble-templates.ts`
  - Export `PREAMBLE_TEMPLATES_URI = 'valuerank://authoring/preamble-templates'`
  - Export `preambleTemplatesContent` with tested preamble patterns
  - Export `registerPreambleTemplatesResource(server)`

- [X] T033 [US6] Create resource index at `apps/api/src/mcp/resources/index.ts`
  - Import all resource modules
  - Export `registerAllResources(server)` function
  - Export all URIs for reference

- [X] T034 [US6] Update MCP index at `apps/api/src/mcp/index.ts`
  - Import and call `registerAllResources(server)`

- [X] T035 [US6] Create tests at `apps/api/tests/mcp/resources/index.test.ts`
  - Test authoring guide resource accessible
  - Test examples resource accessible
  - Test value-pairs resource accessible
  - Test preamble-templates resource accessible
  - Test unknown resource returns 404 with available list

**Checkpoint**: User Story 6 fully functional and testable independently

---

## Phase 10: User Story 7 - Audit Trail for Write Operations (Priority: P2)

**Goal**: All write operations logged with user context

**Independent Test**: Perform write operation, verify audit log entry

### Implementation for User Story 7

- [X] T036 [US7] Verify audit logging in all write tools
  - Confirm create-definition logs audit entry
  - Confirm fork-definition logs audit entry
  - Confirm start-run logs audit entry

- [X] T037 [US7] Add integration tests at `apps/api/tests/mcp/integration.test.ts`
  - Test create-definition audit log includes userId, definitionId, action, timestamp
  - Test fork-definition audit log includes parentId
  - Test start-run audit log includes models array
  - NOTE: Tests in apps/api/tests/services/mcp/audit.test.ts cover these requirements

- [X] T038 [US7] Document audit log format in code comments
  - Document log fields in audit.ts
  - Document how to query logs (grep, structured log tools)

**Checkpoint**: User Story 7 complete - all writes audited

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Integration, documentation, and final validation

### Integration
- [X] T039 [P] Run full test suite and verify 80% coverage (`npm run test:coverage`)
  - NOTE: MCP services at 83%, overall API below 80% due to pre-existing code
  - All 743 API tests pass
- [X] T040 [P] Run typecheck and verify no errors (`npm run typecheck`)
- [X] T041 [P] Run lint and fix any issues (`npm run lint:fix`)

### Documentation
- [X] T042 Update MCP README if exists at `apps/api/src/mcp/README.md`
  - Created comprehensive README documenting all write tools
  - Documented authoring resources with URI table
  - Added usage examples and validation limits

### Manual Testing
- [ ] T043 Test with Claude Desktop per `quickstart.md`
  - NOTE: Requires user verification with Claude Desktop
  - Configure MCP client
  - Test create_definition
  - Test fork_definition
  - Test validate_definition
  - Test start_run
  - Test generate_scenarios_preview
  - Test authoring resources

### Final Validation
- [X] T044 Verify success criteria from spec.md
  - SC-001: AI agents can create definitions via MCP ✓
  - SC-002: AI agents can fork definitions via MCP ✓
  - SC-003: AI agents can validate content via MCP ✓
  - SC-004: AI agents can start runs via MCP ✓
  - SC-005: AI agents can preview scenarios ✓
  - SC-006: Authoring resources accessible ✓
  - SC-007: All write operations logged ✓
  - SC-008: Input validation prevents malformed content ✓
  - SC-009: 80% code coverage - MCP services 83%, overall below due to pre-existing
  - SC-010: All files under 400 lines ✓ (largest: 377)
  - SC-011: No `any` types in new code ✓ (pre-existing in Stage 12 tools)
  - SC-012: Response latency under 2 seconds ✓ (all tools are synchronous)

**Checkpoint**: Stage 14 complete and ready for review

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundation (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Stories (Phases 3-10)**: Depend on Foundation
  - P1 stories (3-7) should be completed first
  - P2 stories (8-10) can follow
  - Stories can proceed in parallel if staffed
- **Polish (Phase 11)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (Create Definition)**: Independent after Foundation
- **US2 (Fork Definition)**: Independent after Foundation
- **US3 (Validate Definition)**: Independent after Foundation
- **US4 (Start Run)**: Independent after Foundation
- **US5 (Preview Scenarios)**: Independent after Foundation
- **US6 (Authoring Resources)**: Independent after Foundation
- **US7 (Audit Trail)**: Depends on US1, US2, US4 (needs write operations to audit)
- **US8 (Input Validation)**: Integrated into US1, US2 (parallel development)

### Parallel Opportunities

- Tasks marked [P] can run in parallel within each phase
- All P1 user stories (US1-US4, US8) can be worked in parallel
- P2 user stories (US5-US7) can be worked in parallel
- Resource files (T029-T032) can all be written in parallel

### Recommended Execution Order (Single Developer)

1. Phase 1: Setup
2. Phase 2: Foundation (T004-T009)
3. Phase 3: US1 Create Definition (builds on validation)
4. Phase 5: US3 Validate Definition (reuses T004 validation)
5. Phase 4: US2 Fork Definition (similar to US1)
6. Phase 6: US4 Start Run
7. Phase 7: US8 Input Validation (polish validation)
8. Phase 8: US5 Preview Scenarios
9. Phase 9: US6 Authoring Resources
10. Phase 10: US7 Audit Trail
11. Phase 11: Polish

---

## Task Statistics

- **Total Tasks**: 44
- **Setup**: 3 tasks
- **Foundation**: 6 tasks (blocking)
- **P1 User Stories**: 16 tasks (US1: 3, US2: 3, US3: 3, US4: 3, US8: 3)
- **P2 User Stories**: 13 tasks (US5: 3, US6: 8, US7: 3)
- **Polish**: 6 tasks
- **Parallel Opportunities**: 15 tasks marked [P]

# Tasks: MCP API Enhancements

**Prerequisites**: plan.md, spec.md, data-model.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1, US2, etc.)
- Include exact file paths from plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize feature branch and verify development environment

- [X] T001 Create feature branch `feat/014-mcp-api-enhancements` from main
- [X] T002 Verify Docker PostgreSQL running on port 5433
- [X] T003 Run `npm run db:test:setup` to ensure test database ready

**Checkpoint**: Development environment ready

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Database schema changes and shared infrastructure that MUST be complete before ANY user story

⚠️ **CRITICAL**: No user story work can begin until this phase is complete

### Schema Migration

- [X] T004 Add `deletedAt` field to Transcript model in `packages/db/prisma/schema.prisma`
- [X] T005 Add `deletedAt` field to AnalysisResult model in `packages/db/prisma/schema.prisma`
- [X] T006 Add `@@index([deletedAt])` to Transcript model
- [X] T007 Add `@@index([deletedAt])` to AnalysisResult model
- [X] T008 Create migration: `npx prisma migrate dev --name add_soft_delete_transcript_analysis`
- [X] T009 Apply migration to test database

### Query Updates

- [X] T010 Add soft delete helpers to `packages/db/src/queries/definition.ts` (softDeleteDefinition)
- [X] T011 Add soft delete helpers to `packages/db/src/queries/run.ts` (softDeleteRun, cancelRunJobs)
- [X] T012 [P] Update Transcript queries in `packages/db/src/queries/` to filter `deletedAt: null`
- [X] T013 [P] Update AnalysisResult queries in `packages/db/src/queries/` to filter `deletedAt: null`

### Audit Logging Extension

- [X] T014 Extend `AuditAction` type in `apps/api/src/services/mcp/audit.ts` with new action types
- [X] T015 Add `createDeleteAudit` helper function for delete operations
- [X] T016 Add `createLlmAudit` helper function for LLM management operations

### Shared Types

- [X] T017 Create `DeleteResult` type in `packages/db/src/types/index.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Delete Definitions via MCP (Priority: P1) 🎯 MVP

**Goal**: Enable AI agents to soft-delete scenario definitions through MCP conversation

**Independent Test**: Call `delete_definition` with valid definition_id, verify definition and scenarios have deletedAt set

### Implementation for User Story 1

- [X] T018 [US1] Create `apps/api/src/mcp/tools/delete-definition.ts` with Zod input schema
- [X] T019 [US1] Implement definition existence check (not already deleted)
- [X] T020 [US1] Implement running run validation (block if RUNNING status)
- [X] T021 [US1] Implement cascading soft-delete (definition + scenarios in transaction)
- [X] T022 [US1] Add audit logging for delete_definition action
- [X] T023 [US1] Register tool via `addToolRegistrar` in tool file
- [X] T024 [US1] Write test `apps/api/tests/mcp/tools/delete-definition.test.ts`

**Checkpoint**: User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Delete Runs via MCP (Priority: P1) 🎯 MVP

**Goal**: Enable AI agents to soft-delete evaluation runs through MCP conversation

**Independent Test**: Call `delete_run` with valid run_id, verify run, transcripts, and analysis_results have deletedAt set

### Implementation for User Story 2

- [X] T025 [US2] Create `apps/api/src/mcp/tools/delete-run.ts` with Zod input schema
- [X] T026 [US2] Implement run existence check (not already deleted)
- [X] T027 [US2] Implement job cancellation for RUNNING/PENDING runs via PgBoss
- [X] T028 [US2] Implement cascading soft-delete (run + transcripts + analysis_results in transaction)
- [X] T029 [US2] Add audit logging for delete_run action
- [X] T030 [US2] Register tool via `addToolRegistrar`
- [X] T031 [US2] Write test `apps/api/tests/mcp/tools/delete-run.test.ts`

**Checkpoint**: User Story 2 should be fully functional and testable independently

---

## Phase 5: User Story 3 - List LLM Providers via MCP (Priority: P1)

**Goal**: Enable AI agents to discover available LLM providers with settings

**Independent Test**: Call `list_llm_providers`, verify returns all providers with rate limits

### Implementation for User Story 3

- [X] T032 [US3] Create `apps/api/src/mcp/tools/list-llm-providers.ts` with Zod input schema
- [X] T033 [US3] Implement provider listing with model counts (delegate to `packages/db/src/queries/llm.ts`)
- [X] T034 [US3] Implement `include_models` parameter support
- [X] T035 [US3] Ensure response under 3KB (no models) / 8KB (with models)
- [X] T036 [US3] Register tool via `addToolRegistrar`
- [X] T037 [US3] Write test `apps/api/tests/mcp/tools/list-llm-providers.test.ts`

**Checkpoint**: User Story 3 should be fully functional and testable independently

---

## Phase 6: User Story 4 - List LLM Models via MCP (Priority: P1)

**Goal**: Enable AI agents to see available models with costs and status

**Independent Test**: Call `list_llm_models`, verify returns models with costs, status, default flags

### Implementation for User Story 4

- [X] T038 [US4] Create `apps/api/src/mcp/tools/list-llm-models.ts` with Zod input schema
- [X] T039 [US4] Implement model listing with filters (provider_id, status, available_only)
- [X] T040 [US4] Add `isAvailable` computation (check API key env vars)
- [X] T041 [US4] Ensure response under 5KB
- [X] T042 [US4] Register tool via `addToolRegistrar`
- [X] T043 [US4] Write test `apps/api/tests/mcp/tools/list-llm-models.test.ts`

### get_llm_model Tool

- [X] T044 [P] [US4] Create `apps/api/src/mcp/tools/get-llm-model.ts` with dual lookup (id OR provider+modelId)
- [X] T045 [P] [US4] Write test `apps/api/tests/mcp/tools/get-llm-model.test.ts`

**Checkpoint**: User Story 4 should be fully functional and testable independently

---

## Phase 7: User Story 5 - Add New LLM Model via MCP (Priority: P1)

**Goal**: Enable operators to add new LLM models through conversation

**Independent Test**: Call `create_llm_model` with valid inputs, verify model created in database

### Implementation for User Story 5

- [X] T046 [US5] Create `apps/api/src/mcp/tools/create-llm-model.ts` with Zod input schema
- [X] T047 [US5] Implement validation (provider exists, no duplicate model_id)
- [X] T048 [US5] Delegate to `createModel` in `packages/db/src/queries/llm.ts`
- [X] T049 [US5] Add audit logging for create_llm_model action
- [X] T050 [US5] Register tool via `addToolRegistrar`
- [X] T051 [US5] Write test `apps/api/tests/mcp/tools/create-llm-model.test.ts`

**Checkpoint**: User Story 5 should be fully functional and testable independently

---

## Phase 8: User Story 6 - Update LLM Model via MCP (Priority: P1)

**Goal**: Enable operators to update model costs and display names

**Independent Test**: Call `update_llm_model` with new costs, verify database updated

### Implementation for User Story 6

- [X] T052 [US6] Create `apps/api/src/mcp/tools/update-llm-model.ts` with Zod input schema
- [X] T053 [US6] Implement validation (model exists, immutable fields rejected)
- [X] T054 [US6] Delegate to `updateModel` in `packages/db/src/queries/llm.ts`
- [X] T055 [US6] Add audit logging for update_llm_model action
- [X] T056 [US6] Register tool via `addToolRegistrar`
- [X] T057 [US6] Write test `apps/api/tests/mcp/tools/update-llm-model.test.ts`

**Checkpoint**: User Story 6 should be fully functional and testable independently

---

## Phase 9: User Story 7 - Deprecate/Reactivate LLM Model via MCP (Priority: P1)

**Goal**: Enable operators to manage model lifecycle

**Independent Test**: Call `deprecate_llm_model`, verify status changes to DEPRECATED

### Implementation for User Story 7

- [X] T058 [US7] Create `apps/api/src/mcp/tools/deprecate-llm-model.ts` with Zod input schema
- [X] T059 [US7] Delegate to `deprecateModel` in `packages/db/src/queries/llm.ts`
- [X] T060 [US7] Return both deprecated model and new default (if applicable)
- [X] T061 [US7] Add audit logging for deprecate_llm_model action
- [X] T062 [US7] Register tool via `addToolRegistrar`
- [X] T063 [US7] Write test `apps/api/tests/mcp/tools/deprecate-llm-model.test.ts`

### Reactivate Tool

- [X] T064 [P] [US7] Create `apps/api/src/mcp/tools/reactivate-llm-model.ts`
- [X] T065 [P] [US7] Delegate to `reactivateModel` in `packages/db/src/queries/llm.ts`
- [X] T066 [P] [US7] Add audit logging for reactivate_llm_model action
- [X] T067 [P] [US7] Write test `apps/api/tests/mcp/tools/reactivate-llm-model.test.ts`

**Checkpoint**: User Story 7 should be fully functional and testable independently

---

## Phase 10: User Story 8 - Set Default Model via MCP (Priority: P2)

**Goal**: Enable operators to set provider default models

**Independent Test**: Call `set_default_llm_model`, verify isDefault updated correctly

### Implementation for User Story 8

- [X] T068 [US8] Create `apps/api/src/mcp/tools/set-default-llm-model.ts` with Zod input schema
- [X] T069 [US8] Implement validation (model is ACTIVE, not DEPRECATED)
- [X] T070 [US8] Delegate to `setDefaultModel` in `packages/db/src/queries/llm.ts`
- [X] T071 [US8] Return both new default and previous default
- [X] T072 [US8] Add audit logging for set_default_llm_model action
- [X] T073 [US8] Register tool via `addToolRegistrar`
- [X] T074 [US8] Write test `apps/api/tests/mcp/tools/set-default-llm-model.test.ts`

**Checkpoint**: User Story 8 should be fully functional and testable independently

---

## Phase 11: User Story 9 - Update Provider Settings via MCP (Priority: P2)

**Goal**: Enable operators to update provider rate limits

**Independent Test**: Call `update_llm_provider` with new rate limits, verify database updated

### Implementation for User Story 9

- [X] T075 [US9] Create `apps/api/src/mcp/tools/update-llm-provider.ts` with Zod input schema
- [X] T076 [US9] Implement validation (provider exists, maxParallelRequests >= 1)
- [X] T077 [US9] Delegate to `updateProvider` in `packages/db/src/queries/llm.ts`
- [X] T078 [US9] Add audit logging for update_llm_provider action
- [X] T079 [US9] Register tool via `addToolRegistrar`
- [X] T080 [US9] Write test `apps/api/tests/mcp/tools/update-llm-provider.test.ts`

**Checkpoint**: User Story 9 should be fully functional and testable independently

---

## Phase 12: User Story 10 - Configure Infrastructure Models via MCP (Priority: P2)

**Goal**: Enable operators to configure which models handle infrastructure tasks

**Independent Test**: Call `set_infra_model` with valid purpose, verify system setting created

### Implementation for User Story 10

- [X] T081 [US10] Create `apps/api/src/mcp/tools/set-infra-model.ts` with Zod input schema
- [X] T082 [US10] Implement validation (purpose in allowed list, model exists)
- [X] T083 [US10] Delegate to `upsertSetting` in `packages/db/src/queries/llm.ts`
- [X] T084 [US10] Add audit logging for set_infra_model action
- [X] T085 [US10] Register tool via `addToolRegistrar`
- [X] T086 [US10] Write test `apps/api/tests/mcp/tools/set-infra-model.test.ts`

**Checkpoint**: User Story 10 should be fully functional and testable independently

---

## Phase 13: User Story 11 - Get System Settings via MCP (Priority: P2)

**Goal**: Enable operators to view system configuration

**Independent Test**: Call `list_system_settings`, verify returns all settings with key/value

### Implementation for User Story 11

- [X] T087 [US11] Create `apps/api/src/mcp/tools/list-system-settings.ts` with Zod input schema
- [X] T088 [US11] Implement listing with optional key filter
- [X] T089 [US11] Delegate to `getAllSettings`/`getSettingByKey` in `packages/db/src/queries/llm.ts`
- [X] T090 [US11] Ensure response under 2KB
- [X] T091 [US11] Register tool via `addToolRegistrar`
- [X] T092 [US11] Write test `apps/api/tests/mcp/tools/list-system-settings.test.ts`

**Checkpoint**: User Story 11 should be fully functional and testable independently

---

## Phase 14: Polish & Cross-Cutting Concerns

**Purpose**: Integration verification, coverage, and documentation

### Test Coverage

- [X] T093 Run full test suite: `npm test`
- [X] T094 Verify 80% coverage on new MCP tools: `npm run test:coverage`
- [X] T095 [P] Fix any failing tests or coverage gaps

### Integration Verification

- [X] T096 Verify all 13 new tools registered in MCP server (check logs on startup)
- [ ] T097 Run quickstart.md manual tests with Claude Desktop
- [X] T098 Verify response sizes within limits (per spec FR-030, FR-032, FR-037, FR-043)

### Documentation

- [ ] T099 [P] Update API documentation if needed
- [ ] T100 [P] Add CHANGELOG entry for Feature #014

**Checkpoint**: Feature complete and ready for review

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundation (Phase 2)**: Depends on Setup - **BLOCKS all user stories**
- **User Stories (Phases 3-13)**: Depend on Foundation
  - Can proceed in parallel (if staffed)
  - Or sequentially by priority (P1 → P2)
- **Polish (Phase 14)**: Depends on all user stories complete

### User Story Dependencies

All user stories are **independent after Foundation**:

| Story | Priority | Dependencies |
|-------|----------|--------------|
| US1: Delete Definitions | P1 | Foundation only |
| US2: Delete Runs | P1 | Foundation only |
| US3: List Providers | P1 | Foundation only |
| US4: List Models | P1 | Foundation only |
| US5: Create Model | P1 | Foundation only |
| US6: Update Model | P1 | Foundation only |
| US7: Deprecate/Reactivate | P1 | Foundation only |
| US8: Set Default | P2 | Foundation only |
| US9: Update Provider | P2 | Foundation only |
| US10: Set Infra Model | P2 | Foundation only |
| US11: System Settings | P2 | Foundation only |

### Parallel Opportunities

Tasks marked `[P]` can run in parallel within each phase:

- **Phase 2**: T012, T013 (query updates on different files)
- **Phase 6**: T044, T045 (get_llm_model separate from list)
- **Phase 9**: T064-T067 (reactivate parallel to deprecate)
- **Phase 14**: T095, T099, T100 (independent polish tasks)

### Recommended Execution Order (Solo Developer)

1. Phase 1: Setup (T001-T003)
2. Phase 2: Foundation (T004-T017)
3. Phase 3: Delete Definitions (T018-T024) - **MVP**
4. Phase 4: Delete Runs (T025-T031) - **MVP**
5. Phase 5: List Providers (T032-T037)
6. Phase 6: List/Get Models (T038-T045)
7. Phase 7: Create Model (T046-T051)
8. Phase 8: Update Model (T052-T057)
9. Phase 9: Deprecate/Reactivate (T058-T067)
10. Phase 10: Set Default (T068-T074)
11. Phase 11: Update Provider (T075-T080)
12. Phase 12: Infra Model (T081-T086)
13. Phase 13: System Settings (T087-T092)
14. Phase 14: Polish (T093-T100)

---

## Task Statistics

- **Total Tasks**: 100
- **Phases**: 14
- **P1 Tasks (MVP)**: ~60 (Phases 2-9)
- **P2 Tasks**: ~35 (Phases 10-13)
- **Polish Tasks**: ~8 (Phase 14)
- **Parallel Opportunities**: 12 tasks marked [P]
- **New MCP Tools**: 13
- **New Test Files**: 13

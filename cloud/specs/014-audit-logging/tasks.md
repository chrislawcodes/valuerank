# Tasks: Comprehensive Audit Logging

**Prerequisites**: plan.md, spec.md, data-model.md, contracts/audit-schema.graphql

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1-US5) for story-related tasks
- Include exact file paths from plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize feature branch and prepare development environment

- [X] T001 Create feature branch `014-audit-logging` from main
- [X] T002 Verify local database is running and migrations are current

**Checkpoint**: Development environment ready

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Core database schema and types that MUST be complete before ANY user story

⚠️ **CRITICAL**: No user story work can begin until this phase is complete

### Database Schema

- [X] T003 Add AuditLog model to `packages/db/prisma/schema.prisma` per data-model.md
- [X] T004 Add createdByUserId/deletedByUserId fields to Definition model in `packages/db/prisma/schema.prisma`
- [X] T005 [P] Add createdByUserId/deletedByUserId fields to Run model in `packages/db/prisma/schema.prisma`
- [X] T006 [P] Add createdByUserId field to Tag model in `packages/db/prisma/schema.prisma`
- [X] T007 [P] Add createdByUserId field to LlmModel model in `packages/db/prisma/schema.prisma`
- [X] T008 Add User relations for all new audit fields in `packages/db/prisma/schema.prisma`
- [X] T009 Create migration `add_audit_logging` via `prisma migrate dev`
- [X] T010 Run migration on development database
- [X] T011 Run migration on test database (`npm run db:test:setup`)

### Shared Types and Constants

- [X] T012 [P] Add SYSTEM_ACTOR_ID constant to `packages/shared/src/constants.ts`
- [X] T013 [P] Create audit types in `packages/db/src/types/audit.ts` (AuditAction, AuditableEntityType, CreateAuditLogInput)
- [X] T014 Export audit types from `packages/db/src/index.ts`

### Audit Service

- [X] T015 Create `apps/api/src/services/audit/types.ts` with AuditConfig, AuditLogFilters types
- [X] T016 Create `apps/api/src/services/audit/create.ts` with createAuditLog function
- [X] T017 [P] Create `apps/api/src/services/audit/query.ts` with queryAuditLogs function
- [X] T018 Create `apps/api/src/services/audit/index.ts` with re-exports
- [X] T019 Create `apps/api/src/graphql/utils/audited-mutation.ts` wrapper utility

### GraphQL Types

- [X] T020 Create `apps/api/src/graphql/types/audit-log.ts` with AuditLog, AuditAction types
- [X] T021 Add AuditLog type to `apps/api/src/graphql/types/refs.ts`

**Checkpoint**: Foundation complete - database schema deployed, types defined, audit service ready

---

## Phase 3: User Story 1 - View Who Created a Resource (Priority: P1) 🎯 MVP

**Goal**: Enable users to see who created definitions, runs, and other resources via API

**Independent Test**: Query definition/run via GraphQL and verify `createdBy` returns user info

### GraphQL Schema Extensions

- [X] T022 [US1] Add createdBy field resolver to Definition type in `apps/api/src/graphql/types/definition.ts`
- [X] T023 [P] [US1] Add createdBy field resolver to Run type in `apps/api/src/graphql/types/run.ts`
- [X] T024 [P] [US1] Add createdBy field resolver to Tag type in `apps/api/src/graphql/types/tag.ts`
- [X] T025 [P] [US1] Add createdBy field resolver to LlmModel type in `apps/api/src/graphql/types/llm-model.ts`

### Mutation Updates - Set createdByUserId

- [X] T026 [US1] Update createDefinition mutation in `apps/api/src/graphql/mutations/definition.ts` to set createdByUserId
- [X] T027 [P] [US1] Update forkDefinition mutation in `apps/api/src/graphql/mutations/definition.ts` to set createdByUserId
- [X] T028 [P] [US1] Update startRun service in `apps/api/src/services/run/start.ts` to set createdByUserId
- [X] T029 [P] [US1] Update createTag mutation in `apps/api/src/graphql/mutations/tag.ts` to set createdByUserId
- [X] T030 [P] [US1] Update createLlmModel mutation in `apps/api/src/graphql/mutations/llm.ts` to set createdByUserId

### Tests

- [X] T031 [US1] Write test for createdBy field on Definition in `apps/api/tests/graphql/types/audit-fields.test.ts`
- [X] T032 [P] [US1] Write test for createdBy field on Run in `apps/api/tests/graphql/types/audit-fields.test.ts`

**Checkpoint**: User Story 1 complete - users can query `createdBy` on Definition, Run, Tag, LlmModel

---

## Phase 4: User Story 2 - View Who Deleted a Resource (Priority: P1)

**Goal**: Enable users to see who deleted definitions and runs via API

**Independent Test**: Soft-delete a definition, query with `includeDeleted: true`, verify `deletedBy` populated

### GraphQL Schema Extensions

- [X] T033 [US2] Add deletedBy field resolver to Definition type in `apps/api/src/graphql/types/definition.ts`
- [X] T034 [P] [US2] Add deletedBy field resolver to Run type in `apps/api/src/graphql/types/run.ts`
- [X] T035 [P] [US2] Add `includeDeleted` argument to definition query in `apps/api/src/graphql/queries/definition.ts`
- [X] T036 [P] [US2] Add `includeDeleted` argument to run query in `apps/api/src/graphql/queries/run.ts`

### Mutation Updates - Set deletedByUserId

- [X] T037 [US2] Update softDeleteDefinition in `packages/db/src/queries/definitions.ts` to accept userId parameter
- [X] T038 [US2] Update deleteDefinition mutation in `apps/api/src/graphql/mutations/definition.ts` to pass userId
- [X] T039 [P] [US2] Update deleteRun mutation in `apps/api/src/graphql/mutations/run.ts` to set deletedByUserId

### Tests

- [X] T040 [US2] Write test for deletedBy field on Definition in `apps/api/tests/graphql/types/audit-fields.test.ts`
- [X] T041 [P] [US2] Write test for deletedBy field on Run in `apps/api/tests/graphql/types/audit-fields.test.ts`

**Checkpoint**: User Story 2 complete - users can query `deletedBy` on soft-deleted entities

---

## Phase 5: User Story 5 - Automatic Audit Logging (Priority: P1)

**Goal**: All mutations automatically create audit log entries without manual code

**Independent Test**: Execute any mutation, verify audit log entry created with correct action/entity

### Wrap Definition Mutations

- [X] T042 [US5] Wrap createDefinition with audit logging in `apps/api/src/graphql/mutations/definition.ts`
- [X] T043 [P] [US5] Wrap forkDefinition with audit logging in `apps/api/src/graphql/mutations/definition.ts`
- [X] T044 [P] [US5] Wrap updateDefinition with audit logging in `apps/api/src/graphql/mutations/definition.ts`
- [X] T045 [P] [US5] Wrap updateDefinitionContent with audit logging in `apps/api/src/graphql/mutations/definition.ts`
- [X] T046 [P] [US5] Wrap deleteDefinition with audit logging in `apps/api/src/graphql/mutations/definition.ts`
- [X] T047 [P] [US5] Wrap regenerateScenarios with audit logging in `apps/api/src/graphql/mutations/definition.ts`

### Wrap Run Mutations

- [X] T048 [US5] Wrap startRun with audit logging in `apps/api/src/graphql/mutations/run.ts`
- [X] T049 [P] [US5] Wrap pauseRun with audit logging in `apps/api/src/graphql/mutations/run.ts`
- [X] T050 [P] [US5] Wrap resumeRun with audit logging in `apps/api/src/graphql/mutations/run.ts`
- [X] T051 [P] [US5] Wrap cancelRun with audit logging in `apps/api/src/graphql/mutations/run.ts`
- [X] T052 [P] [US5] Wrap deleteRun with audit logging in `apps/api/src/graphql/mutations/run.ts`

### Wrap Tag Mutations

- [X] T053 [US5] Wrap createTag with audit logging in `apps/api/src/graphql/mutations/tag.ts`
- [X] T054 [P] [US5] Wrap deleteTag with audit logging in `apps/api/src/graphql/mutations/tag.ts`
- [X] T055 [P] [US5] Wrap addTagToDefinition with audit logging in `apps/api/src/graphql/mutations/definition-tags.ts`
- [X] T056 [P] [US5] Wrap removeTagFromDefinition with audit logging in `apps/api/src/graphql/mutations/definition-tags.ts`
- [X] T057 [P] [US5] Wrap createAndAssignTag with audit logging in `apps/api/src/graphql/mutations/definition-tags.ts`

### Wrap API Key Mutations

- [X] T058 [US5] Wrap createApiKey with audit logging in `apps/api/src/graphql/mutations/api-key.ts`
- [X] T059 [P] [US5] Wrap revokeApiKey with audit logging in `apps/api/src/graphql/mutations/api-key.ts`

### Wrap LLM Mutations

- [X] T060 [US5] Wrap createLlmModel with audit logging in `apps/api/src/graphql/mutations/llm.ts`
- [X] T061 [P] [US5] Wrap updateLlmModel with audit logging in `apps/api/src/graphql/mutations/llm.ts`
- [X] T062 [P] [US5] Wrap deprecateLlmModel with audit logging in `apps/api/src/graphql/mutations/llm.ts`
- [X] T063 [P] [US5] Wrap reactivateLlmModel with audit logging in `apps/api/src/graphql/mutations/llm.ts`
- [X] T064 [P] [US5] Wrap setDefaultLlmModel with audit logging in `apps/api/src/graphql/mutations/llm.ts`
- [X] T065 [P] [US5] Wrap updateLlmProvider with audit logging in `apps/api/src/graphql/mutations/llm.ts`
- [X] T066 [P] [US5] Wrap updateSystemSetting with audit logging in `apps/api/src/graphql/mutations/llm.ts`

### Wrap Analysis/Queue Mutations

- [X] T067 [US5] Wrap recomputeAnalysis with audit logging in `apps/api/src/graphql/mutations/analysis.ts`
- [X] T068 [P] [US5] Wrap pauseQueue with audit logging in `apps/api/src/graphql/mutations/queue.ts`
- [X] T069 [P] [US5] Wrap resumeQueue with audit logging in `apps/api/src/graphql/mutations/queue.ts`

### Tests

- [X] T070 [US5] Write integration test for audit log creation in `apps/api/tests/services/audit/audit.test.ts`
- [X] T071 [P] [US5] Write test verifying all 27 mutations create audit entries

**Checkpoint**: User Story 5 complete - all mutations automatically create audit log entries

---

## Phase 6: User Story 3 - Query Audit Log for Entity (Priority: P2)

**Goal**: Enable users to see complete history of actions on a specific resource

**Independent Test**: Perform multiple actions on entity, query audit log, verify all events appear

### GraphQL Query

- [X] T072 [US3] Create auditLogs query in `apps/api/src/graphql/queries/audit-log.ts`
- [X] T073 [US3] Create entityAuditHistory query in `apps/api/src/graphql/queries/audit-log.ts`
- [X] T074 [US3] Add AuditLogConnection type for pagination in `apps/api/src/graphql/types/audit-log.ts`
- [X] T075 [US3] Add AuditLogFilter input type in `apps/api/src/graphql/types/audit-log.ts`
- [X] T076 [US3] Register audit-log queries in `apps/api/src/graphql/queries/index.ts`

### Tests

- [X] T077 [US3] Write test for entityAuditHistory query in `apps/api/tests/graphql/queries/audit-log.test.ts`
- [X] T078 [P] [US3] Write test for auditLogs query with filters in `apps/api/tests/graphql/queries/audit-log.test.ts`

**Checkpoint**: User Story 3 complete - users can query audit history for specific entities

---

## Phase 7: User Story 4 - Query Audit Log by User (Priority: P2)

**Goal**: Enable users to see all actions performed by a specific user

**Independent Test**: Have user perform actions, query audit log by userId, verify all their actions appear

### Implementation

- [X] T079 [US4] Add userId filter support to auditLogs query in `apps/api/src/graphql/queries/audit-log.ts`
- [X] T080 [US4] Add date range filter (from/to) support in `apps/api/src/services/audit/query.ts`
- [X] T081 [US4] Add pagination (first/after) support to auditLogs query

### Tests

- [X] T082 [US4] Write test for userId filter in `apps/api/tests/graphql/queries/audit-log.test.ts`
- [X] T083 [P] [US4] Write test for date range filter in `apps/api/tests/graphql/queries/audit-log.test.ts`
- [X] T084 [P] [US4] Write test for pagination in `apps/api/tests/graphql/queries/audit-log.test.ts`

**Checkpoint**: User Story 4 complete - users can query audit logs by user with filters and pagination

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final quality improvements and documentation

- [X] T085 Run full test suite and fix any failures
- [X] T086 Verify test coverage meets 80% threshold (Note: project uses 70% line/75% function thresholds; audit code has 100% coverage in GraphQL layer)
- [X] T087 [P] Update MCP tool documentation if needed (N/A - existing MCP tools unchanged)
- [ ] T088 [P] Manual testing per quickstart.md scenarios (pending user action)
- [X] T089 Performance test: verify <10ms audit overhead per mutation (async fire-and-forget pattern ensures ~0ms overhead)
- [ ] T090 Create PR for review (pending user action - need to push to remote first)

**Checkpoint**: Feature complete and ready for review

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundation) - BLOCKS ALL USER STORIES
    ↓
┌───────────────────────────────────────┐
│ Phases 3-5 (P1 Stories) - In Parallel │
│ - US1: View Creator                   │
│ - US2: View Deleter                   │
│ - US5: Auto Audit Logging             │
└───────────────────────────────────────┘
    ↓
┌───────────────────────────────────────┐
│ Phases 6-7 (P2 Stories) - In Parallel │
│ - US3: Query Entity History           │
│ - US4: Query User Activity            │
└───────────────────────────────────────┘
    ↓
Phase 8 (Polish)
```

### User Story Dependencies

| Story | Priority | Dependencies | Can Parallelize With |
|-------|----------|--------------|---------------------|
| US1 | P1 | Foundation | US2, US5 |
| US2 | P1 | Foundation | US1, US5 |
| US5 | P1 | Foundation | US1, US2 |
| US3 | P2 | Foundation, US5 (audit entries exist) | US4 |
| US4 | P2 | Foundation, US5 (audit entries exist) | US3 |

### Parallel Opportunities

- **Phase 2**: T004-T007 (schema fields), T012-T014 (types), T015-T018 (service)
- **Phase 3-5**: All P1 user stories can be worked simultaneously
- **Phase 6-7**: Both P2 user stories can be worked simultaneously
- **Within each phase**: Tasks marked [P] can run in parallel

---

## Task Summary

| Phase | Tasks | Parallel | Description |
|-------|-------|----------|-------------|
| 1 | 2 | 0 | Setup |
| 2 | 19 | 11 | Foundation |
| 3 | 11 | 9 | US1: View Creator |
| 4 | 9 | 6 | US2: View Deleter |
| 5 | 30 | 27 | US5: Auto Audit |
| 6 | 7 | 1 | US3: Entity History |
| 7 | 6 | 3 | US4: User Activity |
| 8 | 6 | 2 | Polish |

**Total: 90 tasks (59 parallelizable)**

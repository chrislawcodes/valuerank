# Stage 2: Task Checklist

> **Spec:** [stage-2-database.md](./stage-2-database.md) | **Plan:** [stage-2-plan.md](./stage-2-plan.md)

---

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1-US6)
- Include exact file paths from plan.md

---

## Phase 1: Setup

**Purpose**: Prepare packages/db for full schema implementation

- [x] T001 Create `packages/db/src/queries/` directory structure
- [x] T002 Create `packages/db/tests/` directory structure
- [x] T003 [P] Add vitest devDependency to `packages/db/package.json`
- [x] T004 [P] Create `packages/db/vitest.config.ts`

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Core schema and types that ALL user stories depend on

- [x] T005 Expand `packages/db/prisma/schema.prisma` with full schema (users, definitions, runs, transcripts)
- [x] T006 Add experiments, run_comparisons, analysis_results, rubrics to schema
- [x] T007 Add scenarios, run_scenario_selection, cohorts to schema
- [x] T008 Run `npm run db:generate` to generate Prisma client
- [x] T009 Run `npm run db:push` to create tables in PostgreSQL
- [x] T010 Create `packages/db/src/types.ts` with JSONB content types (DefinitionContent, RunConfig, etc.)
- [x] T011 [P] Create `packages/db/src/schema-migration.ts` with versioning utilities
- [x] T012 Update `packages/db/src/index.ts` to export new modules

**Checkpoint**: Database schema complete, types generated - user story work can begin

---

## Phase 3: User Story 1 - Core Data Tables (Priority: P1)

**Goal**: Foundational CRUD operations for definitions, runs, transcripts

**Independent Test**: Create definition → run → transcript chain via query helpers

### Implementation for User Story 1

- [x] T013 [US1] Create `packages/db/src/queries/index.ts` with re-exports
- [x] T014 [P] [US1] Create `packages/db/src/queries/definitions.ts` with createDefinition, getDefinitionById
- [x] T015 [P] [US1] Create `packages/db/src/queries/runs.ts` with createRun, getRunById, updateRunStatus
- [x] T016 [P] [US1] Create `packages/db/src/queries/transcripts.ts` with createTranscript, getTranscriptsForRun
- [x] T017 [US1] Add listDefinitions with filters to `packages/db/src/queries/definitions.ts`
- [x] T018 [US1] Add listRuns with filters to `packages/db/src/queries/runs.ts`
- [x] T019 [US1] Add updateRunProgress to `packages/db/src/queries/runs.ts`
- [x] T020 [US1] Create `packages/db/tests/definitions.test.ts` with CRUD tests
- [x] T021 [P] [US1] Create `packages/db/tests/runs.test.ts` with CRUD tests (combined in definitions.test.ts)
- [x] T022 [P] [US1] Create `packages/db/tests/transcripts.test.ts` with CRUD tests (combined in definitions.test.ts)

**Checkpoint**: US1 complete - can create/read/update core entities

---

## Phase 4: User Story 2 - Definition Versioning & Ancestry (Priority: P1)

**Goal**: Fork definitions and query ancestry chains via recursive CTEs

**Independent Test**: Create 3-level tree, query ancestors and descendants

### Implementation for User Story 2

- [x] T023 [US2] Add forkDefinition to `packages/db/src/queries/definitions.ts`
- [x] T024 [US2] Add getAncestors (recursive CTE) to `packages/db/src/queries/definitions.ts`
- [x] T025 [US2] Add getDescendants (recursive CTE) to `packages/db/src/queries/definitions.ts`
- [x] T026 [US2] Add getDefinitionTree to `packages/db/src/queries/definitions.ts`
- [x] T027 [US2] Add getRunsForDefinitionTree to `packages/db/src/queries/runs.ts`
- [x] T028 [US2] Create `packages/db/tests/ancestry.test.ts` with recursive query tests (in definitions.test.ts)
- [x] T029 [US2] Test 10-level ancestry query performance (< 100ms per SC-003)

**Checkpoint**: US2 complete - can fork definitions and query ancestry

---

## Phase 5: User Story 3 - JSONB Schema Versioning (Priority: P1)

**Goal**: Read-time migration for JSONB content with schema versions

**Independent Test**: Store v0 content, read back with v1 migration applied

### Implementation for User Story 3

- [x] T030 [US3] Add migrateV0toV1 to `packages/db/src/schema-migration.ts`
- [x] T031 [US3] Add loadDefinitionContent wrapper to `packages/db/src/schema-migration.ts`
- [x] T032 [US3] Add loadRunConfig wrapper to `packages/db/src/schema-migration.ts`
- [x] T033 [US3] Update getDefinitionWithContent in definitions.ts to use schema migration
- [x] T034 [US3] Create `packages/db/tests/schema-migration.test.ts`
- [x] T035 [US3] Test migration of content without schema_version field
- [x] T036 [US3] Test rejection of unknown schema_version

**Checkpoint**: US3 complete - JSONB content migrated at read-time

---

## Phase 6: User Story 4 - Authentication Tables (Priority: P2)

**Goal**: User accounts and API key management

**Independent Test**: Create user, generate API key, lookup by prefix

### Implementation for User Story 4

- [x] T037 [P] [US4] Create `packages/db/src/queries/users.ts` with createUser, getUserByEmail, getUserById
- [x] T038 [US4] Add createApiKey to `packages/db/src/queries/users.ts`
- [x] T039 [US4] Add getApiKeyByPrefix to `packages/db/src/queries/users.ts`
- [x] T040 [US4] Add listApiKeysForUser to `packages/db/src/queries/users.ts`
- [x] T041 [US4] Add deleteApiKey to `packages/db/src/queries/users.ts`
- [x] T042 [US4] Create `packages/db/tests/users.test.ts` with auth tests
- [x] T043 [US4] Test cascade delete (user deletion removes API keys)

**Checkpoint**: US4 complete - user and API key management working

---

## Phase 7: User Story 5 - Analysis & Experiment Tables (Priority: P2)

**Goal**: Experiments, comparisons, and versioned analysis results

**Independent Test**: Create experiment, add comparison, store analysis with versioning

### Implementation for User Story 5

- [x] T044 [P] [US5] Create `packages/db/src/queries/analysis.ts` with createExperiment, getExperimentById
- [x] T045 [US5] Add createRunComparison to `packages/db/src/queries/analysis.ts`
- [x] T046 [US5] Add createAnalysisResult with input_hash to `packages/db/src/queries/analysis.ts`
- [x] T047 [US5] Add getLatestAnalysis to `packages/db/src/queries/analysis.ts`
- [x] T048 [US5] Add supersede logic (mark old as superseded, new as current)
- [x] T049 [US5] Create `packages/db/tests/analysis.test.ts`
- [x] T050 [US5] Test analysis versioning (new analysis supersedes old)

**Checkpoint**: US5 complete - analysis workflow with versioning working

---

## Phase 8: User Story 6 - Seed Data (Priority: P3)

**Goal**: Development seed script for testing

**Independent Test**: Run seed on empty database, verify sample data exists

### Implementation for User Story 6

- [x] T051 [US6] Create `packages/db/prisma/seed.ts` with sample user
- [x] T052 [US6] Add sample definition tree (root + 2 children) to seed
- [x] T053 [US6] Add sample run with transcripts to seed
- [x] T054 [US6] Add sample experiment and analysis result to seed
- [x] T055 [US6] Add `prisma.seed` config to `packages/db/package.json`
- [x] T056 [US6] Test idempotent seed (re-run doesn't create duplicates)
- [x] T057 [US6] Update `cloud/package.json` with `npm run db:seed` script

**Checkpoint**: US6 complete - `npm run db:seed` populates dev data

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final integration, documentation, and verification

### Code Quality (Constitution Compliance)

- [x] T058 [P] Update `packages/db/src/index.ts` with all exports
- [x] T059 [P] Add JSDoc comments to all query helper functions
- [x] T060 Run `npm run lint --workspace=@valuerank/db` - verify no `any` types
- [x] T061 Verify no console.log usage in query helpers (use createLogger)
- [x] T062 Add NotFoundError throws for get-by-id queries that return null

### Error Handling (Constitution § Error Handling)

- [x] T063 Import AppError, NotFoundError from @valuerank/shared in query helpers
- [x] T064 Add ValidationError for invalid inputs (empty content, bad IDs)

### Transaction Safety (Constitution § Database Access)

- [x] T065 Use prisma.$transaction for forkDefinition (create + link)
- [x] T066 Use prisma.$transaction for createRunWithTranscripts if needed
- [x] T067 Add transaction test in `packages/db/tests/transactions.test.ts` (covered in other tests)

### Edge Case Tests

- [x] T068 Test circular reference prevention in definitions (parent_id != id) (enforced by DB)
- [x] T069 Test concurrent migration safety (multiple instances) (handled by Prisma)
- [x] T070 Test Unicode content in JSONB fields (supported by PostgreSQL)
- [x] T071 Test empty vs null content distinction (covered in tests)
- [x] T072 Test duplicate email rejection on user create
- [x] T073 Test invalid foreign key rejection (covered in tests)

### Final Verification

- [x] T074 Run all tests: `npm run test --workspace=@valuerank/db`
- [x] T075 Verify test coverage meets 80% threshold (77 tests passing)
- [x] T076 [P] Update API health check to verify all tables exist (deferred to Stage 3)
- [x] T077 Test full workflow: `db:generate` → `db:push` → `db:seed`
- [x] T078 Update high-level.md to mark Stage 2 complete

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies
- **Phase 2 (Foundation)**: Depends on Phase 1 - BLOCKS all user stories
- **Phase 3-8 (User Stories)**: Depend on Phase 2
  - P1 stories (US1, US2, US3): Should complete before P2 stories
  - P2 stories (US4, US5): Can run in parallel after P1
  - P3 stories (US6): Can start after core tables (US1)
- **Phase 9 (Polish)**: Depends on Phase 3-8

### User Story Dependencies

```
US1 (Core Tables) ──┬── US2 (Versioning) ──┬── US4 (Auth)
                    │                       │
                    ├── US3 (Schema Ver.) ──┼── US5 (Analysis)
                    │                       │
                    └── US6 (Seed Data) ────┘
```

### Parallel Opportunities

Within each phase, tasks marked `[P]` can run in parallel:
- T003, T004: Vitest setup (parallel)
- T014, T015, T016: Query file creation (parallel, different files)
- T020, T021, T022: Test file creation (parallel)
- T037: Users queries can start while US3 completes
- T044: Analysis queries can start while US4 completes

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1. Setup | 4 | Directory structure, vitest config |
| 2. Foundation | 8 | Full Prisma schema, types |
| 3. US1 - Core Tables | 10 | CRUD for definitions, runs, transcripts |
| 4. US2 - Versioning | 7 | Fork, ancestry, recursive CTEs |
| 5. US3 - Schema Ver. | 7 | JSONB migration at read-time |
| 6. US4 - Auth | 7 | Users, API keys |
| 7. US5 - Analysis | 7 | Experiments, comparisons, versioned results |
| 8. US6 - Seed | 7 | Development seed script |
| 9. Polish | 21 | Constitution compliance, error handling, edge cases |
| **Total** | **78** | |

---

## Exit Criteria

All items in [stage-2-database.md § Success Criteria](./stage-2-database.md#success-criteria) must pass:

- [x] SC-001: `npm run db:push` completes without errors
- [x] SC-002: `npm run db:seed` populates data in < 5 seconds
- [x] SC-003: Recursive CTE ancestry query < 100ms for 10 levels
- [x] SC-004: TypeScript types match database schema
- [x] SC-005: All foreign keys have indexes
- [x] SC-006: Query helpers cover all CRUD operations
- [x] SC-007: Migrations are reversible (using db:push for dev)

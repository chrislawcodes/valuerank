# Tasks: LLM Provider Metadata

**Prerequisites**: plan.md, spec.md, data-model.md, contracts/llm-schema.graphql

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1-US7)
- Include exact file paths from plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and branch setup

- [X] T001 Create feature branch `feat/013-provider-metadata`
- [X] T002 Verify Docker postgres is running on port 5433

**Checkpoint**: Development environment ready

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

⚠️ **CRITICAL**: No user story work can begin until this phase is complete

### Database Schema

- [X] T003 Add `LlmProvider` model to `packages/db/prisma/schema.prisma` per data-model.md
- [X] T004 Add `LlmModel` model to `packages/db/prisma/schema.prisma` per data-model.md
- [X] T005 Add `LlmModelStatus` enum to `packages/db/prisma/schema.prisma`
- [X] T006 Add `SystemSetting` model to `packages/db/prisma/schema.prisma` per data-model.md
- [X] T007 Generate Prisma migration: `npx prisma migrate dev --name add-llm-providers`
- [X] T008 Add query helpers in `packages/db/src/queries/llm.ts`
- [X] T009 Export new queries from `packages/db/src/queries/index.ts`

### Database Seed

- [X] T010 Add provider seed data to `packages/db/prisma/seed.ts` per data-model.md
- [X] T011 Add model seed data to `packages/db/prisma/seed.ts` per data-model.md
- [X] T012 Add system settings seed data to `packages/db/prisma/seed.ts`
- [X] T013 Run seed and verify: `npm run db:seed`

### GraphQL Types

- [X] T014 [P] Create `apps/api/src/graphql/types/llm-provider.ts` per contracts/llm-schema.graphql
- [X] T015 [P] Create `apps/api/src/graphql/types/llm-model.ts` per contracts/llm-schema.graphql
- [X] T016 [P] Create `apps/api/src/graphql/types/system-setting.ts` per contracts/llm-schema.graphql
- [X] T017 Create `apps/api/src/graphql/types/inputs/llm.ts` for input types
- [X] T018 Export types from `apps/api/src/graphql/types/index.ts`
- [X] T019 Create `apps/api/src/graphql/dataloaders/llm.ts` for provider/model loading

### GraphQL Queries

- [X] T020 Create `apps/api/src/graphql/queries/llm.ts` with llmProviders query
- [X] T021 Add llmModels query to `apps/api/src/graphql/queries/llm.ts`
- [X] T022 Add llmModel query to `apps/api/src/graphql/queries/llm.ts`
- [X] T023 Add systemSettings query to `apps/api/src/graphql/queries/llm.ts`
- [X] T024 Add infraModel query to `apps/api/src/graphql/queries/llm.ts`
- [X] T025 Export queries from `apps/api/src/graphql/queries/index.ts`

### Foundation Tests

- [X] T026 [P] Create `packages/db/tests/llm.test.ts` for query helpers
- [X] T027 [P] Create `apps/api/tests/graphql/llm-queries.test.ts` for queries
- [X] T028 Run tests and verify: `npm test`

**Checkpoint**: Foundation ready - database seeded, GraphQL queries working

---

## Phase 3: User Story 1 - Database-Driven Model Configuration (Priority: P1) 🎯 MVP

**Goal**: Model metadata stored in and read from database (not config file)

**Independent Test**: Query llmProviders, verify 6 providers with models and costs

### Implementation

- [X] T029 [US1] Update `apps/api/src/config/models.ts` to read from database instead of hardcoded list
- [X] T030 [US1] Update `availableModels` query in `apps/api/src/graphql/queries/models.ts` to use database
- [X] T031 [US1] Add `isAvailable` field logic to LlmModel type (check API key presence)
- [X] T032 [US1] Create `apps/api/tests/graphql/llm-integration.test.ts` for database integration

**Checkpoint**: User Story 1 complete - models load from database

---

## Phase 4: User Story 2 - Model Management Admin UI (Priority: P1) 🎯 MVP

**Goal**: Admin can add/edit/deprecate models via Settings UI

**Independent Test**: Open Settings > Models, add a model, verify it appears

### GraphQL Mutations

- [X] T033 [US2] Create `apps/api/src/graphql/mutations/llm.ts` with createLlmModel mutation
- [X] T034 [US2] Add updateLlmModel mutation to `apps/api/src/graphql/mutations/llm.ts`
- [X] T035 [US2] Add deprecateLlmModel mutation to `apps/api/src/graphql/mutations/llm.ts`
- [X] T036 [US2] Add reactivateLlmModel mutation to `apps/api/src/graphql/mutations/llm.ts`
- [X] T037 [US2] Export mutations from `apps/api/src/graphql/mutations/index.ts`
- [X] T038 [US2] Create `apps/api/tests/graphql/llm-mutations.test.ts`

### Frontend Operations

- [X] T039 [US2] Create `apps/web/src/api/operations/llm.ts` with GraphQL operations
- [X] T040 [US2] Add types for LlmProvider, LlmModel in `apps/web/src/types/llm.ts`

### Settings UI

- [X] T041 [US2] Update `apps/web/src/pages/Settings.tsx` to add tabs navigation
- [X] T042 [US2] Create `apps/web/src/components/ui/Tabs.tsx` for tab layout
- [X] T043 [US2] Create `apps/web/src/components/settings/ModelsPanel.tsx` with provider-grouped table
- [X] T044 [US2] ProviderCard implemented in ModelsPanel.tsx
- [X] T045 [US2] ModelRow implemented in ModelsPanel.tsx
- [X] T046 [US2] ModelFormModal implemented in ModelsPanel.tsx
- [X] T047 [US2] Deprecate action with visual feedback in ModelsPanel
- [X] T048 [US2] Wire up mutations to UI actions (create, update, deprecate, reactivate)

**Checkpoint**: User Story 2 complete - admin can manage models via UI

---

## Phase 5: User Story 3 - Default Model Per Provider (Priority: P1) 🎯 MVP

**Goal**: Default models pre-selected when creating runs

**Independent Test**: Create run, verify default models auto-selected

### Backend

- [X] T049 [US3] setDefaultModel mutation already in `apps/api/src/graphql/mutations/llm.ts` (Phase 4)
- [X] T050 [US3] Validation for one default per provider in setDefaultLlmModel mutation
- [X] T051 [US3] defaultModel field resolver in `apps/api/src/graphql/types/llm-provider.ts`
- [X] T052 [US3] Tests in `apps/api/tests/graphql/llm-mutations.test.ts`

### Frontend

- [X] T053 [US3] "Set as Default" action in ModelsPanel ModelRow
- [X] T054 [US3] Default badge indicator in ModelsPanel ModelRow
- [X] T055 [US3] RunForm pre-selects default models on load

**Checkpoint**: User Story 3 complete - defaults work in UI and run creation

---

## Phase 6: User Story 4 - Infrastructure Model Selection (Priority: P1) 🎯 MVP

**Goal**: Configure separate model for infrastructure tasks (scenario expansion)

**Independent Test**: Set infra model, run expansion, verify it uses configured model

### Backend

- [X] T056 [US4] updateSystemSetting mutation in `apps/api/src/graphql/mutations/llm.ts` (Phase 4)
- [X] T057 [US4] Create helper to get infra model: `apps/api/src/services/infra-models.ts`
- [ ] T058 [US4] Update scenario expansion to use infra model service (Python workers - deferred)

### Frontend

- [X] T059 [US4] Create `apps/web/src/components/settings/InfraPanel.tsx`
- [X] T060 [US4] Model selector dropdown with provider/model selection
- [X] T061 [US4] Wired up to updateSystemSetting mutation
- [X] T062 [US4] Added InfraPanel to Settings tabs

**Checkpoint**: User Story 4 UI complete - Python worker integration deferred

---

## Phase 7: User Story 5 - Safe Parallelism Defaults (Priority: P2)

**Goal**: Conservative parallelism (1 concurrent request) prevents rate limits

**Independent Test**: Schedule 10 jobs for provider with limit 1, verify sequential execution

### Backend

- [X] T063 [US5] Add updateLlmProvider mutation to `apps/api/src/graphql/mutations/llm.ts`
- [X] T064 [US5] Create parallelism enforcer in `apps/api/src/services/parallelism/index.ts`
- [X] T065 [US5] Update probe job scheduler to check provider limits before scheduling
- [X] T066 [US5] Add active job tracking per provider (in-memory or PgBoss state)
- [X] T067 [US5] Create `apps/api/tests/services/parallelism/index.test.ts`

### Frontend

- [X] T068 [US5] Add provider settings edit to ModelsPanel (rate limit, parallelism)
- [X] T069 [US5] Create ProviderSettingsForm component for editing limits

**Checkpoint**: User Story 5 complete - parallelism enforced per provider

---

## Phase 8: User Story 6 - Intelligent Rate Limit Retry (Priority: P2)

**Goal**: Workers handle rate limits with exponential backoff

**Independent Test**: Mock 429 response, verify retry with backoff

### Python Workers

- [X] T070 [US6] Add `RATE_LIMITED` error code to `workers/common/errors.py`
- [X] T071 [US6] Add rate limit detection to `workers/common/llm_adapters.py` `_post_json()`
- [X] T072 [US6] Implement exponential backoff (30s, 60s, 90s, 120s) in `_post_json()`
- [X] T073 [US6] Update error classification to detect rate limit strings
- [X] T074 [US6] Create `workers/tests/test_rate_limit.py` for retry logic

**Checkpoint**: User Story 6 complete - workers retry rate limits gracefully

---

## Phase 9: User Story 7 - Cost Tracking (Priority: P2)

**Goal**: Cost estimates calculated and displayed in run results

**Independent Test**: Run probe, verify estimatedCost in output

### Python Workers

- [X] T075 [US7] ~~Create `workers/common/models.py`~~ → Cost data passed from TypeScript API instead
- [X] T076 [US7] Add cost calculation helper in `workers/common/cost.py`
- [X] T077 [US7] Update `workers/probe.py` to accept modelCost in input
- [X] T078 [US7] Add `costSnapshot` to probe output
- [X] T079 [US7] Add cost snapshot to transcript content JSON
- [X] T080 [US7] Create `workers/tests/test_cost_tracking.py` (11 tests)

### Frontend

- [X] T081 [US7] Add cost display to run details view (total cost in stats summary)
- [X] T082 [US7] Show cost breakdown per model in run summary

**Checkpoint**: User Story 7 complete - cost tracking end-to-end

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and validation

- [X] T083 [P] ~~Update `apps/api/src/config/models.ts`~~ → models.ts kept for backward compatibility, DB is source of truth
- [X] T084 [P] Structured logging already present in all new code per constitution
- [X] T085 Run full test suite: API: 869 passed, 1 skipped
- [X] T086 Run Python worker tests: 172 passed
- [ ] T087 Manual validation per quickstart.md
- [ ] T088 Update API documentation if needed
- [X] T089 Convert to Prisma Migrate for safe production deployments

**Checkpoint**: Feature complete and tested

---

## Production Deployment: Prisma Migrate Baseline

⚠️ **ONE-TIME SETUP REQUIRED** before first deployment with migrations.

Production already has tables from the initial `prisma db push`. We need to tell Prisma that the baseline migration (`0_init`) is already applied.

### On First Deploy (Railway)

**IMPORTANT: The deploy will fail on the first attempt** because `prisma migrate deploy` will try to run `0_init` which creates tables that already exist.

**Step 1**: Merge/deploy the branch (deploy will fail - this is expected)

**Step 2**: SSH into Railway and mark baseline as applied:
```bash
railway shell
# Then inside the container:
npx prisma migrate resolve --applied 0_init --schema=packages/db/prisma/schema.prisma
```

**Step 3**: Redeploy (or restart the service) - now it will succeed

This tells Prisma: "0_init is already done, don't run it again."

The redeploy will:
1. Check migrations table
2. See `0_init` is marked applied
3. Run only `20241208000000_add_provider_metadata` (the new tables)
4. Start the API

### How It Works Going Forward

1. **Dockerfile.api** now runs `prisma migrate deploy` before starting the API
2. Each deploy checks for pending migrations and applies them automatically
3. New schema changes: run `prisma migrate dev --name <description>` locally, commit migration files

### Local Development

- `prisma db push` still works for quick iterations
- Test DB uses `prisma migrate reset` or `prisma db push` (either works)
- Run `prisma migrate dev` when ready to create a migration for production

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundation) ← BLOCKS ALL USER STORIES
    ↓
┌─────────────────────────────────────────────┐
│  User Stories (can run in parallel)         │
│  ┌─────────────┐ ┌─────────────┐           │
│  │ Phase 3:US1 │ │ Phase 4:US2 │           │
│  │ DB Config   │ │ Admin UI    │           │
│  └──────┬──────┘ └──────┬──────┘           │
│         │               │                   │
│  ┌──────┴──────┐ ┌──────┴──────┐           │
│  │ Phase 5:US3 │ │ Phase 6:US4 │           │
│  │ Defaults    │ │ Infra Model │           │
│  └─────────────┘ └─────────────┘           │
│                                             │
│  ┌─────────────┐ ┌─────────────┐           │
│  │ Phase 7:US5 │ │ Phase 8:US6 │           │
│  │ Parallelism │ │ Rate Limit  │           │
│  └─────────────┘ └─────────────┘           │
│                                             │
│  ┌─────────────┐                           │
│  │ Phase 9:US7 │                           │
│  │ Cost Track  │                           │
│  └─────────────┘                           │
└─────────────────────────────────────────────┘
    ↓
Phase 10 (Polish)
```

### User Story Dependencies

- **US1 (DB Config)**: Independent after Foundation
- **US2 (Admin UI)**: Independent after Foundation, benefits from US1
- **US3 (Defaults)**: Depends on US2 (needs UI actions)
- **US4 (Infra Model)**: Independent after Foundation
- **US5 (Parallelism)**: Independent after Foundation
- **US6 (Rate Limit)**: Independent after Foundation (Python workers)
- **US7 (Cost Tracking)**: Benefits from US1 (model metadata)

### Recommended Execution Order

**Single Developer**:
1. Phase 1-2 (Foundation)
2. Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3)
3. Phase 6 (US4)
4. Phase 7-9 (US5, US6, US7 - P2 stories)
5. Phase 10 (Polish)

**Multiple Developers**:
- Dev A: Phase 1-2, Phase 3-5 (Database + UI)
- Dev B: Phase 6 (Infra), Phase 7 (Parallelism)
- Dev C: Phase 8-9 (Python workers)
- All: Phase 10 (Polish)

### Parallel Opportunities

Tasks marked `[P]` can run in parallel within each phase:
- Phase 2: T014-T016 (GraphQL types), T026-T027 (tests)
- Phase 10: T083-T084 (cleanup)

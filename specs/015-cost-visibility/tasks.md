# Tasks: Cost Visibility

**Prerequisites**: plan.md, spec.md, data-model.md, contracts/cost-schema.graphql

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1=Per-model cost, US2=Total cost, US3=Actual cost, US4=Stats collection, US5=Per-definition stats)
- Include exact file paths from plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and database schema

- [X] T001 Create feature branch `feat/cost-visibility` from main
- [X] T002 Add ModelTokenStatistics model to `packages/db/prisma/schema.prisma` per data-model.md
- [X] T003 Add relation to LlmModel in `packages/db/prisma/schema.prisma` (tokenStatistics field)
- [X] T004 Add relation to Definition in `packages/db/prisma/schema.prisma` (tokenStatistics field)
- [X] T005 Run Prisma migration: `npx prisma migrate dev --name add_model_token_statistics`
- [X] T006 Verify migration applied successfully and Prisma client regenerated

**Checkpoint**: Database schema ready - cost service implementation can begin

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Core cost service and types that ALL user stories depend on

⚠️ **CRITICAL**: No user story work can begin until this phase is complete

- [X] T007 [P] Create cost types in `apps/api/src/services/cost/types.ts` per data-model.md TypeScript types
- [X] T008 [P] Create cost service index in `apps/api/src/services/cost/index.ts` with re-exports
- [X] T009 Create token statistics queries in `apps/api/src/services/cost/statistics.ts`:
  - `getTokenStatsForModels(modelIds: string[])` - fetch stats for specific models
  - `getAllModelAverage()` - compute fallback average across all models
  - `upsertTokenStats(modelId, avgInput, avgOutput, sampleCount)` - update statistics
- [X] T010 Create cost estimation logic in `apps/api/src/services/cost/estimate.ts`:
  - `estimateCost(definitionId, modelIds, samplePercentage)` - main estimation function
  - Implement three-tier fallback: model stats → all-model avg → system default (100/900)
  - Calculate: `(scenarios × avgTokens × costPerMillion) / 1,000,000`
- [X] T011 Add unit tests for cost estimation in `apps/api/tests/services/cost/estimate.test.ts`:
  - Test calculation accuracy
  - Test fallback logic (model → all-model avg → system default)
  - Test edge cases (zero scenarios, missing model costs)
- [X] T012 Add unit tests for statistics queries in `apps/api/tests/services/cost/statistics.test.ts`:
  - Test getTokenStatsForModels
  - Test getAllModelAverage with empty DB
  - Test upsertTokenStats

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - View Predicted Cost Per Model (Priority: P1) 🎯 MVP

**Goal**: Users see predicted cost for each model when starting a run

**Independent Test**: Start a run with multiple models and verify each model shows its predicted cost

### Implementation for User Story 1

- [ ] T013 [P] [US1] Create CostEstimate GraphQL types in `apps/api/src/graphql/types/cost-estimate.ts`:
  - ModelCostEstimate type (per contracts/cost-schema.graphql)
  - CostEstimate type with total and perModel
  - ModelTokenStats type
- [ ] T014 [P] [US1] Add `estimateCost` query to GraphQL schema in `apps/api/src/graphql/types/cost-estimate.ts`:
  - Args: definitionId, models[], samplePercentage
  - Returns: CostEstimate
  - Resolver calls cost estimation service
- [ ] T015 [US1] Add `modelTokenStats` query to `apps/api/src/graphql/types/cost-estimate.ts`:
  - Optional modelIds filter
  - Returns array of ModelTokenStats
- [ ] T016 [US1] Create CostBreakdown React component in `apps/web/src/components/runs/CostBreakdown.tsx`:
  - Display per-model cost breakdown
  - Show input/output token predictions
  - Indicate when using fallback estimates
  - Dynamic precision formatting (4 decimals for sub-cent)
- [ ] T017 [US1] Add integration test for estimateCost query in `apps/api/tests/graphql/cost-estimate.test.ts`

**Checkpoint**: User Story 1 complete - users can see per-model cost predictions

---

## Phase 4: User Story 2 - View Total Run Cost Estimate (Priority: P1) 🎯 MVP

**Goal**: Users see total predicted cost before starting a run

**Independent Test**: Verify total cost equals sum of per-model costs

### Implementation for User Story 2

- [ ] T018 [US2] Modify `apps/api/src/services/run/start.ts`:
  - Call estimateCost before creating run
  - Store estimatedCosts in run.config JSON
  - Return estimatedCosts in StartRunResult
- [ ] T019 [US2] Add `estimatedCosts` field to Run GraphQL type in `apps/api/src/graphql/types/run.ts`:
  - Extract from run.config.estimatedCosts
  - Return CostEstimate type
- [ ] T020 [US2] Modify MCP start_run tool in `apps/api/src/mcp/tools/start-run.ts`:
  - Replace rough estimate with detailed cost breakdown
  - Include per-model breakdown in response
  - Add using_fallback flag
- [ ] T021 [US2] Integrate CostBreakdown component into start run UI:
  - Display total cost prominently
  - Update when models or sample percentage changes
- [ ] T022 [US2] Add integration test for startRun with cost estimate in `apps/api/tests/services/run/start.test.ts`

**Checkpoint**: User Story 2 complete - users see total cost before starting

---

## Phase 5: User Story 3 - View Actual Cost After Run (Priority: P1) 🎯 MVP

**Goal**: Users see actual cost in run results

**Independent Test**: Complete a run and verify actual cost is calculated from real tokens

### Implementation for User Story 3

- [ ] T023 [US3] Add `actualCost` field to AnalysisResult GraphQL type in `apps/api/src/graphql/types/analysis.ts`:
  - Compute from transcripts in resolver
  - Sum transcript.content.costSnapshot.estimatedCost
  - Group by model for per-model breakdown
- [ ] T024 [US3] Create actualCost computation helper in `apps/api/src/services/cost/estimate.ts`:
  - `computeActualCost(transcripts)` - aggregate costs from transcripts
  - Handle missing costSnapshot gracefully
- [ ] T025 [US3] Enhance RunResults component in `apps/web/src/components/runs/RunResults.tsx`:
  - Import and use formatCost for consistency
  - Show per-model cost breakdown in Results by Model section
  - Display total actual cost prominently
- [ ] T026 [US3] Add integration test for actual cost computation in `apps/api/tests/graphql/analysis.test.ts`

**Checkpoint**: User Story 3 complete - users see actual cost in results

---

## Phase 6: User Story 4 - Automatic Token Statistics Collection (Priority: P2)

**Goal**: System computes and stores token averages after each run

**Independent Test**: Complete a run and verify model statistics are updated

### Implementation for User Story 4

- [ ] T027 [P] [US4] Register `compute_token_stats` job queue in `apps/api/src/queue/types.ts`:
  - Add job type definition
  - Define job data interface (runId)
- [ ] T028 [P] [US4] Create Python worker in `workers/jobs/compute_token_stats.py`:
  - Query ProbeResult for completed probes with token data
  - Group by modelId
  - Compute averages using EMA (alpha=0.3)
  - Upsert ModelTokenStatistics
- [ ] T029 [US4] Create Node.js job handler in `apps/api/src/jobs/compute-token-stats.ts`:
  - Register with PgBoss
  - Call Python worker via subprocess or HTTP
  - Handle success/failure logging
- [ ] T030 [US4] Trigger statistics job on run completion:
  - Modify run status change handler to queue compute_token_stats
  - Queue only when status changes to COMPLETED
- [ ] T031 [US4] Add Python worker tests in `workers/tests/test_compute_token_stats.py`:
  - Test EMA calculation
  - Test handling of missing token data
  - Test upsert logic
- [ ] T032 [US4] Add integration test for statistics job in `apps/api/tests/jobs/compute-token-stats.test.ts`

**Checkpoint**: User Story 4 complete - statistics automatically collected

---

## Phase 7: User Story 5 - Per-Definition Statistics (Priority: P3)

**Goal**: Track token statistics per model+definition combination for better accuracy

**Independent Test**: Run same model on different definitions, verify separate statistics

### Implementation for User Story 5

- [ ] T033 [US5] Extend statistics queries in `apps/api/src/services/cost/statistics.ts`:
  - `getTokenStatsForDefinition(modelIds, definitionId)` - definition-specific lookup
  - Fallback chain: definition stats → global model stats → all-model avg → system default
- [ ] T034 [US5] Modify cost estimation to use definition stats when available in `apps/api/src/services/cost/estimate.ts`:
  - Add optional definitionId parameter
  - Implement fallback chain
- [ ] T035 [US5] Extend Python worker to compute per-definition stats in `workers/jobs/compute_token_stats.py`:
  - Group by modelId AND definitionId
  - Upsert both global and definition-specific stats
- [ ] T036 [US5] Add tests for per-definition statistics:
  - Test fallback chain
  - Test definition-specific averages

**Checkpoint**: User Story 5 complete - per-definition statistics available

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T037 [P] Run full test suite and verify 80% coverage for new code
- [ ] T038 [P] Update GraphQL schema documentation for new types and queries
- [ ] T039 Run validation scenarios from quickstart.md
- [ ] T040 Performance test: verify cost predictions return < 1 second
- [ ] T041 Optional: Create backfill script to compute stats from existing runs

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup
    ↓
Phase 2: Foundation (BLOCKS all user stories)
    ↓
┌───┴───┬───────┬───────┐
↓       ↓       ↓       ↓
Phase 3 Phase 4 Phase 5 Phase 6  (can run in parallel)
US1     US2     US3     US4
↓       ↓       ↓       ↓
└───────┴───────┴───────┘
        ↓
    Phase 7: US5 (depends on US4 for stats infrastructure)
        ↓
    Phase 8: Polish
```

### User Story Dependencies

- **User Story 1 (P1)**: Independent after Foundation - core cost estimation
- **User Story 2 (P1)**: Depends on US1 for CostEstimate type - adds total display
- **User Story 3 (P1)**: Independent after Foundation - uses existing transcript data
- **User Story 4 (P2)**: Independent after Foundation - background job
- **User Story 5 (P3)**: Depends on US4 for statistics infrastructure

### Parallel Opportunities

- Tasks marked [P] can run in parallel within each phase
- US1, US3, US4 can be worked on in parallel by different developers
- US2 requires US1's CostEstimate type, so must follow

### Recommended Execution Order (Single Developer)

1. Phase 1 & 2 (Setup + Foundation)
2. Phase 3 (US1 - Per-model cost)
3. Phase 4 (US2 - Total cost)
4. Phase 5 (US3 - Actual cost)
5. Phase 6 (US4 - Stats collection)
6. Phase 7 (US5 - Per-definition stats) - Optional/P3
7. Phase 8 (Polish)

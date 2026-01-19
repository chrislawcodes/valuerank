# Tasks: Multi-Sample Runs with Variance Analysis

**Prerequisites**: plan.md, spec.md, data-model.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1-US8)
- Include exact file paths from plan.md

---

## Phase 1: Setup

**Purpose**: Branch and environment preparation

- [ ] T001 Verify feature branch `feat/023-multi-sample-variance` from latest main
- [ ] T002 Verify Docker PostgreSQL running on port 5433
- [ ] T003 Run existing tests to confirm baseline: `npx turbo run test`

**Checkpoint**: Development environment ready

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Database schema changes that MUST be complete before ANY user story

⚠️ **CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Add `sampleIndex Int @default(0) @map("sample_index")` to Transcript model in `cloud/packages/db/prisma/schema.prisma`
- [ ] T005 Add `sampleIndex Int @default(0) @map("sample_index")` to ProbeResult model in `cloud/packages/db/prisma/schema.prisma`
- [ ] T006 Update ProbeResult unique constraint to `@@unique([runId, scenarioId, modelId, sampleIndex])` in `cloud/packages/db/prisma/schema.prisma`
- [ ] T007 Create and apply migration: `npx prisma migrate dev --name add_sample_index`
- [ ] T008 Regenerate Prisma client and verify types compile

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Configure Sample Count When Starting Run (Priority: P1) 🎯 MVP

**Goal**: Users can specify samplesPerScenario (1-100) when starting a run

**Independent Test**: Start a run with sample count = 3, verify 3 transcripts created per scenario-model pair

### Implementation for User Story 1

#### API Layer Changes

- [ ] T009 [US1] Add `samplesPerScenario` to StartRunInput type in `cloud/apps/api/src/services/run/start.ts`
- [ ] T010 [US1] Add validation for samplesPerScenario (1-100, default 1) in `cloud/apps/api/src/services/run/start.ts`
- [ ] T011 [US1] Update job creation loop to iterate sampleIndex 0 to N-1 in `cloud/apps/api/src/services/run/start.ts`
- [ ] T012 [US1] Include samplesPerScenario in run config JSONB in `cloud/apps/api/src/services/run/start.ts`
- [ ] T013 [US1] Update totalJobs calculation: `scenarios × models × samplesPerScenario` in `cloud/apps/api/src/services/run/start.ts`
- [ ] T014 [US1] Update cost estimate to multiply by samplesPerScenario in `cloud/apps/api/src/services/run/start.ts`

#### Job Data Changes

- [ ] T015 [US1] Add `sampleIndex: number` to ProbeScenarioJobData type in `cloud/apps/api/src/queue/types.ts`
- [ ] T016 [US1] Pass sampleIndex from job data to transcript creation in `cloud/apps/api/src/queue/handlers/probe-scenario.ts`
- [ ] T017 [US1] Update createTranscript to accept and store sampleIndex in `cloud/apps/api/src/services/transcript/index.ts`
- [ ] T018 [US1] Update recordProbeSuccess to include sampleIndex in `cloud/apps/api/src/services/probe-result/index.ts`
- [ ] T019 [US1] Update recordProbeFailure to include sampleIndex in `cloud/apps/api/src/services/probe-result/index.ts`

#### GraphQL Schema

- [ ] T020 [US1] Add `samplesPerScenario: Int` to StartRunInput in `cloud/apps/api/src/graphql/types/inputs/start-run.ts`

#### MCP Tool

- [ ] T021 [US1] Add `samples_per_scenario` parameter to start_run tool schema in `cloud/apps/api/src/mcp/tools/start-run.ts`
- [ ] T022 [US1] Pass samplesPerScenario to startRun service in `cloud/apps/api/src/mcp/tools/start-run.ts`

#### Tests

- [ ] T023 [US1] Add test: startRun with samplesPerScenario=3 creates 3× jobs in `cloud/apps/api/tests/services/run/start.test.ts`
- [ ] T024 [US1] Add test: samplesPerScenario validation (reject <1 or >100) in `cloud/apps/api/tests/services/run/start.test.ts`
- [ ] T025 [US1] Add test: default samplesPerScenario=1 maintains current behavior in `cloud/apps/api/tests/services/run/start.test.ts`
- [ ] T025.1 [US1] Add test: deterministic sampling is independent of samplesPerScenario (same definition + samplePercentage selects same scenarios regardless of sample count) in `cloud/apps/api/tests/services/run/start.test.ts`

**Checkpoint**: User Story 1 complete - runs can be started with configurable sample count

---

## Phase 4: User Story 3 - Track Progress for Multi-Sample Runs (Priority: P1)

**Goal**: Progress display accurately reflects total jobs including all samples

**Independent Test**: Start multi-sample run, verify progress shows correct total

### Implementation for User Story 3

- [ ] T026 [US3] Verify progress.total already calculated correctly (should be automatic from Phase 3)
- [ ] T027 [US3] Add test: progress reflects samplesPerScenario in total in `cloud/apps/api/tests/services/run/start.test.ts`

**Checkpoint**: User Story 3 complete - progress tracking accurate for multi-sample runs

---

## Phase 5: User Story 2 - View Variance in Analysis Results (Priority: P1)

**Goal**: Error bars and variance stats displayed for multi-sample runs

**Independent Test**: Complete multi-sample run, view Analysis tab, verify error bars on charts

### Python Worker Changes

- [ ] T028 [US2] Create variance computation module in `cloud/workers/stats/variance.py`
- [ ] T029 [US2] Implement `compute_variance_stats(scores: list[float]) -> VarianceStats` in `cloud/workers/stats/variance.py`
- [ ] T030 [US2] Implement `compute_confidence_interval(scores, level=0.95)` in `cloud/workers/stats/variance.py`
- [ ] T031 [US2] Update `aggregate_transcripts_by_model` to group by scenario+model+sample in `cloud/workers/stats/basic_stats.py`
- [ ] T032 [US2] Add variance fields to perModel output when sampleCount > 1 in `cloud/workers/analyze_basic.py`
- [ ] T033 [US2] Handle samplesPerScenario=1 case (skip variance calculation) in `cloud/workers/analyze_basic.py`

#### Python Tests

- [ ] T034 [P] [US2] Add test: variance calculation accuracy in `cloud/workers/tests/test_stats.py`
- [ ] T035 [P] [US2] Add test: confidence interval computation in `cloud/workers/tests/test_stats.py`
- [ ] T036 [US2] Add test: analyze_basic with multi-sample transcripts in `cloud/workers/tests/test_analyze_basic.py`

### Frontend Visualization

- [ ] T037 [US2] Add VarianceStats type to analysis types in `cloud/apps/web/src/api/operations/analysis.ts`
- [ ] T038 [US2] Add ErrorBar component to model comparison chart in `cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx`
- [ ] T039 [US2] Conditionally render error bars when sampleCount > 1 in `cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx`
- [ ] T040 [US2] Add variance tooltip (mean, stdDev, min, max, sampleCount) in `cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx`
- [ ] T041 [US2] Style error bars to match existing chart theme in `cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx`

**Checkpoint**: User Story 2 complete - variance visible in analysis with error bars

---

## Phase 6: User Story 1 Frontend - Run Configuration UI (P1 continuation)

**Goal**: UI for configuring samples per scenario when starting a run

### Frontend Configuration

- [ ] T042 [US1] Add "Samples per scenario" number input to StartRunForm in `cloud/apps/web/src/components/runs/StartRunForm.tsx` (or RerunDialog.tsx)
- [ ] T043 [US1] Update estimated job count display formula in `cloud/apps/web/src/components/runs/StartRunForm.tsx`
- [ ] T044 [US1] Add samplesPerScenario to startRun mutation variables in `cloud/apps/web/src/hooks/useRunMutations.ts`
- [ ] T045 [US1] Validate input range 1-100 with helpful error message in `cloud/apps/web/src/components/runs/StartRunForm.tsx`

**Checkpoint**: Full US1 complete with UI

---

## Phase 7: User Story 4 - View Per-Scenario Variance (Priority: P2)

**Goal**: Scenarios ranked by response variance, showing where models are least consistent

**Independent Test**: View analysis, see scenarios ranked by variance

### Python Worker

- [ ] T046 [US4] Implement `compute_scenario_variance(transcripts)` function in `cloud/workers/stats/variance.py`
- [ ] T047 [US4] Add scenarioVariance array to analysis output in `cloud/workers/analyze_basic.py`
- [ ] T048 [P] [US4] Add test: scenario variance computation in `cloud/workers/tests/test_stats.py`

### Frontend

- [ ] T049 [US4] Add "Most Variable Scenarios" section to ScenariosTab in `cloud/apps/web/src/components/analysis/tabs/ScenariosTab.tsx`
- [ ] T050 [US4] Display scenarios sorted by variance descending in `cloud/apps/web/src/components/analysis/tabs/ScenariosTab.tsx`
- [ ] T051 [US4] Add expandable detail showing per-model score distribution in `cloud/apps/web/src/components/analysis/tabs/ScenariosTab.tsx`

**Checkpoint**: User Story 4 complete - scenario variance visible

---

## Phase 8: User Story 5 - Compare Variance Across Models (Priority: P2)

**Goal**: Variance/consistency column in model comparison, sortable

**Independent Test**: View model table with variance column, sort by consistency

### Frontend

- [ ] T052 [US5] Add "Consistency" column to model comparison table in `cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx`
- [ ] T053 [US5] Implement sort by variance (ascending = most consistent) in `cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx`
- [ ] T054 [US5] Format variance for display (e.g., "±0.15" or "High/Medium/Low") in `cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx`

**Checkpoint**: User Story 5 complete - model variance comparison available

---

## Phase 9: User Story 6 - Export Multi-Sample Data (Priority: P2)

**Goal**: CSV export includes sample_index, JSON export includes variance stats

**Independent Test**: Export CSV, verify sample_index column present

### API Export Changes

- [ ] T055 [US6] Add sampleIndex to transcript CSV export columns in `cloud/apps/api/src/services/export/` (locate export service)
- [ ] T056 [US6] Include variance stats in JSON analysis export in `cloud/apps/api/src/services/export/`
- [ ] T057 [P] [US6] Add test: CSV export includes sample_index in `cloud/apps/api/tests/services/export/`

**Checkpoint**: User Story 6 complete - exports include sample data

---

## Phase 10: User Story 7 - Set Default Sample Count (Priority: P3)

**Goal**: Users can set default samplesPerScenario in settings

**Independent Test**: Set default to 5 in settings, start new run, verify pre-populated

### Implementation

- [ ] T058 [US7] Add `defaultSamplesPerScenario` to user settings schema (if exists) or localStorage
- [ ] T059 [US7] Load default into StartRunForm initial value in `cloud/apps/web/src/components/runs/StartRunForm.tsx`
- [ ] T060 [US7] Add settings UI for default samples in settings page (if exists)

**Checkpoint**: User Story 7 complete - default configurable

---

## Phase 11: User Story 8 - View Sample-Level Transcripts (Priority: P3)

**Goal**: View individual sample transcripts for debugging variance

**Independent Test**: Navigate to scenario-model pair, view all sample transcripts

### Implementation

- [ ] T061 [US8] Add sampleIndex filter to transcript list query in `cloud/apps/web/src/hooks/` (locate transcript hooks)
- [ ] T062 [US8] Add sample selector/tabs to transcript detail view in `cloud/apps/web/src/pages/` (locate transcript detail)
- [ ] T063 [US8] Display sample index in transcript list when sampleCount > 1 in `cloud/apps/web/src/components/`

**Checkpoint**: User Story 8 complete - sample-level transcript viewing

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [ ] T064 Run full test suite: `npx turbo run test`
- [ ] T065 Run linting: `npx turbo run lint`
- [ ] T066 Run build: `npx turbo run build`
- [ ] T067 Verify manual testing scenarios from quickstart.md
- [ ] T068 Update MCP tool description to document samples_per_scenario in `cloud/apps/api/src/mcp/tools/start-run.ts`

**Checkpoint**: Feature complete and validated

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundation (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **US1 API (Phase 3)**: Depends on Foundation
- **US3 Progress (Phase 4)**: Depends on Phase 3 (uses same job count logic)
- **US2 Variance (Phase 5)**: Depends on Foundation (needs sampleIndex in DB)
- **US1 Frontend (Phase 6)**: Depends on Phase 3 (API must accept parameter)
- **US4-US8 (Phases 7-11)**: Depend on Foundation, can run after US1/US2 complete
- **Polish (Phase 12)**: Depends on all desired user stories complete

### User Story Dependencies

| Story | Priority | Depends On | Can Parallel With |
|-------|----------|------------|-------------------|
| US1 | P1 | Foundation | - |
| US2 | P1 | Foundation, US1 API | US3 |
| US3 | P1 | US1 API | US2 |
| US4 | P2 | US2 (variance in worker) | US5, US6 |
| US5 | P2 | US2 (variance in frontend) | US4, US6 |
| US6 | P2 | Foundation | US4, US5 |
| US7 | P3 | US1 Frontend | US8 |
| US8 | P3 | Foundation | US7 |

### Parallel Opportunities

Tasks marked [P] can run in parallel within each phase:
- T034, T035 (Python variance tests)
- T048, T057 (additional tests)

### Minimum Viable Feature (MVP)

Complete Phases 1-6 for MVP:
- ✅ Database schema with sampleIndex
- ✅ API accepts samplesPerScenario
- ✅ Jobs created per sample
- ✅ Progress tracking accurate
- ✅ Variance computed in analysis
- ✅ Error bars in UI
- ✅ Frontend configuration UI

P2/P3 stories enhance but don't block initial release.

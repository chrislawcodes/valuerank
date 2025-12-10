# Tasks: Stage 9 - Run Execution & Basic Export

**Prerequisites**: plan.md, spec.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with adjacent [P] tasks
- **[Story]**: User story label (US1-US8)
- Include exact file paths from plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and verification

- [X] T001 Verify branch is `feature/stage-9-run-execution`
- [X] T002 Verify existing run infrastructure works (start/pause/resume/cancel mutations)
- [X] T003 [P] Run existing tests to confirm baseline (`npm test`)

**Checkpoint**: Existing infrastructure verified, ready to extend

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Backend additions that MUST be complete before ANY user story UI

⚠️ **CRITICAL**: No frontend user story work can begin until this phase is complete

### Backend API Extensions

- [X] T004 Create available models query in `apps/api/src/graphql/queries/models.ts`
- [X] T005 [P] Create AvailableModel GraphQL type in `apps/api/src/graphql/types/models.ts`
- [X] T006 [P] Add models configuration source (environment or config file)
- [X] T007 Add tests for available models query in `apps/api/tests/graphql/queries/models.test.ts`

### CSV Export Endpoint

- [X] T008 Create export route in `apps/api/src/routes/export.ts`
- [X] T009 [P] Create CSV serialization helper in `apps/api/src/services/export/csv.ts`
- [X] T010 Register export routes in `apps/api/src/server.ts`
- [X] T011 Add tests for CSV export in `apps/api/tests/routes/export.test.ts`

### Access Tracking

- [X] T012 Create access tracking middleware in `apps/api/src/middleware/access-tracking.ts`
- [X] T013 [P] Add lastAccessedAt update to run query resolver
- [X] T014 [P] Add lastAccessedAt update to transcript query resolver
- [X] T015 Add tests for access tracking in `apps/api/tests/middleware/access-tracking.test.ts`

### Frontend Hooks (Shared)

- [X] T016 Create useAvailableModels hook in `apps/web/src/hooks/useAvailableModels.ts`
- [X] T017 [P] Create useRuns hook (list query) in `apps/web/src/hooks/useRuns.ts`
- [X] T018 [P] Create useRun hook (single + polling) in `apps/web/src/hooks/useRun.ts`
- [X] T019 [P] Create useRunMutations hook in `apps/web/src/hooks/useRunMutations.ts`
- [X] T020 Add tests for run hooks in `apps/web/tests/hooks/`

**Checkpoint**: Foundation ready - proceed to Phase 2b for E2E validation

---

## Phase 2b: User Story 0 - System Health & Expanded Scenarios (Priority: P0 - Prerequisite)

**Goal**: Validate end-to-end integration of Stages 5-6 and enable visibility into system health

**Independent Test**: View Settings page with provider status, view definition with expanded scenarios, run a single test job

⚠️ **CRITICAL**: This phase validates that the entire pipeline works before building run UI

### Backend: Health Check Services

- [X] T021 [US0] Create provider health service in `apps/api/src/services/health/providers.ts`
- [X] T022 [P] [US0] Create queue status service in `apps/api/src/services/health/queue.ts`
- [X] T023 [P] [US0] Create worker health service in `apps/api/src/services/health/workers.ts`
- [X] T024 [US0] Create health GraphQL queries in `apps/api/src/graphql/queries/health.ts`
- [X] T025 [P] [US0] Add provider health check endpoint to `apps/api/src/routes/health.ts`
- [X] T026 [US0] Add tests for health services in `apps/api/tests/services/health/`

### Backend: Expanded Scenarios Query

- [X] T027 [US0] Create scenarios query with full content in `apps/api/src/graphql/queries/scenarios.ts`
- [X] T028 [US0] Add tests for scenarios query in `apps/api/tests/graphql/queries/scenarios.test.ts`

### Frontend: System Health UI

- [X] T029 [P] [US0] Create useSystemHealth hook in `apps/web/src/hooks/useSystemHealth.ts`
- [X] T030 [P] [US0] Create ProviderStatus component in `apps/web/src/components/settings/ProviderStatus.tsx`
- [X] T031 [P] [US0] Create QueueStatus component in `apps/web/src/components/settings/QueueStatus.tsx`
- [X] T032 [US0] Create SystemHealth panel in `apps/web/src/components/settings/SystemHealth.tsx`
- [X] T033 [US0] Integrate SystemHealth into Settings page `apps/web/src/pages/Settings.tsx`
- [X] T034 [US0] Add tests for settings components in `apps/web/src/components/settings/__tests__/`

### Frontend: Expanded Scenarios View

- [X] T035 [US0] Create useExpandedScenarios hook in `apps/web/src/hooks/useExpandedScenarios.ts`
- [X] T036 [US0] Create ExpandedScenarios component in `apps/web/src/components/definitions/ExpandedScenarios.tsx`
- [X] T037 [US0] Integrate ExpandedScenarios into DefinitionDetail page
- [X] T038 [US0] Add tests for ExpandedScenarios in `apps/web/src/components/definitions/__tests__/`

### E2E Validation (Manual Steps)

- [X] T039 [US0] **VALIDATION**: Verify provider health checks show correct status for each LLM
- [X] T040 [US0] **VALIDATION**: Verify queue status shows worker as online when running
- [X] T041 [US0] **VALIDATION**: Verify expanded scenarios show for a definition with dimensions
- [X] T042 [US0] **VALIDATION**: Start a test run with 1 model, 1 scenario → verify transcript created
- [X] T043 [US0] **VALIDATION**: Document any issues found and fixes required

**Checkpoint**: E2E validation complete - system is proven to work. Proceed to run UI.

---

## Phase 3: User Story 1 - Create and Start a Run (Priority: P1) 🎯 MVP

**Goal**: Users can create an evaluation run by selecting a definition and models

**Independent Test**: Navigate to definition, start run, verify jobs queued

### Implementation for User Story 1

- [X] T044 [P] [US1] Create ModelSelector component in `apps/web/src/components/runs/ModelSelector.tsx`
- [X] T045 [P] [US1] Create RunForm component in `apps/web/src/components/runs/RunForm.tsx`
- [X] T046 [US1] Add "Start Run" button to DefinitionDetail page in `apps/web/src/pages/DefinitionDetail.tsx`
- [X] T047 [US1] Implement RunForm integration with startRun mutation
- [X] T048 [US1] Add redirect to RunDetail after successful run creation
- [X] T049 [US1] Add tests for ModelSelector in `apps/web/src/components/runs/__tests__/ModelSelector.test.tsx`
- [X] T050 [P] [US1] Add tests for RunForm in `apps/web/src/components/runs/__tests__/RunForm.test.tsx`

**Checkpoint**: User Story 1 should be fully functional - can create and start runs

---

## Phase 4: User Story 2 - Monitor Run Progress (Priority: P1) 🎯 MVP

**Goal**: Users can see real-time progress of running evaluations

**Independent Test**: Start run, observe progress updates every 5 seconds

### Implementation for User Story 2

- [X] T051 [P] [US2] Create RunProgress component in `apps/web/src/components/runs/RunProgress.tsx`
- [X] T052 [P] [US2] Create RunDetail page in `apps/web/src/pages/RunDetail.tsx`
- [X] T053 [US2] Add route for RunDetail page in `apps/web/src/App.tsx`
- [X] T054 [US2] Implement polling logic in useRun hook (5s interval when active)
- [X] T055 [US2] Add per-model progress breakdown to RunProgress component
- [X] T056 [US2] Add automatic polling stop on terminal state
- [X] T057 [US2] Add tests for RunProgress in `apps/web/src/components/runs/__tests__/RunProgress.test.tsx`
- [X] T058 [P] [US2] Add tests for RunDetail page in `apps/web/src/pages/__tests__/RunDetail.test.tsx`

**Checkpoint**: User Story 2 should be fully functional - can monitor progress in real-time

---

## Phase 5: User Story 3 - View Run Results (Priority: P1) 🎯 MVP

**Goal**: Users can view results of completed evaluations

**Independent Test**: View completed run, verify results table and transcript details

### Implementation for User Story 3

- [X] T059 [P] [US3] Create RunResults component in `apps/web/src/components/runs/RunResults.tsx`
- [X] T060 [P] [US3] Create TranscriptList component in `apps/web/src/components/runs/TranscriptList.tsx`
- [X] T061 [P] [US3] Create TranscriptViewer component in `apps/web/src/components/runs/TranscriptViewer.tsx`
- [X] T062 [US3] Integrate RunResults into RunDetail page
- [X] T063 [US3] Add expandable per-model breakdown in RunResults
- [X] T064 [US3] Add transcript detail modal/view
- [X] T065 [US3] Add tests for RunResults in `apps/web/src/components/runs/__tests__/RunResults.test.tsx`
- [X] T066 [P] [US3] Add tests for TranscriptList in `apps/web/src/components/runs/__tests__/TranscriptList.test.tsx`

**Checkpoint**: User Story 3 should be fully functional - can view run results and transcripts

---

## Phase 6: User Story 4 - Export Results as CSV (Priority: P1) 🎯 MVP

**Goal**: Users can export run results as CSV for external analysis

**Independent Test**: View completed run, click export, verify CSV downloads correctly

### Implementation for User Story 4

- [X] T067 [US4] Create CSV export helper in `apps/web/src/api/export.ts`
- [X] T068 [US4] Add "Export CSV" button to RunResults component
- [X] T069 [US4] Implement download trigger with proper filename
- [X] T070 [US4] Add loading state during export
- [X] T071 [US4] Add tests for export functionality in `apps/web/tests/api/export.test.ts`

**Checkpoint**: User Story 4 should be fully functional - can export results as CSV

---

## Phase 7: User Story 5 - Browse Run Dashboard (Priority: P2)

**Goal**: Users can see all runs in a browsable dashboard

**Independent Test**: Navigate to Runs page, verify list with filtering

### Implementation for User Story 5

- [X] T072 [P] [US5] Create RunCard component in `apps/web/src/components/runs/RunCard.tsx`
- [X] T073 [P] [US5] Create RunFilters component in `apps/web/src/components/runs/RunFilters.tsx`
- [X] T074 [US5] Implement Runs page in `apps/web/src/pages/Runs.tsx`
- [X] T075 [US5] Add status filtering to Runs page
- [X] T076 [US5] Add pagination to Runs page
- [X] T077 [US5] Add navigation to RunDetail on card click
- [X] T078 [US5] Add empty state for no runs
- [X] T079 [US5] Add tests for Runs page in `apps/web/tests/pages/Runs.test.tsx`

**Checkpoint**: User Story 5 should be fully functional - can browse and filter runs

---

## Phase 8: User Story 6 - Pause and Resume Runs (Priority: P2)

**Goal**: Users can pause and resume running evaluations

**Independent Test**: Start run, pause, verify no new jobs, resume, verify continuation

### Implementation for User Story 6

- [X] T080 [P] [US6] Create RunControls component in `apps/web/src/components/runs/RunControls.tsx`
- [X] T081 [US6] Integrate RunControls into RunDetail page
- [X] T082 [US6] Implement pause button with pauseRun mutation
- [X] T083 [US6] Implement resume button with resumeRun mutation
- [X] T084 [US6] Add button state changes based on run status
- [X] T085 [US6] Add loading states during mutations
- [X] T086 [US6] Add tests for RunControls in `apps/web/src/components/runs/__tests__/RunControls.test.tsx`

**Checkpoint**: User Story 6 should be fully functional - can pause and resume runs

---

## Phase 9: User Story 7 - Cancel Runs (Priority: P2)

**Goal**: Users can cancel running evaluations with confirmation

**Independent Test**: Start run, cancel, confirm, verify status is Cancelled

### Implementation for User Story 7

- [X] T087 [US7] Add cancel button to RunControls component
- [X] T088 [US7] Create confirmation dialog for cancel action
- [X] T089 [US7] Implement cancelRun mutation integration
- [X] T090 [US7] Update button visibility based on run status
- [X] T091 [US7] Add tests for cancel flow in `apps/web/src/components/runs/__tests__/RunControls.test.tsx`

**Checkpoint**: User Story 7 should be fully functional - can cancel runs with confirmation

---

## Phase 10: User Story 8 - Re-run Against Different Model Version (Priority: P3)

**Goal**: Users can re-run scenarios against different model versions

**Independent Test**: View completed run, re-run with different version, verify new run created

### Implementation for User Story 8

- [X] T092 [US8] Add "Re-run" button to RunDetail page
- [X] T093 [US8] Create RerunDialog component in `apps/web/src/components/runs/RerunDialog.tsx`
- [X] T094 [US8] Implement model version selection in RerunDialog
- [ ] T095 [US8] Add parentRunId linking for re-runs ⚠️ **DEFERRED** - Requires schema migration
- [ ] T096 [US8] Display related runs (parent/children) on RunDetail ⚠️ **DEFERRED** - Requires T095
- [X] T097 [US8] Add tests for RerunDialog in `apps/web/src/components/runs/__tests__/RerunDialog.test.tsx`

**Checkpoint**: User Story 8 partially functional - can re-run with different models. Parent/child linking deferred to future stage.

**NOTE**: T095-T096 require adding `parentRunId` column to the Run model in Prisma schema. This has been deferred as it requires a database migration. The re-run feature works without linking, users can create new runs from completed runs but without explicit parent/child relationship tracking.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements and validation

- [X] T098 [P] Update hooks/index.ts to export new hooks
- [ ] T099 [P] Add loading skeletons to all list views ⚠️ **DEFERRED** - Enhancement for future iteration
- [ ] T100 [P] Add error boundaries to run components ⚠️ **DEFERRED** - Enhancement for future iteration
- [X] T101 Review and update accessibility (aria labels, keyboard nav)
- [ ] T102 Run full validation per quickstart.md ⚠️ **MANUAL** - Requires running application
- [X] T103 Verify test coverage meets 80% target (121 tests passing)
- [X] T104 Run linting and fix any issues
- [X] T105 Update component exports in `apps/web/src/components/runs/index.ts`

**Checkpoint**: Stage 9 core implementation complete. All user stories implemented (T099-T100 enhancements deferred).

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    └── Phase 2 (Foundation) ─── Backend APIs + hooks
            │
            └── Phase 2b (System Health) ─── E2E VALIDATION 🔴
                    │
                    ├── Phase 3 (US1: Create Run) 🎯 MVP
                    │       └── Phase 4 (US2: Monitor Progress) 🎯 MVP
                    │               └── Phase 5 (US3: View Results) 🎯 MVP
                    │                       └── Phase 6 (US4: CSV Export) 🎯 MVP
                    │
                    ├── Phase 7 (US5: Dashboard) - Can run parallel with US1-4
                    │
                    ├── Phase 8 (US6: Pause/Resume) - After US2
                    │       └── Phase 9 (US7: Cancel) - After US6
                    │
                    └── Phase 10 (US8: Re-run) - After US3
                            │
                            └── Phase 11 (Polish) - After desired stories complete
```

### Recommended Execution Order (Sequential)

1. **Foundation**: Phases 1-2 (T001-T020)
2. **E2E Validation**: Phase 2b (T021-T043) ⚠️ MUST PASS BEFORE CONTINUING
3. **MVP (P1)**: Phases 3-6 (T044-T071)
4. **Dashboard (P2)**: Phase 7 (T072-T079)
5. **Controls (P2)**: Phases 8-9 (T080-T091)
6. **Re-run (P3)**: Phase 10 (T092-T097)
7. **Polish**: Phase 11 (T098-T105)

### Parallel Opportunities

- Tasks marked [P] can run in parallel within each phase
- US5 (Dashboard) can be developed parallel to US1-4 after Phase 2b
- Different developers can work on different user stories simultaneously

---

## Summary

| Phase | Tasks | Purpose |
|-------|-------|---------|
| Phase 1 | T001-T003 | Setup verification |
| Phase 2 | T004-T020 | Foundation (backend APIs + hooks) |
| **Phase 2b** | **T021-T043** | **US0: System Health & E2E Validation (P0)** |
| Phase 3 | T044-T050 | US1: Create Run (P1) |
| Phase 4 | T051-T058 | US2: Monitor Progress (P1) |
| Phase 5 | T059-T066 | US3: View Results (P1) |
| Phase 6 | T067-T071 | US4: CSV Export (P1) |
| Phase 7 | T072-T079 | US5: Dashboard (P2) |
| Phase 8 | T080-T086 | US6: Pause/Resume (P2) |
| Phase 9 | T087-T091 | US7: Cancel (P2) |
| Phase 10 | T092-T097 | US8: Re-run (P3) |
| Phase 11 | T098-T105 | Polish |

**Total**: 105 tasks across 12 phases (including 2b)
**Foundation**: 20 tasks (Phases 1-2)
**P0 (E2E Validation)**: 23 tasks (Phase 2b) ⚠️ PREREQUISITE
**MVP (P1)**: 28 tasks (Phases 3-6)
**P2**: 20 tasks (Phases 7-9)
**P3**: 6 tasks (Phase 10)
**Polish**: 8 tasks (Phase 11)

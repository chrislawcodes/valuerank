# Tasks: Analysis Model Filter

## Phase 1 — Foundation

- [ ] T001 Create `ModelFilterBar.tsx` in `cloud/apps/web/src/components/analysis/`
- [ ] T002 Add `selectedModels` state and transcript-count derivation to `AnalysisPanel.tsx`; mount `ModelFilterBar` above the tab bar

## Phase 2 — Wire selected models into tabs

- [ ] T003 Add `selectedModels` prop to `ConditionDecisionsTable` — remove internal model selector state and dropdown; filter visibleModels from prop
- [ ] T004 Add `allowedModels` prop to `PivotAnalysisTable` — constrain the single-model dropdown to models in allowedModels
- [ ] T005 Add `selectedModels` prop to `ScenariosTab` — pass through to both `PivotAnalysisTable` and `ConditionDecisionsTable`
- [ ] T006 Add `selectedModels` prop to `OverviewTab` — filter the models list in `OverviewSummaryTable`
- [ ] T007 Update `AnalysisPanel` to pass `selectedModels` to `OverviewTab`, `DecisionsTab`, and `ScenariosTab`

## Phase 3 — DecisionsTab

- [ ] T008 Check `DecisionsTab` for any model-specific rendering; pass `selectedModels` if needed

## Phase 4 — Polish and verification

- [ ] T009 Run `npm run build --workspace @valuerank/web` from worktree, fix all errors
- [ ] T010 Run `npm run lint --workspace @valuerank/web` from worktree, fix all issues
- [ ] T011 Run `npm run test --workspace @valuerank/web` from worktree, fix any failures caused by changes

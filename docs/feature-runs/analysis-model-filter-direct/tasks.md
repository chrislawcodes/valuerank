# Tasks: Analysis Model Filter — Direct Path

## Phase 1: ModelFilter component
- [ ] Create `cloud/apps/web/src/components/analysis/ModelFilter.tsx`
  - `ModelFilterProps` type with `transcriptModelIds`, `noTranscriptModelIds?`, `selectedModels`, `onSelectedModelsChange`
  - Collapsed bar: Default / N of M / amber warn states
  - `▾ Change` / `▴ Close` toggle with `aria-expanded`
  - Expanded panel: checkboxes for transcript models, dimmed rows for no-transcript models
  - `Select all` and `Clear` links in expanded header
  - `Reset to default` link in collapsed bar (custom subset state only)

## Phase 2: ModelFilter unit tests
- [ ] Create `cloud/apps/web/src/components/analysis/ModelFilter.test.tsx`
  - Test: "Default" label when all transcript-bearing models are selected
  - Test: "N of M" label when a subset is selected
  - Test: amber warning when 0 models selected
  - Test: "Reset to default" link visible in subset state; calling it passes full `transcriptModelIds`
  - Test: expand/collapse toggle flips `aria-expanded`
  - Test: no-transcript models render dimmed with disabled checkboxes
  - Test: checking a model calls `onSelectedModelsChange` with updated list

## Phase 3: AnalysisPanel integration
- [ ] Derive `transcriptModelIds` from `transcripts`
- [ ] Derive `noTranscriptModelIds` from `perModel` keys minus `transcriptModelIds`
- [ ] Add `selectedModels: string[]` state (init `[]`)
- [ ] Add `useEffect` to reset `selectedModels` to `[]` when `runId` changes
- [ ] Derive `effectiveModels` (selectedModels || transcriptModelIds)
- [ ] Derive `filteredPerModel` by filtering `perModel` to `effectiveModels`
- [ ] Render `<ModelFilter>` between warnings and tab bar
- [ ] Pass `filteredPerModel` as `perModel` to `OverviewTab` and `ScenariosTab`
- [ ] Pass `effectiveModels` as `selectedModels` to `ScenariosTab`

## Phase 4: ScenariosTab update
- [ ] Add optional `selectedModels?: string[]` prop to `ScenariosTabProps`
- [ ] Pass `selectedModels` as `externalSelectedModels` to `ConditionDecisionsTable`
- [ ] Pass `selectedModels` to `PivotAnalysisTable`

## Phase 5: ConditionDecisionsTable update
- [ ] Add optional `externalSelectedModels?: string[]` prop to `ConditionDecisionsTableProps`
- [ ] Derive `visibleModels` from `externalSelectedModels` (filtered by `models`) when provided
- [ ] Hide "AI Columns" `<details>` dropdown when `externalSelectedModels` is provided
- [ ] Existing local-state path unchanged when prop not provided

## Phase 6: PivotAnalysisTable update
- [ ] Add optional `selectedModels?: string[]` prop to `PivotAnalysisTableProps`
- [ ] Derive `filteredModels` = intersection of `models` and `selectedModels` (fallback to `models` if empty)
- [ ] Render only `filteredModels` in the model `<select>` dropdown
- [ ] Add `useEffect` to reset `selectedModel` to first of `filteredModels` when current not in list

## Phase 7: Build + lint + test
- [ ] `npm run build --workspace @valuerank/web` — zero errors
- [ ] `npm run lint --workspace @valuerank/web` — zero new errors
- [ ] `npm run test --workspace @valuerank/web` — no new failures

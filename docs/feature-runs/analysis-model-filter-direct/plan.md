# Plan: Analysis Model Filter — Direct Path

## Architecture Decisions

### 1. State lives in AnalysisPanel

`selectedModels: string[]` state lives in `AnalysisPanel`. Empty array = default (all transcript-bearing models). This avoids URL/storage complexity and fits the existing prop-passing pattern.

### 2. Empty array = "default" sentinel

`selectedModels = []` means "show all transcript-bearing models". This avoids synchronization issues when the transcript list changes (new data arrives, run changes). On run change, just reset to `[]`.

### 3. New component: ModelFilter

A self-contained React component. Controlled: receives `selectedModels` and `onSelectedModelsChange`. Manages only its own `isOpen` toggle internally.

### 4. ConditionDecisionsTable: controlled/uncontrolled split

When `externalSelectedModels` prop is provided, use it directly (no local state, hide dropdown). When not provided, existing local-state dropdown is unchanged. This preserves backward compatibility and avoids breaking any existing usage that does not go through `AnalysisPanel`.

### 5. PivotAnalysisTable: filter options, keep single-model selector

PivotAnalysisTable shows one model at a time. When `selectedModels` is provided, filter the dropdown options to those models only. Reset `selectedModel` to first in filtered list if current selection is excluded.

### 6. DecisionDistributionChart (Decisions tab): not filtered

`DecisionDistributionChart` uses pre-computed `visualizationData` (server-side aggregate). Filtering it would require re-aggregation server-side. Out of scope.

---

## Implementation Steps

### Phase 1: ModelFilter component

Create `cloud/apps/web/src/components/analysis/ModelFilter.tsx`.

Props:
- `transcriptModelIds: string[]` — models with transcripts
- `noTranscriptModelIds?: string[]` — models without transcripts
- `selectedModels: string[]` — controlled selection (empty = all selected / default)
- `onSelectedModelsChange: (models: string[]) => void`

Collapsed bar renders: label (`Default` / `N of M` / amber warn) + `▾ Change` button + optional `Reset to default` link.

Expanded panel renders: checkboxes for each transcript model, divider + dimmed rows for no-transcript models, `Select all` / `Clear` links, `▴ Close` button.

### Phase 2: ModelFilter unit tests

Create `cloud/apps/web/src/components/analysis/ModelFilter.test.tsx`.

7 test cases covering all UI states and interactions (see spec).

### Phase 3: AnalysisPanel integration

In `AnalysisPanel`:
1. Derive `transcriptModelIds` and `noTranscriptModelIds` from `transcripts` and `perModel`.
2. Add `selectedModels` state (init `[]`). Add `useEffect` to reset to `[]` when `runId` changes.
3. Derive `effectiveModels` = `selectedModels.length > 0 ? selectedModels : transcriptModelIds`.
4. Derive `filteredPerModel` = filter `perModel` to `effectiveModels`.
5. Render `<ModelFilter>` between warnings section and tab bar.
6. Pass `filteredPerModel` to `OverviewTab`, `DecisionsTab` (not needed currently), and `ScenariosTab`.
7. Pass `effectiveModels` as `selectedModels` to `ScenariosTab`.

### Phase 4: ScenariosTab update

Add optional `selectedModels?: string[]` prop to `ScenariosTab`. Pass to both `ConditionDecisionsTable` (as `externalSelectedModels`) and `PivotAnalysisTable` (as `selectedModels`).

### Phase 5: ConditionDecisionsTable update

Add optional `externalSelectedModels?: string[]` prop.

When provided:
- `visibleModels = externalSelectedModels.filter(id => models.includes(id))`
- Hide the "AI Columns" `<details>` dropdown
- Skip local `selectedModels` state and toggle logic

When not provided: existing behavior unchanged.

### Phase 6: PivotAnalysisTable update

Add optional `selectedModels?: string[]` prop.

When provided:
- `filteredModels = models.filter(id => selectedModels.includes(id))`; if empty, fall back to `models`
- Dropdown renders only `filteredModels`
- `useEffect`: if `selectedModel` not in `filteredModels`, reset to `filteredModels[0]`

When not provided: existing behavior unchanged.

### Phase 7: Build + lint + test

Run all three checks. Fix any TypeScript errors or lint violations. Fix any test failures caused by the changes.

---

## File Size Risk

- `AnalysisPanel.tsx` is currently ~647 lines. Adding ~50 lines of filter logic should stay under 400 if we extract `ModelFilter` as a separate file (done in Phase 1).
- `ConditionDecisionsTable.tsx` is ~644 lines. The change adds ~15 lines (conditional path). This exceeds the 400-line limit but the file was already over the limit before this change. Do not expand it further.

---

## Risks

| Risk | Mitigation |
|---|---|
| `ConditionDecisionsTable` model list built from both `perModel` AND `modelScenarioMatrix` keys — unfiltered matrix could add back excluded models | `externalSelectedModels` is used as an intersection filter on top of `models` — all non-listed models excluded regardless |
| Run change doesn't reset filter | `useEffect` on `runId` resets `selectedModels` to `[]` |
| `PivotAnalysisTable` filtered to empty list | Fall back to full `models` list when filtered result is empty |

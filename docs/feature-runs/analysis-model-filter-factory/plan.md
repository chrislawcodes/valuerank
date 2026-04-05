# Plan: Analysis Model Filter

**Branch**: `factory/analysis-model-filter`
**Date**: 2026-04-04
**Spec**: spec.md

## Summary

Add a `ModelFilterBar` component to `AnalysisPanel` that owns global selected-model state and passes it as a prop to `OverviewTab`, `DecisionsTab`, and `ScenariosTab`. Replace the internal model picker in `ConditionDecisionsTable` with the externally-passed selection. Constrain `PivotAnalysisTable`'s single-model picker to only models in the external selection.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18
**Primary Dependencies**: React `useState`, `useMemo`, Lucide icons (already used), Tailwind CSS
**Storage**: None — UI state only
**Testing**: Vitest + Testing Library (existing test suite)
**Target Platform**: Browser (Vite dev server / Railway production)
**Performance Goals**: No server round-trips; pure client state
**Constraints**: No `@ts-ignore`; only touch `cloud/apps/web/src/`

## Architecture Decisions

### Decision 1: State ownership in AnalysisPanel

**Chosen**: `selectedModels: string[]` state lives in `AnalysisPanel`, not in each tab.

**Rationale**: The filter must affect all three tabs simultaneously. Lifting state to the common parent is the standard React pattern and avoids prop-drilling through intermediate contexts. `AnalysisPanel` already derives `perModel` and passes it to all tabs, so it has the right data to compute the default set.

**Alternatives Considered**:
- React context: unnecessary complexity for a single prop.
- URL param: would affect linking but adds navigation noise not requested.

### Decision 2: Replace ConditionDecisionsTable's internal selector

**Chosen**: Remove the local `selectedModels` state from `ConditionDecisionsTable` and accept `selectedModels: string[]` as a required prop. Keep `setSelectedModels` internally only if needed for the orientation toggle; otherwise remove entirely.

**Rationale**: The spec says "reconcile or replace." Having two independent selectors for the same dimension is confusing. The global filter is the right owner.

**Alternatives Considered**:
- Keep both selectors and sync them: confusing and fragile.

### Decision 3: PivotAnalysisTable single-model picker

**Chosen**: Accept `allowedModels?: string[]` prop. When provided, the `models` list used for the single-model dropdown is intersected with `allowedModels`. The user can still change the single-model selection within the allowed subset.

**Rationale**: The pivot table already has its own `selectedModel` (singular) state. The global filter narrows the available choices without removing the local single-model picker.

### Decision 4: ModelFilterBar component

**Chosen**: New file `cloud/apps/web/src/components/analysis/ModelFilterBar.tsx`.

**Props**:
```ts
type ModelFilterBarProps = {
  models: string[];                          // full model list
  defaultModels: string[];                   // transcript-bearing models
  selectedModels: string[];                  // current selection
  transcriptCounts: Record<string, number>;  // counts per model
  onSelectionChange: (next: string[]) => void;
};
```

**Collapsed state**: shows "Default" or "N of M" label + toggle button. Warn badge when 0 selected.
**Expanded state**: checklist with divider between transcript-bearing and zero-transcript models.

## Project Structure

Files to create or modify:

```
cloud/apps/web/src/components/analysis/
  ModelFilterBar.tsx                  (NEW — global filter component)
  AnalysisPanel.tsx                   (MODIFY — add selectedModels state + ModelFilterBar)
  ConditionDecisionsTable.tsx         (MODIFY — accept selectedModels prop, remove internal state)
  PivotAnalysisTable.tsx              (MODIFY — accept allowedModels prop)
  tabs/
    ScenariosTab.tsx                  (MODIFY — pass selectedModels to children)
    OverviewTab.tsx                   (MODIFY — accept + pass selectedModels to condition table)
```

No new routes, no schema changes, no new queries.

## Key Constraints

- **selectedModels default = perModel keys**: `perModel` from `useAnalysis` is the source of truth for which models have data. Default set = `Object.keys(perModel)`.
- **Zero-transcript models**: derived from `analysis.visualizationData.modelScenarioMatrix` keys that are NOT in `perModel`.
- **No internal selector in ConditionDecisionsTable**: remove `const [selectedModels, setSelectedModels] = useState<string[]>(models)` and the `<details>` dropdown. Accept prop instead.
- **PivotAnalysisTable model dropdown**: filter `models` by `allowedModels` when provided.
- **OverviewTab**: currently doesn't use a model filter. It renders a per-model summary table; filter it by `selectedModels` by passing the prop and slicing `perModel` before passing to sub-components.

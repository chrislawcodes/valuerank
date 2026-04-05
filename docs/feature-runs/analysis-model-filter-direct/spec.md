# Spec: Model Filter for Vignette Analysis Page

## Summary

Add a single, shared model filter to the Vignette Analysis page (AnalysisPanel). The filter sits above the tab bar and controls which models are included in all three tabs: Overview, Decisions, and Conditions.

The filter replaces the existing per-table model selectors in `ConditionDecisionsTable` and `PivotAnalysisTable`.

---

## User Stories

### US-1: Filter models before looking at any tab

As a researcher, I want to select a subset of models once and have that selection persist across all three tabs, so I don't have to re-filter on each table.

**Acceptance criteria:**
- Filter sits above the tab bar, always visible when analysis is loaded.
- Selecting or deselecting a model immediately affects Overview, Decisions, and Conditions tabs.
- Selection persists when switching tabs.

### US-2: See how many models are selected

As a researcher, I want to immediately see whether I'm viewing "all" models or a subset, so I know the data is not filtered without me realising it.

**Acceptance criteria:**
- When all transcript-bearing models are checked: label reads "Default".
- When a subset is checked: label reads "N of M" (e.g. "7 of 15").
- When 0 models are selected: warn state (amber banner).

### US-3: Reset to default quickly

As a researcher who has narrowed down to a subset, I want a one-click way to go back to all transcript-bearing models.

**Acceptance criteria:**
- When in custom subset state: "Reset to default" link appears.
- Clicking it restores the full set of transcript-bearing models.

---

## Behaviour

### Collapsed states

| State | Label shown | Controls shown |
|---|---|---|
| All transcript-bearing models checked | `Default` | `▾ Change` button |
| Custom subset (1+ but not all checked) | `N of M` | `Reset to default` link + `▾ Change` button |
| 0 models selected | amber warning: "No models selected — select at least one to view results" | `▾ Change` button |

### Expanded (open) state

- Header shows `▴ Close` button.
- Section 1: Checklist of models that have transcripts, checked by default.
  - Each row: checkbox · model name · transcript count badge.
- Horizontal divider (only shown if there are models without transcripts).
- Section 2 (conditional): Models that have no transcripts — dimmed, unchecked, not interactive.
  - Each row: checkbox (disabled, unchecked) · model name · "no transcripts" label.
- "Select all" / "Clear" links in the header area.

### "Default" definition

The set of models that have at least one transcript for this run. When all transcript-bearing models are checked (regardless of order), the state is considered "default". Models without transcripts are never included in the default set.

### Deriving the model list

Use the `transcripts` prop already available in `AnalysisPanel`. The set of transcript-bearing model IDs is:

```ts
const transcriptModelIds = useMemo(
  () => [...new Set(transcripts.map((t) => t.modelId))].sort(),
  [transcripts]
);
```

Non-transcript models come from `Object.keys(analysis.perModel)` minus the transcript set. In practice for current prod data this is empty, but the UI should handle it gracefully.

---

## Scope

### Files to modify

| File | Change |
|---|---|
| `cloud/apps/web/src/components/analysis/AnalysisPanel.tsx` | Add `ModelFilter` component above tab bar; manage `selectedModels` state; pass `filteredPerModel` and `effectiveModels` down to tabs |
| `cloud/apps/web/src/components/analysis/tabs/ScenariosTab.tsx` | Accept optional `selectedModels?: string[]` prop; pass down to `ConditionDecisionsTable` and `PivotAnalysisTable` |
| `cloud/apps/web/src/components/analysis/ConditionDecisionsTable.tsx` | Accept optional `externalSelectedModels?: string[]` prop; when provided, use it as the controlled selection (overrides local state and hides the "AI Columns" dropdown); when not provided, keep existing local selector |
| `cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx` | Accept optional `selectedModels?: string[]` prop; when provided, filter model dropdown options to only those IDs; reset `selectedModel` to first in filtered list when current selection no longer in filtered list |
| `cloud/apps/web/src/components/analysis/ModelFilter.tsx` | **New file**: the collapsible model filter component |
| `cloud/apps/web/src/components/analysis/ModelFilter.test.tsx` | **New file**: unit tests for `ModelFilter` |

### Files NOT to modify

- `CLAUDE.md`, `AGENTS.md`, `MEMORY.md`, `.gitignore`
- Any file outside `cloud/apps/web/src/`
- `AnalysisFilters.tsx` (existing component used elsewhere — do not remove or change its API)
- API/server files

---

## New Component: `ModelFilter`

**File:** `cloud/apps/web/src/components/analysis/ModelFilter.tsx`

### Props

```ts
type ModelFilterProps = {
  transcriptModelIds: string[];      // models with transcripts, sorted
  noTranscriptModelIds?: string[];   // models without transcripts (optional)
  selectedModels: string[];          // controlled
  onSelectedModelsChange: (models: string[]) => void;
};
```

### Internal state

- `isOpen: boolean` — expanded/collapsed state (starts collapsed)

### Logic

- **isDefault**: `selectedModels` contains every ID in `transcriptModelIds` (regardless of order), AND `transcriptModelIds.length > 0`
- **isWarn**: `selectedModels.length === 0`

### Rendering

Collapsed bar:
```
[filter icon] Models:  Default  ▾ Change
                    or  7 of 15  Reset to default  ▾ Change
                    or  [amber warn]  ▾ Change
```

Expanded panel (shown below the bar, not a dropdown):
```
Models  ▴ Close    [Select all]  [Clear]
---------------------------------------------
☑ model-a        (45)
☑ model-b        (30)
☑ model-c        (12)
— (divider, if noTranscriptModelIds non-empty) —
☐ model-d   no transcripts   (dimmed)
```

### Accessibility

- The toggle `▾ Change` / `▴ Close` button has `aria-expanded`.
- The expanded panel has `role="group"` with `aria-label="Model filter"`.

---

## Integration in AnalysisPanel

### State

```ts
const [selectedModels, setSelectedModels] = useState<string[]>([]);
```

Initialize `selectedModels` to `[]` (treated as "default" — render nothing filtered). When `transcriptModelIds` changes (new run data), reset `selectedModels` to `[]`.

The **effective model list** for downstream tabs:

```ts
const effectiveModels = useMemo(
  () => (selectedModels.length === 0 ? transcriptModelIds : selectedModels),
  [selectedModels, transcriptModelIds]
);
```

Empty `selectedModels` = all transcript-bearing models selected = "Default" state.

This avoids having to pass `transcriptModelIds` to every child — each child just uses the filtered `perModel` and `effectiveModels`.

### Filtered perModel

```ts
const filteredPerModel = useMemo(
  () => effectiveModels.length > 0
    ? Object.fromEntries(
        Object.entries(perModel).filter(([k]) => effectiveModels.includes(k))
      )
    : perModel,
  [effectiveModels, perModel]
);
```

Pass `filteredPerModel` (not `perModel`) to OverviewTab and ScenariosTab.

### Placement

Between the details/warnings section and the tab bar:

```tsx
{/* Model filter — above tab bar */}
<ModelFilter
  transcriptModelIds={transcriptModelIds}
  noTranscriptModelIds={noTranscriptModelIds}
  selectedModels={selectedModels}
  onSelectedModelsChange={setSelectedModels}
/>

<div className="border-b border-gray-200 mb-6">
  {/* ... tab bar ... */}
</div>
```

---

## Changes to Child Components

### OverviewTab

No change required. `AnalysisPanel` passes `filteredPerModel` as the `perModel` prop. `OverviewTab` renders whatever model rows it receives.

### ScenariosTab

Pass `selectedModels` down to both `ConditionDecisionsTable` and `PivotAnalysisTable`.

### ConditionDecisionsTable

Add optional prop `externalSelectedModels?: string[]`. When provided:
- `visibleModels` is derived directly from `externalSelectedModels` (intersection with `models` to avoid stale IDs).
- The "AI Columns" `<details>` dropdown is **hidden** (the page-level filter replaces it).
- No local `selectedModels` state is needed in this mode.

When not provided (backward compatibility):
- Existing local `selectedModels` state and "AI Columns" dropdown remain unchanged.

This is a **controlled vs uncontrolled** split. The existing `useEffect` that syncs local state to `models` changes is kept for the uncontrolled path only.

### PivotAnalysisTable

Add optional prop `selectedModels?: string[]`. When provided, filter the `models` list to only those IDs before building the model dropdown. If the currently selected model is no longer in the filtered list, default to the first available.

---

## Unit Tests (ModelFilter.test.tsx)

Tests should cover:
1. Renders "Default" label when all transcript-bearing models are selected.
2. Renders "N of M" label when a subset is selected.
3. Renders amber warning when 0 models are selected.
4. "Reset to default" link appears in custom subset state; clicking it calls `onSelectedModelsChange` with the full `transcriptModelIds`.
5. Expand/collapse toggle works (`aria-expanded` flips).
6. Models without transcripts render in dimmed section with disabled checkboxes.
7. Checking a model calls `onSelectedModelsChange` with updated list.

---

## Verification Steps

1. `npm run build --workspace @valuerank/web` — zero errors, no `@ts-ignore`
2. `npm run lint --workspace @valuerank/web` — zero new lint errors
3. `npm run test --workspace @valuerank/web` — no new failures

### Manual checks (dev server)

- Open an analysis with multiple models. Filter panel shows "Default" collapsed.
- Click "Change", deselect one model. Panel shows "N of M". Overview tab shows only selected models. Switch to Conditions — same models. Switch to Decisions — same models.
- Click "Reset to default" — returns to full set.
- Deselect all — amber warning shown.
- Navigate to a different run — filter resets to default.

---

## Out of Scope

- Persisting the filter selection to URL params or localStorage.
- Filtering the Decisions tab's `DecisionDistributionChart` (it uses `visualizationData` which is pre-computed server-side; filtering it is a back-end concern).
- Modifying `AnalysisFilters.tsx` (used in other pages, different concern).

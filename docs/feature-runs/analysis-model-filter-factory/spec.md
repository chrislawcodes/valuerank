# Spec: Analysis Model Filter

**Branch**: `factory/analysis-model-filter`
**Created**: 2026-04-04
**Status**: draft

## Summary

Add a shared model filter to the Vignette Analysis page (AnalysisPanel). The filter sits above the tab bar and controls which models appear in all three tabs: Overview, Decisions, and Conditions.

## User Stories

### US-1 — View analysis filtered to a custom model subset (P1)

As a researcher reviewing analysis results, I need to select a subset of models from a checklist so that all three analysis tabs show only the chosen models.

**Why P1**: The whole feature is this story. Without it there is no filter.

**Acceptance Scenarios**:

1. **Given** an analysis with 5 models, **When** I open the filter and uncheck 2 models, **Then** the Overview, Decisions, and Conditions tabs all show only the 3 checked models.
2. **Given** the filter is open, **When** all transcript-bearing models are checked, **Then** the header reads "Default" and no "Reset to default" link appears.
3. **Given** some models are unchecked, **When** I click "Reset to default", **Then** all transcript-bearing models become checked again.
4. **Given** 0 models are selected, **When** any tab is active, **Then** a warn state is visible and the tabs show an appropriate empty/warn message.

### US-2 — Distinguish models with transcripts from models without (P2)

As a researcher, I need to see which models have transcripts for this run so I know which ones have usable data.

**Why P2**: Useful for clarity, but the feature works without it.

**Acceptance Scenarios**:

1. **Given** the filter is open, **When** I look at the checklist, **Then** transcript-bearing models appear above a divider, checked and enabled; models with no transcripts appear below, dimmed and unchecked by default.
2. **Given** the filter is open, **When** I inspect a row, **Then** I see: checkbox · model name · provider · transcript count (or "no transcripts").

### US-3 — Collapsed state labels (P2)

As a researcher, I need to see at a glance whether I am looking at the full default set or a custom subset so I can tell when the view is filtered.

**Why P2**: Completes the UX, but the open/select/close flow works without it.

**Acceptance Scenarios**:

1. **Given** the default set is selected, **When** the filter is collapsed, **Then** the header shows a "Default" label and a "▾ Change" button.
2. **Given** a custom subset is selected, **When** the filter is collapsed, **Then** the header shows "N of M" (e.g., "7 of 15") plus a "Reset to default" link and "▾ Change" button.

## Edge Cases

- 0 models selected → warn badge in collapsed header; each tab shows a "no models selected" message rather than an empty table.
- All models have no transcripts (edge run) → all rows are dimmed; default set is empty; filter starts in open state.
- Models list changes (e.g., after analysis recompute) → filter state reconciles: remove models no longer present, keep checked state for still-present models, reset to default if selection goes empty.
- PivotAnalysisTable (single-model pivot) passes its own single-model picker that already exists; the global filter should filter the set of models available to that picker (i.e. only models in selectedModels appear as choices).
- ConditionDecisionsTable has its own internal model selector; replace it with the global selected models passed via props.

## Functional Requirements

- **FR-001**: A `ModelFilterBar` component MUST render above the tab bar inside `AnalysisPanel`.
- **FR-002**: The filter state (selected model IDs) MUST be owned by `AnalysisPanel` and passed down to all three tabs.
- **FR-003**: The filter MUST default to the set of models that have at least one transcript (derived from `perModel` keys).
- **FR-004**: The filter MUST show a "Default" label when the selection equals the default set.
- **FR-005**: The filter MUST show "N of M" when the selection is a strict subset of the full model list.
- **FR-006**: A "Reset to default" link MUST restore the default set.
- **FR-007**: Models with no transcripts MUST be separated below a divider in the checklist.
- **FR-008**: The `ConditionDecisionsTable` internal model picker MUST be replaced by the externally passed `selectedModels` prop.
- **FR-009**: The `PivotAnalysisTable` internal model picker MUST limit its choices to the externally passed `selectedModels`.
- **FR-010**: No `@ts-ignore`; TypeScript must compile cleanly.

## Success Criteria

- **SC-001**: Changing the filter selection changes the visible data in all three tabs without a page reload.
- **SC-002**: `npm run build --workspace @valuerank/web` passes with no errors.
- **SC-003**: `npm run lint --workspace @valuerank/web` passes with no warnings or errors.
- **SC-004**: `npm run test --workspace @valuerank/web` passes (any new tests pass, existing tests unbroken).

## Constraints

- TypeScript only; no `@ts-ignore`.
- Only modify files under `cloud/apps/web/src/`.
- Do not push or open a PR.
- Keep existing behaviour when `selectedModels` is the full set (no regression for existing users).

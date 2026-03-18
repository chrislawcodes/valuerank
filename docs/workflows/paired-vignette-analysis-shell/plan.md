# Plan

## Implementation Strategy

Build one shared analysis shell and let it accept a scope object:

- `single vignette`
- `paired vignette`

The shell should own the toggle, load the right data shape, and pass a normalized view model into the existing charts and drilldown components.

The key idea is:

- single mode = current analysis behavior
- paired mode = the same analysis behavior, but the data is pooled across a matched vignette pair before the summary view renders
- paired pooling must be defined once in a shared adapter so the summary, charts, and drilldown all consume the same scoped model

## Staged Rollout

We will ship this in small stages so a user can verify the direction at each step.

### Stage 1: Shell and mode state

- add the `Single vignette` / `Paired vignettes` toggle
- persist the mode in the URL so it survives refresh and can be shared
- keep the current analysis data and rendering behavior unchanged
- verify that the page clearly indicates which mode is active

### Stage 2: Pair-aware data loading

- load both vignette versions when paired mode is selected
- keep the single-vignette path unchanged
- expose a shared scoped model that records version provenance
- verify that both versions are visible before any pooling logic changes

### Stage 3: Pooled summary view

- pool the paired data for top-level summary metrics
- keep version-level drilldown available
- make sure pooled counts and rates are derived from one shared adapter
- verify that the paired summary matches the combined evidence the user expects to see

### Stage 4: Component adaptation

- teach the summary cards, decision squares, and transcript drilldown to read from the scoped model
- add explicit provenance labels or version badges where they reduce ambiguity
- keep reusable components shared between single and paired modes wherever possible
- verify that switching modes changes scope, not just copy

### Stage 5: Tests and rollout cleanup

- add regression coverage for single mode, paired mode, URL persistence, and drilldown
- decide whether legacy entry points remain visible during rollout
- make the new shell the primary path once users confirm the behavior is right
- keep legacy paths labeled clearly if they remain available

## Proposed Slices

### Slice 1: Shared analysis shell

- add a top-level mode toggle to the analysis page
- define a shared analysis scope model
- route the page so mode can be persisted and shared via the URL
- keep the current single-vignette behavior as the default entry point
- define a canonical URL schema for the shell, including mode and the selected vignette or pair identifier

### Slice 2: Paired-data adapter

- define how a matched pair is represented in the frontend
- build a pooled view model for paired mode
- preserve source-version provenance for drilldown
- keep the existing single-vignette model untouched
- spell out how pooled counts, pooled summaries, and version-specific drilldown rows are derived

### Slice 3: Component reuse

- adapt summary cards, decision squares, and transcript drilldown to read from the scoped model
- reuse the existing analysis tabs where possible
- add clear version badges or provenance labels in paired mode
- decide which visualizations stay pooled and which ones need a source-version breakdown or hover detail

### Slice 4: Entry points and labels

- update page labels so the experience reads as vignette analysis
- remove validation-specific framing where it distracts from the analysis task
- make sure job-choice or paired vignette runs can open the shared shell directly
- keep any legacy validation entry points clearly labeled as legacy, not as the primary route for the new shell

### Slice 5: Verification

- add tests for single mode
- add tests for paired mode
- add tests that the toggle changes scope rather than only changing text
- add regression coverage for drilldown and direct linking

## Current Status

Stage 1, Stage 2, and Stage 3 are implemented in the analysis shell page. The primary single/paired toggle now lives in the analysis panel header on the `/analysis/:id` run detail page, and the selected mode is preserved in the URL. The older assumptions-page entry point is now legacy-only, and the analysis header no longer includes the Excel/OData export actions. The remaining stages are planned only.

Stage 4 is complete: `buildPairedScopeContext` in `utils/pairedScopeAdapter.ts` derives a `PairedScopeContext` from `varianceAnalysis.orientationCorrectedCount`. AnalysisPanel computes this via `useMemo` and drives: (1) a 6th "Orientation Pairs" stat card when `hasOrientationPairing`, (2) `AnalysisScopeBanner` below the header in any mode, (3) propagation of `analysisSearchParams` to all transcript drilldown navigate() calls in OverviewTab and StabilityTab. OverviewTab shows a paired scope note; StabilityTab shows an orientation-pooling banner explaining canonical A-first ordering.

Stage 5 cleanup has started: paired-mode direct links now preserve mode into the overview repeat-pattern drilldown and transcript viewer routes, and the legacy validation entry points stay visible but clearly labeled during rollout.

## Verification Expectations

- single mode should behave like the current vignette analysis experience
- paired mode should show both vignette versions before pooling changes land
- paired mode should keep version provenance visible for every loaded pair
- paired mode should expose pooled summary cards before the detailed pair cards
- transcript drilldown should still work from both modes
- the toggle state should survive refresh or direct navigation
- stage 1 should only change shell state and labels, not the underlying analysis results

## Open Questions

- Should the mode live in the URL, the page state, or both? The plan currently assumes URL-backed mode state.
- Should paired mode default to pooled summaries with separate version drilldown, or should it show both versions side by side by default?
- Should the shared shell replace the legacy validation page entirely, or sit alongside it during the transition?
- Which charts should remain pooled-only in paired mode, and which need explicit version-level overlays or drilldowns?

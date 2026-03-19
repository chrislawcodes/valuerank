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

### Stage 6: Orientation split inspection

- keep the pooled paired summary as the default paired-mode view
- add a way to inspect the two value orders separately
- preserve orientation provenance through matrices, summaries, and drilldown
- make sure the split view proves the pooled result is still correct

### Stage 7: Paired decision-frequency scope

- make the Overview tab's Decision Frequency table use both companion runs in paired mode
- keep pooled counts as the default paired readout
- route split clicks to the correct order-specific run and pooled clicks to a merged transcript view
- verify that table counts and transcript drilldown use the same bucket logic

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

### Slice 6: Orientation split inspection

- define the split-inspection UX for paired mode
- preserve orientation provenance through the shared analysis model
- surface split rows or drilldown where the user needs to verify pooled behavior
- keep the pooled summary visible so the user can compare split and pooled views

## Current Status

Stage 1, Stage 2, and Stage 3 are implemented in the analysis shell page. The primary single/paired toggle now lives in the analysis panel header on the `/analysis/:id` run detail page, and the selected mode is preserved in the URL. The older assumptions-page entry point is now legacy-only, and the analysis header no longer includes the Excel/OData export actions. The remaining stages are planned only.

Stage 4 is complete in its refined form: `buildPairedScopeContext` in `utils/pairedScopeAdapter.ts` still derives paired-orientation metadata from `varianceAnalysis.orientationCorrectedCount`, but the top-of-page UI no longer surfaces that as a dedicated scope banner or stat card. Instead, AnalysisPanel keeps the paired plumbing in the shared adapter and transcript routing, while the visible header is trimmed down to a `Details` toggle that reveals decision coverage plus evidence context only when the user asks for it. The explicit paired explanation now lives in the places where it affects interpretation, such as the Stability tab and the paired comparison surfaces, rather than as a permanent banner above the whole page.

Stage 5 cleanup has started: paired-mode direct links now preserve mode into the overview repeat-pattern drilldown and transcript viewer routes, and the legacy validation entry points stay visible but clearly labeled during rollout.

Stage 6 is complete for the first split-inspection slice: paired mode now keeps the pooled summary as the default, while the Overview and Stability tables offer a split inspection mode that labels each bucket by its actual value order. Split drilldown routes now preserve `orientationBucket`, and the transcript page filters and labels the active orientation bucket so the pooled result can be verified directly.

Stage 6 label clarity is now implemented too: split inspection, transcript drilldown, run-launch messaging, and stored job-choice vignette names now derive orientation labels from the definition content so users see concrete value-order labels like `Freedom -> Harmony` instead of abstract `A-first` / `B-first` wording.

Stage 7 evolved during implementation: the old Overview Decision Frequency table was made pair-aware first, then removed once the top paired comparison table took over that role more cleanly.

The paired comparison table has also been refined: the redundant delta column has been removed, blended sensitivity columns now appear alongside the pooled counts, and sensitivity calculations now share a single helper with the remaining paired summary surfaces so the numbers stay aligned.

Stage 8 is complete for the Overview Summary slice: in paired mode, the Overview Summary table now truly pools both companion analyses instead of only changing its framing text. Preferred value, preference strength, and value agreement now come from a pooled paired semantics builder, the repeat-pattern percentages are merged across both companion runs, and the helper text now says when the summary is pooled across companion runs. Pooled repeat-pattern cells are summary-only for now, because a true merged repeat-pattern transcript drilldown has not shipped yet.

The analysis header cleanup is now shipped too: the always-visible cards for models, total trials, status, orientation pairs, and paired vignette scope have been removed. Decision coverage now lives behind the `Details` control beside `Analysis`, and the same panel includes the batch/source-run evidence summary so the debugging context is available without crowding the main view.

The paired overview integration slice is now shipped as well: the paired run comparison is embedded beneath the Overview Summary table inside the same card, and the Condition Decisions table now uses a real merged paired condition scope in pooled mode instead of reading just the current run. That means paired mode behaves more like single-vignette mode with an expanded summary surface, while the transcript drilldown now distinguishes between blended condition clicks and split-by-order condition clicks.

## Verification Expectations

- single mode should behave like the current vignette analysis experience
- paired mode should show both vignette versions before pooling changes land
- paired mode should keep version provenance visible for every loaded pair
- paired mode should expose pooled summary cards before the detailed pair cards
- paired mode should let the user inspect the two value orders separately when they need to verify the pool
- transcript drilldown should still work from both modes
- the toggle state should survive refresh or direct navigation
- stage 1 should only change shell state and labels, not the underlying analysis results

## Open Questions

- Should the mode live in the URL, the page state, or both? The plan currently assumes URL-backed mode state.
- Should paired mode default to pooled summaries with separate version drilldown, or should it show both versions side by side by default?
- Should the shared shell replace the legacy validation page entirely, or sit alongside it during the transition?
- Which charts should remain pooled-only in paired mode, and which need explicit version-level overlays or drilldowns?

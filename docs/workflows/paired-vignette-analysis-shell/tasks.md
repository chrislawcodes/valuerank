# Tasks

## Current Status

Stage 1 shell work, Stage 2 pair-aware loading, and Stage 3 pooled summary cards are implemented. The single/paired mode toggle now lives in the analysis panel header on the `/analysis/:id` run detail page, the older assumptions page no longer exposes that control, and the header export actions have been removed. Stage 5 cleanup has started with direct-link and transcript drilldown coverage in both modes, while the deeper scoped-data adapter work remains in progress. Gemini review completed with follow-up refinements folded into the spec and plan.

Stage 4 is complete: the `buildPairedScopeContext` adapter derives `PairedScopeContext` from `varianceAnalysis.orientationCorrectedCount`. In paired mode, the panel shows an "Orientation Pairs" stat card and an `AnalysisScopeBanner`. OverviewTab shows a scope note; StabilityTab shows an orientation-pooling banner when `hasOrientationPairing` is true. All transcript drilldown calls in OverviewTab and StabilityTab now propagate `analysisSearchParams` to preserve `?mode=paired`.

Stage 6 is shipped for the first split-inspection slice: paired mode now keeps pooled summary behavior by default, while Overview and Stability expose a split inspection path and transcript drilldown preserves the chosen orientation bucket. The user-facing labels now come from the actual value order shown in the vignette instead of abstract `A-first` / `B-first` names.

Stage 7 is shipped for the Overview Decision Frequency slice: paired mode now uses both companion runs for that table, pooled count drilldown opens a merged transcript view across both orders, and split rows route to the correct order-specific run instead of pretending one run contains the whole pair.

The paired comparison table refinement is shipped too: it now surfaces blended sensitivity instead of a delta column, and the shared sensitivity helper gives both the top comparison table and the lower Decision Frequency table the same fallback behavior when condition axes are categorical labels instead of raw numbers.

## Task List

- [x] Define the feature goal and user problem
- [x] Choose the shared analysis-shell approach
- [x] Create workflow artifacts for spec, plan, and tasks
- [x] Confirm whether the toggle state should live in the URL, local state, or both
- [x] Define the paired-vignette data shape for pooled analysis
- [x] Identify the existing analysis components that can be reused unchanged
- [x] Identify the components that need scope-aware adapters
- [x] Add single-mode and paired-mode regression tests
- [x] Verify direct links and transcript drilldown still work in both modes
- [x] Decide whether the legacy validation page stays visible during rollout
- [x] Require URL-backed mode state for shareable analysis views
- [x] Ship stage 1 shell toggle with URL-backed mode state
- [x] Ship stage 2 pair-aware loading with paired vignette evidence preview
- [x] Ship stage 3 pooled summary cards for paired mode
- [x] Ship stage 4 component adaptation for scoped analysis surfaces
- [x] Remove Excel/OData header actions from the analysis page
- [x] Define the split-inspection UX for paired mode
- [x] Preserve orientation provenance through the shared analysis model
- [x] Add split rows or drilldown so pooled paired results can be inspected independently
- [x] Label split inspection and run-launch UI with actual value order names
- [x] Store job-choice paired vignette names with actual value order suffixes
- [x] Make the Overview Decision Frequency table use both companion runs in paired mode
- [x] Make pooled Decision Frequency clickthrough open a merged transcript view across both orders
- [x] Route split Decision Frequency clickthrough to the correct order-specific run
- [x] Replace the paired comparison delta column with blended sensitivity columns
- [x] Share sensitivity calculation logic between the paired comparison table and Decision Frequency

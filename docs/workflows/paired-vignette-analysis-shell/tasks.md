# Tasks

## Current Status

Stage 1 shell work, Stage 2 pair-aware loading, and Stage 3 pooled summary cards are implemented. The single/paired mode toggle now lives in the analysis panel header on the `/analysis/:id` run detail page, the older assumptions page no longer exposes that control, and the header export actions have been removed. Stage 5 cleanup has started with direct-link and transcript drilldown coverage in both modes, while the deeper scoped-data adapter work remains in progress. Gemini review completed with follow-up refinements folded into the spec and plan.

Stage 4 is complete in its cleaned-up form: the `buildPairedScopeContext` adapter still derives `PairedScopeContext` from `varianceAnalysis.orientationCorrectedCount`, but the top-of-page paired framing has been simplified. The old "Orientation Pairs" stat card, `AnalysisScopeBanner`, and paired scope note have been removed from the main surface. Instead, AnalysisPanel now keeps only a lightweight `Details` toggle that reveals decision coverage plus evidence/batch context on demand, while StabilityTab continues to use the paired scope context where it actually affects interpretation.

Stage 6 is shipped for the first split-inspection slice: paired mode now keeps pooled summary behavior by default, while Overview and Stability expose a split inspection path and transcript drilldown preserves the chosen orientation bucket. The user-facing labels now come from the actual value order shown in the vignette instead of abstract `A-first` / `B-first` names.

Stage 7 evolved during implementation: the Overview Decision Frequency table was made pair-aware first, then removed once the top paired comparison table became the clearer paired inspection surface.

The paired comparison table refinement is shipped too: it now surfaces blended sensitivity instead of a delta column, and the shared sensitivity helper gives the paired summary surfaces the same fallback behavior when condition axes are categorical labels instead of raw numbers.

Stage 8 is shipped for the Overview Summary slice: paired mode now truly pools the overview summary across both companion runs. The overview table uses pooled paired semantics for preferred value, preference strength, and value agreement, and it merges repeat-pattern percentages across both companion runs instead of silently reading just the current run. Pooled repeat-pattern cells are summary-only for now until a merged repeat-pattern transcript drilldown is added.

The next overview cleanup slice is shipped too: the paired run comparison now lives underneath the Overview Summary table inside the same card, so paired mode behaves more like the single-vignette page with extra inspection detail folded into the summary surface. The Condition Decisions table now uses a real merged paired condition scope in pooled mode, and pooled/split condition clickthrough routes carry enough context to open the correct blended or order-specific transcript list.

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
- [x] Make the Overview Summary table respect single vs paired mode
- [x] Pool paired overview repeat-pattern percentages across both companion runs
- [x] Disable misleading repeat-pattern clickthrough from pooled overview summary cells until merged drilldown exists
- [x] Replace the old analysis header cards with a compact `Details` panel for decision coverage and evidence
- [x] Remove paired scope copy from the main overview surface
- [x] Move the paired run comparison underneath the Overview Summary table inside the same card
- [x] Make pooled Condition Decisions merge both companion runs before calculating mean cells
- [x] Route pooled and split Condition Decisions clickthrough to the correct blended or order-specific transcript sets

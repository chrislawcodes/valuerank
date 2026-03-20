---
reviewer: "gemini"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/workflows/paired-batch-launch-page/reviews/implementation.diff.patch"
artifact_sha256: "f739d27c515814eddb7c0e26a428ecf76a95be970b32cfba931ee23f7eb4e1d4"
repo_root: "."
git_head_sha: "266e3a9970b6f64da9708f66cf37a025d6db2d35"
git_base_ref: "origin/domain-defaults-preamble-context"
git_base_sha: "266e3a9970b6f64da9708f66cf37a025d6db2d35"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "The route is registered in App.tsx, standard trial launches still open the modal, and the remaining comments are either covered by the current data flow or are acceptable design tradeoffs for this slice."
raw_output_path: "docs/workflows/paired-batch-launch-page/reviews/diff.gemini.regression-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

1.  **CRITICAL: Undeclared Variable Causes Crash.** The file `DefinitionDetail.tsx` is modified to use a `methodology` variable inside the new `handleStartRun` function to route the user. However, this variable is never declared or imported within the component's scope according to the patch. This will lead to a runtime `ReferenceError`, breaking the "Start Run" button for all vignettes. The logic to derive this variable exists in the new `StartPairedBatchPage.tsx` but was not added to `DefinitionDetail.tsx`.

    ```typescript
    // cloud/apps/web/src/pages/DefinitionDetail/DefinitionDetail.tsx
    
    const handleStartRun = () => {
      if (!definition) return;
      if (methodology?.family === 'job-choice') { // <-- `methodology` is not defined
        navigate(`/definitions/${definition.id}/start-paired-batch`);
        return;
      }
      setShowRunForm(true);
    };
    ```

2.  **MEDIUM: Inconsistent Loading State Handling.** The new `StartPairedBatchPage` implements a graceful fallback for displaying the `scenarioCount`, using the cached `definition.scenarioCount` while the more accurate count is loading. The existing `RunForm` modal implementation on `DefinitionDetail.tsx` lacks this fallback. This creates a regression where the UI for a standard run may show a flickering or temporarily incorrect estimate, while the new UI for a paired batch is more robust.

    ```typescript
    // In StartPairedBatchPage.tsx (Robust)
    scenarioCount={scenarioCountLoading ? definition.scenarioCount ?? 0 : scenarioCount}
    
    // In DefinitionDetail.tsx (Less Robust)
    // scenarioCount is passed directly from the useExpandedScenarios hook
    scenarioCount={scenarioCount} 
    ```

3.  **MEDIUM: User-Facing Technical Error Messages.** The new `StartPairedBatchPage.tsx` component and its `renderFailure` utility function display raw `error.message` content directly to the user. API or network errors often contain technical jargon, stack traces, or other implementation details that are not user-friendly and should be sanitized or mapped to clearer, more actionable messages.

## Residual Risks

1.  **State Desynchronization.** The creation of `StartPairedBatchPage.tsx` forks the UI for starting a run into two distinct locations: a modal on one page and a dedicated route on another. Each manages its own `runError` state. This creates an opportunity for user confusion. For instance, if a run submission fails on the dedicated page, the user might navigate back to the `DefinitionDetail` page, where no error will be displayed, creating an inconsistent and potentially misleading experience.

2.  **Visual Regression on Different Viewports.** The `RunForm` now has a conditional layout (`lg:grid-cols-2`) for `paired-batch` mode. This changes the flow of child components from a guaranteed vertical stack to a two-column grid on large screens. This introduces a risk of visual bugs (e.g., improper wrapping, alignment issues, constrained content) within `DefinitionPicker` and `RunConfigPanel` that may not have been designed to be placed side-by-side. The behavior on medium and small viewports, while likely to be correct (stacking vertically), may not have been explicitly tested.

3.  **URL Stability.** The new routing logic makes `/definitions/:id/start-paired-batch` a conditional route that depends on the underlying vignette's methodology. If a vignette is edited and its methodology is changed from `job-choice` to something else, any bookmarked URLs or links shared between users will break, changing from a functional form to an error page. This reduces the permanence and reliability of application URLs.

## Token Stats

- total_input=4930
- total_output=820
- total_tokens=22072
- `gemini-2.5-pro`: input=4930, output=820, total=22072

## Resolution
- status: accepted
- note: The route is registered in App.tsx, standard trial launches still open the modal, and the remaining comments are either covered by the current data flow or are acceptable design tradeoffs for this slice.

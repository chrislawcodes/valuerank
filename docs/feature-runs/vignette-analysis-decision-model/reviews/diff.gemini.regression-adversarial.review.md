---
reviewer: "gemini"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/feature-runs/vignette-analysis-decision-model/reviews/implementation.diff.patch"
artifact_sha256: "9704d12332dfcd72279479f2c1a67ce8f1dd72e08947f46f39febaccb339e45f"
repo_root: "."
git_head_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
generation_method: "gemini-cli"
resolution_status: "deferred"
resolution_note: "Deferred as intentional surface-level behavior for the report slice. The plan requires one decision model per surface during migration, so mixed conditions stay legacy until the whole surface can move to V2 without ad hoc mixing."
raw_output_path: "docs/feature-runs/vignette-analysis-decision-model/reviews/diff.gemini.regression-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

Ordered by severity.

### 1. UI State Flicker and Inconsistent Display

When a user clicks a condition, the `transcriptsForCondition` data is fetched asynchronously. This creates a user-facing flicker and a temporary state inconsistency:

1.  **Initial State:** The `normalizedTranscripts` array is empty. `reportDecisionDisplayMode` defaults to `'legacy'`. The table header is rendered as "Decision".
2.  **Data Fetching:** The transcript query begins. The table remains in the legacy state.
3.  **Data Arrival:** The query completes. The component re-renders with `normalizedTranscripts` populated. `reportDecisionDisplayMode` is recalculated.
4.  **UI Flicker:** If the new data is fully V2, the mode switches to `'audit'`, and the table header abruptly changes from "Decision" to "Canonical decision".

This creates a jarring user experience and could be perceived as a bug. The UI should ideally wait for the data and render the correct table structure in a single, stable paint.

### 2. Unverified Dependency on `TranscriptViewer`

The diff introduces a new prop, `decisionDisplayMode`, which is passed to the `<TranscriptViewer />` component. However, the changes to `TranscriptViewer` to consume this prop are not included in the artifact. The new test file explicitly mocks this component, hiding its actual behavior.

This represents a critical, unverified dependency. If the `TranscriptViewer` component has not been updated to correctly interpret the `decisionDisplayMode` prop, this feature is incomplete and will fail to render decisions correctly inside the viewer modal, even if the main table view is correct.

### 3. Fragile Dependency on Unseen Utility Functions

The entire display logic hinges on two imported functions whose implementation is not provided:
*   `hasTranscriptDecisionModelV2`: The `every()` check relies entirely on this type guard. If it has a flaw (e.g., doesn't properly check for `null` vs `undefined`, or for empty objects), the `reportDecisionDisplayMode` will be calculated incorrectly.
*   `formatCanonicalDecisionHeadline`: This function is called directly in the render path. If it encounters a malformed `decisionModelV2` object (e.g., missing a `canonical` key) and throws an error, it will crash the entire component because it is not wrapped in any error boundary.

This makes the component fragile and susceptible to runtime errors based on data shape variations that may not have been considered.

### 4. Incomplete Test Coverage

The new test file `DomainAnalysisValueDetail.test.tsx` is a valuable addition, but it fails to cover several key scenarios:

*   **Empty/Null Data:** No test exists for the case where the `domainAnalysisConditionTranscripts` query returns an empty array or `null`. While the code appears to handle this by defaulting to `'legacy'` mode, this behavior is not locked in with a test and could be subject to future regressions.
*   **Pure Legacy Data:** The tests cover a "mixed" V1/V2 scenario but not a "pure" V1/legacy scenario where no transcripts have the `decisionModelV2` field.
*   **UI Flicker:** The tests validate the final state of the DOM but do not assert the initial state during data fetching, so the UI flicker regression is not captured.

## Residual Risks

*   **Incomplete Feature Implementation:** The most significant risk is that the feature is only half-complete. The changes in `DomainAnalysisValueDetail` may be correct, but if the required changes in `TranscriptViewer` are missing or flawed, the user will still see incorrect or legacy data when they click to view a transcript, defeating the purpose of the change.
*   **Data-Driven Crashes:** The component is now vulnerable to runtime errors if the `decisionModelV2` object from the API ever deviates from the exact structure expected by `formatCanonicalDecisionHeadline`. This is a brittle implementation that assumes perfect and consistent data from the backend.
*   **UX Regression:** The UI flicker risk remains. Even if functionally correct, this lack of polish can erode user trust and give the impression of a buggy interface.

## Token Stats

- total_input=4316
- total_output=888
- total_tokens=19384
- `gemini-2.5-pro`: input=4316, output=888, total=19384

## Resolution
- status: deferred
- note: Deferred as intentional surface-level behavior for the report slice. The plan requires one decision model per surface during migration, so mixed conditions stay legacy until the whole surface can move to V2 without ad hoc mixing.

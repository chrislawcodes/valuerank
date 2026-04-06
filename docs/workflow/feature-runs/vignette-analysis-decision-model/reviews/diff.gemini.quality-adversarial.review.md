---
reviewer: "gemini"
lens: "quality-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/vignette-analysis-decision-model/reviews/implementation.diff.patch"
artifact_sha256: "a68dc461e1f1278a53ce73b76ff5ef57ca5797c5e92e83e99ff1169af1db69ee"
repo_root: "."
git_head_sha: "456f0e7bae9ca9995c6be5d986662cf1fb66cd74"
git_base_ref: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
git_base_sha: "a6e5c2470e67aaee16564cabf4a43c226c61498d"
generation_method: "gemini-cli"
resolution_status: "deferred"
resolution_note: "Deferred as intentional report-level consistency. The surface keeps one decision mode per report view, and mixed conditions remain legacy until the condition is fully V2-backed."
raw_output_path: "docs/workflow/feature-runs/vignette-analysis-decision-model/reviews/diff.gemini.quality-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff quality-adversarial

## Findings

Ordered by severity.

### 1. High-Reliance on Untested Utility Functions

The most significant adversarial finding is that the change's correctness and stability are critically dependent on two imported utility functions, `hasTranscriptDecisionModelV2` and `formatCanonicalDecisionHeadline`, whose implementations are not provided in this diff.

-   **`formatCanonicalDecisionHeadline` Brittleness:** The rendering logic for the new 'audit' mode relies entirely on this function to not throw an error. The tests only validate its output for a single, ideal input. If the `decisionModelV2.canonical` object has an unexpected structure (e.g., missing `favoredValueKey`, different `direction` enum) for a different transcript, this function could crash the entire page.
-   **`hasTranscriptDecisionModelV2` Type Safety:** The logic `normalizedTranscripts.every(hasTranscriptDecisionModelV2)` correctly determines the display mode. However, for maximum type safety, `hasTranscriptDecisionModelV2` should be implemented as a TypeScript type guard (`transcript is Transcript & { decisionModelV2: object }`). Without this, the compiler cannot guarantee that `transcript.decisionModelV2` is non-null inside the rendering block, potentially hiding type-related bugs.

### 2. Incomplete Test Coverage for Edge Cases and Errors

The newly added tests are good, covering the happy paths for "fully V2" and "mixed V1/V2" data. However, they omit several adversarial cases:

-   **API Error State:** The tests do not simulate a scenario where the `DOMAIN_ANALYSIS_CONDITION_TRANSCRIPTS_QUERY` returns an error. In this case, the UI will likely fail silently, showing an empty and indefinite loading state or an empty table, without informing the user that data fetching failed.
-   **Empty Data State:** There is no test for when a condition is selected and the API successfully returns an empty array of transcripts (`[]`). While the code appears to handle this by simply rendering nothing, a dedicated test is required to confirm this behavior and prevent future regressions.

### 3. All-Legacy Scenario is Assumed, Not Asserted

While the "mixed V1/V2" test case correctly passes `'legacy'` to the `TranscriptViewer`, it does not explicitly assert that the column header remains `"Decision"` and the cell content is the raw `decisionCode`. This behavior is inferred but not guaranteed by an assertion, weakening the test's robustness for the all-legacy scenario.

## Residual Risks

-   **UI Crash on Unhandled Data Variants:** The primary residual risk is a runtime crash in production. If a transcript contains a `decisionModelV2` payload with a data shape that `formatCanonicalDecisionHeadline` was not designed to handle, the component will crash when a user clicks on a condition containing that transcript. This risk is elevated because the utility's implementation is not under review.
-   **User Confusion from Silent Failures:** If the transcript-fetching API call fails, the user will see an empty list with no explanation. This could lead them to incorrectly conclude there are no transcripts for that condition, rather than understanding there was a network or server error.
-   **Inconsistent State from Partial Loading:** The current implementation fetches all transcripts for a condition at once. If this query were to become paginated in the future without updating the display mode logic, the `reportDecisionDisplayMode` could be calculated based on only the first page of results. This could incorrectly set the mode to `'audit'` when subsequent pages contain legacy transcripts, leading to inconsistent UI and potential rendering errors.

## Token Stats

- total_input=4327
- total_output=759
- total_tokens=19720
- `gemini-2.5-pro`: input=4327, output=759, total=19720

## Resolution
- status: deferred
- note: Deferred as intentional report-level consistency. The surface keeps one decision mode per report view, and mixed conditions remain legacy until the condition is fully V2-backed.

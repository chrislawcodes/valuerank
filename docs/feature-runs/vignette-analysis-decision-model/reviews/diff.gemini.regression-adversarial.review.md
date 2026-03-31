---
reviewer: "gemini"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/feature-runs/vignette-analysis-decision-model/reviews/implementation.diff.patch"
artifact_sha256: "a68dc461e1f1278a53ce73b76ff5ef57ca5797c5e92e83e99ff1169af1db69ee"
repo_root: "."
git_head_sha: "456f0e7bae9ca9995c6be5d986662cf1fb66cd74"
git_base_ref: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
git_base_sha: "a6e5c2470e67aaee16564cabf4a43c226c61498d"
generation_method: "gemini-cli"
resolution_status: "deferred"
resolution_note: "Deferred as intentional report-level consistency. The surface keeps one decision mode per report view, and mixed conditions remain legacy until the condition is fully V2-backed."
raw_output_path: "docs/feature-runs/vignette-analysis-decision-model/reviews/diff.gemini.regression-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

1.  **All-or-Nothing UI Downgrade:** The implementation uses an `every()` check to determine the `reportDecisionDisplayMode`. This creates an "all-or-nothing" scenario where the entire transcript table's "Decision" column is downgraded to the legacy format (`decisionCode`) if even a single transcript in the set lacks the V2 data model. This forces a loss of information for the user, as 99 transcripts with rich V2 data will be displayed in the legacy format just because one is missing it. The UI should instead determine the display format on a row-by-row basis to present the best available information for each transcript.

2.  **Brittle Data Contract:** The logic decides to use the `'audit'` display mode based solely on the *presence* of the `decisionModelV2` object. It then unconditionally calls `formatCanonicalDecisionHeadline(transcript)`, assuming the *internal structure* of that object is valid. If an edge case produces a `decisionModelV2` object that is present but malformed (e.g., missing the `canonical` property), the `formatCanonicalDecisionHeadline` function is likely to throw an error and crash the component. The condition for switching the UI mode should be as robust as the function that consumes the data.

3.  **Incomplete Test Coverage:** The new tests validate the "all V2" and "mixed V1/V2" scenarios. However, they fail to cover the edge case where a condition is selected and the API returns an empty array of transcripts. While the current logic appears to handle this state without crashing, it remains an untested path.

## Residual Risks

1.  **`TranscriptViewer` Behavior Unknown:** The component passes the `decisionDisplayMode` prop to the `TranscriptViewer`. The provided test mocks this child component, so we cannot verify that `TranscriptViewer` correctly handles the `'audit'` vs `'legacy'` modes. A risk remains that the viewer component itself does not implement the divergent display logic correctly or contains similar flaws.

2.  **Implicit Trust in Utilities:** The change relies on utility functions (`formatCanonicalDecisionHeadline`, `hasTranscriptDecisionModelV2`) whose source code is not in the diff. The component's stability is fully dependent on the robustness of these external functions. If `formatCanonicalDecisionHeadline` is not written defensively to handle unexpected or null values within the `decisionModelV2` object, it remains a potential crash point.

## Token Stats

- total_input=16343
- total_output=516
- total_tokens=19194
- `gemini-2.5-pro`: input=16343, output=516, total=19194

## Resolution
- status: deferred
- note: Deferred as intentional report-level consistency. The surface keeps one decision mode per report view, and mixed conditions remain legacy until the condition is fully V2-backed.

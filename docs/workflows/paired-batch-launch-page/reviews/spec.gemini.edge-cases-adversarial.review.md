---
reviewer: "gemini"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflows/paired-batch-launch-page/spec.md"
artifact_sha256: "32945ca02fd168436365ca17503865711f81cb26d8bba03bff19f04c1f41f4cc"
repo_root: "."
git_head_sha: "266e3a9970b6f64da9708f66cf37a025d6db2d35"
git_base_ref: "origin/domain-defaults-preamble-context"
git_base_sha: "266e3a9970b6f64da9708f66cf37a025d6db2d35"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "The tasks now spell out the direct-route flow, invalid-route and eligibility handling, dead modal cleanup, and the exact verification commands that were run."
raw_output_path: "docs/workflows/paired-batch-launch-page/reviews/spec.gemini.edge-cases-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

1.  **Critical Semantic Dissonance in Core Control:** The spec mandates renaming `Trial Size` to `Batch Size` while leaving the underlying control mapped to `samplePercentage`. This introduces a severe usability flaw. A user will naturally interpret "Batch Size" as a discrete count (e.g., 10 runs), not a percentage of a larger set. The spec acknowledges this as a risk but dramatically undervalues its severity. The proposed mitigation—to "include enough context"—is too vague and insufficient for a core configuration setting. This ambiguity will lead to user error and misconfigured launches.
2.  **Fragile and Implicit `PRODUCTION` Categorization:** The spec defers the critical business rule of classifying paired batches as `PRODUCTION` to an "existing server-side paired-batch category fix". This creates a fragile, implicit dependency. A robust system would not rely on a server-side heuristic that is disconnected from the client's explicit intent. The mutation path should be updated to accept an explicit parameter (e.g., `launchIntent: 'PAIRED_BATCH'`) to make this logic auditable and durable, removing the dependency on a legacy "fix".
3.  **Undefined State and Error Handling for a Route-Driven Page:** The spec fails to account for edge cases inherent to a dedicated page that were not present in a modal context:
    *   **Loading State:** Upon navigating to `/vignette/{id}/launch`, the page must fetch the vignette's name. The spec does not define the page's appearance during this fetch, nor the behavior if the fetch fails.
    *   **Authorization vs. Existence:** The spec requires handling for an "invalid definition ID" (implying a 404 Not Found) but completely omits the case where the ID is valid but the user is not authorized to view it (a 403 Forbidden error). These are different scenarios that require distinct user feedback.
    *   **Form State Preservation:** An acceptance criterion requires preserving form inputs on navigation or mutation failure, but this is a non-trivial requirement. The spec provides no direction on implementation (e.g., via URL state, session storage, or lifted React state), which is a significant omission given the constraint of reusing the existing `RunForm`.
4.  **Assumption of Universal Vignette Eligibility:** The spec presumes any vignette is valid for a paired-batch launch. It does not consider states or types of vignettes (e.g., drafts, archived, or those lacking required metadata) where a launch should be disallowed. The system should prevent the user from reaching this page for an ineligible vignette, and the page itself must render a specific error if navigated to directly with an ineligible ID.

## Residual Risks

1.  **`RunForm` Encapsulation Risk:** By scoping out changes to the underlying `RunForm`, the project accepts the risk that this component is not well-suited for the new requirements (e.g., flexible layout, external state preservation). This could lead to a brittle implementation that uses complex workarounds to satisfy the spec, increasing future maintenance costs.
2.  **Terminology Debt:** The discrepancy between the user-facing term (`Batch Size`) and the underlying API parameter (`samplePercentage`) is a form of technical debt. While out of scope to change now, it will remain a permanent source of confusion for future developers who must maintain the mental mapping between the UI and the data model.
3.  **Regression in Shared Flows:** Despite acceptance criteria for regression testing, any change involving a shared, foundational component like `RunForm` carries an inherent risk of introducing unintended side effects in other parts of the application that consume it. The impact of a potential bug is magnified due to the component's reuse.

## Token Stats

- total_input=1904
- total_output=785
- total_tokens=17308
- `gemini-2.5-pro`: input=1904, output=785, total=17308

## Resolution
- status: accepted
- note: The tasks now spell out the direct-route flow, invalid-route and eligibility handling, dead modal cleanup, and the exact verification commands that were run.

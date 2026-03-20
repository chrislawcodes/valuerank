---
reviewer: "gemini"
lens: "requirements-adversarial"
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
raw_output_path: "docs/workflows/paired-batch-launch-page/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

1.  **High Severity: Misleading User Experience by Renaming Percentage Control.** The spec mandates renaming a control from `Trial Size` to `Batch Size` while keeping its underlying behavior tied to `samplePercentage`. This is inherently confusing. A "batch size" implies a specific number of items, not a percentage of a total. The spec acknowledges this risk but fails to require a sufficient mitigation in the Acceptance Criteria, such as helper text, a tooltip, or a more descriptive label (e.g., "Percentage of Models per Batch") to clarify what the user is controlling. This creates a high risk of users misconfiguring their launches.

2.  **High Severity: Missing Test for Removal of Old UI.** The spec's own `Risks` section correctly identifies that the old modal entry point could be left behind accidentally. However, Acceptance Criterion 7 (`AC7`) fails to require a test that explicitly verifies the launch button on the vignette detail page has been updated to navigate to the new route and no longer opens the modal. This is a critical verification gap for the core goal of the change.

3.  **Medium Severity: Undefined Behavior for Edge Cases.** The spec leaves several user-facing states undefined, relying on a vague "friendly not-found/error state."
    *   **Authorization:** It does not specify what should happen if a user navigates directly to the URL for a valid vignette they are not authorized to view (e.g., 403 vs. 404).
    *   **Vignette State:** It does not define behavior for vignettes that exist but are in a non-launchable state (e.g., archived, disabled).
    *   **Failure Feedback:** It does not describe how a "mutation failure" should be communicated to the user (e.g., toast, inline error, banner) or if the form should remain interactive for a retry.
    *   **Loading State:** The spec omits any requirement for a loading state while fetching vignette details (e.g., name) for the page header, which could result in a blank or jarring UI on initial render.

4.  **Medium Severity: Incomplete Verification of `PRODUCTION` Category.** The spec relies on an "existing server-side... fix" to categorize these runs as `PRODUCTION`. However, the acceptance criteria only mandate testing the "successful submission," which is a client-side concern. There is no requirement for an end-to-end or integration test to confirm that the resulting run record is correctly and durably persisted with the `PRODUCTION` category in the database. This creates a risk of silently introducing data integrity issues.

## Residual Risks

1.  **Brittle Dependency Risk.** The project is accepting the risk of building a new user flow on top of an existing "fix" for run categorization. The spec explicitly scopes out changing this logic, meaning any fragility or hidden bugs in that mechanism are inherited. A failure in that downstream logic will cause this new page to silently generate miscategorized data, and the test plan does not cover this eventuality.

2.  **Inherent Usability Conflict.** By choosing to relabel a percentage control with a count-based term (`Batch Size`), the project is accepting a permanent UX dissonance. Even if partially mitigated with helper text (which is not currently required by the spec), this fundamental mismatch between the label and the control's function is likely to remain a persistent source of friction and user error.

## Token Stats

- total_input=1903
- total_output=723
- total_tokens=16372
- `gemini-2.5-pro`: input=1903, output=723, total=16372

## Resolution
- status: accepted
- note: The tasks now spell out the direct-route flow, invalid-route and eligibility handling, dead modal cleanup, and the exact verification commands that were run.

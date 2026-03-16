---
reviewer: "gemini"
lens: "testability"
stage: "plan"
artifact_path: "docs/workflows/domain-first-site-ia-migration/plan.md"
artifact_sha256: "ed372ac697a4766401bf9dc0995524b7030314d23af4ff4528b49dc48a213d99"
repo_root: "."
git_head_sha: "ad1056848eaf99799e005d2b73be7a3e1f9287f2"
git_base_ref: "origin/main"
git_base_sha: "ad1056848eaf99799e005d2b73be7a3e1f9287f2"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "The plan now requires per-wave verification work and explicit automated coverage, so the remaining testability concerns are tracked rather than unresolved."
raw_output_path: "docs/workflows/domain-first-site-ia-migration/reviews/plan.gemini.testability.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability

## Findings

*   **Explicit Test Coverage Mandate:** The plan mandates that "Each wave must still add or update the tests needed to prove its behavior," establishing a clear expectation for test creation alongside implementation.
*   **Wave-Specific Verification Work:** Each proposed wave includes an "Expected verification work" section, detailing specific areas for testing, such as route coverage, rendering coverage, state consistency, and deep-link behavior.
*   **Code Anchors Identified:** Specific files and components are listed as "Current Code Anchors," providing clear targets for test development and focus.
*   **AI Review as a Gate (with Caveat):** The workflow designates AI review as a checkpoint, but critically notes, "AI review is a workflow gate, not a substitute for implementation verification," reinforcing the need for robust automated tests.
*   **Dedicated "Verification Expectations" Section:** A final section outlines minimum verification requirements for the overall workflow, emphasizing the importance of verifying route compatibility, deep links, state consistency, and diagnostic scope.

## Residual Risks

*   **Missing Analytics Instrumentation Plan:** The plan explicitly states that "This workflow still needs an analytics instrumentation plan, but that lives separately from this document." This is a significant risk, as analytics are crucial for verifying real-world usage, identifying production bugs, and understanding user behavior, which constitutes a vital form of ongoing verification.
*   **"Blocked on" Dependencies:** Several waves have items listed under "Blocked on:" (e.g., "domain-grouped run query strategy," "immutable launch provenance," "domain-level cost preview contract"). These dependencies directly impact the ability to implement and, consequently, test certain features or entire waves, creating potential delays and integration challenges for comprehensive testing.
*   **Vagueness in Some Verification Items:** While specific verification points are listed, some remain high-level (e.g., "return-state smoke coverage for `Home`," "readiness state is visible and consistent"). The precise depth and type of automated tests required for these are not detailed, potentially leading to superficial test coverage.
*   **Ambiguity in AI Review Thresholds:** The "Review Policy" outlines checkpoints for AI review with specific AI roles. However, it does not specify the criteria or depth of automated tests that would satisfy these AI reviews, potentially leading to subjective interpretations of test readiness and reconciliation.
*   **Testability of Phase 0 Deliverables:** The "Phase 0 Deliverables" list includes items like "create route compatibility matrix" and "document immutable launch provenance approach." While these are documentation tasks, their testability—how their accuracy and completeness will be verified against the implementation—is not explicitly addressed within this plan.

## Token Stats

- total_input=3663
- total_output=554
- total_tokens=18952
- `gemini-2.5-flash-lite`: input=3663, output=554, total=18952

## Resolution
- status: accepted
- note: The plan now requires per-wave verification work and explicit automated coverage, so the remaining testability concerns are tracked rather than unresolved.

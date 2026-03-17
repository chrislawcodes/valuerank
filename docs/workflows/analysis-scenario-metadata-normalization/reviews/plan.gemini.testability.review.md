---
reviewer: "gemini"
lens: "testability"
stage: "plan"
artifact_path: "docs/workflows/analysis-scenario-metadata-normalization/plan.md"
artifact_sha256: "162258117c524818de774cdb054fed67437980524633fbbf64b0247e5f7ac0aa"
repo_root: "."
git_head_sha: "624b0f433b3bde215339f6a95d865f7163a2cc2a"
git_base_ref: "origin/main"
git_base_sha: "ad7e0c4060f149412a4100117981a45704a5c3c0"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflows/analysis-scenario-metadata-normalization/reviews/plan.gemini.testability.review.md.stdout.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability

## Findings

The plan is well-structured for testability, particularly the emphasis on deterministic normalization and the separation of metadata from decision evidence. The inclusion of a dry-run mode for the backfill is a critical safety and verification feature.

*   **Contractual Verification:** The plan correctly identifies the need to update the Python worker contract. However, it should explicitly include an integration test or a contract-validation test such as a shared JSON schema or a set of cross-language test fixtures to ensure the Node.js API and Python workers remain in sync during the transition.
*   **Edge Case Coverage:** The plan accounts for unavailable dimensions, but it lacks a specific test case for scenarios where dimensions exist but are partially valid or malformed.
*   **UI Regression Testing:** While analysis page grouping behavior is mentioned, the plan would benefit from a specific visual, snapshot, or data-integrity test for the Stability View when switching between legacy and normalized metadata sources to ensure no data disappears from the UI during the transition.
*   **Vignette Family Isolation:** The mapping registry keyed by vignette family is a central point of failure. The plan should include a collision test that registers two families with identical dimension names but different normalization rules to verify strict isolation.

## Residual Risks

*   **Shadow Data Conflicts:** There is a risk that implicit canonical metadata might exist in some records but not others within the same run, leading to inconsistent grouping in the UI if precedence logic is not perfectly aligned with how the data was originally written.
*   **Worker Incompatibility:** If a Python worker is not updated simultaneously with the API change in a deployed environment, `analyze_basic.py` might fail when it encounters the new normalized payload format.
*   **Backfill Side Effects:** Even with a dry-run mode, a metadata-only backfill can still have side effects through timestamps, cache invalidation, or downstream automation if the write path is not tightly scoped.
*   **UI Complexity:** Handling unavailable scenarios gracefully may still produce confusing partial-results UI if normalization is too strict.

## Resolution
- status: open
- note:

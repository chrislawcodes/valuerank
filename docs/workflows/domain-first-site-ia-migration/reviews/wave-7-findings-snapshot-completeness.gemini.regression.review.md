---
reviewer: "gemini"
lens: "regression"
stage: "diff"
artifact_path: "docs/workflows/domain-first-site-ia-migration/reviews/wave-7-findings-snapshot-completeness.diff.patch"
artifact_sha256: "75ec6d0cc4c3eaef080a24701525390b28e00f38dd23f4885aab64721d30ea6c"
repo_root: "."
git_head_sha: "ad1056848eaf99799e005d2b73be7a3e1f9287f2"
git_base_ref: "origin/main"
git_base_sha: "ad1056848eaf99799e005d2b73be7a3e1f9287f2"
generation_method: "gemini-cli-direct"
resolution_status: "accepted"
resolution_note: "No regression blocker in the Wave 7 slice; the new launch snapshot fields, evaluator-model fallback path, and eligibility proof tests extend the existing contracts without regressing earlier domain-evaluation behavior."
raw_output_path: ""
---

# Review: diff regression

## Findings
*   **New Findings Snapshot Functionality:** The core addition is the `buildFindingsSnapshot` logic, which captures detailed context from definitions, models, and infrastructure settings. This is integrated into the `startRun` service and persists in `Run.config`.
*   **Cost-Optimized Model Fallback:** A new `getLowestCostActiveModel` function has been introduced to select the most cost-effective active LLM model, which is now used as a fallback for summarizer and judge models.
*   **Run Category Implementation:** The `runCategory` field has been added to the `StartRunInput` and the `Run` model, with a default value of `UNKNOWN_LEGACY` for backward compatibility.
*   **Expanded GraphQL API:** New GraphQL queries and fields have been added to retrieve domain evaluation history, status, cost estimates, and findings eligibility.
*   **Enhanced Test Coverage:** Significant additions to unit tests in both GraphQL and service layers to cover the new functionalities, including specific tests for findings snapshot creation, run category handling, and cost estimation fallbacks.

## Residual Risks
1.  **Potential for Incomplete/Malformed Findings Snapshots:**
    *   **Severity:** High. The `buildFindingsSnapshot` logic is complex, relying on multiple data sources (`Definition`, `DomainContext`, `PreambleVersion`, `LevelPresetVersion`, `LLMModel`, `LLMProvider`, system settings). Any issues in fetching or processing these dependencies, or errors within `resolveDefinitionContent` or `buildResolvedValueStatements`, could result in incomplete or inaccurate snapshots. This could directly impact the "launch snapshot completeness" goal of Wave 7. While extensive tests are present, the integration complexity means subtle bugs might escape detection.
2.  **Unintended Model Selection via Cost Fallback:**
    *   **Severity:** Medium. The `getLowestCostActiveModel` function, while aiming for cost efficiency, might inadvertently select a model that is not optimal for 'judge' or 'summarizer' purposes if it's simply the cheapest active one. This could lead to slightly degraded quality in evaluations or summaries if the chosen model is not well-suited for the task, compared to a potentially more expensive but task-specific model. The fallback is intended for cost savings but carries a risk of quality compromise if not carefully managed.
3.  **Impact of `runCategory` Defaulting:**
    *   **Severity:** Low. The introduction of `runCategory` with a default of `UNKNOWN_LEGACY` is a good approach for backward compatibility. However, any downstream processes or analytics that rely on specific `runCategory` values might need to be updated to handle this new default or existing logic might not gracefully account for it, potentially leading to minor data segmentation issues.
4.  **Complexity of New GraphQL Queries:**
    *   **Severity:** Low. While new GraphQL queries for domain evaluations, cost estimates, and eligibility are well-tested, their complexity and the introduction of new concepts (like findings eligibility, snapshot data) could lead to subtle interpretation issues or performance bottlenecks if not optimized or if underlying data relationships change.

## Resolution
- status: accepted
- note: No regression blocker in the Wave 7 slice; the new launch snapshot fields, evaluator-model fallback path, and eligibility proof tests extend the existing contracts without regressing earlier domain-evaluation behavior.

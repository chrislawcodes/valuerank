---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/models-tab/tasks.md"
artifact_sha256: "8b7f076f7c42784baccc12ba4ea84f4d3675c8f1e492a81f3ded60058b2b467a"
repo_root: "."
git_head_sha: "de250c0d1d4a72072cffae43adf8b1a9a2b2554e"
git_base_ref: "origin/main"
git_base_sha: "b26923fbe83c2c0ec86c80180073de00a4461626"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/models-tab/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

| Severity | ID | Task | Finding |
| :--- | :--- | :--- | :--- |
| **HIGH** | 1 | A1 | **GraphQL Nullability Mismatch:** `ModelsAnalysisDomainBreakdown.winRate` is defined as a non-nullable `Float!`, but its calculation depends on filtering out data that would produce a `null` value. If this filtering logic in A2 fails or is incomplete, the resolver will attempt to return `null` for a non-nullable field, causing a GraphQL server error. The schema should be defensive and not rely on implementation details of a resolver. |
| **MEDIUM** | 2 | C2 | **Incorrect Tooltip Logic:** In `ModelsMatrixCell`, the `title` attribute is set using `formatStabilityTooltip(muted ? null : stabilityScore, ...)`. When the view is muted (for a single domain), this passes `null` as the score, triggering a generic "not enough domains" message. It fails to pass the `muted` flag to the formatter, which would allow it to show the correct, more specific tooltip: "Cross-domain stability is not available when viewing a single domain." |
| **MEDIUM** | 3 | C5 | **Undefined UI Error State:** The plan for the main page component states "Handle loading and error states" but does not specify the appearance or behavior of the error state for the main data query. This omission risks an inconsistent or user-unfriendly implementation (e.g., a blank page or unhandled crash) if the API call fails. |
| **MEDIUM** | 4 | A2 | **[UNVERIFIED] Fragile Data Dependency:** The resolver relies on a static `DOMAIN_ANALYSIS_VALUE_KEYS` constant to build the result. If any snapshot data contains value keys not present in this constant, that data will be silently ignored. This creates a maintenance burden and a risk of incomplete analysis if the constant and the data-generation process drift apart. |
| **LOW** | 5 | C1 | **Inaccurate Tooltip Text:** The `formatStabilityTooltip` message for a null score is hardcoded to mention only 0 or 1 domains. While the current logic for `computeStabilityScore` only returns null for < 2 domains, this message is not robust. If the logic changes or has an unexpected case, the tooltip would be misleading. A more accurate message would be: `Stability requires at least 2 eligible domains. Found ${eligibleDomainCount}.` |

## Residual Risks

1.  **Performance at Scale:** The API resolver logic in task A2 fetches all relevant data from the database and performs aggregation, parsing, and calculation in memory. This design may not scale efficiently. As the number of models, domains, or analysis snapshots grows, this single query could become a performance bottleneck, leading to high API latency or excessive memory consumption. The plan lacks any provisions for performance testing or optimization for large datasets.
2.  **UI/Data Synchronization Race Condition:** The UI plan in C5 involves two separate data fetches: one for the list of domains to populate a filter dropdown, and another for the main `modelsAnalysis` data. A race condition exists where the available domains could change between these two API calls, leading to a potential UI inconsistency (e.g., a user filtering by a recently deleted domain and seeing an empty or confusing result).
3.  **[UNVERIFIED] Build & Dependency Complexity:** The implementation is spread across multiple internal packages (`@valuerank/api`, `@valuerank/web`, `@valuerank/db`). Task C3 correctly identifies a potential issue with importing a constant (`DOMAIN_ANALYSIS_VALUE_KEYS`) across these boundaries. This highlights a general risk that misconfigured workspace dependencies or TypeScript path aliases could lead to build failures or runtime errors that are not accounted for in the task breakdown.

## Token Stats

- total_input=15724
- total_output=812
- total_tokens=20617
- `gemini-2.5-pro`: input=15724, output=812, total=20617

## Resolution
- status: open
- note:
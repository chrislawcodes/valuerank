---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/models-tab/tasks.md"
artifact_sha256: "4746a5920a6bc07659fb08ae18ea80df69efd420fa4a9097284e1394b30d8e01"
repo_root: "."
git_head_sha: "b26923fbe83c2c0ec86c80180073de00a4461626"
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

### High Severity

| Finding ID | Title | Description |
| :--- | :--- | :--- |
| **H-01** | **Performance: Inefficient Snapshot Fetching in Resolver** | Task `A2` describes a resolver that fetches all `assumptionAnalysisSnapshot` records ordered by creation date, then deduplicates them in application memory to keep only the most recent one per `assumptionKey`. This is highly inefficient if there are many historical snapshots, as it pulls potentially large amounts of unnecessary data from the database. This could lead to slow API responses and high database load. A more performant approach would use a database-level `DISTINCT ON` (for PostgreSQL) or a window function to select only the latest record per key. |
| **H-02** | **Robustness: Unhandled Parsing Errors in Resolver** | Task `A2` specifies that the resolver should process database rows and use `parseSnapshotOutput(row.output)`. It mentions "skip if null" but does not define behavior if `parseSnapshotOutput` throws an exception (e.g., due to malformed JSON in the `output` field). A single corrupted record could cause the entire GraphQL query to fail, representing a significant availability risk. The task should include instructions for robust error handling, such as logging the error and skipping the specific record. |

### Medium Severity

| Finding ID | Title | Description |
| :--- | :--- | :--- |
| **M-01** | **[UNVERIFIED] Edge Case: Client-Side Empty State Calculation** | Task `C3` requires showing an empty state message if "all cells are n/a". This implies the client must iterate through all `models`, and for each model, all `values`, to check if any `pooledWinRate` is non-null. For a large matrix (e.g., many models and values), this is an expensive client-side computation that runs after the data has already been received. This could lead to a noticeable lag between the loading state disappearing and the empty state appearing. |
| **M-02** | **[UNVERIFIED] Ambiguity: Handling of Negative Scores** | Task `C1` defines `computeDots` for a `score` that is used for `stabilityScore`. While `winRate` is bounded from 0-100, the calculation for `stabilityScore` is referenced as "spec MAD formula" and is not defined. If this formula could ever produce a negative number, `computeDots` would behave unexpectedly. The task assumes scores are always non-negative, which may not be a safe assumption without seeing the formula. |
| **M-03** | **[UNVERIFIED] Dependency: Cross-Package Constant Sharing** | Task `C3` correctly identifies a potential issue: the web app (`@valuerank/web`) needs access to `DOMAIN_ANALYSIS_VALUE_KEYS`, a constant likely defined in the API package (`@valuerank/api`). The task suggests defining the array inline as a workaround. This introduces a risk of divergence between the frontend and backend, where the list of values could become out of sync, leading to missing or broken columns in the UI. A better solution would be to place this constant in a shared package. |

### Low Severity

| Finding ID | Title | Description |
| :--- | :--- | :--- |
| **L-01** | **UX: Ambiguous State for Disabled Stability Filter** | In task `C5`, the view becomes `singleDomainActive`, and in `C3`, the stability filter options are disabled. However, the task doesn't explicitly state what should happen if a stability filter (e.g., "Stable only") was active *before* the user selected a single domain. The UI should revert the filter to "all" to avoid a confusing state where a disabled filter is still secretly affecting the (already muted) display. |

## Residual Risks

| Risk ID | Title | Description |
| :--- | :--- | :--- |
| **RR-01** | **Data Integrity** | The tasks rely on several pure helper functions (`computeWinRate`, `computePooledWinRate`, `computeStabilityScore`). While `C1` includes a task for unit testing the UI helpers, `A2` does not explicitly require unit tests for the critical backend calculation helpers. Without dedicated tests, there is a risk of subtle bugs in the aggregation logic that may not be caught during manual verification. |
| **RR-02** | **Scalability** | The API resolver logic in `A2` aggregates data from multiple database records into a complex, nested map structure in memory (`Map<modelId, Map<valueKey, ...>>`). While more efficient DB queries would mitigate the fetch concern (H-01), the in-memory processing itself could become a bottleneck if the number of active models, values, or domains grows significantly, potentially leading to high memory consumption on the API server. |
| **RR-03** | **Consistency** | The task requires manually updating the GraphQL SDL file (`schema.graphql`) in `A4` to match the Pothos types defined in `A1`. While a build step might catch mismatches, this manual synchronization is error-prone. A more robust workflow would generate the SDL from the Pothos schema automatically to ensure they can never diverge. |

## Token Stats

- total_input=15665
- total_output=1143
- total_tokens=18838
- `gemini-2.5-pro`: input=15665, output=1143, total=18838

## Resolution
- status: open
- note:
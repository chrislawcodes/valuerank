---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflows/run-status-visualization/plan.md"
artifact_sha256: "00f5db5b2fc759cae8fbbc9b2dc09fdf54d7178b37b7741a5d1072a4a6830a9d"
repo_root: "."
git_head_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
git_base_ref: "origin/main"
git_base_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "See plan.md Review Reconciliation for full notes."
raw_output_path: "docs/workflows/run-status-visualization/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

1.  **Critical Testability Gap for UI Rewrite:** The verification plan for the Wave 2 UI rewrite is to run the existing test suite (`npm run test --workspace @valuerank/web`). For a "full rewrite" of `ExecutionProgress.tsx`, this is insufficient. The plan omits the crucial step of writing **new component tests** for the new implementation. These tests are essential to validate the new logic under various conditions and prevent future regressions.

2.  **Flawed Model-to-Provider Mapping Logic:** The strategy for associating models with a provider is brittle. It derives the list of models from a `Set` combining `provider.activeModelIds` and `provider.recentCompletions`. This creates a significant edge case: if a model included in a run is no longer considered "active" by the provider (e.g., a deprecated version) and has not yet produced any output, it will be completely omitted from the UI. The source of truth for a run's models should be the run configuration itself, not inferred from separate, unrelated data sources.

3.  **Undefined Behavior for Null/Initial State:** The new `ExecutionProgressProps` interface correctly allows `runProgress`, `summarizeProgress`, and `analysisStatus` to be `null`. However, the plan does not specify how the component should render in these states (e.g., when a run is first created and has no progress data yet). This ambiguity creates a high risk of runtime errors (e.g., `TypeError: cannot read properties of null`) or a visually broken UI if the component implicitly assumes this data is always present.

4.  **Missing API Integration Test:** The Wave 1 plan lacks a verification step to confirm the correctness of the `totalRetries` calculation. While it verifies that the code builds, it does not validate that the Prisma aggregation query works as expected. An integration test is needed to create a run with mock `ProbeResult` entities and assert that the GraphQL resolver returns the correct sum of `retryCount`.

## Residual Risks

1.  **Client-Side Clock Skew Impacting Metrics:** The `computeRatePerMin` function relies on the client's local system time (`Date.now()`). If a user's clock is inaccurate, the calculated throughput metric will be misleading. While often an acceptable trade-off for non-critical monitoring, it's a source of potential data inaccuracy.

2.  **Implicit Assumption on Timestamp Format:** The plan for `computeRatePerMin` assumes that `new Date(c.completedAt)` will parse the timestamp string correctly. It does not specify the expected format of `completedAt`. If the API returns a non-standard or unexpected format, this will cause a runtime error and break the throughput calculation.

3.  **Loss of Granular Debugging Information:** The plan explicitly removes the `RecentCompletionsFeed`. While the new design may be cleaner, this removes a stream of granular, real-time data that could be valuable for developers or power users when debugging esoteric execution failures or performance issues. The impact of losing this visibility is not assessed.

## Token Stats

- total_input=1968
- total_output=653
- total_tokens=16315
- `gemini-2.5-pro`: input=1968, output=653, total=16315

## Resolution
- status: accepted
- note: See plan.md Review Reconciliation for full notes.

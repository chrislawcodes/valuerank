---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflows/run-status-visualization/tasks.md"
artifact_sha256: "6d3805203ab30660b276bec3e10c7d6dd9303825d979304b43d709c44486eb81"
repo_root: "."
git_head_sha: "fbb65bdf00bdb198ac218134bf14c799b6e0561d"
git_base_ref: "origin/main"
git_base_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Critical F1-F3 rejected: byModel already implemented server-side; provider data available in metrics.providers[]; stage pills logic fully specified in spec.md. Minor gaps covered by quality gate and spec."
raw_output_path: "docs/workflows/run-status-visualization/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

1.  **Critical Flaw: Missing Backend Implementation for Per-Model Progress.** Task `T1.3` updates the frontend `RunProgress` type to expect a `byModel` array, and `T2.1` designs the entire UI around consuming it. However, there is no corresponding task in Wave 1 to modify the API resolver for `runProgress` to query and return this data. The API does not provide the data that the UI is being rebuilt to require. This is a blocking issue that will cause a runtime failure or a non-functional UI.

2.  **Critical Flaw: Missing Backend Data for Throughput Metrics.** The UI redesign in `T2.1` depends on `metrics.recentCompletions` to calculate all throughput and rate metrics ("X/min dispatch rate", "X/min throughput"). The API modifications in Wave 1 only add `totalRetries` to the `ExecutionMetrics` type; there is no planned work to add the `recentCompletions` field or its underlying data resolver. The UI is designed to display metrics for which no data source has been provisioned.

3.  **High-Severity Flaw: Inadequate Verification Plan.** The verification steps in `T1.4`, `T2.3`, and the final Quality Gate are limited to static checks (`lint`, `build`) and existing unit tests (`test`). The plan omits a crucial task: writing new unit tests for the completely rewritten `ExecutionProgress.tsx` component. Furthermore, it lacks any form of integration testing to ensure the frontend's GraphQL queries can be satisfied by the API. This weak verification strategy is precisely why the critical data omissions noted above would be missed until manual testing or deployment.

4.  **Medium-Severity Flaw: Ambiguous UI Logic.** Several key UI logic points in `T2.1` are underspecified or based on weak assumptions:
    *   **Active Stage:** The logic to determine which stage pill (`① Probe`, `② Summarize`, `③ Analyse`) is "active" is not defined. This leaves a core part of the status visualization open to guesswork.
    *   **Data Source:** The `provider` object, which is essential for mapping models to provider cards, is used without being defined or passed as a prop. It's unclear where this data should come from.
    *   **Metric Definition:** The plan uses the term "dispatch rate" but defines its calculation based on `recentCompletions`, making it a "completion rate." This conceptual mismatch can lead to a misleading UI.

## Residual Risks

1.  **API Performance Degradation.** The `totalRetries` resolver (`T1.2`) performs a database aggregation across the `probeResult` table for every request that includes `executionMetrics`. For runs with hundreds of thousands or millions of probes, this on-demand calculation could become a significant performance bottleneck, leading to slow page loads. A more scalable design would denormalize this counter onto the `Run` model.

2.  **UI Rendering Performance.** The client-side throughput calculation described in `T2.1` requires filtering an array of `recentCompletions` on every render cycle. If this data set is large and the calculation is not properly memoized (e.g., via `useMemo`), it could lead to noticeable UI lag and a poor user experience. The task description omits this critical implementation detail.

## Token Stats

- total_input=2126
- total_output=723
- total_tokens=17649
- `gemini-2.5-pro`: input=2126, output=723, total=17649

## Resolution
- status: accepted
- note: Critical F1-F3 rejected: byModel already implemented server-side; provider data available in metrics.providers[]; stage pills logic fully specified in spec.md. Minor gaps covered by quality gate and spec.

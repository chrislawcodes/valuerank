---
reviewer: "gemini"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/workflows/run-status-visualization/reviews/implementation.diff.patch"
artifact_sha256: "24db86d2c069136af35cd918304bf5757b9ba6f39363051c7106218f6bebd6f3"
repo_root: "."
git_head_sha: "aa599ef1dfd54d82d3d0fb6dd7ef4fdfeb32f2fe"
git_base_ref: "origin/main"
git_base_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "F1 accepted as known limitation: completed models with no recent activity are not shown. Panel is for live monitoring. F2 rejected: spec specifies done count and throughput only, not per-model failure counts in UI. F3 rejected: throttling heuristic is out of spec scope. Residual risk byModel backend: already implemented."
raw_output_path: "docs/workflows/run-status-visualization/reviews/diff.gemini.regression-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

1.  **High Severity - Incomplete Model Display:** The UI may fail to display all models involved in a run. The `providerData` memoized hook builds its list of models to display (`seenModelIds`) from `provider.activeModelIds` and `provider.recentCompletions`. If a model has finished all its work and is no longer "active" or "recent," it will disappear from its provider card, even though it contributed to the run. This provides an incomplete and potentially misleading view of the run's progress. The canonical list of models for the run should be the source of truth for rendering, not a list derived from transient activity.

2.  **Medium Severity - Per-Model Failure Count is Omitted:** The GraphQL query was updated to fetch `failed` counts on a per-model basis (`runProgress.byModel { failed }`), and this data is correctly propagated into the `modelRows` data structure within the `ExecutionProgress` component. However, the UI never renders this value. The `ProviderCard`'s per-model rows only display the `done` count and the completion `rate`, omitting critical information about model-specific failures.

3.  **Low Severity - Inaccurate Throttling Heuristic:** The `isThrottled` flag is only true when a provider has zero active jobs but jobs are still queued. A provider can be effectively throttled by a rate limit even with some active jobs (i.e., unable to utilize all available `maxParallel` slots because it's waiting for a rate limit window to reset). The current logic is too narrow and will fail to indicate this common throttling scenario.

## Residual Risks

1.  **Data Dependency Risk:** The functionality of the new UI is critically dependent on the `runProgress.byModel` field being correctly resolved and populated by the backend. The backend implementation for this field is not part of the provided diff. If this backend change is missing or incorrect, the per-model progress tracking (`done` counts) will fail to render, leaving the provider cards mostly empty.

2.  **Rate Calculation Brittleness:** The client-side `computeRate` function calculates a rate based on completions within the last 60 seconds. This implicitly assumes the server provides at least a 60-second window of `recentCompletions`. If the server-side implementation provides a shorter window (e.g., only the last 30 seconds of events), the client-side rate calculation will be a persistent underestimate, presenting an inaccurate view of performance.

3.  **Visual Feedback Regression:** The old UI included a `RecentCompletionsFeed` that showed a real-time stream of individual success/failure events. This has been removed in favor of aggregated counts and a calculated rate. While the new design is more structured, users lose the explicit, granular feedback of seeing individual tasks complete, which can reduce the perceived "liveness" of the system during a run.

## Token Stats

- total_input=20892
- total_output=645
- total_tokens=24234
- `gemini-2.5-pro`: input=20892, output=645, total=24234

## Resolution
- status: accepted
- note: F1 accepted as known limitation: completed models with no recent activity are not shown. Panel is for live monitoring. F2 rejected: spec specifies done count and throughput only, not per-model failure counts in UI. F3 rejected: throttling heuristic is out of spec scope. Residual risk byModel backend: already implemented.

---
reviewer: "gemini"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflows/run-status-visualization/spec.md"
artifact_sha256: "17b62ed33bc6e739ba0828a91b1e2d68104837de4f993f520bc36d8f7d74943c"
repo_root: "."
git_head_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
git_base_ref: "origin/main"
git_base_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "See plan.md Review Reconciliation for full finding-by-finding notes."
raw_output_path: "docs/workflows/run-status-visualization/reviews/spec.gemini.edge-cases-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

1.  **[High] `queuedJobs` Field is Unspecified in API Scope:** The design for Provider Cards requires a `queuedJobs` count for each provider, but adding this field to the GraphQL API is not mentioned in the Acceptance Criteria or the "In Scope" file list. The frontend will not be able to render the "N queued" text without this backend change.

2.  **[Medium] Unhandled Layout Overflow for Long Model Names:** Acceptance criterion #3 mandates that model names are not truncated. However, the spec does not define behavior for exceptionally long model names within the 3-column grid. On smaller viewports or with verbose model identifiers (e.g., `anthropic.claude-3-opus-20240229-v1.0`), this will likely break the layout, causing text to overlap or wrap unpredictably. The spec should define a robust overflow or wrapping strategy.

3.  **[Medium] Ambiguous "Active" State for Provider Pulse:** The "Totals line" on a provider card includes a "pulsing dot if active," but the spec never defines what "active" means in this context. It could mean `activeJobs > 0`, `queuedJobs > 0`, or some combination. This ambiguity will lead to inconsistent implementation.

4.  **[Low] Unhandled Utilization Bar State `> 100%`:** The utilization bar is defined as `activeJobs / maxParallel`. It's possible for `activeJobs` to temporarily exceed `maxParallel` in some race conditions or if the configuration changes mid-run. The spec does not define how the UI should handle a utilization greater than 100% (e.g., cap the bar at 100%, show an error state).

5.  **[Low] Unhandled Zero-Total Case in Summarize Progress:** The `summarizeProgress` bar is specified as "X/Y". If a run enters the `SUMMARIZING` stage but has produced zero scenarios to summarize (Y=0), the UI behavior is undefined. This could result in a "NaN%" display or a division-by-zero error in the component logic.

## Residual Risks

1.  **Client-Side Performance Degradation:** The throughput calculation requires filtering a `recentCompletions` array on the client within a rolling 60-second window. The spec does not mention if this array has a bounded size. If a run has very high throughput, this array could grow large, leading to UI stutter or performance issues from frequent, expensive calculations during re-renders.

2.  **Data Consistency Assumptions:** The component's logic relies on the consistency of multiple disparate fields (`run.status`, `runProgress`, `analysisStatus`). A transient inconsistency from the backend (e.g., `run.status` is `SUMMARIZING` but `summarizeProgress` is null) could lead to a confusing or broken UI state. The design assumes the data is always perfectly synchronized.

3.  **Stale Real-Time Data:** The accuracy of the "rolling 60s window" for throughput is highly dependent on the frequency and reliability of data updates from the backend. The spec omits any mention of the real-time data mechanism (e.g., polling interval, subscriptions). If the data is stale, the throughput metric will be misleading.

## Token Stats

- total_input=1892
- total_output=712
- total_tokens=15571
- `gemini-2.5-pro`: input=1892, output=712, total=15571

## Resolution
- status: accepted
- note: See plan.md Review Reconciliation for full finding-by-finding notes.

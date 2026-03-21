---
reviewer: "gemini"
lens: "requirements-adversarial"
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
raw_output_path: "docs/workflows/run-status-visualization/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

1.  **Race Condition in Throughput Calculation:** The spec defines throughput as a rolling 60-second window based on `recentCompletions`. If the UI polls for data at a frequency significantly lower than 60 seconds (e.g., every 15-20 seconds), a single completion event could be counted in multiple successive windows, artificially inflating the displayed throughput. The window should be calculated against a fixed time interval on the client, not just the contents of the last polled `recentCompletions` array.

2.  **Ambiguous `analysisStatus` Logic:** The trigger for the "Analyse" stage pill is `analysisStatus != null`. This is brittle. A `FAILED` or `CANCELLED` status within `analysisStatus` should result in a failed or stopped state for that pill, not an "active" one. The current logic would incorrectly show "Analyse" as pulsing active even if it has already failed.

3.  **Missing Zero-State for Provider Cards:** The design does not specify what to display when a run is `PENDING` and no providers have been assigned or are active yet. The UI should handle the case where the `run.providers` array is empty or all provider metrics are zero, displaying a clear "Waiting for providers..." message instead of a blank grid.

4.  **`totalRetries` Calculation is Lossy:** The retry badge formula is `totalRetries / runProgress.total`. This is a cumulative, run-wide average. A single misbehaving model could trigger a high number of retries, turning the badge red and masking the fact that all other models are healthy. The metric is not granular enough to be actionable. A per-provider or per-model retry metric would be more informative for diagnosing issues.

5.  **Unclear UX for `maxParallel=0`:** The spec says the utilization bar should show 0% if `maxParallel` is 0. This is technically correct but experientially confusing. A value of 0 typically implies a provider is disabled or not configured. The UI should render this state distinctly, perhaps by disabling the utilization bar and showing "Not enabled" or "0 configured" instead of a 0% full bar.

6.  **"Done" Count Definition is Vague:** The "done count" for each model is not explicitly defined. It should clarify whether this count includes or excludes failed trials. If it includes failures, the "done" metric is misleading. It should be "completed" or "successful trials" to be unambiguous.

7.  **`byModel` Data Structure Insufficient:** The spec requests `byModel { modelId completed failed }`. This is missing a `retries` count per model. Without this, the frontend cannot calculate the per-model or per-provider retry pressure suggested as a fix for Finding #4. The `totalRetries` field is a weak substitute.

## Residual Risks

1.  **Polling Frequency vs. Real-time Feel:** The entire design relies on polling. If the polling interval is too long (e.g., >10 seconds) to conserve resources, the "pulsing dot" for the active stage and the rolling throughput metrics will feel laggy and not reflect the true, real-time status of the run. There is a fundamental tension between the desire for real-time visualization and the limitations of a polling-based architecture.

2.  **Scalability of the UI:** The 3-column grid for provider cards assumes a limited number of providers. A run configured with 7 or more providers will wrap unattractively, breaking the layout. While not a current problem, it represents a fragile design choice that doesn't scale.

3.  **In-Flight Data Inaccuracy:** During the `SUMMARIZING` stage, the "done" counts from the `Probe` stage may become stale. The design does not specify if the provider cards should be frozen or hidden during summarization. If they remain visible, they will display outdated information while a new stage is active, potentially confusing the user.

## Token Stats

- total_input=1890
- total_output=914
- total_tokens=14655
- `gemini-2.5-pro`: input=1890, output=914, total=14655

## Resolution
- status: accepted
- note: See plan.md Review Reconciliation for full finding-by-finding notes.

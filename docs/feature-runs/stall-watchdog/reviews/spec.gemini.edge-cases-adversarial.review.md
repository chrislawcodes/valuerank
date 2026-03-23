---
reviewer: "gemini"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/stall-watchdog/spec.md"
artifact_sha256: "79477542267aef99d74f4bd70cbb53500466ed321dda09406b5214a77a03ec29"
repo_root: "."
git_head_sha: "1bc92c5502d64397cd53f28fed52f4f58ff07934"
git_base_ref: "origin/main"
git_base_sha: "1bc92c5502d64397cd53f28fed52f4f58ff07934"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "FR-001 clarified: successful-only progress. FR-012 added: grace period after PAUSED->RUNNING. FR-009: stalledModels cleared on pause. PAIRED_BATCH attribution flagged for plan. Clock skew rejected: theoretical. Query perf deferred to plan."
raw_output_path: "docs/feature-runs/stall-watchdog/reviews/spec.gemini.edge-cases-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

1.  **CRITICAL: Initial Stall Blindspot.** The core detection logic in `FR-001` and the "Edge Cases" section requires a model to have at least one *prior successful* `ProbeResult` before it can be flagged as stalled. This creates a critical blindspot: a model that is misconfigured (e.g., invalid API key) or blocked from the very beginning will *never* complete a probe successfully. It will have pending/retrying jobs indefinitely but will never be detected as stalled under the current specification. The logic must be amended to also detect models that have pending jobs but *zero* successful probes after a reasonable time has elapsed since the run started.

2.  **HIGH: Unverified Critical Assumption about Job Queries.** The entire design for tracking per-model progress, especially for `PAIRED_BATCH` runs, hinges on a critical assumption: that PgBoss jobs can be queried and counted on a per-model basis. The spec correctly notes this must be verified (`"the plan must verify whether it can be extended to scope by modelId"`). However, the risk is understated. If jobs are only indexed by `runId`, the feature as specified is unimplementable for distinguishing which model in a pair is stalled. This is the most significant technical risk to the proposed design.

3.  **MEDIUM: Race Condition on Run State Transition.** The process described is: 1) fetch `RUNNING` runs, 2) perform analysis, 3) write back to `stalledModels`. A run could transition from `RUNNING` to `COMPLETED` *after* step 1 but *before* step 3. This could lead to the watchdog modifying a run that is already in a terminal state, violating `FR-009`. The final update query MUST be conditional on the run's status still being `RUNNING` (e.g., `UPDATE "Run" SET "stalledModels" = ... WHERE id = :runId AND status = 'RUNNING'`).

4.  **MEDIUM: Brittle Pause/Resume Logic.** `FR-012` specifies a grace period of "one full scheduler cycle" after resuming a paused run. This is brittle as it depends on the scheduler's timing, which might change. A more robust implementation would be to add a `resumedAt: DateTime?` field to the `Run` model. The stall detection logic would then explicitly ignore any run where `now() < resumedAt + grace_period` (e.g., `resumedAt + 5 minutes`), making the grace period independent of scheduler tick timing.

5.  **LOW: Ambiguous Job State Requirement.** `FR-001` requires checking for "pending or active" PgBoss jobs. However, the background context notes that jobs can get stuck in a `retry` loop. The set of states that constitute an "unfinished" job should be explicitly defined (e.g., `created`, `retry`, `active`) to ensure the query is correct.

## Residual Risks

1.  **UI & Log Flapping.** The specification acknowledges but accepts potential "log flapping." This risk extends to the user experience. A model whose average probe completion time is near the 3-minute threshold could cause the stall banner in the UI to appear and disappear with each 5-minute scheduler tick. This could reduce operator trust in the alert. A hysteresis mechanism (e.g., requiring a model to be healthy for *two* consecutive ticks before clearing its stalled state) would provide a more stable UI at the cost of slower banner removal.

2.  **Query Performance at Scale.** The stall detection logic runs a potentially complex query across multiple tables (`Run`, `ProbeResult`, `pgboss.job`) for every active run, every 5 minutes. The specification does not address the performance impact on the database. Without proper indexing (e.g., on `ProbeResult(runId, modelId, createdAt)`, `pgboss.job(name, state)`), these queries could become slow and resource-intensive as the number of concurrent runs and historical probe results grows, potentially impacting overall platform performance.

3.  **Scheduler Self-Termination Risk.** The watchdog relies on calling `signalRunActivity()` to keep its own scheduler alive during a protracted stall. While this is a clever design, it creates a dependency loop. If a bug were introduced that prevented `signalRunActivity()` from being called correctly *during a stall*, the watchdog scheduler could go dormant, leaving the stalled run undetected indefinitely—the very problem it was designed to solve.

4.  **Inflexibility of Hardcoded Threshold.** The 3-minute stall threshold is hardcoded. While acceptable now, this poses a risk if future models are introduced that are legitimately slower to respond. This could lead to a rise in false positive alerts, requiring a code change to adjust. This limitation is noted in the spec but remains a long-term maintenance risk.

## Token Stats

- total_input=3750
- total_output=1040
- total_tokens=19149
- `gemini-2.5-pro`: input=3750, output=1040, total=19149

## Resolution
- status: accepted
- note: FR-001 clarified: successful-only progress. FR-012 added: grace period after PAUSED->RUNNING. FR-009: stalledModels cleared on pause. PAIRED_BATCH attribution flagged for plan. Clock skew rejected: theoretical. Query perf deferred to plan.

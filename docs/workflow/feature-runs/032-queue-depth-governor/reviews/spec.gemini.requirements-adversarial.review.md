---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/032-queue-depth-governor/spec.md"
artifact_sha256: "445c9e64992206c60ba02538552aa946c628d04b48928edcbdfa556f15402041"
repo_root: "."
git_head_sha: "e6bddd46b1313e99af81c3846a8ae8e741473024"
git_base_ref: "origin/main"
git_base_sha: "9c52998e5757f86c358d3d4be2a2e8febdce3118"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "F-1 RUN_INIT_FAILED: fixed. F-2 idempotency skips: top-up also triggered at early-exit paths. F-3 temperature propagation: added to spec. F-4 SQL pattern: existing pattern is wrong — spec correctly requires update to match probe_."
raw_output_path: "docs/workflow/feature-runs/032-queue-depth-governor/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "context files narrowed; spec artifact fully covered"
---

# Review: spec requirements-adversarial

## Findings

| Severity | ID | Finding | Evidence |
|---|---|---|---|
| HIGH | F-1 | **Critical Integrity Check Will Always Fail for Capped Runs:** The spec correctly identifies that the launch integrity check in `enqueueRunJobs` (`jobIds.length !== totalJobs`) must be changed. However, the severity of this is high: without this change, *every single run* large enough to be governed will fail its integrity check at launch and be aborted, rendering the feature non-functional and breaking all large-scale experiments. | `[CODE-CONFIRMED]` |
| HIGH | F-2 | **Incomplete Top-Up Triggers Will Stall Runs:** The spec correctly requires that the `top_up_probes` job be enqueued not only on job success/failure but also on "idempotent early-exit". The `probe-scenario/handler.ts` file confirms there are multiple such early-exit paths (lines 80-105). Missing any one of these trigger points in the implementation will mean a queue slot is freed but not replenished, causing the effective queue depth to shrink over time and re-introducing the very stall condition this feature aims to prevent. | `[CODE-CONFIRMED]` |
| MEDIUM | F-3 | **Topped-Up Jobs May Lose Temperature Setting:** The spec is imprecise about the data required for the `top_up_probes` handler to rebuild a job, mentioning only `models`, `scenarioIds`, and `samplesPerScenario`. `start-queue.ts` shows that `temperature` is a critical, optional parameter passed at run creation. An analogous function, `requeueMissingProbes` in `recovery-jobs.ts`, already fails to propagate this parameter. If the new top-up handler does not explicitly fetch and use the `temperature` from the `Run` configuration, all topped-up jobs will silently revert to default, corrupting the results of any run using a custom temperature. | `[CODE-CONFIRMED]` |
| MEDIUM | F-4 | **Ambiguous and Likely Incorrect SQL Query Change:** The spec directs the developer to "Update queue-name pattern in `countJobsForRun()`...to include `probe_${providerName}` queues, not just `probe_scenario%`". The existing queries in `recovery-jobs.ts` and `stall-detection.ts` use `(name = 'probe_scenario' OR name LIKE 'probe_scenario_%')`. This pattern appears to be *correct* for matching the default queue and provider-specific queues (e.g., `probe_scenario_openai`). The spec's instruction is inconsistent with the established code pattern, creating significant ambiguity and likely prescribing an incorrect change that would break queue-aware counting. | `[CODE-CONFIRMED]` |
| LOW | F-5 | **Backstop May Allow Runs to Operate in a Degraded State:** The recovery scheduler backstop (US-3) is designed to only trigger a top-up when a provider queue's depth is below 50% of the cap. This is a reasonable heuristic to avoid contention with the primary top-up mechanism. However, it implies that a run could have its throughput reduced (e.g., operating with 8/15 jobs in the queue) for the full 5-minute recovery interval without the backstop intervening. This places very high trust in the primary probe-completion trigger (US-2) being perfectly reliable. | `[UNVERIFIED]` |

## Residual Risks

Even if the feature is implemented exactly as specified, the following risks remain:

1.  **Performance Bottleneck:** The new "queue-aware missing-probe helper" must query the `pgboss.job` table to check for pending/active jobs. This check will be run by the `top_up_probes` job, which is triggered frequently (after every probe completion). If not carefully optimized, this high-frequency database query across a potentially large table could introduce a new performance bottleneck, slowing down the top-up process itself.

2.  **Race Conditions in a Distributed System:** While `singletonKey` prevents multiple `top_up_probes` jobs from running concurrently for the same run, there is still a window for race conditions. For example, a probe completes, and a top-up job is enqueued. Before it runs, another probe completes. The top-up job then runs, calculates missing jobs based on the state at that moment, and enqueues them. This can lead to minor, temporary inaccuracies in queue depth, which should self-correct but add noise to the system.

3.  **Increased System Complexity:** The governor introduces a more complex, two-stage job lifecycle (initial enqueue + top-up). It also adds a new job type and multiple new trigger paths (on-completion and scheduled backstop). This increased complexity makes the system harder to reason about and debug, and it increases the surface area for future bugs unrelated to the original problem.

## Token Stats

- total_input=242
- total_output=1056
- total_tokens=34962
- `gemini-2.5-pro`: input=242, output=1056, total=34962

## Resolution
- status: accepted
- note: F-1 RUN_INIT_FAILED: fixed. F-2 idempotency skips: top-up also triggered at early-exit paths. F-3 temperature propagation: added to spec. F-4 SQL pattern: existing pattern is wrong — spec correctly requires update to match probe_.

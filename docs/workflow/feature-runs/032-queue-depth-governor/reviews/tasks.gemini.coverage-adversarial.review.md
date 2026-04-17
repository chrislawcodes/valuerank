---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/032-queue-depth-governor/tasks.md"
artifact_sha256: "dcc1d157f0392f6e3eb76a966b85d919960321ee9ab3d8a74eb0121855e2569a"
repo_root: "."
git_head_sha: "e6bddd46b1313e99af81c3846a8ae8e741473024"
git_base_ref: "origin/main"
git_base_sha: "9c52998e5757f86c358d3d4be2a2e8febdce3118"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH thundering herd: PgBoss singleton collapses concurrent inserts by design. MEDIUM cancelled run race: low impact — expired jobs rejected. MEDIUM test coverage: accepted residual. MEDIUM backstop scalability: low concurrent run count in practice. LOW filtering: implementation should use DB query not in-memory. LOW failure window: acknowledged in spec."
raw_output_path: "docs/workflow/feature-runs/032-queue-depth-governor/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

| Severity | ID | Finding | Task |
| :--- | :--- | :--- | :--- |
| **HIGH** | 1 | **Performance Degradation**: The plan to enqueue a `top_up_probes` job after every `probe-scenario` job completion will create a "thundering herd" problem. Even with singleton protection, this will result in a massive volume of unnecessary database INSERT attempts to `pgboss`, risking database performance degradation under normal load. | T5 |
| **MEDIUM** | 2 | **Race Condition**: The `top-up-probes` handler has a classic "check-then-act" race condition. It checks if a run is `RUNNING` and then inserts jobs. A run could be cancelled between these two steps, leading to new jobs being enqueued for a run that is already cancelled. | T3 |
| **MEDIUM** | 3 | **Incomplete Test Coverage**: The unit test plan omits several critical adversarial scenarios. There are no tests for the race condition (Finding #2), the thundering herd performance issue (Finding #1), failure/retry logic (e.g., DB errors during top-up), or the scheduler backstop logic. This leaves significant failure modes untested. | T9 |
| **MEDIUM** | 4 | **[UNVERIFIED] Scalability Bottleneck**: The scheduler backstop iterates through every `RUNNING` run and executes a separate job count query for each. This approach will not scale with a large number of concurrent runs and is likely to become a performance bottleneck in the scheduler itself. | T8 |
| **LOW** | 5 | **[UNVERIFIED] Inefficient Filtering**: To find missing probes, the top-up handler plans to fetch all `ProbeResult` entities for a run and filter them in memory. For runs with hundreds of thousands of probes, this is inefficient and could cause high memory usage and slow performance, when a reverse query for probes *without* a result might be better. | T3 |
| **LOW** | 6 | **Unacknowledged Failure Window**: The `top_up_probes` job is defined with `retryLimit: 0`. This means any transient failure (e.g., DB deadlock, network blip) will cause the top-up attempt to be dropped. While the scheduler backstop (T8) mitigates this, it introduces a potential window of several minutes where a run's queues are stalled. This is an accepted risk, not a flaw, but it is not explicitly stated. | T1 |

## Residual Risks

- **Stale Queues**: The combination of a `retryLimit: 0` on the primary top-up trigger (T5) and a periodic scheduler backstop (T8) creates a clear risk. If a `top_up_probes` job fails, the run's queues will remain under-filled until the next scheduler sweep, delaying overall run completion time. The frequency and reliability of the scheduler become critical to system health.
- **[UNVERIFIED] Brittleness from Unverified Assumptions**: This plan's success depends on several unverified assumptions about the existing codebase:
    1.  That `buildRunJobPlan()` reliably provides a `queueName` for grouping (T2).
    2.  That all probe jobs correctly have `runId` in their data payload for querying (T3).
    3.  That queries against `pgboss.job` and `ProbeResult` tables are performant under load.
    If any of these assumptions are incorrect, key parts of the implementation will fail.
- **Configuration Rigidity**: Key tuning parameters like `PROBE_QUEUE_DEPTH_PER_PROVIDER` and the scheduler's top-up threshold (`... / 2`) are hardcoded. This creates a risk that the system cannot be easily tuned in response to production load or performance issues without a full redeployment.

## Token Stats

- total_input=2789
- total_output=835
- total_tokens=17952
- `gemini-2.5-pro`: input=2789, output=835, total=17952

## Resolution
- status: accepted
- note: HIGH thundering herd: PgBoss singleton collapses concurrent inserts by design. MEDIUM cancelled run race: low impact — expired jobs rejected. MEDIUM test coverage: accepted residual. MEDIUM backstop scalability: low concurrent run count in practice. LOW filtering: implementation should use DB query not in-memory. LOW failure window: acknowledged in spec.

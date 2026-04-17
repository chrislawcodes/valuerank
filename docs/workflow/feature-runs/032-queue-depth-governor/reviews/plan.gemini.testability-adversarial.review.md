---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/032-queue-depth-governor/plan.md"
artifact_sha256: "dabf22ee43c904507da0361ccb0680a9b907e1d4ddad34612e7badd987a30841"
repo_root: "."
git_head_sha: "e6bddd46b1313e99af81c3846a8ae8e741473024"
git_base_ref: "origin/main"
git_base_sha: "9c52998e5757f86c358d3d4be2a2e8febdce3118"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH singleton flooding: PgBoss singleton collapses concurrent inserts by design — this is the intended usage. MEDIUM brittle SQL: no better alternative without a provider registry; document as known constraint. MEDIUM race condition: accepted residual per spec. LOW tests: added capped-launch and dead-letter tests to Step 10."
raw_output_path: "docs/workflow/feature-runs/032-queue-depth-governor/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "context files narrowed; plan artifact fully covered"
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Evidence |
| :--- | :--- | :--- |
| **HIGH** | The plan to enqueue a `top_up_probes` job on every terminal path of the `probe-scenario` handler (Step 5) is excessively inefficient. This includes successful completions, terminal failures, and even idempotent skips. While the `singletonKey` will prevent redundant executions, it will still flood the `pgboss.job` table with thousands of insert operations for a large run, most of which will be immediately discarded. This creates unnecessary database load, introduces contention, and complicates debugging and performance tuning. | `[CODE-CONFIRMED]` |
| **MEDIUM** | The proposed raw SQL pattern `(name LIKE 'probe_%' AND name != 'probe_dead_letter')` (Steps 6, 7) to find all provider-specific probe queues is brittle. It correctly identifies the need to update the existing, flawed logic. However, this new pattern relies on a naming convention that could easily be broken by future development (e.g., a new, unrelated queue named `probe_settings`). This makes maintenance fragile and error-prone. These queries are repeated in multiple places (`recovery-jobs.ts`, `stall-detection.ts`, etc.), compounding the risk. | `[CODE-CONFIRMED]` |
| **MEDIUM** | The logic for the "queue-aware missing-probe helper" (Step 3) is complex and difficult to test reliably. It must check for the absence of a result in two separate data sources with different transaction models: the main application database (`ProbeResult`) and the `pgboss.job` table. This creates a high risk of race conditions. For example, a job could complete and write its `ProbeResult` *after* the helper checks the app DB but *before* it checks the pgboss DB, leading the helper to miss a completed job and incorrectly enqueue a duplicate. Unit testing this behavior would require sophisticated mocking of two database states simultaneously. | `[UNVERIFIED]` |
| **LOW** | The test plan (Step 10) is incomplete. While it rightly focuses on the new `top-up-probes` handler, it omits dedicated tests for the critical changes in `enqueueRunJobs` (Step 2), where the initial job insertion is capped. This new capping logic fundamentally changes how a run starts and its state is represented, warranting its own unit tests. The interaction between the event-driven top-up (Step 5) and the scheduled backstop (Step 9) is also not considered for testing. | `[UNVERIFIED]` |
| **LOW** | The backstop scheduler logic (Step 9) introduces an arbitrary threshold (`PROBE_QUEUE_DEPTH_PER_PROVIDER / 2`). The plan provides no justification for this "50% capacity" magic number. This makes the behavior of the backstop difficult to reason about and test against. An un-justified threshold could lead to the backstop either firing too often (creating noise) or not often enough (failing to prevent stalls). | `[UNVERIFIED]` |

## Residual Risks

*   **Observability Drift**: The plan dictates that `run.progress.total` should reflect the true total number of jobs, while the initial queue depth is intentionally capped (Step 2). This means that for any large run, the reported progress will be misleading. The system will appear stuck or slow at the beginning because the number of jobs actually queued is far less than the reported total. This gap between reported reality and actual state can lead to incorrect operational decisions and complicates stall detection logic.
*   **Race Conditions in State Management**: The core top-up logic relies on checking state across `ProbeResult` and `pgboss.job` tables. This, combined with the high frequency of `top_up_probes` invocations, increases the likelihood of encountering subtle race conditions where the system's perception of "missing" jobs is incorrect, potentially leading to duplicate job insertions that the idempotency checks must then handle.
*   **Performance Hotspot**: The `top_up_probes` handler, triggered frequently and performing multiple database queries (counting jobs, checking for probe results), is at risk of becoming a performance bottleneck, especially when multiple large runs are active concurrently. The `singletonKey` prevents concurrent *execution* but not concurrent *enqueuing*, which still hits the database.

## Token Stats

- total_input=1008
- total_output=937
- total_tokens=31961
- `gemini-2.5-pro`: input=1008, output=937, total=31961

## Resolution
- status: accepted
- note: HIGH singleton flooding: PgBoss singleton collapses concurrent inserts by design — this is the intended usage. MEDIUM brittle SQL: no better alternative without a provider registry; document as known constraint. MEDIUM race condition: accepted residual per spec. LOW tests: added capped-launch and dead-letter tests to Step 10.

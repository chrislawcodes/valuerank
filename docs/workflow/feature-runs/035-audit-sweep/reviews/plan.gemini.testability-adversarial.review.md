---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/035-audit-sweep/plan.md"
artifact_sha256: "422279cfe9d693de84c4302d95cc32eb59945b9b9ee4ca057c0bcbe8504978fc"
repo_root: "."
git_head_sha: "67082dc3d4eeede3775a50ee4769cb22d2cb7e09"
git_base_ref: "origin/main"
git_base_sha: "67082dc3d4eeede3775a50ee4769cb22d2cb7e09"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/035-audit-sweep/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

1.  **HIGH: Underspecified Run Selection for Audit Sweep.** The plan for the new `run-state-audit` handler (Wave 5) is dangerously vague, stating it will "find runs matching reconcile scope" without defining that scope. This is a critical omission. The existing `run-state-reconcile` job relies on a complex, optimized query in `scheduler.ts` (`enqueueRunStateReconcileJobs`) to select runs that are currently active or are recent and show specific signs of trouble (like having stranded transcripts or an orphan backlog). The plan for the audit handler, which logically should have a *broader* scope (e.g., all runs in the last X days, regardless of their apparent health), fails to specify this new query logic. This ambiguity hides significant, unaddressed performance risks and leaves a core part of the implementation undefined. [CODE-CONFIRMED]

2.  **MEDIUM: Ambiguous `lastSeenAt` Timestamp on Anomaly Resolution.** In `anomaly-persistence.ts`, the `resolveAnomaly` function updates `lastSeenAt` to the current time upon resolving an anomaly. This corrupts the meaning of the `lastSeenAt` field. Instead of representing when the anomaly was last *observed*, it now represents when the row was last *touched for resolution*. This makes it impossible to reliably determine the time of the last actual occurrence versus the time of resolution, impeding debugging and historical analysis of intermittent issues. The fix should be to remove the `lastSeenAt: now` update from the `resolveAnomaly` function. [CODE-CONFIRMED]

3.  **MEDIUM: Missing Idempotency in Cron Job Scheduling.** The plan for Wave 5 specifies calling `boss.schedule(...)` on server startup to create the daily audit job. However, it fails to address the risk of creating duplicate schedules if the server restarts. The project's own code (`cloud/apps/api/src/queue/handlers/index.ts`) already establishes a clear pattern for idempotent handler registration (`offWork` then `work`). The plan should explicitly require a similar idempotent pattern for scheduling, such as calling `boss.unschedule('run_state_audit')` before `boss.schedule('run_state_audit', ...)` to prevent duplicate cron jobs from being registered. [CODE-CONFIRMED]

4.  **LOW: Incomplete Test Coverage for `repairScheduledCount`.** The test for `repairScheduledCount` in `anomaly-persistence.test.ts` does not cover the failure path where the provided `runId` does not exist in the database. In this scenario, `db.run.findUnique` returns `null`, and the function correctly returns `false` without attempting an update. While the implementation is correct, the test suite is incomplete, failing to verify this expected behavior and protect it from future regressions. An additional test case for a missing run should be added. [CODE-CONFIRMED]

## Residual Risks

The plan's "Residual Risks" section is well-considered and adequately addresses several key adversarial concerns. The following items from the plan are noted as strong, proactive risk mitigations:

*   **Race Conditions:** The risk of a race between the default and audit sweeps is correctly identified, and the proposed verification (a concurrent integration-style test) is appropriate.
*   **Performance:** The risk of the daily audit sweep being slow is acknowledged, with a concrete verification step (measure against a seeded DB) and mitigation plan (batching or scope shrinking).
*   **Nullish Coalescing Nuance:** The plan correctly identifies the subtle but important behavior of the `??` operator where `0` is a valid override but `undefined` or `null` is not. The proposed verification (unit testing both cases) is excellent.

## Token Stats

- total_input=59963
- total_output=800
- total_tokens=63472
- `gemini-2.5-pro`: input=59963, output=800, total=63472

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted

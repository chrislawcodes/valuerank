---
reviewer: "gemini"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/feature-runs/stall-watchdog/tasks.md"
artifact_sha256: "51d98c84a07accc083f1726bf58e245b7c70e2b4330982b037f3c44083d27c98"
repo_root: "."
git_head_sha: "c16754b277e7f93f31eb63486dc5be9dc6320105"
git_base_ref: "origin/main"
git_base_sha: "1bc92c5502d64397cd53f28fed52f4f58ff07934"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Schema syntax in tasks.md is correct — corruption was in plan.md only. null startedAt: skip with error log instead of fallback to new Date(). Use job.createdOn deferred: runStartedAt is sufficient approximation for v1. Model ID display rejected: model IDs are human-readable strings not CUIDs. Grep step added to T2.3."
raw_output_path: "docs/feature-runs/stall-watchdog/reviews/tasks.gemini.dependency-order-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks dependency-order-adversarial

## Findings

1.  **Invalid Prisma Syntax (High Severity)**: Task T1.1 presents Prisma schema syntax that is incorrect: `stalledModels String[] @cloud/apps/api/src/mcp/tools/set-default-llm-model.ts([]) @cloud/apps/web/src/components/analysis/ScenarioHeatmap.tsx("stalled_models")`. The `@...` annotations are not valid Prisma attributes and appear to be corrupted metadata from a planning document, referencing unrelated files. This will cause the `npx prisma migrate` command to fail, blocking all subsequent work. The reconciliation notes state this syntax is correct, which appears to be a mistake, as it contradicts the official Prisma schema language. The correct syntax is likely `stalledModels String[] @default([]) @map("stalled_models")`.

2.  **Inaccurate Stall Clock Assumption (Medium Severity)**: The stall detection logic in T2.1 uses `runStartedAt` to determine if a run is "old enough" to flag a never-succeeded model as stalled. This assumes that work for all models begins when the run starts. This assumption is flawed. A model could be added to a run long after it has started. In this scenario, the run would be considered "old," and the new model could be incorrectly flagged as stalled almost immediately, before it has had a reasonable chance to complete a job. The stall grace period should be relative to when jobs for a *specific model* were first queued, not when the parent run was created.

3.  **Sequential Processing Bottleneck (Medium Severity)**: The `detectAndUpdateStalledRuns` function in T2.1 processes all `RUNNING` runs in a sequential `for...of` loop. If many runs are active concurrently, a delay in processing one run (e.g., a slow DB query) will block and delay stall detection for all others. This creates a scalability bottleneck and means that UI notifications for stalls could be significantly delayed across the system. The runs should be processed in parallel (e.g., using `Promise.all`).

4.  **Race Condition on DB Update (Low Severity)**: In T2.1, the `changed` constant inside `updateRunStalledModels` is calculated with logic that assumes the incoming list of stalled models has no specific order. However, the check `newStalled.some(m => !run.stalledModels.includes(m))` can pass even if the sets of models are identical but the arrays have different orders in some edge cases of the implementation. A more robust implementation would be to compare sorted arrays or use Sets to check for equality, ensuring that database writes only occur when the set of stalled models has actually changed. The current logic is mostly correct but brittle.

## Residual Risks

1.  **Brittleness of Raw SQL Queries**: The core detection logic in T2.1 relies on raw SQL queries against the `pgboss.job` table and JSON parsing of its `data` column. This creates a hidden, tight coupling to the internal implementation details of the `pgboss` library and the job payload structure. A future upgrade of `pgboss` that modifies its schema, or a change to the `probe_scenario` job payload, would break stall detection silently. This risk must be documented, and ideally, an integration test should be created to cover this interaction.

2.  **Incomplete Cleanup on Run Termination**: Task T2.3 correctly identifies the need to clear the `stalledModels` array when a run's status changes to a terminal state (e.g., `COMPLETED`, `CANCELLED`). While it lists seven locations and adds a `grep` command for verification, there remains a risk that a code path that updates the run status is missed. If a run terminates through a missed code path, it could be left in a `COMPLETED` state while still having a non-empty `stalledModels` list, leading to confusing and incorrect historical data.

3.  **Stall Detection During Deployment**: The `runRecoveryJob` that triggers stall detection runs on a timer. If a deployment occurs while runs are active, the timer state might be reset. This could cause a gap in stall detection. Furthermore, if the `STALL_THRESHOLD_MS` (3 minutes) is shorter than the potential downtime or restart time during a deployment, a model that was making progress could be incorrectly flagged as stalled immediately after the system comes back online.

## Token Stats

- total_input=7036
- total_output=936
- total_tokens=25292
- `gemini-2.5-pro`: input=7036, output=936, total=25292

## Resolution
- status: accepted
- note: Schema syntax in tasks.md is correct — corruption was in plan.md only. null startedAt: skip with error log instead of fallback to new Date(). Use job.createdOn deferred: runStartedAt is sufficient approximation for v1. Model ID display rejected: model IDs are human-readable strings not CUIDs. Grep step added to T2.3.

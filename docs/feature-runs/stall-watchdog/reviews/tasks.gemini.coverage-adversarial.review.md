---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/feature-runs/stall-watchdog/tasks.md"
artifact_sha256: "51d98c84a07accc083f1726bf58e245b7c70e2b4330982b037f3c44083d27c98"
repo_root: "."
git_head_sha: "c16754b277e7f93f31eb63486dc5be9dc6320105"
git_base_ref: "origin/main"
git_base_sha: "1bc92c5502d64397cd53f28fed52f4f58ff07934"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Unit tests added as T2.4 (9 cases). Schema syntax correct in tasks.md. Threshold 3min acknowledged as Known Limitation. Scalability deferred. null startedAt: skip with error log. Grep added to T2.3."
raw_output_path: "docs/feature-runs/stall-watchdog/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

1.  **High Severity - Brittle/Non-Standard Schema Definition:** The Prisma schema syntax in `T1.1` (`stalledModels String[] @cloud/apps/api/src/mcp/tools/set-default-llm-model.ts([]) @...`) is not valid, standard Prisma syntax. While a "Review Reconciliation" note claims this is correct, it represents a significant risk. It relies on undocumented, project-specific tooling to be parsed correctly, making the codebase difficult for new developers to understand and introducing a fragile step in the migration process. A standard `@map("stalled_models")` directive would be robust and conventional.

2.  **Medium Severity - Potential UI Breakage:** In `T3.2`, the frontend banner displays stalled models using `run.stalledModels.join(', ')`. If a moderate number of models stall, this will create an unmanageably long, un-truncated string that will overflow its container and break the page layout. The UI component should truncate the list (e.g., "...and 5 more").

3.  **Medium Severity - Incomplete Test Coverage:** The unit test plan in `T2.4` is comprehensive but misses a critical state transition scenario: a model that is stalled, subsequently completes a job (becoming *un-stalled*), and then stalls again later in the same run. The tests should verify that `updateRunStalledModels` correctly identifies this as a "newly stalled" event for logging purposes on the second occurrence.

4.  **Low Severity - Inefficient State Management:** Task `T2.3` requires manually adding `stalledModels: []` to seven different locations where a run's status is updated. This approach is prone to error during future maintenance, as a developer adding a new path to a terminal state could easily miss this requirement. This creates a risk of stale `stalledModels` arrays persisting on completed or failed runs.

## Residual Risks

1.  **Scalability of Detection Loop:** The `detectAndUpdateStalledRuns` function in `T2.1` fetches all `RUNNING` runs from the database in a single query. As acknowledged in the review notes ("Scalability deferred"), this will not scale and risks becoming a performance bottleneck if the platform handles a large number of concurrent runs.

2.  **Hardcoded Stall Threshold:** The 3-minute stall threshold in `T2.1` is a hardcoded constant. This is acknowledged as a "Known Limitation." This inflexibility may be inappropriate for certain LLM providers with long cold-start times or for complex scenarios, leading to false-positive stall detections.

3.  **Untested SQL Queries:** The test plan in `T2.4` relies on mocking the database layer. This means the raw SQL queries in `getModelsWithPendingJobs` and `getLastSuccessfulCompletionByModel` are never executed against a real database schema as part of the test suite. An error in the SQL syntax or logic would not be caught by these unit tests.

4.  **Race Conditions:** The `detectStalledModels` function performs multiple non-atomic reads (querying `pgboss.job`, then `probe_results`). It is possible for a job to complete in the small window between these two queries, leading to a transiently incorrect stall assessment. While the probability is low, it is a potential source of flaky behavior.

## Token Stats

- total_input=7034
- total_output=719
- total_tokens=22768
- `gemini-2.5-pro`: input=7034, output=719, total=22768

## Resolution
- status: accepted
- note: Unit tests added as T2.4 (9 cases). Schema syntax correct in tasks.md. Threshold 3min acknowledged as Known Limitation. Scalability deferred. null startedAt: skip with error log. Grep added to T2.3.

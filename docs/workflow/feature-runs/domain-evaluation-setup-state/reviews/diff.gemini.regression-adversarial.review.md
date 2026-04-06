---
reviewer: "gemini"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/domain-evaluation-setup-state/reviews/implementation.diff.patch"
artifact_sha256: "4701929d3d5f4d7f63644222c50ba3e70c299d5868d00162640a4f4f2cd5763c"
repo_root: "."
git_head_sha: "e32203beb0fe429ef9af9d7e332c4f0eabbbae33"
git_base_ref: "97662ecffedb936831ed31b60c6d66186679077d"
git_base_sha: "97662ecffedb936831ed31b60c6d66186679077d"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted. Orphaned-analysis behavior now uses explicit queue evidence plus the existing completedAt timeout fallback, and legacy aggregate jobs without definitionVersion now match via wildcard compatibility."
raw_output_path: "docs/workflow/feature-runs/domain-evaluation-setup-state/reviews/diff.gemini.regression-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

### 1. HIGH: Regression in Orphaned Analysis Detection During Queue Unavailability
The refactoring introduced a behavioral change that weakens the detection of orphaned analysis tasks.

-   **Previous Behavior:** The `analysisStatus` resolver wrapped `pgboss` queries in a `try/catch` block. If these queries failed (e.g., queue unavailable), the logic would proceed to the final check, which correctly identified a run as `'failed'` if it was `COMPLETED` and older than 5 minutes. This provided a critical fallback status.
-   **New Behavior:** In the new `analysis-status.ts` service, the `try/catch` block in `loadAnalysisStatusLookup` now covers all queue-related queries. Upon failure, it sets `queueUnavailable: true`. The `resolveSingleRunAnalysisStatus` function then sees this flag and returns `null` immediately, skipping the orphaned run check entirely.

**Impact:** A run that is completed but whose analysis job failed to queue (an orphan) will now show a `null` analysis status indefinitely if the job queue is experiencing an outage. Previously, it would have correctly been marked as `'failed'`, alerting users to a problem. This is a regression in observability and resilience.

### 2. LOW: Test Coverage Gap for Orphaned Analysis Fallback
The new test suite for the `analysis-status` service (`analysis-status.test.ts`) does not cover the specific interaction between queue unavailability and orphaned run detection.

A test case is present to verify that the status is `null` when `pgboss` queries fail for a non-completed run. However, there is no corresponding test to verify what happens when `pgboss` queries fail for a run that *is* old enough to be considered an orphan. Such a test would have exposed the regression described in the High-severity finding above.

**Impact:** The absence of this test case allowed a behavioral regression to be introduced. Adding a test for this edge case would prevent future regressions and confirm the intended logic for this failure scenario.

## Residual Risks

### 1. MEDIUM: [UNVERIFIED] Performance of Queue Inspection Queries
The service directly queries the `pgboss.job` table using raw SQL with `WHERE` clauses on JSONB fields (e.g., `data->>'runId' = ...`).

-   While this is functionally correct and parameterized to prevent SQL injection, it carries a performance risk. Queries on JSONB fields can be slow on large tables without specific GIN or B-tree indexes on expressions.
-   As the `pgboss.job` table grows, the `domainTrialRunsStatus` and `Run.analysisStatus` queries could become a performance bottleneck, leading to slow API responses.

**Impact:** [UNVERIFIED] If appropriate indexes are not already in place on `(name, (data->>'runId'))` and `(name, (data->>'definitionId'))`, the application's performance may degrade over time as the job history accumulates.

### 2. LOW: Brittle Coupling to Internal Job Structure
The implementation is tightly coupled to the internal data schema of `pgboss` jobs, making assumptions about the shape of the `data` payload (e.g., presence of `runId`, `definitionId`, `preambleVersionId`, etc.).

-   The logic in `matchesAggregateJob` and the raw queries in `loadAnalysisStatusLookup` depend on these fields having specific names and types.
-   While unit tests have been added that mock this structure, they are not a substitute for a stable contract. If the worker code that creates these analysis jobs changes the data payload, this status-checking logic will fail silently or return incorrect results.

**Impact:** This creates a maintenance hazard. Future changes to worker jobs could inadvertently break the API's ability to report on analysis status, and the failure might not be immediately obvious.

## Token Stats

- total_input=8466
- total_output=822
- total_tokens=27359
- `gemini-2.5-pro`: input=8466, output=822, total=27359

## Resolution
- status: accepted
- note: Accepted. Orphaned-analysis behavior now uses explicit queue evidence plus the existing completedAt timeout fallback, and legacy aggregate jobs without definitionVersion now match via wildcard compatibility.

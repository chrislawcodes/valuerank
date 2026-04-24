---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/034-hygiene-follow-ups/tasks.md"
artifact_sha256: "8e4669304a6ed6d6504ad2247bb3602be7294c849998f6dda556b8d7d8db3ff8"
repo_root: "."
git_head_sha: "42b7bb726d5992b7810c0346673e7f795365c4c9"
git_base_ref: "origin/main"
git_base_sha: "42b7bb726d5992b7810c0346673e7f795365c4c9"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/034-hygiene-follow-ups/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

### 1. HIGH: Risk of SQL Predicate Drift
Several tasks require reusing complex SQL `WHERE` clauses in multiple places, but the artifact doesn't specify a mechanism to prevent them from drifting apart over time. This creates a high risk of subtle bugs if one copy is updated and the other is missed.

-   **T2-3 vs. other `findOrphanTranscripts` uses:** The task for `countOrphanTranscripts` notes that its predicate should be reused from `findOrphanTranscripts` "to avoid drift," but doesn't mandate a shared code abstraction.
-   **T4-1 vs. T4-2:** The task for `enqueueRunStateReconcileJobs` explicitly states it should use the "same predicate as T4-1, scoped per run." Relying on developers to copy this correctly is fragile.

**Recommendation:** Mandate the creation of a shared, parameterized function or constant that builds this predicate SQL fragment to ensure a single source of truth.

### 2. MEDIUM: Performance of New Queries is Under-Verified
The verification plan in Wave 5 is incomplete. It includes an `EXPLAIN ANALYZE` for the new `hasRecoveryActivity` query (T4-1), but omits analysis for other new, potentially expensive queries that will run in background jobs.

-   **T2-3 `countOrphanTranscripts`:** This query performs a `LEFT JOIN` and `COUNT(*)` which can be very slow on large tables without proper indexing. Its performance is never verified.
-   **T4-2 `enqueueRunStateReconcileJobs`:** The logic to find all runs needing reconciliation (`non-terminal` OR `stranded` OR `orphans`) could result in a complex and inefficient query. Its performance is also never verified.

**Recommendation:** Add explicit verification steps in Wave 5 to `EXPLAIN ANALYZE` the queries used in `countOrphanTranscripts` and `enqueueRunStateReconcileJobs` against production-shaped data.

### 3. MEDIUM: Incomplete Test Coverage for Edge Cases
The test plans omit several important edge cases and negative paths, which could hide bugs in the implementation.

-   **T1-2 (Env Var):** Does not test the behavior for `RUN_RECONCILE_WINDOW_DAYS=0`. This could be a valid setting to disable the window, or it could be an invalid value that should be rejected. The expected behavior is undefined.
-   **T2-5 (Orphan Reconstruction):** Does not test the `kind: 'malformed', reason: 'no-cost-data'` case for the token extractor. It only tests for `null content`.
-   **T3-2 (Pair Asymmetry):** Does not test scenarios where **no pairs** meet the `PAIR_ASYMMETRY_MIN_PROBES` threshold (e.g., all siblings are under-sampled, or only one sibling is sufficiently sampled). The detector should not fire in these cases.
-   **T4-3 (Scheduler):** Does not include negative tests for the time-based predicates. For example:
    -   A test where `hasRecoveryActivity()` returns `false` because the only orphans belong to runs *outside* the `getReconcileWindowDays()` window.
    -   A test where `hasRecoveryActivity()` returns `false` because the only orphans are *newer* than `ORPHAN_TRANSCRIPT_MIN_AGE_SECONDS`.

**Recommendation:** Add these missing test cases to the corresponding tasks to ensure the logic is robust.

### 4. [UNVERIFIED] MEDIUM: Ambiguous Logic for `PAIR_ASYMMETRY_MIN_PROBES` Guard
The description in **T3-1** for the sampling guard ("only include sibling in comparison if both self and sibling have scheduled ≥ min") is complex. This pairwise filtering is more difficult to implement correctly than a simple pre-filtering of all siblings, and the ambiguity could lead to an incorrect implementation. The test plan in T3-2 is insufficient to validate all logical outcomes of this pairwise exclusion.

**Recommendation:** Clarify the exact filtering logic. If it is indeed pairwise, add more specific test cases for scenarios where some pairs in a group are valid for comparison while others are not.

### 5. LOW: Brittle Test for Default Value
The test in **T1-2** for the unset environment variable (`RUN_RECONCILE_WINDOW_DAYS`) asserts that the helper returns a hardcoded value of `30`. However, the implementation task (T1-1) states it should fall back to the `RECENT_COMPLETED_RUN_WINDOW_DAYS` constant. This makes the test brittle; if the constant's value changes, the test will fail even if the code is correct.

**Recommendation:** The test should import the `RECENT_COMPLETED_RUN_WINDOW_DAYS` constant and assert against that, rather than a hardcoded number.

## Residual Risks

-   **Vague Soak Test:** The "soak" test in Wave 5 is undefined. Without clear objectives, duration, and success criteria, its effectiveness is unknown, and it may not uncover issues related to the system running under sustained load (e.g., memory leaks, connection pool exhaustion from the new queries).
-   **Database Indexing Assumptions:** The performance of all new queries (**T2-3, T4-1, T4-2, T3-1**) is highly dependent on correct database indexing. While the `EXPLAIN ANALYZE` for T4-1 will help, the artifact assumes the necessary indexes (e.g., on `runs(deleted_at, updated_at)`, `transcripts(deleted_at, created_at)`, `runs(jobChoiceBatchGroupId)`) already exist. If they don't, these new features could introduce significant database load. This is flagged as a residual risk that depends on the existing, unverified codebase.

## Token Stats

- total_input=3223
- total_output=1277
- total_tokens=20207
- `gemini-2.5-pro`: input=3223, output=1277, total=20207

## Resolution
- status: open
- note:
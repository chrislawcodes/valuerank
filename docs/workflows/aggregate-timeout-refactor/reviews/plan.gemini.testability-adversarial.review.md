---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflows/aggregate-timeout-refactor/plan.md"
artifact_sha256: "e25b704643ff5741ff6ae49bb6ea10d9f9e223a153e2a3a57ae3ae61eb8996a4"
repo_root: "."
git_head_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
git_base_ref: "origin/main"
git_base_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "The verification section now calls for a boundary regression test plus a characterization-style aggregate test, and the worker remains mockable through the existing spawnPython seam."
raw_output_path: "docs/workflows/aggregate-timeout-refactor/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

1.  **(High Severity) In-Transaction Failure Paths Are Untested.** The plan's verification focuses on pre-transaction and post-transaction states but omits testing for failures *during* the final `Persist` phase's interactive transaction. If the process fails after acquiring the advisory lock but before committing, it could lead to a **permanently orphaned lock**, wedging all future updates for that aggregate.
    *   **Testability Gap:** A test must be created that simulates a database error or process crash *after* the advisory lock is acquired to verify that the transaction rolls back cleanly and, critically, that the lock is released.

2.  **(High Severity) Clock-Dependent Logic is a Major Testability Flaw.** The "claim lease expiry" is a critical mechanism for self-healing, but the plan offers no strategy to test it without introducing real-world delays, making CI tests slow and flaky. It also ignores the risk of clock skew between the application server (which may set the expiry) and the database server (which holds the state), potentially causing valid claims to be seen as expired or vice-versa.
    *   **Testability Gap:** The implementation must allow for injecting a "mock clock" during tests. This would enable tests to instantly advance time and verify that:
        1.  An expired claim can be successfully reclaimed by a new process.
        2.  A process attempting to persist a result with an expired claim is rejected.
        3.  A process with a valid (but near-expiry) claim fails if the `Persist` phase is delayed beyond the expiry time.

3.  **(Medium Severity) Concurrency Testing is Assumed, Not Defined.** The plan relies entirely on an advisory lock to serialize claims and writes but proposes no method to verify this serialization under concurrent load. It is easy to misconfigure or misuse an advisory lock (e.g., locking the wrong key, transaction-level vs. session-level locks).
    *   **Testability Gap:** A specific integration test is needed that spawns two parallel processes attempting to update the same aggregate. The test must assert that only one process succeeds in writing its result, while the other either fails fast or correctly waits and sees the new state, but does not perform a redundant write.

4.  **(Medium Severity) The "Deep Fingerprint" is a Brittle, Untested Assumption.** The entire safety of this architecture hinges on the "deep source fingerprint" correctly detecting any state change that could affect the aggregate result. The plan provides no way to validate that the fingerprint is sufficiently "deep." A single omitted field (e.g., a new config flag) would silently introduce stale data into aggregates.
    *   **Testability Gap:** An adversarial test must be written. It should:
        1.  Run the `Prepare` phase to generate a fingerprint.
        2.  Directly modify a source data field that is *expected* to be in the fingerprint.
        3.  Run the `Persist` phase and assert that it throws a retryable error due to the fingerprint mismatch.
        4.  (Most importantly) Directly modify a source field that is *not* part of the fingerprint (but should be), run `Persist`, and assert that it *fails* the test, proving the fingerprint is incomplete. This forces the developer to make the fingerprint comprehensive.

## Residual Risks

1.  **Silent Data Staleness due to Incomplete Fingerprints.** The most significant residual risk is that a developer, in the future, adds a new eligibility-relevant field to the source data but forgets to update the fingerprinting logic. The test suite cannot predict future changes. This would lead to the system silently generating and persisting stale aggregates, as the `Persist` phase would believe the data is fresh. This is the fundamental trade-off of moving computation outside the transaction.

2.  **Retry Storms from Upstream Callers.** The plan correctly specifies that the `Persist` phase should throw a "retryable error" on verification failure. However, it does not consider the behavior of the calling system. A persistent fingerprint mismatch (e.g., due to a bug in the fingerprint logic) could cause an upstream caller to enter a tight retry loop, leading to a "retry storm" that could degrade service performance. The caller's retry strategy (e.g., exponential backoff) is not part of this plan but is critical to overall system stability.

3.  **Environment-Specific Locking Behavior.** Advisory lock behavior can have subtle differences across PostgreSQL versions or be affected by connection poolers (e.g., PgBouncer in transaction pooling mode). While tests can verify the logic in a controlled CI environment, they may not catch edge cases that only appear in a specific production configuration.

## Token Stats

- total_input=13395
- total_output=1002
- total_tokens=15812
- `gemini-2.5-pro`: input=13395, output=1002, total=15812

## Resolution
- status: accepted
- note: The verification section now calls for a boundary regression test plus a characterization-style aggregate test, and the worker remains mockable through the existing spawnPython seam.

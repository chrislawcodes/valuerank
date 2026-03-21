---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflows/aggregate-timeout-refactor/tasks.md"
artifact_sha256: "1d1fd470a22e501b4cb37fc2a434e889b28034216b9ce81ca55b969fb7fa2093"
repo_root: "."
git_head_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
git_base_ref: "origin/main"
git_base_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "The tasks now cover the claim lease, deep fingerprint, stale-rejection path, failure-path testing, and claim cleanup lifecycle that the review called out."
raw_output_path: "docs/workflows/aggregate-timeout-refactor/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

1.  **Critical Equivalence Test Omitted:** The task list shows that a "characterization or golden-master style test" (`Slice 3`) remains incomplete. For a refactor of this nature—where the explicit goal is to change the process without changing the outcome—this is the single most important test. Without it, there is no guarantee that the refactored implementation produces bit-for-bit identical aggregate results as the original. Subtle changes in data fetching, ordering, or floating-point arithmetic could silently corrupt the results, and this would not be caught by simple contract or shape validation.

2.  **Untested Race Condition in Prepare Phase:** The task "Add a regression test that fails gracefully when source runs or transcripts are missing or stale during the prepare phase" (`Slice 3`) is also incomplete. The "prepare" phase is explicitly designed to run *without* a transaction to reduce lock contention. However, this creates a window for race conditions: another process could modify or delete source data (runs, transcripts) *after* they have been listed but *before* they have been fully read and processed into a snapshot. The current test suite does not cover this scenario, meaning the system's behavior is undefined. It could lead to crashes, or worse, the generation of an aggregate based on inconsistent, partially-updated source data.

3.  **Ambiguous Stale Claim/Lease Handling:** The lease mechanism is designed to prevent concurrent writes, but its failure modes are not fully tested. The cleanup on worker failure is described as "best-effort" (`Slice 2`). If a worker crashes and fails to release its claim, the aggregate is effectively locked from updates until the lease expires. A poison-pill scenario that causes repeated worker crashes could block any updates to a specific aggregate, creating a targeted denial-of-service vulnerability. The timeout mechanism also assumes the worker will be *scheduled* within the lease window, which may not be true if the job queue is heavily backlogged.

## Residual Risks

1.  **Silent Data Drift:** The most severe risk is that the refactor has introduced subtle, undetected changes to the aggregate calculation logic. Without the golden-master test, the new implementation is not proven to be behaviorally identical to the old one. This could lead to a long-term, silent corruption of analysis data that would be difficult to detect and correct later.

2.  **Aggregate Staleness and Update Deadlocks:** If the job queue is backed up, a valid recompute job may not execute before its lease expires, causing it to be rejected by the persistence layer. This will result in perpetually stale aggregates. Furthermore, if a worker fails in a way that prevents "best-effort" cleanup, the claim on the aggregate will persist, preventing any further updates until the lease slowly expires, creating a potential deadlock.

3.  **Inconsistent Snapshot Generation:** Due to the untested race condition in the non-transactional prepare phase, the system could generate a fingerprint based on an initial list of source runs but then process the contents of a slightly different set of data that was modified mid-operation. This could cause the final persistence step to fail (a "stale" fingerprint) or succeed with a result that does not accurately reflect the state of the database at any single point in time.

## Token Stats

- total_input=1800
- total_output=686
- total_tokens=15605
- `gemini-2.5-pro`: input=1800, output=686, total=15605

## Resolution
- status: accepted
- note: The tasks now cover the claim lease, deep fingerprint, stale-rejection path, failure-path testing, and claim cleanup lifecycle that the review called out.

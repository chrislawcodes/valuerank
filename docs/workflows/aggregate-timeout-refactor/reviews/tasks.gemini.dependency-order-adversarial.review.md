---
reviewer: "gemini"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/workflows/aggregate-timeout-refactor/tasks.md"
artifact_sha256: "1d1fd470a22e501b4cb37fc2a434e889b28034216b9ce81ca55b969fb7fa2093"
repo_root: "."
git_head_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
git_base_ref: "origin/main"
git_base_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Slice 1 now includes the characterization test, Slice 2 now includes the boundary regression test, and the stale-result / claim-expiry handling is spelled out before implementation begins."
raw_output_path: "docs/workflows/aggregate-timeout-refactor/reviews/tasks.gemini.dependency-order-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks dependency-order-adversarial

## Findings

1.  **Critical Race Condition in Locking Strategy:** The task breakdown in Slice 2 describes a flawed locking model. It implies a short transaction for the "claim" step and a separate one for the "persist" step, both involving an advisory lock. If the lock is released after the claim is written, it creates a window for a second process to also successfully claim the same aggregate before the first process can re-acquire a lock to persist its result. The advisory lock must be acquired once *before* the claim/fingerprint check and held continuously through the final write transaction to prevent this race condition.

2.  **Incomplete Orphaned Claim Handling:** The plan relies on a lease expiring to clean up after a worker failure but does not define the cleanup mechanism. If a worker crashes, the claim remains, and the aggregate cannot be updated by any other process until the lease expires. The tasks do not specify if a new worker process is responsible for clearing an old, expired lease before starting its own work, or if a separate garbage-collection process is assumed. This omission can lead to stalled aggregate computations.

3.  **Ambiguous Failure Test Scope:** The Slice 3 task to "add a regression test that fails gracefully when source runs or transcripts are missing or stale during the prepare phase" is not well-defined. The "prepare" phase's purpose is to read the data as-is; it cannot know if that data is "stale" until the fingerprint is compared during the "persist" phase. This task should be clarified to focus on handling *missing* or fundamentally incomplete data during preparation, as staleness is a persistence-time concern.

4.  **Redundant Test Descriptions:** The plan specifies a characterization or golden-master test in both Slice 1 and Slice 3 with nearly identical descriptions. This suggests either redundancy or a lack of clarity. The plan should specify if the first test validates only the output of the "prepare" phase, while the second validates the final, end-to-end persisted data.

## Residual Risks

1.  **"Best-Effort" Cleanup on Failure:** The plan's reliance on "best-effort cleanup on worker failure" is a weak assumption. A hard crash (e.g., OOM kill) will prevent any cleanup code from running, leaving the claim orphaned until its lease expires. While the lease provides an eventual fallback, the system remains vulnerable to periods where aggregates are "frozen" and cannot be recomputed, impacting data freshness.

2.  **Clock Skew Vulnerability:** The entire lease-expiry mechanism is implicitly dependent on consistent time across all components (API servers, database). If significant clock skew exists, leases may be validated incorrectly, leading to either premature expiry (causing valid computations to be rejected) or delayed expiry (extending the lockout period after a worker fails).

3.  **Fingerprint Brittleness:** The deep source fingerprint is the core defense against using stale data, but its implementation is fragile. The plan correctly identifies the initial fields to include, but any future changes to the aggregation logic or eligibility criteria *must* also be reflected in the fingerprint. An omission will lead to silent data corruption where aggregates are not recomputed when they should be. This requires long-term developer discipline beyond the scope of this refactor.

## Token Stats

- total_input=1802
- total_output=685
- total_tokens=16647
- `gemini-2.5-pro`: input=1802, output=685, total=16647

## Resolution
- status: accepted
- note: Slice 1 now includes the characterization test, Slice 2 now includes the boundary regression test, and the stale-result / claim-expiry handling is spelled out before implementation begins.

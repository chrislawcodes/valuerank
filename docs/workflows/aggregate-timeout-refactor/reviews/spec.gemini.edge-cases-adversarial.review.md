---
reviewer: "gemini"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflows/aggregate-timeout-refactor/spec.md"
artifact_sha256: "8f17f3ee8e65b4069a6689bcc2fa0e43bccc5eb13f3c2d4f2264985ebfabf68f"
repo_root: "."
git_head_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
git_base_ref: "origin/main"
git_base_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "The spec now covers stale-data races, claim expiry, and explicit recovery behavior so the edge-case concerns are no longer implicit."
raw_output_path: "docs/workflows/aggregate-timeout-refactor/reviews/spec.gemini.edge-cases-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

| Severity | Finding |
| :--- | :--- |
| **High** | **Claim Acquisition is Not Specified as Atomic** |
| | The spec vaguely states a claim will be stored in "existing JSON config fields". This is a critical point of failure. If this operation is not atomic, a race condition is highly likely: two concurrent processes could both read the state, see no active claim, and begin expensive work. The last process to write its claim token will win, but the first process is now orphaned—its work will either be wasted or, in a worse implementation, could incorrectly succeed if claim validation is weak. The spec must mandate an atomic "check-and-set" mechanism for acquiring the claim (e.g., a transactional `UPDATE ... WHERE claim_field IS NULL`). |
| **Medium** | **Ambiguity in Handling Concurrent Job Starts** |
| | The "Assumptions" state that the system should "detect an in-flight job instead of redoing the same expensive work." However, the "Proposed Behavior" focuses on *rejecting stale results at the end* of the process. It does not explicitly require a new process to check for and abort immediately if a valid claim/lease already exists. This risks performing redundant, expensive Python work. A robust implementation should fail fast: if a valid claim exists, the new process should terminate immediately rather than doing pointless work only to have the result rejected later. |
| **Medium** | **Definition of "Worker Failure" is Incomplete** |
| | The spec relies on a "best-effort" cleanup for failed jobs and the lease as a fallback. However, it doesn't define what constitutes a "failure." Potential failure modes include: the Python worker exiting with a non-zero status code, the worker timing out, the worker producing malformed output, or the API process itself crashing after spawning the worker. The error handling logic in the parent process needs to cover all detectable worker failures to trigger the best-effort cleanup. Without this, failed runs will always wait for the full lease duration to expire before a new job can run, causing unnecessary delays. |
| **Low** | **Lease Duration is Underspecified** |
| | The proposal relies on a "lease/expiry" to prevent orphaned claims from blocking updates indefinitely, but it gives no guidance on how this duration should be determined. A lease that is too short will cause valid, long-running computations to be rejected, wasting resources. A lease that is too long will increase the time the system is blocked after a crash. This duration is a new, critical configuration parameter that needs a sensible default and should likely be configurable. |

## Residual Risks

| Risk | Mitigation / Detail |
| :--- | :--- |
| **Clock Skew** | The lease expiry mechanism implicitly relies on a consistent "now" between when the lease is written and when it is checked. If clocks are skewed between the application server and the database, leases may expire sooner or later than intended. This risk can be mitigated by ensuring all timestamps are generated and compared within the database itself (e.g., using `NOW()` or `CURRENT_TIMESTAMP` functions) rather than passing in timestamps generated on the application server. |
| **Thundering Herd on a Single Definition** | The proposed design prevents stale writes but not redundant work if multiple jobs are queued for the same definition simultaneously. If three jobs start at nearly the same time, all three may still perform the expensive Python computation, even though only the first one to acquire the final lock will be able to commit its result. A more robust implementation (as noted in "Findings") would have the second and third jobs detect the first job's claim and abort early. |
| **Claim Storage Field Contention** | Using a JSON field on an existing, frequently accessed table (like a `Definition` or `Vignette` table) to store the claim could introduce table lock contention, even if the claim logic itself is sound. This is a minor risk but should be considered. A dedicated, lightweight table for claims might be cleaner, though the spec seems to prefer using existing structures. |

## Token Stats

- total_input=1899
- total_output=865
- total_tokens=16706
- `gemini-2.5-pro`: input=1899, output=865, total=16706

## Resolution
- status: accepted
- note: The spec now covers stale-data races, claim expiry, and explicit recovery behavior so the edge-case concerns are no longer implicit.

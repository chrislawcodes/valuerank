---
reviewer: "gemini"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflows/aggregate-timeout-refactor/plan.md"
artifact_sha256: "e25b704643ff5741ff6ae49bb6ea10d9f9e223a153e2a3a57ae3ae61eb8996a4"
repo_root: "."
git_head_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
git_base_ref: "origin/main"
git_base_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "The plan now includes a claim lease, short claim transaction, same-transaction claim cleanup, and fingerprint revalidation so stale or orphaned work does not wedge the aggregate updates."
raw_output_path: "docs/workflows/aggregate-timeout-refactor/reviews/plan.gemini.architecture-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

1.  **Non-Atomic Claim State (High Severity):** The plan to store the claim token and source fingerprint in a JSON field is not an atomic operation. A process crash between updating the token and updating the fingerprint would leave the aggregate run in a corrupt, inconsistent state. For example, it could contain a new claim token but an old data fingerprint, potentially causing validation logic to pass incorrectly on a subsequent run or making the claim impossible to validate or reclaim cleanly.

2.  **Undefined Retry Orchestration (High Severity):** The plan specifies that the `Persist` phase should throw a "retryable error" on verification failure, but it omits the critical detail of what component is responsible for catching this error and orchestrating the retry. Existing callers may not be designed for a multi-phase, stateful retry loop. Without a defined external orchestrator (like a job queue that would re-trigger the entire process), a "retryable" error is functionally a fatal one, leaving the aggregate in a permanently stale state until the next manual or external trigger.

3.  **Potential for Wasted Compute on Lease Expiry (Medium Severity):** The plan correctly allows expired claims to be reclaimed to prevent wedging. However, it doesn't account for the resource cost of the original, slow process. If Process A's lease expires and Process B reclaims the work, Process A's `Compute` phase continues running, consuming resources. When it eventually finishes and tries to persist, it will fail the claim check, and all its work will be discarded. In a high-contention or high-latency environment, this could lead to significant wasted compute cycles.

4.  **Insufficiently Specified Fingerprint (Medium Severity):** The plan's core safety mechanism relies on a "deep source fingerprint," but its contents are vaguely defined ("run IDs, timestamps, transcripts, and eligibility-relevant config fields"). This is a weak assumption. If the fingerprint does not include a content hash of the transcripts themselves, or if a new "eligibility-relevant config field" is added to the system but missed in the fingerprint logic, the check could fail to detect stale data and allow an incorrect aggregate to be persisted.

## Residual Risks

1.  **Complexity vs. Simpler Alternatives:** The proposed four-phase architecture introduces significant coordination complexity (claims, leases, fingerprints, retries) to work around a transaction timeout. An adversarial stance questions if this complexity is justified. The plan seems to prematurely dismiss the simpler alternative of a targeted performance optimization of the queries within the original transaction, combined with a moderately increased, but still bounded, timeout. The new architecture may introduce more failure modes than it solves.

2.  **Bottleneck Shifted, Not Solved:** The `Prepare` phase, including the "deep source fingerprint" calculation, is a synchronous, blocking step that must occur before a claim can be made. If this preparation is computationally expensive, the refactor may not solve the timeout issue but merely shift the bottleneck from the database transaction to the application's pre-processing stage, creating a new serialized chokepoint that limits throughput.

3.  **Implicit Worker Management Requirement:** The plan to "spawn the Python worker" introduces an external dependency without defining a contract for managing it. There is no mention of monitoring, cleanup for hung or zombie worker processes, or handling worker-level exceptions. A worker that fails silently would cause the claim to expire and be retried, masking the underlying worker failure and potentially causing repeated, fruitless retries. This offloads a significant operational burden that the current architecture may not be prepared to handle.

## Token Stats

- total_input=13394
- total_output=750
- total_tokens=15941
- `gemini-2.5-pro`: input=13394, output=750, total=15941

## Resolution
- status: accepted
- note: The plan now includes a claim lease, short claim transaction, same-transaction claim cleanup, and fingerprint revalidation so stale or orphaned work does not wedge the aggregate updates.

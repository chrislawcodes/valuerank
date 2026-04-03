---
reviewer: "gemini"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/domain-evaluation-model-backfill/spec.md"
artifact_sha256: "34ef94b8b7ca8b012b33e100a011832d22a8db185aadc29319da941f00065f97"
repo_root: "."
git_head_sha: "1a04471af003607a5a1370a7422196137daa0b94"
git_base_ref: "origin/main"
git_base_sha: "0686463ebe2c3308d4ab925f8083dc711148ab84"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted the actionable edge-case findings. The spec now makes in-flight runs count as occupied coverage until they are cancelled or otherwise moved out of a countable active status, clarifies the consequences of reopening a completed evaluation under the existing status model, adds blocked messaging for missing snapshot fields, and calls out mixed depth as allowed rather than hidden. Rejected a new override path for stuck runs in this slice because it would require separate operator controls and policy."
raw_output_path: "docs/feature-runs/domain-evaluation-model-backfill/reviews/spec.gemini.edge-cases-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

### CRITICAL

- **Stuck jobs may prevent necessary backfills.**
  The spec defines a run as "covered" if its status is `PENDING`, `RUNNING`, `PAUSED`, or `SUMMARIZING`. This prevents a user from launching a replacement for a job that is permanently stuck in one of these states (e.g., due to an ephemeral infrastructure failure or a bug in the runner). A user's only recourse would be to wait for manual intervention or for the job to time out and fail, which may not be possible or timely. The system should provide a way to override this and replace jobs that are considered stuck, even if they are technically in a non-terminal state.

### HIGH

- **Evaluation-level failure status is disproportionate and misleading.**
  The spec states that a Domain Evaluation should enter a `FAILED` state if *any* attached member run fails, including a single backfilled run. If a large, successful evaluation (e.g., 1000 completed runs) has one backfilled run that fails, the entire evaluation's status flips to `FAILED`. This misrepresents the 99.9% success of the overall effort and destroys valuable context. A more nuanced status (e.g., `COMPLETED_WITH_FAILURES`) is needed to accurately reflect the state of the evaluation.

- **Resurrecting a `COMPLETED` evaluation has undefined consequences.**
  The spec requires that attaching a backfill run to a `COMPLETED` evaluation makes it "active again." This state transition from a terminal state back to an in-progress one is significant and has cascading effects that are not addressed. For example: Does this re-trigger "evaluation started" notifications? Does it move the evaluation from a "Completed" list back to an "Active" list in the UI, potentially confusing users who considered it done? The full downstream impact of this "resurrection" must be defined to avoid unexpected behavior and user confusion.

### MEDIUM

- **Race conditions can lead to confused users and failed requests.**
  The spec correctly mandates server-side serialization to prevent duplicate launches. However, it does not address the user experience of this scenario. If User A loads the backfill screen, and then User B starts a backfill for the same evaluation, User A's screen is now dangerously stale. When User A attempts their own backfill, they will be met with a server rejection that their client-side view did not predict. This can be confusing and frustrating. The UI should include a mechanism to detect and warn the user that the target evaluation's state has changed since the page was loaded.

- **[UNVERIFIED] Backfills may fail if original evaluation parameters become invalid.**
  The server is required to reuse saved parameters (scope, temperature, etc.) from the original evaluation snapshot. The spec does not define what should happen if one of these parameters has become invalid in the time since the original launch (e.g., a `scope category` is deprecated, a model provider changes its valid temperature range). The server should gracefully handle this by rejecting the backfill with a clear error message explaining that the original parameters are no longer valid, rather than failing opaquely.

### LOW

- **[UNVERIFIED] User authorization is not re-validated.**
  The spec requires checking that a model to be backfilled was in the original evaluation's model list and is "still active in the system." It does not mention re-validating if the *current user* still has permission to launch runs for that model. A user's permissions may have been revoked. Launching the backfill without re-checking authorization could violate current access control policies.

## Residual Risks

- **Older evaluations may not be backfillable.**
  The spec correctly states that the server must reject backfills for evaluations that lack "enough snapshot data." This creates a hard line: evaluations created before this feature was implemented (and the necessary data was snapshotted) will not be eligible for backfilling. This is a reasonable technical constraint but will be a functional limitation for users wanting to patch older evaluations.

- **Backfills may use different infrastructure or pricing than the original.**
  A backfill run happens at the current point in time. The underlying model provider, pricing, or even the cloud infrastructure may have changed since the original evaluation. While the *parameters* (like temperature) are preserved, the execution context is not. This could introduce subtle variance in results or costs that are not immediately obvious.

- **Mixed-depth evaluations could complicate analysis.**
  The spec explicitly allows for backfills to create evaluations where different models have different numbers of completed runs (depth). While this is a practical choice, it places a burden on downstream analysis and UI components to be aware of and correctly handle this mixed depth, as a simple average across the evaluation could be misleading.

## Token Stats

- total_input=2342
- total_output=1020
- total_tokens=16354
- `gemini-2.5-pro`: input=2342, output=1020, total=16354

## Resolution
- status: accepted
- note: Accepted the actionable edge-case findings. The spec now makes in-flight runs count as occupied coverage until they are cancelled or otherwise moved out of a countable active status, clarifies the consequences of reopening a completed evaluation under the existing status model, adds blocked messaging for missing snapshot fields, and calls out mixed depth as allowed rather than hidden. Rejected a new override path for stuck runs in this slice because it would require separate operator controls and policy.

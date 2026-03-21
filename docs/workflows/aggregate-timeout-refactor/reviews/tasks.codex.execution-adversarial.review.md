---
reviewer: "codex"
lens: "execution-adversarial"
stage: "tasks"
artifact_path: "docs/workflows/aggregate-timeout-refactor/tasks.md"
artifact_sha256: "1d1fd470a22e501b4cb37fc2a434e889b28034216b9ce81ca55b969fb7fa2093"
repo_root: "."
git_head_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
git_base_ref: "origin/main"
git_base_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "The tasks now specify the deep fingerprint, lease-buffered claim, stale-result rejection, and failure-path coverage needed to keep the split safe to implement."
raw_output_path: "docs/workflows/aggregate-timeout-refactor/reviews/tasks.codex.execution-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks execution-adversarial

## Findings

- High: The recompute fingerprint is underspecified. It covers source run IDs/timestamps, transcript IDs/timestamps, and “eligibility-relevant config fields,” but the helper also loads scenarios and other aggregate inputs that can affect the stored result. If scenario content, scenario ordering, or any non-eligibility config changes without a timestamp bump, the refactor can incorrectly reuse a stale claim and skip recomputation.
- High: The plan does not require an explicit concurrency or lease-expiry race test. Moving prepare/compute outside the transaction creates a new window where two workers can overlap, one can claim and another can retry after expiry, or cleanup can race with persistence. Advisory locks and lease checks are not enough on their own without a test that proves the boundary under contention.
- Medium: The correctness coverage is too thin for a boundary split this risky. The artifact only calls for one canonical characterization fixture, and the key prepare-phase failure case for missing or stale source runs/transcripts is still unchecked. That leaves the refactor able to pass on the “happy path” while still breaking the most likely failure modes introduced by the split.

## Residual Risks

- The lease-duration assumption is brittle: “worker timeout plus safety buffer” can still be wrong if compute time, database contention, or retries drift upward.
- “Best-effort cleanup on worker failure” will not clear claims on hard process death; stale state will persist until lease expiry.
- The “if needed” recompute-CLI verification is vague, so report-refresh regressions could slip through unless it is actually run as a required check.
- The plan does not demand repeated or stress-style validation, so rare race conditions may survive even if the unit suite passes.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: The tasks now specify the deep fingerprint, lease-buffered claim, stale-result rejection, and failure-path coverage needed to keep the split safe to implement.

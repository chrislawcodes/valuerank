---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/domain-evaluation-model-backfill/spec.md"
artifact_sha256: "34ef94b8b7ca8b012b33e100a011832d22a8db185aadc29319da941f00065f97"
repo_root: "."
git_head_sha: "1a04471af003607a5a1370a7422196137daa0b94"
git_base_ref: "origin/main"
git_base_sha: "0686463ebe2c3308d4ab925f8083dc711148ab84"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Accepted the feasibility findings. The spec and plan now define the paired backfill unit as two child runs with one shared pair group id, require per-evaluation locked gap recalculation, and describe gap-idempotent retries plus clear no-op handling when stale client selections no longer have missing work. The remaining unverified runtime-state concerns stay as residual risk because the current run status enum already defines the concrete states used by this code path."
raw_output_path: "docs/workflow/feature-runs/domain-evaluation-model-backfill/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

- High: The spec does not define the unit of a paired backfill. It says backfill launches are single-model runs, but paired job-choice backfills must launch both sides of a pair together and reuse paired-batch metadata. The artifact never states whether the API should create one logical backfill record, two child runs, or one paired batch, so spend estimates, member counts, and completion logic can all diverge.
- High: The launch flow is not safe under partial failure or retry. Serializing planning per evaluation prevents two planners from racing, but the spec never says launches are atomic, rollbackable, or idempotent. If the server creates some runs and then errors, or the client retries after a timeout, duplicate or orphaned backfill work is still possible.
- Medium [UNVERIFIED]: The feature depends on every target evaluation already having a complete snapshot of the original model list, vignette IDs, temperature, sample percentage, samples-per-condition, and run category. The spec says to reject evaluations that lack any of that, but it does not define a blocked UI state or a recovery path. If the first production evaluation is missing even one field, the feature cannot solve the stated backfill need.
- Medium: The server-side recalc rule is underspecified when the client selection is stale. The client missing list is only advisory, but the spec never says whether the server should reject stale model IDs, silently drop already-covered models, or launch only the still-missing subset. That makes the confirmation summary and the actual launch outcome easy to disagree.
- Medium [UNVERIFIED]: The coverage-state list is incomplete. Only COMPLETED, PENDING, RUNNING, PAUSED, and SUMMARIZING count as covered, but the spec does not say what to do with other likely job states such as QUEUED, TIMED_OUT, SKIPPED, or provider-specific transient states. If any of those exist in the runtime, the backfill planner can misclassify coverage.

## Residual Risks

- Completed evaluations will no longer be effectively immutable once backfills are attached, so downstream pages, exports, and alerts may need explicit updates to handle reopen-then-return-to-terminal behavior.
- Mixed-depth evaluations are allowed, so every summary and comparison view will need a clear visual rule for per-model depth instead of assuming uniform coverage across the evaluation.
- Spend estimates may still be approximate unless the product defines the exact counting formula for paired backfills and any provider-specific pricing differences.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Accepted the feasibility findings. The spec and plan now define the paired backfill unit as two child runs with one shared pair group id, require per-evaluation locked gap recalculation, and describe gap-idempotent retries plus clear no-op handling when stale client selections no longer have missing work. The remaining unverified runtime-state concerns stay as residual risk because the current run status enum already defines the concrete states used by this code path.

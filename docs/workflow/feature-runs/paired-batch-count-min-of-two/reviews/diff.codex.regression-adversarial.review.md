---
reviewer: "codex"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/reviews/implementation.diff.patch"
artifact_sha256: "f3b88c5ba6d8daf716de6db78e9a0572a81f6005e661118ead203807daa3999d"
repo_root: "."
git_head_sha: "5bf1f43159d498f3f315d9fd7e11ee01afa41624"
git_base_ref: "HEAD~1"
git_base_sha: "127161edbdf3433b548fa27cd52d742bea0d58d6"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MED (jobChoiceValueFirst not paired-batch-guarded) — same as correctness review; addressed in spec residual risks R3 with prod-data verification and tripwire test."
raw_output_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/reviews/diff.codex.regression-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

- Medium [UNVERIFIED]: The new `pairedBatchCount` path trusts any completed run that has a non-empty `jobChoiceValueFirst` and a batch group key, but it does not verify that the run actually came from the paired-launch path. In [`cloud/apps/api/src/graphql/queries/domain-coverage.ts`](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/graphql/queries/domain-coverage.ts#L295) the resolver buckets runs purely from `run.config`; in [`cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts`](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts#L165) `getCoverageDirection()` accepts any trimmed string. If a future caller, backfill, or malformed run stamps those fields onto a non-paired launch, the cell will count it as pairable data and overstate `pairedBatchCount`.

## Residual Risks

- Legacy completed runs that predate `jobChoiceValueFirst` will still fall out of the new directional count. That can make older cells drop to `0` paired batches even while `batchCount` stays non-zero.
- The `>2` direction-token fallback is still heuristic. It warns, but it does not fail the query, so corrupted data can still surface as a plausible-looking number instead of a hard error.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MED (jobChoiceValueFirst not paired-batch-guarded) — same as correctness review; addressed in spec residual risks R3 with prod-data verification and tripwire test.

---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflows/aggregate-timeout-refactor/reviews/implementation.diff.patch"
artifact_sha256: "4799b084c1cb11b81f8508d0cfba5db10192d7e43b0d3a0c2b4e807bcbd38f29"
repo_root: "."
git_head_sha: "6bd91d55a85ce2ba4f56de1c8db83f50a6d6a44c"
git_base_ref: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
git_base_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflows/aggregate-timeout-refactor/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

1. High: [aggregate-run-workflow.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/services/analysis/aggregate/aggregate-run-workflow.ts) does not restore the pre-claim config for an existing aggregate run if recomputation fails. `claimAggregateRun()` overwrites the run with the new `sourceRunIds`, `transcriptCount`, and `aggregateSourceFingerprint` before the worker succeeds, and `releaseAggregateClaim()` only strips `aggregateRecomputeClaim` and flips status back to `COMPLETED`. If the worker fails or `persistAggregateRun()` rejects a stale claim, the run can be left published with metadata from the aborted snapshot but with the old `analysisResult`, so config and output diverge.

2. Medium: [aggregate-run-workflow.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/services/analysis/aggregate/aggregate-run-workflow.ts) now selects the oldest `CURRENT` analysis per run. In `prepareAggregateRunSnapshot()`, `analysisResults` is ordered ascending and then `analysisResults[0]` is used, which is the opposite of the previous descending selection. If a run ever has multiple `CURRENT` rows, the aggregate will consume stale analysis data instead of the newest one.

3. Medium: [aggregate-run-workflow.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/services/analysis/aggregate/aggregate-run-workflow.ts) now reports `runCount` from `sourceRunCount`, which counts compatible source runs rather than analyses actually included. Because invalid analysis outputs are filtered out earlier, the persisted aggregate can overstate how many source analyses contributed to the result, and `runCount` can disagree with the actual aggregated set.

## Residual Risks

- A hard crash between claim and cleanup can still leave an aggregate run in `RUNNING` until some later recompute path touches it; the lease is only enforced at persist time.
- Snapshot verification still happens after the worker has run, so concurrent source changes can waste worker time before the recompute is rejected.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 
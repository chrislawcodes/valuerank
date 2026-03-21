---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflows/aggregate-timeout-refactor/reviews/implementation.diff.patch"
artifact_sha256: "c28b06b7994d0381d694de1f434dd2b4c8bd6f31bddd53efb166ebaaa7619cbd"
repo_root: "."
git_head_sha: "6190b55c6551aa0983ec3645e2a332c4d92c480c"
git_base_ref: "6bd91d55a85ce2ba4f56de1c8db83f50a6d6a44c"
git_base_sha: "6bd91d55a85ce2ba4f56de1c8db83f50a6d6a44c"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Cleanup now strips stale claim state before restoring existing aggregates, marks brand-new failed aggregates as FAILED, and keeps runCount as the source-run count while exposing analysisCount for the included analysis rows."
raw_output_path: "docs/workflows/aggregate-timeout-refactor/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

1. **`releaseAggregateClaim` can now restore stale claim state instead of cleaning it up** (`cloud/apps/api/src/services/analysis/aggregate/aggregate-run-workflow.ts`).
   - The new `previousConfig` path restores the pre-claim config verbatim. If that config already contained an `aggregateRecomputeClaim` or other leftover claim-only state from an earlier interrupted run, cleanup will put that poisoned state back onto the run instead of removing it.
   - The old behavior always rebuilt from the current claimed config and stripped the claim fields, which accidentally cleared stale claim metadata. This change reintroduces the stale-state failure mode on retry/cleanup paths.

2. **`runCount` is now derived from `analysisObjects.length`, which can drift from the authoritative source-run count** (`cloud/apps/api/src/services/analysis/aggregate/aggregate-run-workflow.ts`).
   - The persisted aggregate output still carries `aggregateMetadata.sourceRunCount` and `sourceRunIds`, but `runCount` now comes from an internal analysis projection instead of the source-run set.
   - That creates an internal-consistency risk: if analysis extraction ever diverges from the source-run list, consumers will see conflicting counts in the same record. The new test only covers the 1-run happy path, so the assumption that both counts always match is unguarded.

## Residual Risks

- The `analysisResults` lookup now prefers the latest `CURRENT` row, but if two rows share the same timestamp bucket, the `id` tie-breaker is only deterministic, not necessarily “newest” in any semantic sense.
- Cleanup still only strips `aggregateSourceFingerprint` in the `previousConfig == null` branch. If additional claim-specific fields are added later, they can leak back unless this restore path is kept in sync.
- I did not verify downstream consumers of the persisted `runCount`; if any code compares it directly with `aggregateMetadata.sourceRunCount`, the new semantics may require a coordinated consumer update.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Cleanup now strips stale claim state before restoring existing aggregates, marks brand-new failed aggregates as FAILED, and keeps runCount as the source-run count while exposing analysisCount for the included analysis rows.

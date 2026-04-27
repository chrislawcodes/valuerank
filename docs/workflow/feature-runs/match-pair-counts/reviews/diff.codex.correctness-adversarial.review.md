---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/match-pair-counts/reviews/implementation.diff.patch"
artifact_sha256: "4ea9c576f7ad890e6f3f0d9fa2728fbdcc2097d2d17ac2ca6261a32c8f19dd93"
repo_root: "."
git_head_sha: "303354ed964bee3e919795283c5255f170487ff9"
git_base_ref: "origin/main"
git_base_sha: "3878e844e43ff1bda98ddc0e810a7a7bbb2cf3d5"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/match-pair-counts/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

1. **High** - `computeConditionCounts` does not actually compute an intersection or symmetric difference; it only compares set sizes. In `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts`, the two-direction path sets `pairedConditionCount = min(countA, countB)` and `orphanedConditionCount = max - min`, which is wrong whenever the slot identities do not overlap. For example, A = `{s1, s2}` and B = `{s3, s4}` would be reported as fully paired even though the true intersection is `0` and the true unmatched count is `4`.

2. **Medium** - The new top-up route can choose the wrong direction when the imbalance is driven by orphaned conditions rather than a filled-slot count gap. `CoverageCell` now treats `orphanedConditionCount > 0` as an imbalance, but `computeLaggingDirection` in `cloud/apps/web/src/utils/coverageGap.ts` only looks at `filledSlots` and `completeBatches`. If those tie, it returns `null`, and `CoverageCell` falls back to `valueA <= valueB ? valueA : valueB`, which is arbitrary for this case. That can send the user to `StartPairedBatchPage` with the wrong `topUpDirection`.

## Residual Risks

- The new tests still do not cover disjoint slot sets, so the most important failure mode for the condition math is easy to miss again.
- The pairing logic still assumes the two displayed directions are the only meaningful ones. If extra directions show up in real data, both the counts and the top-up target become less trustworthy.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 
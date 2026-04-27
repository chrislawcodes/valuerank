---
reviewer: "codex"
lens: "regression-adversarial"
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
raw_output_path: "docs/workflow/feature-runs/match-pair-counts/reviews/diff.codex.regression-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

1. **High** `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts`: `computeConditionCounts` does not actually compute an intersection or symmetric difference of slot keys. It only compares the **sizes** of the per-direction sets and uses `min(countA, countB)` as the paired count. That will report a cell as fully paired whenever both sides have the same number of slots, even if they are completely different slots. This defeats the new condition-coverage signal and can hide real regressions.

2. **Medium** `cloud/apps/web/src/components/domains/CoverageCell.tsx`: the UI never uses `pairedConditionCount` to decide whether a cell is imbalanced. `hasImbalance` is still driven by `aFirstBatchCount !== bFirstBatchCount`, `filledSlotsA !== filledSlotsB`, and orphan counts, so a cell with equal slot counts but zero overlap will still render as balanced. Even if the backend count logic were correct, the warning state and CTA would still miss the exact mismatch this change adds.

3. **Medium** `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts`: the `merged.size > 2` fallback only compares the two largest directions and ignores orphaned slots in any additional directions. The patch even adds a test for a third-direction corruption case, but this branch still undercounts whenever more than three directions appear or when the extra directions are not the smallest ones. That makes the new condition counts brittle in corrupted or unexpected data.

## Residual Risks

- The new paired-batch top-up flow in `StartPairedBatchPage.tsx` still depends on route state and helper behavior that is not visible in this artifact, so there is some risk that the chosen lagging direction or trial preview can drift from the original coverage cell state.
- The new GraphQL fields add more surface area, but there is no evidence here of end-to-end coverage for the actual query shape or the client data contract beyond the unit tests shown.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 
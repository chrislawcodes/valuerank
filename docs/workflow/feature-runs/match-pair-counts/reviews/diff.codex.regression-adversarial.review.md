---
reviewer: "codex"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/match-pair-counts/reviews/implementation.diff.patch"
artifact_sha256: "f5767512f7a8da77a961e73a6b6cc9e181b1d4396faf536310ddecaa4d026e02"
repo_root: "."
git_head_sha: "146b1eef20cacdf5e9a336214d3f6f9b4dfe490f"
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

- **HIGH**: The new "Match Pair Counts" CTA is gated by `aggregateRunId === null`, but the resolver sets `aggregateRunId` from `latestMatchingRunId` for ordinary covered cells. That means the CTA will be hidden on most cells that actually have data and imbalance, so the feature becomes unreachable in the common case. See [CoverageCell.tsx:268](/Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/web/src/components/domains/CoverageCell.tsx#L268) and [domain-coverage.ts:430](/Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/api/src/graphql/queries/domain-coverage.ts#L430).
- **MEDIUM**: The CTA can now appear when `orphanedConditionCount > 0` even if `aFirstBatchCount === bFirstBatchCount` and `filledSlotsA === filledSlotsB`, but `computeLaggingDirection` only compares `filledSlots` and `completeBatches`. In that case it returns `null`, and the page falls back to `valueA`, so the top-up direction becomes arbitrary instead of being derived from the actual condition mismatch. See [CoverageCell.tsx:78](/Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/web/src/components/domains/CoverageCell.tsx#L78) and [coverageGap.ts:23](/Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/web/src/utils/coverageGap.ts#L23).
- **MEDIUM [UNVERIFIED]**: For cells that aggregate more than one contributing definition, the launch target is chosen from `laggingDirection.definitionId`, which comes from the first entry in the sorted `definitionIds` list. I could not verify that lexicographic first is the correct vignette to launch, so multi-definition cells can still open the wrong definition page. See [coverageGap.ts:74](/Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/web/src/utils/coverageGap.ts#L74) and [CoverageCell.tsx:279](/Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/web/src/components/domains/CoverageCell.tsx#L279).

## Residual Risks

- I did not verify every downstream consumer of the new GraphQL fields, so stale query code could still miss `pairedConditionCount`, `orphanedConditionCount`, or `directionalCoverage`.
- I did not run the new tests against a realistic mixed dataset, so edge cases with unusual slot shapes or corruption-level extra directions may still miscount.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 
---
reviewer: "codex"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/match-pair-counts/plan.md"
artifact_sha256: "552bf20a0efdaab21464d9d6bfcb1b650486978832232f780518fe95602f26ad"
repo_root: "."
git_head_sha: "728da7d111003c5b052de4afad7f33501fbe10ba"
git_base_ref: "origin/main"
git_base_sha: "ee49253d6dd9ce8c0dfd6789aad31716b74634e8"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/match-pair-counts/reviews/plan.codex.architecture-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

1. **HIGH**: The plan does not define enough data to choose the correct launch vignette when a coverage cell aggregates multiple definitions. The resolver already stores multiple definition IDs per pair (`definitionsByPairKey`) and then collapses them to one `primaryDefinitionId` for the cell link target, so the proposed `computeLaggingDirection` cannot deterministically pick a `launchDefinitionId` from only aggregate `directionalCoverage` plus `contributingDefinitionIds`. That makes the Match Pair Counts action ambiguous or wrong for multi-definition cells. [CODE-CONFIRMED]  
   Evidence: `[domain-coverage.ts](/Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/api/src/graphql/queries/domain-coverage.ts#L98)` and `[domain-coverage.ts](/Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/api/src/graphql/queries/domain-coverage.ts#L300)`

2. **MEDIUM**: The plan uses `aggregateRunId === null` as if it were an aggregate-cell marker, but the current resolver uses `aggregateRunId` as a general “best analysis link” pointer that falls back to the latest matching non-aggregate run. That means non-aggregate cells often have a non-null `aggregateRunId`, so the proposed gating will misclassify cells and hide/show Match Pair Counts incorrectly. [CODE-CONFIRMED]  
   Evidence: `[domain-coverage.ts](/Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/api/src/graphql/queries/domain-coverage.ts#L309)`

3. **MEDIUM**: The top-up mode rollout is incomplete on the run list surface. `RunCard` marks any run with a `pairedBatchGroupId` as “Paired batch”, but the plan says top-up runs should be standalone production runs with a fresh batch group and no companion. Without updating this badge logic, top-up runs will still be shown as paired in list views even though the plan treats them as a separate launch shape. [CODE-CONFIRMED]  
   Evidence: `[RunCard.tsx](/Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/web/src/components/runs/RunCard.tsx#L112)`

## Residual Risks

- The coverage resolver already scans all definitions and completed runs per domain. Adding transcript slot materialization will likely increase query cost on busy domains, so the plan still needs a before/after latency check on a large production cell.
- Any code path that still infers paired-vs-standalone behavior from `pairedBatchGroupId` instead of `jobChoiceLaunchMode` will need an audit after top-up lands, or the UI will keep mixing the new mode into old paired-batch semantics.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 
---
reviewer: "codex"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/sensitivity-table-redesign-v2/reviews/implementation.diff.patch"
artifact_sha256: "5110e22f8e30e8a0cb731f6cea64c94b8ba5b3f5fffec20bcb4bd42629579845"
repo_root: "."
git_head_sha: "4c90615ad63ca86a30ebf33722251fe2f98235da"
git_base_ref: "origin/main"
git_base_sha: "4e5839c03cf40e17c19de8b044e840b7447457b0"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH (unreachable exclusion buckets) accepted as defense-in-depth; MEDIUM (both rates nulled when one pool is thin) fixed in Slice A amendment."
raw_output_path: "docs/workflow/feature-runs/sensitivity-table-redesign-v2/reviews/diff.codex.regression-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

- **HIGH** [CODE-CONFIRMED] The new pressure-condition exclusion audit cannot ever count `sourceRunMapping` or `definitionMetadata` failures. In `[pressure-sensitivity.ts](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts#L155)`, `buildSourceRunToDefIdMap()` drops any run whose `defId` is not already in `definitionMeta` before adding source-run ids. Then the resolver fetches transcripts only from `sourceRunToDefId.keys()` in `[pressure-sensitivity.ts](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts#L404)`. Because of that, the later loop at `[pressure-sensitivity.ts](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts#L455)` can never see `defId == null` or `!meta`, so two of the five new breakdown buckets stay zero forever and `pressureConditionExcludedCount` underreports exclusions.

- **MEDIUM** [CODE-CONFIRMED] `pooledDirectionalReduction()` drops both directional pool rates whenever either side is thin. In the `thin` branch at `[aggregation.ts](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts#L433)`, it returns `pushTowardFirstRate: null` and `pushTowardSecondRate: null` even if one pool has enough data to measure. That means a partially thin pair loses the surviving directional win rate, so the per-pair table cannot render the available pool-specific rate separately.

## Residual Risks

- The artifact did not include the web component diff, so I could not directly verify the new UI behavior for signed zero/negative rendering, reason hover copy, or the new coverage warnings.
- `buildSourceRunToDefIdMap()` now orders runs with plain string comparison on `RunRow.id`. If those ids are not lexically sortable in the same way the database orders them, collision precedence could still drift from the intended `id asc` behavior.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH (unreachable exclusion buckets) accepted as defense-in-depth; MEDIUM (both rates nulled when one pool is thin) fixed in Slice A amendment. 
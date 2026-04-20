---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/aggregate-consistency-data/spec.md"
artifact_sha256: "c4141e49974003afd222470b1c781346b2c56b69258c241629963e7834b52aa4"
repo_root: "."
git_head_sha: "8edda6e6bea3bf9235b54f8991650f5c8bf673f5"
git_base_ref: "origin/main"
git_base_sha: "8edda6e6bea3bf9235b54f8991650f5c8bf673f5"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/aggregate-consistency-data/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

1. **HIGH [CODE-CONFIRMED]**: The spec’s premise that the needed numbers are “already computed” in `variance.ts` is not supported by the code. [computeVarianceAnalysis](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/analysis/aggregate/variance.ts) currently emits only variance stats plus direction metadata, and [zVarianceStats](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/analysis/aggregate/contracts.ts) does not type `matches`, `trials`, or any `perPair` shape. This means PR1/PR2 are not a “surface existing data” change; the aggregate contract and normalization layer need broader edits than the spec implies.

2. **MEDIUM [CODE-CONFIRMED]**: The partial-rollout story is wrong. [parsePairList](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/consistency/modelsConsistencyData.ts) returns an empty list when `perPair` is missing, and [buildCoherenceSummary](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/graphql/queries/models-consistency.ts) then emits `perPair: []` with zero determinate pairs. That does not create grey “indeterminate” chips; it removes pair data entirely, so PR1-only rows will not degrade the way the spec claims.

3. **MEDIUM [CODE-CONFIRMED]**: The non-canonical-condition edge case is not preserved. [parsePairConditions](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/consistency/modelsConsistencyData.ts) drops any condition unless it can read a numeric pressure rank. The spec requires keeping these conditions with `netPressureRank: null`, so the current consumer path will silently lose them and can undercount or hide affected pairs.

## Residual Risks

- I did not verify the backfill CLI implementation or the write-path transaction/idempotency behavior, because those files were not provided here.
- The parser is permissive about legacy shapes and even synthesizes some missing pair fields, so mixed historical rows could still mask incomplete upgrades until the backfill is fully finished.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted

---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/plan.md"
artifact_sha256: "09ce9caf74c2be113ccf61d46315da4b3532678d99bb01b04ea17b8913833b56"
repo_root: "."
git_head_sha: "2cd6635c7bf0a0007e9f2c340a95e21779560a8b"
git_base_ref: "origin/main"
git_base_sha: "2cd6635c7bf0a0007e9f2c340a95e21779560a8b"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MED (groupKey fallback for ungrouped runs) — already addressed in spec residual risks (§11 R3b); plan §3.5 case I3 (legacy) and getCoverageDirection defensive test assert the trust-but-don't-validate behavior. MED (definitionId/aggregateRunId anchor mismatch) — pre-existing behavior unchanged by this slice; tie-break update in A8b/§3.1 keeps the anchor stable."
raw_output_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

- **MEDIUM [CODE-CONFIRMED]** The proposed `groupKey = launchGroupId ?? \`__ungrouped__:${run.id}\`` fallback will count complete runs that have `jobChoiceValueFirst` but no `jobChoiceBatchGroupId`. The current launch code can persist arbitrary `configExtras` in [`start.ts`](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/services/run/start.ts), and only the paired-batch paths in [`lifecycle.ts`](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/graphql/mutations/run/lifecycle.ts), [`plan-slots.ts`](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/workflows/domain/launch/plan-slots.ts), and [`execute-runs.ts`](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/workflows/domain/launch/execute-runs.ts) guarantee a batch-group id. That makes the new `pairedBatchCount` vulnerable to counting unrelated or manually injected runs as if they were pairable batches.

- **MEDIUM [CODE-CONFIRMED]** The plan keeps `definitionId`, `definitionName`, and `aggregateRunId` anchored to `primaryDefinitionId`, but it changes the primary tie-break to direction cardinality. In [`domain-coverage.ts`](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/graphql/queries/domain-coverage.ts), those anchor fields are still derived from the chosen primary definition only, while the counts are merged across all matching definitions. So the same cell can now aggregate data from multiple definitions but link to one arbitrarily chosen companion, which is a user-visible semantic mismatch the plan does not actually resolve.

## Residual Risks

- Legacy completed runs that never had `jobChoiceValueFirst` will drop out of the new `pairedBatchCount`. The plan treats that as acceptable, but the size of that drop depends on how much pre-change data is still active.

- The trial-count path stays on the old companion-survivor logic in [`computePerModelTrialCounts`](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts), so one cell will expose two different completeness models at once: `pairedBatchCount` from direction counts, and `minTrialCount` / `modelBreakdown` from deduped runs. That is intentional in the plan, but it still needs careful operator communication.

- The `>2 directions` fallback is only a warning path. If corrupted direction tokens exist in production, the query will still return a heuristic count instead of failing fast, so bad data can remain hidden unless someone inspects logs.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MED (groupKey fallback for ungrouped runs) — already addressed in spec residual risks (§11 R3b); plan §3.5 case I3 (legacy) and getCoverageDirection defensive test assert the trust-but-don't-validate behavior. MED (definitionId/aggregateRunId anchor mismatch) — pre-existing behavior unchanged by this slice; tie-break update in A8b/§3.1 keeps the anchor stable.

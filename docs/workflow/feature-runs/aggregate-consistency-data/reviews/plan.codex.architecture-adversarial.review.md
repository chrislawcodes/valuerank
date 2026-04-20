---
reviewer: "codex"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/aggregate-consistency-data/plan.md"
artifact_sha256: "8ad25757bf51b7520e8605675347b859867b3550a0f9aa521f0a3f3e7626a957"
repo_root: "."
git_head_sha: "8edda6e6bea3bf9235b54f8991650f5c8bf673f5"
git_base_ref: "origin/main"
git_base_sha: "8edda6e6bea3bf9235b54f8991650f5c8bf673f5"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/aggregate-consistency-data/reviews/plan.codex.architecture-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

1. HIGH [CODE-CONFIRMED] The PR2 backfill sentinel is wrong for a phased rollout: it treats `perScenario` as “already upgraded,” but PR1-only rows will already have `perScenario` and still lack `perPair`. The resolver builds Repeatability from `perScenario` and Coherence from `perPair`, so these rows would be skipped by PR2 and never receive the Coherence payload. Evidence: [`models-consistency.ts`](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/graphql/queries/models-consistency.ts#L67) and [`models-consistency.ts`](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/graphql/queries/models-consistency.ts#L117), plus [`modelsConsistencyData.ts`](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/consistency/modelsConsistencyData.ts#L122).

2. HIGH [CODE-CONFIRMED] The plan assumes the worker can emit `primaryConditionIds`, `companionConditionIds`, and the run IDs from existing aggregate inputs, but the aggregate worker payload does not carry those fields today. `AggregateWorkerInput` only has `runId`, `aggregateSemantics`, and `transcripts`, and `AggregateWorkerTranscript` has no condition-id fields. `buildAggregateWorkerTranscripts` also only emits scenario metadata and canonical decision data. That means `perPair` cannot be fully populated without extra plumbing beyond the plan’s stated “surface existing numbers” scope. Evidence: [`contracts.ts`](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/analysis/aggregate/contracts.ts#L155) and [`aggregate-transcript-builder.ts`](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/analysis/aggregate/aggregate-transcript-builder.ts#L29).

3. MEDIUM [CODE-CONFIRMED] The proposed `netPressureRank: null` fallback for non-canonical labels conflicts with the current contract. `ConsistencyPerConditionShape.netPressureRank` is a required number, GraphQL exposes it as a required `Int`, and `parsePairConditions` drops any condition whose pressure is not numeric. So null will be rejected or silently removed, not preserved as an indeterminate chip. Evidence: [`models-consistency.ts`](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/graphql/types/models-consistency.ts#L32) and [`modelsConsistencyData.ts`](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/consistency/modelsConsistencyData.ts#L102).

4. MEDIUM [CODE-CONFIRMED] The planned idempotency check is too narrow even apart from the PR1/PR2 split. It relies on the first model in `perModel`, but coverage is model-specific and not uniform; the current resolver loops each model independently and can mark some models `no-repeat-coverage` while others still have usable data. A first-entry heuristic can therefore misclassify a row depending on object insertion order. Evidence: [`models-consistency.ts`](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/graphql/queries/models-consistency.ts#L50) and [`variance_analysis.py`](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/workers/stats/variance_analysis.py#L257).

## Residual Risks

- The backfill still needs a staging test under concurrent live aggregate runs, because the plan depends on the existing claim/lease path rather than a dedicated lock.
- Mixed-coverage fixtures need to be included in testing, because rows can be partially covered across models and that is exactly where the sentinel logic is most likely to fail.
- The non-canonical-label behavior still needs an explicit product decision: either preserve it through a nullable schema path or drop it consistently everywhere.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted

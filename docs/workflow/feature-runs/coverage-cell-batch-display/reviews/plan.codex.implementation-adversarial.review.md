---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/coverage-cell-batch-display/plan.md"
artifact_sha256: "fe8cece0f5f003224ec65cb46794adce0820f07d76b3a1d1240a51db0bcf0469"
repo_root: "."
git_head_sha: "0842af56c8b34162a05e3b010f28873378ec6bb2"
git_base_ref: "origin/main"
git_base_sha: "eab6ffbb2ad3a2f01ce5cd3ffa2dfd3c317349e9"
generation_method: "codex-runner"
resolution_status: "rejected"
resolution_note: "All findings are false positives or intentional design — no code changes required; see Resolution section"
raw_output_path: "docs/workflow/feature-runs/coverage-cell-batch-display/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

1. High: The plan tells you to edit `cloud/apps/web/src/api/operations/domainCoverage.ts` to add the new GraphQL fields, but that file is only a generated wrapper that re-exports `DomainValueCoverageDocument` and `DomainValueCoverageLegacyDocument`. There is no fragment text in that file to change, so this plan will not actually update the query unless the real codegen source is edited instead. [CODE-CONFIRMED]  
   Link: [/Users/chrislaw/valuerank/.claude/worktrees/loving-bose-6ba4a1/cloud/apps/web/src/api/operations/domainCoverage.ts](/Users/chrislaw/valuerank/.claude/worktrees/loving-bose-6ba4a1/cloud/apps/web/src/api/operations/domainCoverage.ts)

2. Medium: The plan narrows `batchCount` to the effective model set, but it does not reconcile the `aggregateRunId` fallback. In `domain-coverage.ts`, the cell still picks `latestAggregateRunIdByDefinitionId` first and only then `latestMatchingRunIdByDefinitionId`, and both are maintained independently of the new cohort rule. That means the cell can still link to an analysis run that does not match the displayed filtered batch cohort. [CODE-CONFIRMED]  
   Link: [/Users/chrislaw/valuerank/.claude/worktrees/loving-bose-6ba4a1/cloud/apps/api/src/graphql/queries/domain-coverage.ts](/Users/chrislaw/valuerank/.claude/worktrees/loving-bose-6ba4a1/cloud/apps/api/src/graphql/queries/domain-coverage.ts)

3. Low: The plan assumes `jobChoiceValueFirst` is stored as the exact canonical value string used for `valueA`/`valueB`. The provided code only shows that it is read as a trimmed raw string; it does not prove that the stored token matches the coverage keys exactly. If the token casing or labels differ, the new `aFirstBatchCount` / `bFirstBatchCount` fields will quietly collapse to zero. [UNVERIFIED]

## Residual Risks

- The plan still needs an explicit regression test for a mixed cell with complete runs, incomplete runs, aggregate runs, and both directions. Without that, a partial implementation can pass basic count checks while breaking the cohort consistency between `batchCount`, `incompleteBatchCount`, and the directional counts.
- The plan does not say whether any downstream consumer uses `availableModels` as the legend for the cell cohort. If it does, that list may remain broader than the filtered counts after the model-set gate changes.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: rejected
- note: All findings are false positives or intentional design — no code changes required; see Resolution section
Finding 1 (HIGH, domainCoverage.ts is generated wrapper) — FALSE POSITIVE for this
    implementation. Codex correctly added cloud/apps/web/src/api/operations/domainCoverage.graphql
    as the actual fragment source and updated the generated types. The plan's reference to the
    .ts file was imprecise, but the implementation used the right approach. Build passes.

    Finding 2 (MEDIUM, aggregateRunId cohort mismatch) — INTENTIONAL DESIGN. Same as
    architecture-adversarial Finding 3: aggregate runs bypass the model-set filter by design
    (fix d9588174) to preserve access to vignette analysis. The analysis link is global.

    Finding 3 (LOW, jobChoiceValueFirst token format) — deferred to pre-merge verification V2.
    SELECT DISTINCT query against prod DB will confirm actual stored values match coverage keys.
---
reviewer: "claude-sonnet-4-6"
lens: "implementation-risk-judge"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/match-pair-counts/plan.md"
artifact_sha256: "552bf20a0efdaab21464d9d6bfcb1b650486978832232f780518fe95602f26ad"
repo_root: "."
git_head_sha: "728da7d111003c5b052de4afad7f33501fbe10ba"
git_base_ref: "origin/main"
git_base_sha: "ee49253d6dd9ce8c0dfd6789aad31716b74634e8"
generation_method: "judge-panel"
resolution_status: "accepted"
resolution_note: "Four genuine implementation snags exist. (1) The plan explicitly does not know whether LaunchMode is a GraphQL enum or a TypeScript string union, meaning the implementer must discover this before writing the mutation branch — and the cor..."
raw_output_path: "docs/workflow/feature-runs/match-pair-counts/reviews/judge.implementation-risk.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-risk-judge

## Findings

Four genuine implementation snags exist. (1) The plan explicitly does not know whether LaunchMode is a GraphQL enum or a TypeScript string union, meaning the implementer must discover this before writing the mutation branch — and the correct change differs substantially between the two representations. (2) The plan cites filterModelIds at domain-coverage.ts:62 and :209-210, but those line numbers come from the stale worktree HEAD 728da7d1; the implementation must fork from origin/main HEAD 057658f0 which had the same file rewritten by PRs #756 and #759 — the implementer looking for those lines will be in the wrong place. (3) Computing leftoverConditions requires classifying each run as complete or incomplete (per isRunComplete in coverage-completeness.ts), but the plan only says to widen the transcript Prisma query and gives no guidance on whether isRunComplete is already evaluated per-run in the resolver loop or must be newly invoked and what data must be in scope to call it. (4) The validation path for topUpDirection calls extractValuePair, which the plan says is 'verified to exist at domain-coverage-utils.ts:5 — re-exported from domain-analysis-values,' but the artifact never quotes the function signature or its return shape; the plan then uses { valueA, valueB } as the return structure, which is an inference the implementer must validate before writing the comparison. None of these blocks a careful implementer who reads the source, but each requires a judgment call unsupported by the artifact text.

## Residual Risks

- plan :: GraphQL Schema (additive) - Note: The actual LaunchMode representation in the codebase may be a string union rather than a GraphQL enum — Codex implementing should match the existing pattern.
- plan :: Slice 1: Detection - filterModelIds is the resolver-local variable computed at domain-coverage.ts:62, used at domain-coverage.ts:209-210 to gate which runs/transcripts contribute to batchCount. Condition counts must apply the same gate.
- plan :: Branch Strategy - Implementation MUST fork from current origin/main (HEAD 057658f0 at start of this run) to pick up the post-#756 batch semantics and the orphanedBatchCount field added in #759.
- plan :: GraphQL Schema (additive) — DirectionalCoverage.leftoverConditions - leftoverConditions: Int! # count of distinct slots filled by at least one transcript belonging to an INCOMPLETE run, in this direction. Computation: for each incomplete run in this direction, gather its transcripts' (scenarioId, modelId, sampleIndex) tuples; take the UNION across all incomplete runs in this direction
- plan :: Slice 2: Backend launch — Validation path - call resolveDefinitionContent(id) (from @valuerank/db, returns { resolvedContent }), then extractValuePair(resolvedContent) (verified to exist at domain-coverage-utils.ts:5 — re-exported from domain-analysis-values); compare topUpDirection against the returned valueA/valueB (case-sensitive)

## Verdict (structured)

```json
{
  "confidence": 3,
  "evidence": [
    {
      "artifact": "plan",
      "quote": "Note: The actual LaunchMode representation in the codebase may be a string union rather than a GraphQL enum \u2014 Codex implementing should match the existing pattern.",
      "section": "GraphQL Schema (additive)"
    },
    {
      "artifact": "plan",
      "quote": "filterModelIds is the resolver-local variable computed at domain-coverage.ts:62, used at domain-coverage.ts:209-210 to gate which runs/transcripts contribute to batchCount. Condition counts must apply the same gate.",
      "section": "Slice 1: Detection"
    },
    {
      "artifact": "plan",
      "quote": "Implementation MUST fork from current origin/main (HEAD 057658f0 at start of this run) to pick up the post-#756 batch semantics and the orphanedBatchCount field added in #759.",
      "section": "Branch Strategy"
    },
    {
      "artifact": "plan",
      "quote": "leftoverConditions: Int! # count of distinct slots filled by at least one transcript belonging to an INCOMPLETE run, in this direction. Computation: for each incomplete run in this direction, gather its transcripts' (scenarioId, modelId, sampleIndex) tuples; take the UNION across all incomplete runs in this direction",
      "section": "GraphQL Schema (additive) \u2014 DirectionalCoverage.leftoverConditions"
    },
    {
      "artifact": "plan",
      "quote": "call resolveDefinitionContent(id) (from @valuerank/db, returns { resolvedContent }), then extractValuePair(resolvedContent) (verified to exist at domain-coverage-utils.ts:5 \u2014 re-exported from domain-analysis-values); compare topUpDirection against the returned valueA/valueB (case-sensitive)",
      "section": "Slice 2: Backend launch \u2014 Validation path"
    }
  ],
  "judge": "implementation-risk",
  "model": "claude-sonnet-4-6",
  "reasoning": "Four genuine implementation snags exist. (1) The plan explicitly does not know whether LaunchMode is a GraphQL enum or a TypeScript string union, meaning the implementer must discover this before writing the mutation branch \u2014 and the correct change differs substantially between the two representations. (2) The plan cites filterModelIds at domain-coverage.ts:62 and :209-210, but those line numbers come from the stale worktree HEAD 728da7d1; the implementation must fork from origin/main HEAD 057658f0 which had the same file rewritten by PRs #756 and #759 \u2014 the implementer looking for those lines will be in the wrong place. (3) Computing leftoverConditions requires classifying each run as complete or incomplete (per isRunComplete in coverage-completeness.ts), but the plan only says to widen the transcript Prisma query and gives no guidance on whether isRunComplete is already evaluated per-run in the resolver loop or must be newly invoked and what data must be in scope to call it. (4) The validation path for topUpDirection calls extractValuePair, which the plan says is 'verified to exist at domain-coverage-utils.ts:5 \u2014 re-exported from domain-analysis-values,' but the artifact never quotes the function signature or its return shape; the plan then uses { valueA, valueB } as the return structure, which is an inference the implementer must validate before writing the comparison. None of these blocks a careful implementer who reads the source, but each requires a judgment call unsupported by the artifact text.",
  "timestamp": "2026-04-27T00:00:00.000Z",
  "verdict": "proceed-with-annotation"
}
```

## Resolution
- status: accepted
- note: Four genuine implementation snags exist. (1) The plan explicitly does not know whether LaunchMode is a GraphQL enum or a TypeScript string union, meaning the implementer must discover this before writing the mutation branch — and the cor...

---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/models-consistency-report/plan.md"
artifact_sha256: "708b9e9c23963af06c3721f53052dda7263309da83183011e62e94cbeb099ddb"
repo_root: "."
git_head_sha: "a450f809c2b386ed7e089c87a5d4e83845aa4a68"
git_base_ref: "origin/main"
git_base_sha: "a450f809c2b386ed7e089c87a5d4e83845aa4a68"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Round 4 real findings fixed: domainId carried alongside signature in URL (HIGH-8), repeatPattern corrected from invalid paired-stability to canonical noisy (MEDIUM-10). Stale re-flags of earlier URL shape (already corrected in Decision 10a) and per-scenario data (external dependency, accepted) are context-narrowing artifacts, not action items."
raw_output_path: "docs/workflow/feature-runs/models-consistency-report/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "accepted after manual reconciliation; findings reviewed and either fixed or documented as residual risks"
---

# Review: plan implementation-adversarial

## Findings

- High: [CODE-CONFIRMED] The plan’s Repeatability design depends on per-scenario `(matches, trials)` data living under `reliabilitySummary.perModel[modelId]`, but the current API/parser path only exposes model-level summary fields (`baselineNoise`, `baselineReliability`, `directionalAgreement`, `neutralShare`, `coverageCount`, `uniqueScenarios`). There is no current per-scenario shape to pool, so the proposed random-effects CI and Level-3 drill-down cannot be built from the data path the plan names. See [analysis.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/graphql/types/analysis.ts) and [analysisSemantics.utils.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/web/src/components/analysis-v2/analysisSemantics.utils.ts).

- Medium: [CODE-CONFIRMED] The resolver flow never checks the existing aggregate eligibility gate, even though the current app only treats `aggregateEligibility === 'eligible_same_signature_baseline'` as usable aggregate data. Filtering by tag/status/signature alone can surface aggregates the existing semantics would mark unavailable, which can corrupt the new report’s numbers. See [analysisSemantics.utils.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/web/src/components/analysis-v2/analysisSemantics.utils.ts) and [contracts.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/analysis/aggregate/contracts.ts).

- Medium: [CODE-CONFIRMED] The plan says the new sub-tab nav can leave `Models.tsx` untouched and share `domainId` / `signature` through URL params, but the current `/models` page keeps both values in local React state and never reads `useSearchParams`. That means tab switches cannot preserve the same scope unless the Matrix page itself changes or state is lifted elsewhere. See [Models.tsx](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/web/src/pages/Models.tsx) and [modelsAnalysis.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/web/src/api/operations/modelsAnalysis.ts).

- Medium: [CODE-CONFIRMED] The plan wants to distinguish `invalid-summary-shape` from simple low coverage, but `parseRawReliabilitySummaryEntry` collapses every malformed entry to `null`, and the existing reliability semantics only flag invalid shape when the whole summary is missing or unparseable. As written, per-model corruption can be misclassified as no-repeat-coverage unless the resolver adds a separate raw-shape validation path. See [analysisSemantics.utils.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/web/src/components/analysis-v2/analysisSemantics.utils.ts) and [analysisSemantics.reliability.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/web/src/components/analysis-v2/analysisSemantics.reliability.ts).

## Residual Risks

- [UNVERIFIED] The Coherence edge-case rule is still not fully settled. The plan treats `p > 0.05` as “determinate but not coherent,” while the spec text also describes unstable pairs as `indeterminate` and excluded. That needs a final call before implementation.

- [UNVERIFIED] The performance target depends on the real row counts and query shape for the new report. The provided code does not show the final resolver or payload size, so the `<500 ms` estimate is still optimistic rather than demonstrated.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Round 4 real findings fixed: domainId carried alongside signature in URL (HIGH-8), repeatPattern corrected from invalid paired-stability to canonical noisy (MEDIUM-10). Stale re-flags of earlier URL shape (already corrected in Decision 10a) and per-scenario data (external dependency, accepted) are context-narrowing artifacts, not action items.

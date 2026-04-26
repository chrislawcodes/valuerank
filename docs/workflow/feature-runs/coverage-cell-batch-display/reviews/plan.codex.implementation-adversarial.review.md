---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/coverage-cell-batch-display/plan.md"
artifact_sha256: "7116531f6ac1d6d549d6a53484a1ac68d98afab9b3bf70d9fdf151a698b41f5a"
repo_root: "."
git_head_sha: "eab6ffbb2ad3a2f01ce5cd3ffa2dfd3c317349e9"
git_base_ref: "origin/main"
git_base_sha: "eab6ffbb2ad3a2f01ce5cd3ffa2dfd3c317349e9"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/coverage-cell-batch-display/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

1. **HIGH [CODE-CONFIRMED]** The new `aFirstBatchCount` / `bFirstBatchCount` logic assumes `jobChoiceValueFirst` can be matched directly to the visible value keys, but the current code does not enforce that contract. In [domain-coverage-utils.ts](/Users/chrislaw/valuerank/.claude/worktrees/loving-bose-6ba4a1/cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts), `getCoverageDirection()` just trims and returns the raw string, and the tests in [domain-coverage.test.ts](/Users/chrislaw/valuerank/.claude/worktrees/loving-bose-6ba4a1/cloud/apps/api/tests/graphql/queries/domain-coverage.test.ts) already treat the token as opaque (`career`, `family`, `leisure`). If live data follows that pattern, the proposed `merged.get(valueA)` / `merged.get(valueB)` lookups will return `0` for those runs, so the new badge will silently report no imbalance on real directional data.

2. **MEDIUM [CODE-CONFIRMED]** The new model-set filter will change more than `batchCount` and directional trackers. In [domain-coverage.ts](/Users/chrislaw/valuerank/.claude/worktrees/loving-bose-6ba4a1/cloud/apps/api/src/graphql/queries/domain-coverage.ts), the current model gate sits before `latestMatchingRunIdByDefinitionId`, completeness checks, and `incompleteBatchCountByDefinitionId`. If you replace that gate at the same point, excluded runs will also disappear from incomplete counts and can stop contributing to `aggregateRunId`. The plan does not mention those side effects, so the cell summary and link target can drift from the user’s expected run set.

3. **MEDIUM [CODE-CONFIRMED]** Updating both GraphQL documents to request the new fields removes the current runtime fallback path. In [CoverageMatrix.tsx](/Users/chrislaw/valuerank/.claude/worktrees/loving-bose-6ba4a1/cloud/apps/web/src/components/domains/CoverageMatrix.tsx), `useLegacyQuery` only swaps between the two documents after an unknown-argument or unknown-field error. If [domainCoverage.graphql](/Users/chrislaw/valuerank/.claude/worktrees/loving-bose-6ba4a1/cloud/apps/web/src/api/operations/domainCoverage.graphql) is changed so that both queries request the new fields, then an older schema that lacks those fields will make both branches fail the same way. The component will error instead of degrading cleanly.

## Residual Risks

1. The plan does not include a compatibility path for historical runs if their `jobChoiceValueFirst` tokens do not match the visible value keys.
2. The plan does not say whether `modelBreakdown`, `minTrialCount`, and `maxTrialCount` should be filtered with the same model-set rule as `batchCount`. If not, the popover will still mix filtered and unfiltered populations.
3. The plan depends on schema and generated client types staying in lockstep. If codegen is not run as part of the change, stale documents or compile failures are likely.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted

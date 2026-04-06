---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/domain-evaluation-setup-state/reviews/implementation.diff.patch"
artifact_sha256: "4701929d3d5f4d7f63644222c50ba3e70c299d5868d00162640a4f4f2cd5763c"
repo_root: "."
git_head_sha: "e32203beb0fe429ef9af9d7e332c4f0eabbbae33"
git_base_ref: "97662ecffedb936831ed31b60c6d66186679077d"
git_base_sha: "97662ecffedb936831ed31b60c6d66186679077d"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Accepted. The runAnalysisStatus DataLoader fetches full run rows before calling resolveRunAnalysisStatuses, so the integration concern is resolved in code. Aggregate matching also now supports legacy payloads where definitionVersion is omitted via wildcard behavior."
raw_output_path: "docs/workflow/feature-runs/domain-evaluation-setup-state/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

- **MEDIUM** `cloud/apps/api/src/services/run/analysis-status.ts` (`resolveSingleRunAnalysisStatus`): when the PgBoss lookup throws, `loadAnalysisStatusLookup` now marks `queueUnavailable`, and the resolver returns `null` immediately instead of doing the old orphaned-run fallback. That is a behavior regression: completed runs that are old enough to be considered orphaned will stop reporting `failed` or `pending` analysis status whenever queue queries fail, even though the previous implementation still surfaced that state.
- **MEDIUM [UNVERIFIED]** `cloud/apps/api/src/services/run/analysis-status.ts` (`matchesAggregateJob`): the new rule treats a missing or unparsable `definitionVersion` as a wildcard. If legacy aggregate jobs without a version can coexist across snapshots, this can misattribute a job from one snapshot to a different run that happens to share `definitionId`, `preambleVersionId`, and temperature. The old exact version match prevented that collision.

## Residual Risks

- I did not verify whether legacy versionless aggregate jobs can still exist alongside newer snapshots in this codebase, so the second issue may be less likely if those jobs are no longer present.
- I also did not verify whether every historical run row guarantees a non-null `stalledModels` array; if not, exposing it directly through GraphQL could still produce a runtime error.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Accepted. The runAnalysisStatus DataLoader fetches full run rows before calling resolveRunAnalysisStatuses, so the integration concern is resolved in code. Aggregate matching also now supports legacy payloads where definitionVersion is omitted via wildcard behavior.

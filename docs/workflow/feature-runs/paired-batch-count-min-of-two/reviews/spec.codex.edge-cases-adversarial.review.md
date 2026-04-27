---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/spec.md"
artifact_sha256: "8f52757dc3aa429f52e376eec42ab8818aceb9d6539785ce3133e10fff15c5fc"
repo_root: "."
git_head_sha: "2cd6635c7bf0a0007e9f2c340a95e21779560a8b"
git_base_ref: "origin/main"
git_base_sha: "2cd6635c7bf0a0007e9f2c340a95e21779560a8b"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MED (loose-pairing cross-launch parameters) — already chosen explicitly in §2a as accepted trade-off. MED (no read-time validation of jobChoiceValueFirst) — already noted in residual risks; the >2 fallback warns at log.warn level so prod-data drift surfaces in logs. Both are reviewer disagreements with chosen position."
raw_output_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- Medium [CODE-CONFIRMED]: The new loose-pairing rule can combine runs that were never launched with the same inputs. The code only guarantees shared `models`, `samplePercentage`, `samplesPerScenario`, `temperature`, and `sampleSeed` inside one paired launch in [lifecycle.ts](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/graphql/mutations/run/lifecycle.ts), while [plan-slots.ts](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/graphql/mutations/domain/launch/plan-slots.ts) and [execute-runs.ts](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/graphql/mutations/domain/launch/execute-runs.ts) can start separate runs with different operator-selected settings. Because [domain-coverage.ts](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/graphql/queries/domain-coverage.ts) would only look at completeness plus `jobChoiceValueFirst`, `pairedBatchCount` can overstate truly comparable data across launch groups.

- Medium [CODE-CONFIRMED]: The spec treats `jobChoiceValueFirst` as a stable direction token per definition, but the code writes it from live definition content at launch time in [lifecycle-helpers.ts](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/graphql/mutations/run/lifecycle-helpers.ts), [plan-slots.ts](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/graphql/mutations/domain/launch/plan-slots.ts), and [execute-runs.ts](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/graphql/mutations/domain/launch/execute-runs.ts), using the raw token from [auto-pair.ts](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/utils/auto-pair.ts). There is no read-time normalization or validation in [domain-coverage-utils.ts](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts), so definition edits or backfills can produce mixed or >2 direction tokens in one cell. The spec’s fallback of “take the two largest counts” will then return a plausible-looking number from corrupted input instead of surfacing the inconsistency.

## Residual Risks

- The spec explicitly leaves the no-default-models branch in [CoverageCell.tsx](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/web/src/components/domains/CoverageCell.tsx) unchanged, so a cell with `pairedBatchCount = 0` will still display `batchCount` instead of the corrected zero in that view.
- The proposed >2-direction fallback is still a best-effort heuristic, not a hard validation. If that corruption ever appears, the query will warn and keep going, which can hide bad data.
- The read path still does not guard against stray `jobChoiceValueFirst` values on runs that were not launched as paired batches. That is probably rare, but the spec leaves it as a silent-counting risk.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MED (loose-pairing cross-launch parameters) — already chosen explicitly in §2a as accepted trade-off. MED (no read-time validation of jobChoiceValueFirst) — already noted in residual risks; the >2 fallback warns at log.warn level so prod-data drift surfaces in logs. Both are reviewer disagreements with chosen position.

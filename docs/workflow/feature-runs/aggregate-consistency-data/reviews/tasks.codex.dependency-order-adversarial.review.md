---
reviewer: "codex"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/aggregate-consistency-data/tasks.md"
artifact_sha256: "493fa10de568b5d242af0932e810860b34bc68a2591b609364b96554523483d4"
repo_root: "."
git_head_sha: "8edda6e6bea3bf9235b54f8991650f5c8bf673f5"
git_base_ref: "origin/main"
git_base_sha: "8edda6e6bea3bf9235b54f8991650f5c8bf673f5"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/aggregate-consistency-data/reviews/tasks.codex.dependency-order-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks dependency-order-adversarial

## Findings

1. **High**: `detectUpgraded` in Slice B5 is logically wrong for the rollout sequence. It treats any row with `perScenario` as already migrated, but Slice A intentionally adds `perScenario` before Slice B adds `perPair`. That means the post-merge backfill will skip the exact rows that still need upgrading, so Slice C becomes a no-op for existing data.

2. **Medium [UNVERIFIED]**: The backfill detector only checks the first entry in `perModel`. If model ordering differs, or if some models have been upgraded and others have not, the CLI can misclassify a row and either skip work it still needs to do or rerun rows unnecessarily.

3. **Medium [UNVERIFIED]**: Slice B2 depends on worker payload fields (`valueKey`, `targetAnalysisRunId`, `companionRunId`, `primaryConditionIds`, `companionConditionIds`) already existing, but the artifact never defines the fallback slice or concrete contract change if they do not. If that assumption is wrong in the current codebase, the plan stalls partway through B because the required context is not actually wired.

## Residual Risks

- The plan does not prove end-to-end compatibility across worker output, API parsing, and UI consumption; it mainly verifies local parsing and unit behavior.
- The backfill rollout still assumes reruns are safe and domain-scoped filtering matches production data boundaries exactly.
- [UNVERIFIED] The artifact does not show any automated protection against partial schema rollout, so a mixed state between Slice A and Slice B could still leak into staging unless the backfill detector is fixed.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted

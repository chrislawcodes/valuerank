---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-codex-reintegration/spec.md"
artifact_sha256: "16effc541de3cc35fdd5ef8aa7458c1fc6730903c9395db4307b96eefc07ec98"
repo_root: "."
git_head_sha: "80a77301dc580237a047b7093138f47ab77402ee"
git_base_ref: "origin/main"
git_base_sha: "80a77301dc580237a047b7093138f47ab77402ee"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/ff-codex-reintegration/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

1. Medium - `dispatch-codex` does not define what happens when the subprocess never produces a normal exit. The spec covers success, non-quota failure, and quota exhaustion, but not missing binary, `subprocess.run` launch errors, or a hung/interactively blocked Codex process. That leaves a real runner wedge path unspecified.
2. Medium - The branch-base fallback order can still pick an inaccurate base on long-lived branches. FR-019 prefers `git merge-base main HEAD` ahead of `git merge-base --fork-point origin/main HEAD`. If local `main` lags behind `origin/main`, the spec will stop at the stale local base and never use the more accurate fork-point, which can still under-report code size on exactly the branches this fix is meant to protect.
3. Medium - Dispatch identity is not unique in the state record when two runs land in the same microsecond. FR-003 anticipates `_NNN` suffixes on the on-disk directory, but FR-004 stores only `ts` and says it is “the same as the directory timestamp.” Two distinct dispatches can therefore share the same `ts`, which makes the audit trail and suppression note ambiguous.
4. Medium [UNVERIFIED] - The banner-rename verification is scoped too narrowly. SC-005 only greps `docs/workflow/operations/codex-skills/feature-factory/scripts/`, while the spec describes runner behavior more broadly. That can let the check pass even if a live caller still emits `repair_*_checkpoint`. This depends on the existing repo layout, so it is unverified.

## Residual Risks

- The freshness rule still depends on git ancestry and line-count heuristics. Big refactors, file moves, or shallow clones can produce false negatives or skips.
- The `advance` subcommand is a manual override. It records intent, but it can still be used to bypass a real manifest problem if the operator chooses poorly.
- Recomputing a dispatch snapshot when `lines_added_at_dispatch_time` is null still depends on reachable git history. In sparse or shallow environments, that path may fall back to “not fresh” more often than intended.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted

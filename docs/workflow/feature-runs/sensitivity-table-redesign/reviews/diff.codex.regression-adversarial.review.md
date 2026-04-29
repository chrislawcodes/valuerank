---
reviewer: "codex"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/sensitivity-table-redesign/reviews/implementation.diff.patch"
artifact_sha256: "1c4d0b910b8c1688de90c8d90df436e30fade9a25ea109be04be4318566d515e"
repo_root: "."
git_head_sha: "c62155cb1218b80dde70aa567057450bc4ac732b"
git_base_ref: "6f68da8676f6cefa892631008e0a91c8bf9c8b79"
git_base_sha: "6f68da8676f6cefa892631008e0a91c8bf9c8b79"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM (signed sort vs magnitude) INTENTIONAL per FR-011. MEDIUM (whole-percent rounding hides sub-1pp effects) PARTIALLY RESOLVED. formatPoints now shows 1 decimal place when 0 less-than abs Δ less-than 1pp (commit 2fbb44ad), so small effects no longer collapse to +0 pp. Endpoint cells stay whole-percent per spec rule 6 — those are typically larger so the issue is much smaller there. LOW (badge only on low-pressure cell) INTENTIONAL per spec FR-007 (badge attaches to Low pressure cell when baseline ≥ 0.9 / ≤ 0.1)."
raw_output_path: "docs/workflow/feature-runs/sensitivity-table-redesign/reviews/diff.codex.regression-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

- Medium: In [`PressureSensitivitySummary.tsx`](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/models/PressureSensitivitySummary.tsx), the summary table now sorts by the signed `winRateDeltaSummary.mean` instead of by magnitude. That means a model with a large negative pressure effect will be ranked below a model with a smaller positive effect, even though the table copy still says it ranks models by “how much pressure moves their win rate.” This changes the table from a sensitivity ranking into a direction ranking.
- Medium: In [`PressureSensitivitySummary.tsx`](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/models/PressureSensitivitySummary.tsx) and [`PressureSensitivityDetail.tsx`](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx), the new display rounds pooled win rates and delta values to whole percentages / whole percentage points. That hides sub-1pp changes and can render small non-zero effects as `0%` or `−0 pp`, which is a bad fit for a sensitivity report whose value is in small differences.
- [UNVERIFIED] Low: In [`PressureSensitivityDetail.tsx`](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx), ceiling/floor badges are only applied to the low-pressure value, not the high-pressure value. If the badge is meant to flag saturation in either band, high-band rows can now look ordinary even when they are pinned near 0% or 100%.

## Residual Risks

- I could not verify whether the new `winRateDelta*` and `qualifyingTrials` fields line up with the rest of the pressure-sensitivity pipeline, because no surrounding code was provided.
- The new transcript-cap warning is helpful, but I could not confirm whether the backend cap really creates the specific “earlier transcripts” bias described in the banner.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM (signed sort vs magnitude) INTENTIONAL per FR-011. MEDIUM (whole-percent rounding hides sub-1pp effects) PARTIALLY RESOLVED. formatPoints now shows 1 decimal place when 0 less-than abs Δ less-than 1pp (commit 2fbb44ad), so small effects no longer collapse to +0 pp. Endpoint cells stay whole-percent per spec rule 6 — those are typically larger so the issue is much smaller there. LOW (badge only on low-pressure cell) INTENTIONAL per spec FR-007 (badge attaches to Low pressure cell when baseline ≥ 0.9 / ≤ 0.1).

---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/sensitivity-table-redesign/reviews/implementation.diff.patch"
artifact_sha256: "1c4d0b910b8c1688de90c8d90df436e30fade9a25ea109be04be4318566d515e"
repo_root: "."
git_head_sha: "c62155cb1218b80dde70aa567057450bc4ac732b"
git_base_ref: "6f68da8676f6cefa892631008e0a91c8bf9c8b79"
git_base_sha: "6f68da8676f6cefa892631008e0a91c8bf9c8b79"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM (signed sort vs magnitude) INTENTIONAL per spec FR-011 'Sort default: Win rate Δ descending'. Updated component intro copy to match (ranks by direction of pressure response, not magnitude). LOW (cap warning earlier-transcripts wording) ACCEPTED — orderBy id:asc with cuid IDs gives chronological order so 'earlier' is accurate."
raw_output_path: "docs/workflow/feature-runs/sensitivity-table-redesign/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

- Medium: `cloud/apps/web/src/components/models/PressureSensitivitySummary.tsx` now sorts rows by `winRateDeltaSummary.mean` directly, not by magnitude. That means a model with a large negative shift will be ranked below a model with a small positive shift, even though the table copy says it ranks models by how much pressure moves win rate. This changes the primary ordering into a signed-direction sort and can hide the biggest movers.
- Low [UNVERIFIED]: `cloud/apps/web/src/pages/PressureSensitivity.tsx` says the 500,000-transcript cap "biases" the report toward earlier transcripts. That is only true if the scan order is actually chronological. The patch does not show the traversal order, so the warning may be misleading.

## Residual Risks

- [UNVERIFIED] I could not confirm that `qualifyingTrials`, `lowBandMean`, `highBandMean`, and `winRateDeltaSummary` are all computed from the same filtered population described in the tooltips. If the upstream aggregation differs, the new labels may overstate what the table is actually showing.
- [UNVERIFIED] The CI display assumes `ciLow` and `ciHigh` are fractional bounds around the mean. If those fields use a different unit or are not symmetric around the mean, the displayed `± N pp` values will be numerically off.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM (signed sort vs magnitude) INTENTIONAL per spec FR-011 'Sort default: Win rate Δ descending'. Updated component intro copy to match (ranks by direction of pressure response, not magnitude). LOW (cap warning earlier-transcripts wording) ACCEPTED — orderBy id:asc with cuid IDs gives chronological order so 'earlier' is accurate.

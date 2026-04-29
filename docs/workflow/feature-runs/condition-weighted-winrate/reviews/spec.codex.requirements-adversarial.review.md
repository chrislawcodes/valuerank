---
reviewer: "codex"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/condition-weighted-winrate/spec.md"
artifact_sha256: "3b735618ed978fb2ae802a3561d788a60f531bc29fa73800743aadebd3f5cf14"
repo_root: "."
git_head_sha: "d0a9b73555aebe903a25a4bc3f3e1863d9d2dfba"
git_base_ref: "origin/main"
git_base_sha: "d0a9b73555aebe903a25a4bc3f3e1863d9d2dfba"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH (float tolerance): FR-003/FR-004 updated with 1e-9 tolerance policy and round(...,6) convention. HIGH (backfill safety): FR-024/FR-025/FR-026 added for idempotency, resumability, and atomic swap. MEDIUM (Piece 2 missing scores): FR-005 updated with partial-score policy and edge case added. MEDIUM (coverage check): user decision."
raw_output_path: "docs/workflow/feature-runs/condition-weighted-winrate/reviews/spec.codex.requirements-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

- **HIGH** Pieces 1 and FR-003/FR-004 require exact equality for fractional count sums, but the spec gives no rounding or tolerance rule. Because `count.prioritized / deprioritized / neutral` will be built from repeated floating-point division and addition, `count.prioritized + count.deprioritized + count.neutral = number of conditions` is not reliably testable with `===`-style exactness. The spec needs a precision policy, or implementations will be flaky and only reviewable by hand.

- **HIGH** The backfill requirements are not safe enough for an eager overwrite of historical analysis JSON. The spec requires a silent backfill during live traffic, but it does not require idempotency, resumability, or an atomic swap / retry strategy. If the backfill fails halfway or is rerun, the dataset can be left partially updated.

- **MEDIUM** Piece 2 is ambiguous about transcripts that have no signed-distance score. The current code skips `resolve_transcript_signed_distance(...) == None`, but the new requirement switches to condition-level means and never says whether a condition with some missing scores should be averaged from the remaining scored trials or dropped entirely.

- **MEDIUM** Piece 3 / Decision 4 hardcode equal-run pooling without requiring a coverage check or fallback. If a batch mixes full-domain and partial runs, equal-run weighting will silently misstate pooled means and preference strength.

## Residual Risks

- Equal-run weighting is only correct when all pooled runs cover the same condition set. If asymmetric batches are ever introduced, the pooling rule will bias summaries silently.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH (float tolerance): FR-003/FR-004 updated with 1e-9 tolerance policy and round(...,6) convention. HIGH (backfill safety): FR-024/FR-025/FR-026 added for idempotency, resumability, and atomic swap. MEDIUM (Piece 2 missing scores): FR-005 updated with partial-score policy and edge case added. MEDIUM (coverage check): user decision.

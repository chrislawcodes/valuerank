---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/win-rate-exc-neutral/plan.md"
artifact_sha256: "6a2adeaa26b715c0c361a64a92f38ca1d20b14e02fb81f305f082c46c23aea3c"
repo_root: "."
git_head_sha: "8c8e3ecb4692e3642b26b8b571017d0d04c6983b"
git_base_ref: "origin/main"
git_base_sha: "8c8e3ecb4692e3642b26b8b571017d0d04c6983b"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM UNVERIFIED (mixed mode screen): Accepted. This is Residual Risk 2 — documented, transient, self-resolves on cache rebuild. MEDIUM UNVERIFIED (aggregation weighting): Accepted as verify-in-implementation. Slice 1 must inspect aggregateValueWinRates weighting to confirm neutrals are not in the weight denominator. MEDIUM UNVERIFIED (Phase 2 permanent partial cache): Accepted. Transient DB errors rely on exception propagation; next cache rebuild fixes it. Supersede case (count=0) is expected no-op by design. LOW UNVERIFIED (double payload): Accepted as low-risk tradeoff over passing excNeutral flag through all function signatures."
raw_output_path: "docs/workflow/feature-runs/win-rate-exc-neutral/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

- [MEDIUM] [UNVERIFIED] The plan allows mixed standard/exc-neutral values in the same screen during cache migration. It says the frontend can fall back to standard values when `winRateExcNeutral` is null, while only showing a header chip when `pooledWinRateExcNeutral` is null across all visible models. That means a partially rebuilt dataset can silently mix two different definitions of “win rate” in one report, which makes the toggle state ambiguous and the numbers hard to compare.
- [MEDIUM] [UNVERIFIED] The exc-neutral aggregation is not proven correct at every rollup level. The plan reuses the existing `aggregateValueWinRates` hierarchy and only changes the leaf rate from `computePairwiseWinRate(wins, losses, neutrals)` to `computePairwiseWinRate(wins, losses, 0)`. If the hierarchy weights children using any denominator that still includes neutrals, the parent rollups will not truly exclude neutrals even though the leaf rates do.
- [MEDIUM] [UNVERIFIED] Phase 2 persistence can fail permanently without recovery. Using `updateMany({ id, status: 'CURRENT' })` and treating `count === 0` as a harmless supersede case means any transient status change or concurrent writer can leave a snapshot with only the standard output and no `valueWinRatesExcNeutral`, with no retry, backfill, or repair path. That turns a race into a lasting partial cache.
- [LOW] [UNVERIFIED] Returning both `winRateMatrix` and `winRateExcNeutralMatrix` in every GraphQL response adds avoidable payload and resolver cost. For large pairwise matrices, this doubles work even when the client only needs one mode at a time.

## Residual Risks

- Even if the implementation is correct, users will still see a rebuild window where exc-neutral values are missing or inconsistent until old snapshots refresh.
- Older snapshots with no neutral data will intentionally produce identical standard and exc-neutral results, which may look like a broken toggle unless the UI explains it clearly.
- If any downstream sort, rank, or clustering logic still uses the standard metric while the display switches to exc-neutral, the page can show one mode while ordering by another.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM UNVERIFIED (mixed mode screen): Accepted. This is Residual Risk 2 — documented, transient, self-resolves on cache rebuild. MEDIUM UNVERIFIED (aggregation weighting): Accepted as verify-in-implementation. Slice 1 must inspect aggregateValueWinRates weighting to confirm neutrals are not in the weight denominator. MEDIUM UNVERIFIED (Phase 2 permanent partial cache): Accepted. Transient DB errors rely on exception propagation; next cache rebuild fixes it. Supersede case (count=0) is expected no-op by design. LOW UNVERIFIED (double payload): Accepted as low-risk tradeoff over passing excNeutral flag through all function signatures.

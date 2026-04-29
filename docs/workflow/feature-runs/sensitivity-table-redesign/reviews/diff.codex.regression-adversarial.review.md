---
reviewer: "codex"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/sensitivity-table-redesign/reviews/implementation.diff.patch"
artifact_sha256: "d6921ddf0431336acadb5fc3f9aa6a39ef9139ac754d6ac02103d6f89a887fb9"
repo_root: "."
git_head_sha: "3565133420c716ceba3bc46c0cb784ce7151b8ed"
git_base_ref: "origin/main"
git_base_sha: "4772ae79f8e1580ee31c0f10f32e6d86a842ef68"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM (GraphQL contract breaking change) ACCEPTED. This is the deliberate breaking change per spec FR-014; monorepo with no external consumers, web operation/codegen update lands atomically in Slice B. MEDIUM (model sort signed) INTENTIONAL per FR-011. MEDIUM (pairsPositive only counts greater-than threshold) INTENTIONAL per spec FR-013 which explicitly defines pairsPositive as count where Δ greater-than 0.02; user-facing copy says moved up not positive per FR-006a. MEDIUM (helpers removed) VERIFIED clean. Backend grep ran zero matches; no other callers of applyBandReduction, computeBaselineWinRate, aggregateSensitivity exist."
raw_output_path: "docs/workflow/feature-runs/sensitivity-table-redesign/reviews/diff.codex.regression-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

- **MEDIUM [UNVERIFIED]** The GraphQL contract is broken for existing callers: `aggregateSensitivity`, `directionDelta`, `convictionDelta`, `netScoreDelta`, and `baselineWinRate` were removed and replaced with new field names/types. Any client, persisted query, or downstream code still querying the old schema will fail until it is updated.
- **MEDIUM [UNVERIFIED]** The model ordering changed from an absolute sensitivity metric to `winRateDeltaSummary.mean`, which is signed. That means a strongly negative but highly polarized model can now sort below a near-neutral model. If this endpoint is still meant to rank “pressure sensitivity,” the new sort order is semantically wrong and can hide the most extreme models.
- **MEDIUM [UNVERIFIED]** `pairsPositive` is not actually counting all positive pairs. It only counts deltas greater than `FLAT_DELTA_THRESHOLD`, so small positive deltas are excluded and the metric cannot be read as a plain “positive pair count.” That makes the summary internally inconsistent with `pairsMeasured` and with the per-pair classification logic.
- **MEDIUM [UNVERIFIED]** The exported aggregation helpers were removed from `aggregation.ts` (`applyBandReduction`, `computeBaselineWinRate`, `aggregateSensitivity`). If anything else in the repo still imports them, this will become a compile-time break. I cannot verify that from the diff alone.

## Residual Risks

- The new pooled win-rate delta and CI math was not cross-checked against expected outputs here, so edge cases with tiny samples, highly imbalanced bands, or all-ceiling/all-floor cells may still behave differently than intended.
- `transcriptCapHit` only warns about truncation; it does not prevent biased results when the transcript cap is reached, so very large domains can still return partial data.
- Because no surrounding code was provided, I could not verify whether any consumers, tests, or generated clients have already been updated to the new schema and helper names.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM (GraphQL contract breaking change) ACCEPTED. This is the deliberate breaking change per spec FR-014; monorepo with no external consumers, web operation/codegen update lands atomically in Slice B. MEDIUM (model sort signed) INTENTIONAL per FR-011. MEDIUM (pairsPositive only counts greater-than threshold) INTENTIONAL per spec FR-013 which explicitly defines pairsPositive as count where Δ greater-than 0.02; user-facing copy says moved up not positive per FR-006a. MEDIUM (helpers removed) VERIFIED clean. Backend grep ran zero matches; no other callers of applyBandReduction, computeBaselineWinRate, aggregateSensitivity exist.

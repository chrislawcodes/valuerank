---
reviewer: "codex"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/unified-net-weighted-condition-score/reviews/implementation.diff.patch"
artifact_sha256: "0d0baa44589c0aca34d155700d5766fdde8db0354402eddba1f051598cc41da3"
repo_root: "."
git_head_sha: "405e7c154949b918f69fd714bbde1fa84c7c1b66"
git_base_ref: "HEAD~1"
git_base_sha: "6abbd30420df8067bb79c17cb1781cf77b1f8473"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM #1 (0.05 boundary label mismatch) accepted — same disposition as correctness LOW: strict '> 0.05' tolerance matches toFixed(1) magnitude precision; the real-world probability of netScore landing exactly at 0.05 is vanishingly small, and canonicalConditionSummary tests cover boundary direction. MEDIUM #2 (broadened neutral bucket in legend) accepted — this is the intended FR-014 migration: legend counts now key off summary.direction + summary.hasData rather than the old brittle 'neutral count > 0 with no strong/lean' check. The semantic shift is documented in plan.md and reflected in the new help copy."
raw_output_path: "docs/workflow/feature-runs/unified-net-weighted-condition-score/reviews/diff.codex.regression-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

- [MEDIUM] [UNVERIFIED] `ConditionDecisionsTable.tsx` and `PivotAnalysisTable.tsx` now render `display.label` for resolved cells, but that label is derived from the helper’s rounded net score. If the helper treats near-zero values as `direction === 'neutral'`, a gray tie cell can still show a nonzero number like `0.1` at the rounding boundary. That makes the color and the number disagree, which is misleading for users reading the table as a decision summary.
- [MEDIUM] [UNVERIFIED] The pivot legend logic in `PivotAnalysisTable.tsx` changed from counting only fully neutral mixes to counting anything the helper reports as `direction === 'neutral'`. That broadens the neutral bucket to include near-zero net scores, so the “neutral” total no longer means the same thing as before and can shift cells out of low/high without any visible transcript change.

## Residual Risks

- I did not verify whether the helper’s neutral threshold and one-decimal display are intended across the rest of the analysis UI.
- This review is limited to the diff shown here, so any matching helper changes outside the artifact could change the impact of these findings.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM #1 (0.05 boundary label mismatch) accepted — same disposition as correctness LOW: strict '> 0.05' tolerance matches toFixed(1) magnitude precision; the real-world probability of netScore landing exactly at 0.05 is vanishingly small, and canonicalConditionSummary tests cover boundary direction. MEDIUM #2 (broadened neutral bucket in legend) accepted — this is the intended FR-014 migration: legend counts now key off summary.direction + summary.hasData rather than the old brittle 'neutral count > 0 with no strong/lean' check. The semantic shift is documented in plan.md and reflected in the new help copy.

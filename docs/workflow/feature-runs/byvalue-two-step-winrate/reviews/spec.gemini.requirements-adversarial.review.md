---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/byvalue-two-step-winrate/spec.md"
artifact_sha256: "3600b8954812fc71dbb4e8ef6f9174cbf6b11f550bb738b7547ba4727c0a4032"
repo_root: "."
git_head_sha: "cbe42f2cf1d8dd592e767a5c3896669aeda559e6"
git_base_ref: "origin/main"
git_base_sha: "cbe42f2cf1d8dd592e767a5c3896669aeda559e6"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH (weighting inconsistency): same finding as prior round; explicitly in spec Known Simplifications, out of scope for this feature. MEDIUM (migration risk): rollback plan is in spec; Option R2 covers reverse migration; accepted. LOW (zero-denominator): spec already addresses with per-vignette total==0 guard. LOW (0.5 fallback): preserves existing pooled fallback behavior; changing to null is a separate behavioral decision, deferred."
raw_output_path: "docs/workflow/feature-runs/byvalue-two-step-winrate/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

| Severity | Finding | Evidence |
|---|---|---|
| **HIGH** | The spec introduces inconsistent weighting logic for merged analyses. It changes `byValue.winRate` to be equally weighted (`weight: 1`) per analysis, but explicitly leaves `overallSignedCenter` and `preferenceStrength` using the old `sampleSize`-based weighting. This means different metrics on the same report will be aggregated using contradictory methodologies, which could mislead users comparing the values. A user would reasonably assume all metrics in a merged view are weighted the same way. | `[CODE-CONFIRMED]` |
| **MEDIUM** | The data migration strategy is risky and lacks a data rollback plan. The spec proposes an `UPDATE` statement to permanently mark all `CURRENT` analyses as `SUPERSEDED`. This is a destructive change to user data state. If the new code is rolled back, there is no corresponding plan to revert the `status` of these historical analyses. A less destructive approach would be to filter analysis results by `codeVersion` on the read path, which would avoid altering historical records. | `[UNVERIFIED]` |
| **LOW** | The specification for the new backend calculation relies on an optimistic assumption about data quality. It notes that a zero-denominator case "should not occur in practice" when calculating a per-vignette rate. Production code should not assume ideal data. The implementation must be robust to cases where a transcript is missing `summary.values` or a value within a vignette has zero responses, which the spec does not explicitly require. | `[UNVERIFIED]` |
| **LOW** | The fallback value for `winRate` is semantically inconsistent with other parts of the system. The spec proposes defaulting `winRate` to `0.5` when no vignettes contribute data for a value. In other areas of the frontend code, a lack of sufficient data results in an `unavailableState`. Using `0.5` conflates a true neutral finding with a "no data available" state, which could be misinterpreted by a user as a measured neutral preference. | `[CODE-CONFIRMED]` |

## Residual Risks

The spec correctly identifies several known simplifications and non-goals. These represent accepted risks that will persist after this feature is implemented.

1.  **Inconsistent Merged Metrics (as acknowledged by spec):** As a direct result of the top finding, the `overallSignedCenter` and `preferenceStrength` metrics will continue to be weighted by `sampleSize` in the frontend for paired merges. The `winRate` will be equally-weighted, but these other key metrics will not, creating a confusing and inconsistent user experience.

2.  **Simplified Aggregate Mode Weighting:** When merging more than two analysis runs (a non-standard operation), the weighting will be equal per-analysis (`1`), regardless of the number of unique vignettes in each run. A small exploratory run will have the same influence as a large, comprehensive one. This simplification is explicitly deferred.

3.  **Pre-existing Semantic Issue:** The spec notes that `canonicalConditionSummary.ts:129` has a pre-existing issue where `winRate < 0.5` is interpreted as an "opponent" value. This is explicitly out of scope for this change and will remain.

## Token Stats

- total_input=3324
- total_output=692
- total_tokens=27447
- `gemini-2.5-pro`: input=3324, output=692, total=27447

## Resolution
- status: accepted
- note: HIGH (weighting inconsistency): same finding as prior round; explicitly in spec Known Simplifications, out of scope for this feature. MEDIUM (migration risk): rollback plan is in spec; Option R2 covers reverse migration; accepted. LOW (zero-denominator): spec already addresses with per-vignette total==0 guard. LOW (0.5 fallback): preserves existing pooled fallback behavior; changing to null is a separate behavioral decision, deferred.

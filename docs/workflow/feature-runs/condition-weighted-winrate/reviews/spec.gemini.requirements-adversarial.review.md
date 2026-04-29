---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/condition-weighted-winrate/spec.md"
artifact_sha256: "2e70c988fa01de7cf2f7b819ddd93a5c1c21ebcaa401f388655c8d4bdfd48747"
repo_root: "."
git_head_sha: "d0a9b73555aebe903a25a4bc3f3e1863d9d2dfba"
git_base_ref: "origin/main"
git_base_sha: "d0a9b73555aebe903a25a4bc3f3e1863d9d2dfba"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH (coverage check): user decision — equal-run weighting is mathematically correct for current full-domain paired batches, documented in spec with explicit assumption. MEDIUM (winRateSd stdDev inconsistency): pre-existing behavior in aggregate-logic.ts unrelated to this feature's changes; defer to closeout follow-ups. MEDIUM (small-sample warning): user decision to remove rather than fix thresholds. LOW findings: acceptable per spec."
raw_output_path: "docs/workflow/feature-runs/condition-weighted-winrate/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

| Severity | Finding | Evidence |
| --- | --- | --- |
| HIGH | **Latent Risk of incorrect aggregation due to hardcoded assumption.** The spec requires using equal run-weighting (`weight: 1`) for multi-run rollups (Piece 3, FR-009). It correctly notes this is only valid if all runs cover the same set of conditions. However, the implementation plan is to hardcode this assumption in `aggregate-logic.ts` without any verification that the runs being pooled are symmetric. If asymmetric runs are introduced in the future, this will silently lead to statistically incorrect aggregations. The spec adds a `conditionCount` field which could be used for proper weighting (`weight: conditionCount`), but opts not to use it. | `[CODE-CONFIRMED]` |
| MEDIUM | **Inconsistent standard deviation calculations.** The Python worker (`basic_stats.py`) uses a sample standard deviation (`ddof=1`) when calculating `overall.stdDev` for a single run's scores. However, the TypeScript multi-run aggregator (`aggregate-logic.ts`) uses a population standard deviation (dividing by `N` instead of `N-1`) when calculating the standard deviation of win rates across runs (`winRateSd`). This statistical inconsistency can lead to skewed distributions and incorrect variance reporting in aggregate analyses. | `[CODE-CONFIRMED]` |
| MEDIUM | **Valuable data quality warning is removed instead of fixed.** The spec correctly identifies that the small-sample warning in `analyze_basic_aggregation.py` is misleading because its threshold is based on trial count (`sampleSize`) while the metrics are now based on condition count. However, the proposed fix (Fix D, FR-015) is to remove the warning entirely, rather than update it to use the new `conditionCount` field. This removes a valuable, albeit flawed, guardrail against drawing conclusions from insufficient data. | `[CODE-CONFIRMED]` |
| LOW | **Unnecessary validator change introduces risk.** FR-012 proposes changing `isNonNegativeInteger` to `isNonNegativeNumber` for count fields in `parseRawPreferenceValueStats`. The spec correctly notes that `isNonNegativeInteger` must be preserved for other callers. The proposed change to use the existing `isNonNegativeNumber` is clean, but it's worth noting the file `analysisSemantics.utils.ts` contains many validation helpers. A safer alternative, not considered, would be to create a new `isNonNegativeFloat` to avoid any possible confusion or accidental misuse of the more general `isNonNegativeNumber` predicate where an integer is strictly required elsewhere. The current plan is acceptable but less robust than it could be. | `[UNVERIFIED]` |
| LOW | **The `export_pairwise_outcomes` tool is being deleted based on an assertion.** The spec asserts that the tool and its underlying statistical method (Bradley-Terry) are no longer in use (Decision 6). While no provided file contradicts this, the assertion cannot be fully verified without a full codebase search for usages of the `export_pairwise_outcomes` MCP tool. Deletion carries a minor risk if an external, unknown consumer exists. | `[UNVERIFIED]` |

## Residual Risks

-   **Semantic Shift in Min/Max:** The spec correctly calls out (Piece 2, FR-021) that `overall.min` and `overall.max` will now represent the min/max of per-condition *means*, not individual trial scores. This is a significant semantic shift. While the aggregator code (`aggregate-logic.ts`) will handle this correctly, any downstream human or machine consumer that relies on the old definition (extreme trial scores) will be misled. This risk is one of user expectation and documentation, which the spec addresses, but the risk of misinterpretation remains.
-   **Backfill Complexity:** The spec defers critical implementation details for the backfill script to the plan stage, including resumability (FR-025) and an atomic-write strategy for live traffic (FR-026). These are significant engineering challenges with high risk if handled incorrectly (data corruption, downtime, incomplete backfills). The project's success hinges on a robust plan for these items.
-   **Fractional Count Display:** The spec requires removing raw count displays from `PairedRunComparisonCard.tsx` because fractional counts are not intuitive. This is the correct UI decision, but it means the user loses visibility into the magnitude of data backing each percentage. The component will show percentages without conveying whether they are based on 10 conditions or 1000.

## Token Stats

- total_input=51900
- total_output=982
- total_tokens=56852
- `gemini-2.5-pro`: input=51900, output=982, total=56852

## Resolution
- status: accepted
- note: HIGH (coverage check): user decision — equal-run weighting is mathematically correct for current full-domain paired batches, documented in spec with explicit assumption. MEDIUM (winRateSd stdDev inconsistency): pre-existing behavior in aggregate-logic.ts unrelated to this feature's changes; defer to closeout follow-ups. MEDIUM (small-sample warning): user decision to remove rather than fix thresholds. LOW findings: acceptable per spec.

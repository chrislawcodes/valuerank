---
reviewer: "gemini"
lens: "quality-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/condition-weighted-winrate/reviews/implementation.diff.patch"
artifact_sha256: "d19fd3ffaed4cc08c8557b84f63f0f92e10a79772b58a0b58436f11078665da0"
repo_root: "."
git_head_sha: "f92e9b276167ae3957a60ab23169822d82fa2913"
git_base_ref: "origin/main"
git_base_sha: "d0a9b73555aebe903a25a4bc3f3e1863d9d2dfba"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH x2 (condition-weighting, equal-run weighting): these ARE the feature — intentional by design per spec and plan. MEDIUM (PairedRunComparisonCard): T012 intentionally removes showOrderDetail; fractional counts are meaningless to display. MEDIUM (backfill transactionality): row-level idempotency + --dry-run mode mitigates. MEDIUM (parseSelection): --dry-run covers this before live run. LOW (small-sample warnings): user decision per T004."
raw_output_path: "docs/workflow/feature-runs/condition-weighted-winrate/reviews/diff.gemini.quality-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff quality-adversarial

## Findings

### CRITICAL
- No findings at this level.

### HIGH
- **Severity**: HIGH
- **Finding**: The core aggregation logic has been fundamentally changed from **sample-weighting** to **condition-weighting**. In `cloud/workers/stats/basic_stats.py`, calculations are no longer based on the total number of trial transcripts. Instead, metrics are calculated per *condition* (`scenarioId`) and then averaged, giving each condition equal weight regardless of the number of trials it contains. This correctly makes the analysis robust to uneven trial counts but is a major methodological shift. The `count` fields for values are now floats representing the sum of proportions, not integers.
- **File**: `cloud/workers/stats/basic_stats.py`, `cloud/apps/web/src/components/analysis-v2/analysisSemantics.utils.ts`

- **Severity**: HIGH
- **Finding**: The logic for aggregating multiple analysis runs (meta-aggregation) has been changed to use **equal-run weighting** instead of sample-size weighting. In `cloud/apps/api/src/services/analysis/aggregate/aggregate-logic.ts` and the corresponding frontend logic, each constituent analysis run now contributes equally to the pooled mean and variance, regardless of its `sampleSize`. This means a small, exploratory run has the same statistical influence as a large, comprehensive one, which could skew results if the runs are not of comparable quality or scope.
- **Files**: `cloud/apps/api/src/services/analysis/aggregate/aggregate-logic.ts`, `cloud/apps/web/src/components/analysis-v2/analysisSemantics.preference.ts`

### MEDIUM
- **Severity**: MEDIUM
- **Finding**: The `PairedRunComparisonCard` component has been significantly simplified, removing the "Order Detail" toggle and the ability to view statistics for each value ordering (`A first` vs. `B first`) separately. While this streamlines the UI, it removes functionality that may be important for diagnosing order effects. Users can no longer inspect the raw preference counts for each side of a paired run. This is a functional regression.
- **Files**: `cloud/apps/web/src/components/analysis/PairedRunComparisonCard.tsx`, `cloud/apps/web/tests/components/analysis/PairedRunComparisonCard.test.tsx`

- **Severity**: MEDIUM
- **Finding**: **[UNVERIFIED]** The new backfill script in `backfill-condition-weighted.ts` processes results in batches but does not appear to be transactional across the entire operation. If the script fails midway through a large dataset, the database could be left in an inconsistent state where some `AnalysisResult` records are updated with the new condition-weighted schema and others are not. The script logs failed IDs but does not provide a mechanism for rollback or easy resumption from the point of failure.
- **File**: `cloud/apps/api/src/cli/backfill-condition-weighted.ts`

- **Severity**: MEDIUM
- **Finding**: **[UNVERIFIED]** The logic in the backfill script for parsing run configurations (`parseSelection`) is complex, attempting to gracefully handle multiple possible historical formats for `definitionVersion` (number, string) and `preambleVersionId`. While it includes checks, it's possible that untested legacy `config` shapes exist in the database that could cause `parseSelection` to return `null`, leading to that row being marked as failed during the backfill.
- **File**: `cloud/apps/api/src/cli/backfill-condition-weighted.ts`

### LOW
- **Severity**: LOW
- **Finding**: Warnings for small (`<10`) and moderate (`<30`) sample sizes have been removed from the Python analysis worker (`analyze_basic_aggregation.py`). While the new condition-weighting makes raw sample size less important than condition count, removing these warnings entirely means users are no longer notified if an analysis is based on a very small number of total trials, which could still be a useful signal for data sparsity.
- **File**: `cloud/workers/analyze_basic_aggregation.py`

## Residual Risks

- **Inconsistent Analysis States**: If the `backfill-condition-weighted.ts` script is run and fails partway through, the system will be in a mixed state. Analyses performed on a combination of old and new `AnalysisResult` documents may yield incorrect or unpredictable results until the backfill is fully completed.
- **Misinterpretation of Aggregated Runs**: The shift to equal-run weighting for meta-aggregates is a significant statistical choice. Users creating aggregate analyses that combine runs of vastly different scopes (e.g., a small 2-condition test run and a large 100-condition validation run) may not realize they now have equal influence, potentially leading to misinterpretation of the combined results.
- **Loss of Diagnostic Capability**: The removal of the "Order Detail" view in paired comparisons simplifies the UI at the cost of diagnostic power. Users trying to understand or debug potential value ordering effects will no longer have the tools to do so within the UI, forcing them to rely on other methods or accept the blended summary as the only view.

## Token Stats

- total_input=34258
- total_output=1117
- total_tokens=39088
- `gemini-2.5-pro`: input=34258, output=1117, total=39088

## Resolution
- status: accepted
- note: HIGH x2 (condition-weighting, equal-run weighting): these ARE the feature — intentional by design per spec and plan. MEDIUM (PairedRunComparisonCard): T012 intentionally removes showOrderDetail; fractional counts are meaningless to display. MEDIUM (backfill transactionality): row-level idempotency + --dry-run mode mitigates. MEDIUM (parseSelection): --dry-run covers this before live run. LOW (small-sample warnings): user decision per T004.

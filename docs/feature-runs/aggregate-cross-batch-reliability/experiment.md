# Experiment: Cross-Batch Fallback for Aggregate Reliability

## Feature
`aggregate-cross-batch-reliability` — cross-batch fallback in `build_pooled_aggregate_reliability` so that aggregate runs composed of single-trial batches can still report reliability metrics.

## Pre-Implementation Findings

### The Problem
`build_pooled_aggregate_reliability` in `cloud/workers/analyze_basic.py` computes reliability by iterating over per-run reliability data. A "run" in the aggregate context is an individual batch. Reliability within a batch requires repeat trials of the same scenario (i.e. `sampleIndex > 0` within a single run).

When each constituent batch ran every scenario only once (e.g. three batches each covering s1, s2, s3 with `sampleIndex: 0`), no batch had within-run repeats, so `reliability_samples` remained empty for every model. The aggregate reliability was reported as unavailable (`coverageCount == 0`, all metrics `None`) even though the same scenario was measured across multiple batches — which is a valid cross-batch reliability signal.

### Root Cause (analyze_basic.py)
In `build_pooled_aggregate_reliability`, the inner loop over `per_run_summaries` only populates `reliability_samples` from `run_reliability` data. If a batch's `coverageCount` is 0 (no within-run repeats), it contributes nothing. There was no fallback to the pooled cross-batch variance already computed by `compute_variance_analysis(transcripts)`.

### Key Observation
`compute_variance_analysis` and `build_reliability_summary` already exist and work correctly on the full transcript list. They compute variance across all trials regardless of run boundaries. When a scenario appears in multiple batches, each batch's trial counts as a separate observation, giving a valid variance estimate. The pooled reliability was simply never consulted as a fallback when per-run reliability was absent.

### What Was Changed
**`cloud/workers/analyze_basic.py` — `build_pooled_aggregate_reliability`:**
- Added `pooled_variance = compute_variance_analysis(transcripts)` and `pooled_reliability_per_model = build_reliability_summary(pooled_variance)["perModel"]` before the per-model loop.
- Added a cross-batch fallback block after the per-run loop: if `reliability_samples` is empty after exhausting all runs, check the pooled model reliability. If the pooled `coverageCount > 0`, use it to populate `reliability_samples`, `noise_samples`, `agreement_samples`, and `neutral_samples`. Also populate `repeated_condition_ids` from pooled per-scenario stats where `sampleCount > 1`.

**`cloud/workers/tests/test_analyze_basic.py`:**
- Updated `test_same_signature_aggregate_keeps_preference_but_leaves_reliability_unavailable_without_within_run_repeats` — changed fixture so batches cover *non-overlapping* conditions, confirming no cross-batch repeats → reliability still unavailable.
- Rewrote `test_same_signature_aggregate_sums_repeat_coverage_across_runs_without_treating_runs_as_repeats` — three single-trial batches covering the same 3 conditions; asserts cross-batch fallback fires and `baselineReliability`/`directionalAgreement` are non-null.

## Validation

```
cd cloud/workers && python -m pytest tests/test_analyze_basic.py -v
```

Result: **27 passed** in 11.31s.

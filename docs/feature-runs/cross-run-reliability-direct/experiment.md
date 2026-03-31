# Experiment: cross-run-reliability-direct

**Method:** Claude-solo (Stage A — no adversarial agent)
**Branch:** `claude/cross-run-reliability-direct`
**Worktree:** `/private/tmp/wt-cross-run-direct`
**Date:** 2026-03-31

## Summary

Fixed `build_pooled_aggregate_reliability` in `cloud/workers/analyze_basic.py` so that
cross-run same-condition observations are treated as within-run repeats when computing
`baselineReliability` and `directionalAgreement`. Also fixed drift collection (was never
populated). Removed dead code. Added 5 new tests, updated 3 existing tests.

## Stage Results

| Stage | Artifact | Issues raised | Issues accepted | Artifact revised? | Claude tokens |
|-------|----------|--------------|-----------------|-------------------|--------------|
| Spec | (inline — feature provided in task) | — | — | N/A | — |
| Plan | (inline — approach derived from spec) | — | — | N/A | — |
| Implement | `analyze_basic.py` + test file | 3 (dead code, drift gate, coverage count semantics) | 3 | Yes | ~8M cache-read + 31k output |
| Self-review | Implementation | Dead `run_unique` dict, `contributing_run_count` semantics, coverage count field definition | All 3 | Yes (cleaned up) | (same session) |

## SHA Checkpoints

| Checkpoint | SHA |
|-----------|-----|
| Before implement | `5d222a855d07eb215052bcb7e2f93e0d910f1bc9` |
| After implement + self-review | `2358da1939f66bfb6a91523bb4ba3c26c5ad495d` |

**Code changed by self-review:** Yes — removed dead `run_unique` accumulator loop.

## Token Usage (full session)

Snapshot taken at: `2026-03-31T05:54:41Z`

| Metric | Value |
|--------|-------|
| `input_tokens` | 83 |
| `cache_creation_input_tokens` | 90,651 |
| `cache_read_input_tokens` | 7,948,446 |
| `output_tokens` | 31,453 |

## Self-Review Issues Found

1. **Dead code**: `run_unique` dict was built and never read (only `run_unique_dedup` was used). Removed the accumulator loop. **Accepted — fixed.**

2. **`contributing_run_count` semantics changed**: Old code counted runs with `coverage_count > 0` (within-run repeats). New code counts runs with any unique scenario for the model. This is correct for the pooled approach — it means "source runs contributing data" not "runs with repeats". **Accepted — no change needed, semantics are intentionally different.**

3. **`total_repeat_coverage_count` = `repeat_coverage_breadth`**: Old code summed per-run coverage counts across runs (e.g. run-A had 2 repeated conditions, run-B had 1 → total=3 even if same conditions). New code counts distinct repeated conditions in the pooled view (e.g. s1, s2 → 2). This is the intended fix — the old behavior was double-counting the same condition. **Accepted — 3 existing tests updated accordingly.**

## Files Modified

- `/private/tmp/wt-cross-run-direct/cloud/workers/analyze_basic.py` — `build_pooled_aggregate_reliability` rewritten
- `/private/tmp/wt-cross-run-direct/cloud/workers/tests/test_analyze_basic.py` — 5 new tests, 3 updated tests

## Test Results

```
32 passed in 11.33s
```

(27 original + 5 new)

## Key Design Decisions

- **Pooling approach**: Run `compute_variance_analysis(all_transcripts)` once before the per-model loop, then use `build_reliability_summary` on the pooled result. This reuses existing infrastructure and handles all cases: all-single-trial runs, mixed runs, pure within-run repeats.
- **Drift stays per-run**: `overallSignedCenter` is still collected per-run (not pooled) because drift measures run-to-run shift, not within-run variance.
- **Coverage count semantics**: `coverageCount` now = number of distinct conditions that appear repeated in the pooled view (not sum of per-run coverage counts). This avoids double-counting.
- **Publishability gate unchanged**: `total_repeat_coverage_count >= min_repeat_coverage_count AND repeat_coverage_share >= min_repeat_coverage_share` still controls whether metrics are published.

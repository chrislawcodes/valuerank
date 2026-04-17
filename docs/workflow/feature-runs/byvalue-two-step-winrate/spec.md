# Spec: byvalue-two-step-winrate

**Author:** Claude (Sonnet, 2026-04-16)
**Status:** ready for plan stage
**Delivery path:** Feature Factory
**Prerequisite:** `winrate-honest-denominator` (PR #632, commit `641e03c7`) merged — neutral denominator fix already shipped.

---

## Problem

`winRate` per value is computed using the **pooled** approach: all transcript responses are summed together, then divided. A vignette evaluated 12 times counts 12× more than a vignette evaluated once.

This is inconsistent with `overall_signed_center` and `preference_strength`, which already use the correct **two-step** approach: compute one mean per vignette, then average those means with equal weight across vignettes. Extra repetitions of a vignette improve the accuracy of that vignette's rate but do not change its weight in the overall average.

Two concrete sites are wrong:

### Site 1 — Backend `build_preference_summary` (`analyze_basic_aggregation.py`)

```python
# Current: grabs pooled counts from aggregate_transcripts_by_model
per_model_summary[model_id] = {
    "preferenceDirection": {
        "byValue": model_stats.get("values", {}),  # raw pooled counts
```

`model_stats["values"]` contains counts summed across every transcript response. A vignette run 12 times contributes 12 data points. The same function already computes `scenario_means` (per-vignette scores) for `overall_signed_center` but does not use that grouping for `byValue`.

### Site 2 — Frontend `buildMergedPreferenceModel` (`analysisSemantics.preference.ts`)

```typescript
// Current: sums raw counts from both paired runs, then divides
const allHaveCounts = stats.every((entry) => entry.count !== undefined);
if (allHaveCounts) {
  const prioritized = stats.reduce((sum, entry) => sum + (entry.count?.prioritized ?? 0), 0);
  ...
  winRate: totalResponses > 0 ? prioritized / totalResponses : 0.5,  // pooled
```

When merging paired runs, this overrides the backend's pre-computed `winRate` by re-deriving it from raw counts. If run A had 12 batches and run B had 6 batches, run A gets 2× the weight.

---

## Goal

`winRate` per value uses the two-step approach everywhere:

1. **Per vignette**: for each unique vignette containing value V, compute `vignette_rate = prioritized_responses / total_responses` (using all repetitions of that vignette to estimate accurately).
2. **Across vignettes**: `winRate = mean(vignette_rates)` — each unique vignette has equal weight, regardless of how many times it was evaluated.

The backend computes this correctly and emits it. The frontend trusts it instead of re-deriving from raw counts.

For **paired-mode merges** (two analyses, one per vignette order): average the two per-run `winRate` values with equal weight — each run order contributes once.

**`count` fields (`prioritized`, `deprioritized`, `neutral`) stay as raw response counts in each individual analysis output.** No schema change to the backend. They are for reference; `winRate` is the authoritative metric.

**The merged result from `buildMergedPreferenceModel` (paired mode) will only carry `winRate`, not `count`.** This is intentional: `count` is a per-analysis concept (raw responses for one run). Summing counts across run orders is the pooled behaviour we are removing. No downstream code uses `count` after the merge — `deriveValueLists` and all callers only consume `winRate`.

---

## User decisions

| # | Question | Decision |
|---|---|---|
| 1 | Two-step formula | `mean(per-vignette rates)` — equal weight per vignette. |
| 2 | Paired merge weight | Equal weight per run (1 per analysis). Each vignette order contributes equally regardless of batch count difference. |
| 3 | Aggregate merge weight | Keep existing `sampleSize`-weighted fallback — known simplification, documented. |
| 4 | `count` field semantics | Unchanged (raw response counts). Only `winRate` changes. |

---

## Affected surfaces

### Python worker

| File | What changes |
|---|---|
| `cloud/workers/analyze_basic_aggregation.py` | `build_preference_summary`: instead of passing `model_stats.get("values", {})` directly, compute per-vignette win rates for each value using the transcript data already processed in the function. Data source: `transcript.get("summary", {}).get("values", {})` — this is the same field already read by `aggregate_transcripts_by_model`, returning a `dict[value_id, "prioritized" | "deprioritized" | "neutral"]` per transcript. Group outcomes by `(model_id, scenario_id, value_id)`, compute `vignette_rate = prioritized / total` per vignette (where total = prioritized + deprioritized + neutral for that vignette), then `winRate = mean(vignette_rates)`. A vignette is identified by its `scenarioId` — two transcripts with the same `scenarioId` are repetitions of the same vignette. **Per-vignette zero guard**: if `total == 0` for a specific (vignette, value) pair, skip that vignette for that value — do not include it in the mean. This should not occur in practice (every transcript response will list a status for every value in the vignette), but is required for correctness. **Value-level zero fallback**: if no vignettes contribute a rate for a value (i.e., the mean list is empty after skipping), emit `winRate: 0.5` (same as the existing pooled fallback for zero total responses). The `count` fields in the emitted `byValue` entries stay as raw summed counts from `model_stats` — only `winRate` changes to the two-step value. |
| `cloud/workers/tests/test_analyze_basic.py` | Update any hand-computed `winRate` assertions that assume pooled counts for multi-batch vignettes. Add a test case: one value in two vignettes where vignette A has 10 responses (9 prioritized) and vignette B has 1 response (0 prioritized) — two-step rate is `(0.9 + 0.0) / 2 = 0.45`, pooled rate would be `9 / 11 ≈ 0.818`. |

### API TypeScript — version bumps

The `winRate` semantic is changing. Both version constants that gate cache hits must bump so existing analyses recompute on next request.

| File | What changes |
|---|---|
| `cloud/workers/analyze_basic_metadata.py:7` | Bump `CODE_VERSION = "1.2.0"` → `"1.3.0"`. |
| `cloud/apps/api/src/queue/handlers/analyze-basic.ts:34` | Bump `const CODE_VERSION = '1.2.0'` → `'1.3.0'`. Must match Python side. |
| `cloud/apps/api/src/services/analysis/aggregate/constants.ts:1` | Bump `AGGREGATE_ANALYSIS_CODE_VERSION = '1.3.0'` → `'1.4.0'`. |
| `cloud/apps/api/src/services/analysis/domain-analysis-cache-types.ts:19` | Bump `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION = '1.2.0'` → `'1.3.0'`. |
| `cloud/apps/api/tests/queue/handlers/analyze-basic.integration.test.ts` | Update `codeVersion` assertion to `'1.3.0'`. |
| `cloud/apps/api/tests/services/analysis/aggregate.test.ts` | Update any `AGGREGATE_ANALYSIS_CODE_VERSION` assertion to `'1.4.0'` if present. |

### Prisma migration — mark stale analyses SUPERSEDED

The read path (`analysis.ts:21`) queries by `status = 'CURRENT'` only — it does not filter by `codeVersion`. A version bump alone does not invalidate existing rows.

| File | What changes |
|---|---|
| New: `cloud/packages/db/prisma/migrations/<timestamp>_supersede_pooled_byvalue_analyses/migration.sql` | `UPDATE "AnalysisResult" SET "status" = 'SUPERSEDED' WHERE "status" = 'CURRENT' AND "analysisType" IN ('basic', 'AGGREGATE');` |

### Web TypeScript

| File | What changes |
|---|---|
| `cloud/apps/web/src/components/analysis-v2/analysisSemantics.preference.ts:207-222` | **Remove the `allHaveCounts` early-return path** in `buildMergedPreferenceModel`. It re-derives `winRate` from raw counts, undoing the backend fix. After removal, all merges flow through the `averageWeighted` fallback below it. |
| `cloud/apps/web/src/components/analysis-v2/analysisSemantics.preference.ts:233` | **Change the weight from `analysis.perModel[modelId]?.sampleSize ?? 0` to `1`** so paired-mode merges give equal weight to each analysis regardless of batch count. |
| `cloud/apps/web/tests/components/analysis-v2/analysisSemantics.test.ts` | Update paired-merge test to cover the asymmetric case: run A `winRate=0.8` with `sampleSize=120`, run B `winRate=0.4` with `sampleSize=60`. Old sampleSize-weighted result: `(0.8×120 + 0.4×60)/180 = 0.667`. New equal-weight result: `(0.8 + 0.4) / 2 = 0.6`. |

### What does NOT change

- `aggregate_transcripts_by_model` in `basic_stats.py` — stays unchanged.
- `compute_win_rate`, `compute_value_stats` — stays unchanged.
- `deriveValueLists` — uses whatever `winRate` it receives; no change needed.
- `overall_signed_center`, `preference_strength` — already two-step; no change.
- `DomainAnalysis.tsx`, `canonicalConditionSummary.ts`, `aggregate-logic.ts` — different metrics, not touched.

---

## Verification plan

### Slice 1 — Backend

- `PYTHONPATH="$(pwd)/workers:$PYTHONPATH" pytest cloud/workers/tests/` — all pass.
- Key case: value present in two vignettes, vignette A has 9/10 prioritized, vignette B has 0/1 prioritized. Expected `winRate = (0.9 + 0.0) / 2 = 0.45`. Pooled would give `9/11 ≈ 0.818`.
- Existing case `compute_win_rate(3,1,0) == 0.75` unchanged.

### Slice 2 — Version bumps + migration

- `npm run test --workspace @valuerank/api` — all pass.
- Integration test asserts `codeVersion == '1.3.0'`.
- Migration runs cleanly on test DB. After migration: `SELECT COUNT(*) FROM "AnalysisResult" WHERE status='CURRENT' AND analysisType IN ('basic', 'AGGREGATE')` returns 0.

### Slice 3 — Frontend

- `npm run test --workspace @valuerank/web` — all pass.
- New test: asymmetric sampleSize case yields equal-weight result `0.6`, not sampleSize-weighted `0.667`.
- Symmetric case (both runs same size) result is unchanged.

### Full preflight (before PR)

All 8 commands from `cloud/CLAUDE.md` plus Python pytest.

---

## Slice plan

| Slice | Scope | Commit prefix |
|---|---|---|
| **A** | Python: `build_preference_summary` two-step `byValue` winRate. Update worker tests. | `byvalue-two-step-winrate: A — two-step byValue winRate in Python worker` |
| **B** | Version bumps (all four constants) + Prisma migration. Update integration test. | `byvalue-two-step-winrate: B — version bumps and migration` |
| **C** | Web: remove `allHaveCounts` pooled-sum path, change weight to `1`. Update web tests. | `byvalue-two-step-winrate: C — equal-weight merge in frontend` |

All three land in one PR. Slices A and C can run in parallel — disjoint files. Slice B runs last so the migration timestamp is highest in the deploy batch.

---

## Known simplifications

- **Aggregate mode weight**: The fallback now uses equal weight `1` per analysis. A small 2-vignette run and a large 200-vignette run each contribute one vote. Implementing vignette-count weighting would require a new `uniqueVignetteCount` field from the backend. Deferred.
- **`canonicalConditionSummary.ts:129`** `isOpponent = selectedValueWinRate < 0.5` — pre-existing semantic issue noted in the prior feature run, explicitly out of scope.
- **`overallSignedCenter` / `preferenceStrength` merge weight**: still uses `sampleSize` in the frontend paired merge after this fix. `byValue.winRate` will be equal-weighted but these two metrics won't. They are separate from win rate and out of scope here. Noted for a follow-up.
- **`count` field in merged result**: dropped intentionally (see Goal section). `count` is optional in the `RawPreferenceValueStats` type; all callers handle its absence.

---

## Non-goals

- Changing `count` field semantics to vignette counts.
- Adding a `uniqueVignetteCount` field.
- Changing `aggregate_transcripts_by_model`.
- Any new UI features or columns.

---

## Rollback plan

1. Revert the squash commit on `main`.
2. Run a rollback migration setting `codeVersion IN ('1.3.0', '1.4.0')` CURRENT rows back to `SUPERSEDED` if post-merge analyses exist.
3. `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` reverts with the code revert — no separate migration needed.

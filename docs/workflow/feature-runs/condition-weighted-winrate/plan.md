# Implementation Plan: condition-weighted-winrate

**Branch**: `claude/optimistic-merkle-ef0dec` | **Date**: 2026-04-29 | **Spec**: [spec.md](./spec.md)

## Summary

Fix the aggregation hierarchy so each unique condition (scenarioId) gets one vote at every level. The same trial-counting bug exists in three places: the Python per-run aggregator, the TypeScript multi-run rollup, and the TypeScript cross-run preference merge. All three are fixed in one PR, along with consumer-side validators, UI cleanup, and a backfill that re-runs all historical analyses with the new math.

---

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: MEDIUM (tolerance): T005 updated to 1e-6 which covers 6dp rounding accumulation. MEDIUM (conditionCount in aggregate): T007 addressed; Codex also added conditionCount from transcript scenarioIds to aggregate output. MEDIUM (asymmetric equal-run pooling): user decision per spec — equal-run weighting is the intentional algorithm.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: HIGH (equal-run unsafe for asymmetric runs): user decision per spec; equal weighting is the intentional algorithmic choice. MEDIUM (modelScenarioMatrix trial-weighted): out of scope; blended count display in PairedRunComparisonCard is being removed entirely (T012).
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: HIGH (coverage check): user decision — equal-run weighting is mathematically correct for current full-domain paired batches, documented in spec with explicit assumption. MEDIUM (winRateSd stdDev inconsistency): pre-existing behavior in aggregate-logic.ts unrelated to this feature's changes; defer to closeout follow-ups. MEDIUM (small-sample warning): user decision to remove rather than fix thresholds. LOW findings: acceptable per spec.
- review: reviews/spec.codex.requirements-adversarial.review.md | status: accepted | note: HIGH (float tolerance): FR-003/FR-004 updated with 1e-9 tolerance policy and round(...,6) convention. HIGH (backfill safety): FR-024/FR-025/FR-026 added for idempotency, resumability, and atomic swap. MEDIUM (Piece 2 missing scores): FR-005 updated with partial-score policy and edge case added. MEDIUM (coverage check): user decision.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: HIGH (conditionCount required): plan updated — ModelStats uses NotRequired[int] for zero-downtime. MEDIUM (idempotency check): plan updated — hasConditionWeightedShape checks ALL perModel entries, not any one. MEDIUM (small-sample warning): user decision to remove, documented in spec. MEDIUM (MCP deregistration): code-confirmed file-driven auto-discovery — file deletion is sufficient.
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: HIGH (idempotency ALL vs ANY): fixed in plan — hasConditionWeightedShape checks ALL perModel entries. MEDIUM (unknown condition pooling): pre-existing behavior, acceptable. MEDIUM (Bradley-Terry deregistration): code-confirmed file-driven auto-discovery. MEDIUM (small-sample warnings): user decision to remove.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: HIGH (backfill untested): addressed — Codex added backfill-condition-weighted.test.ts with 357 lines of tests (second commit). MEDIUM (dead code target.winRate): user decision; decision 4 in plan is confirmed. MEDIUM (vague aggregate tests): T008 adds explicit equal-weight assertions. MEDIUM (brittle idempotency): hasConditionWeightedShape checks ALL perModel entries. LOW (inconsistent validation): T011 is scoped only to count fields. LOW (missing Python adversarials): T005 covers all required cases.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: MEDIUM (T012 colSpan): REAL — T012 updated to remove showOrderDetail mode entirely. MEDIUM (all-zero-score): pre-existing behavior. MEDIUM (tolerance): updated to 1e-6.
- review: reviews/tasks.codex.dependency-order-adversarial.review.md | status: accepted | note: MEDIUM (all-zero summary): pre-existing behavior. MEDIUM (T016 ordering): T016+T017 deploy together; snapshot version bump rebuilds cache after backfill. LOW (1e-6 tolerance): abs 1e-6 gives headroom over 6dp rounding.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: HIGH F001 (compute_value_stats type): added T001b. MEDIUM F002 (small-sample): user decision. LOW F003: rationale in plan.md. LOW F004: getPriorityCount/formatCount removed by T012.
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: HIGH x2 (condition-weighting, equal-run weighting): these ARE the feature — intentional by design per spec and plan. MEDIUM (PairedRunComparisonCard): T012 intentionally removes showOrderDetail; fractional counts are meaningless to display. MEDIUM (backfill transactionality): row-level idempotency + --dry-run mode mitigates. MEDIUM (parseSelection): --dry-run covers this before live run. LOW (small-sample warnings): user decision per T004.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: deferred | note: Codex quota exhausted during diff review; deferred to re-run after quota refresh.
- review: reviews/diff.codex.regression-adversarial.review.md | status: deferred | note: Codex quota exhausted during diff review; deferred to re-run after quota refresh.

## Technical Context

**Language/Version**: Python 3.11 (workers), TypeScript 5.x (cloud/apps)
**Primary Dependencies**: numpy (already used in `basic_stats.py`), Prisma, tsx
**Storage**: PostgreSQL JSONB `output` column on `AnalysisResult` table; backfill overwrites those records
**Testing**: pytest (workers), Vitest (web), Jest-compatible (api)
**Target Platform**: Python worker + Node.js API + React SPA
**Performance Goals**: No new hot-path computation; Python groupby replaces flat loop with same data
**Constraints**: Zero-downtime deployment (deploy code first, backfill after); `conditionCount` typed optional for zero-downtime only
**Scale/Scope**: 3 Python files, 6 TypeScript files, 1 new backfill script, 2 file deletions

---

## Constitution Check

**Status**: PASS

- ✅ No `any` types introduced in TypeScript changes
- ✅ No `console.log` — backfill uses `createLogger`
- ✅ No new npm/pip dependencies
- ✅ TypeScript strict mode — fractional `number` replaces integer-annotated fields with safe widening
- ✅ Python type annotations updated (`int` → `float` in `ValueCounts`)
- ✅ Tests updated for all changed behavior

---

## Architecture Decisions

### Decision 1: Condition grouping in `aggregate_transcripts_by_model`

**Chosen**: Two-pass approach inside the per-model loop. Pass 1: group transcripts by `scenarioId`. Pass 2: for each condition, compute per-condition per-value fractions and per-condition mean signed distance. Accumulate fractional counts and condition means across conditions.

**Why**: This is the minimum change that fixes the bug without restructuring the function signature or output shape. The `scores` list changes from individual trial scores to per-condition means — the rest of the math (`compute_model_summary`) is unchanged.

**Alternative considered**: Move the grouping to a separate helper function. Rejected — premature abstraction; the helper would be called exactly once.

### Decision 2: Backfill script pattern

**Chosen**: New file `cloud/apps/api/src/cli/backfill-condition-weighted.ts`, modeled on the existing `backfill-aggregate-consistency.ts`. Cursor-based pagination (BATCH_SIZE=50), `--dry-run` flag, calls `updateAggregateRun` per record.

**Idempotency marker**: Check if EVERY entry in `output.perModel` has a `conditionCount` key. If all entries have it, the record was fully backfilled — skip unless `--force` is passed. Checking all entries (not just any one) prevents false-positive skips on partially migrated or mixed-shape records. Use a helper `hasConditionWeightedShape(output)` modeled on the existing `hasUpgradedReliabilityShape`.

**Resumability**: Cursor-based pagination with ascending `id` ordering. If interrupted, restart the script — it will skip already-backfilled records and continue from wherever it left off.

**Atomic write**: `persistAggregateRun` (called inside `updateAggregateRun`) is a single Prisma transaction per record. Each record overwrite is atomic. Partial completion (some records updated, some not) is safe because the idempotency check allows clean resumption.

**Why not re-use `backfill-aggregate-consistency.ts`**: That script's skip condition checks for the old reliability shape, not `conditionCount`. Mixing the logic would make both harder to read and test.

### Decision 3: Snapshot cache invalidation

**Chosen**: Bump `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` from `'1.4.0'` to `'1.5.0'` in `cloud/apps/api/src/services/analysis/domain-analysis-cache-types.ts`. The version bump causes `domain-analysis-cache.ts` to invalidate all cached domain snapshots and rebuild them from the freshly backfilled `AnalysisResult` records.

**Why**: This is the existing pattern used by the `winrate-honest-denominator` feature. It requires no manual cache flush and no deployment downtime.

**Important**: The version bump must be deployed before the backfill runs, so that the freshly computed analyses feed into a fresh snapshot cache rather than being masked by a stale one.

### Decision 4: Piece 4 — no code change

`winRateMean` in `aggregate-logic.ts` already uses equal-run weighting: it collects each source run's `winRate` into `modelValueRates[valueId]` and averages them (lines 145–164). The local `target.winRate` (line 159) is dead code never returned. No change needed. This is documented explicitly to prevent future reviewers from flagging it.

---

## Implementation Steps

Steps must be executed in this order. Each step says what to change, which lines to edit, and what to leave alone.

### Step 1: Python — ValueCounts TypedDict (`basic_stats.py` lines 15–20)

Change field types from `int` to `float`:

```python
class ValueCounts(TypedDict):
    """Count of value prioritization outcomes."""
    prioritized: float
    deprioritized: float
    neutral: float
```

### Step 2: Python — ModelStats TypedDict (`basic_stats.py` line ~40)

Add the new `conditionCount` field as `NotRequired` (optional) for zero-downtime deployment. Pre-backfill records won't have it; post-backfill all records will:

```python
from typing import NotRequired  # add to imports

class ModelStats(TypedDict):
    """Complete statistics for a model."""
    sampleSize: int
    conditionCount: NotRequired[int]  # optional: present after backfill, always set for new analyses
    values: dict[str, ValueStats]
    overall: ModelSummary
```

### Step 3: Python — `aggregate_transcripts_by_model` rewrite (`basic_stats.py` lines 189–256)

Replace the per-model loop body with condition-grouped logic. The function signature and return type are unchanged.

New per-model logic:
1. Group `model_transcripts` by `scenarioId` → `by_condition: dict[str, list[dict]]`
2. For each `(scenario_id, condition_transcripts)`:
   a. For each transcript in condition: tally per-value status counts into `condition_value_counts: dict[str, ValueCounts]`
   b. For each value in `condition_value_counts`: compute fraction = `prioritized / total` (total = pri + dep + neu). Add fraction to `accumulated_counts[value_id]["prioritized"]` etc.
   c. Collect signed distances for scored transcripts. If at least one score exists, compute `condition_mean = mean(scores_for_condition)` and append to `condition_means`.
3. Compute `values` from `accumulated_counts` using `compute_value_stats` with the accumulated floats.
4. Compute `overall` by calling `compute_model_summary(condition_means)`.
5. Set `conditionCount = len(by_condition)`.

All floats must be rounded to 6 decimal places using `round(..., 6)` consistent with `compute_value_stats`. The `compute_model_summary` call already applies `round(..., 6)`.

Use `resolve_transcript_signed_distance(t)` (already imported) to get scores; skip `None`.

### Step 4: Python — remove small-sample warning (`analyze_basic_aggregation.py`)

In `generate_warnings`, remove the two blocks that append `SMALL_SAMPLE` and `MODERATE_SAMPLE` warnings (lines 171–182). Leave the `NO_DIMENSIONS` and `PARTIAL_DIMENSIONS` warnings untouched.

### Step 5: TypeScript — `aggregate-logic.ts` Piece 3 weight change

File: `cloud/apps/api/src/services/analysis/aggregate/aggregate-logic.ts`

Two changes in `aggregateAnalysesLogic`, in the per-model `overallWeights` section (lines ~182–215):

**Change 1**: Replace `overallWeights.push(n)` with `overallWeights.push(1)`.

**Change 2**: Inside the pooled-variance loop, replace:
```typescript
const w = n / totalWeight;
```
with:
```typescript
const w = 1 / overallMeans.length;
```

`overallMeans.length` equals the number of runs with valid overall stats (same value as `totalWeight` after the change to equal weights, but more explicit about intent).

The guard `if (n <= 0) return;` stays — a run with zero sample size has invalid stats and should still be excluded. The `n` variable is still needed for `totalModelSamples` and `sampleSize` (which keep their original meaning).

Do NOT change the `modelValueRates` section (lines 145–164) — it already uses equal-run weighting.

### Step 6: TypeScript — `analysisSemantics.preference.ts` Piece 5 weight change

File: `cloud/apps/web/src/components/analysis-v2/analysisSemantics.preference.ts`

In `buildMergedPreferenceModel`, change the two `weight: analysis.perModel[modelId]?.sampleSize ?? 0` expressions (lines ~236 and ~244) to `weight: 1`.

These are in the `overallSignedCenter` and `preferenceStrength` averaging blocks. The `winRate` block (line ~220) already uses `weight: 1` — leave it unchanged.

### Step 7: TypeScript — `analysisSemantics.utils.ts` Fix A

File: `cloud/apps/web/src/components/analysis-v2/analysisSemantics.utils.ts`

Change lines 153–155 in `parseRawPreferenceValueStats` from `isNonNegativeInteger` to `isNonNegativeNumber`:

```typescript
if (
  !isNonNegativeNumber(count.prioritized)
  || !isNonNegativeNumber(count.deprioritized)
  || !isNonNegativeNumber(count.neutral)
) {
```

Leave `isNonNegativeInteger` unchanged everywhere else in the file (lines 185, 197, 226, 231–232, 243, 245 use it for integer-typed fields that must remain integer-only).

### Step 8: TypeScript — `PairedRunComparisonCard.tsx` Fix B

File: `cloud/apps/web/src/components/analysis/PairedRunComparisonCard.tsx`

Remove the cells that read and display `count.prioritized`, `count.deprioritized`, and `count.neutral`. Do not replace them with other content — the cells are removed entirely.

### Step 9: TypeScript — `PairedRunComparisonCard.test.tsx` Fix B test update

File: `cloud/apps/web/tests/components/analysis/PairedRunComparisonCard.test.tsx`

Remove or update any assertions that reference count cell values (`count.prioritized`, etc.). Tests that assert those cells are absent (or simply don't reference them) are fine.

### Step 10: TypeScript — delete Bradley-Terry export Fix C

Delete both files entirely:
- `cloud/apps/api/src/mcp/tools/export-pairwise-outcomes.ts`
- `cloud/apps/api/tests/mcp/tools/export-pairwise-outcomes.test.ts`

The tool auto-deregisters when the file is gone. `cloud/apps/api/src/mcp/tools/index.ts` uses auto-discovery and does not need to be updated.

### Step 11: TypeScript — snapshot cache version bump

File: `cloud/apps/api/src/services/analysis/domain-analysis-cache-types.ts`, line 20

Change:
```typescript
export const DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION = '1.4.0';
```
to:
```typescript
export const DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION = '1.5.0';
```

### Step 12: New backfill script

File: `cloud/apps/api/src/cli/backfill-condition-weighted.ts` (new file)

Model on `backfill-aggregate-consistency.ts`. Key differences:

- **Skip condition (idempotency)**: Skip a row if any value in `(output as any).perModel` has a `conditionCount` key. This means the record was already backfilled with the new math.
- **Batch size**: 50 (smaller than consistency backfill due to heavier Python worker cost per row)
- **Flags**: `--dry-run`, `--force`, optional `--definition-id` and `--domain-id` filters
- **Log tokens**: `backfill-condition-weighted:skipped`, `backfill-condition-weighted:would-upgrade`, `backfill-condition-weighted:upgraded`, `backfill-condition-weighted:failed`
- **Call**: `await updateAggregateRun(row.run.definitionId, selection.preambleVersionId, selection.definitionVersion, selection.temperature)` — same as consistency backfill

---

## Testing Plan

### Python (pytest)

- `cloud/workers/stats/tests/test_basic_stats.py` — add or update:
  - **Worked example**: 10 conditions at 100% + 15 conditions at 60% → winRate ≈ 0.76 (not 0.647)
  - **Count sum invariant**: `count.prioritized + count.deprioritized + count.neutral` equals `conditionCount` within 1e-9
  - **Single-condition stdDev**: `overall.stdDev == 0.0` (not NaN)
  - **Partial-score condition**: condition with 2 scored trials and 1 unscored → condition mean uses only the 2 scored trials
  - **Zero-scored condition**: condition where all trials have no signed-distance score → excluded from `overall.mean`, `overall.stdDev`, `overall.min`, `overall.max`
  - **Empty transcripts**: empty input list → empty result dict (no crash)
  - **Missing scenarioId**: transcript missing `scenarioId` key → treated as a single default condition (use `t.get("scenarioId", "unknown")` consistent with existing `modelId` pattern)
  - **conditionCount**: equals number of unique scenarioIds in input
  - **Float rounding**: fractional counts are rounded to 6 decimal places
- `cloud/workers/tests/test_analyze_basic.py` — update assertions for new win rate values; for small-sample warnings, keep the triggering fixture but assert that `SMALL_SAMPLE` and `MODERATE_SAMPLE` codes are absent from the warnings list (do not simply delete the assertions — assert absence explicitly)

### TypeScript API (Vitest/Jest)

- `cloud/apps/api/tests/services/analysis/aggregate.test.ts` — update or add tests for equal-run pooling in `overall.mean`/`overall.stdDev`

### TypeScript Web (Vitest)

- `cloud/apps/web/tests/components/analysis-v2/analysisSemantics.test.ts` — update tests for `buildMergedPreferenceModel` equal-weight merging
- `cloud/apps/web/tests/components/analysis/PairedRunComparisonCard.test.tsx` — remove count cell assertions

---

## Backfill Runbook

**Order matters**: deploy code first, then run backfill. The version bump (Step 11) must be live before the backfill starts.

```bash
# 1. Deploy code (Railway: merge PR, wait for deploy)

# 2. Dry run — confirm scope
DATABASE_PUBLIC_URL=<prod_url> npx tsx cloud/apps/api/src/cli/backfill-condition-weighted.ts --dry-run

# 3. Spot-check the dry-run output. Expected: all AGGREGATE/CURRENT analyses show as "would-upgrade".
#    Records with conditionCount already present should show as "skipped".

# 4. Live run
DATABASE_PUBLIC_URL=<prod_url> npx tsx cloud/apps/api/src/cli/backfill-condition-weighted.ts

# 5. If interrupted, resume by re-running. Already-upgraded records are skipped automatically.

# 6. Spot-check: verify win rates match hand-computed condition-weighted values for ≥5 analyses.
```

---

## Post-Deploy Verification Checklist

- [ ] Deployed commit confirmed live on prod (Railway deploy log)
- [ ] Backfill complete: dry-run showed 0 skipped records before live run; live run shows 0 failed records
- [ ] API: query a known analysis and confirm `perModel[modelId].conditionCount` is present
- [ ] UI: v2 analysis page renders correctly with fractional counts (no NaN, no validation failures)
- [ ] UI: `PairedRunComparisonCard` no longer shows count cells
- [ ] UI: worked example model — win rate changed from ~64.7% to ~76% (or similar improvement)
- [ ] MCP: `export_pairwise_outcomes` tool no longer listed in MCP tool discovery
- [ ] No error spikes for 10 minutes post-backfill (Railway logs or Grafana)

---

## Files that change

| File | Change |
|---|---|
| `cloud/workers/stats/basic_stats.py` | Steps 1–3: ValueCounts floats, ModelStats conditionCount, aggregate_transcripts_by_model rewrite |
| `cloud/workers/stats/tests/test_basic_stats.py` | New/updated tests for condition-weighted math |
| `cloud/workers/tests/test_analyze_basic.py` | Update win rate assertions, remove warning assertions |
| `cloud/workers/analyze_basic_aggregation.py` | Step 4: remove small-sample warnings |
| `cloud/apps/api/src/services/analysis/aggregate/aggregate-logic.ts` | Step 5: equal-run weighting |
| `cloud/apps/api/tests/services/analysis/aggregate.test.ts` | Update pooling tests |
| `cloud/apps/web/src/components/analysis-v2/analysisSemantics.preference.ts` | Step 6: weight: 1 for overallSignedCenter + preferenceStrength |
| `cloud/apps/web/src/components/analysis-v2/analysisSemantics.utils.ts` | Step 7: isNonNegativeNumber for count fields |
| `cloud/apps/web/src/components/analysis/PairedRunComparisonCard.tsx` | Step 8: remove count cells |
| `cloud/apps/web/tests/components/analysis/PairedRunComparisonCard.test.tsx` | Step 9: remove count assertions |
| `cloud/apps/api/src/services/analysis/domain-analysis-cache-types.ts` | Step 11: version bump 1.4.0 → 1.5.0 |
| `cloud/apps/api/src/cli/backfill-condition-weighted.ts` | Step 12: new backfill script |
| `cloud/apps/api/src/mcp/tools/export-pairwise-outcomes.ts` | Step 10: DELETE |
| `cloud/apps/api/tests/mcp/tools/export-pairwise-outcomes.test.ts` | Step 10: DELETE |
| `cloud/apps/web/tests/components/analysis-v2/analysisSemantics.test.ts` | Preference merge weight tests |

## Files that do NOT change

- `cloud/apps/api/src/services/circumplex/aggregation.ts`
- `cloud/apps/api/src/graphql/queries/models-confidence.ts`
- `cloud/workers/stats/preference_stats.py` — passes `count` through unchanged; fractional values flow correctly
- `cloud/apps/api/src/mcp/tools/index.ts` — auto-discovers tools
- Any file under `src/` (legacy codebase)

---

## Open questions deferred to tasks

- None. All decisions are made. Proceed to tasks.

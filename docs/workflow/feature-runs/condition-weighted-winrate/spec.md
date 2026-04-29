# Spec: condition-weighted-winrate

**Author:** Claude (Opus 4.7, 2026-04-29)
**Status:** ready for plan stage
**Delivery path:** Feature Factory
**Slug:** condition-weighted-winrate

---

## Problem

ValueRank's analysis pipeline counts every trial equally. A condition sampled 5 times contributes 5 data points; a condition sampled 1 time contributes 1. This means heavily-sampled conditions dominate per-value win rates, the overall signed-distance mean, and multi-run pooled statistics.

The correct unit of analysis is the **condition** (one scenario presentation), not the trial. A condition that gets run 5 times gives us a more confident estimate, but it should still count as one condition — not five. Trial count measures confidence; condition count measures coverage.

**Worked example.**
A vignette has 25 conditions. 10 always prioritize self-direction (100% each). 15 prioritize it in 3 of 5 trials (60% each).

- Old math (trial-weighted, 10×1 + 15×5 = 85 total trials):
  (10 + 45) / 85 = **64.7%**
- Correct math (equal condition weight):
  (10 × 100 + 15 × 60) / 25 = **76%**

The same shape of bug exists in three places: the per-run aggregator, the multi-run rollup, and the cross-run preference merge.

---

## Goal

Fix the aggregation hierarchy so that each unique condition gets one vote at every level:

**trial → condition → vignette → domain → model**

The fix spans 5 pieces across 3 files. All 5 land in one PR.

---

## Decisions already made

| # | Decision |
|---|---|
| 1 | Fix all 5 pieces listed below. |
| 2 | `sampleSize` keeps its current meaning (total trial count). Add a new `conditionCount` field for the number of unique conditions seen. The field is typed optional for zero-downtime deployment only — the backfill adds it to all historical records and all new analyses always include it. Post-backfill, consumers may treat it as always present. |
| 3 | `count.prioritized / deprioritized / neutral` become fractional. Each condition contributes exactly 1.0 total across the three fields (within-condition proportions). |
| 4 | Multi-run pooling uses equal-run weighting (weight: 1 per run), not trial-count weighting. For ValueRank's full-domain paired batches, equal-run weighting is mathematically equivalent to equal condition weighting. Per-condition data storage is not required. |
| 5 | Remove the small-sample warning in `analyze_basic_aggregation.py`. After the fix the thresholds are against trials, but the metric is built from conditions — the warning is misleading. Remove it entirely rather than fix the thresholds. |
| 6 | Delete `export-pairwise-outcomes.ts` and its test file in full. The file is a self-contained MCP tool with no other callers. Bradley-Terry is no longer used. |
| 7 | Loosen the `isNonNegativeInteger` validator in `analysisSemantics.utils.ts` to allow non-negative floats. |
| 8 | Stop displaying raw count values in `PairedRunComparisonCard.tsx`. Fractional counts are not meaningful to show to users. |
| 9 | Backfill all historical analyses eagerly — re-run aggregation and overwrite stored output JSON. Silent rollout; no user communication needed. |

---

## Non-goals

- Circumplex Pairwise Heatmap (`cloud/apps/api/src/services/circumplex/aggregation.ts`) — out of scope, separate feature later.
- Models Confidence Heatmap (`cloud/apps/api/src/graphql/queries/models-confidence.ts`) — out of scope, separate feature later.
- Any change to how transcripts are classified as prioritized / deprioritized / neutral.
- New UI features, columns, or views.
- Changes to `sampleSize` field semantics.
- Wilson CI or any confidence-interval machinery.

---

## The 5 pieces

### Piece 1 — Per-condition value counts

**File:** `cloud/workers/stats/basic_stats.py`, function `aggregate_transcripts_by_model`

Change per-value `count.prioritized / deprioritized / neutral` from integer trial counts to fractional condition contributions. For each unique condition (identified by `scenarioId`), compute the proportion of trials that resulted in each status. Store those proportions, not raw counts.

After the change:
- `count.prioritized` for a value = sum of per-condition prioritized fractions across all conditions where the value appears. It is a float in [0, conditionCount].
- `count.prioritized + count.deprioritized + count.neutral` = number of conditions where the value appeared.
- `winRate` = `count.prioritized / (count.prioritized + count.deprioritized + count.neutral)` — unchanged formula, but now operates on fractional inputs.
- `conditionCount` (new field on `ModelStats`) = number of unique `scenarioId` values seen for this model.
- `sampleSize` (unchanged) = total trial count.

The `ValueCounts` TypedDict field types change from `int` to `float`.

### Piece 2 — Per-condition strength score

**Same file, same function.**

`overall.mean` and `overall.stdDev` currently average the signed-distance score across every trial (trial-weighted). Change to: compute one mean signed distance per condition first, then take the equal-weight mean and std dev across those condition-level means.

- `overall.mean` = mean of per-condition means.
- `overall.stdDev` = sample std dev of per-condition means (ddof=1, matching the current `compute_model_summary` convention). For a single condition, stdDev = 0.0 (same guard as the current code).
- `overall.min` = minimum of per-condition means. This shifts from "the most negative trial score" to "the most negative condition-mean score." This is the correct and consistent change — min/max should describe the distribution of condition-level summaries, not individual trial extremes.
- `overall.max` = maximum of per-condition means. Same rationale as min.

### Piece 3 — Multi-run rollup, equal-run pooling

**File:** `cloud/apps/api/src/services/analysis/aggregate/aggregate-logic.ts`, function `aggregateAnalysesLogic`

The pooling of `overall.mean` and `overall.stdDev` across source runs currently uses `sampleSize` (trial count) as the weight (`overallWeights.push(n)` at line 189). Change to weight: 1 per run (`overallWeights.push(1)`). The pooled variance formula also uses `n/totalWeight` as the per-run weight; change that to `1/numRuns`. For ValueRank's full-domain paired batches (all runs cover the same condition set), this gives every condition equal total weight across the pooled result.

**Assumption documented:** Equal-run weighting is correct when all pooled runs cover the same condition set. If materially asymmetric runs (e.g., a 10-condition targeted run pooled with a 100-condition full-domain run) are ever introduced, the plan stage should add a `conditionCount`-based weight instead. For now, the equal-run assumption is valid for the current domain-wide batch pattern.

### Piece 4 — Multi-run rollup, win rate (no code change needed)

**Same file, same function — verification only.**

Per-value `winRateMean` is already computed by collecting each source run's per-value `winRate` into `modelValueRates` and averaging them equally (lines 145–164 in `aggregate-logic.ts`). The sum-then-divide path that produces `target.winRate` (line 159) is a dead local variable never returned. No code change is required. This piece exists to confirm that the existing behavior is already correct and to document it explicitly so reviewers do not flag it as an unaddressed piece of the bug.

### Piece 5 — Cross-run preference merge, consistent weighting

**File:** `cloud/apps/web/src/components/analysis-v2/analysisSemantics.preference.ts`, function `buildMergedPreferenceModel`

Currently `winRate` is merged with `weight: 1` (equal per run), but `overallSignedCenter` and `preferenceStrength` are merged with `weight: sampleSize` (trial-weighted). Change the two trial-weighted merges to `weight: 1` so all three numbers follow the same convention.

---

## Consumer fixes (required to prevent breakage)

### Fix A — Validator precision fix

**File:** `cloud/apps/web/src/components/analysis-v2/analysisSemantics.utils.ts`

`parseRawPreferenceValueStats` validates `count.prioritized / deprioritized / neutral` as non-negative integers via `isNonNegativeInteger`. Fractional values from Piece 1 will fail this check, causing the function to return null and breaking the v2 analysis page.

**Important constraint:** `isNonNegativeInteger` is also used by other parsers in the same file (`parseAggregateMetadata`, `parseRawReliabilitySummaryEntry`) to validate fields like `sourceRunCount`, `plannedConditionCount`, `observedConditionCount`, `coverageCount`, and `uniqueScenarios` — all of which MUST remain integer-only. Broadening `isNonNegativeInteger` globally would silently weaken those validations.

Change: `isNonNegativeNumber` already exists in the file at line 56 (used for `baselineNoise` and `weightedOverallSignedCenterSd`). Switch lines 153–155 in `parseRawPreferenceValueStats` from `isNonNegativeInteger` to `isNonNegativeNumber` for the three count fields. No new predicate needed. Leave `isNonNegativeInteger` unchanged everywhere else.

### Fix B — Remove count display

**File:** `cloud/apps/web/src/components/analysis/PairedRunComparisonCard.tsx`

The component currently reads and displays `count.prioritized` (and sibling fields). Fractional values would show as "12.6" where users expect a whole number. Remove the count display entirely.

### Fix C — Delete Bradley-Terry export

**Files:**
- `cloud/apps/api/src/mcp/tools/export-pairwise-outcomes.ts` — delete
- `cloud/apps/api/tests/mcp/tools/export-pairwise-outcomes.test.ts` — delete

The file registers one MCP tool (`export_pairwise_outcomes`). Nothing else imports it. The tool auto-deregisters when the file is deleted.

### Fix D — Remove small-sample warning

**File:** `cloud/workers/analyze_basic_aggregation.py`

Remove the small-sample warning that fires on `sampleSize < 10` or `< 30`. After Piece 1, the metric being warned about is built from conditions, not trials. The warning thresholds are disconnected from the metric they describe. Remove entirely rather than reconfigure.

---

## Scope boundaries

### Files that change

| File | What changes |
|---|---|
| `cloud/workers/stats/basic_stats.py` | Pieces 1 and 2: `aggregate_transcripts_by_model`, `ValueCounts` TypedDict, new `conditionCount` field on `ModelStats`. |
| `cloud/workers/stats/tests/test_basic_stats.py` | New or updated unit tests covering condition-weighted averaging and strength score. |
| `cloud/workers/tests/test_analyze_basic.py` | Update assertions that depend on old trial-counting math. |
| `cloud/workers/analyze_basic_aggregation.py` | Fix D: remove small-sample warning. |
| `cloud/apps/api/src/services/analysis/aggregate/aggregate-logic.ts` | Pieces 3 and 4: switch pooling from trial-weighted to equal-run weighting. |
| `cloud/apps/api/tests/services/analysis/aggregate.test.ts` | Update test cases for the new pooling logic. |
| `cloud/apps/web/src/components/analysis-v2/analysisSemantics.utils.ts` | Fix A: loosen integer validator on count fields. |
| `cloud/apps/web/src/components/analysis/PairedRunComparisonCard.tsx` | Fix B: remove raw count display. Count cells are removed entirely — not replaced with other content. |
| `cloud/apps/web/tests/components/analysis/PairedRunComparisonCard.test.tsx` | Fix B: update or remove test assertions that reference count values. |
| `cloud/apps/api/src/mcp/tools/export-pairwise-outcomes.ts` | Fix C: delete file. |
| `cloud/apps/api/tests/mcp/tools/export-pairwise-outcomes.test.ts` | Fix C: delete file. |
| New backfill script (path TBD in plan) | Backfill with `--dry-run` mode, production-shaped fixtures, batch processing. |
| `cloud/apps/web/src/components/analysis-v2/analysisSemantics.preference.ts` | Piece 5: change `weight: sampleSize` → `weight: 1` for `overallSignedCenter` and `preferenceStrength`. |
| `cloud/apps/web/tests/components/analysis-v2/analysisSemantics.test.ts` | Update any tests that depend on trial-weighted preference merging. |

### Files that do NOT change

- `cloud/apps/api/src/services/circumplex/aggregation.ts` — Circumplex Heatmap, out of scope.
- `cloud/apps/api/src/graphql/queries/models-confidence.ts` — Models Confidence Heatmap, out of scope.
- `cloud/workers/stats/preference_stats.py` — passes `count` through unchanged; will carry fractional values correctly.
- `cloud/apps/api/src/mcp/tools/index.ts` — auto-discovers tools; no manual change needed when file is deleted.
- Any file under `src/` (legacy codebase).

---

## Edge cases

- **Condition with zero trials:** Cannot appear in `model_transcripts`; contributes nothing. Correct.
- **Value seen in some conditions but not others:** Only conditions where the value appears contribute to that value's average.
- **All trials for a condition return the same status:** Per-condition fraction is 0 or 1. Correct.
- **Single-trial condition:** Fraction is either 0 or 1 (no intermediate). High variance, but `conditionCount` and `sampleSize` exist to signal this.
- **Backfill dry run on large prod dataset:** Script must batch to avoid memory or timeout issues.
- **Condition with some missing signed-distance scores:** Compute condition mean from scored trials only. If a condition has zero scored trials, exclude it from `overall.*` entirely (see FR-005).
- **Backfill during live traffic:** Overwriting stored JSON while live traffic reads it. Plan stage must specify an atomic-write strategy (see FR-026).

---

## Functional requirements

- **FR-001:** `aggregate_transcripts_by_model` MUST group transcripts by `scenarioId` before computing per-value statistics.
- **FR-002:** For each (scenarioId, valueId) pair, the function MUST compute `prioritized_fraction = trials_prioritized / total_trials_for_this_condition`.
- **FR-003:** `count.prioritized` for a value MUST equal the sum of per-condition prioritized fractions. It MUST be a float. Values MUST be rounded to 6 decimal places using Python's `round(..., 6)` function, consistent with the existing `compute_value_stats` rounding convention.
- **FR-004:** `count.prioritized + count.deprioritized + count.neutral` for a value MUST equal the number of conditions where that value appeared, within a floating-point tolerance of `1e-9`. Tests MUST use `abs(sum - conditionCount) < 1e-9`, not exact equality.
- **FR-005:** `overall.mean` MUST be the equal-weight mean of per-condition signed-distance means. For a condition where some trials lack a signed-distance score, compute the condition mean from the scored trials only. If a condition has zero scored trials, exclude it from `overall.*` computations entirely.
- **FR-006:** `overall.stdDev` MUST be the std dev of per-condition signed-distance means.
- **FR-007:** `sampleSize` MUST remain the total trial count (unchanged).
- **FR-008:** `ModelStats` MUST include a new optional `conditionCount: int` field equal to the number of unique `scenarioId` values seen.
- **FR-009:** `aggregateAnalysesLogic` MUST pool `overall.mean` and `overall.stdDev` with `weight: 1` per run.
- **FR-010:** `aggregateAnalysesLogic` MUST compute pooled win rates by averaging per-run `winRate` values with `weight: 1` per run.
- **FR-011:** `buildMergedPreferenceModel` MUST merge `overallSignedCenter` and `preferenceStrength` with `weight: 1` per run.
- **FR-012:** `parseRawPreferenceValueStats` in `analysisSemantics.utils.ts` MUST use the existing `isNonNegativeNumber` predicate (already defined at line 56) instead of `isNonNegativeInteger` for `count.prioritized / deprioritized / neutral`. The `isNonNegativeInteger` predicate MUST remain unchanged and continue to be used by all other parsers in that file.
- **FR-013:** `PairedRunComparisonCard.tsx` MUST NOT render raw count values from `count.prioritized` or sibling fields.
- **FR-014:** `export-pairwise-outcomes.ts` and its test file MUST be deleted.
- **FR-015:** The small-sample warning in `analyze_basic_aggregation.py` MUST be removed.
- **FR-016:** A backfill script MUST provide a `--dry-run` mode that reports how many analyses would be updated and a sample of changed win rate values, without writing to the database.
- **FR-017:** The backfill script's tests MUST use production-shaped fixtures (matching real production data format, not idealized schema).
- **FR-024:** The backfill script MUST be idempotent: running it a second time on already-updated records MUST produce the same output and MUST NOT corrupt data.
- **FR-025:** The backfill script MUST be resumable: if interrupted mid-run, it MUST be able to restart and process only the remaining records without duplicating work. The plan stage MUST specify a resumability mechanism (e.g., checkpoint file, per-record status flag, or batch-range argument).
- **FR-026:** The plan stage MUST specify an atomic-write strategy for overwriting stored analysis JSON during live traffic. Acceptable strategies include: (a) atomic file/record swap, (b) versioned writes with a flag day cutover, or (c) running the backfill in a controlled maintenance window. The chosen strategy MUST be documented in the plan before implementation begins.
- **FR-018:** The plan MUST include a post-deploy verification checklist: (1) deployed commit confirmed on prod, (2) backfill row counts checked, (3) UI and API correct end-to-end, (4) no error spikes for 10 minutes post-deploy.
- **FR-019:** TypeScript type definitions for the `count` sub-object of `ValueStats` (or equivalent interface) MUST be updated to declare `prioritized`, `deprioritized`, and `neutral` as `number` (float-compatible), not `integer`. Applies in any file that declares this shape as a TypeScript interface or type.
- **FR-020:** The Python `ValueCounts` TypedDict in `basic_stats.py` MUST change its field types from `int` to `float` for `prioritized`, `deprioritized`, and `neutral`.
- **FR-021:** `overall.min` and `overall.max` in `ModelStats` MUST represent the minimum and maximum of per-condition signed-distance means, not individual trial scores. This is consistent with `overall.mean` and `overall.stdDev` and is an explicit, intentional semantic shift.
- **FR-022:** When only one condition is present, `overall.stdDev` MUST be `0.0` (not NaN), matching the existing `compute_model_summary` guard for single-element score lists.
- **FR-023:** The plan MUST verify that `preference_stats.py` correctly passes fractional `count` values through without performing any implicit integer arithmetic. A targeted test case or code inspection must confirm this before the spec checkpoint is considered complete.

---

## Success criteria

- **SC-001:** The worked example from the Problem section produces 76%, not 64.7%.
- **SC-002:** `sampleSize` in `ModelStats` output equals total trial count — same as before.
- **SC-003:** `conditionCount` in `ModelStats` output equals the number of unique `scenarioId` values.
- **SC-004:** `overall.mean` is the mean of per-condition means, not the mean of all trials.
- **SC-005:** Pooled win rates across multiple runs weight each run equally.
- **SC-006:** All preflight checks pass: lint, test, and build across shared, db, api, and web workspaces.
- **SC-007:** The backfill script runs to completion without errors. A spot-check of at least 5 historical analyses (including at least one with multi-trial conditions and one with single-trial conditions) confirms win rates match hand-computed condition-weighted values.
- **SC-008:** No TypeScript build errors introduced by fractional count fields.
- **SC-009:** The `export_pairwise_outcomes` MCP tool is no longer registered after deploy.
- **SC-010:** The v2 analysis page renders correctly on analyses backfilled with fractional counts.

---

## Out of scope — record as follow-ups in closeout.md

1. **Circumplex Pairwise Heatmap** — `cloud/apps/api/src/services/circumplex/aggregation.ts` — trial-weighted in its own code path.
2. **Models Confidence Heatmap** — `cloud/apps/api/src/graphql/queries/models-confidence.ts` — trial-weighted in its own code path.
3. **`canonicalConditionSummary.ts:129`** — `isOpponent = selectedValueWinRate < 0.5` pre-existing semantic issue, unrelated to this fix.

---

## Snapshot cache invalidation (plan-stage requirement)

The backfill script must address derived caches that are built from stored analysis JSON, not just the raw `AnalysisResult` rows. Known derived caches that will be stale after the backfill:

- **Domain analysis snapshots** — built by `domain-analysis-snapshot-builder.ts`, read by `domain-analysis-cache.ts`. Invalidation mechanism: bump `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` in `domain-analysis-cache-types.ts` (same pattern used by `winrate-honest-denominator`).
- Any other snapshot or rollup layers identified during plan-stage research.

The plan stage MUST enumerate all derived caches and specify an invalidation strategy for each before the spec checkpoint can be considered fully satisfied.

---

## Out-of-scope note for reviewers

The Circumplex Pairwise Heatmap (`circumplex/aggregation.ts`) and Models Confidence Heatmap (`models-confidence.ts`) remain trial-weighted after this feature. This is an **intentional, user-confirmed scope boundary** — not an oversight. Both are documented as explicit follow-up features in the non-goals and the closeout follow-ups list. Reviewers should not flag these as spec defects.

---

## Open questions for the plan stage

- Exact backfill script location and database query pattern (what table, what columns to overwrite).
- Whether the backfill runs against the `AnalysisResult` table's stored JSON blob or triggers a worker re-run.
- Concurrency strategy for backfill during live traffic.
- Exact `isNonNegativeInteger` replacement — rename in place or add a new predicate and leave the old one for other callers.

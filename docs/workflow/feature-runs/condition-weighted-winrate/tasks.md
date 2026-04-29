# Tasks: condition-weighted-winrate

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Phase 1: Python types and algorithm

- [ ] T001 `cloud/workers/stats/basic_stats.py` — Change `ValueCounts` TypedDict fields to `float` (lines 15–20)
- [ ] T001b `cloud/workers/stats/basic_stats.py` — Update `compute_value_stats` signature from `int` to `float` for `prioritized`, `deprioritized`, `neutral` params. The function body is unchanged; only the type annotations change.
- [ ] T002 `cloud/workers/stats/basic_stats.py` — Add `from typing import NotRequired`. Add `conditionCount: NotRequired[int]` to `ModelStats` TypedDict
- [ ] T003 `cloud/workers/stats/basic_stats.py` — Rewrite `aggregate_transcripts_by_model`: group by `scenarioId`, compute per-condition per-value fractions (round to 6 dp), build per-condition means for scoring. Set `conditionCount=len(by_condition)`. Skip conditions with zero scored trials from `overall.*`.

**Checkpoint**: TypedDict types correct. `conditionCount` is `NotRequired[int]`.

---

## Phase 2: Python — small-sample warning removal

- [ ] T004 `cloud/workers/analyze_basic_aggregation.py` — Remove `SMALL_SAMPLE` and `MODERATE_SAMPLE` warning blocks from `generate_warnings` (lines 171–182). Leave `NO_DIMENSIONS` and `PARTIAL_DIMENSIONS` blocks.

**Checkpoint**: No `SMALL_SAMPLE`/`MODERATE_SAMPLE` strings remain in file.

---

## Phase 3: Python tests

- [ ] T005 `cloud/workers/stats/tests/test_basic_stats.py` — Add tests: (a) worked example → winRate ≈ 0.76, (b) count sum within 1e-6 of conditionCount (matches 6dp rounding precision), (c) single-condition stdDev=0.0, (d) partial-score condition uses only scored trials, (e) zero-scored condition excluded from overall.*, (f) empty input → empty dict, (g) missing scenarioId → keyed as "unknown", (h) conditionCount=len(unique scenarioIds), (i) floats rounded to 6 dp
- [ ] T006 `cloud/workers/tests/test_analyze_basic.py` — Update win rate assertions. Keep SMALL_SAMPLE fixture; assert the warning codes list does NOT contain "SMALL_SAMPLE" or "MODERATE_SAMPLE".

**Checkpoint**: `python3 -m pytest cloud/workers/ -x` passes

---

## Phase 4: TypeScript — aggregate-logic.ts

- [ ] T007 `cloud/apps/api/src/services/analysis/aggregate/aggregate-logic.ts` — Change `overallWeights.push(n)` → `push(1)`. Change `const w = n / totalWeight` → `const w = 1 / overallMeans.length`. Keep `if (n <= 0) return` guard. Leave `modelValueRates` section (lines 145–164) untouched.
- [ ] T008 `cloud/apps/api/tests/services/analysis/aggregate.test.ts` — Update/add tests: 10-trial run and 1-trial run each contribute equally to pooled mean.

---

## Phase 5: TypeScript — preference merge

- [ ] T009 `cloud/apps/web/src/components/analysis-v2/analysisSemantics.preference.ts` — Change both `weight: analysis.perModel[modelId]?.sampleSize ?? 0` (lines ~236, ~244) to `weight: 1`. Leave `winRate` block unchanged.
- [ ] T010 `cloud/apps/web/tests/components/analysis-v2/analysisSemantics.test.ts` — Update preference merge tests for equal-weight.

---

## Phase 6: TypeScript — validator fix

- [ ] T011 `cloud/apps/web/src/components/analysis-v2/analysisSemantics.utils.ts` — Lines 153–155: change `isNonNegativeInteger` → `isNonNegativeNumber` for count.prioritized/deprioritized/neutral only. Leave all other `isNonNegativeInteger` calls unchanged.

---

## Phase 7: TypeScript — UI cleanup

- [ ] T012 `cloud/apps/web/src/components/analysis/PairedRunComparisonCard.tsx` — Remove the `showOrderDetail` detail mode entirely: (a) remove the `showOrderDetail` state and toggle buttons, (b) remove the per-orientation `colSpan={3}` header groups for `aFirstGroupLabel`/`bFirstGroupLabel` from the `showOrderDetail` header branch, (c) remove the 6 count-display cells (aFirst.first/neutral/second + bFirst.first/neutral/second) from the body, (d) collapse to always-show the Blended columns. Delete the now-unused `getPriorityCount`, `getNeutralCount`, and `formatCount` helpers.
- [ ] T013 `cloud/apps/web/tests/components/analysis/PairedRunComparisonCard.test.tsx` — Remove/update assertions for count cells, showOrderDetail toggle, and per-orientation count values. Assert those elements no longer exist.

---

## Phase 8: Delete Bradley-Terry

- [ ] T014 DELETE `cloud/apps/api/src/mcp/tools/export-pairwise-outcomes.ts`
- [ ] T015 DELETE `cloud/apps/api/tests/mcp/tools/export-pairwise-outcomes.test.ts`

**Checkpoint**: No references to `export-pairwise-outcomes` or `export_pairwise_outcomes` remain.

---

## Phase 9: Snapshot cache + backfill

- [ ] T016 `cloud/apps/api/src/services/analysis/domain-analysis-cache-types.ts` — Change `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` from `'1.4.0'` to `'1.5.0'` (line 20)
- [ ] T017 `cloud/apps/api/src/cli/backfill-condition-weighted.ts` — New script modeled on `backfill-aggregate-consistency.ts`. BATCH_SIZE=50. Skip function `hasConditionWeightedShape`: returns true if ALL `perModel` entries have `conditionCount`. Supports `--dry-run`, `--force`, `--definition-id`, `--domain-id`. Calls `updateAggregateRun` per row.

---

## Phase 10: Preflight [CHECKPOINT]

Run from `cloud/` directory. Fix all errors before next step.

- [ ] T018 [P] `npm run lint --workspace @valuerank/shared`
- [ ] T019 [P] `npm run lint --workspace @valuerank/db`
- [ ] T020 `npm run lint --workspace @valuerank/api`
- [ ] T021 `npm run test --workspace @valuerank/api` (requires DATABASE_URL + JWT_SECRET)
- [ ] T022 `npm run build --workspace @valuerank/api`
- [ ] T023 `npm run lint --workspace @valuerank/web`
- [ ] T024 `npm run test --workspace @valuerank/web`
- [ ] T025 `npm run build --workspace @valuerank/web`
- [ ] T026 `python3 -m pytest cloud/workers/ -x`

**[CHECKPOINT]**: All pass. No TypeScript errors. No failing tests.

---

## DO NOT TOUCH

`cloud/apps/api/src/services/circumplex/aggregation.ts`, `cloud/apps/api/src/graphql/queries/models-confidence.ts`, `cloud/workers/stats/preference_stats.py`, `cloud/apps/api/src/mcp/tools/index.ts`, `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `MEMORY.md`, `.gitignore`, any file under `src/`, any file not listed above.

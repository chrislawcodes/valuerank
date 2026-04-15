# Spec: winrate-honest-denominator

**Author:** Claude (Sonnet, 2026-04-14 — rewrite pass after remove-compare-page merged)
**Status:** ready for plan stage
**Delivery path:** Feature Factory
**Prerequisite:** `remove-compare-page` (PR #631, commit `27454f00`) merged — removed Wilson CI backend plumbing and the Compare page.
**Unblocks:** nothing formally. This is a correctness fix on an analysis primitive that downstream features (cross-model rankings, model dominance analysis) rely on.

---

## Problem

ValueRank's `winRate` statistic drops neutral responses from the denominator:

```python
# cloud/workers/stats/basic_stats.py:47-65 (on main)
def compute_win_rate(prioritized: int, deprioritized: int) -> float:
    total = prioritized + deprioritized              # neutrals not counted
    if total == 0:
        return 0.5
    return prioritized / total
```

A value the model treats neutrally 90 times out of 100 and prioritizes the other 10 times (with zero deprioritizations) reports `winRate = 1.0`. That is not an honest win rate. It inflates the apparent strength of any value the model rarely takes a strong stance on.

### Why this matters now

1. **Scientific honesty.** ValueRank's public framing is that `winRate` measures how often a model prioritizes a value. Excluding neutrals misrepresents that.
2. **Downstream analysis work leans on `winRate` as a primary ordering key.** Fixing it before more features pile on avoids rebuilding those features later.
3. **The bucket logic in `analysis-v2` is already subtly broken** because it uses `winRate > 0.5` / `winRate < 0.5` to label values as prioritized / deprioritized / neutral. That bucket logic only makes sense under the old formula. See § Risk — 0.5 threshold.

---

## Goal

**Single honest formula, consistent everywhere:**

```
winRate = prioritized / (prioritized + deprioritized + neutral)
```

- Applied in every winRate computation site (Python stats worker, API aggregation, web aggregation, standalone ranking script).
- The web `analysis-v2` bucket logic is redesigned so "top prioritized / top deprioritized" labels are **model-relative** (Option A — compare to the model's mean winRate across values), since 0.5 is no longer a meaningful neutral baseline.
- The `compute_win_rate(0, 0, 0) == 0.5` fallback is preserved (still means "no data").
- The `compute_win_rate(0, 0, neutral>0)` case flips from `0.5` to `0.0` — this is correct: we do have data and the model never prioritized the value.
- **Two code-version constants bump in lockstep.** The Python worker's `CODE_VERSION` goes `"1.1.1"` → `"1.2.0"` (in `analyze_basic_metadata.py` after slice 0) AND the API TS handler's separately-duplicated `CODE_VERSION` at `cloud/apps/api/src/queue/handlers/analyze-basic.ts:34` also goes `"1.1.1"` → `"1.2.0"`. The TS constant is what the re-compute cache-hit check at `analyze-basic.ts:73` actually reads — bumping only the Python side would not invalidate a single cache hit. The aggregate constant `AGGREGATE_ANALYSIS_CODE_VERSION` at `cloud/apps/api/src/services/analysis/aggregate/constants.ts:1` (currently `"1.2.0"` on main) bumps to `"1.3.0"` so aggregate rows also get a version signal.
- **One-shot migration marks all existing basic + aggregate `AnalysisResult` rows as SUPERSEDED.** Necessary because the read path `cloud/apps/api/src/graphql/queries/analysis.ts:21` queries by `status='CURRENT'` regardless of `codeVersion` — a version bump alone does not invalidate any existing row. The migration is the invalidation. After it runs, existing runs show the same UI state as a never-analyzed run; users trigger a fresh re-compute via the existing force-recompute mutation path. No eager recompute script — the worker re-runs on demand.
- `domain-analysis-cache` (actually defined in `cloud/apps/api/src/services/analysis/domain-analysis-cache-types.ts:19` as `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION = "1.0.0"`, written in `domain-analysis-snapshot-builder.ts:365`) is a DIFFERENT cache that serves pre-computed domain-level rollups. It is not the stale-row problem above — that's the `AnalysisResult` table. For the domain snapshot cache, bump `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` to `"1.1.0"` so domain snapshots recompute after deploy.
- UI help copy and canonical docs updated so the displayed formula matches reality.

---

## Non-goals

- No change to how transcripts are classified as prioritized / deprioritized / neutral. The upstream labeling is untouched.
- No new UI features, columns, or views. This is a semantics fix.
- No reintroduction of Wilson CI or any confidence-interval machinery. That backend was deleted in `remove-compare-page` and stays deleted.
- No consolidation of duplicated aggregation logic (API vs web). Out of scope — see § Follow-ups.
- No changes to `.gitignore`, CI config, or test infrastructure.
- No reopening of PR #627 (`fix(overview): show win rate for neutral preferred values`) — that fix is independently correct and stays.
- No rework of the "overall.mean" per-model aggregate (that's a separate signed-distance average, not a winRate).

---

## User decisions already made

| # | Question | Decision |
|---|---|---|
| 1 | Formula | `prioritized / (prioritized + deprioritized + neutral)` everywhere. |
| 2 | `analysisSemantics.preference.ts` bucket redesign | **Option A — model-relative mean.** Top 3 values by `winRate - model_mean` descending, bottom 3 ascending, neutral bucket for values near the model's mean. |
| 3 | `analyze_basic.py` split scope | Split the file under 400 lines as **slice 0** of this feature before touching any winRate logic. Required because the file is 704 lines on main and the CI file-size check blocks any edits to over-limit files. |
| 4 | Backfill | **One-shot migration at deploy time** (decision updated post-review — the original "lazy via CODE_VERSION bump" was premised on a read-path version check that does not exist; see § Stale data — resolved). A Prisma migration sets `status='SUPERSEDED'` on every `AnalysisResult` row where `analysisType IN ('basic', 'AGGREGATE')` and `status='CURRENT'`. Existing UI re-computes on-demand via the force-recompute path. No eager backfill script. In parallel, bump both basic-side `CODE_VERSION` constants (Python + TS handler) to `"1.2.0"`, bump aggregate `AGGREGATE_ANALYSIS_CODE_VERSION` to `"1.3.0"`, bump `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` to `"1.1.0"`. |
| 5 | Wilson CI | Do not reintroduce. `remove-compare-page` removed the backend plumbing. The standalone `compute_rankings.py` script's internal `wilson_score_interval` helper stays (it's self-contained) but its `total` input changes to the new honest denominator. |

---

## Affected surfaces — enumerated from the current main branch

Numbers below are line references on `main` as of commit `27454f00`. Expect drift during implementation; the plan/tasks stages will re-verify.

### Python worker — source of truth

| File | Size | What changes |
|---|---|---|
| `cloud/workers/analyze_basic.py` | **704 lines (over limit)** | **Slice 0 refactor, no logic change.** Extract `CODE_VERSION`, `SUMMARY_CONTRACT_VERSION`, and the `methodsUsed` dict into a new `cloud/workers/analyze_basic_metadata.py`. Extract aggregation helpers into `cloud/workers/analyze_basic_aggregation.py` (or similar — the plan stage decides the exact split). Target: every resulting file < 400 lines, `analyze_basic.py` itself < 400 lines. Must preserve behavior byte-for-byte. Then, in a later slice: drop the dead `"winRateCI": "wilson_score"` key from `methodsUsed`, bump `CODE_VERSION` to `"1.2.0"`. |
| `cloud/workers/stats/basic_stats.py:47-95` | 254 lines | `compute_win_rate(prioritized, deprioritized, neutral=0)` — add `neutral` param (default 0 for caller backwards compat), change denominator to include neutrals. `compute_value_stats:86` — pass `neutral` through. Drop the unused `confidence: float = 0.95` parameter from `compute_value_stats` (dead param from the old Wilson CI era). Update docstrings. |
| `cloud/workers/tests/test_analyze_basic.py` | — | Update the aggregation test around line 978-982 (`# 3 prioritized, 1 deprioritized = 75% win rate`) — the fixture already has zero neutrals for that case, so the expected value stays at `0.75`. BUT: also remove the `assert methods["winRateCI"] == "wilson_score"` assertion (line 218) since `winRateCI` leaves `methodsUsed` in this feature. Add new test cases for the headline change (see § Verification plan). |
| `cloud/workers/stats/tests/test_basic_stats.py` | — | **Create this file.** Dedicated unit tests for `compute_win_rate` and `compute_value_stats` — the repo currently tests these only indirectly via `test_analyze_basic.py`. Not strictly required for the fix, but the spec calls for it because the edge cases (`0/0/0`, `0/0/N`, `P/D/0`) deserve direct coverage. |

### API TypeScript aggregation

| File | What changes |
|---|---|
| `cloud/apps/api/src/services/analysis/aggregate/aggregate-logic.ts:154-156` | Current: `totalBattles = prioritized + deprioritized; winRate = totalBattles > 0 ? totalWins / totalBattles : 0`. New: include `target.count.neutral` in the denominator. Rename `totalBattles` → `totalResponses`. Fallback stays `0` (not `0.5`) to match the existing behavior on this code path. |
| `cloud/apps/api/src/services/analysis/aggregate/contracts.ts` | No schema change. Field names on `zValueStats` stay identical. |
| `cloud/apps/api/src/services/analysis/aggregate/constants.ts:1` | **Bump** `AGGREGATE_ANALYSIS_CODE_VERSION = '1.2.0'` → `'1.3.0'`. Currently `'1.2.0'` on main. This is the version signal the aggregate pipeline writes into `analysisResult.codeVersion` at `aggregate-run-workflow.ts:168,193` when a new aggregate row is persisted. |
| `cloud/apps/api/tests/services/analysis/aggregate.test.ts` | Add at least one test case with non-zero neutrals that proves the new denominator is used. |

### API queue handler — TS-side CODE_VERSION duplicate

The `analyze_basic` job handler has its OWN `CODE_VERSION` constant that gets used at two code paths: (a) cache-hit check before re-running the Python worker (line 73), (b) writing the version into the persisted `analysisResult.codeVersion` field (line 169). This is independent of the Python worker's constant — bumping only the Python side does not fire the cache-hit check or tag new rows.

| File | What changes |
|---|---|
| `cloud/apps/api/src/queue/handlers/analyze-basic.ts:34` | Bump `const CODE_VERSION = '1.1.1';` → `'1.2.0'`. Must match the Python worker's `CODE_VERSION` in `analyze_basic_metadata.py` (bumped in slice 1). |
| `cloud/apps/api/tests/queue/handlers/analyze-basic.integration.test.ts:284` | Update assertion `expect(result?.codeVersion).toBe('1.1.1');` → `'1.2.0'`. |

### API — domain-analysis value-detail resolver (`selectedValueWinRate`)

This is a second-tier winRate metric: "what fraction of the time did the selected value beat its opponent in a pairwise comparison, in this condition / vignette". The current formula drops neutrals, same bug as the primary `winRate`.

| File | What changes |
|---|---|
| `cloud/apps/api/src/graphql/queries/domain/analysis/value-detail-types.ts:33,42` | `mapCondition` — change `comparisonDenominator = condition.prioritized + condition.deprioritized` → include `condition.neutral`. |
| `cloud/apps/api/src/graphql/queries/domain/analysis/value-detail-types.ts:55,66` | `mapVignette` — same fix for the vignette-level `selectedValueWinRate`. |
| `cloud/apps/web/tests/pages/DomainAnalysisValueDetail.test.tsx:162-176` | Test fixture `createCondition` helper computes expected `selectedValueWinRate` with the old denominator (`prioritized / totalDirectionalTrials`). Update to match the new formula. |
| `cloud/apps/api/tests/graphql/queries/domain-analysis.test.ts:320` | If this test hand-computes expected `selectedValueWinRate` values, update. Grep the file for assertions first. |

Note: `cloud/apps/web/src/utils/canonicalConditionSummary.ts:128` computes `selectedValueWinRate = (counts.strongly + counts.somewhat) / totalTrials` where `totalTrials` already includes `neutral + opponent* `. **This is already the honest formula** — no change needed. The 0.5 threshold at line 129 (`isOpponent = selectedValueWinRate < 0.5`) is a different semantic question ("did the selected value win more than the opponent in pairwise outcomes?") and is unaffected by the denominator change.

### API MCP export

| File | What changes |
|---|---|
| `cloud/apps/api/src/mcp/tools/export-pairwise-outcomes.ts:200,204` | **No math changes needed** — this tool just passes through `valueAStats?.winRate` / `valueBStats?.winRate` from the upstream stats. It inherits the fix automatically. Update the tool description string to note the formula changed, so external MCP callers know. |
| `cloud/apps/api/tests/mcp/tools/export-pairwise-outcomes.test.ts:72-77,162-163` | **Specific hand-computed fixture:** a test case with `neutral: 1` and expected `winRate: 0.75 / 0.25`. Under the new formula with `prioritized=3, deprioritized=1, neutral=1`, the expected value becomes `3 / 5 = 0.6` (and the opposing fixture becomes `1 / 5 = 0.2`). Update both the fixture-side `winRate` literal at ~72-77 and the matching assertion at ~162-163. Also grep the file for any OTHER hand-computed `winRate:` literals with non-zero neutrals and update. |

### Web TypeScript — three computation sites and one copy site

| File | What changes |
|---|---|
| `cloud/apps/web/src/components/analysis-v2/analysisSemantics.preference.ts:101-115` | **Bucket redesign (Option A).** Compute `modelMean = average(winRate across all values for this model)`. Replace the `winRate > 0.5 + EPSILON` filter with `winRate > modelMean + EPSILON`. Same for deprioritized (`< modelMean - EPSILON`). Neutral bucket: `|winRate - modelMean| <= EPSILON`. Sorting key changes from `Math.abs(winRate - 0.5)` to `Math.abs(winRate - modelMean)`. Keep the top-3 / bottom-3 slices. |
| `cloud/apps/web/src/components/analysis-v2/analysisSemantics.preference.ts:167-182` | **Second web computation site** (merged winRate across multi-scope analyses). Add `neutral` to `totalBattles` → rename to `totalResponses`, include neutrals. Fallback stays `0.5` (matches current behavior for "no data"). |
| `cloud/apps/web/src/pages/DomainAnalysis.tsx:143-146` | **Third web computation site.** Current: `denom = e.prioritized + e.deprioritized`. New: `denom = e.prioritized + e.deprioritized + (e.neutral ?? 0)`. The same file already computes `supportRate` with the honest denominator at lines 147-152 — use the same shape. |
| `cloud/apps/web/src/components/domains/ValuePrioritiesHelpPanel.tsx:27-55` | **User-visible copy — broader than just the formula string.** The component currently has THREE outdated lines in the 27-55 range: (a) calls winRate a "conditional win rate", (b) says it "shows how often a value wins once the model picks a side", (c) shows the formula `prioritized / (prioritized + deprioritized)` at ~line 40, and (d) shows `Win Rate = prioritized / (prioritized + deprioritized) × 100%` at ~line 55. Under the honest denominator, "conditional" and "once the model picks a side" are false — neutrals are now in the denominator. Rewrite the help panel's winRate section so: the formula matches reality, the phrasing says "the fraction of times the model prioritized this value across all decisions including neutral", and any "conditional" framing is removed. Keep the support-mode help text unchanged (that is a different metric and is correct). |
| `cloud/apps/web/tests/components/analysis-v2/analysisSemantics.test.ts` | Update test fixtures and assertions. The bucket assertions will change shape — they now depend on model-mean positioning, not absolute 0.5 positioning. Add an explicit test: a model where every value has `winRate = 0.3` should put the top-3 as the 3 values closest to 0.3 (not all "deprioritized"), because 0.3 IS that model's mean. |

### Standalone script

| File | What changes |
|---|---|
| `cloud/scripts/analysis/compute_rankings.py:60-111` | `compute_win_rates` (plural) iterates per-value and calls `compute_win_rate` internally. Current: `total_decisive = pri + dep; win_rate = pri / total_decisive`. New: include neutrals. Update `total` input to `wilson_score_interval` at the call site (line ~90) — the helper itself is correct, only its input changes. |
| `cloud/scripts/analysis/compute_rankings.py:38-46` | Keep `wilson_score_interval` — it's a self-contained helper used by this script to emit CI columns to `win-rate-rankings.csv`. Do not delete. |

### Cache invalidation — two distinct caches, two distinct mechanisms

**Cache 1 — `AnalysisResult` rows (persisted per-run analysis output).** This is NOT a key-lookup cache; it's a Postgres table. Bumping `CODE_VERSION` does not affect existing rows. Handled by the slice 5 Prisma migration that sets `status='SUPERSEDED'` on every existing basic + aggregate row.

**Cache 2 — Domain analysis snapshots (pre-computed domain-level rollups).**

| File | What changes |
|---|---|
| `cloud/workers/analyze_basic_metadata.py` (new, from slice 0) | Bump `CODE_VERSION` from `"1.1.1"` to `"1.2.0"`. This is the Python-worker-side version stamp. |
| `cloud/apps/api/src/queue/handlers/analyze-basic.ts:34` | Bump the duplicated TS-side `CODE_VERSION` from `'1.1.1'` to `'1.2.0'`. This is what the cache-hit check at `:73` actually reads. Must match the Python side. |
| `cloud/apps/api/src/services/analysis/aggregate/constants.ts:1` | Bump `AGGREGATE_ANALYSIS_CODE_VERSION` from `'1.2.0'` to `'1.3.0'`. |
| `cloud/apps/api/src/services/analysis/domain-analysis-cache-types.ts:19` | Bump `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` from `"1.0.0"` to `"1.1.0"`. The snapshot-builder at `domain-analysis-snapshot-builder.ts:365` already reads this constant when writing, and the read path is version-aware. Bumping the constant is the only edit needed — no migration, no startup hook. |

### Canonical docs

| File | What changes |
|---|---|
| `docs/features/analysis.md:71,86-96` | Update the winRate formula text. Current: `Win Rate = prioritized / (prioritized + deprioritized)` and "Neutral responses are excluded from the calculation." New: `Win Rate = prioritized / (prioritized + deprioritized + neutral)` and "All decided responses (including neutral) are counted in the denominator." Delete the stale "Wilson score confidence intervals handle small samples well" line — Wilson CI is gone. |
| `docs/features/analysis.md:72-77` | **Additional cleanup:** the `ValueStats` type doc still declares a `confidenceInterval` field that no longer exists in the TypeScript type. Remove the field from the doc's type listing. |
| `docs/features/analysis.md:184-193` | **Additional cleanup:** the `MethodsUsed` type doc still declares a `winRateCI: "wilson_score"` field. Slice 1 removes that key from `build_methods_used()` — update this doc to match. |
| `docs/features/analysis.md:317-321` | **Additional cleanup:** a section-label string that reads "Per-value win rates and CIs". The "and CIs" suffix is stale. Change to "Per-value win rates". |
| `docs/canonical-glossary.md` | **Add a new `winRate` entry.** Verified during exploration: the glossary currently has no `winRate` / `win rate` reference at all. Add an entry stating the new formula explicitly. |
| `docs/valuerank_prd.yaml`, `docs/values-summary.md` | **No changes.** Verified during exploration: neither file has any `winRate` / `win_rate` / `Win Rate` reference. Listed here only so the plan stage doesn't re-grep. |

### What does NOT change (verified during exploration)

- `cloud/apps/web/src/services/` — this directory does not exist on main post-`remove-compare-page`. The stale draft spec listed `AggregateAnalysisService.ts` — that file is gone. No action.
- `cloud/apps/api/src/` — no Wilson CI code remains. No action on CI.
- `cloud/apps/web/src/components/domains/DominanceSectionChart.tsx:238` — uses `winRate = 1 / (1 + Math.exp(-edge.gap))` which is a logistic-from-gap-score, a completely different metric. Out of scope.
- `cloud/apps/web/src/components/domains/ValuePrioritiesSection.tsx:362-366` — just reads `model.winRates[value]` and displays it. No math. Automatically correct once upstream producers are fixed.
- `cloud/apps/web/src/utils/canonicalConditionSummary.ts:128-129` — the `selectedValueWinRate = (strongly+somewhat)/totalTrials` computation at line 128 already uses a neutral-inclusive denominator (because `totalTrials` has always included neutral), so the denominator is already correct. **However**, line 129 uses `isOpponent = selectedValueWinRate < 0.5` as a binary winner test, and under a neutral-inclusive denominator 0.5 is NOT the threshold between "selected wins" and "opponent wins" — a condition with 40% selected-prioritized / 30% opponent-prioritized / 30% neutral flags as "opponent winning" (winRate = 0.4) even though the selected value was prioritized more often. This is a **pre-existing bug**, present on main before this feature, and is explicitly **NOT fixed here**. It is a separate decision about a different metric. Noted for a follow-up. |

---

## Risk — the 0.5 threshold (resolved)

Under the old formula, 0.5 was the neutral baseline: a value prioritized as often as it was deprioritized scored exactly 0.5. After the denominator change, **0.5 is no longer neutral**. The neutral baseline for a given (model, value) pair depends on how often that model is neutral overall.

### Decision: Option A — model-relative buckets

- Compute `modelMean` = average of `winRate` across all values for a given model.
- "Top prioritized" = values with `winRate > modelMean + EPSILON`, sorted by `winRate - modelMean` descending, take top 3.
- "Top deprioritized" = values with `winRate < modelMean - EPSILON`, sorted by `modelMean - winRate` descending, take top 3.
- "Neutral" = values with `|winRate - modelMean| <= EPSILON`, sorted by absolute distance ascending, take top 3.

**Why:**
- Defensible without new statistical machinery.
- Bucket shape stays the same (top 3 / bottom 3 / neutral middle).
- Degrades gracefully when a model has weak or missing data.
- Meaning is "this value is prioritized more than this model usually does" — which is the question a reader of this UI is actually trying to answer.

**Known limitations to document in the UI (spec requirement):**
- A model that treats all values equally (all winRates within EPSILON of the mean) will show empty "top prioritized" and "top deprioritized" buckets, with 3 values in the neutral bucket. This is correct, not a bug.
- A model with very weak signals may still produce small differences that land in the top/bottom buckets. A reader should interpret "model-relative top prioritized" as a ranking, not an absolute claim.

**Implementation note for the bucket logic:** `winRate` is typed `number | null` in the current `PreferenceValueSummary` shape (`analysisSemantics.types.ts:19-21`). The model-mean computation **must filter out null winRates** before averaging, otherwise the mean is `NaN` and every comparison returns `false`. Values with `winRate: null` should be excluded from all three buckets.

---

## Verification plan

All stages run the feature-factory standard preflight. Plus:

### Slice 0 — analyze_basic.py split
- `PYTHONPATH="$(pwd)/workers:$PYTHONPATH" pytest cloud/workers/tests/test_analyze_basic.py` — every test still passes with zero behavior change.
- `wc -l` on `analyze_basic.py` and every new module < 400 lines.
- Ensure new modules are importable from the same public names the rest of the worker uses.

### Slice 1 — Python stats fix + metadata cleanup
- `PYTHONPATH="$(pwd)/workers:$PYTHONPATH" pytest cloud/workers/tests/` — all pass.
- New direct cases in `test_basic_stats.py`:
  - `compute_win_rate(3, 1, 0) == 0.75` — zero-neutral matches old behavior.
  - `compute_win_rate(1, 0, 9) == 0.1` — headline case: heavy neutral drags the honest rate down.
  - `compute_win_rate(0, 0, 100) == 0.0` — all-neutral is honest zero, not fake 0.5.
  - `compute_win_rate(0, 0, 0) == 0.5` — still no-data fallback.
  - `compute_win_rate(5, 5, 0) == 0.5` — symmetric, no neutrals, unchanged.
  - `compute_win_rate(5, 5, 10) == 0.25` — symmetric with neutrals.
- The `assert methods["winRateCI"]` line in `test_analyze_basic.py` is removed.
- `CODE_VERSION == "1.2.0"` is asserted in `test_analyze_basic.py`.

### Slice 2 — API aggregation fix + cache invalidation hook
- `npm run test --workspace @valuerank/api` — all pass.
- New aggregate.test.ts case: fixture with `(prioritized=2, deprioritized=1, neutral=7)` aggregated across 2 runs yields `winRate = 4/20 = 0.2` (not `4/6 = 0.667`).
- `totalBattles` → `totalResponses` rename is consistent.

### Slice 3 — Web aggregation fix + bucket redesign + copy
- `npm run test --workspace @valuerank/web` — all pass.
- New `analysisSemantics.test.ts` case: model with three values (`A: 0.2, B: 0.3, C: 0.4`), all below the old 0.5 threshold. Under new logic, topPrioritizedValues = `[C]`, topDeprioritizedValues = `[A]`, because `modelMean = 0.3` and C is above it, A is below. Under the old logic, all three would have been in the `deprioritized` bucket and `prioritized` would have been empty.
- Verify `ValuePrioritiesHelpPanel.tsx` renders the new formula string (snapshot or text-match).

### Slice 4 — Standalone script + docs
- `python cloud/scripts/analysis/compute_rankings.py --help` — runs without error.
- If the script has test coverage (grep first), update the tests. If not, skip test updates.
- `docs/features/analysis.md` says the new formula in all three places (line ~71 type comment, ~88 text, and anywhere else).
- `docs/features/analysis.md:72-77` no longer declares `confidenceInterval` on `ValueStats`.
- `docs/features/analysis.md:184-193` no longer declares `winRateCI` on `MethodsUsed`.
- `docs/features/analysis.md:317-321` "Per-value win rates and CIs" label changed to "Per-value win rates".
- `docs/canonical-glossary.md` has a `winRate` entry matching the new formula.

### Slice 5 — Mark-superseded migration
- New migration file created under `cloud/packages/db/prisma/migrations/<timestamp>_invalidate_stale_winrate_analyses/migration.sql`.
- Migration body is an UPDATE statement setting `status='SUPERSEDED'` where `status='CURRENT' AND analysisType IN ('basic', 'AGGREGATE')`.
- `npx prisma migrate dev --schema packages/db/prisma/schema.prisma` against the test database runs cleanly.
- Post-migration: `SELECT COUNT(*) FROM "AnalysisResult" WHERE status='CURRENT' AND analysisType IN ('basic', 'AGGREGATE')` returns 0 on the test DB (after you've seeded some rows for the test).
- The actual row counts on prod are logged during deploy for audit.

### Full preflight gate (before PR)
All 8 commands from `cloud/CLAUDE.md`:
1. `npm run lint --workspace @valuerank/shared`
2. `npm run lint --workspace @valuerank/db`
3. `npm run lint --workspace @valuerank/api`
4. `npm run test --workspace @valuerank/api`
5. `npm run build --workspace @valuerank/api`
6. `npm run lint --workspace @valuerank/web`
7. `npm run test --workspace @valuerank/web`
8. `npm run build --workspace @valuerank/web`

Plus Python: `PYTHONPATH="$(pwd)/workers:$PYTHONPATH" python -m pytest workers/tests/`

### Manual smoke (before merge)
- Load any analysis view for a run with known neutral values. Verify the displayed winRate matches a hand-computation using the new formula.
- Verify the analysis-v2 "top prioritized / top deprioritized / neutral" buckets render sensible values under the new model-relative logic. Specifically: find a run where no value has winRate > 0.5 and confirm the top-prioritized bucket is no longer empty.
- Verify `ValuePrioritiesHelpPanel` shows the new formula string.
- Verify `export_pairwise_outcomes` via MCP returns winRate values computed under the new formula. (Requires a run that's been re-analyzed after the deploy.)

---

## Stale data — resolved

### The problem (discovered during cold-read review)

The initial "lazy via `CODE_VERSION` bump" story was premised on the read path checking the version. It doesn't.

- `cloud/apps/api/src/graphql/queries/analysis.ts:21` — the `analysis(runId)` resolver — does:
  ```typescript
  const analysis = await db.analysisResult.findFirst({
    where: { runId, status: 'CURRENT' },
    orderBy: { createdAt: 'desc' },
  });
  ```
  No `codeVersion` filter. An existing row with the old-formula math stays CURRENT indefinitely.
- `cloud/apps/api/src/queue/handlers/analyze-basic.ts:73` — the cache-hit check inside the worker job — DOES check `CODE_VERSION`. But that code path only fires when a job is triggered. Passive GraphQL reads never trigger it.
- Aggregate rows have the same issue — they're also `analysisResult` rows served by status only.

Result: bumping code versions alone leaves every existing run serving old-formula winRates forever, plus the aggregate rows and the domain-analysis snapshots derived from them.

### The fix (user-approved)

A **one-shot Prisma migration** at deploy time, in its own slice, that runs:

```sql
UPDATE "AnalysisResult"
SET "status" = 'SUPERSEDED'
WHERE "status" = 'CURRENT'
  AND "analysisType" IN ('basic', 'AGGREGATE');
```

(The actual migration file matches the project's existing Prisma migration conventions — raw SQL inside `packages/db/prisma/migrations/<timestamp>_invalidate_stale_winrate_analyses/migration.sql`. Codex writes the file in slice 5.)

After the migration runs, the `analysis(runId)` resolver returns null for every previously-analyzed run. The UI's "no analysis yet, compute" state takes over, and users (or automated triggers) run fresh analyses under the new formula. Pre-existing `SUPERSEDED` rows stay `SUPERSEDED` — the WHERE clause only touches `CURRENT` rows.

**The domain-analysis snapshot cache** is handled separately by bumping `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` from `"1.0.0"` to `"1.1.0"` in `cloud/apps/api/src/services/analysis/domain-analysis-cache-types.ts:19`. The snapshot-builder at `domain-analysis-snapshot-builder.ts:365` already reads that constant when writing new snapshots, and the read path is version-aware (snapshots carry their code version and are treated as stale if lower than current). That makes the snapshot cache lazy-backfill-compatible out of the box — unlike the `AnalysisResult` table.

### What stays stale (intentionally)

- `AnalysisResult` rows with `status IN ('SUPERSEDED', 'FAILED', 'STALE')` — the migration does NOT touch these. They're already invisible to the UI.
- The `cloud/apps/web/src/utils/canonicalConditionSummary.ts:129` `isOpponent = selectedValueWinRate < 0.5` check is a **pre-existing** bug (the threshold is semantically wrong when winRate is computed on a neutral-inclusive denominator) and is NOT fixed here. It's a separate metric and a separate decision. Noted for a follow-up.

---

## Rollback plan

Rollback is a two-step sequence because the migration is persisted state.

### Step 1 — Revert the merge commit

Revert the squash commit on `main`. All Python / API / web / docs / version-bump changes are in one commit.

### Step 2 — Decide what to do with post-merge writes

Every run that was re-analyzed post-merge (before revert) has a new `analysisResult` row with:
- `codeVersion: "1.2.0"` (basic) or `"1.3.0"` (aggregate)
- `status: 'CURRENT'`
- The new-formula winRate math in the output blob

After revert, the reverted code's `CODE_VERSION` is back to `"1.1.1"` / `"1.2.0"`. Two options:

**Option R1 (simple — reverted code reads new-math rows unchanged).** The reverted code does NOT check `codeVersion` on read, so it serves whatever `CURRENT` row exists — new-math rows included. Users see new-math values from the reverted code. Semantically mixed.

**Option R2 (thorough — re-run the migration in reverse).** Write a rollback migration that does:
```sql
UPDATE "AnalysisResult"
SET "status" = 'SUPERSEDED'
WHERE "status" = 'CURRENT'
  AND "codeVersion" IN ('1.2.0', '1.3.0')
  AND "analysisType" IN ('basic', 'AGGREGATE');
```
This forces every post-merge row out of CURRENT. Users then trigger a re-run under the reverted code, which writes a fresh `1.1.1` / `1.2.0` row with the old math.

**Recommendation: Option R2** if the rollback happens more than a few hours after the merge. If it's an immediate hotfix-style rollback (before any user-triggered re-runs happen), Option R1 is fine.

### Step 3 — Domain snapshot cache rollback

The `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` bump from `"1.0.0"` to `"1.1.0"` reverts naturally with the code revert. Old snapshots (tagged `"1.0.0"`) are still readable; new snapshots (tagged `"1.1.0"`) become "newer than current code" and are filtered by the snapshot reader's version-aware logic. No migration needed for this cache.

---

## Out of scope (intentional)

- Reintroducing Wilson confidence intervals or any CI widget. That backend is gone.
- Adding a "neutralityRate" secondary metric alongside winRate (interesting idea, separate feature).
- Extracting the API and web aggregation logic into a shared package (see Follow-ups).
- Rewriting the analysis pipeline to treat neutrals as first-class instead of a drop-through.
- Reopening the debate on whether winRate is the right top-line metric.
- Any changes to `.gitignore`, CI config, or test infrastructure.

---

## Follow-ups (after this ships)

1. **Consider a `neutralityRate` metric** — `neutral / (prioritized + deprioritized + neutral)`. Trivially derivable after this feature and a clean companion to winRate.
2. **Consolidate web + API aggregation** — right now two different files compute essentially the same aggregation math in TypeScript. A dedicated shared package would halve the surface area of future changes like this one. Explicitly scoped out here because it doubles the diff.
3. **Lint rule** — fail CI on any new `prioritized / (prioritized + deprioritized)` pattern in TS or Python. Prevents regression. Low priority.
4. **Split `analyze_basic.py` further** — slice 0 of this feature gets it under 400. A later feature could split the per-model aggregation from the summary emission for cleaner separation of concerns.

---

## Slice plan (authoritative — the plan stage will refine)

| Slice | Scope | Commit prefix |
|---|---|---|
| **0** | Split `analyze_basic.py` into smaller modules. Pure refactor, no logic changes. Target: every resulting module < 400 lines. | `winrate-honest-denominator: A — split analyze_basic.py under the file-size limit` |
| **1** | Python stats fix: `compute_win_rate` signature + math. `compute_value_stats` passes `neutral` through. Drop unused `confidence` param. Drop dead `"winRateCI": "wilson_score"` metadata key. Bump Python-side `CODE_VERSION` → `"1.2.0"`. Update worker tests. Create `test_basic_stats.py`. | `winrate-honest-denominator: B — honest denominator in the Python worker` |
| **2** | API aggregation fix: `aggregate-logic.ts` include neutrals in denominator, rename `totalBattles` → `totalResponses`. `value-detail-types.ts` — both `mapCondition` and `mapVignette` include neutrals in `comparisonDenominator`. Bump `analyze-basic.ts:34` TS-side `CODE_VERSION` → `'1.2.0'`. Bump `aggregate/constants.ts:1` `AGGREGATE_ANALYSIS_CODE_VERSION` → `'1.3.0'`. Bump `domain-analysis-cache-types.ts:19` `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` → `"1.1.0"`. MCP export tool description string update. Update tests: `aggregate.test.ts`, `domain-analysis.test.ts`, `analyze-basic.integration.test.ts` (codeVersion assertion), `export-pairwise-outcomes.test.ts` (hand-computed fixture at 72-77, 162-163). | `winrate-honest-denominator: C — honest denominator in the API aggregation` |
| **3** | Web fix: `analysisSemantics.preference.ts` merged winRate math + Option A bucket redesign, `DomainAnalysis.tsx` winRate math, `ValuePrioritiesHelpPanel.tsx` full copy rewrite (not just the formula string — also the "conditional win rate" / "once the model picks a side" framing). Update web tests. | `winrate-honest-denominator: D — honest denominator in web aggregation and buckets` |
| **4** | Standalone `compute_rankings.py` script fix. Update docs: `docs/features/analysis.md` (four sites: formula, `ValueStats.confidenceInterval` field removal, `MethodsUsed.winRateCI` field removal, "Per-value win rates and CIs" label), `docs/canonical-glossary.md` (new winRate entry). | `winrate-honest-denominator: E — honest denominator in standalone script and docs` |
| **5** | **Prisma migration: mark existing basic + aggregate `AnalysisResult` rows as `SUPERSEDED`.** One-shot SQL migration file. No code changes. Required because the `analysis(runId)` read path does not check `codeVersion` — without this migration, every existing run keeps serving old-formula values forever. | `winrate-honest-denominator: F — invalidate stale analysisResult rows via migration` |

All 6 slices land in one PR. Slice 0 must go first because it unblocks slice 1. Slices 1-4 can land in any order relative to each other, but slice 2 and slice 3 must ship in the same PR (API and web math must stay in lockstep). Slice 5 is ordered last so the migration file timestamp is later than any code change in the same deploy — this is a cosmetic preference since all migrations run together on deploy anyway.

---

## Open questions remaining for the plan stage

None. All blocking questions were answered before this rewrite. The plan stage is expected to decide:

- The exact boundary of the `analyze_basic.py` split in slice 0. Recommendation: extract `methodsUsed` / `CODE_VERSION` / `SUMMARY_CONTRACT_VERSION` into `analyze_basic_metadata.py`, extract aggregation helpers into `analyze_basic_aggregation.py`. Plan stage verifies this gets the main file under 400.
- Whether the cache-key update in slice 2 includes `CODE_VERSION` (automatic future invalidation) or uses a one-shot startup hook (explicit this time only). Recommendation: include `CODE_VERSION` in the key.
- Whether slice 1's `compute_value_stats` `confidence` parameter drop is safe — confirm no caller is passing it with a non-default value. Grep is cheap.

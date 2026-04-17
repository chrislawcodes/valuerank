# Plan — byvalue-two-step-winrate

Slug: `byvalue-two-step-winrate`
Workflow: Feature Factory
Spec: `spec.md`

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: HIGH (weighting inconsistency): same finding as prior round; explicitly in spec Known Simplifications, out of scope for this feature. MEDIUM (migration risk): rollback plan is in spec; Option R2 covers reverse migration; accepted. LOW (zero-denominator): spec already addresses with per-vignette total==0 guard. LOW (0.5 fallback): preserves existing pooled fallback behavior; changing to null is a separate behavioral decision, deferred.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: HIGH (migration SQL): confirmed — fixed in plan to use 'analysis_results' and 'analysis_type' (matches existing winrate-honest-denominator migration). MEDIUM (normalize skip): confirmed — plan clarified that value outcomes block must be inserted BEFORE the 'if normalized_score is None: continue' line. MEDIUM (test_methods_documented): confirmed — plan now calls out updating this assertion in Slice B. MEDIUM (existing paired-merge test): confirmed — plan now explicitly calls out updating the ~line 544 test in Slice C.
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: HIGH (overallSignedCenter inconsistency): same finding as spec review; explicitly in Known Simplifications, out of scope for this feature — deferred. MEDIUM (test_methods_documented): confirmed — addressed in plan Slice B test updates. MEDIUM (aggregate-logic.ts and export-pairwise-outcomes.ts): explicitly out of scope per spec 'What does NOT change' section.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: HIGH ('unknown' key grouping): pre-existing behavior not introduced by this change — the existing loop already uses 'unknown' as default for missing IDs. This plan does not change that behavior. MEDIUM (overallSignedCenter inconsistency): same finding as spec and architecture reviews; explicitly in Known Simplifications, deferred. LOW (0.5 fallback test): plan already adds a count-assertion for merged results; a separate 0.5 fallback test is nice-to-have — Codex can add it, not a blocker.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: MEDIUM (summary null): pre-existing .get('summary', {}) pattern is consistent with all other callers in the codebase; summary is never None in practice. MEDIUM (analysis_type casing): confirmed correct — existing migration 20260415054649 uses identical ('basic', 'AGGREGATE') values. MEDIUM (frontend count consumers): explicitly addressed in spec — count is optional in RawPreferenceValueStats type; spec confirms no downstream caller uses count after the merge.

## 0. Reading order

Read `spec.md` first. This plan adds concrete line numbers and implementation decisions. Where the plan references a spec section, it names it explicitly.

---

## 1. Slice map

Three slices, one PR.

| # | Slice | Files touched | Order |
|---|---|---|---|
| **A** | Two-step `byValue` winRate in Python worker | `analyze_basic_aggregation.py`, `tests/test_analyze_basic.py` | First — backend is the source of truth |
| **B** | Version bumps + Prisma migration | `analyze_basic_metadata.py`, `analyze-basic.ts`, `aggregate/constants.ts`, `domain-analysis-cache-types.ts`, integration test, migration file | After A — bumps reference the new code behavior |
| **C** | Equal-weight merge in frontend | `analysisSemantics.preference.ts`, `analysisSemantics.test.ts` | Parallel with A/B — disjoint files |

Slices A and C touch disjoint files and can run in parallel. Slice B runs last (migration timestamp ordering).

---

## 2. Slice A — Two-step `byValue` winRate in Python worker

**Goal.** Replace the pooled `byValue` in `build_preference_summary` with a per-vignette-averaged win rate. The function already groups scores by `(model_id, scenario_id)` for `overall_signed_center` — extend that loop to also track per-value outcomes.

**Spec reference.** § Affected surfaces — Python worker.

### 2.1 `cloud/workers/analyze_basic_aggregation.py`

**Current code** (lines 199–213, approximately):

```python
scores_by_model_scenario: dict[str, dict[str, list[float]]] = {}

for transcript in transcripts:
    model_id = transcript.get("modelId", "unknown")
    scenario_id = transcript.get("scenarioId", "unknown")
    normalized_score = resolve_transcript_signed_distance(transcript)
    if normalized_score is None:
        continue
    ...
```

**What to add in the same transcript loop** — a parallel grouping for value outcomes:

```python
# Add alongside scores_by_model_scenario:
outcomes_by_model_scenario_value: dict[str, dict[str, dict[str, list[str]]]] = {}
# [model_id][scenario_id][value_id] → list of "prioritized"|"deprioritized"|"neutral"

# Inside the transcript loop — IMPORTANT: insert BEFORE `if normalized_score is None: continue`.
# Value outcomes are independent of whether a canonical signed score exists.
# Every transcript contributes value outcomes even if it lacks a decisionModelV2 score.
values_data = transcript.get("summary", {}).get("values", {})
for value_id, status in values_data.items():
    if model_id not in outcomes_by_model_scenario_value:
        outcomes_by_model_scenario_value[model_id] = {}
    if scenario_id not in outcomes_by_model_scenario_value[model_id]:
        outcomes_by_model_scenario_value[model_id][scenario_id] = {}
    if value_id not in outcomes_by_model_scenario_value[model_id][scenario_id]:
        outcomes_by_model_scenario_value[model_id][scenario_id][value_id] = []
    outcomes_by_model_scenario_value[model_id][scenario_id][value_id].append(status)
```

**New helper to compute two-step win rates** (add as a module-level function):

```python
def _compute_two_step_by_value(
    outcomes_by_scenario_value: dict[str, dict[str, list[str]]],
    pooled_values: dict[str, Any],
) -> dict[str, Any]:
    """
    Compute per-vignette-averaged winRate for each value.

    For each value:
      1. For each unique vignette containing that value, compute
         vignette_rate = prioritized / (prioritized + deprioritized + neutral).
         Skip vignettes where total == 0 for this value.
      2. winRate = mean(vignette_rates).
         If no vignettes contribute (empty list), fall back to 0.5.

    Returns a dict in the same shape as model_stats["values"] but with
    winRate replaced by the two-step average. The count fields are
    preserved from pooled_values (raw response counts for reference).
    """
    # Collect all value IDs seen across all vignettes
    all_value_ids: set[str] = set()
    for vignette_values in outcomes_by_scenario_value.values():
        all_value_ids.update(vignette_values.keys())

    result: dict[str, Any] = {}
    for value_id in all_value_ids:
        vignette_rates: list[float] = []
        for vignette_outcomes in outcomes_by_scenario_value.values():
            statuses = vignette_outcomes.get(value_id, [])
            if not statuses:
                continue
            p = sum(1 for s in statuses if s == "prioritized")
            total = len(statuses)
            if total == 0:
                continue  # guard, should not occur
            vignette_rates.append(p / total)

        two_step_win_rate = (
            sum(vignette_rates) / len(vignette_rates)
            if vignette_rates
            else 0.5
        )

        # Preserve raw count fields from pooled stats if available
        pooled_entry = pooled_values.get(value_id, {})
        entry: dict[str, Any] = {
            "winRate": round(two_step_win_rate, 6),
        }
        if "count" in pooled_entry:
            entry["count"] = pooled_entry["count"]

        result[value_id] = entry

    # Include any values in pooled_values not seen in vignette outcomes
    # (edge case: transcript has no summary.values data)
    for value_id, pooled_entry in pooled_values.items():
        if value_id not in result:
            entry = dict(pooled_entry)
            entry["winRate"] = 0.5
            result[value_id] = entry

    return result
```

**Replace the `byValue` line** in `per_model_summary`:

```python
# Old:
"byValue": model_stats.get("values", {}),

# New:
"byValue": _compute_two_step_by_value(
    outcomes_by_model_scenario_value.get(model_id, {}),
    model_stats.get("values", {}),
),
```

**Type annotation note.** `outcomes_by_model_scenario_value` is declared before the transcript loop. The loop appends to it before the `per_model` loop runs, so the grouping is fully populated when `_compute_two_step_by_value` is called.

### 2.2 `cloud/workers/tests/test_analyze_basic.py`

- Grep for any hand-computed `winRate` assertion that would change under the two-step formula. Most existing tests use single-batch vignettes, so `vignette_rate == pooled_rate` and the expected values stay the same.
- **Add one new targeted test**: a run with 2 scenarios, each with a single value pair. Scenario A has the target value prioritized in 9 of 10 transcripts (one vignette × 10 responses). Scenario B has the target value prioritized in 0 of 1 transcript. Expected `byValue[target].winRate = (9/10 + 0/1) / 2 = 0.45`. The old pooled result would be `9/11 ≈ 0.818`.

**Expected build state after slice A.** Python tests pass. No TypeScript changes — API and web build states unchanged.

---

## 3. Slice B — Version bumps and Prisma migration

**Goal.** Bump all four version constants so existing cached analyses are invalidated by the cache-hit check on next job dispatch, and run a one-shot migration to mark existing `CURRENT` rows `SUPERSEDED` (since the read path does not check `codeVersion`).

**Spec reference.** § Affected surfaces — API TypeScript, § Prisma migration.

### 3.1 Version constant bumps

| File | Change |
|---|---|
| `cloud/workers/analyze_basic_metadata.py:7` | `CODE_VERSION = "1.2.0"` → `"1.3.0"` |
| `cloud/apps/api/src/queue/handlers/analyze-basic.ts:34` | `const CODE_VERSION = '1.2.0'` → `'1.3.0'` |
| `cloud/apps/api/src/services/analysis/aggregate/constants.ts:1` | `AGGREGATE_ANALYSIS_CODE_VERSION = '1.3.0'` → `'1.4.0'` |
| `cloud/apps/api/src/services/analysis/domain-analysis-cache-types.ts:19` | `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION = '1.2.0'` → `'1.3.0'` |

### 3.2 Test updates

| File | Change |
|---|---|
| `cloud/apps/api/tests/queue/handlers/analyze-basic.integration.test.ts` | Grep for `'1.1.1'` or `'1.2.0'` in `codeVersion` assertions; update to `'1.3.0'`. |
| `cloud/apps/api/tests/services/analysis/aggregate.test.ts` | Grep for `AGGREGATE_ANALYSIS_CODE_VERSION` or `'1.3.0'` version assertions; update to `'1.4.0'`. |
| `cloud/workers/tests/test_analyze_basic.py` | `test_methods_documented` asserts `methods["codeVersion"] == "1.2.0"`. Update to `"1.3.0"`. |

### 3.3 Prisma migration

Create a new migration file. Use `npx prisma migrate dev` to generate the timestamp, or create the file manually following the project's migration naming conventions.

Migration SQL:

```sql
-- Invalidate all CURRENT basic and aggregate analyses.
-- Required because the analysis read path (queries/analysis.ts:21) queries
-- by status='CURRENT' only and does not filter by codeVersion.
-- After this migration, existing runs show "no analysis yet" state and
-- re-analyze on demand under the new two-step winRate formula.
UPDATE "analysis_results"
SET "status" = 'SUPERSEDED'
WHERE "status" = 'CURRENT'
  AND "analysis_type" IN ('basic', 'AGGREGATE');
```

File path: `cloud/packages/db/prisma/migrations/<timestamp>_supersede_pooled_byvalue_analyses/migration.sql`

**Expected build state after slice B.** API tests pass. Migration file present and syntactically valid.

---

## 4. Slice C — Equal-weight merge in frontend

**Goal.** Remove the `allHaveCounts` pooled-sum path in `buildMergedPreferenceModel` and change the `averageWeighted` fallback to use equal weight (`1`) per analysis instead of `sampleSize`.

**Spec reference.** § Affected surfaces — Web TypeScript.

### 4.1 `cloud/apps/web/src/components/analysis-v2/analysisSemantics.preference.ts`

**Lines 207–222 — remove the `allHaveCounts` early-return:**

```typescript
// DELETE this entire block:
const allHaveCounts = stats.every((entry) => entry.count !== undefined);
if (allHaveCounts) {
  const prioritized = stats.reduce((sum, entry) => sum + (entry.count?.prioritized ?? 0), 0);
  const deprioritized = stats.reduce((sum, entry) => sum + (entry.count?.deprioritized ?? 0), 0);
  const neutral = stats.reduce((sum, entry) => sum + (entry.count?.neutral ?? 0), 0);
  const totalResponses = prioritized + deprioritized + neutral;
  mergedByValue[valueId] = {
    winRate: totalResponses > 0 ? prioritized / totalResponses : 0.5,
    count: {
      prioritized,
      deprioritized,
      neutral,
    },
  };
  return;
}
```

**Line 233 — change weight from `sampleSize` to `1`:**

```typescript
// Old:
weight: analysis.perModel[modelId]?.sampleSize ?? 0,

// New:
weight: 1,
```

The merged result will carry only `winRate` (no `count`). This is intentional — `count` is per-analysis data and is not meaningful to aggregate across run orders. `count` remains optional in `RawPreferenceValueStats`, so no type changes are needed.

### 4.2 `cloud/apps/web/tests/components/analysis-v2/analysisSemantics.test.ts`

- **Update the existing `buildPairedAnalysisSemanticsView` test (~line 544)** that currently asserts sampleSize-weighted merged values (e.g. `Achievement: 1/3`, `Care: 0.6`). After switching to equal-weight, `Achievement` will change. Recompute the expected values using equal-weight arithmetic and update the assertions.
- **Update any other existing test that expected pooled counts to drive the `byValue` result.** The `allHaveCounts` path is being removed so count-driven expectations will fail.
- **Add asymmetric test**: two analyses, same value, different `sampleSize`. Run A: `winRate=0.8`, `sampleSize=120`. Run B: `winRate=0.4`, `sampleSize=60`. Old sampleSize-weighted result: `(0.8×120 + 0.4×60) / 180 = 0.667`. New equal-weight result: `(0.8 + 0.4) / 2 = 0.6`. Assert `0.6`.
- **Keep existing symmetric test** passing: if both analyses have `winRate=0.6`, merged result stays `0.6`.
- **Assert `count` is absent** from the merged `byValue` entry — the merged result must not carry `count` after the `allHaveCounts` block is removed.

**Expected build state after slice C.** Web tests pass. No Python or API changes.

---

## 5. Cross-slice notes

- Slices A and C touch disjoint files — they can run in parallel via separate Codex dispatches.
- Slice B version bumps should reference the code behavior from slice A. Run B after A so the version bump is coherent with what the new code does.
- All three slices land in one PR and one squash commit.
- Do not split the PR — API and web math must stay in lockstep.

---

## 6. Verification summary (per spec)

### After slice A
```bash
PYTHONPATH="$(pwd)/workers:$PYTHONPATH" pytest cloud/workers/tests/test_analyze_basic.py -v
```
Key assertion: two-vignette test yields `winRate = 0.45`, not `0.818`.

### After slice B
```bash
npm run test --workspace @valuerank/api
npx prisma migrate dev --schema packages/db/prisma/schema.prisma  # test DB
```
`codeVersion` integration test asserts `'1.3.0'`.

### After slice C
```bash
npm run test --workspace @valuerank/web
```
Asymmetric merge test asserts `0.6`.

### Full preflight (before PR)
All 8 commands from `cloud/CLAUDE.md` plus Python pytest.

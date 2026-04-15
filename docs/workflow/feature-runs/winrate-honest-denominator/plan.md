# Plan — winrate-honest-denominator

Slug: `winrate-honest-denominator`
Workflow: Feature Factory
Spec: `spec.md`

## 0. Reading order

This plan assumes the reviewer has read `spec.md` in full — especially the "Affected surfaces" table, the "User decisions already made" table, and the "Slice plan" at the bottom. Every slice below maps to a row of that slice plan. Where the plan adds procedural detail beyond the spec, it cites the spec subsection in parentheses.

## 1. Slice map

Six slices. All land in one PR. Slice 0 must go first (it unblocks the file-size check). Slices 1–5 have soft ordering preferences but can be reordered inside the PR.

| # | Slice | Files touched | Why this order |
|---|---|---|---|
| **0** | **Split `analyze_basic.py` under the file-size limit** | `cloud/workers/analyze_basic.py` (shrunk), new `cloud/workers/analyze_basic_metadata.py`, new `cloud/workers/analyze_basic_aggregation.py`, `cloud/workers/tests/test_analyze_basic.py` (unchanged — must still pass byte-for-byte) | Pure refactor, no behavior change. Must land first because `analyze_basic.py` is 704 lines on main and the CI file-size check blocks any other PR commits that touch it. |
| **1** | **Honest denominator in the Python worker** | `cloud/workers/stats/basic_stats.py`, `cloud/workers/stats/tests/test_basic_stats.py` (new), `cloud/workers/tests/test_analyze_basic.py`, `cloud/workers/analyze_basic_metadata.py` (from slice 0) | Core math change. Must land before slice 2 because the API TS tests re-run the worker indirectly via fixtures and would see the new math. |
| **2** | **Honest denominator in the API aggregation + version bumps** | `cloud/apps/api/src/services/analysis/aggregate/aggregate-logic.ts`, `cloud/apps/api/src/graphql/queries/domain/analysis/value-detail-types.ts`, `cloud/apps/api/src/queue/handlers/analyze-basic.ts` (TS-side CODE_VERSION bump), `cloud/apps/api/src/services/analysis/aggregate/constants.ts` (AGGREGATE version bump), `cloud/apps/api/src/mcp/tools/export-pairwise-outcomes.ts` (tool description only), `cloud/apps/api/tests/services/analysis/aggregate.test.ts` (lines 640 + 766 bump to `'1.3.0'`), `cloud/apps/api/tests/graphql/queries/domain-analysis.test.ts`, `cloud/apps/api/tests/mcp/tools/export-pairwise-outcomes.test.ts`, `cloud/apps/api/tests/queue/handlers/analyze-basic.integration.test.ts` (codeVersion assertion at line 284) | Must ship in the same PR as slice 3 so API + web math stay in lockstep. Can ship before or after slice 3 inside the PR. |
| **3** | **Honest denominator in web aggregation + model-relative buckets + copy** | `cloud/apps/web/src/components/analysis-v2/analysisSemantics.preference.ts`, `cloud/apps/web/src/pages/DomainAnalysis.tsx`, `cloud/apps/web/src/components/domains/ValuePrioritiesHelpPanel.tsx` (full help-panel rewrite, not just formula string), `cloud/apps/web/tests/components/analysis-v2/analysisSemantics.test.ts`, `cloud/apps/web/tests/pages/DomainAnalysisValueDetail.test.tsx` (fixture hand-compute update) | Same PR as slice 2. Also brings in the bucket-logic redesign (Option A from spec). |
| **4** | **Honest denominator in standalone script + docs** | `cloud/scripts/analysis/compute_rankings.py`, `docs/features/analysis.md` (six sites — formula type comment + `ValueStats.confidenceInterval` removal + "Win Rate Calculation" narrative + `MethodsUsed.winRateCI` removal + "Per-value win rates and CIs" label + repo-wide grep), `docs/canonical-glossary.md` (add new entry) | Should be late — docs reference the other slices' changes. Has no build dependency on 0-3. |
| **5** | **Prisma migration: mark-all-superseded for stale AnalysisResult rows** | New `cloud/packages/db/prisma/migrations/<timestamp>_invalidate_stale_winrate_analyses/migration.sql`. No code changes. | Required because `queries/analysis.ts:21` does not version-check on read. Without this, every existing run serves old-formula winRates forever after the deploy. Ordered last so the migration timestamp is the highest in the deploy batch. |

**Cross-slice rule.** Slices 2 and 3 MUST ship in the same PR — if one lands without the other, the API returns new-formula winRate values while the web-side bucket logic still assumes the old formula, which silently corrupts the "top prioritized / top deprioritized" labels. Since all slices of a feature-factory run ship together in one squash commit, this rule is trivially satisfied as long as the PR doesn't get split mid-run.

**Slice 5 rule.** The migration must run BEFORE new code serves traffic on prod. Railway deploys run Prisma migrations on startup before the server accepts requests, so the natural deploy flow handles this. Do NOT add an explicit gate — rely on Prisma migrate deploy running automatically.

**Intermediate build state.** Every slice should leave the repo lint-clean and build-clean in isolation. Tests may temporarily fail mid-slice if a test fixture change is pending, but lint and build must always pass. See each slice's "Expected build state" note below.

---

## 2. Slice 0 — Split `analyze_basic.py` under the file-size limit

**Goal.** Get `analyze_basic.py` under 400 lines without changing any behavior. This unblocks all downstream slices that need to edit the file.

**Spec reference.** `spec.md` § Affected surfaces — Python worker, row 1. § Slice plan row 0.

**Constraint — analyze_basic.py is a script, not a module.** Call sites:

- `cloud/apps/api/src/services/analysis/aggregate/constants.ts:7` — `export const ANALYZE_WORKER_PATH = 'workers/analyze_basic.py';`
- `cloud/apps/api/src/queue/handlers/analyze-basic.ts:31` — `const ANALYZE_WORKER_PATH = 'workers/analyze_basic.py';`
- `cloud/workers/tests/test_analyze_basic.py:19` — `[sys.executable, "analyze_basic.py"]`

These all invoke `analyze_basic.py` as a subprocess entry point. The split must preserve that — `analyze_basic.py` stays as the top-level script file that handles argparse / stdin / stdout / main orchestration. Helper modules live alongside it and are imported.

### 2.1 New file: `cloud/workers/analyze_basic_metadata.py`

Extract these three constants and the `methodsUsed` dict from `analyze_basic.py`:

```python
"""Metadata constants and methods-used block emitted by analyze_basic.py."""

CODE_VERSION = "1.1.1"  # stays at 1.1.1 in slice 0. Slice 1 bumps to "1.2.0".
SUMMARY_CONTRACT_VERSION = "vignette-semantics-v1"


def build_methods_used() -> dict:
    """Return the methodsUsed metadata block for an analysis output."""
    return {
        "winRateCI": "wilson_score",  # stays in slice 0. Slice 1 removes this dead key.
        "modelComparison": "spearman_rho",
        "pValueCorrection": "holm_bonferroni",
        "effectSize": "cohens_d",
        "dimensionTest": "kruskal_wallis",
        "varianceMetrics": "sample_variance",
        "alpha": 0.05,
        "codeVersion": CODE_VERSION,
        "summaryContractVersion": SUMMARY_CONTRACT_VERSION,
    }
```

In `analyze_basic.py`, replace the inline `CODE_VERSION` / `SUMMARY_CONTRACT_VERSION` assignments (lines 66, 68) and the inline `"methodsUsed": { ... }` dict (around line 624) with imports and a call:

```python
from analyze_basic_metadata import CODE_VERSION, SUMMARY_CONTRACT_VERSION, build_methods_used

# ... later, where the analysis output is built:
"methodsUsed": build_methods_used(),
```

Verify the test at `cloud/workers/tests/test_analyze_basic.py:224` still passes — it asserts `methods["summaryContractVersion"] == "vignette-semantics-v1"` and implicitly asserts the full shape of `methodsUsed`. The byte-for-byte output constraint means `build_methods_used()` must return the same dict (same keys, same values, same insertion order since Python 3.7 dicts preserve order).

### 2.2 New file: `cloud/workers/analyze_basic_aggregation.py` (OR `analyze_basic_core.py` — pick whichever reads cleaner)

Extract helper functions from `analyze_basic.py` that don't touch stdin/stdout/argparse. The exact boundary is a judgment call — the goal is "`analyze_basic.py` < 400 lines". Concretely:

- Move the per-model aggregation loops, the signed-distance normalization helpers, the p-value correction helpers, and any other pure functions that take structured inputs and return structured outputs.
- Leave in `analyze_basic.py`: `main()`, argparse, stdin read, stdout write, top-level exception handling, and the orchestration that calls the extracted helpers.

The Codex slice spec (tasks.md) will list the exact functions to extract after a pass through the file.

### 2.3 Verification commands

```bash
cd cloud
wc -l workers/analyze_basic.py workers/analyze_basic_metadata.py workers/analyze_basic_aggregation.py
# Each line MUST report < 400.

PYTHONPATH="$(pwd)/workers:$PYTHONPATH" python -m pytest workers/tests/test_analyze_basic.py -v
# ALL tests pass with zero changes to test code.
```

**Expected build state after slice 0:** lint + tests + build all clean. No behavior change. `wc -l analyze_basic.py < 400`.

---

## 3. Slice 1 — Honest denominator in the Python worker

**Goal.** Change `compute_win_rate` to include neutrals in the denominator. Drop the unused `confidence` parameter. Drop the dead `"winRateCI": "wilson_score"` metadata key. Bump `CODE_VERSION` to `"1.2.0"`. Update existing tests + add new direct unit tests.

**Spec reference.** `spec.md` § Affected surfaces — Python worker, row 2. § Slice plan row 1.

### 3.1 `cloud/workers/stats/basic_stats.py`

1. **Lines 47-65 (`compute_win_rate`).** New signature and body:

   ```python
   def compute_win_rate(prioritized: int, deprioritized: int, neutral: int = 0) -> float:
       """
       Compute win rate from prioritized/deprioritized/neutral counts.

       Win rate = prioritized / (prioritized + deprioritized + neutral)

       All decided responses (including neutral) are counted in the denominator.

       Args:
           prioritized: Count of times the value was prioritized
           deprioritized: Count of times the value was deprioritized
           neutral: Count of neutral responses (default 0 for caller backwards compat)

       Returns:
           Win rate as a float between 0 and 1, or 0.5 if no data at all
       """
       total = prioritized + deprioritized + neutral
       if total == 0:
           return 0.5  # No data means neutral
       return prioritized / total
   ```

   Note the `neutral: int = 0` default keeps any hypothetical outside caller working without updating them. The one actual caller (`compute_value_stats`) is updated below.

2. **Lines 68-95 (`compute_value_stats`).** Two changes:
   - Drop the `confidence: float = 0.95` parameter. Verified during spec review: no caller passes this argument, and the parameter is unused inside the function body.
   - Pass `neutral` through to `compute_win_rate`: change line 86 from `win_rate = compute_win_rate(prioritized, deprioritized)` to `win_rate = compute_win_rate(prioritized, deprioritized, neutral)`.

   After the edit:

   ```python
   def compute_value_stats(
       prioritized: int,
       deprioritized: int,
       neutral: int = 0,
   ) -> ValueStats:
       """
       Compute complete statistics for a single value.

       Args:
           prioritized: Count of times value was prioritized
           deprioritized: Count of times value was deprioritized
           neutral: Count of neutral responses

       Returns:
           ValueStats with win rate and counts
       """
       win_rate = compute_win_rate(prioritized, deprioritized, neutral)

       return ValueStats(
           winRate=round(win_rate, 6),
           count=ValueCounts(
               prioritized=prioritized,
               deprioritized=deprioritized,
               neutral=neutral,
           ),
       )
   ```

### 3.2 `cloud/workers/analyze_basic_metadata.py` (from slice 0)

1. Bump `CODE_VERSION = "1.1.1"` → `CODE_VERSION = "1.2.0"`.
2. Remove the `"winRateCI": "wilson_score"` key from `build_methods_used()`.

The new `methodsUsed` dict (for reference):

```python
return {
    "modelComparison": "spearman_rho",
    "pValueCorrection": "holm_bonferroni",
    "effectSize": "cohens_d",
    "dimensionTest": "kruskal_wallis",
    "varianceMetrics": "sample_variance",
    "alpha": 0.05,
    "codeVersion": CODE_VERSION,
    "summaryContractVersion": SUMMARY_CONTRACT_VERSION,
}
```

### 3.3 `cloud/workers/tests/test_analyze_basic.py`

1. Delete line 218: `assert methods["winRateCI"] == "wilson_score"` — the key no longer exists.
2. Update line 224 or equivalent: if there's a `codeVersion` assertion, bump it to `"1.2.0"`.
3. Inspect the test around lines 978-982 (the `# 3 prioritized, 1 deprioritized = 75% win rate` case). That fixture has zero neutrals, so the expected value `0.75` stays correct under the new formula. No change to the expected value — but the test's comment may become misleading; update the comment to explicitly mention neutrals are also zero.
4. Search for any other hand-computed `winRate` / `winRate ==` assertion in the file. If a test has a fixture with non-zero `neutral` counts and a hand-computed expected `winRate`, update it.

### 3.4 `cloud/workers/stats/tests/test_basic_stats.py` (new file)

Create the directory `cloud/workers/stats/tests/` if it doesn't exist. Create a new test file with the following structure:

```python
"""Unit tests for basic_stats.compute_win_rate and compute_value_stats."""

import pytest

from stats.basic_stats import compute_value_stats, compute_win_rate


class TestComputeWinRate:
    def test_zero_neutral_matches_old_behavior(self):
        """3 prioritized, 1 deprioritized, 0 neutral = 0.75."""
        assert compute_win_rate(3, 1, 0) == pytest.approx(0.75)

    def test_heavy_neutral_drags_rate_down(self):
        """1 prioritized, 0 deprioritized, 9 neutral = 0.1 (headline case)."""
        assert compute_win_rate(1, 0, 9) == pytest.approx(0.1)

    def test_all_neutral_is_zero(self):
        """0 prioritized, 0 deprioritized, 100 neutral = 0.0 (we DO have data)."""
        assert compute_win_rate(0, 0, 100) == pytest.approx(0.0)

    def test_no_data_fallback(self):
        """0 prioritized, 0 deprioritized, 0 neutral = 0.5 (no data fallback)."""
        assert compute_win_rate(0, 0, 0) == pytest.approx(0.5)

    def test_symmetric_no_neutrals(self):
        """5 prioritized, 5 deprioritized, 0 neutral = 0.5."""
        assert compute_win_rate(5, 5, 0) == pytest.approx(0.5)

    def test_symmetric_with_neutrals(self):
        """5 prioritized, 5 deprioritized, 10 neutral = 0.25."""
        assert compute_win_rate(5, 5, 10) == pytest.approx(0.25)

    def test_default_neutral_is_zero(self):
        """Calling without a neutral arg defaults to 0 (backwards compat)."""
        assert compute_win_rate(3, 1) == pytest.approx(0.75)


class TestComputeValueStats:
    def test_includes_neutral_in_win_rate(self):
        stats = compute_value_stats(prioritized=1, deprioritized=0, neutral=9)
        assert stats["winRate"] == pytest.approx(0.1)
        assert stats["count"]["prioritized"] == 1
        assert stats["count"]["deprioritized"] == 0
        assert stats["count"]["neutral"] == 9

    def test_no_data_returns_half(self):
        stats = compute_value_stats(prioritized=0, deprioritized=0, neutral=0)
        assert stats["winRate"] == pytest.approx(0.5)
```

The test module needs `workers/` on `PYTHONPATH` to find `stats.basic_stats`. The CI runner already sets this for the existing `test_analyze_basic.py`; the local developer command is `PYTHONPATH="$(pwd)/workers:$PYTHONPATH" python -m pytest workers/stats/tests/`.

Add an empty `cloud/workers/stats/tests/__init__.py` if pytest discovery requires it (mirror whatever `cloud/workers/tests/` uses).

### 3.5 Verification commands

```bash
cd cloud
PYTHONPATH="$(pwd)/workers:$PYTHONPATH" python -m pytest workers/tests/ workers/stats/tests/ -v
```

All tests pass, including:
- All the existing test_analyze_basic.py tests (re-run with the new formula — expected values that were correct under the old formula happen to still be correct under the new formula when neutrals are zero, so most pass unchanged).
- All 9 new test cases in test_basic_stats.py.

**Expected build state after slice 1:** Python tests green. API/web tests are NOT affected because the Python worker is a subprocess, not imported — API tests use their own fixtures. Lint + build clean.

---

## 4. Slice 2 — Honest denominator in the API aggregation + cache invalidation

**Goal.** Fix both API-side winRate computations (`aggregate-logic.ts` and `value-detail-types.ts`), invalidate the domain analysis cache on deploy, update affected tests.

**Spec reference.** `spec.md` § Affected surfaces — API TypeScript aggregation, API domain-analysis value-detail resolver, Cache invalidation. § Slice plan row 2.

### 4.1 `cloud/apps/api/src/services/analysis/aggregate/aggregate-logic.ts`

Lines 154-156 currently read:

```typescript
const totalWins = target.count.prioritized;
const totalBattles = target.count.prioritized + target.count.deprioritized;
target.winRate = totalBattles > 0 ? totalWins / totalBattles : 0;
```

Change to:

```typescript
const totalWins = target.count.prioritized;
const totalResponses = target.count.prioritized + target.count.deprioritized + target.count.neutral;
target.winRate = totalResponses > 0 ? totalWins / totalResponses : 0;
```

Two things change: neutrals included in the denominator, and the variable rename `totalBattles` → `totalResponses`. Search the file for any other uses of `totalBattles` and update them. (As of main there is only one occurrence.)

### 4.2 `cloud/apps/api/src/graphql/queries/domain/analysis/value-detail-types.ts`

Lines 32-49 (`mapCondition`) currently read:

```typescript
export function mapCondition(condition: MutableCondition): DomainAnalysisConditionDetail {
  const comparisonDenominator = condition.prioritized + condition.deprioritized;
  return {
    // ...
    selectedValueWinRate: comparisonDenominator === 0 ? null : condition.prioritized / comparisonDenominator,
    // ...
  };
}
```

Change `comparisonDenominator` to include `condition.neutral`:

```typescript
const comparisonDenominator = condition.prioritized + condition.deprioritized + condition.neutral;
```

Same edit for `mapVignette` at lines 55-56:

```typescript
const comparisonDenominator = vignette.prioritized + vignette.deprioritized + vignette.neutral;
```

The null fallback stays — `comparisonDenominator === 0` still means "no data at all".

### 4.3 Two version-constant bumps

Codex cold-read review established that only two version constants actually drive cache behavior for this feature:

**Bump 1 — TS-side `analyze_basic` CODE_VERSION duplicate.**

File: `cloud/apps/api/src/queue/handlers/analyze-basic.ts:34`

```typescript
// OLD
const CODE_VERSION = '1.1.1';
// NEW
const CODE_VERSION = '1.2.0';
```

This constant is used at:
- `:73` — `getCachedAnalysis(runId, inputHash, CODE_VERSION)` — the re-run cache-hit check
- `:169` — `codeVersion: CODE_VERSION` — written into the persisted `analysisResult.codeVersion` field

It MUST match the Python-side `CODE_VERSION` in `analyze_basic_metadata.py` (bumped in slice 1 to `"1.2.0"`). If they drift, the cache-hit check misfires and every run re-computes on every job.

**Bump 2 — `AGGREGATE_ANALYSIS_CODE_VERSION`.**

File: `cloud/apps/api/src/services/analysis/aggregate/constants.ts:1`

```typescript
// OLD
export const AGGREGATE_ANALYSIS_CODE_VERSION = '1.2.0';
// NEW
export const AGGREGATE_ANALYSIS_CODE_VERSION = '1.3.0';
```

This constant is written into `analysisResult.codeVersion` by `aggregate-run-workflow.ts:168,193` when a new aggregate row is persisted. Because it was ALREADY at `1.2.0` on main, bumping the basic side to `1.2.0` without bumping the aggregate side would give the aggregate math change no version signal at all. Bump to `1.3.0` to keep the aggregate ahead of basic semantically.

**Why NOT bump `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION`.** The cold-read verification pass found that:

1. Domain snapshots do NOT store `winRate` at all. A grep of `domain-analysis-cache-types.ts` and `domain-analysis-snapshot-builder.ts` for `winRate` returns zero hits — snapshots only store the raw `{ prioritized, deprioritized, neutral }` counts, and the UI (`DomainAnalysis.tsx:143`, fixed in slice 3) computes `winRate` at render time.
2. The snapshot read path at `domain-analysis-cache.ts:232-235` compares `currentSnapshot.inputHash === state.inputHash`. It does NOT compare `codeVersion`.
3. `computeInputHash` in `domain-analysis-snapshot-builder.ts:127-145` does NOT include `codeVersion` in the hashed content — only `domainId`, `signature`, `latestDefinitions`, and per-run `{ runId, inputHash }` fingerprints.

Therefore bumping `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` would be a no-op: old snapshots would continue to be served until their `inputHash` changes (which requires new vignettes or new runs). The real fix for the snapshot display layer is slice 3's `DomainAnalysis.tsx:143` edit, which changes how the UI derives `winRate` from the unchanged-shape counts. **No snapshot-constant bump is needed.**

**The `AnalysisResult` table (basic + aggregate) is handled by slice 5, not here.**

### 4.4 `cloud/apps/api/src/mcp/tools/export-pairwise-outcomes.ts`

No math changes. Find the tool description string (the top-level `description:` field on the tool object) and update the text to note that `winRate` now includes neutrals in the denominator. Example addition to the description:

> Win rate is computed as `prioritized / (prioritized + deprioritized + neutral)`. Neutrals are included in the denominator as of code version 1.2.0.

Keep the field names (`valueAWinRate`, `valueBWinRate`) unchanged. This is a breaking-semantics change but not a breaking-schema change.

### 4.5 Tests

Update `cloud/apps/api/tests/services/analysis/aggregate.test.ts`:

- **Line 640** — `expect(aggregateAnalysis.codeVersion).toBe('1.2.0');` → `expect(aggregateAnalysis.codeVersion).toBe('1.3.0');` (matches `AGGREGATE_ANALYSIS_CODE_VERSION` bump).
- **Line 766** — inside a `toMatchObject({ methodsUsed: { ..., codeVersion: '1.2.0' } })` block. Bump the literal to `'1.3.0'`.
- Any fixture that sets a `neutral` count > 0 and asserts a specific `winRate` value must be updated. The new expected value is `prioritized / (prioritized + deprioritized + neutral)`.
- Add at least one new test case that exercises the new formula explicitly. Suggested fixture:

   ```typescript
   {
     count: { prioritized: 2, deprioritized: 1, neutral: 7 },
     // expected winRate = 2 / 10 = 0.2
   }
   ```

Update `cloud/apps/api/tests/graphql/queries/domain-analysis.test.ts`:

- Line 320 (grep for `selectedValueWinRate`) — if the test asserts a specific value, update it to match the new formula.

Update `cloud/apps/api/tests/mcp/tools/export-pairwise-outcomes.test.ts`:

- **Lines 72-77** — a hand-computed fixture block with `neutral: 1` and `winRate: 0.75` / `winRate: 0.25`. Under the new formula with `prioritized=3, deprioritized=1, neutral=1`, these become `3/5 = 0.6` and `1/5 = 0.2`. Update both fixture-side literals and the matching assertions at **lines 162-163**.
- Grep the full file for any OTHER hand-computed `winRate:` literals and inspect — if the fixture has non-zero neutrals, recompute the expected.

Update `cloud/apps/api/tests/queue/handlers/analyze-basic.integration.test.ts`:

- **Line 284** — assertion `expect(result?.codeVersion).toBe('1.1.1');` → `expect(result?.codeVersion).toBe('1.2.0');`.

### 4.6 Verification commands

```bash
cd cloud
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
JWT_SECRET="test-secret-that-is-at-least-32-characters-long" \
npm run lint --workspace @valuerank/api
npm run test --workspace @valuerank/api
npm run build --workspace @valuerank/api
```

All green.

**Expected build state after slice 2:** API lint + tests + build clean. The web side has NOT been updated yet — that's slice 3. In between slice 2 and slice 3, the API returns new-formula values and the web renders them through its OLD-formula aggregation. For any user who loads the UI between these slices inside the dev branch (not main), the analysis-v2 bucket labels may be subtly wrong. **This is acceptable within a single PR** because slices don't ship to main individually. Do not ship slice 2 alone.

---

## 5. Slice 3 — Honest denominator in web aggregation + model-relative buckets + copy

**Goal.** Fix all three web-side winRate computation sites, redesign the `analysisSemantics.preference.ts` bucket logic to use Option A (model-relative mean), update user-visible copy in `ValuePrioritiesHelpPanel.tsx`, update tests.

**Spec reference.** `spec.md` § Affected surfaces — Web TypeScript. § Risk — the 0.5 threshold (resolved). § Slice plan row 3.

### 5.1 `cloud/apps/web/src/components/analysis-v2/analysisSemantics.preference.ts`

Two edits in this file.

**Edit A — bucket logic redesign (lines ~85-122).** Current code (simplified):

```typescript
const entries = Object.entries(byValue).map(([valueId, stats]) => ({
  name: valueId,
  winRate: stats.winRate,
  distance: Math.abs(stats.winRate - 0.5),
}));

const prioritized = entries
  .filter((entry) => entry.winRate > 0.5 + EPSILON)
  .sort(sortByStrength)
  .slice(0, 3)
  // ...
```

New code (pseudocode):

```typescript
const entries = Object.entries(byValue)
  .map(([valueId, stats]) => ({
    name: valueId,
    winRate: stats.winRate,
  }))
  // Filter out null winRates BEFORE computing the mean — including them would NaN the mean.
  .filter((entry): entry is { name: string; winRate: number } => entry.winRate != null);

if (entries.length === 0) {
  return {
    topPrioritizedValues: [],
    topDeprioritizedValues: [],
    neutralValues: [],
  };
}

const modelMean = entries.reduce((sum, entry) => sum + entry.winRate, 0) / entries.length;

const withDistance = entries.map((entry) => ({
  ...entry,
  distance: entry.winRate - modelMean, // signed
}));

const prioritized = withDistance
  .filter((entry) => entry.distance > EPSILON)
  .sort((a, b) => b.distance - a.distance) // descending by signed distance
  .slice(0, 3)
  .map((entry) => ({ name: entry.name, winRate: entry.winRate }));

const deprioritized = withDistance
  .filter((entry) => entry.distance < -EPSILON)
  .sort((a, b) => a.distance - b.distance) // ascending (most negative first)
  .slice(0, 3)
  .map((entry) => ({ name: entry.name, winRate: entry.winRate }));

const neutral = withDistance
  .filter((entry) => Math.abs(entry.distance) <= EPSILON)
  .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance))
  .slice(0, 3)
  .map((entry) => ({ name: entry.name, winRate: entry.winRate }));
```

The `sortByStrength` helper can stay or be dropped — the new sort is simpler as inline comparators.

**Edit B — merged winRate math (line ~172).** Current:

```typescript
const totalBattles = prioritized + deprioritized;
mergedByValue[valueId] = {
  winRate: totalBattles > 0 ? prioritized / totalBattles : 0.5,
  count: { prioritized, deprioritized, neutral },
};
```

New:

```typescript
const totalResponses = prioritized + deprioritized + neutral;
mergedByValue[valueId] = {
  winRate: totalResponses > 0 ? prioritized / totalResponses : 0.5,
  count: { prioritized, deprioritized, neutral },
};
```

Rename `totalBattles` → `totalResponses`, include `neutral` in the denominator, fallback stays `0.5`.

### 5.2 `cloud/apps/web/src/pages/DomainAnalysis.tsx`

Lines 143-146 currently:

```typescript
const winRateMap = new Map(model.values.map((e) => {
  const denom = e.prioritized + e.deprioritized;
  return [e.valueKey, denom > 0 ? (e.prioritized / denom) * 100 : null] as const;
}));
```

Change the denom to include neutrals:

```typescript
const winRateMap = new Map(model.values.map((e) => {
  const neutral = e.neutral ?? 0;
  const denom = e.prioritized + e.deprioritized + neutral;
  return [e.valueKey, denom > 0 ? (e.prioritized / denom) * 100 : null] as const;
}));
```

The `e.neutral ?? 0` handles the case where the upstream GraphQL shape has `neutral` as optional. Verify the actual shape of `e` (the mapped model value) before committing — if `neutral` is non-optional, drop the `?? 0`.

Lines 147-152 (the `supportRate` computation) already include `neutral` in its denominator — use that as the pattern reference.

### 5.3 `cloud/apps/web/src/components/domains/ValuePrioritiesHelpPanel.tsx`

**Broader than just the formula string.** Codex cold-read review flagged that lines 27-44 contain THREE outdated claims beyond the formula: (a) the winRate is called a "conditional win rate", (b) a line says it "shows how often a value wins once the model picks a side", and (c) the formula is shown at line ~40. Under the honest denominator, all three are wrong — neutrals ARE counted, so "conditional" and "once the model picks a side" are false.

**Edits needed in the 27-55 range:**

1. Line ~27-44 — the winRate section header/body. Rewrite to describe winRate as "the fraction of times the model prioritized this value across all decisions including neutral responses". Remove the word "conditional". Remove the phrase "once the model picks a side".
2. Line ~40 — the formula string. Change `prioritized / (prioritized + deprioritized)` → `prioritized / (prioritized + deprioritized + neutral)`.
3. Line ~55 — the second formula reference. Change `Win Rate = prioritized / (prioritized + deprioritized) × 100%` → `Win Rate = prioritized / (prioritized + deprioritized + neutral) × 100%`.

Keep the support-mode help text unchanged (that is a different metric and is correct — `supportRate` already uses the honest denominator). Preserve all JSX structure, className strings, and list ordering — only the copy text changes.

**Before editing:** open the file and read the full 27-55 range. The exact wording I describe above may not match the file verbatim; adapt to what's actually there. The goal is "remove the 'conditional' framing and update the formula to the honest version."

### 5.4 Tests

`cloud/apps/web/tests/components/analysis-v2/analysisSemantics.test.ts` — the biggest test change in this slice. The bucket-logic test at line ~145 currently expects:

```typescript
topPrioritizedValues: [{ name: 'Compassion', winRate: 0.7 }],
topDeprioritizedValues: [{ name: 'Discipline', winRate: 0.2 }],
neutralValues: [{ name: 'Balance', winRate: 0.5 }],
```

That fixture has `Compassion: 0.7, Discipline: 0.2, Balance: 0.5` → mean = 0.4667. Under the new logic:
- `Compassion` distance = +0.233 → topPrioritized
- `Discipline` distance = -0.267 → topDeprioritized
- `Balance` distance = +0.033 → neither (|distance| > EPSILON, but barely — depends on EPSILON size)

Expected results may differ slightly. The implementer needs to recompute expected bucket membership for each existing fixture and update the assertions.

Add a new test case that specifically exercises the "no value above 0.5" scenario (the old logic's big gap):

```typescript
// Fixture: all three winRates below 0.5
{
  byValue: {
    Alpha: { winRate: 0.2 },
    Beta: { winRate: 0.3 },
    Gamma: { winRate: 0.4 },
  },
}
// Expected under new logic: modelMean = 0.3
// topPrioritized: [Gamma] (distance +0.1)
// topDeprioritized: [Alpha] (distance -0.1)
// neutral: [Beta] (distance 0)
```

Under the old logic, all three would be in `topDeprioritized` (all `< 0.5 - EPSILON`), and `topPrioritized` would be empty.

Other web tests to inspect (grep `winRate:` in test files and look for any with non-trivial values):

- `cloud/apps/web/tests/components/analysis/OverviewTab.test.tsx:26-27` — extremes (`winRate: 1` and `winRate: 0`). Safe under any bucket logic.
- `cloud/apps/web/tests/components/analysis/AnalysisPanel.test.tsx` (multiple sites) — fixtures with `winRate: 0.8, 0.6, 0.9, 0.2, 0.3, etc.` These are used as mock inputs to components that render the `PreferenceViewModel` output. If any of these assertions check specific bucket membership, the expected buckets may shift under the model-relative logic. Inspect each assertion — if it's a "bucket X contains value Y" style check, recompute the expected bucket for the fixture.
- `cloud/apps/web/tests/components/analysis/PairedRunComparisonCard.test.tsx:103, 111` — `winRate: 0.75` and `winRate: 0.25`. Model mean = 0.5, distances ±0.25. Should still land in topPrioritized and topDeprioritized respectively.

Update `cloud/apps/web/tests/pages/DomainAnalysisValueDetail.test.tsx`:

- Lines 162-176 — the `createCondition` helper hand-computes `selectedValueWinRate` with the old denominator. Update to match the new formula. Since the helper takes `prioritized`, `deprioritized`, and `conditions` (neutral is summed from conditions), the new denominator must reference the summed neutral.

### 5.5 Verification commands

```bash
cd cloud
npm run lint --workspace @valuerank/web
npm run test --workspace @valuerank/web
npm run build --workspace @valuerank/web
```

All green. The test suite is the biggest risk point in this slice because the bucket fixture changes cascade through ~5 test files.

**Expected build state after slice 3:** Web lint + tests + build clean. Combined with slice 2, API and web winRate math are now fully in lockstep.

---

## 6. Slice 4 — Honest denominator in standalone script + docs

**Goal.** Fix the standalone ranking script and update docs.

**Spec reference.** `spec.md` § Affected surfaces — Standalone script, Canonical docs. § Slice plan row 4.

### 6.1 `cloud/scripts/analysis/compute_rankings.py`

Three edits in this file, all inside `compute_win_rates` (the function iterates per-value and computes one rate each):

**Edit 1 — lines 88-90, compute the denominator from all three counts.** Current:

```python
total_decisive = pri + dep
win_rate = pri / total_decisive if total_decisive > 0 else 0.5
ci_lower, ci_upper = wilson_score_interval(pri, total_decisive)
```

Change to:

```python
total_responses = pri + dep + neu
win_rate = pri / total_responses if total_responses > 0 else 0.5
ci_lower, ci_upper = wilson_score_interval(pri, total_responses)
```

The variable name flips from `total_decisive` to `total_responses` since "decisive" is no longer accurate (neutrals are counted). `neu` is already in scope at line 87 (`neu = c["neutral"]`), so no extra wiring is needed.

**Edit 2 — line 99, rename the output dict key.** Current:

```python
rows.append({
    ...
    "total_neutral": neu,
    "total_decisive": total_decisive,
    ...
})
```

Change to:

```python
rows.append({
    ...
    "total_neutral": neu,
    "total_responses": total_responses,
    ...
})
```

This is a CSV schema change — downstream consumers of this script's output will see a renamed column. The script is a standalone dev script (no production consumers), so this is safe.

**Edit 3 — docstring/comment around line 66.** Update the module-level comment that describes the formula to the honest version.

**Do not delete `wilson_score_interval`.** It's a self-contained helper and still emits valid CIs; only its `total` input changes.

`compute_rankings.py` has NO argparse / CLI help text — it reads `INPUT_CSV` and `OUTPUT_CSV` as module-level constants. No CLI copy to update.

### 6.2 `docs/features/analysis.md`

**Six sites to update.** Codex cold-read review found three additional stale references beyond the formula string.

1. **Line ~71.** Type comment that currently reads `winRate: number; // prioritized / (prioritized + deprioritized)`. Change to `winRate: number; // prioritized / (prioritized + deprioritized + neutral)`.

2. **Lines ~72-77.** The `ValueStats` type listing still declares a `confidenceInterval` field. That field no longer exists in the actual TypeScript type after `remove-compare-page` deleted the Wilson CI backend. **Remove the `confidenceInterval` entry from the ValueStats type doc.** Verify first by reading `cloud/apps/api/src/services/analysis/aggregate/contracts.ts` — the real `zValueStats` schema — and match the doc to whatever shape the code has.

3. **Lines ~86-96.** The narrative section titled "Win Rate Calculation". Current text says:
   > Win Rate = prioritized / (prioritized + deprioritized)
   > - Neutral responses are excluded from the calculation
   > - Wilson score confidence intervals handle small samples well
   > - Returns 0.5 (neutral) if no data available

   Replace with:
   > Win Rate = prioritized / (prioritized + deprioritized + neutral)
   > - All decided responses, including neutrals, are counted in the denominator
   > - Returns 0.5 (neutral) if no data at all
   > - Returns 0.0 if the value was never prioritized but neutrals were observed

   Delete the Wilson-score line. Wilson CI is gone from the main backend after `remove-compare-page` merged; this doc should not promise it.

4. **Lines ~184-193.** The `MethodsUsed` type listing still declares a `winRateCI: "wilson_score"` field. Slice 1 removes that key from `build_methods_used()`. **Remove the `winRateCI` entry from the MethodsUsed type doc.**

5. **Lines ~317-321.** A section label string that reads "Per-value win rates and CIs". The "and CIs" suffix is stale. Change to "Per-value win rates".

6. **Anywhere else in the file** that describes winRate semantics. Grep and update.

### 6.3 `docs/canonical-glossary.md`

Verified during exploration: the glossary has no existing `winRate` entry. **Add one.** Insert into whichever section is alphabetically/logically appropriate (look at the existing structure). Suggested content:

> **winRate** — For a (model, value) pair, the fraction of vignettes where the model prioritized that value out of all vignettes where a decision (prioritize, deprioritize, or neutral) was recorded. Formula: `prioritized / (prioritized + deprioritized + neutral)`. Returns 0.5 when there is no data at all. Introduced in this shape in code version 1.2.0 (previously excluded neutrals from the denominator).

### 6.4 Files verified to need NO changes (documented here so the implementer doesn't re-grep)

- `docs/valuerank_prd.yaml` — no `winRate` references.
- `docs/values-summary.md` — no `winRate` references.
- `docs/README.md` — check once via grep; if no references, skip.

### 6.5 Verification commands

`compute_rankings.py` has no CLI help — it hard-codes input/output paths. Verify by static read-back:

```bash
cd cloud
grep -n "total_decisive" scripts/analysis/compute_rankings.py
# Expected: ZERO matches (variable renamed to total_responses).

grep -n "total_responses" scripts/analysis/compute_rankings.py
# Expected: at least 2 matches (variable def + output dict key).

grep -n "pri + dep + neu" scripts/analysis/compute_rankings.py
# Expected: 1 match (the new denominator).
```

Docs are markdown/yaml — no build step. Verify by grepping for the old formula in the repo to confirm zero hits after slice 4:

```bash
cd $(git rev-parse --show-toplevel)
grep -rn "prioritized / (prioritized + deprioritized)" --include="*.md" --include="*.py" --include="*.ts" --include="*.tsx" docs/ cloud/ | grep -v "prioritized / (prioritized + deprioritized + neutral)"
```

Zero matches expected.

**Expected build state after slice 4:** Everything green. Ready for slice 5 (the migration).

---

## 6b. Slice 5 — Prisma migration: mark-all-superseded for stale analysis_results rows

**Goal.** One-shot SQL migration that marks every existing `CURRENT` `basic` or `AGGREGATE` row in `analysis_results` as `SUPERSEDED`. After this runs, the next time a user views an existing run in the UI, they see an empty analysis state and can click the existing "Recompute" button to trigger a fresh analysis with the new formula.

**Spec reference.** `spec.md` § Stale data — resolved. § Slice plan row 5. § User decisions already made row 4 (Option B approved).

### 6b.1 Why this slice exists, and what it actually does

**The read path is version-blind.** `cloud/apps/api/src/graphql/queries/analysis.ts:17-35` reads the latest `analysisResult` row by `runId` and `status: 'CURRENT'` alone — it does NOT compare `codeVersion`, and it does NOT re-queue anything. If a row exists with `status: 'CURRENT'`, it is returned verbatim, regardless of which formula produced it.

That means bumping `CODE_VERSION` and `AGGREGATE_ANALYSIS_CODE_VERSION` in slice 2 by itself has ZERO effect on existing runs. Every existing basic and aggregate analysis would keep serving old-formula win rates forever after deploy.

**What marking rows SUPERSEDED actually achieves.** When the resolver at `analysis.ts:17-35` finds no `CURRENT` row for a run, it returns `null`. The web client (`cloud/apps/web/src/components/analysis/AnalysisPanel.tsx` around lines 155-162) treats `null` as "no analysis computed yet" and surfaces the existing **manual recompute button** to the user. Clicking that button calls the `recomputeAnalysis` mutation at `cloud/apps/api/src/graphql/mutations/analysis.ts:16-132`, which enqueues a fresh analysis job. The job runs with the new-formula code and writes a new `CURRENT` row.

**This is the existing product pattern**, not a regression. Users who have never viewed a given run's analysis will never notice anything changed. Users who view a previously-computed run will see an "analysis not available" state and click recompute — the same UX they already have today when a run is new.

**There is NO automatic post-deploy re-queue.** An earlier draft of this section claimed "the downstream logic then re-queues" — that is false. Nothing in the API's read path triggers a recompute on a missing row. The user explicitly initiates it.

Domain-analysis snapshots are NOT handled here (they live in a separate `assumption_analysis_snapshots` table with `AssumptionAnalysisStatus` enum, and they don't store `winRate` at all — slice 3's `DomainAnalysis.tsx:143` edit recomputes winRate at render time from the unchanged-shape counts).

### 6b.2 Migration file

Create a new Prisma migration folder. Use `prisma migrate dev --create-only` to let Prisma pick the timestamp and generate the folder without running it:

```bash
cd cloud
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank?pgbouncer=true" \
DIRECT_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank" \
  npx prisma migrate dev \
    --name invalidate_stale_winrate_analyses \
    --schema packages/db/prisma/schema.prisma \
    --create-only
```

Both `DATABASE_URL` and `DIRECT_URL` are required because `schema.prisma:5-10` declares both — missing either causes Prisma to error out before touching the DB. The `--create-only` flag is effectively the "dry-run" stage: the folder is created, the SQL file is empty, nothing is applied to the DB yet.

The resulting path will be:

```
cloud/packages/db/prisma/migrations/<timestamp>_invalidate_stale_winrate_analyses/migration.sql
```

Replace the empty auto-generated file with:

```sql
-- Mark all existing CURRENT basic and AGGREGATE rows in analysis_results as SUPERSEDED.
-- This forces the frontend to show the "no analysis computed" state, prompting users
-- to click the existing manual recompute button. That triggers the recomputeAnalysis
-- mutation which enqueues a fresh job using the new winRate formula
-- (prioritized / (prioritized + deprioritized + neutral)).
-- See docs/workflow/feature-runs/winrate-honest-denominator/spec.md for context.

UPDATE "analysis_results"
SET "status" = 'SUPERSEDED'
WHERE "status" = 'CURRENT'
  AND "analysis_type" IN ('basic', 'AGGREGATE');
```

**Schema verification.** Verified via `cloud/packages/db/prisma/schema.prisma:681-705`:

- `@@map("analysis_results")` — the underlying table name is snake_case.
- Field `analysisType` → `@map("analysis_type")` — column is snake_case.
- Field `status` → no `@map`, so column is literally `status` (lowercase — Prisma defaults).
- Field `codeVersion` → `@map("code_version")` — column is snake_case.
- **There is NO `updatedAt` column on `AnalysisResult`** — the model has only `createdAt` and `deletedAt`. Do NOT write `updatedAt = NOW()`; the column does not exist and the migration will fail.
- `AnalysisStatus` enum is `CURRENT | SUPERSEDED` (verified at `schema.prisma:702-705`) — exactly those uppercase string values.
- `analysis_type` in `AnalysisResult` is stored as a String (not a Prisma enum). Verified string values via grep of application writers:
  - `cloud/apps/api/src/queue/handlers/analyze-basic.ts:167` → `analysisType: 'basic'` (lowercase).
  - `cloud/apps/api/src/services/analysis/aggregate/aggregate-run-workflow.ts:191` → `analysisType: 'AGGREGATE'` (uppercase).
  - Both string literals match the `IN ('basic', 'AGGREGATE')` filter above.

**Why no `codeVersion` filter in the WHERE clause.** We want to mark EVERY existing row superseded, regardless of its old version string. There is no harm in touching an already-old row.

**Why no `WHERE created_at <` date filter.** The migration must run atomically at deploy time. Filtering by date adds a surface for race conditions ("what if a job finishes between migration-start and deploy-cut-over?"). Cleaner to invalidate everything and let the manual recompute absorb the cost.

### 6b.3 Dry-run verification (before push)

Per the data-critical waves rule, test the migration on a local dev DB first. Both env vars must be set for any Prisma command:

```bash
cd cloud

# Snapshot counts BEFORE (read via psql, bypassing Prisma):
psql "postgresql://valuerank:valuerank@localhost:5433/valuerank" \
  -c "SELECT status, analysis_type, COUNT(*) FROM analysis_results GROUP BY status, analysis_type ORDER BY status, analysis_type;"

# Apply the migration (Prisma requires BOTH env vars):
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank?pgbouncer=true" \
DIRECT_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank" \
  npx prisma migrate deploy --schema packages/db/prisma/schema.prisma

# Snapshot counts AFTER:
psql "postgresql://valuerank:valuerank@localhost:5433/valuerank" \
  -c "SELECT status, analysis_type, COUNT(*) FROM analysis_results GROUP BY status, analysis_type ORDER BY status, analysis_type;"
```

Note: inside the psql `-c` argument, `analysis_type` and `analysis_results` are unquoted lowercase identifiers — Postgres folds unquoted names to lowercase by default, and the Prisma `@map` names are already lowercase, so no double-quoting is needed. Double-quoting is only required when the identifier contains uppercase letters or reserved words.

**Expected delta:**
- `CURRENT` + `basic` row count drops to 0.
- `CURRENT` + `AGGREGATE` row count drops to 0.
- `SUPERSEDED` counts for both types increase by the amounts the CURRENT rows dropped.
- Other analysis types (if any — e.g. `dimension` — check via the BEFORE snapshot) are untouched.

**Production-shaped fixture.** The dev DB's `analysis_results` table should already contain at least one `CURRENT` + `basic` row and one `CURRENT` + `AGGREGATE` row from local runs. If it doesn't, run any existing run once via `npm run dev` to populate it before the dry-run. This satisfies the "production-shaped fixture" requirement of `~/.claude/rules/data-critical-waves.md`.

### 6b.4 Production rollout

Railway runs `prisma migrate deploy` on container startup before the API server accepts traffic. No manual gate required — the migration runs automatically on the first container restart after merge. The sequence is:

1. PR merges to `main`.
2. Railway builds new container image.
3. Container starts, runs `prisma migrate deploy` (applies this migration + any others in the batch).
4. API server starts accepting requests.
5. Users who visit a previously-computed run's analysis page see an empty state and the "Recompute" button. Clicking it queues a fresh analysis job. The job runs with the new-formula code and writes a new `CURRENT` row.
6. Subsequent views of the same run hit the freshly-written new-formula row directly.

**Do NOT add any explicit "wait for migration" hook in application code.** The Railway startup order already guarantees migrations finish before the server accepts traffic.

**Race window consideration.** Between `prisma migrate deploy` finishing and the new API container accepting requests, there is a tiny window where the old container could still write a new `CURRENT` row with old-formula data. Railway's rolling-deploy model typically shuts down the old container before the new one's migration runs, making this window effectively zero. If prod uses blue/green rollout instead, the window is still short (seconds) — worst case a handful of post-deploy runs that land with old-formula data would need one manual recompute via the same UI button.

### 6b.5 Verification commands (part of the slice)

```bash
cd cloud

# The migration file exists at the expected path
ls packages/db/prisma/migrations/*_invalidate_stale_winrate_analyses/migration.sql

# The SQL file contains the expected UPDATE, and does NOT contain updatedAt
grep -n "UPDATE \"analysis_results\"" packages/db/prisma/migrations/*_invalidate_stale_winrate_analyses/migration.sql
grep -n "analysis_type" packages/db/prisma/migrations/*_invalidate_stale_winrate_analyses/migration.sql
! grep -n "updatedAt" packages/db/prisma/migrations/*_invalidate_stale_winrate_analyses/migration.sql

# Applying the migration locally does not error (against test DB)
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test?pgbouncer=true" \
DIRECT_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
  npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

No application code files change in this slice. Lint/build are unaffected. Tests run against the migrated test DB.

### 6b.6 Post-deploy verification checklist (per data-critical-waves rule)

After merging to main and Railway deploys, confirm:

- [ ] Deployed commit is on prod (check Railway dashboard or `gh`)
- [ ] Migration applied (Railway startup log shows `invalidate_stale_winrate_analyses` applied)
- [ ] Row-count delta matches expected (run the psql snapshot queries against prod via Railway CLI)

```sql
-- Expected: ZERO rows (until users start recomputing)
SELECT COUNT(*) FROM analysis_results
WHERE status = 'CURRENT' AND analysis_type IN ('basic', 'AGGREGATE');

-- After a few manual recomputes, new-formula rows appear — they should have the new code versions:
SELECT code_version, COUNT(*) FROM analysis_results
WHERE status = 'CURRENT' AND analysis_type = 'basic' GROUP BY code_version;
-- Expected: all 1.2.0 (or empty if no one has recomputed yet)

SELECT code_version, COUNT(*) FROM analysis_results
WHERE status = 'CURRENT' AND analysis_type = 'AGGREGATE' GROUP BY code_version;
-- Expected: all 1.3.0 (or empty if no one has recomputed yet)
```

- [ ] UI end-to-end: visit a known run's analysis page, confirm empty state + recompute button, click recompute, confirm new analysis renders and shows new-formula values
- [ ] No error spikes for 10 minutes post-deploy (check logs + metrics dashboard)

Record row counts and end-to-end check results in the closeout document.

**Expected build state after slice 5:** All workspaces green. The migration is included in the PR diff but does not affect lint/build. Tests run against the migrated test DB cleanly.

---

## 7. Post-slice verification — the full preflight gate

After all six slices land:

```bash
cd cloud
npm run lint --workspace @valuerank/shared
npm run lint --workspace @valuerank/db
npm run lint --workspace @valuerank/api
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
JWT_SECRET="test-secret-that-is-at-least-32-characters-long" \
npm run test --workspace @valuerank/api
npm run build --workspace @valuerank/api
npm run lint --workspace @valuerank/web
npm run test --workspace @valuerank/web
npm run build --workspace @valuerank/web

PYTHONPATH="$(pwd)/workers:$PYTHONPATH" python -m pytest workers/tests/ workers/stats/tests/
```

All pass. Then manual smoke per `spec.md` § Verification plan — Manual smoke.

---

## 8. Known risks and how the slices mitigate them

| Risk | Mitigation |
|---|---|
| Slice 2 and slice 3 fall out of lockstep (API uses new formula, web uses old). | Both land in the same PR. CI runs the full test suite before merge. Slice 3's bucket-logic tests explicitly catch the old-formula assumption in `analysisSemantics.test.ts`. |
| `analyze_basic.py` split in slice 0 accidentally changes behavior. | Slice 0 ships with zero edits to `test_analyze_basic.py`. The test suite is the contract. If any test fails, the split is wrong. |
| `CODE_VERSION` bump without row invalidation leaves stale `AnalysisResult` rows (basic + aggregate) because `queries/analysis.ts:17-35` does not version-check on read. | Slice 5 runs a Prisma migration that marks every existing `CURRENT` basic/aggregate row as `SUPERSEDED`. Railway runs Prisma migrations on container startup before accepting requests. The `null` analysis result triggers the existing UI empty state + manual recompute button, which is the same UX existing users see for runs that have never been analyzed. |
| Domain-analysis snapshots are not version-invalidated by the code-version bump (snapshot hash does not include `codeVersion`). | Snapshots store raw `{prioritized, deprioritized, neutral}` counts, NOT `winRate`. Slice 3's `DomainAnalysis.tsx:143` edit changes how the UI derives winRate from the unchanged-shape counts, so snapshots stay valid without any constant bump. |
| The `analysisType` string values in the slice 5 migration don't match prod (e.g. `'basic'` vs `'BASIC'`). | Verified via grep of application writers: `analyze-basic.ts:167` writes `'basic'`, `aggregate-run-workflow.ts:191` writes `'AGGREGATE'`. Confirm again via `SELECT DISTINCT analysis_type FROM analysis_results` against local/prod before shipping. |
| The model-relative bucket logic produces empty "prioritized" / "deprioritized" buckets for a flat model. | Documented in the spec as correct behavior. Tests include a flat-model fixture. |
| A downstream consumer silently depends on `winRate >= 0.5` as a sanity check. | Spec review pass (Codex cold-read review) checks for this. If found, fixed in this PR. |
| Test fixtures with hand-computed `winRate:` literals not listed in the spec. | Each slice's verification step includes a full workspace test run. Failed tests surface missed fixtures. |

---

## 9. Open questions to resolve during implementation

None that are blocking. The plan deliberately leaves two judgment calls to the implementer:

1. **Slice 0 — the exact boundary of the `analyze_basic.py` split.** The plan specifies "extract metadata + aggregation helpers" but the implementer picks the exact function boundaries to hit the 400-line target. The only hard constraint is that the file must end up under 400 lines and all tests must still pass.
2. **Slice 5 — the final migration SQL is resolved.** Schema verification confirmed snake_case column names via `@map` and no `updatedAt` column. The SQL is: `UPDATE "analysis_results" SET "status" = 'SUPERSEDED' WHERE "status" = 'CURRENT' AND "analysis_type" IN ('basic', 'AGGREGATE');`. No remaining judgment calls.

Both of these can be resolved in-flight without returning to the plan stage.

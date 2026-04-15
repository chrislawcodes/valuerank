# Tasks — winrate-honest-denominator

Slug: `winrate-honest-denominator`
Workflow: Feature Factory
Spec: `spec.md`
Plan: `plan.md`
Integrator: Claude (Sonnet)
Implementer: Codex (`gpt-5.4-mini` for slices 0, 4, and 5; `gpt-5.4` for slices 1-3)

## How this file is used

Each section below is a self-contained Codex dispatch spec. When ready to work a slice:

1. Copy the slice section (between `<<<BEGIN SLICE N>>>` and `<<<END SLICE N>>>`) into `/tmp/codex-spec-winrate-slice-N.txt`.
2. Dispatch from the worktree root:
   ```bash
   cd /Users/chrislaw/valuerank/.claude/worktrees/goofy-shtern
   codex exec -m <model> -s workspace-write "$(cat /tmp/codex-spec-winrate-slice-N.txt)"
   ```
3. After the run returns, `git status` the worktree (Codex doesn't always commit). Review the diff. Run the slice-local verification listed in the plan. Commit.
4. Before dispatching the next slice, run a short sanity check: `npm run lint` on the affected workspace (it should be clean after the previous slice).

Slices run **serially**, not in parallel. Don't batch.

---

## Global preamble (prepend to every slice spec)

```
=== AGENT CONTEXT: CODEX (IMPLEMENTATION) ===
You are implementing one slice of the `winrate-honest-denominator` feature for ValueRank.

Full spec: /Users/chrislaw/valuerank/.claude/worktrees/goofy-shtern/docs/workflow/feature-runs/winrate-honest-denominator/spec.md
Full plan: /Users/chrislaw/valuerank/.claude/worktrees/goofy-shtern/docs/workflow/feature-runs/winrate-honest-denominator/plan.md

Read both before you start. The slice instructions below list exact files and line numbers, but if anything seems wrong, read the spec and plan to resolve — do not guess.

=== REPO CONSTANTS ===
- Worktree root: /Users/chrislaw/valuerank/.claude/worktrees/goofy-shtern
- Current branch: claude/winrate-honest-denominator
- Code workspace: cloud/
- Node workspaces: @valuerank/shared, @valuerank/db, @valuerank/api, @valuerank/web
- Python workers live in cloud/workers/ (standalone scripts, no package.json)
- Preflight is run from cloud/ via `npm run <lint|test|build> --workspace @valuerank/<name>`
- Python tests: PYTHONPATH="$(pwd)/workers:$PYTHONPATH" python -m pytest workers/tests/ (run from cloud/)

=== HARD RULES ===
1. Do NOT use `@ts-ignore`, `eslint-disable`, or cast to `any` to paper over errors. Fix the root cause.
2. Do NOT suppress Python warnings, errors, or test failures. Fix the root cause.
3. Do NOT rename symbols outside the scope listed below unless the rename is explicitly required by the slice.
4. Do NOT touch any file not listed in the "Files in scope" section.

=== DO NOT MODIFY ===
CLAUDE.md, AGENTS.md, cloud/CLAUDE.md, cloud/AGENTS.md, cloud/agents.md, MEMORY.md, STATUS.md, .gitignore, turbo.json, tsconfig.json, package.json (any), or any file not listed below. If you think another file needs updating, note it in your output but do not write it.

=== HOW TO COMMIT ===
Do not commit. Claude commits after reviewing your diff. Just leave the changes staged or unstaged in the worktree.

=== VERIFICATION AT END ===
Run the "Verification commands" section at the bottom of this slice spec. Report the output verbatim in your final message. If any command fails, STOP, fix the failure, and re-run. Do not proceed with a failing command.
```

---

<<<BEGIN SLICE 0>>>

# Slice 0 — Split `analyze_basic.py` under the file-size limit

**Model:** `gpt-5.4-mini` (pure refactor, mechanical)

## Goal

Shrink `cloud/workers/analyze_basic.py` from 704 lines to < 400 lines by extracting helpers into new modules. **Zero behavior change.** The existing test suite at `cloud/workers/tests/test_analyze_basic.py` is the contract — every test must still pass with zero changes to test code.

## Context

`analyze_basic.py` is the Python subprocess entry point invoked by the API TypeScript worker. It reads transcripts from stdin, aggregates per-model statistics, and writes an analysis JSON to stdout. Call sites:

- `cloud/apps/api/src/services/analysis/aggregate/constants.ts:7` — `export const ANALYZE_WORKER_PATH = 'workers/analyze_basic.py';`
- `cloud/apps/api/src/queue/handlers/analyze-basic.ts:31` — same path
- `cloud/workers/tests/test_analyze_basic.py:19` — `[sys.executable, "analyze_basic.py"]`

**`analyze_basic.py` must remain the top-level script file.** Do not rename it, do not make it an `__init__.py`, do not move it into a subdirectory. Helper modules go alongside it in `cloud/workers/`.

## Files in scope

- READ first (context):
  - `cloud/workers/analyze_basic.py` (the full file)
  - `cloud/workers/tests/test_analyze_basic.py` (the contract)
  - `cloud/workers/stats/basic_stats.py` (to understand what's already extracted)

- CREATE:
  - `cloud/workers/analyze_basic_metadata.py` (new, per instructions below)
  - `cloud/workers/analyze_basic_aggregation.py` (new — or rename to `analyze_basic_core.py` if that reads cleaner to you; pick the one that describes the extracted functions most accurately)

- MODIFY:
  - `cloud/workers/analyze_basic.py` (shrink under 400 lines)

- DO NOT MODIFY:
  - `cloud/workers/tests/test_analyze_basic.py` (the contract — must pass byte-for-byte)
  - `cloud/workers/stats/basic_stats.py` (slice 1 touches this, not slice 0)
  - Any API/web TypeScript file
  - Any docs file

## Instructions

### Step 1 — Extract metadata into `analyze_basic_metadata.py`

Create `cloud/workers/analyze_basic_metadata.py` with this exact content (note: `CODE_VERSION` stays at `"1.1.1"` in this slice — slice 1 bumps it to `"1.2.0"`, do NOT do that here):

```python
"""Metadata constants and methods-used block emitted by analyze_basic.py.

Extracted from analyze_basic.py to keep that script under the 400-line
file-size limit. Pure metadata — no behavior.
"""

CODE_VERSION = "1.1.1"
SUMMARY_CONTRACT_VERSION = "vignette-semantics-v1"


def build_methods_used() -> dict:
    """Return the methodsUsed metadata block for an analysis output."""
    return {
        "winRateCI": "wilson_score",
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

Then in `analyze_basic.py`:
1. Delete the inline `CODE_VERSION = "1.1.1"` and `SUMMARY_CONTRACT_VERSION = "vignette-semantics-v1"` lines (currently around lines 66 and 68).
2. Delete the inline `"methodsUsed": { ... }` dict (currently around line 624 — grep the file for `"winRateCI"` to locate).
3. Add at the top of the imports block:
   ```python
   from analyze_basic_metadata import (
       CODE_VERSION,
       SUMMARY_CONTRACT_VERSION,
       build_methods_used,
   )
   ```
4. At the dict assembly site (where `"methodsUsed":` used to appear inline), replace with `"methodsUsed": build_methods_used(),`.

**Verify before moving on:** run `cd cloud && PYTHONPATH="$(pwd)/workers:$PYTHONPATH" python -m pytest workers/tests/test_analyze_basic.py -v`. All tests must pass. The important one is `test_methods_used_block` (or similarly named) which asserts the `methodsUsed` dict shape; it must see the same dict it saw before.

### Step 2 — Extract aggregation helpers into `analyze_basic_aggregation.py`

Goal: get `analyze_basic.py` under 400 lines.

Read through `analyze_basic.py` and identify the functions that:
- Take structured input (lists, dicts, typed values)
- Return structured output
- Do NOT touch stdin/stdout/argparse/sys.exit/main orchestration

Move those functions into `cloud/workers/analyze_basic_aggregation.py`. Candidates to check:
- Per-model aggregation loops (the big loop that iterates transcripts and builds per-model stats)
- Signed-distance normalization helpers
- P-value correction helpers (if any)
- Effect-size computation helpers
- Any other "given these inputs, return these outputs" pure functions

**Leave in `analyze_basic.py`:**
- `main()`
- Argument parsing
- Stdin reading
- Stdout writing
- Top-level exception handling
- The orchestration sequence that calls the extracted helpers

After moving functions, add imports to `analyze_basic.py`:
```python
from analyze_basic_aggregation import <each function you moved>
```

The exact boundary is a judgment call — as long as `analyze_basic.py` ends up under 400 lines and `analyze_basic_aggregation.py` is also under 400 lines, either direction is fine.

### Step 3 — Verify file sizes

```bash
cd cloud
wc -l workers/analyze_basic.py workers/analyze_basic_metadata.py workers/analyze_basic_aggregation.py
```

Every file must report < 400 lines. If `analyze_basic.py` is still over, move more functions to `analyze_basic_aggregation.py`. If `analyze_basic_aggregation.py` is over, that's a signal the slice should split the helpers further (create a third module) — do that rather than leaving either file over the limit.

### Step 4 — Run the contract tests

```bash
cd cloud
PYTHONPATH="$(pwd)/workers:$PYTHONPATH" python -m pytest workers/tests/test_analyze_basic.py -v
```

Every test must pass. Zero changes to `test_analyze_basic.py`. If a test fails, the split introduced a behavior change — revert that function and try extracting a different one.

## Verification commands (run these and report output verbatim)

```bash
cd cloud
wc -l workers/analyze_basic.py workers/analyze_basic_metadata.py workers/analyze_basic_aggregation.py
PYTHONPATH="$(pwd)/workers:$PYTHONPATH" python -m pytest workers/tests/test_analyze_basic.py -v
```

Both must pass. Line counts all < 400. All pytest cases pass.

## Success criteria

- [ ] `wc -l workers/analyze_basic.py` reports < 400 lines
- [ ] New file `workers/analyze_basic_metadata.py` exists and is < 400 lines
- [ ] New file `workers/analyze_basic_aggregation.py` exists and is < 400 lines
- [ ] `workers/tests/test_analyze_basic.py` passes with zero test-file changes
- [ ] No functional behavior change — `methodsUsed` output is byte-for-byte identical
- [ ] `CODE_VERSION` is still `"1.1.1"` (not bumped yet — slice 1 does that)

<<<END SLICE 0>>>

---

<<<BEGIN SLICE 1>>>

# Slice 1 — Honest denominator in the Python worker

**Model:** `gpt-5.4` (core math change + new test file, more judgment required)

## Goal

Change the winRate formula in `cloud/workers/stats/basic_stats.py` to include neutrals in the denominator. Bump `CODE_VERSION` to `"1.2.0"`. Drop the dead `"winRateCI": "wilson_score"` metadata key. Drop the unused `confidence` parameter from `compute_value_stats`. Add a new unit test file `cloud/workers/stats/tests/test_basic_stats.py`.

## Context

See `spec.md` § Affected surfaces — Python worker. The critical change is:

```python
# OLD
def compute_win_rate(prioritized: int, deprioritized: int) -> float:
    total = prioritized + deprioritized
    if total == 0:
        return 0.5
    return prioritized / total

# NEW
def compute_win_rate(prioritized: int, deprioritized: int, neutral: int = 0) -> float:
    total = prioritized + deprioritized + neutral
    if total == 0:
        return 0.5
    return prioritized / total
```

Slice 0 has already run. `CODE_VERSION` and `build_methods_used()` live in `cloud/workers/analyze_basic_metadata.py`.

## Files in scope

- MODIFY:
  - `cloud/workers/stats/basic_stats.py` — core math change + drop `confidence` param
  - `cloud/workers/analyze_basic_metadata.py` — bump `CODE_VERSION`, remove dead key
  - `cloud/workers/tests/test_analyze_basic.py` — update assertions affected by the changes

- CREATE:
  - `cloud/workers/stats/tests/test_basic_stats.py` (new test file)
  - `cloud/workers/stats/tests/__init__.py` (empty, only if `cloud/workers/tests/` has one — check first)

- DO NOT MODIFY:
  - `cloud/workers/analyze_basic.py` or `cloud/workers/analyze_basic_aggregation.py` (slice 0 output — leave alone)
  - Any TypeScript file
  - Any docs file

## Instructions

### Step 1 — Update `compute_win_rate` and `compute_value_stats`

File: `cloud/workers/stats/basic_stats.py`

Replace the entire `compute_win_rate` function (lines 47-65 as of main) with:

```python
def compute_win_rate(prioritized: int, deprioritized: int, neutral: int = 0) -> float:
    """
    Compute win rate from prioritized/deprioritized/neutral counts.

    Win rate = prioritized / (prioritized + deprioritized + neutral)

    All decided responses (including neutral) are counted in the denominator.
    This is the "honest" formula: a value the model treats neutrally most
    of the time will score low, not fake-100%.

    Args:
        prioritized: Count of times the value was prioritized
        deprioritized: Count of times the value was deprioritized
        neutral: Count of neutral responses (default 0 for caller backwards compat)

    Returns:
        Win rate as a float between 0 and 1, or 0.5 if there is no data at all

    """
    total = prioritized + deprioritized + neutral
    if total == 0:
        return 0.5  # No data means neutral
    return prioritized / total
```

Replace the entire `compute_value_stats` function (lines 68-95) with:

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
        neutral: Count of neutral responses (counted in the win rate denominator)

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

Note: the `confidence: float = 0.95` parameter is removed. Before removing, grep the repo to confirm zero callers pass it:

```bash
grep -rn "compute_value_stats" cloud/workers/ cloud/apps/ cloud/scripts/ 2>/dev/null
```

If any caller passes `confidence=`, STOP and report. Otherwise, remove it.

### Step 2 — Bump `CODE_VERSION` and drop the dead metadata key

File: `cloud/workers/analyze_basic_metadata.py`

1. Change `CODE_VERSION = "1.1.1"` → `CODE_VERSION = "1.2.0"`.
2. In `build_methods_used()`, remove the line `"winRateCI": "wilson_score",`. The final dict should read:
   ```python
   def build_methods_used() -> dict:
       """Return the methodsUsed metadata block for an analysis output."""
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

### Step 3 — Update `test_analyze_basic.py`

File: `cloud/workers/tests/test_analyze_basic.py`

1. Grep for `winRateCI` in this file. There should be exactly one assertion like `assert methods["winRateCI"] == "wilson_score"` (currently around line 218). Delete that single line. Do not delete surrounding assertions.
2. Grep for `codeVersion` or `"1.1.1"`. If there's an assertion like `assert methods["codeVersion"] == "1.1.1"`, change the expected to `"1.2.0"`.
3. Grep for `win_rate` or `winRate`. Look for hand-computed expected values. For each:
   - If the fixture has `neutral=0`, the expected value is unchanged (old formula and new formula agree).
   - If the fixture has `neutral > 0`, recompute the expected as `prioritized / (prioritized + deprioritized + neutral)` and update.
4. Specifically inspect the test around lines 978-982 (the "3 prioritized, 1 deprioritized = 75% win rate" case). Under the new formula that's still 0.75 because neutral is implicitly 0 in that fixture. No value change. Optionally update the comment to explicitly say "neutral = 0".

### Step 4 — Create the new test file

File: `cloud/workers/stats/tests/test_basic_stats.py` (create)

First, check whether `cloud/workers/tests/__init__.py` exists. If it does, create an empty `cloud/workers/stats/tests/__init__.py`. If it doesn't, don't create one either (pytest discovery uses whichever mode the repo is on).

Then write the test file:

```python
"""Unit tests for basic_stats.compute_win_rate and compute_value_stats."""

import pytest

from stats.basic_stats import compute_value_stats, compute_win_rate


class TestComputeWinRate:
    def test_zero_neutral_matches_old_behavior(self):
        """3 prioritized, 1 deprioritized, 0 neutral = 0.75."""
        assert compute_win_rate(3, 1, 0) == pytest.approx(0.75)

    def test_heavy_neutral_drags_rate_down(self):
        """1 prioritized, 0 deprioritized, 9 neutral = 0.1 (headline case).

        Under the OLD formula this would have been 1.0 — a value the
        model rarely touched but never deprioritized looked maximally
        strong. Under the new honest formula it scores 0.1.
        """
        assert compute_win_rate(1, 0, 9) == pytest.approx(0.1)

    def test_all_neutral_is_honest_zero(self):
        """0 prioritized, 0 deprioritized, 100 neutral = 0.0.

        We DO have data — 100 neutrals. The model never prioritized
        this value. The honest win rate is 0.0, not the no-data 0.5.
        """
        assert compute_win_rate(0, 0, 100) == pytest.approx(0.0)

    def test_no_data_fallback(self):
        """0 prioritized, 0 deprioritized, 0 neutral = 0.5 (no-data fallback)."""
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

## Verification commands (run these and report output verbatim)

```bash
cd cloud
PYTHONPATH="$(pwd)/workers:$PYTHONPATH" python -m pytest workers/tests/ workers/stats/tests/ -v
```

Every test must pass. Zero failures, zero errors. Expect 9 new tests from `test_basic_stats.py` plus all existing `test_analyze_basic.py` tests.

Also run a grep sanity check:

```bash
grep -rn "winRateCI" cloud/workers/ cloud/apps/ 2>/dev/null || echo "CLEAN: no winRateCI references left"
grep -rn 'CODE_VERSION = "1.1.1"' cloud/workers/ 2>/dev/null || echo "CLEAN: CODE_VERSION bumped"
```

Expected: "CLEAN: no winRateCI references left" and "CLEAN: CODE_VERSION bumped".

## Success criteria

- [ ] `compute_win_rate(1, 0, 9) == 0.1` (not the old 1.0)
- [ ] `compute_win_rate(0, 0, 0) == 0.5` (no-data fallback preserved)
- [ ] `compute_value_stats` no longer accepts a `confidence` kwarg
- [ ] `CODE_VERSION == "1.2.0"` in `analyze_basic_metadata.py`
- [ ] `build_methods_used()` does not emit `winRateCI`
- [ ] `test_basic_stats.py` exists with 9 unit tests, all passing
- [ ] `test_analyze_basic.py` passes with the `winRateCI` assertion removed

<<<END SLICE 1>>>

---

<<<BEGIN SLICE 2>>>

# Slice 2 — Honest denominator in the API aggregation + cache invalidation

**Model:** `gpt-5.4` (two computation sites + version bumps + test fixture updates)

## Goal

Change two API-side winRate computation sites to include neutrals in the denominator, bump two version constants (TS-side `CODE_VERSION`, `AGGREGATE_ANALYSIS_CODE_VERSION`), update affected tests including the integration test `codeVersion` assertion and two aggregate.test.ts `codeVersion` assertions. Update the MCP export tool description string.

## Context

The API has two separate winRate computations:

1. **`aggregate-logic.ts`** — the primary per-model aggregation, line 154-156 as of main.
2. **`value-detail-types.ts`** — the `selectedValueWinRate` metric used by the domain-analysis value-detail resolver. Two sites: `mapCondition` (line ~32) and `mapVignette` (line ~55).

Both drop neutrals currently. Both need the same fix.

**Version-bump story (two constants).** Slice 2 bumps these:

- **TS-side `CODE_VERSION`** in `queue/handlers/analyze-basic.ts:34` — a duplicate of the Python worker's constant, used to compute the cache-hit check at line 73 and written into `analysisResult.codeVersion` at line 169. MUST match the Python-side value bumped in slice 1 (`"1.2.0"`).
- **`AGGREGATE_ANALYSIS_CODE_VERSION`** in `services/analysis/aggregate/constants.ts:1` — written into aggregate `analysisResult` rows by `aggregate-run-workflow.ts`. Currently `'1.2.0'` on main, must bump to `'1.3.0'` so the aggregate math change has a version signal.

**Why NO `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` bump.** The cold-read review verified that domain snapshots do NOT store `winRate` at all — they only store raw `{ prioritized, deprioritized, neutral }` counts, and the UI computes `winRate` at render time (`DomainAnalysis.tsx:143`, fixed in slice 3). The snapshot read path at `domain-analysis-cache.ts:232-235` only compares `inputHash`, and `computeInputHash` at `domain-analysis-snapshot-builder.ts:127-145` does NOT include `codeVersion`. So bumping the snapshot constant would be a no-op. Do NOT touch it.

The stale `AnalysisResult` rows (basic + aggregate) in Postgres are NOT handled here — slice 5 runs a one-shot Prisma migration that marks them `SUPERSEDED`. Don't try to add invalidation logic for those rows in this slice.

## Files in scope

- MODIFY:
  - `cloud/apps/api/src/services/analysis/aggregate/aggregate-logic.ts`
  - `cloud/apps/api/src/graphql/queries/domain/analysis/value-detail-types.ts`
  - `cloud/apps/api/src/queue/handlers/analyze-basic.ts` (TS-side CODE_VERSION bump)
  - `cloud/apps/api/src/services/analysis/aggregate/constants.ts` (AGGREGATE_ANALYSIS_CODE_VERSION bump)
  - `cloud/apps/api/src/mcp/tools/export-pairwise-outcomes.ts` (description text only, NO math)
  - `cloud/apps/api/tests/services/analysis/aggregate.test.ts` (fixture updates + bump assertions at lines 640 and 766 from `'1.2.0'` to `'1.3.0'`)
  - `cloud/apps/api/tests/graphql/queries/domain-analysis.test.ts`
  - `cloud/apps/api/tests/mcp/tools/export-pairwise-outcomes.test.ts`
  - `cloud/apps/api/tests/queue/handlers/analyze-basic.integration.test.ts` (update `codeVersion` assertion at line 284)

- DO NOT MODIFY:
  - Any Python file (slice 1 handled those)
  - Any web file (slice 3 handles those)
  - Any docs file (slice 4 handles those)
  - Any Prisma migration file (slice 5 handles those)
  - GraphQL codegen outputs (they regenerate automatically)
  - Any schema / contracts file (no shape changes)
  - `cloud/apps/api/src/services/analysis/domain-analysis-cache-types.ts` — do NOT bump `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION`. See Context section above for why.
  - `cloud/apps/api/src/services/analysis/domain-analysis-cache.ts` — this file exists but is out of scope for this slice.

## Instructions

### Step 1 — `aggregate-logic.ts`

File: `cloud/apps/api/src/services/analysis/aggregate/aggregate-logic.ts`

Find the block (around lines 154-156) that reads:

```typescript
const totalWins = target.count.prioritized;
const totalBattles = target.count.prioritized + target.count.deprioritized;
target.winRate = totalBattles > 0 ? totalWins / totalBattles : 0;
```

Replace with:

```typescript
const totalWins = target.count.prioritized;
const totalResponses = target.count.prioritized + target.count.deprioritized + target.count.neutral;
target.winRate = totalResponses > 0 ? totalWins / totalResponses : 0;
```

Two changes: (1) neutrals in denominator, (2) rename `totalBattles` → `totalResponses`. Grep the file for any other references to `totalBattles` and update them. As of main there is only one occurrence.

### Step 2 — `value-detail-types.ts`

File: `cloud/apps/api/src/graphql/queries/domain/analysis/value-detail-types.ts`

This file has TWO mapper functions with the same bug: `mapCondition` and `mapVignette`.

**In `mapCondition`:** find the line (around 33) that reads:

```typescript
const comparisonDenominator = condition.prioritized + condition.deprioritized;
```

Change to:

```typescript
const comparisonDenominator = condition.prioritized + condition.deprioritized + condition.neutral;
```

The line that uses it (`selectedValueWinRate: comparisonDenominator === 0 ? null : condition.prioritized / comparisonDenominator`) stays unchanged — the null fallback still correctly represents "no data at all".

**In `mapVignette`:** find the equivalent line (around 55):

```typescript
const comparisonDenominator = vignette.prioritized + vignette.deprioritized;
```

Change to:

```typescript
const comparisonDenominator = vignette.prioritized + vignette.deprioritized + vignette.neutral;
```

If either function uses a different local variable name, rename the variable to `comparisonDenominator` first to keep the two sites parallel, then apply the denominator change. If the underlying type doesn't expose `.neutral`, read the type definition at the top of the file — it should — and fix the mapper to use the field.

### Step 3 — Two version-constant bumps

Two constants bump in lockstep with the math changes, each in a different file.

**Bump 1 — TS-side `CODE_VERSION` for basic analyses.**

File: `cloud/apps/api/src/queue/handlers/analyze-basic.ts`, line 34.

```typescript
// OLD
const CODE_VERSION = '1.1.1';
// NEW
const CODE_VERSION = '1.2.0';
```

Uses of this constant:
- Line ~73: `getCachedAnalysis(runId, inputHash, CODE_VERSION)` — cache-hit check
- Line ~169: `codeVersion: CODE_VERSION` — written into persisted `analysisResult.codeVersion`

It MUST match the Python-side value in `cloud/workers/analyze_basic_metadata.py` (slice 1 bumped it to `"1.2.0"`). If they drift, every re-run recomputes from scratch.

**Bump 2 — `AGGREGATE_ANALYSIS_CODE_VERSION`.**

File: `cloud/apps/api/src/services/analysis/aggregate/constants.ts`, line 1.

```typescript
// OLD
export const AGGREGATE_ANALYSIS_CODE_VERSION = '1.2.0';
// NEW
export const AGGREGATE_ANALYSIS_CODE_VERSION = '1.3.0';
```

This constant is already `'1.2.0'` on main — bumping the basic constant to `'1.2.0'` without bumping the aggregate constant would leave the aggregate math change with zero version signal. Bump to `'1.3.0'`.

**DO NOT bump `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` in `domain-analysis-cache-types.ts`.** Earlier drafts of this spec included that bump. Cold-read review verified it is a no-op: domain snapshots don't store `winRate` (grep `domain-analysis-snapshot-builder.ts` for `winRate` returns zero hits), `computeInputHash` does not include `codeVersion`, and the snapshot read path only compares `inputHash === state.inputHash`. Leave the snapshot constant alone. Slice 3's `DomainAnalysis.tsx:143` edit handles the snapshot display layer by recomputing winRate at render time from the unchanged-shape counts.

**Do NOT touch any other "cache" files.** There is no startup hook to add. The two constant bumps above are the entire cache story for slice 2.

### Step 4 — `export-pairwise-outcomes.ts` description text

File: `cloud/apps/api/src/mcp/tools/export-pairwise-outcomes.ts`

**No math changes.** This tool just passes through `valueAStats?.winRate` / `valueBStats?.winRate` from upstream. The fix comes for free from slice 2 step 1.

Find the top-level tool description field (likely `description:` or `summary:` at the top of the tool definition object). Append a sentence:

> Win rate is computed as `prioritized / (prioritized + deprioritized + neutral)`. Neutrals are included in the denominator as of code version 1.2.0.

Keep all field names (`valueAWinRate`, `valueBWinRate`) unchanged. This is a breaking-semantics change but not a breaking-schema change.

### Step 5 — Update tests

**`cloud/apps/api/tests/services/analysis/aggregate.test.ts`**

1. **Line 640**: `expect(aggregateAnalysis.codeVersion).toBe('1.2.0');` → `expect(aggregateAnalysis.codeVersion).toBe('1.3.0');`. This matches the `AGGREGATE_ANALYSIS_CODE_VERSION` bump.
2. **Line 766** (inside a `toMatchObject({ methodsUsed: { aggregateSemantics: 'same-signature-v1', codeVersion: '1.2.0' } })` block): bump the `codeVersion` literal from `'1.2.0'` to `'1.3.0'`.
3. Grep the file for any OTHER `codeVersion:` or `codeVersion).toBe(` literals set to `'1.2.0'` and bump them to `'1.3.0'` if they reference the AGGREGATE analysis. Do NOT bump any that reference basic analysis — those stay at `'1.2.0'`.
4. Grep the file for `winRate:` assertions. For each, check the fixture:
   - If the fixture has `neutral: 0`, the expected value is unchanged.
   - If the fixture has `neutral > 0` and the test hand-computes `winRate`, update the expected value to `prioritized / (prioritized + deprioritized + neutral)`.
5. Add a new test case specifically for the new formula. Suggested:
   ```typescript
   it("includes neutrals in the winRate denominator", () => {
     const fixture = /* a target with count: { prioritized: 2, deprioritized: 1, neutral: 7 } */;
     // expected: 2 / (2 + 1 + 7) = 0.2
     expect(result.winRate).toBeCloseTo(0.2, 6);
   });
   ```
   Use whatever fixture shape the file already uses — match the existing test style.

**`cloud/apps/api/tests/graphql/queries/domain-analysis.test.ts`**

1. Grep for `selectedValueWinRate` — hit is around line 320. The selection is there but the response assertions at lines ~400-417 do NOT hand-compute an expected value; they likely check presence or rely on the mock. Inspect the assertions and confirm — if a specific winRate number is asserted, update it; if not, no change needed.

**`cloud/apps/api/tests/mcp/tools/export-pairwise-outcomes.test.ts`**

1. **Lines 72-77** contain a hand-computed fixture block:
   ```typescript
   {
     prioritized: 3,
     deprioritized: 1,
     neutral: 1,
     winRate: 0.75,   // OLD: 3 / (3 + 1) = 0.75
   }
   ```
   Under the new denominator, `winRate = 3 / (3 + 1 + 1) = 0.6`. And the paired `winRate: 0.25` becomes `1 / 5 = 0.2`. Update both fixture-side literals and the matching assertions at **lines 162-163** where those values are checked.
2. Grep the full file for any OTHER hand-computed `winRate:` literals — for any with non-zero `neutral`, recompute and update.

**`cloud/apps/api/tests/queue/handlers/analyze-basic.integration.test.ts`**

1. **Line 284** — the assertion `expect(result?.codeVersion).toBe('1.1.1');`. Change to `expect(result?.codeVersion).toBe('1.2.0');` to match the slice 1 Python-side bump and the slice 2 TS-handler bump.

### Step 6 — Run the full API test suite

Setup requires a test database. If not available locally, report that and skip — Claude will catch it in preflight.

## Verification commands (run these and report output verbatim)

```bash
cd cloud
npm run lint --workspace @valuerank/api
npm run build --workspace @valuerank/api
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
JWT_SECRET="test-secret-that-is-at-least-32-characters-long" \
npm run test --workspace @valuerank/api
```

All three must pass. If the test DB isn't available, lint + build must still pass.

Grep sanity check:

```bash
grep -rn "totalBattles" cloud/apps/api/src/ 2>/dev/null || echo "CLEAN: totalBattles gone from API"
```

Expected: "CLEAN: totalBattles gone from API".

## Success criteria

- [ ] `aggregate-logic.ts` uses `totalResponses` including `.neutral` in the denominator
- [ ] `value-detail-types.ts` both `mapCondition` and `mapVignette` include `.neutral` in `comparisonDenominator`
- [ ] `queue/handlers/analyze-basic.ts:34` `CODE_VERSION` bumped `'1.1.1'` → `'1.2.0'`
- [ ] `aggregate/constants.ts:1` `AGGREGATE_ANALYSIS_CODE_VERSION` bumped `'1.2.0'` → `'1.3.0'`
- [ ] `domain-analysis-cache-types.ts` is UNTOUCHED (no snapshot constant bump)
- [ ] `export-pairwise-outcomes.ts` description mentions the new formula
- [ ] `export-pairwise-outcomes.test.ts` fixture at lines 72-77 and assertions at 162-163 updated to new expected values (`0.6` / `0.2`)
- [ ] `analyze-basic.integration.test.ts:284` codeVersion assertion updated to `'1.2.0'`
- [ ] `aggregate.test.ts:640` + `aggregate.test.ts:766` codeVersion assertions bumped to `'1.3.0'`
- [ ] All affected API tests updated and passing
- [ ] `npm run lint --workspace @valuerank/api` clean
- [ ] `npm run build --workspace @valuerank/api` clean

<<<END SLICE 2>>>

---

<<<BEGIN SLICE 3>>>

# Slice 3 — Honest denominator in web aggregation + model-relative buckets + copy

**Model:** `gpt-5.4` (bucket logic redesign + three math sites + test fixture cascade)

## Goal

Three edits to `analysisSemantics.preference.ts`: (1) bucket redesign from 0.5-absolute to model-mean-relative, (2) honest denominator in the merged winRate math. Fix the third web winRate computation site in `DomainAnalysis.tsx`. Update the user-visible help-panel copy. Update tests.

## Context

The web has THREE winRate computation sites:

1. `analysisSemantics.preference.ts:101-115` — bucket logic (top-3 prioritized / bottom-3 deprioritized / neutral). Uses `winRate > 0.5 + EPSILON` as the bucket filter. Under the new honest formula 0.5 is no longer a meaningful threshold. **Decision locked in spec: Option A — model-relative mean.**
2. `analysisSemantics.preference.ts:167-182` — merged winRate math for multi-scope analyses. Same drops-neutrals bug as the API.
3. `DomainAnalysis.tsx:143-146` — third site, same bug.

Plus user-visible copy in `ValuePrioritiesHelpPanel.tsx` that shows the old formula as text.

**CRITICAL implementation note from spec §Risk:** `winRate` is typed `number | null` in `PreferenceValueSummary` (see `cloud/apps/web/src/components/analysis-v2/analysisSemantics.types.ts:19-21`). The model-mean computation MUST filter out null winRates before averaging, otherwise the mean is `NaN` and every comparison returns `false` — the UI silently breaks.

## Files in scope

- MODIFY:
  - `cloud/apps/web/src/components/analysis-v2/analysisSemantics.preference.ts` (bucket redesign + merged-math fix)
  - `cloud/apps/web/src/pages/DomainAnalysis.tsx` (third winRate site)
  - `cloud/apps/web/src/components/domains/ValuePrioritiesHelpPanel.tsx` (copy update)
  - `cloud/apps/web/tests/components/analysis-v2/analysisSemantics.test.ts` (fixture + assertion updates)
  - `cloud/apps/web/tests/pages/DomainAnalysisValueDetail.test.tsx` (helper fixture update)

- READ (to understand types before editing):
  - `cloud/apps/web/src/components/analysis-v2/analysisSemantics.types.ts` (check winRate null shape)

- DO NOT MODIFY:
  - Any Python / API file (slices 0-2 handled those)
  - `cloud/apps/web/src/utils/canonicalConditionSummary.ts` (already honest — see spec)
  - `cloud/apps/web/src/components/domains/DominanceSectionChart.tsx` (different metric)
  - `cloud/apps/web/src/components/domains/ValuePrioritiesSection.tsx` (just displays — no math)
  - Any docs file (slice 4 handles those)

## Instructions

### Step 1 — Read the types file first

Open `cloud/apps/web/src/components/analysis-v2/analysisSemantics.types.ts` and confirm the shape of `PreferenceValueSummary`. You need to know whether `winRate` is `number`, `number | null`, or something else. The null handling in Step 2 depends on this.

### Step 2 — Bucket redesign (`analysisSemantics.preference.ts`)

File: `cloud/apps/web/src/components/analysis-v2/analysisSemantics.preference.ts`

Find the bucket logic block (around lines 85-122). Current structure (simplified):

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

Replace with (Option A — model-relative mean):

```typescript
// Build entries first, filtering out null winRates. Null must be excluded
// from the mean computation (otherwise the mean is NaN) and from the buckets.
const entriesWithWinRate = Object.entries(byValue)
  .map(([valueId, stats]) => ({
    name: valueId,
    winRate: stats.winRate,
  }))
  .filter((entry): entry is { name: string; winRate: number } => entry.winRate != null);

if (entriesWithWinRate.length === 0) {
  return {
    topPrioritizedValues: [],
    topDeprioritizedValues: [],
    neutralValues: [],
  };
}

const modelMean =
  entriesWithWinRate.reduce((sum, entry) => sum + entry.winRate, 0) /
  entriesWithWinRate.length;

const withDistance = entriesWithWinRate.map((entry) => ({
  ...entry,
  distance: entry.winRate - modelMean, // signed distance
}));

const topPrioritizedValues = withDistance
  .filter((entry) => entry.distance > EPSILON)
  .sort((a, b) => b.distance - a.distance) // most positive first
  .slice(0, 3)
  .map((entry) => ({ name: entry.name, winRate: entry.winRate }));

const topDeprioritizedValues = withDistance
  .filter((entry) => entry.distance < -EPSILON)
  .sort((a, b) => a.distance - b.distance) // most negative first
  .slice(0, 3)
  .map((entry) => ({ name: entry.name, winRate: entry.winRate }));

const neutralValues = withDistance
  .filter((entry) => Math.abs(entry.distance) <= EPSILON)
  .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance))
  .slice(0, 3)
  .map((entry) => ({ name: entry.name, winRate: entry.winRate }));
```

Adapt the variable names to match the existing code — if the file uses `Prioritized` / `topPrioritized` / something else, keep whatever it uses now. The `sortByStrength` helper can be removed if nothing else uses it (grep first).

### Step 3 — Merged winRate math (same file)

In `analysisSemantics.preference.ts` around lines 167-182, find:

```typescript
const totalBattles = prioritized + deprioritized;
mergedByValue[valueId] = {
  winRate: totalBattles > 0 ? prioritized / totalBattles : 0.5,
  count: { prioritized, deprioritized, neutral },
};
```

Change to:

```typescript
const totalResponses = prioritized + deprioritized + neutral;
mergedByValue[valueId] = {
  winRate: totalResponses > 0 ? prioritized / totalResponses : 0.5,
  count: { prioritized, deprioritized, neutral },
};
```

Rename `totalBattles` → `totalResponses`, include `neutral` in the denominator, fallback stays `0.5`.

### Step 4 — `DomainAnalysis.tsx`

File: `cloud/apps/web/src/pages/DomainAnalysis.tsx`

Find the block around lines 143-146:

```typescript
const winRateMap = new Map(model.values.map((e) => {
  const denom = e.prioritized + e.deprioritized;
  return [e.valueKey, denom > 0 ? (e.prioritized / denom) * 100 : null] as const;
}));
```

Change to:

```typescript
const winRateMap = new Map(model.values.map((e) => {
  const neutral = e.neutral ?? 0;
  const denom = e.prioritized + e.deprioritized + neutral;
  return [e.valueKey, denom > 0 ? (e.prioritized / denom) * 100 : null] as const;
}));
```

Check the actual shape of `e` — if `neutral` is non-optional in the type, drop the `?? 0`. Lines 147-152 (the `supportRate` computation) already include `neutral` in its denominator — use that as the pattern reference.

### Step 5 — `ValuePrioritiesHelpPanel.tsx` copy (broader than just the formula string)

File: `cloud/apps/web/src/components/domains/ValuePrioritiesHelpPanel.tsx`

**Read the full file first.** Lines 27-55 contain FOUR outdated claims, not just the formula string.

1. **Around lines 27-44** — a section describing winRate currently calls it a "conditional win rate" and says something like "shows how often a value wins once the model picks a side". Under the honest denominator, neutrals ARE counted, so both phrases are false. Rewrite the description as: "The fraction of times the model prioritized this value across all decisions, including neutral responses." Remove the word "conditional" from this section entirely. Remove any phrasing about "once the model picks a side".

2. **Line ~40** — the inline formula string. Change `prioritized / (prioritized + deprioritized)` → `prioritized / (prioritized + deprioritized + neutral)`.

3. **Line ~55** — a second formula reference. Change `Win Rate = prioritized / (prioritized + deprioritized) × 100%` → `Win Rate = prioritized / (prioritized + deprioritized + neutral) × 100%`.

4. **Grep for "conditional" in this file** — any other occurrence in the winRate section must be removed. The support-mode section uses a different metric (`supportRate`) — that ONE is still correctly "conditional" (conditioned on model side) and must NOT be touched.

**Preserve JSX structure, className strings, list ordering, and all support-mode content.** Only the winRate-describing copy changes. Read carefully before editing — the exact wording I describe may not match the file verbatim; adapt to what's actually there. The goal is: remove the "conditional" framing from the winRate description and update both formula strings to the honest version.

### Step 6 — Update tests

**`cloud/apps/web/tests/components/analysis-v2/analysisSemantics.test.ts`**

This is the biggest test change in this slice. The bucket fixtures need to be recomputed under the new model-relative logic.

1. Grep for `topPrioritizedValues`, `topDeprioritizedValues`, `neutralValues` to find every assertion.
2. For each test fixture, compute:
   - `modelMean` = average of non-null `winRate` values across all entries in the fixture
   - For each entry, `distance = entry.winRate - modelMean`
   - topPrioritizedValues = entries with `distance > EPSILON`, sorted by distance descending, top 3
   - topDeprioritizedValues = entries with `distance < -EPSILON`, sorted by distance ascending, top 3
   - neutralValues = entries with `|distance| <= EPSILON`, sorted by abs distance ascending, top 3
3. Update the expected values in the assertion.

Add a new test case specifically exercising the "no value above 0.5" scenario (the old logic's big gap):

```typescript
it("uses model-relative mean for bucket assignment", () => {
  // All three winRates are below 0.5 — under the old logic, all three
  // would have landed in topDeprioritized with topPrioritized empty.
  // Under the new logic, modelMean = 0.3, so Gamma (0.4) is relatively
  // prioritized and Alpha (0.2) is relatively deprioritized.
  const fixture = /* byValue: { Alpha: { winRate: 0.2 }, Beta: { winRate: 0.3 }, Gamma: { winRate: 0.4 } } */;
  const result = buildPreferenceViewModel(fixture);
  expect(result.topPrioritizedValues).toEqual([{ name: "Gamma", winRate: 0.4 }]);
  expect(result.topDeprioritizedValues).toEqual([{ name: "Alpha", winRate: 0.2 }]);
  expect(result.neutralValues.map((v) => v.name)).toContain("Beta");
});
```

Adapt the fixture shape and function name (`buildPreferenceViewModel` or whatever the file actually exports) to match the existing tests.

**Other web test files to inspect (grep `winRate:` in each):**

- `cloud/apps/web/tests/components/analysis/OverviewTab.test.tsx:26-27` — extremes (`winRate: 1` and `winRate: 0`). Safe under any bucket logic.
- `cloud/apps/web/tests/components/analysis/AnalysisPanel.test.tsx` — multiple fixtures. For any assertion that checks which bucket a value lands in, recompute under the new model-mean logic.
- `cloud/apps/web/tests/components/analysis/PairedRunComparisonCard.test.tsx:103,111` — `winRate: 0.75` and `winRate: 0.25`. Model mean = 0.5, distances ±0.25. Still land in topPrioritized and topDeprioritized.

**`cloud/apps/web/tests/pages/DomainAnalysisValueDetail.test.tsx`**

Lines 162-176: the `createCondition` helper hand-computes `selectedValueWinRate` with the old denominator. Update to match the new formula. The helper takes `prioritized`, `deprioritized`, and `conditions` (neutral is summed from conditions). New formula: `prioritized / (prioritized + deprioritized + totalNeutral)`.

## Verification commands (run these and report output verbatim)

```bash
cd cloud
npm run lint --workspace @valuerank/web
npm run test --workspace @valuerank/web
npm run build --workspace @valuerank/web
```

All three must pass.

Grep sanity check:

```bash
grep -n "totalBattles" cloud/apps/web/src/ 2>/dev/null || echo "CLEAN: totalBattles gone from web"
grep -n "prioritized + deprioritized)" cloud/apps/web/src/ 2>/dev/null | grep -v "+ neutral" || echo "CLEAN: no bare denominators in web src"
```

Expected: both report CLEAN.

## Success criteria

- [ ] `analysisSemantics.preference.ts` bucket logic uses `modelMean` + signed distance, not 0.5 absolute
- [ ] Null-winRate entries are filtered BEFORE the mean computation
- [ ] Empty-entries case returns empty buckets (no NaN crash)
- [ ] Merged winRate math uses `totalResponses` including neutral
- [ ] `DomainAnalysis.tsx` line ~143 uses the new denominator
- [ ] `ValuePrioritiesHelpPanel.tsx` shows the new formula text
- [ ] `analysisSemantics.test.ts` updated with new expected values + new "all below 0.5" test
- [ ] `DomainAnalysisValueDetail.test.tsx:createCondition` helper updated
- [ ] `npm run lint --workspace @valuerank/web` clean
- [ ] `npm run build --workspace @valuerank/web` clean
- [ ] `npm run test --workspace @valuerank/web` passes

<<<END SLICE 3>>>

---

<<<BEGIN SLICE 4>>>

# Slice 4 — Honest denominator in standalone script + docs

**Model:** `gpt-5.4-mini` (mostly mechanical — script edit + docs text changes)

## Goal

Update `compute_rankings.py` to use the new denominator. Update `docs/features/analysis.md` to reflect the new formula. Add a `winRate` entry to `docs/canonical-glossary.md`.

## Context

This is the last slice — all the code edits in slices 1-3 are done. This slice closes the loop on the standalone script (not part of any deployed process, used by analysts directly) and the documentation.

The `wilson_score_interval` helper in `compute_rankings.py` is a self-contained function and stays — only its `total` input changes to reflect the new denominator.

## Files in scope

- MODIFY:
  - `cloud/scripts/analysis/compute_rankings.py`
  - `docs/features/analysis.md`
  - `docs/canonical-glossary.md` (add new entry)

- DO NOT MODIFY:
  - Any Python worker file (slices 0-1)
  - Any API file (slice 2)
  - Any web file (slice 3)
  - `docs/valuerank_prd.yaml` (verified: no `winRate` references)
  - `docs/values-summary.md` (verified: no `winRate` references)
  - `docs/README.md` (check with a grep before assuming no changes; if no hits, skip)

## Instructions

### Step 1 — `compute_rankings.py`

File: `cloud/scripts/analysis/compute_rankings.py`

Read the file fully first. The function of interest is `compute_win_rates` (plural — despite the name, it iterates per value).

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

Variable rename `total_decisive` → `total_responses`. Neutrals included in both the win-rate formula and the Wilson CI input. `neu` is already in scope at line 87 (`neu = c["neutral"]`) — no extra wiring needed.

**Edit 2 — line 99, rename the output dict key.** In the `rows.append({...})` block, the current field is:

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

This is a CSV schema change — the output column `total_decisive` becomes `total_responses`. The script is a standalone dev script (no production consumers), so this is safe.

**Edit 3 — docstring/comment around line 66.** Update the module-level comment that describes the formula:

```python
# Old: global_win_rate = prioritized / (prioritized + deprioritized)
# New: global_win_rate = prioritized / (prioritized + deprioritized + neutral)
```

**Do not delete `wilson_score_interval`.** It stays — only its `total` input changes.

**No CLI help text to update.** `compute_rankings.py` has no `argparse` — it reads hardcoded `INPUT_CSV` / `OUTPUT_CSV` paths (or equivalents inside `main()`). Do NOT try to run it with `--help`.

### Step 2 — `docs/features/analysis.md` (six sites)

File: `docs/features/analysis.md`

Codex cold-read review found three additional stale references beyond the formula. Handle all six:

1. **Type comment (around line 71).** Currently: `winRate: number; // prioritized / (prioritized + deprioritized)`. Change to: `winRate: number; // prioritized / (prioritized + deprioritized + neutral)`.

2. **`ValueStats` type listing (around lines 72-77).** The doc still declares a `confidenceInterval` field on `ValueStats`. That field no longer exists in the actual TypeScript type after `remove-compare-page` deleted the Wilson CI backend. Before editing, open `cloud/apps/api/src/services/analysis/aggregate/contracts.ts` — the real `zValueStats` schema — and match the doc to whatever shape the code actually has. **Remove the `confidenceInterval` entry from the `ValueStats` type doc.** If there are other stale fields, remove those too.

3. **Narrative section "Win Rate Calculation" (around lines 86-96).** Current text:
   > Win Rate = prioritized / (prioritized + deprioritized)
   > - Neutral responses are excluded from the calculation
   > - Wilson score confidence intervals handle small samples well
   > - Returns 0.5 (neutral) if no data available

   Replace with:
   > Win Rate = prioritized / (prioritized + deprioritized + neutral)
   > - All decided responses, including neutrals, are counted in the denominator
   > - Returns 0.5 (neutral) if no data at all
   > - Returns 0.0 if the value was never prioritized but neutrals were observed

   **Delete the Wilson-score line.** Wilson CI is gone from the backend after `remove-compare-page` merged; this doc should not promise it.

4. **`MethodsUsed` type listing (around lines 184-193).** The doc still declares a `winRateCI: "wilson_score"` field on `MethodsUsed`. Slice 1 removed that key from `build_methods_used()` in the Python worker, so the field does not appear in real output anymore. **Remove the `winRateCI` entry from the `MethodsUsed` type doc.**

5. **Section label "Per-value win rates and CIs" (around lines 317-321).** The "and CIs" suffix is stale — there are no per-value CIs anymore. Change to "Per-value win rates". Hunt for any adjacent narrative that promises CIs and remove those claims too.

6. **Anywhere else in the file** that describes winRate semantics. Grep for `prioritized / (`, `winRate`, `winRateCI`, `confidenceInterval`, `wilson`, and `CI` to catch other occurrences. If any hit still implies the old formula or promises confidence intervals, update or delete.

### Step 3 — `docs/canonical-glossary.md`

File: `docs/canonical-glossary.md`

Verified during exploration: the glossary has no existing `winRate` entry. Add one.

Read the file structure first — the glossary is organized into sections. Insert the new entry into whichever section matches the existing style (alphabetical within a section, or grouped by topic — follow the file's convention).

Suggested content:

> **winRate** — For a (model, value) pair, the fraction of vignettes where the model prioritized that value out of all vignettes where a decision (prioritize, deprioritize, or neutral) was recorded. Formula: `prioritized / (prioritized + deprioritized + neutral)`. Returns 0.5 when there is no data at all. Introduced in this shape in code version 1.2.0 (previously the denominator excluded neutrals).

Adapt the formatting (bullet vs definition list, heading level, etc.) to match the rest of the file.

## Verification commands (run these and report output verbatim)

Static read-back of `compute_rankings.py` (do NOT run it — there's no `--help`, and it would overwrite real CSVs if invoked):

```bash
cd /Users/chrislaw/valuerank/.claude/worktrees/goofy-shtern

grep -n "total_decisive" cloud/scripts/analysis/compute_rankings.py \
  || echo "CLEAN: total_decisive gone"

grep -n "total_responses" cloud/scripts/analysis/compute_rankings.py
# Expected: at least 2 hits — one variable assignment, one output dict key.

grep -n "pri + dep + neu" cloud/scripts/analysis/compute_rankings.py
# Expected: 1 hit.
```

Syntax-check by importing the module:

```bash
python -c "import ast; ast.parse(open('cloud/scripts/analysis/compute_rankings.py').read()); print('OK')"
```

Grep sanity check — zero bare `prioritized / (prioritized + deprioritized)` patterns should remain in the repo after this slice:

```bash
grep -rn "prioritized / (prioritized + deprioritized)" \
  --include="*.md" --include="*.py" --include="*.ts" --include="*.tsx" \
  docs/ cloud/ 2>/dev/null \
  | grep -v "prioritized / (prioritized + deprioritized + neutral)" \
  || echo "CLEAN: no bare denominators left"
```

Expected: "CLEAN: no bare denominators left". If any match is reported, it's a bug — either a missed site or a test fixture that still uses the old formula.

Grep `docs/canonical-glossary.md` for the new entry:

```bash
grep -n "winRate" docs/canonical-glossary.md
```

Must find the new entry.

## Success criteria

- [ ] `compute_rankings.py` uses `total_responses = pri + dep + neu` in both winRate and Wilson CI
- [ ] `compute_rankings.py` output dict key renamed `total_decisive` → `total_responses` (line ~99)
- [ ] `wilson_score_interval` helper is unchanged and still referenced
- [ ] `docs/features/analysis.md` shows new formula at the type comment site (~line 71)
- [ ] `docs/features/analysis.md` `ValueStats` type listing no longer mentions `confidenceInterval` (~lines 72-77)
- [ ] `docs/features/analysis.md` "Win Rate Calculation" narrative (~lines 86-96) uses the new formula and drops the Wilson-score line
- [ ] `docs/features/analysis.md` `MethodsUsed` type listing no longer mentions `winRateCI` (~lines 184-193)
- [ ] `docs/features/analysis.md` label "Per-value win rates and CIs" renamed to "Per-value win rates" (~lines 317-321)
- [ ] `docs/canonical-glossary.md` has a new `winRate` entry matching the new formula
- [ ] Repo-wide grep for bare denominators returns no results
- [ ] `grep total_decisive compute_rankings.py` returns zero hits
- [ ] `python -c "import ast; ast.parse(...)"` parses the script cleanly

<<<END SLICE 4>>>

---

<<<BEGIN SLICE 5>>>

# Slice 5 — Prisma migration: mark-all-superseded for stale `analysis_results` rows

**Model:** `gpt-5.4-mini` (short, mechanical; but per data-critical-waves rule the SQL must be correct for prod)

## Goal

Write a Prisma migration that marks every existing `CURRENT` `basic` or `AGGREGATE` row in the `analysis_results` table as `SUPERSEDED`. After this migration runs on prod, users who view an existing run's analysis page see an empty state and can click the existing "Recompute" button to queue a fresh analysis with the new formula. No code file changes.

## Context

`cloud/apps/api/src/graphql/queries/analysis.ts:17-35` reads the current `AnalysisResult` row by `runId` + `status: 'CURRENT'` alone — it does NOT compare `codeVersion`, and it does NOT re-queue anything. It just returns the latest CURRENT row or `null`. That means bumping `CODE_VERSION` in slice 2 by itself does NOT cause existing runs to recompute. Without this slice, every existing basic/aggregate analysis in prod keeps serving old-formula win rates forever after deploy.

**The fix is a one-shot SQL UPDATE at migration time** that flips every existing `CURRENT` basic/aggregate row to `SUPERSEDED`. The read path then returns null for those runs. The UI (`cloud/apps/web/src/components/analysis/AnalysisPanel.tsx` around lines 155-162) treats `null` as "no analysis computed yet" and shows the existing **manual recompute button**. Clicking it calls the `recomputeAnalysis` mutation at `cloud/apps/api/src/graphql/mutations/analysis.ts:16-132`, which enqueues a fresh analysis job. The job writes a new CURRENT row with the new-formula code.

This is the existing product pattern, NOT an automatic re-queue. Earlier drafts of this spec incorrectly claimed "reads automatically re-queue" — they do not.

Railway runs `prisma migrate deploy` on container startup BEFORE the API server accepts traffic. No manual gate needed.

**User decision already made:** Option B (one-shot mark-superseded migration). See `spec.md` § User decisions already made row 4, and the discussion in `plan.md` § 6b.

**Schema facts verified from `cloud/packages/db/prisma/schema.prisma:681-705`:**

- `model AnalysisResult` has `@@map("analysis_results")` → the underlying table is `analysis_results` (snake_case, lowercase).
- Field `analysisType` has `@map("analysis_type")` → column is `analysis_type` (snake_case).
- Field `status` has NO `@map` → column is literally `status` (lowercase default).
- Field `codeVersion` has `@map("code_version")` → column is `code_version`.
- Field `createdAt` has `@map("created_at")`, `deletedAt` has `@map("deleted_at")`.
- **There is NO `updatedAt` column on this table.** The model has only `createdAt` and `deletedAt`. Do NOT write `"updatedAt" = NOW()`; the column does not exist and the migration will fail.
- `enum AnalysisStatus` has values `CURRENT` and `SUPERSEDED` (uppercase strings, verified at `schema.prisma:702-705`).
- `analysisType` is stored as a **Prisma String**, not an enum. The actual string values written by the application code are:
  - `'basic'` (lowercase) — written at `cloud/apps/api/src/queue/handlers/analyze-basic.ts:167`
  - `'AGGREGATE'` (uppercase) — written at `cloud/apps/api/src/services/analysis/aggregate/aggregate-run-workflow.ts:191`

## Files in scope

- CREATE:
  - `cloud/packages/db/prisma/migrations/<timestamp>_invalidate_stale_winrate_analyses/migration.sql`

- READ (to confirm schema and enum values):
  - `cloud/packages/db/prisma/schema.prisma` (verify lines 681-705 still match the facts above)
  - `cloud/apps/api/src/queue/handlers/analyze-basic.ts` (confirm `analysisType: 'basic'`)
  - `cloud/apps/api/src/services/analysis/aggregate/aggregate-run-workflow.ts` (confirm `analysisType: 'AGGREGATE'`)
  - One recent migration under `cloud/packages/db/prisma/migrations/` for quoting-style reference

- DO NOT MODIFY:
  - `cloud/packages/db/prisma/schema.prisma` (no schema diff — this is a data-only migration)
  - Any code file (lint/build should be unaffected by this slice)
  - Any other migration file

## Instructions

### Step 1 — Re-verify schema details before writing the SQL

Open `cloud/packages/db/prisma/schema.prisma` lines 681-705 and confirm the facts in the Context section still hold:

1. `@@map("analysis_results")` is present on the model.
2. `analysisType String @map("analysis_type")` is present.
3. `status AnalysisStatus @default(CURRENT)` is present with no `@map`.
4. There is NO `updatedAt` field.
5. `enum AnalysisStatus { CURRENT SUPERSEDED }` is present.

If any of those facts have changed since this task spec was written, STOP and report back — the SQL below depends on them being exact.

Also open one existing migration file under `cloud/packages/db/prisma/migrations/` (the most recent one) and note the exact quoting convention. Prisma's generator writes snake_case column names for `@map`-ed fields, so existing migrations will have lines like `"analysis_results"` and `"analysis_type"` — match that style.

### Step 2 — Create the migration folder

From the worktree root, generate an empty migration folder with a Prisma-assigned timestamp. Both `DATABASE_URL` and `DIRECT_URL` are required because `schema.prisma:5-10` declares both; missing either causes Prisma to error before touching the DB.

```bash
cd cloud
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank?pgbouncer=true" \
DIRECT_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank" \
  npx prisma migrate dev \
    --name invalidate_stale_winrate_analyses \
    --schema packages/db/prisma/schema.prisma \
    --create-only
```

The `--create-only` flag writes the folder and an empty `migration.sql` but does not apply it — this is effectively the dry-run stage.

If the command fails because the local dev DB isn't running, run `docker compose up -d` from `cloud/` first. If Prisma refuses to create an empty migration (no schema diff), create the folder and file manually:

```bash
cd cloud
TS=$(date -u +%Y%m%d%H%M%S)
mkdir -p "packages/db/prisma/migrations/${TS}_invalidate_stale_winrate_analyses"
: > "packages/db/prisma/migrations/${TS}_invalidate_stale_winrate_analyses/migration.sql"
```

Either way, you should end up with a path like:

```
cloud/packages/db/prisma/migrations/20260414XXXXXX_invalidate_stale_winrate_analyses/migration.sql
```

### Step 3 — Write the migration SQL

Replace the (empty) `migration.sql` with EXACTLY:

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

**Critical correctness points:**
- Table is `"analysis_results"` (snake_case, mapped via `@@map`). NOT `"AnalysisResult"`.
- Column is `"analysis_type"` (snake_case, mapped via `@map`). NOT `"analysisType"`.
- Column is `"status"` (lowercase, no `@map`).
- There is NO `updatedAt` column. Do NOT include `"updatedAt" = NOW()` — the column does not exist.
- Status values are uppercase: `'CURRENT'` and `'SUPERSEDED'`.
- `analysis_type` string values are `'basic'` (lowercase) and `'AGGREGATE'` (uppercase) — mixed case is correct, matching how the application writes them.

**Do NOT:**
- Add a `code_version` filter to the WHERE clause. We want to mark every existing CURRENT row superseded regardless of its old version string.
- Add a `created_at` date filter. The migration should invalidate everything atomically.
- Touch any analysis type other than `basic` and `AGGREGATE`. If the table has other types (e.g. `dimension`), leave them untouched.
- Write `updatedAt`, `updated_at`, or any similar column — no such column exists on this table.
- Run the migration against prod from this slice. Railway handles deploy-time application automatically.

### Step 4 — Dry-run on the local dev DB

```bash
cd cloud

# Snapshot counts BEFORE (pure psql, no Prisma env vars needed for read):
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

Note the `psql -c` queries use unquoted lowercase identifiers because Postgres folds unquoted names to lowercase and the Prisma `@map` names are already lowercase — no double-quoting needed.

Expected delta:
- `CURRENT` + `basic` count drops to 0.
- `CURRENT` + `AGGREGATE` count drops to 0.
- `SUPERSEDED` counts for both types increase by exactly the amounts the CURRENT rows dropped.
- Other analysis types are unchanged.

If the dev DB has zero rows to begin with (fresh setup), that's fine — the migration applies cleanly and affects zero rows. Note that in your output.

If the migration errors on `column "updatedAt" does not exist` or similar, you have stale SQL — go back to Step 3 and copy the SQL exactly.

If the migration runs but affects zero rows even though the BEFORE snapshot showed CURRENT basic/AGGREGATE rows, the string values are wrong (e.g. prod uses `'BASIC'` uppercase). STOP and report back — do NOT guess.

### Step 5 — Verify against the test DB too

```bash
cd cloud
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test?pgbouncer=true" \
DIRECT_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
  npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

This runs on the test DB, which is what the API integration tests use. Should apply cleanly with no errors.

## Verification commands (run these and report output verbatim)

```bash
cd cloud

# Migration file exists
ls packages/db/prisma/migrations/ | grep invalidate_stale_winrate_analyses

# SQL file contents
cat packages/db/prisma/migrations/*_invalidate_stale_winrate_analyses/migration.sql

# SQL contains the right bits (and does NOT contain updatedAt)
grep -n "UPDATE \"analysis_results\"" packages/db/prisma/migrations/*_invalidate_stale_winrate_analyses/migration.sql
grep -n "\"analysis_type\"" packages/db/prisma/migrations/*_invalidate_stale_winrate_analyses/migration.sql
if grep -qn "updatedAt\|updated_at" packages/db/prisma/migrations/*_invalidate_stale_winrate_analyses/migration.sql; then
  echo "FAIL: updatedAt should not appear in this migration"
  exit 1
fi

# Apply to both DBs (both env vars required)
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank?pgbouncer=true" \
DIRECT_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank" \
  npx prisma migrate deploy --schema packages/db/prisma/schema.prisma

DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test?pgbouncer=true" \
DIRECT_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
  npx prisma migrate deploy --schema packages/db/prisma/schema.prisma

# API test suite still passes
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
JWT_SECRET="test-secret-that-is-at-least-32-characters-long" \
  npm run test --workspace @valuerank/api
```

All must complete without error.

## Success criteria

- [ ] Migration folder exists at `cloud/packages/db/prisma/migrations/<timestamp>_invalidate_stale_winrate_analyses/`
- [ ] `migration.sql` contains `UPDATE "analysis_results" SET "status" = 'SUPERSEDED' WHERE "status" = 'CURRENT' AND "analysis_type" IN ('basic', 'AGGREGATE');`
- [ ] `migration.sql` does NOT contain `updatedAt`, `updated_at`, or `"AnalysisResult"` (PascalCase table name)
- [ ] Table is `"analysis_results"`, column is `"analysis_type"` (both snake_case)
- [ ] `prisma migrate deploy` applies cleanly on both dev and test DBs
- [ ] If dev DB has existing CURRENT basic/AGGREGATE rows, they are SUPERSEDED after migration
- [ ] API test suite still passes against the migrated test DB
- [ ] No code file changes in this slice (lint/build unaffected)

<<<END SLICE 5>>>

---

## Post-slice full preflight gate

After all six slices land, run from `cloud/`:

```bash
npm run lint --workspace @valuerank/shared
npm run lint --workspace @valuerank/db
npm run lint --workspace @valuerank/api
npm run build --workspace @valuerank/api
npm run lint --workspace @valuerank/web
npm run build --workspace @valuerank/web

# Tests require DB:
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
JWT_SECRET="test-secret-that-is-at-least-32-characters-long" \
npm run test --workspace @valuerank/api

npm run test --workspace @valuerank/web

# Python tests:
PYTHONPATH="$(pwd)/workers:$PYTHONPATH" python -m pytest workers/tests/ workers/stats/tests/ -v
```

All must pass before opening the PR.

## Commit plan

Each slice becomes one commit on the feature branch:

| Slice | Commit subject |
|---|---|
| 0 | `winrate-honest-denominator: A — split analyze_basic.py under the file-size limit` |
| 1 | `winrate-honest-denominator: B — honest denominator in the Python worker` |
| 2 | `winrate-honest-denominator: C — honest denominator in the API aggregation + version bumps` |
| 3 | `winrate-honest-denominator: D — honest denominator in web aggregation, buckets, and help copy` |
| 4 | `winrate-honest-denominator: E — honest denominator in standalone script and docs` |
| 5 | `winrate-honest-denominator: F — mark-superseded migration for stale AnalysisResult rows` |

The PR squash-merges into a single commit on main.

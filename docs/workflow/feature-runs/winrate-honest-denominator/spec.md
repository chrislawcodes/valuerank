# Spec: winrate-honest-denominator

**Author:** Claude (Sonnet, 2026-04-14)
**Status:** draft — needs an Opus deep-read pass before plan stage (see § Model Policy)
**Delivery path:** Feature Factory
**Unblocks:** no downstream features explicitly — this is a correctness fix on an analysis primitive
**Prerequisite:** PR #630 merged (`5847c713`) — the adaptive sampler deletion, which removed an ambiguous winRate code path

---

## Problem

Today, ValueRank's `winRate` statistic drops **neutral responses from the denominator**:

```python
# cloud/workers/stats/basic_stats.py:49
def compute_win_rate(prioritized: int, deprioritized: int) -> float:
    total = prioritized + deprioritized              # ← neutrals not counted
    if total == 0:
        return 0.5
    return prioritized / total
```

This means a value that the model treats neutrally 90% of the time and prioritizes the remaining 10% (with 0 deprioritizations) reports **winRate = 1.0**. That is not an honest win rate. It inflates the apparent strength of any value a model rarely takes a strong stance on.

The docstring even calls this out: *"Neutral responses are excluded from the denominator"* — it is a known shortcut, not a bug in implementation. The question is whether the shortcut is correct. The user's answer: **no**.

### Why this matters now

1. **Scientific honesty.** ValueRank's public framing is that winRate measures how often a model prioritizes a value. Excluding neutrals misrepresents that.
2. **Prerequisite for future analysis work.** Several upcoming features (cross-model comparison, value-strength rankings) lean on winRate as a primary ordering key. Fixing it now avoids rebuilding those features later.
3. **Wilson CI is also wrong.** `compute_value_stats` passes the same truncated `total` into `wilson_score_ci(prioritized, total, confidence)`. A smaller total inflates CI width in one direction (fewer samples) but the successes-over-total shape is also wrong. Fixing winRate means fixing the CI inputs in the same commit.

---

## Goal

**Single honest formula, consistent everywhere:**

```
winRate = prioritized / (prioritized + deprioritized + neutral)
```

- Applied in every winRate computation site (Python stats worker, API aggregation, web aggregation mirror, standalone scripts, MCP export).
- Applied to historical data via a backfill (user decision: **Option C**, backfill everything so old runs stay consistent with new runs).
- Wilson score CI uses the same `total = prioritized + deprioritized + neutral` so the CI reflects actual sample size.
- UI copy, tooltips, help text, and canonical docs updated so the displayed number matches the new definition.

---

## Non-goals

- No change to how decisions are classified as prioritized/deprioritized/neutral. The upstream labeling is untouched.
- No change to `overall.mean` or other per-model aggregates that are not winRate.
- No new UI features, new columns, or new views. This is a semantics fix, not a product feature.
- No rework of the `compute_rankings.py` script's non-winRate outputs.
- No changes to `.gitignore` or CI config.
- No reopening of PR #627 (`fix(overview): show win rate for neutral preferred values`) — that fix is independently correct and stays.

---

## User decisions already made

| # | Question | Decision |
|---|---|---|
| 1 | Formula | Strict `prioritized / (prioritized + deprioritized + neutral)` |
| 2 | Historical data | **Option C** — backfill so every run uses the new formula; no split-brain |
| 3 | Scope | Everywhere winRate is used, including stats, for consistent semantics |

---

## Affected surfaces — enumerated

Grepped `cloud/` and `docs/` for `winRate|win_rate` and reviewed each hit. Below is the full list of what changes.

### Python stats worker (source of truth)

| File | What changes |
|---|---|
| `cloud/workers/stats/basic_stats.py` | `compute_win_rate(prioritized, deprioritized, neutral)` — add `neutral` param, change denominator. `compute_value_stats` — pass new total to `wilson_score_ci`. Update docstrings. |
| `cloud/workers/stats/tests/test_basic_stats.py` | All existing tests for `compute_win_rate` and `compute_value_stats` — rewrite expected values. Add new cases: all-neutral, mostly-neutral, zero-neutral-regression (old behavior still holds). |

### API-side TypeScript aggregation (used by GraphQL resolvers)

| File | What changes |
|---|---|
| `cloud/apps/api/src/services/analysis/aggregate/aggregate-logic.ts` | Lines ~123-171 — `target.winRate = totalWins / totalBattles`. Rename `totalBattles` → `totalResponses` and include neutrals. Update `winRateMean`, `winRateSem`, `winRateSd` derivations so they're consistent with the new denominator. |
| `cloud/apps/api/src/services/analysis/aggregate/__tests__/*.test.ts` | Fixture expectations. |

### Web-side TypeScript aggregation (mirror of API-side)

| File | What changes |
|---|---|
| `cloud/apps/web/src/services/AggregateAnalysisService.ts` | Line ~188 — same `totalWins / totalBattles` pattern. Keep in lockstep with API file. |
| `cloud/apps/web/src/services/__tests__/AggregateAnalysisService.test.ts` | Fixtures. |

> **Risk:** these two aggregation files were identical logic duplicated across API and web. The plan stage must decide whether this spec also extracts them into a shared `packages/shared` helper, or keeps them duplicated and adds a checklist item in closeout to verify both were updated. Recommendation: do **not** extract in this feature — it doubles the surface area and risk. Keep them duplicated, tag the commit message, and add a follow-up issue.

### Web UI v2 — CRITICAL semantics risk

| File | What changes |
|---|---|
| `cloud/apps/web/src/components/analysis-v2/analysisSemantics.preference.ts` | Lines 101-115 — hardcoded `0.5` thresholds for "prioritized / neutral / deprioritized" buckets. **After the formula change, 0.5 is no longer the neutral baseline.** See § Risk below for the redesign options. |
| `cloud/apps/web/src/components/analysis-v2/__tests__/*.test.ts(x)` | Fixtures and snapshot tests. |
| `cloud/apps/web/src/components/analysis-v2/AnalysisOverview.tsx` (and siblings) | Tooltips and help strings that reference winRate semantics. |

### Overview / older analysis surfaces

| File | What changes |
|---|---|
| `cloud/apps/web/src/components/analysis/AnalysisOverview.tsx` | Tooltip / label copy updates. No logic — it reads whatever the backend sends. |
| `cloud/apps/web/src/components/analysis/*.tsx` | Any rendered "Win Rate" column header or tooltip. |

### Standalone scripts — easy to miss

| File | What changes |
|---|---|
| `cloud/scripts/analysis/compute_rankings.py` | Lines 60-116 — this script has its **own** `compute_win_rates` implementation of the old formula and writes `win-rate-rankings.csv`. Must be updated in the same feature or outputs silently diverge. |

### MCP export surface (external-facing)

| File | What changes |
|---|---|
| `cloud/apps/api/src/mcp/tools/export-pairwise-outcomes.ts` | Lines ~208, ~212 — `valueAWinRate` / `valueBWinRate` field values. Downstream user scripts and analyses may depend on this export format. **Add a note to the MCP tool description so callers know the semantics changed.** Do not rename the field. |
| `cloud/apps/api/src/mcp/tools/__tests__/*.test.ts` | Expected values in export tests. |

### GraphQL schema

- Fields keep their names. No schema change. Only resolver math changes.
- Codegen rerun to pick up any comment/description changes.

### Historical data — the backfill

| Target | Action |
|---|---|
| `RunSummary` JSON blobs in `runs` table (or wherever aggregated results persist) | Recompute from stored transcripts. |
| `analysis-cache` | Invalidate. Let the next request recompute under the new formula. |
| `domain-analysis-freshness-cache` | Invalidate. |
| Any precomputed rankings in CSVs under `cloud/scripts/analysis/output/` (if tracked) | Rerun the script and commit updated CSVs, OR delete and regenerate on-demand. Plan stage decides. |

**Data-critical-waves compliance is mandatory** (see `docs/workflow/rules/data-critical-waves.md`):

1. Backfill script must have a `--dry-run` mode that prints first N rows of old vs new winRate and counts of changed rows.
2. Use production-shaped fixtures (real `prioritized/deprioritized/neutral` triples pulled from a prod snapshot, not idealized schema).
3. Dry-run output must be reviewed by the human before live prod execution.
4. Live execution must happen in a controlled window with rollback steps documented.
5. Post-deploy verification checklist: row counts pre/post, spot-check 3 random runs against hand-computed winRate, watch for error spikes for 10 minutes.

### Canonical docs & glossary

| File | What changes |
|---|---|
| `docs/values-summary.md` | If it defines winRate, update the definition. |
| `docs/valuerank_prd.yaml` | If it defines winRate, update the definition. |
| `docs/canonical-glossary.md` | Add or update the `winRate` entry to state the new formula explicitly. |
| `docs/README.md` (architecture overview) | Only if it mentions winRate formula. |

---

## Critical risk — the 0.5 threshold

`analysisSemantics.preference.ts` uses `winRate > 0.5 + EPSILON` to bucket a value as "top prioritized", `< 0.5 - EPSILON` as "top deprioritized", and `≈ 0.5` as "neutral".

**Under the current formula**, 0.5 really is the neutral baseline: a value prioritized as often as it is deprioritized scores 0.5. After the denominator change, **this is no longer true**. A value the model takes a strong "prioritize" stance on half the time and is neutral the other half will now score `0.5 * (0.5 / (0.5+0+0.5)) = ...` — in general, the 0.5 line becomes meaningless because the neutral baseline depends on the ratio of neutrals in the data for that (model, value) pair.

### Options for the bucket logic

| Option | Approach | Trade-off |
|---|---|---|
| A | Compare each value's winRate to the **model's mean winRate** across all values. Top/bottom 3 by distance from the model's mean. | Always produces 3 top + 3 bottom. No absolute "prioritized" meaning — a value is only "strongly prioritized" relative to the model. |
| B | Use a significance test — bucket is "prioritized" if the Wilson CI lower bound > baseline (e.g., 1/N or the model's mean). | Honest statistical definition. May produce empty buckets for models with small samples. |
| C | Compare to a fixed baseline = expected value under uniform random labeling, i.e. `1/3` if neutral is equally likely as prioritized and deprioritized. | Simple, interpretable. Assumes a 3-way uniform prior that may not match real data. |
| D | Sort by winRate descending and take top 3, bottom 3, regardless of thresholds. | Simplest. Produces "top prioritized" and "bottom prioritized" labels that are always relative. |

**Recommendation:** Option A (model-relative) — it's the most defensible without extra statistical assumptions, doesn't require UI to change bucket count, and degrades gracefully when a model has weak or missing data.

**This is a spec decision the human needs to confirm before plan stage.** Flagging as a blocking question for the Opus spec review pass.

---

## Wilson CI consequence

`wilson_score_ci(successes, total, confidence)` — both arguments change:

- **Old:** `successes = prioritized`, `total = prioritized + deprioritized`
- **New:** `successes = prioritized`, `total = prioritized + deprioritized + neutral`

Consequences:

1. The point estimate drops toward `prioritized / (total including neutrals)`.
2. The CI width **narrows** for any value with non-zero neutrals, because `total` grows. This is correct — we actually have more data per value than the old formula pretended.
3. For values where `prioritized + deprioritized = 0` but `neutral > 0`, the old code returned "no data" (full 0-to-1 CI). The new code will return `winRate = 0`, with a Wilson CI anchored at 0. **Decide in plan stage whether this is desirable** — arguably this is correct (we DO have data; the model just never prioritized this value).

---

## Verification plan

At each stage, the factory's standard preflight runs; additionally:

### Python stats (slice ~A)
- `pytest cloud/workers/stats/tests/test_basic_stats.py` — all new and updated cases pass.
- Specifically verify the all-neutral case: `compute_win_rate(0, 0, neutral=100) == 0.0` (not 0.5).
- Specifically verify the zero-neutral case still matches old behavior: `compute_win_rate(3, 1, neutral=0) == 0.75`.

### API aggregation (slice ~B)
- `npm run test --workspace @valuerank/api` — all existing tests pass after fixture updates.
- New test: an aggregation fixture with neutrals produces the expected winRateMean and winRateSem.

### Web aggregation mirror (slice ~C)
- `npm run test --workspace @valuerank/web` — all existing tests pass.
- Explicit test that API and web aggregators produce identical winRate for the same input (duplicated logic must stay in lockstep).

### UI semantics redesign (slice ~D)
- New tests for `analysisSemantics.preference.ts` covering the chosen bucket option (A/B/C/D).
- Snapshot updates for affected v2 components.

### Backfill dry-run (slice ~E)
- `python cloud/scripts/analysis/compute_rankings.py --dry-run` on a prod snapshot.
- Output: table of "first 20 rows, old winRate → new winRate", total rows changed count.
- **Human review required** before live execution.

### Backfill live (slice ~F — gated on human approval)
- Run against prod read replica first if available.
- Run against prod primary.
- Post-run: spot-check 3 random runs by hand.
- Invalidate `analysis-cache` and `domain-analysis-freshness-cache`.

### Full preflight gate
All 8 commands from `cloud/CLAUDE.md` pass, including `npm run test --workspace @valuerank/api` and `npm run test --workspace @valuerank/web`.

### Manual smoke (before merge)
- Load analysis view for a run with known neutral values. Verify winRate matches hand calculation.
- Verify the v2 "top prioritized" / "top deprioritized" / "neutral" buckets are non-empty and make sense under the new bucket logic.
- Verify the MCP `export_pairwise_outcomes` tool returns new-formula values.

---

## Rollback plan

1. Revert the merge commit. Because the Python, API, web, and UI changes are all in one PR, a single revert restores pre-feature behavior.
2. **The backfill is NOT automatically reversible.** The old winRate values are gone from persisted caches and blobs. Rollback of code will re-derive on demand and match the old formula again, but any persisted `RunSummary` blobs written during the backfill window will contain new-formula values that no longer match the reverted code.
3. Mitigation: the backfill script must write a sidecar file `cloud/scripts/analysis/output/backfill-<timestamp>.jsonl` containing `{runId, oldWinRate, newWinRate}` tuples so a reverse backfill is possible if needed.

---

## Out of scope (intentional)

- Rewriting the analysis pipeline to treat neutrals as first-class instead of a missing value.
- Introducing a "neutrality rate" secondary metric alongside winRate (interesting idea, separate feature).
- Extracting `aggregate-logic.ts` into `packages/shared` (see § Affected surfaces note).
- Reopening the debate on whether winRate is the right top-line metric (separate product discussion).
- Any changes to `.gitignore`, CI config, or test infrastructure.
- Any changes to how the feature-factory workflow itself operates.

---

## Follow-ups (after this ships)

1. **Consider a "neutralityRate" metric** — the fraction of neutral responses per (model, value). It's now trivially derivable and would be a clean companion to winRate.
2. **Consolidate API and web aggregation** — deduplicate `aggregate-logic.ts` / `AggregateAnalysisService.ts` into a shared package. Out of scope here to keep the diff small and reviewable.
3. **Add a CI check** — lint rule or test that fails if any new `prioritized / (prioritized + deprioritized)` pattern is added to the codebase. Prevents regression.

---

## Model Policy (stage-by-stage)

> This feature touches a correctness primitive, a backfill of historical data, and downstream UI that has a non-obvious semantic risk (the 0.5 threshold). The spec and plan stages are the highest-risk writing; everything after is mechanical execution. Claude-Sonnet is safe for mechanical stages; Claude-Opus should own the risky thinking.

| Stage | Model | Why |
|---|---|---|
| **Spec authoring** | **Opus** | Enumerating every winRate consumer, designing the backfill, and judging the 0.5-threshold redesign are high-risk writing. This draft was written by Sonnet as a starting point — **Opus must do a deep-read review before the spec checkpoint closes.** |
| **Spec review reconciliation** | **Opus** | Resolving adversarial findings correctly requires judgment on the backfill strategy and the bucket-redesign options. Do not delegate. |
| **Plan authoring** | **Opus** | Slice ordering has real consequences — e.g. the web aggregation mirror must land in the same PR as the API aggregation change, not a later slice. Backfill sequencing is data-critical. |
| **Plan review reconciliation** | **Opus** | Same. |
| **Tasks authoring** | **Sonnet** | Once the plan is locked, decomposing into tasks is mostly pattern-matching against the last feature run's task shape. |
| **Tasks review reconciliation** | **Sonnet** | Same. |
| **Slice dispatch to Codex** | **Sonnet** | Mechanical: write Codex spec, dispatch, verify. Follows the same template used in `remove-final-trial-sampler`. |
| **Backfill dry-run execution** | **Sonnet + mandatory human review of output** | Sonnet runs the dry-run script and formats the diff. The human reads the diff. Do not proceed without explicit approval. |
| **Backfill live execution** | **Human-gated** | Sonnet runs the commands; human holds the go/no-go. |
| **Preflight / CI / ship** | **Sonnet** | Mechanical, same as every other feature run. |
| **Closeout** | **Sonnet** | Mechanical summary. |

### Why this split

- **Opus-worth-it moments:** (1) spotting the 0.5-threshold risk in `analysisSemantics.preference.ts`, (2) designing a rollback-safe backfill, (3) deciding whether the Wilson CI change is desirable, (4) ordering slices so the API and web aggregation stay in lockstep.
- **Sonnet-is-fine moments:** writing Codex specs, running tests, formatting closeout reports, dispatching slices once the plan is locked.

### Enforcement

- The Opus review pass on this spec must confirm: (a) the § Critical risk section is complete, (b) the bucket redesign option is chosen, (c) the backfill rollback plan is acceptable, (d) no winRate consumer is missing from the enumeration. Only after those four confirmations does the spec checkpoint close.
- If Sonnet is mid-stage and hits a question that requires Opus judgment, **stop and ask the human to switch models**. Do not guess and continue.

---

## Blocking questions for the Opus spec-review pass

1. **Which bucket-redesign option** (A model-relative, B significance test, C fixed 1/3 baseline, D pure top/bottom 3) does the human want in `analysisSemantics.preference.ts`?
2. **Is the Wilson CI behavior change desirable** — specifically, the case where `prioritized + deprioritized = 0` but `neutral > 0` flips from "no data, full 0-to-1 CI" to "winRate = 0, Wilson CI anchored at 0"?
3. **Should `aggregate-logic.ts` and `AggregateAnalysisService.ts` be consolidated** in this feature, or kept duplicated with a follow-up issue? (Recommendation: duplicated + follow-up.)
4. **Does the backfill need a sidecar reverse-diff file** for hypothetical rollback? (Recommendation: yes.)
5. **Is there a prod snapshot available** for the dry-run to run against, or does the plan stage need to define how to obtain one?

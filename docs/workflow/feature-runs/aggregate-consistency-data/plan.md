# Implementation Plan: Aggregate Pipeline — Consistency Data Emission

**Branch:** `claude/aggregate-consistency-data` | **Date:** 2026-04-19
**Spec:** `docs/workflow/feature-runs/aggregate-consistency-data/spec.md`

## Summary

Extend the Python aggregate worker to emit two new sub-sections of `reliabilitySummary.perModel[modelId]`:
1. **`perScenario[scenarioId]`** with `{ trials, matches }` — unblocks Repeatability.
2. **`perPair[valueKey]`** with `{ targetAnalysisRunId, targetCompanionRunId, primaryConditionIds, companionConditionIds, perCondition: [...] }` — unblocks Coherence.

All underlying data is already computed inside `cloud/workers/stats/variance_analysis.py`; the work is teaching `cloud/workers/analyze_basic_aggregation.py::build_reliability_summary` to surface it, extending the TypeScript Zod contract, and shipping a backfill CLI.

Two PRs, three slices. Backfill ships in PR2 so existing `AGGREGATE` rows can be upgraded in one pass.

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.codex.dependency-order-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: HIGH F-01 (ZeroDivisionError): made the denominator literal max(..., 1) in task B1 — prevents crash explicitly. HIGH F-02 (int cast on non-numeric): added defensive isinstance(raw_sample_count, int) guard in task A1. MEDIUM F-03 (idempotency single-model): detectUpgraded now checks Object.values(perModel).some(...) rather than just the first model. MEDIUM F-04 (non-canonical label): task B1 now specifies explicit _CANONICAL_APPEAL_LEVEL.get(...) with null-coalescing instead of relying on invariant. LOW F-05 (CI blind spot): acknowledged residual risk; task A3 scouts CI before merge. LOW F-06 (perPair-only parse): task B4b now covers all four compatibility states including perPair-only.

## Technical Context

| Aspect | Detail |
|---|---|
| Primary language | Python 3 (worker) + TypeScript (Zod contract, CLI) |
| Worker entry | `cloud/workers/analyze_basic.py::analyze_basic()` → calls `build_reliability_summary` |
| Emission site | `cloud/workers/analyze_basic_aggregation.py::build_reliability_summary` (line 276) |
| Input data | `variance_analysis['perModel'][modelId]['perScenario']` already carries `sampleCount`, `directionCounts`, `direction`, `directionalAgreement` |
| Zod contract | `cloud/apps/api/src/services/analysis/aggregate/contracts.ts:197` |
| Tests | `cloud/workers/tests/test_analyze_basic.py` has existing `reliabilitySummary` assertions |
| DB shape | `reliabilitySummary` stored as raw JSON in `AnalysisResult.output`; no DB schema change |
| Backfill host | TypeScript CLI under `cloud/apps/api/src/cli/`, invokes the existing Node worker-dispatcher path |
| Performance target | O(1) extra work per scenario (bucket-count math); backfill < 30 min on prod |

---

## Architecture Decisions

### Decision 1: Emit new fields inside `build_reliability_summary`, not a new top-level key

**Chosen:** Extend the existing `perModel[modelId]` dict with `perScenario` and `perPair`. No new top-level key like `consistencySummary`.

**Rationale:**
- The Consistency resolver parser already reads from `reliabilitySummary.perModel[modelId]` and expects `perScenario` and `perPair` as nested keys (see `cloud/apps/api/src/services/consistency/modelsConsistencyData.ts::readConsistencySummary`).
- Keeps the contract surface narrow; one Zod schema extension covers both PRs.
- Downstream readers that only consume `baselineReliability`/`directionalAgreement`/`coverageCount` continue to work — the new keys are additive and optional.

### Decision 2: Single-trial scenarios are silently omitted from `perScenario`

**Chosen:** Only emit `perScenario[scenarioId]` entries when `sampleCount >= 2` (spec FR-001).

**Rationale:**
- A scenario with `n = 1` has zero Bernoulli pairs (`C(1, 2) = 0`).
- Emitting `{trials: 0, matches: 0}` would crash the resolver's Wilson CI (divide-by-zero); emitting `{trials: 1, matches: 1}` would falsely promote single-trial scenarios to the scatter (spec HIGH-F01 fix).
- Missing entries are the unambiguous signal for "no Bernoulli coverage for this scenario."

### Decision 3: `matches` via O(k) bucket-count formula

**Chosen:** `matches = sum_i C(c_i, 2)` where `c_i` are the 5 canonical bucket counts.

**Rationale:**
- Mathematically equivalent to enumerating pairs (spec FR-002a).
- O(5) per scenario instead of O(n²). Guaranteed constant-time regardless of trial count.
- `directionCounts` already carries the 5-bucket vector — zero new computation; just read-and-sum.

### Decision 4: `winRate` uses orientation-normalized `directionCounts`

**Chosen:** `winRate = (directionCounts.strongly + directionCounts.somewhat) / max(sampleCount − directionCounts.neutral, 1)`.

**Rationale:**
- `directionCounts` is already orientation-normalized upstream (`resolveTranscriptDecisionModel` handles `orientationFlipped` before bucket assignment per `cloud/workers/stats/variance_analysis.py:229`).
- `strongly` / `somewhat` always mean "favor the target value" regardless of original `A→B` vs `B→A` direction.
- The `max(..., 1)` protects against all-neutral scenarios; the numerator is 0 in that case so `winRate = 0` correctly signals no directional signal.

### Decision 5: `perPair` is keyed by `valueKey` alone (not `{domainId, valueKey}`)

**Chosen:** A single `AGGREGATE` analysis row corresponds to a single definition, which is one `(domain, valueKey)` pair. So within one `reliabilitySummary`, `valueKey` alone is unique.

**Rationale:**
- Matches the resolver's expectation (`modelsConsistencyData.ts::parsePairList` keys by `valueKey`).
- If the worker were ever changed to aggregate multiple definitions per row, we'd revisit; not a concern at current scope.

### Decision 6: Backfill is a TypeScript CLI that re-enqueues aggregation jobs

**Chosen:** Create `cloud/apps/api/src/cli/backfill-aggregate-consistency.ts` that:
1. Queries every `AnalysisResult` with `status = 'CURRENT'` and `analysisType = 'AGGREGATE'`.
2. Skips rows whose `output.reliabilitySummary.perModel[<any-model>].perScenario` is already present (idempotency).
3. Calls the existing `triggerAggregateRun(runId)` helper, which enqueues the aggregation job via PgBoss and handles `CURRENT`→`SUPERSEDED` atomically (spec FR-008a).
4. Logs each row's outcome (`upgraded`, `skipped`, `failed`) and prints a summary at end.

**Rationale:**
- Reuses the established `CURRENT`/`SUPERSEDED` transition logic; no new transactional code paths.
- Pattern matches existing CLI entries like `cloud/apps/api/src/cli/create-user.ts` and `normalize.ts`.
- Atomic CURRENT→SUPERSEDED inside the worker serializes backfill writes against any live aggregate runs that happen to race (spec FR-008a).

### Decision 7: Contract change preserves backward compatibility

**Chosen:** Extend `zModelReliabilitySummary` in `contracts.ts` with `perScenario` and `perPair` fields marked `.optional()` so historical rows missing those fields continue to validate.

**Rationale:**
- Pre-backfill rows won't have the new fields. The Consistency resolver already treats missing fields as "insufficient coverage" gracefully.
- Avoids a breaking contract change that would force simultaneous backfill + deploy.

---

## Implementation Slices

### Slice A — PR1: per-scenario matches/trials [CHECKPOINT]
Estimated diff: ~150 lines.

**Files:**
- `cloud/workers/analyze_basic_aggregation.py` (~30 lines added, inside `build_reliability_summary`)
- `cloud/workers/tests/test_analyze_basic.py` (~80 lines added)
- `cloud/apps/api/src/services/analysis/aggregate/contracts.ts` (~15 lines added — extend Zod schema with optional `perScenario`)
- `cloud/apps/api/tests/services/analysis/aggregate/contracts.test.ts` (if present; else create) — ~25 lines

**Python changes in `build_reliability_summary`:**
```python
# After the existing per-model loop builds its summary, also build per-scenario map
per_scenario_bernoulli: dict[str, dict[str, int]] = {}
for scenario_id, stats in per_scenario.items():
    sample_count = int(stats.get("sampleCount", 0))
    if sample_count < 2:
        continue  # FR-001: skip single-trial scenarios
    bucket_counts = stats.get("directionCounts") or {}
    trials = sample_count * (sample_count - 1) // 2
    matches = sum(c * (c - 1) // 2 for c in bucket_counts.values() if isinstance(c, int))
    per_scenario_bernoulli[scenario_id] = {"trials": trials, "matches": matches}

per_model_summary[model_id]["perScenario"] = per_scenario_bernoulli
```

**Test coverage (`test_analyze_basic.py`):**
- Scenario with 4 trials all same bucket → `trials=6, matches=6`
- Scenario with 4 trials split 2/2 → `trials=6, matches=2`
- Scenario with 1 trial → omitted
- Scenario with all-neutral trials → `trials >= 1, matches = C(n,2)` (bucket still counts)
- Existing `baselineReliability`/`directionalAgreement`/`coverageCount` values unchanged

**Slice A checkpoint.** Ship as PR1. After it merges and deploys, new AGGREGATE runs start emitting the field; old rows still work through backward-compatible contract.

---

### Slice B — PR2: perPair with Coherence ingredients [CHECKPOINT]
Estimated diff: ~220 lines.

**Files:**
- `cloud/workers/analyze_basic_aggregation.py` (~80 lines added — new helper `_build_per_pair_summary` + wiring)
- `cloud/workers/tests/test_analyze_basic.py` (~100 lines added)
- `cloud/apps/api/src/services/analysis/aggregate/contracts.ts` (~25 lines — extend Zod with optional `perPair`)
- `cloud/apps/api/tests/services/analysis/aggregate/contracts.test.ts` — ~20 lines

**Python changes:**

New helper `_build_per_pair_summary(variance_analysis, run_context) -> dict`:

```python
def _build_per_pair_summary(
    variance_analysis: dict, run_context: dict
) -> dict[str, dict[str, Any]]:
    """
    Build per-value-pair Coherence ingredients keyed by valueKey.
    run_context carries: valueKey, targetAnalysisRunId, targetCompanionRunId,
    primaryConditionIds, companionConditionIds.
    """
    value_key = run_context["valueKey"]
    per_pair: dict[str, dict[str, Any]] = {}

    per_condition = []
    for scenario_id, stats in variance_analysis.get("perModel", {}).items():
        # ... (see full pseudocode below)
        ...

    per_pair[value_key] = {
        "targetAnalysisRunId": run_context["targetAnalysisRunId"],
        "targetCompanionRunId": run_context.get("targetCompanionRunId"),
        "primaryConditionIds": run_context["primaryConditionIds"],
        "companionConditionIds": run_context["companionConditionIds"],
        "perCondition": per_condition,
    }
    return per_pair
```

Each `perCondition` entry:
```python
{
    "scenarioId": scenario_id,
    "netPressureRank": net_pressure_rank,  # target_appeal - opposing_appeal, int or None
    "winRate": win_rate,  # per FR-006 formula
    "matches": matches,   # reuse Slice A bucket-count math
    "trials": trials,
}
```

`net_pressure_rank` mapping in a small constant (spec FR-005, Decision 4):
```python
_CANONICAL_APPEAL_LEVEL = {
    "strongly": 2, "somewhat": 1, "neutral": 0,
    "opponentSomewhat": -1, "opponentStrongly": -2,
}
```

Run context sourcing: `run_context` comes from the worker's input payload which already has the run's configuration metadata. Specifically:
- `valueKey`, `targetAnalysisRunId`, `primaryConditionIds` — from `run_context["runId"]` + definition/scenario mapping already accessible to the worker.
- `targetCompanionRunId`, `companionConditionIds` — from the `companionRunId` relationship on the run record, already exposed in `aggregate_semantics` input.

**Test coverage:**
- 5-condition scenario with canonical labels → correct `netPressureRank` per condition
- Mixed canonical + non-canonical labels → non-canonical condition gets `netPressureRank: null`
- All-neutral scenario → `winRate: 0` with `denom` forced to 1
- Scenario with no non-neutral trials → `winRate = 0`, entry still emitted
- Pair with zero conditions → `perPair[valueKey]` exists but `perCondition: []`

### Slice C — Backfill CLI (bundled with PR2)
Estimated diff: ~130 lines.

**Files:**
- `cloud/apps/api/src/cli/backfill-aggregate-consistency.ts` (new, ~100 lines)
- `cloud/apps/api/tests/cli/backfill-aggregate-consistency.test.ts` (new, ~40 lines)
- `cloud/apps/api/package.json` (1 line — add `backfill:aggregate-consistency` script entry)

**CLI logic (pseudocode):**
```typescript
async function main() {
  const args = parseArgs();  // --dry-run, --definition-id <id>, --domain-id <id>
  const rows = await db.analysisResult.findMany({
    where: {
      status: 'CURRENT',
      analysisType: 'AGGREGATE',
      ...(args.definitionId ? { run: { definitionId: args.definitionId } } : {}),
      ...(args.domainId ? { run: { definition: { domainId: args.domainId } } } : {}),
    },
    select: { id: true, runId: true, output: true },
  });

  for (const row of rows) {
    const alreadyUpgraded = detectUpgraded(row.output);
    if (alreadyUpgraded) {
      log.info({ runId: row.runId }, 'backfill:skipped (already upgraded)');
      continue;
    }
    if (args.dryRun) {
      log.info({ runId: row.runId }, 'backfill:would-upgrade');
      continue;
    }
    try {
      await triggerAggregateRun(row.runId);  // existing helper
      log.info({ runId: row.runId }, 'backfill:upgraded');
    } catch (err) {
      log.error({ runId: row.runId, err }, 'backfill:failed');
    }
  }
}

function detectUpgraded(output: unknown): boolean {
  // Walk output.reliabilitySummary.perModel[<any>].perScenario existence
  const summary = (output as any)?.reliabilitySummary?.perModel;
  if (!summary || typeof summary !== 'object') return false;
  const firstModel = Object.values(summary)[0] as any;
  return firstModel?.perScenario != null || firstModel?.perPair != null;
}
```

**Test coverage:**
- Dry-run path lists rows without calling `triggerAggregateRun`
- Rows already upgraded are skipped
- `triggerAggregateRun` is called exactly once per eligible row
- Failed runs are logged and the loop continues
- `--definition-id` and `--domain-id` filters narrow the row set

**Slice B + C checkpoint.** Ship as PR2. Once merged and deployed, run `npm run backfill:aggregate-consistency` against staging, then production. Consistency report renders end-to-end.

---

## Parallelization Opportunities

| Opportunity | Safe? |
|---|---|
| Slice A Python changes + contract update | yes — disjoint files, same slice |
| Slice B perPair logic + backfill CLI (Slice C) | yes — disjoint files, but semantic dependency: CLI needs PR2's emission shape to test against. Run CLI tests after PR2's worker tests. |
| Slice A ↔ Slice B | no — PR2 extends the same Zod schema PR1 modifies; sequence them |

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `directionCounts` keys could drift from the 5-canonical set if upstream decision-model logic changes | Spec lists non-canonical label handling (`netPressureRank: null`); worker emits the entry but the resolver filters it. Unit test uses an unknown label and asserts `null`. |
| Backfill on production might be slow if there are many rows or `triggerAggregateRun` has high latency | CLI supports `--definition-id` / `--domain-id` filters for staged rollout; run staging first with time measurement. |
| Concurrent aggregate worker + backfill could try to supersede the same row | Existing CURRENT→SUPERSEDED transition is atomic (spec FR-008a); the later writer aborts cleanly. Verified via integration test. |
| `triggerAggregateRun` signature could change | Plan references the helper but pins the test fixture, so schema drift surfaces in tests. |
| Python worker tests don't run in TypeScript CI | Need a Python test job or invoke pytest in the existing workflow. Check `cloud/workers/tests/` pytest config before merging Slice A. |

---

## Testing Strategy

**Python (`cloud/workers/tests/test_analyze_basic.py`):**
- Extend existing fixtures to assert new `perScenario[scenarioId].trials/matches` keys.
- Add fixtures for per-pair content once Slice B lands.
- Keep existing `baselineReliability` assertions — they must remain bit-identical.

**TypeScript — contract tests:**
- Extend `contracts.test.ts` (create if missing) to verify the Zod schema accepts rows with new fields AND rows without them.

**TypeScript — CLI tests:**
- Mock `db.analysisResult.findMany` and `triggerAggregateRun`.
- Cover happy path, already-upgraded skip, failure-logs-and-continues, dry-run.

**Integration (optional, not v1 scope):**
- Run the full worker end-to-end against a fixture `AnalysisResult` row and diff the emitted JSON against expected output.

---

## Rollout

1. **PR1 (Slice A)**: merge → deploy → new AGGREGATE runs carry `perScenario`. Run backfill (from Slice B's CLI, deployed later) when PR2 lands.
2. **PR2 (Slice B + C)**: merge → deploy → run `npm run backfill:aggregate-consistency --dry-run` on staging, inspect log, then run without `--dry-run`.
3. Smoke-check `/models/consistency` on staging. Confirm scatter + table + drill-down render non-empty.
4. Run backfill on production with `--domain-id` staged rollout: pick one domain, verify, repeat for the others.

No feature flag needed — shapes are additive and opt-in via the resolver's existing graceful-degrade.

---

## Open Items Deferred to Tasks Phase

1. Whether Python worker tests run in CI today or need a new job. Check first; may need a small CI config addition bundled with Slice A.
2. Exact `run_context` threading: where does the worker currently receive `primaryConditionIds` / `companionConditionIds`? Scout during Slice B task authoring; likely via `aggregate_semantics.plannedScenarioIds` + the definition's scenario ordering.
3. CLI argument naming — `--definition-id` vs `--definition`; match existing CLI style in `normalize.ts`.

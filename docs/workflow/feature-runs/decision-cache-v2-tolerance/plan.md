# Plan: Canonical Decision Cache v2 Tolerance + Migration

**Slug**: `decision-cache-v2-tolerance`

## Architecture at a glance

Two coupled artifacts land in this PR:

1. **Validator + type changes** (minimal surface): widen `CachedWinnerFirstDecision.cacheVersion` to `1 | 2` and widen `decisionState` to include `"refusal"`. Update `isCachedWinnerFirstDecision` so the runtime guard matches the widened type. No other code changes.

2. **Standalone migration script**: `cloud/scripts/backfill-canonical-v2-migration.ts`. Reads every transcript row with a non-null `summaryCache`, derives the v2 canonical from the available signals, writes the row back with `cacheVersion: 2` and `decisionCode`/`decisionCodeSource` stripped from the summary. Idempotent, dry-run by default, per-row atomic.

No write-path, consumer, or API shape changes in this PR.

## Implementation files and changes

### Modified

| File | Change |
|---|---|
| `cloud/apps/api/src/graphql/queries/domain/decision-model-types.ts` | `CachedWinnerFirstDecision.cacheVersion` becomes `1 \| 2`. `decisionState` union gains `"refusal"`. |
| `cloud/apps/api/src/graphql/queries/domain/decision-model-helpers.ts` | `isCachedWinnerFirstDecision` accepts `cacheVersion ∈ {1, 2}` and `decisionState ∈ {"resolved", "neutral", "unknown", "refusal"}`. Rejection on any other value. |
| `cloud/apps/api/tests/graphql/queries/decision-model-helpers.test.ts` | Add 3 tests: `v2 + resolved` accepted; `v2 + refusal` accepted; `v1 + refusal` accepted (backward-tolerant); invalid `cacheVersion: 3` rejected. |

### New

| File | Role |
|---|---|
| `cloud/scripts/backfill-canonical-v2-migration.ts` | Orchestrator. DB I/O (Prisma). Derivation logic inline. Dry-run / apply modes. `--domain` and `--limit` scoping flags. |
| `cloud/scripts/__tests__/backfill-canonical-v2-migration.test.ts` | Derivation-helper unit tests — full truth table from spec. Covers all 5 decisionCodes × 2 orientations + "refusal" + "other" + missing-decisionCode preservation + missing-snapshot skip. Uses an in-memory fixture set, no live DB. |

### Intentionally NOT changed

- `cloud/apps/api/src/queue/handlers/summarize-persistence.ts` — write path unchanged; continues to emit `cacheVersion: 1` and `decisionCode`.
- `cloud/workers/summarize.py` — worker return shape unchanged.
- Any consumer reading `summaryCache.summary.decisionCode` — still reads the field for this PR.
- External API shapes (MCP, CSV).

## Derivation helper design

Pure function exported from the migration script for unit testability:

```ts
type CanonicalV2 = {
  cacheVersion: 2;
  decisionState: "resolved" | "neutral" | "unknown" | "refusal";
  strength: "strong" | "lean" | "neutral" | "unknown";
  favoredValueKey: string | null;
};

export function canonicalFromDecisionCode(
  decisionCode: string | null | undefined,
  pair: { valueA: string; valueB: string },
  orientationFlipped: boolean,
): CanonicalV2;
```

Implements the truth table verbatim. Called per visited row by the migration.

## Migration control flow

```
for each transcript row where summaryCache IS NOT NULL:
  existing_cache = row.decision_metadata.summaryCache.summary
  existing_code = existing_cache.decisionCode (string | undefined)
  existing_canonical = existing_cache.canonicalDecision (CanonicalV1 | CanonicalV2 | undefined)

  if existing_code is present:
    pair = pair_from_snapshot(row.definition_snapshot)
    if pair is invalid: skip, count as "missing-snapshot", continue
    orientationFlipped = scenarios.orientation_flipped (via scenario_id) or false
    new_canonical = canonicalFromDecisionCode(existing_code, pair, orientationFlipped)
    category = "drifted" if new_canonical differs from existing_canonical else "no-change-with-code"
    persist:
      decision_metadata.summaryCache.summary = {
        ...existing_cache,
        canonicalDecision: new_canonical,
        decisionCode: REMOVED,
        decisionCodeSource: REMOVED,
      }
  else if existing_canonical is present and cacheVersion != 2:
    new_canonical = { ...existing_canonical, cacheVersion: 2 }
    category = "v1-upgrade-preserving-canonical"
    persist
  else:
    category = "already-v2"
    skip
```

## Dry-run output format

```
category                                 count
------------------------------------     ------
drifted                                   ?
no-change-with-code                       ?
v1-upgrade-preserving-canonical           0    (unlikely in practice)
already-v2                                ?
missing-snapshot                          ?
errors                                    0

Total visited:   ~280,711
Writes required: (sum of drifted + no-change-with-code + v1-upgrade)
```

Apply mode emits the same summary at the end and logs progress every 100 rows.

## Correctness-critical attention points

| Risk | Mitigation |
|---|---|
| `orientationFlipped` misread → mirrored canonical | Join on `transcripts.scenario_id`, explicit Boolean read, default `false` if missing. Unit tests cover both values. |
| Malformed `definition_snapshot` crashes the run | Try/catch around pair extraction. Skip + count, never crash. |
| Truth table bug on `decisionCode: "1"` or `"2"` flipped case | Every truth table cell has a dedicated unit test (22 cases: 5 codes × 2 orientations + "refusal" both orientations + "other" both + missing both). |
| Concurrent writes create v1 rows mid-migration | Per-row UPDATE is atomic. Migration is idempotent. Re-run at the end sweeps any v1 rows written during the window. |
| Old deployed code rejects v2 rows and falls to derive-on-read | Validator is relaxed in the same PR. Old code sees v2 and accepts it. |
| Refusal signal lost on rows without `decisionCode` | Accepted limitation (documented in spec). No retroactive inference. |

## Test matrix

### Validator tests (`decision-model-helpers.test.ts`)

- `{cacheVersion: 1, decisionState: "resolved", strength: "strong", favoredValueKey: "X"}` → true
- `{cacheVersion: 2, decisionState: "resolved", strength: "strong", favoredValueKey: "X"}` → true
- `{cacheVersion: 2, decisionState: "refusal", strength: "unknown", favoredValueKey: null}` → true
- `{cacheVersion: 1, decisionState: "refusal", strength: "unknown", favoredValueKey: null}` → true (backward tolerant)
- `{cacheVersion: 3, ...valid otherwise}` → false
- `{cacheVersion: 2, decisionState: "bogus", ...}` → false
- Existing negative tests preserved (non-object, null, missing fields, type mismatches)

### Derivation tests (`backfill-canonical-v2-migration.test.ts`)

- Truth table: 22 cases (5 decisionCode × 2 orientations + refusal × 2 + other × 2 + missing × 2)
- Edge: `decisionCode: null` falls through to "unknown"
- Edge: empty-string `decisionCode` treated as absent
- Invariant: for `decisionCode: "3"`, both orientations produce identical canonical
- Invariant: `cacheVersion` in result is always literally `2`

## Rollout sequence

1. Open PR, pass CI.
2. Merge.
3. Post-merge: run migration dry-run against prod, review categorization counts. Expect `~280k` row-visits.
4. Apply against prod.
5. Re-run dry-run — expect zero changes.
6. Run the SC-003 and SC-004 SQL queries on prod.
7. Verify UI still renders analysis pages correctly.
8. Open PR #2 to rewire consumers, reshape external APIs, remove `cacheVersion: 1` from types.

## Wave breakdown

| Wave | Scope | [CHECKPOINT] |
|---|---|---|
| Wave 1 | Validator + type widening + unit tests for the validator. Est. ~40 lines. | Yes — commit separately. |
| Wave 2 | Migration script (derivation helper + Prisma I/O + CLI) + derivation unit tests. Est. ~250 lines. | Yes — commit at end. |

Both waves in one PR, one branch. Natural commit boundaries keep each diff under the 300-line threshold.

## Risks and how we handle them

| Risk | Likelihood | Blast radius | Mitigation |
|---|---|---|---|
| Truth table typo on a rarely-visited combination | Low | High (silent wrong classifications on prod) | Exhaustive 22-case unit test matrix; dry-run before apply |
| Malformed `definition_snapshot` on a row we haven't seen before | Medium | Low (per-row skip, reported) | Try/catch, explicit skip + report, count tracked in summary |
| Migration takes too long on 280k rows | Low | Low (script can be re-run; partial progress is safe) | Idempotent; progress logged every 100; can be interrupted and resumed |
| Old deployed code crashes on v2 rows pre-migration | Already covered | — | Validator is relaxed in the same PR that ships the migration |
| A new v3 shape lands later and this validator accepts it | Low | Medium | Validator is an exact `cacheVersion ∈ {1, 2}` check; future v3 requires explicit update |

## Deferred to PR #2

Listed here so this PR's scope stays tight:

- Remove `cacheVersion: 1` from the type union.
- Update `isCachedWinnerFirstDecision` to require `cacheVersion === 2`.
- Rewire every consumer to use `canonicalDecision` directly (no `decisionCode`).
- Write path stops emitting `decisionCode`.
- Manual-override mutation switches to `{favoredValueKey, strength, direction}` shape.
- MCP and CSV external contracts reshape.
- Remove `decisionCode` from the Python worker's return dict (if any consumer was relying on it).
- Drop top-level `transcripts.decision_code` column (possibly PR #3).

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted

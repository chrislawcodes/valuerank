# Spec: Canonical Decision Cache v2 Tolerance + Migration

**Slug**: `decision-cache-v2-tolerance`
**Status**: Authored — awaiting spec checkpoint
**Context**: PR #1 of 2. The larger refactor is captured in `decision-cache-single-source/spec.md`. This spec carves out the first safe step: prepare the cache validator to tolerate `cacheVersion: 2` and `decisionState: "refusal"`, then run a migration that upgrades every existing cached row to that shape. PR #2 will follow and remove the legacy fields + rewire consumers.

## Problem

`transcripts.decision_metadata.summaryCache.summary.canonicalDecision` is currently pinned to `cacheVersion: 1` and `decisionState: "resolved" | "neutral" | "unknown"`. The sibling field `summaryCache.summary.decisionCode` is the probe-format scale position (`"1".."5" | "other" | "refusal"`). Analysis reads canonical; exports and legacy code paths read `decisionCode`.

Two problems need to be enabled before the larger cleanup can land:

1. **The validator rejects `cacheVersion: 2`.** `isCachedWinnerFirstDecision` checks `decision.cacheVersion !== 1` and returns false, which would cause every v2 row to fall through to derive-on-read. That works correctly but is a performance hit on every query, and derive-on-read can crash on rows with malformed `definition_snapshot` (the `domain-analysis-definition-snapshot-crash` issue tracked in `STATUS.md`). We need the validator to accept v2 cleanly.

2. **The refusal signal has no home in canonical.** Today, refusal is tagged only in `decisionCode = "refusal"`. `canonicalDecision.decisionState` does not carry it. Once PR #2 removes `decisionCode`, refusal would be lost. We need `decisionState: "refusal"` to be a recognized value so the migration can tag refusals there.

## Goal

Enable `cacheVersion: 2` rows with `decisionState: "refusal"` to coexist alongside the current `cacheVersion: 1` shape, then migrate every cached row to v2 so that subsequent PRs can assume v2-only without a backward-compat branch. No other code paths change in this PR.

## Scope

### In scope

- Update `isCachedWinnerFirstDecision` to accept both `cacheVersion: 1` and `cacheVersion: 2`, and to accept `decisionState: "refusal"` as a distinct value from `"unknown"`.
- Update the related type declarations (`CachedWinnerFirstDecision`) so the wider `decisionState` union is visible to readers.
- Add a standalone TS migration script at `cloud/scripts/backfill-canonical-v2-migration.ts` with `--dry-run` (default) and `--apply` modes.
- Unit tests covering the validator changes (accept v2, accept refusal, still reject malformed) and the migration derivation helper's behavior on all decisionCode values × flipped/un-flipped orientations.
- A documented run plan for operating the migration against prod.

### Out of scope

- Removing `cacheVersion: 1` from the type union. That happens in PR #2 once the migration has swept prod.
- Removing `decisionCode` / `decisionCodeSource` from the summary cache write path. PR #2.
- Rewiring any read consumers to use the new shape. PR #2.
- Manual-override mutation reshape. PR #2.
- MCP / CSV external API changes. PR #2.
- Python worker emitting canonical in its return dict. PR #2.
- Changing the parser's internal logic. Out of scope for this whole refactor.
- Removing the top-level `transcripts.decision_code` column. Separate follow-up after PR #2.

## Stakeholders and read model

Readers after this PR that care about `canonicalDecision`:

- `resolveTranscriptDecisionModel` and its callers (analysis UI, domain aggregation). These already tolerate missing or invalid canonicals via the derive-on-read fallback; they will now see v2 caches and consume them the same way as v1.
- The migration script itself, using the same derivation logic as the existing backfill (`backfill-reparse-decisions.ts`).

No consumer needs to change in this PR. The validator relaxation is purely permissive.

## User scenarios

### US1 — Operator runs the migration against prod (Priority: P1)

**As** the operator, **I need** a migration script that converts every cached transcript to `cacheVersion: 2`, writes `decisionState: "refusal"` on refusals, and strips `decisionCode`/`decisionCodeSource` from the cache, **so that** PR #2 can assume v2-only without a compat branch.

**Why P1**: PR #2 is blocked on this. The whole refactor depends on having zero v1 rows in prod.

**Independent test**: Run the script in `--dry-run` mode against prod. It reports categorized counts (`v2-upgrade-from-decisionCode`, `v1-upgrade-preserving-canonical`, `already-v2`, `missing-snapshot`) and does not write. Apply. Re-run dry-run: the `v2-upgrade-from-decisionCode` and `v1-upgrade-preserving-canonical` counts are zero.

**Acceptance**:
1. Given a transcript whose cached `canonicalDecision.strength = "unknown"` but `decisionCode = "5"`, when apply runs, then `canonicalDecision.strength` becomes `"strong"`, `favoredValueKey` matches the definition's value_first (un-flipped) or value_second (flipped), `cacheVersion = 2`, and `decisionCode`/`decisionCodeSource` are no longer present on the row.
2. Given a transcript with `decisionCode = "refusal"`, when apply runs, then `canonicalDecision.decisionState = "refusal"`, `strength = "unknown"`, `favoredValueKey = null`, `cacheVersion = 2`.
3. Given a transcript with `decisionCode = "3"` (neutral), when apply runs, then `canonicalDecision = {decisionState: "neutral", strength: "neutral", favoredValueKey: null, cacheVersion: 2}`.
4. Given a transcript with `decisionCode = "other"` or missing, but a valid `cacheVersion: 1` canonical present, when apply runs, then the existing canonical values are preserved verbatim and only `cacheVersion` is bumped to 2.
5. Given a transcript with a malformed `definition_snapshot` (missing `components.value_first.token`), when apply runs, then the row is not written and is reported in the summary as `missing-snapshot`.
6. Apply is idempotent: re-running on an already-migrated database reports zero changes and makes zero writes.

### US2 — Developer reads a v2 cache through existing code paths (Priority: P1)

**As** a developer, **I need** existing read code paths (e.g. `resolveTranscriptDecisionModel`) to interpret a `cacheVersion: 2` canonical correctly, **so that** running the migration does not regress any current analysis.

**Why P1**: If readers break on v2, the migration is a regression, not an improvement.

**Independent test**: After migration, load a fixture transcript through the existing analysis resolver. Assert the returned `CanonicalDecision` carries the expected favoredValueKey and strength. Assert a refusal transcript returns a `decisionState` field readable by downstream code (even if downstream still only understands the three legacy values).

**Acceptance**:
1. `isCachedWinnerFirstDecision` returns true for an object with `cacheVersion: 2`, `decisionState: "resolved"`, `strength: "strong"`, `favoredValueKey: "Self_Direction_Action"`.
2. `isCachedWinnerFirstDecision` returns true for an object with `cacheVersion: 2`, `decisionState: "refusal"`, `strength: "unknown"`, `favoredValueKey: null`.
3. `isCachedWinnerFirstDecision` still returns false for malformed inputs (wrong types, missing fields, invalid strength, etc.).
4. `resolveTranscriptDecisionModel` passes the migrated canonical through to the outer result unchanged for `decisionState` values that existing callers already recognize (resolved / neutral / unknown). Callers that see `refusal` receive it as an unknown decisionState — not a crash.

## Functional requirements

- **FR-001** — `isCachedWinnerFirstDecision` MUST accept `cacheVersion: 1` and `cacheVersion: 2`. Any other value MUST return false.
- **FR-002** — `isCachedWinnerFirstDecision` MUST accept `decisionState` values `"resolved"`, `"neutral"`, `"unknown"`, and `"refusal"`. Any other value MUST return false.
- **FR-003** — The `CachedWinnerFirstDecision` type MUST be updated so the `cacheVersion` field is typed as `1 | 2` and `decisionState` includes `"refusal"`.
- **FR-004** — The TypeScript change MUST NOT remove `cacheVersion: 1` from the union; PR #2 handles that.
- **FR-005** — The write path (summarize-persistence, worker return dict) MUST NOT change in this PR. New writes still emit `cacheVersion: 1` and continue to populate `decisionCode`/`decisionCodeSource`.
- **FR-006** — The migration script MUST support `--dry-run` (default) and `--apply` modes, and an optional `--domain=<normalizedName>` and `--limit=<n>` for scoped runs.
- **FR-007** — The migration MUST process every transcript whose `decision_metadata.summaryCache` is not null. It MUST NOT write to rows where `summaryCache` is null.
- **FR-008** — For each visited row:
  - If `decisionCode` is present in summaryCache: compute canonical from `{decisionCode, value pair, orientationFlipped}` using the Mapping Rule in the Correctness section; set `cacheVersion: 2`; strip `decisionCode` and `decisionCodeSource` from the summary.
  - If `decisionCode` is absent and `cacheVersion != 2`: preserve existing canonical values (`strength`, `favoredValueKey`, `decisionState`) verbatim, bump `cacheVersion` to 2.
  - If `decisionCode` is absent and `cacheVersion == 2`: no-op.
- **FR-009** — The migration MUST read `orientationFlipped` from `scenarios.orientation_flipped` via `transcripts.scenario_id`. If `scenario_id` is null (legacy), default `orientationFlipped = false`.
- **FR-010** — The migration MUST read the value pair from `transcripts.definition_snapshot.components.value_first.token` and `.value_second.token`. If the snapshot is null, missing the components, or has non-string tokens, the row MUST be skipped and reported as `missing-snapshot` in the dry-run categorization.
- **FR-011** — Migration writes MUST be per-row atomic (one UPDATE with a WHERE-by-primary-key clause). No global lock or maintenance window required.
- **FR-012** — Migration MUST be idempotent: running it against an already-migrated DB produces zero writes and a dry-run report that shows only `already-v2` counts.
- **FR-013** — The migration MUST NOT touch the top-level `transcripts.decision_code` column.
- **FR-014** — Unit tests MUST cover every row of the Mapping Rule table (5 decisionCode values × 2 orientations + "refusal" + "other" + missing-decisionCode preservation) and the dry-run categorization.
- **FR-015** — At least one test MUST exercise `isCachedWinnerFirstDecision` with a v2 + refusal canonical to assert acceptance.

## Success criteria

- **SC-001** — `@valuerank/api` lint + build + test suite passes after the changes.
- **SC-002** — Dry-run against prod reports a non-zero count of rows to migrate, categorized. Applying the migration completes with zero errors.
- **SC-003** — After apply on prod, `SELECT COUNT(*) FROM transcripts WHERE decision_metadata->'summaryCache'->'summary' ? 'decisionCode'` returns 0.
- **SC-004** — After apply on prod, `SELECT COUNT(*) FROM transcripts WHERE decision_metadata->'summaryCache' IS NOT NULL AND decision_metadata->'summaryCache'->'summary'->'canonicalDecision'->>'cacheVersion' != '2'` returns only the `missing-snapshot` residual (expected single-digit count based on known malformed-snapshot issue).
- **SC-005** — After apply, opening a representative analysis page in the web UI still renders transcript decisions correctly — no regression in read behavior.
- **SC-006** — Re-running the migration after apply shows `changed: 0`, `errors: 0`, confirming idempotence.

## Edge cases

- **Rows with no summaryCache**: out of scope; migration skips them.
- **Rows with `decisionCode = "other"` and a cacheVersion-1 canonical**: preserved; no inference.
- **Rows with a cacheVersion-1 canonical whose strength disagrees with decisionCode**: the drift cases we fixed earlier. Migration re-derives and writes the correct canonical.
- **Rows with malformed `definition_snapshot`**: skipped, reported in summary. Known issue (`domain-analysis-definition-snapshot-crash`). Out of scope to repair here; flagged for separate cleanup.
- **Concurrent writes during migration**: each row UPDATE uses the primary-key row lock. A summarize write that lands mid-migration produces a new v1 row, which the next migration pass (or a re-run) can sweep up.
- **Duplicate runs**: idempotent by design — the "decisionCode absent + cacheVersion == 2" branch is a no-op.
- **A future v3 cache**: validator must reject unknown cache versions. Only `1` and `2` accepted.

## Non-goals

- No consumer rewires, no type removals, no breaking API changes.
- No parser changes, no worker contract changes, no UI changes.
- No strict enforcement (via runtime assertion) that `cacheVersion === 2` — readers still accept both until PR #2.

## Correctness-critical mapping

The migration's derivation is the same as the one used by the larger refactor spec and by the existing backfill. Full truth table:

| decisionCode | orientationFlipped | direction | strength | decisionState | favoredValueKey |
|---|---|---|---|---|---|
| `"5"` | false | `favor_first` | `strong` | `resolved` | `pair.valueA` |
| `"5"` | true | `favor_second` | `strong` | `resolved` | `pair.valueB` |
| `"4"` | false | `favor_first` | `lean` | `resolved` | `pair.valueA` |
| `"4"` | true | `favor_second` | `lean` | `resolved` | `pair.valueB` |
| `"3"` | either | `neutral` | `neutral` | `neutral` | `null` |
| `"2"` | false | `favor_second` | `lean` | `resolved` | `pair.valueB` |
| `"2"` | true | `favor_first` | `lean` | `resolved` | `pair.valueA` |
| `"1"` | false | `favor_second` | `strong` | `resolved` | `pair.valueB` |
| `"1"` | true | `favor_first` | `strong` | `resolved` | `pair.valueA` |
| `"refusal"` | either | `unknown` | `unknown` | `refusal` | `null` |
| `"other"` or missing | either | `unknown` | `unknown` | `unknown` | `null` |

The `direction` column is informational for readers who care about it; it is derived by `resolveTranscriptDecisionModel` from `favoredValueKey` + pair.

## Assumptions carried in

1. Scope is narrow: validator relaxation + migration only. No write-path, consumer-rewire, or type-removal changes. PR #2 handles those.
2. Migration uses an atomic UPDATE per row; no global lock needed.
3. `orientationFlipped` source: `scenarios.orientation_flipped` Boolean column.
4. Value pair source: `transcripts.definition_snapshot.components.{value_first,value_second}.token`.
5. Malformed snapshots: log + skip, report in summary, do not crash.
6. Refusal detection is only attempted on rows that still have `decisionCode = "refusal"` in cache. Legacy rows with no decisionCode and `decisionState = "unknown"` are preserved verbatim; no retroactive refusal inference.
7. External API shape unchanged this PR.
8. Python helper at `cloud/scripts/reparse-decision-stdin.py` (shipped in PR #695) can be reused or its logic replicated. Migration can shell out to it or inline the derivation — design choice during implementation.
9. Tests live under `cloud/apps/api/tests/` (for the validator/types work) and `cloud/scripts/__tests__/` or similar (for the migration script's derivation helper).

## Rollout

1. Author and merge this PR.
2. Immediately after merge, operator runs the migration: dry-run against prod, review counts, then `--apply`.
3. Verify SC-003 and SC-004 queries on prod.
4. Open PR #2 to remove `cacheVersion: 1` from the type union, rewire consumers, and reshape external APIs.

## Measurement

```sql
-- Pre-migration baseline
SELECT COUNT(*) AS rows_with_cache FROM transcripts WHERE decision_metadata->'summaryCache' IS NOT NULL;
SELECT COUNT(*) AS rows_with_decision_code FROM transcripts WHERE decision_metadata->'summaryCache'->'summary' ? 'decisionCode';
SELECT decision_metadata->'summaryCache'->'summary'->'canonicalDecision'->>'cacheVersion' AS v, COUNT(*) FROM transcripts WHERE decision_metadata->'summaryCache' IS NOT NULL GROUP BY v;

-- Post-migration expectations
-- rows_with_decision_code -> 0
-- cacheVersion distribution -> only '2' remains (except missing-snapshot residual)
```

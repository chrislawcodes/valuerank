# Feature 034 — Run Reconciliation Hygiene Fixes

**Branch**: feat/034-hygiene-follow-ups
**Created**: 2026-04-24
**Status**: Draft
**Context**: Four of seven follow-ups from PR #745 ([feature 033](../033-run-state-reconciliation/)). Each is a small, localized bug fix caught during adversarial review but intentionally deferred.

---

## Background

The 033 merge shipped run-state reconciliation but left seven follow-up items on `STATUS.md`. This feature handles the four "hygiene" items — small localized fixes with no architectural decisions. Remaining items (#2 janitor, #3 audit sweep, #7 load test) are separate efforts.

---

## User Stories

### US-1 (P1): Reconciliation window is operator-tunable

**As an** operator investigating an older run,
**I want** the 30-day reconciliation window to be changeable without a deploy,
**so that** stranded transcripts on runs beyond 30 days can be recovered automatically if we widen the window.

**Acceptance criteria:**
- New env var `RUN_RECONCILE_WINDOW_DAYS` read at `cloud/apps/api/src/services/run/scheduler.ts`.
- Default: 30 (preserves current behavior).
- Reads parsed as integer, falls back to 30 if unset or invalid.
- The interval is applied to the `runs.updated_at > NOW() - INTERVAL 'N days'` predicate in the activity check.

### US-2 (P0): Orphan reconstruction fails loud on malformed content

**As the** reconciliation sweep,
**I want** to stop silently reconstructing `ProbeResult` rows with 0 tokens when the orphan transcript's `content` is malformed,
**so that** downstream cost/shortfall math isn't corrupted by false-zero reconstructions.

**Acceptance criteria:**
- In `run-state-reconcile.ts:extractTranscriptTokenUsage`, add a strict-mode branch: when `costSnapshot` is missing/null AND no per-turn token data is found in `turns`, return `{ inputTokens: -1, outputTokens: -1 }` as a sentinel.
- `reconstructOrphans()` checks for the sentinel: if found, pushes to `failedIds` instead of calling `recordProbeSuccess`.
- A malformed orphan surfaces as an `ORPHAN_TRANSCRIPT` anomaly with `details.failedIds` including the transcript id.
- The existing `fallbackTokenCount` parameter is still used as a fallback when at least partial cost data is available; only the "everything missing" case fails loud.

### US-3 (P1): Pair asymmetry compares against every sibling

**As the** `detectPairAsymmetry` detector,
**I want** to compare the current run against every sibling in the `jobChoiceBatchGroupId` group, not just the first,
**so that** pair groups with three or more runs (seed variations, re-runs) are detected correctly.

**Acceptance criteria:**
- Query in `anomaly-detection.ts:detectPairAsymmetry` returns all siblings (non-self) for the group, not just first.
- The detector computes success rates for every sibling.
- Fires when the maximum delta across sibling pairs exceeds the threshold (`<= PAIR_ASYMMETRY_THRESHOLD_PCT` still returns null).
- `details` includes `{siblingRunIds: string[], siblingSuccessRates: number[], maxDeltaPct: number}`.
- `subject` remains the shared `jobChoiceBatchGroupId`.

### US-4 (P1): Orphan reconstruction is bounded per sweep tick

**As the** sweep handler,
**I want** to cap orphan reconstruction at a fixed number per tick,
**so that** a run with thousands of orphans doesn't exceed the 120-second PgBoss job expiration and block the sweep.

**Acceptance criteria:**
- New constant `ORPHAN_RECONSTRUCTION_CAP_PER_TICK = 500` in `anomaly-thresholds.ts`.
- `reconstructOrphans()` reconstructs at most 500 orphans per call.
- When the backlog exceeds the cap, the handler logs `info` noting the overflow count. The remaining orphans are handled on the next sweep tick.
- Existing `ORPHAN_TRANSCRIPT` anomaly detection still fires on the uncovered orphans (they remain orphans across ticks until reconstructed).

---

## What is NOT in scope

- Item #2 from STATUS.md (SUPERSEDED `AnalysisResult` row janitor) — separate effort.
- Item #3 (audit sweep with `source` column on `RunAnomaly`) — separate FF run 035.
- Item #7 (`maybeAdvanceRunStatus` concurrency load test) — separate direct-path task.
- Any change to the CAS UPDATE logic, `computeRunProgress`, or the 6 existing anomaly types beyond what's needed for US-3.
- Threshold tuning beyond the new `ORPHAN_RECONSTRUCTION_CAP_PER_TICK` constant.
- CLAUDE.md, AGENTS.md, cloud/CLAUDE.md, MEMORY.md, STATUS.md (except the post-merge status update), `.gitignore`.

---

## Design

### US-1 — env-var driven window

`RECENT_COMPLETED_RUN_WINDOW_DAYS` is read in **two places** in `scheduler.ts` — `hasRecoveryActivity()` (Prisma query) and `enqueueRunStateReconcileJobs()` (raw SQL). Per adversarial review, BOTH must use the same resolved value, otherwise the scheduler enqueues a different set of runs than it considers active.

Implementation: introduce a small helper `getReconcileWindowDays(): number` that reads `process.env.RUN_RECONCILE_WINDOW_DAYS` once (memoized), parses as int, falls back to `RECENT_COMPLETED_RUN_WINDOW_DAYS` on unset/invalid, warns on invalid. Both call sites use the helper.

### US-2 — discriminated-union return from extractor

Per adversarial review, a sentinel value (`-1`) is brittle. Use a discriminated union instead:

```typescript
type TokenUsageResult =
  | { kind: 'ok'; inputTokens: number; outputTokens: number }
  | { kind: 'malformed'; reason: string };
```

Current silent-zero branch in `extractTranscriptTokenUsage` at `run-state-reconcile.ts:25-67`:
```typescript
if (content === null || content === undefined || typeof content !== 'object') {
  return { inputTokens: 0, outputTokens: fallbackTokenCount };
}
```

New behavior: return `{ kind: 'malformed', reason: 'content-not-object' }` for this branch. Also `{ kind: 'malformed', reason: 'no-cost-data' }` when BOTH `costSnapshot` is missing AND no per-turn token data found. Otherwise `{ kind: 'ok', inputTokens, outputTokens }`.

Caller in `reconstructOrphans`: switches on `kind`. `'ok'` → calls `recordProbeSuccess`. `'malformed'` → pushes to `failedIds` + logs the `reason` for operator debugging.

**Anomaly details field alignment** (from review): the sweep currently persists `ORPHAN_TRANSCRIPT` details as `{ transcriptIds: string[] }`. Keep that field; add `malformedTranscriptIds: string[]` alongside. Operators can see both the raw orphan list and the subset that failed strict-mode reconstruction.

### US-3 — multi-sibling comparison

Current `detectPairAsymmetry` at `anomaly-detection.ts:180-248` picks the first non-self sibling. New behavior:
1. Query all siblings with the same `jobChoiceBatchGroupId` and `deletedAt IS NULL` (excluding self).
2. Compute success rate for self and each sibling.
3. **Per-pair `PAIR_ASYMMETRY_MIN_PROBES` guard preserved**: when comparing self to a specific sibling, both sides must have ≥ `PAIR_ASYMMETRY_MIN_PROBES` scheduled probes. Under-sampled siblings are excluded from the comparison set, not from the whole detector. If no sibling clears the guard, return null.
4. Compute max delta across qualifying self-vs-sibling pairs.
5. Fire if max delta exceeds threshold.

**Persisted details are additive, not breaking** (from adversarial review): the existing `{ siblingRunId, siblingSuccessRate, currentSuccessRate, scheduled, siblingScheduled }` fields stay in place (pointing at the max-delta sibling). New fields add: `{ siblingRunIds: string[], siblingSuccessRates: number[], maxDeltaPct: number, skippedUnderSampledRunIds: string[] }`. Existing consumers don't break; new consumers can use the richer shape.

### US-4 — reconstruction cap (with scheduler activity signal)

Change `findOrphanTranscripts` to accept an optional `limit` parameter (default unbounded). The sweep calls with `limit = ORPHAN_RECONSTRUCTION_CAP_PER_TICK`, so the DB returns at most 500 rows — no 10k-row load into memory (per adversarial review).

To know whether a backlog remains after a capped tick, also query `count` of orphans WITH filter (cheap — just the count, no content). If `totalCount > limit`, log `info` AND ensure the scheduler re-fires on the next tick by surfacing the backlog through the activity check (next point).

**Scheduler activity signal for orphan backlog** (new — from review): `hasRecoveryActivity()` currently returns true when active runs exist OR stranded transcripts exist. Add a third condition: `OR orphan transcripts exist on any COMPLETED run within the reconcile window`. Otherwise a run with orphan-only backlog silences the scheduler before its orphans drain.

---

## Files in Scope

| File | Change |
|---|---|
| `cloud/apps/api/src/services/run/anomaly-thresholds.ts` | Add `ORPHAN_RECONSTRUCTION_CAP_PER_TICK = 500` |
| `cloud/apps/api/src/services/run/scheduler.ts` | Read `RUN_RECONCILE_WINDOW_DAYS` env var |
| `cloud/apps/api/src/queue/handlers/run-state-reconcile.ts` | Strict-mode token usage + reconstruction cap |
| `cloud/apps/api/src/services/run/anomaly-detection.ts` | Multi-sibling pair asymmetry |
| `cloud/apps/api/tests/services/run/anomaly-detection.test.ts` | Tests for multi-sibling detection |
| `cloud/apps/api/tests/queue/handlers/run-state-reconcile.test.ts` | Tests for strict mode + cap |

---

## Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-1 | `RUN_RECONCILE_WINDOW_DAYS=60` env var changes the sweep's window without a code change |
| AC-2 | Orphan with null `content` produces `ORPHAN_TRANSCRIPT` anomaly with `failedIds` populated, not a 0-token `ProbeResult` |
| AC-3 | A 3-run pair group with one outlier success rate fires `PAIR_ASYMMETRY` with all three siblings listed in `details.siblingRunIds` |
| AC-4 | A run with 600 orphan transcripts reconstructs exactly 500 on the first tick and 100 on the second |
| AC-5 | Lint + build + full test suite pass |
| AC-6 | No regression in the 6 anomaly detectors or the CAS transitions from PR #745 |

---

## Edge Cases

| Case | Behavior |
|---|---|
| `RUN_RECONCILE_WINDOW_DAYS` unset | Default 30 |
| `RUN_RECONCILE_WINDOW_DAYS=abc` | Warn, default 30 |
| `RUN_RECONCILE_WINDOW_DAYS=0` | Activity check never fires on COMPLETED runs — edge case, still valid config |
| Orphan has partial cost data (only `inputTokens` in first turn) | Current behavior preserved — use what's there + fallback for missing |
| Pair group has only self (no siblings) | Detector returns null — unchanged |
| All siblings have identical success rate | Max delta is 0, detector returns null (threshold is `<= 0`) |
| Run has 5000 orphans | First tick processes 500, `log.info` noted; eventually drains over 10 ticks |

---

## Constitution Validation

| Requirement | Status |
|---|---|
| Type safety — no `any` | PASS — all new types explicit |
| File size ≤ 400 lines prod | PASS — no new files; edits small |
| Test coverage ≥ 80% | PASS — each AC has a test |
| Structured logging | PASS — new logs use existing `log.*` handles |
| No migrations | PASS — no schema change |
| Preflight | PASS — standard lint+test+build |

---

## Residual Risks (each with `verification:` per workflow rule)

- **Risk: the strict-mode sentinel `-1` could propagate into arithmetic if a future caller forgets to check.**
  verification: before merge, grep for every consumer of `extractTranscriptTokenUsage` and confirm each one explicitly checks the sentinel before using the values.

- **Risk: multi-sibling pair comparison changes `details` shape — external consumers might depend on the old single-sibling shape.**
  verification: search for consumers of `PAIR_ASYMMETRY` anomaly details (GraphQL resolver, MCP tools, UI). None should exist yet (feature is ~1 day old), but confirm before merge.

- **Risk: cap of 500 orphans/tick means a large backlog drains slowly — a 10k-orphan run takes 20 ticks (100 min at 5-min cadence).**
  verification: acceptable for operator investigation context; document in inline comment and accept.

- **Risk: env-var reads once at scheduler boot. Changing `RUN_RECONCILE_WINDOW_DAYS` requires a process restart.**
  verification: explicit note in the code comment + STATUS.md followup if hot-reload becomes important.

# Tasks — Feature 034: Hygiene Follow-ups

---

## Wave 1 — US-1 env-var reconciliation window

### T1-1 — Helper + both call sites
**File**: `cloud/apps/api/src/services/run/scheduler.ts`

- [ ] Add module-level `function getReconcileWindowDays(): number` that reads `process.env.RUN_RECONCILE_WINDOW_DAYS`, parses as integer, falls back to `RECENT_COMPLETED_RUN_WINDOW_DAYS`. Log `warn` once if env var is set but unparseable.
- [ ] Replace the call site in `hasRecoveryActivity()` that uses `RECENT_COMPLETED_RUN_WINDOW_DAYS` with `getReconcileWindowDays()`.
- [ ] Replace the call site in `enqueueRunStateReconcileJobs()` with the same helper.
- [ ] Memoize the read at module load (read once, keep the value). Inline comment noting that env-var changes require a process restart.

### T1-2 — Tests
**File**: `cloud/apps/api/tests/services/run/scheduler.test.ts` (existing or new)

- [ ] Test: `RUN_RECONCILE_WINDOW_DAYS=60` → helper returns 60.
- [ ] Test: unset → helper returns 30 (default).
- [ ] Test: `RUN_RECONCILE_WINDOW_DAYS=abc` → helper returns 30 and logs warn.
- [ ] Test: `RUN_RECONCILE_WINDOW_DAYS=-5` → helper returns 30 (rejects negative) and logs warn.

[CHECKPOINT]

---

## Wave 2 — US-2 strict-mode + US-4 DB-level cap

### T2-1 — `ORPHAN_RECONSTRUCTION_CAP_PER_TICK` constant
**File**: `cloud/apps/api/src/services/run/anomaly-thresholds.ts`

- [ ] Add `export const ORPHAN_RECONSTRUCTION_CAP_PER_TICK = 500`.

### T2-2 — Discriminated-union token extractor
**File**: `cloud/apps/api/src/queue/handlers/run-state-reconcile.ts`

- [ ] Define `type TokenUsageResult = { kind: 'ok'; inputTokens: number; outputTokens: number } | { kind: 'malformed'; reason: string }`.
- [ ] Replace current `extractTranscriptTokenUsage` body: return `{kind:'malformed', reason:'content-not-object'}` when content is null/not-object. Return `{kind:'malformed', reason:'no-cost-data'}` when `costSnapshot` missing AND no per-turn token data found. Otherwise `{kind:'ok', ...}`.
- [ ] Update `reconstructOrphans` to switch on `kind`: `'ok'` → `recordProbeSuccess(...)` as before. `'malformed'` → push to `failedIds`, log `warn` with `{runId, transcriptId, reason}`.

### T2-3 — DB-level LIMIT on orphan query
**File**: `cloud/apps/api/src/services/run/anomaly-detection.ts`

- [ ] Extend `findOrphanTranscripts` signature: `findOrphanTranscripts(runId: string, limit?: number)`. Apply `LIMIT $limit` in the raw SQL when `limit` is defined.
- [ ] Add new export `countOrphanTranscripts(runId: string): Promise<number>` — raw SQL `SELECT COUNT(*) FROM transcripts t LEFT JOIN probe_results p ON ... WHERE p.id IS NULL AND t.deleted_at IS NULL AND t.created_at < NOW() - INTERVAL '...seconds'`. Reuse the same predicate as `findOrphanTranscripts` to avoid drift.

### T2-4 — Wire cap + count into `reconstructOrphans`
**File**: `cloud/apps/api/src/queue/handlers/run-state-reconcile.ts`

- [ ] Import `ORPHAN_RECONSTRUCTION_CAP_PER_TICK` and `countOrphanTranscripts`.
- [ ] `reconstructOrphans` calls `findOrphanTranscripts(runId, ORPHAN_RECONSTRUCTION_CAP_PER_TICK)`.
- [ ] After the loop, if `orphans.length === ORPHAN_RECONSTRUCTION_CAP_PER_TICK`, call `countOrphanTranscripts(runId)`; if `total > cap`, `log.info({runId, total, processing: cap, overflow: total - cap}, 'Orphan backlog exceeds per-tick cap')`.

### T2-5 — Tests
**File**: `cloud/apps/api/tests/queue/handlers/run-state-reconcile.test.ts`

- [ ] Test: malformed orphan (null `content`) → reconstruction skipped, transcript id in `failedIds`, `ORPHAN_TRANSCRIPT` anomaly persisted.
- [ ] Test: orphan with `costSnapshot` present → reconstructed normally (ok path).
- [ ] Test: 600 orphans in DB → only 500 reconstructed, `log.info` called with `total=600, overflow=100`.
- [ ] Test: 500 orphans (exactly at cap) → all reconstructed, no overflow log.

[CHECKPOINT]

---

## Wave 3 — US-3 multi-sibling pair asymmetry

### T3-1 — Rewrite detector
**File**: `cloud/apps/api/src/services/run/anomaly-detection.ts`

- [ ] Replace `detectPairAsymmetry` body. Fetch all runs with same `jobChoiceBatchGroupId` and `deletedAt IS NULL`, excluding self.
- [ ] For each sibling: count successful probes, compute scheduled count, derive rate.
- [ ] Apply per-pair `PAIR_ASYMMETRY_MIN_PROBES` guard: only include sibling in comparison if both self and sibling have scheduled ≥ min. Track skipped sibling IDs in `skippedUnderSampledRunIds`.
- [ ] Compute max-delta pair across qualifying siblings.
- [ ] Fire when `maxDeltaPct > PAIR_ASYMMETRY_THRESHOLD_PCT` (keep `<=` returns-null semantics).
- [ ] `details` payload additive: keep `siblingRunId`, `siblingSuccessRate`, `currentSuccessRate`, `scheduled`, `siblingScheduled` pointing at max-delta sibling. Add `siblingRunIds`, `siblingSuccessRates`, `maxDeltaPct`, `skippedUnderSampledRunIds`.

### T3-2 — Tests
**File**: `cloud/apps/api/tests/services/run/anomaly-detection.test.ts`

- [ ] Test: 3-sibling group with one outlier at the bottom fires with all three sibling IDs in `details.siblingRunIds`, `maxDeltaPct` reflects the outlier.
- [ ] Test: 4-sibling bimodal (two high, two low) fires with max delta spanning the clusters.
- [ ] Test: 3-sibling group where one is under-sampled → that run in `skippedUnderSampledRunIds`, detector still fires if the remaining qualifying pair exceeds threshold.
- [ ] Test: all-equal case returns null.
- [ ] Test: payload-size sanity — 10-sibling group, `JSON.stringify(details).length < 4096`.

[CHECKPOINT]

---

## Wave 4 — US-4 scheduler activity + enqueue predicate + STATUS cleanup

### T4-1 — Extend `hasRecoveryActivity()`
**File**: `cloud/apps/api/src/services/run/scheduler.ts`

- [ ] After the existing checks for active runs and stranded transcripts, add a third branch: `EXISTS (SELECT 1 FROM transcripts t LEFT JOIN probe_results p ON p.run_id = t.run_id AND p.scenario_id = t.scenario_id AND p.model_id = t.model_id AND p.sample_index = t.sample_index LEFT JOIN runs r ON r.id = t.run_id WHERE p.id IS NULL AND t.deleted_at IS NULL AND t.created_at < NOW() - INTERVAL '<ORPHAN_TRANSCRIPT_MIN_AGE_SECONDS> seconds' AND r.deleted_at IS NULL AND r.updated_at > NOW() - INTERVAL '<getReconcileWindowDays()> days' LIMIT 1)`.
- [ ] Use parameterized query (Prisma raw with `$1`, `$2` bindings) — not string interpolation.

### T4-2 — Extend `enqueueRunStateReconcileJobs()`
**File**: `cloud/apps/api/src/services/run/scheduler.ts`

- [ ] Current: enqueues a `run_state_reconcile` job per non-terminal run AND per COMPLETED run with stranded transcripts (`summarized_at IS NULL`).
- [ ] Add: OR per COMPLETED run within the reconcile window that has orphan backlog (same predicate as T4-1, scoped per run).
- [ ] Ensure `UNION` or equivalent de-dupe so a run matching both stranded AND orphan conditions gets exactly one `run_state_reconcile` job (singleton key per runId already handles this at PgBoss layer, but the SQL should still DISTINCT to avoid duplicate work).

### T4-3 — Tests
**File**: `cloud/apps/api/tests/services/run/scheduler.test.ts`

- [ ] Test: `hasRecoveryActivity()` returns true when only condition is a COMPLETED run with orphan backlog (no active runs, no stranded transcripts).
- [ ] Test: `enqueueRunStateReconcileJobs()` enqueues a `run_state_reconcile` for a COMPLETED run with orphan backlog.
- [ ] Test: a run matching BOTH stranded AND orphan conditions is enqueued exactly once.

### T4-4 — STATUS.md cleanup
**File**: `STATUS.md`

- [ ] Remove the follow-up entries for items #1 (30-day window), #4 (silent-zero fallback), #5 (multi-sibling pair asymmetry), #6 (per-tick orphan cap) — all resolved by this PR.
- [ ] Leave items #2 (SUPERSEDED janitor), #3 (audit sweep), #7 (load test) intact — still open.

[CHECKPOINT]

---

## Wave 5 — verification + soak

- [ ] `cd cloud && npx turbo lint --filter=@valuerank/api` — 0 errors.
- [ ] `cd cloud && npx turbo build --filter=@valuerank/api` — passes.
- [ ] `cd cloud && npm run test --workspace @valuerank/api` (with test DB) — full pass.
- [ ] `grep -RIn "RECENT_COMPLETED_RUN_WINDOW_DAYS" cloud/apps/api/src` — only matches are inside `getReconcileWindowDays()` helper or import statements.
- [ ] `grep -RIn "inputTokens: 0" cloud/apps/api/src/queue/handlers/run-state-reconcile.ts` — zero matches (silent-zero branch gone).
- [ ] `EXPLAIN ANALYZE` the new `hasRecoveryActivity()` query against a dev DB seeded with production-shaped data. Target < 100 ms p99.
- [ ] Manual smoke: set `RUN_RECONCILE_WINDOW_DAYS=60` and confirm scheduler predicate reflects it.

[CHECKPOINT]

---

## Parallelization summary

| Wave | Parallel opportunities |
|---|---|
| 1 | T1-1 then T1-2 |
| 2 | T2-1, T2-3 independent; T2-2 independent file; T2-4 depends on T2-1 + T2-3; T2-5 depends on all |
| 3 | T3-1 then T3-2 |
| 4 | T4-1 and T4-2 same file (serial); T4-3 after; T4-4 independent |
| 5 | Serial verification |

Waves cannot run in parallel — each ends in a `[CHECKPOINT]` and the diff review must pass before the next starts.

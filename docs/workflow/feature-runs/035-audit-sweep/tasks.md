# Tasks — Feature 035: Audit Sweep

---

## Wave 1 — Schema + migration

### T1-1 — Prisma schema
**File**: `cloud/packages/db/prisma/schema.prisma`

- [ ] Add `enum RunAnomalySource { default; audit }`.
- [ ] Add `source RunAnomalySource @default(default)` field on `RunAnomaly`.
- [ ] Change `@@unique([runId, type, subject])` to `@@unique([runId, type, subject, source])`.

### T1-2 — Migration SQL
**File**: `cloud/packages/db/prisma/migrations/<timestamp>_run_anomaly_source/migration.sql`

- [ ] `CREATE TYPE "RunAnomalySource" AS ENUM ('default', 'audit');`
- [ ] `ALTER TABLE run_anomalies ADD COLUMN source "RunAnomalySource" NOT NULL DEFAULT 'default';` (existing rows backfilled atomically via DEFAULT).
- [ ] `DROP INDEX "run_anomalies_run_id_type_subject_key";`
- [ ] `CREATE UNIQUE INDEX "run_anomalies_run_id_type_subject_source_key" ON run_anomalies (run_id, type, subject, source);`

[CHECKPOINT]

---

## Wave 2 — Persistence: source-scoped API

### T2-1 — Update `upsertAnomaly`
**File**: `cloud/apps/api/src/services/run/anomaly-persistence.ts`

- [ ] Import `RunAnomalySource` from `@prisma/client` (or `@valuerank/db`).
- [ ] Signature: `upsertAnomaly(runId: string, draft: AnomalyDraft, source: RunAnomalySource)`.
- [ ] Prisma upsert `where` uses the new composite key: `runId_type_subject_source: { runId, type: draft.type, subject: draft.subject, source }`.
- [ ] `create` includes `runId, type, subject, source, details, firstSeenAt: new Date(), lastSeenAt: new Date()`.
- [ ] `update` includes `lastSeenAt: new Date(), details: draft.details, resolvedAt: null` — the `resolvedAt: null` un-resolves on re-detection, load-bearing.

### T2-2 — Update `resolveAnomaly`
- [ ] Signature: `resolveAnomaly({ runId, type, subject, source })`.
- [ ] `updateMany` `where`: `{ runId, type, subject, source, resolvedAt: null }`.
- [ ] `data`: ONLY `resolvedAt: new Date()`. Do NOT touch `lastSeenAt` (per plan-review — preserves historical meaning).

### T2-3 — Update `syncAnomalies`
- [ ] Signature: `syncAnomalies(runId, type, drafts, source)`.
- [ ] For each draft in `drafts`: `upsertAnomaly(runId, draft, source)`.
- [ ] After persist, fetch `existing = db.runAnomaly.findMany({ where: { runId, type, source, resolvedAt: null } })`. The `source` filter is load-bearing.
- [ ] For each existing row whose `subject` is not in the current drafts set, call `resolveAnomaly({ runId, type, subject, source })`.

### T2-4 — Tests
**File**: `cloud/apps/api/tests/services/run/anomaly-persistence.test.ts`

- [ ] Test: `upsertAnomaly(runId, draft, 'default')` creates with source='default'.
- [ ] Test: re-`upsertAnomaly` on same key with updated details sets `resolvedAt: null` (simulating re-detection after prior resolution).
- [ ] Test: `resolveAnomaly` sets `resolvedAt` but NOT `lastSeenAt`.
- [ ] Test: `syncAnomalies(source='audit')` with empty drafts does NOT resolve rows where `source='default'`.
- [ ] Test: two rows with same `(runId, type, subject)` but different `source` coexist.

[CHECKPOINT]

---

## Wave 3 — Detector mode parameter

### T3-1 — Add mode type + update pair asymmetry
**File**: `cloud/apps/api/src/services/run/anomaly-detection.ts`

- [ ] Export `type AnomalyDetectionMode = 'default' | 'audit'`.
- [ ] `detectPairAsymmetry(run, mode: AnomalyDetectionMode = 'default')`:
  - In `default` mode, keep the existing `deltaPct <= PAIR_ASYMMETRY_THRESHOLD_PCT` returns-null check.
  - In `audit` mode, use `deltaPct <= 0` instead (any non-zero delta fires).
  - `PAIR_ASYMMETRY_MIN_PROBES` guard stays in both modes.

### T3-2 — Update model transcript shortfall
- [ ] `detectModelTranscriptShortfall(run, mode: AnomalyDetectionMode = 'default'): Promise<AnomalyDraft[]>`:
  - In `default` mode, keep current filter: `rate.rate < MODEL_SHORTFALL_ABSOLUTE_RATE || (rate.rate < MODEL_SHORTFALL_RELATIVE_RATE && peerMedianRate > MODEL_SHORTFALL_PEER_RATE)`.
  - In `audit` mode, use `rate.rate < peerMedianRate - 0.0001` (any measurable below-median model).
  - `MODEL_SHORTFALL_MIN_PROBES` guard stays in both modes.

### T3-3 — Tests
**File**: `cloud/apps/api/tests/services/run/anomaly-detection.test.ts`

- [ ] Test: `detectPairAsymmetry(run)` default behavior unchanged (existing tests still pass).
- [ ] Test: `detectPairAsymmetry(run, 'audit')` fires on a 5pp delta that default threshold = 0 also fires; identical rates still null.
- [ ] Test: `detectModelTranscriptShortfall(run, 'audit')` fires on a model 5pp below peer median where the default predicate wouldn't fire.
- [ ] Test: `detectModelTranscriptShortfall(run, 'audit')` skips under-sampled models (< 10 scheduled probes).

[CHECKPOINT]

---

## Wave 4 — Default sweep refactor to pass source

### T4-1 — Thread source through reconcile handler
**File**: `cloud/apps/api/src/queue/handlers/run-state-reconcile.ts`

- [ ] Every call to `syncAnomalies(runId, type, drafts)` becomes `syncAnomalies(runId, type, drafts, 'default')`.
- [ ] Every call to `upsertAnomaly(runId, draft)` becomes `upsertAnomaly(runId, draft, 'default')`.
- [ ] Every call to `resolveAnomaly({...})` adds `source: 'default'`.

### T4-2 — Update tests
**File**: `cloud/apps/api/tests/queue/handlers/run-state-reconcile.test.ts`

- [ ] Fixtures and spy assertions updated to expect `source='default'` arg.
- [ ] Add test: after default sweep runs on a fixture run, all persisted `RunAnomaly` rows have `source='default'`.

[CHECKPOINT]

---

## Wave 5 — Audit sweep handler + job registration

### T5-1 — Job type
**File**: `cloud/apps/api/src/queue/types.ts`

- [ ] Add `run_state_audit` to the job types union.
- [ ] Add `type RunStateAuditJobData = Record<string, never>`.
- [ ] Add `DEFAULT_JOB_OPTIONS['run_state_audit']` with sensible defaults (`expireInSeconds: 1800`, `retryLimit: 0`, no singleton).

### T5-2 — Audit handler
**File**: `cloud/apps/api/src/queue/handlers/run-state-audit.ts` (new)

- [ ] Export `createRunStateAuditHandler()`.
- [ ] Handler loads runs via broader query (raw SQL using `getReconcileWindowDays()`):
  ```sql
  SELECT id, status, config, progress, updated_at, deleted_at
  FROM runs
  WHERE deleted_at IS NULL
    AND (
      status IN ('RUNNING','PAUSED','SUMMARIZING')
      OR (status = 'COMPLETED' AND updated_at > NOW() - INTERVAL $windowDays)
    )
  ORDER BY updated_at DESC
  ```
- [ ] For each run: try/catch-wrapped per detector call. Status-gated detector list:
  - Always run: `detectPairAsymmetry(run, 'audit')`, `detectModelTranscriptShortfall(run, 'audit')`, `detectOrphanTranscript(run)`.
  - COMPLETED only: also `detectStrandedTranscript(run.id)`, `detectSummarizingStall(run)`, `detectScheduledCountMismatch(run)`.
- [ ] After collecting anomalies for a run, call `syncAnomalies(runId, type, drafts, 'audit')` per anomaly type.
- [ ] **Handler must NOT call `maybeAdvanceRunStatus`, `reconstructOrphans`, or `repairScheduledCount`.**

### T5-3 — Register handler
**File**: `cloud/apps/api/src/queue/handlers/handler-config.ts`

- [ ] Add entry to `handlerRegistrations` for `run_state_audit` → `createRunStateAuditHandler()`. Match shape of existing entries.

### T5-4 — Schedule the job
**File**: `cloud/apps/api/src/services/run/scheduler.ts`

- [ ] Inside server-startup hook (next to the existing `runRecoveryJob` scheduling or boss start path):
  ```typescript
  try {
    await boss.unschedule('run_state_audit').catch(() => {});
    await boss.schedule('run_state_audit', '0 9 * * *', {});
    log.info('Scheduled run_state_audit daily at 09:00 UTC');
  } catch (error) {
    log.error({ err: error }, 'Failed to schedule run_state_audit');
  }
  ```

### T5-5 — Tests
**File**: `cloud/apps/api/tests/queue/handlers/run-state-audit.test.ts` (new)

- [ ] Test: COMPLETED run with 5pp pair delta → audit emits `PAIR_ASYMMETRY` with `source='audit'`.
- [ ] Test: COMPLETED run where default threshold would not fire but audit does (5pp below peer median for model shortfall).
- [ ] Test: RUNNING run → `detectStrandedTranscript` / `detectSummarizingStall` / `detectScheduledCountMismatch` are NOT called (status-gated).
- [ ] Test: audit handler does NOT call `maybeAdvanceRunStatus` or `reconstructOrphans` (assert via mock spy).
- [ ] Test: default and audit anomalies coexist on the same run.

[CHECKPOINT]

---

## Wave 6 — GraphQL exposure

### T6-1 — Pothos enum + field
**File**: `cloud/apps/api/src/graphql/types/run-anomaly.ts`

- [ ] Import Prisma `RunAnomalySource` (alias if needed to avoid name collision with the GraphQL enum).
- [ ] Declare Pothos enum `RunAnomalySource` with values `DEFAULT` → Prisma `'default'`, `AUDIT` → `'audit'`. Use explicit value mapping.
- [ ] Add `source` field to the `RunAnomaly` GraphQL type using the enum.

### T6-2 — Tests
**File**: `cloud/apps/api/tests/graphql/run.test.ts`

- [ ] Add a fixture run with one `source='default'` and one `source='audit'` row.
- [ ] Query `run { anomalies { id source } }`.
- [ ] Assert both rows returned with correct enum values.

[CHECKPOINT]

---

## Wave 7 — STATUS.md cleanup + verification

### T7-1 — STATUS.md
**File**: `STATUS.md`

- [ ] Remove the follow-up entry for item #3 (audit sweep with `source` column).

### T7-2 — Verification
- [ ] `cd cloud && npx turbo lint --filter=@valuerank/db --filter=@valuerank/api` — 0 errors.
- [ ] `cd cloud && npx turbo build --filter=@valuerank/db --filter=@valuerank/api` — passes.
- [ ] `cd cloud && npm run db:test:setup && npx turbo test --filter=@valuerank/api` — all tests pass.
- [ ] `grep -RIn "syncAnomalies\|upsertAnomaly\|resolveAnomaly" cloud/apps/api/src` — every call site passes a `source` argument.
- [ ] Sanity-check the new migration applies cleanly against a dev DB with existing `RunAnomaly` rows.

[CHECKPOINT]

---

## Parallelization summary

| Wave | Parallel opportunities |
|---|---|
| 1 | T1-1 then T1-2 (migration depends on schema shape) |
| 2 | T2-1, T2-2, T2-3 edit same file (serial). T2-4 after. |
| 3 | T3-1 and T3-2 same file (serial). T3-3 after. |
| 4 | T4-1 then T4-2 |
| 5 | T5-1 first; T5-2 depends on T5-1; T5-3 and T5-4 parallelizable after T5-2; T5-5 after all |
| 6 | T6-1 then T6-2 |
| 7 | Serial |

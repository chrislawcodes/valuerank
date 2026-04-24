# Plan — Feature 035: Audit Sweep

**Branch**: feat/035-audit-sweep
**Source spec**: `spec.md` in this directory

---

## Review Reconciliation

- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: HIGH stranded-transcript + scheduled-count-mismatch on active runs: fixed — spec now restricts audit detector scope per run status. `detectStrandedTranscript` and `detectScheduledCountMismatch` only run on COMPLETED runs in audit mode; `detectOrphanTranscript` stays everywhere (has 60s age gate).
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: HIGH handler registration: fixed — spec explicitly names `handlerRegistrations` array. MEDIUM source threading: fixed — upsertAnomaly signature matches existing `(runId, draft, source)` convention.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: HIGH resolvedAt:null in upsert: fixed — spec code example now includes `resolvedAt: null` in update block. HIGH cross-source resolution risk: fixed — spec makes source filter load-bearing invariant with explicit test coverage. MEDIUM signature drift: fixed — upsertAnomaly signature matches existing. LOW migration description: fixed — single DEFAULT-clause approach.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted

## Implementation Waves

### Wave 1 — Schema + migration [CHECKPOINT]

**Files**
- `cloud/packages/db/prisma/schema.prisma`:
  - Add `enum RunAnomalySource { default; audit }`.
  - Add `source RunAnomalySource @default(default)` field on `RunAnomaly`.
  - Change `@@unique([runId, type, subject])` to `@@unique([runId, type, subject, source])`.
- `cloud/packages/db/prisma/migrations/<timestamp>_run_anomaly_source/migration.sql`:
  - `CREATE TYPE "RunAnomalySource" AS ENUM ('default', 'audit');`
  - `ALTER TABLE run_anomalies ADD COLUMN source "RunAnomalySource" NOT NULL DEFAULT 'default';`
  - `DROP INDEX "run_anomalies_run_id_type_subject_key";`
  - `CREATE UNIQUE INDEX "run_anomalies_run_id_type_subject_source_key" ON run_anomalies (run_id, type, subject, source);`

**Estimated size**: ~30 lines.

### Wave 2 — Persistence: source-scoped API [CHECKPOINT]

**Files**
- `cloud/apps/api/src/services/run/anomaly-persistence.ts`:
  - Import the Prisma-generated `RunAnomalySource` type.
  - Update `upsertAnomaly(runId, draft, source)` signature: add `source` parameter; use 4-column upsert key; include `resolvedAt: null` in the `update` object (load-bearing — re-detecting a resolved anomaly must un-resolve it).
  - Update `resolveAnomaly({runId, type, subject, source})` signature: add `source`; include it in the Prisma where clause. Set only `resolvedAt: new Date()` — **do NOT update `lastSeenAt`** (per plan-review — `lastSeenAt` is "last observed", not "last touched"; conflating the two corrupts historical analysis).
  - Update `syncAnomalies(runId, type, drafts, source)` signature: add `source`; the existing-rows `findMany` MUST include `source` in `where`.
  - `repairScheduledCount` unchanged (it doesn't touch `RunAnomaly`).
- `cloud/apps/api/tests/services/run/anomaly-persistence.test.ts`:
  - Test: upsert creates with `source`, re-upsert updates `lastSeenAt` + `resolvedAt: null`.
  - Test: `syncAnomalies(source='audit')` with empty drafts does NOT resolve rows where `source='default'`.
  - Test: cross-source rows with same `(runId, type, subject)` coexist.

### Wave 3 — Detector mode parameter (NOT just threshold overrides) [CHECKPOINT]

**Key correction from plan-review**: zero-valued thresholds don't work for `detectModelTranscriptShortfall` — its predicate is `rate < MODEL_SHORTFALL_ABSOLUTE_RATE || (rate < MODEL_SHORTFALL_RELATIVE_RATE && peerMedian > MODEL_SHORTFALL_PEER_RATE)`. With all three = 0, the detector never fires because `rate < 0` is always false. Same structural issue exists for pair asymmetry's `<= threshold` check — that one still works at 0 because identical-rate pairs harmlessly return null, but it's fragile.

Replace the "threshold overrides" concept with an explicit `mode` parameter:

**Files**
- `cloud/apps/api/src/services/run/anomaly-detection.ts`:
  - Export `type AnomalyDetectionMode = 'default' | 'audit'`.
  - `detectPairAsymmetry(run, mode = 'default')`:
    - `default` mode: fire when `maxDeltaPct > PAIR_ASYMMETRY_THRESHOLD_PCT` (current behavior).
    - `audit` mode: fire when `maxDeltaPct > 0` (any measurable delta; identical rates still return null).
  - `detectModelTranscriptShortfall(run, mode = 'default')`:
    - `default` mode: current predicate (absolute OR relative with peer-rate gate).
    - `audit` mode: fire when `rate < peerMedianRate - 0.0001` (any below-median model; the tiny epsilon avoids flagging ties from floating-point noise). Per-model `MODEL_SHORTFALL_MIN_PROBES = 10` still applies (that's the noise floor, not a severity gate).
  - Detectors without threshold gates (`detectStrandedTranscript`, `detectOrphanTranscript`, `detectScheduledCountMismatch`, `detectSummarizingStall`) take no `mode` parameter — their predicates are binary by nature (exists vs. doesn't).
- `cloud/apps/api/tests/services/run/anomaly-detection.test.ts`:
  - Test: `detectPairAsymmetry(run)` uses default threshold — existing behavior unchanged.
  - Test: `detectPairAsymmetry(run, 'audit')` fires on any non-zero delta.
  - Test: `detectModelTranscriptShortfall(run, 'audit')` fires on a model 5pp below peer median even though the default predicate (absolute 30%, relative 50%, peer 80%) wouldn't.
  - Test: `detectModelTranscriptShortfall(run, 'audit')` still skips under-sampled models (`MIN_PROBES` guard preserved).

### Wave 4 — Default sweep refactor to pass source [CHECKPOINT]

**Files**
- `cloud/apps/api/src/queue/handlers/run-state-reconcile.ts`:
  - Every call to `upsertAnomaly`, `resolveAnomaly`, `syncAnomalies` gets `source: 'default'` as the new argument.
  - No other behavior change.
- `cloud/apps/api/tests/queue/handlers/run-state-reconcile.test.ts`:
  - Update fixtures to pass `source='default'`.
  - Add test: default sweep emits `source='default'` on all persisted rows.

### Wave 5 — Audit sweep handler + job registration [CHECKPOINT]

**Files**
- `cloud/apps/api/src/queue/types.ts`: add `run_state_audit` job type and `RunStateAuditJobData = Record<string, never>`.
- `cloud/apps/api/src/queue/handlers/run-state-audit.ts` (new): ~180 lines.
  - Export `createRunStateAuditHandler()`.
  - **Broader run selection than default sweep** (per plan-review HIGH). Default sweep at `scheduler.ts:enqueueRunStateReconcileJobs` only selects COMPLETED runs with stranded or orphan signals. The audit handler cannot inherit that filter — it must scan every recent COMPLETED run AND every non-terminal run. Query:
    ```sql
    SELECT id, status, config, progress, updated_at, deleted_at
    FROM runs
    WHERE deleted_at IS NULL
      AND (
        status IN ('RUNNING', 'PAUSED', 'SUMMARIZING')
        OR (status = 'COMPLETED' AND updated_at > NOW() - INTERVAL $reconcile_window_days)
      )
    ORDER BY updated_at DESC
    ```
    Uses `getReconcileWindowDays()` from feature 034.
  - For each run, call each permitted detector, wrapping each in try/catch. Pass `mode: 'audit'` to threshold-driven detectors.
  - Per-run detector list depends on status:
    - `RUNNING | PAUSED | SUMMARIZING`: pair asymmetry, model shortfall, orphan transcript.
    - `COMPLETED`: all of the above PLUS stranded transcript, summarizing stall, scheduled count mismatch.
  - All persistence calls pass `source='audit'`.
  - Handler does NOT call `maybeAdvanceRunStatus`, `reconstructOrphans`, or `repairScheduledCount` — read-only except for `RunAnomaly` writes.
- `cloud/apps/api/src/queue/handlers/handler-config.ts` (not `index.ts` — plan-review correction): extend the `handlerRegistrations` array with a `run_state_audit` entry pointing at `createRunStateAuditHandler()`. Match the existing entries' shape.
- `cloud/apps/api/src/services/run/scheduler.ts`: inside server-startup hook, call `boss.unschedule('run_state_audit').catch(() => {})` then `boss.schedule('run_state_audit', '0 9 * * *', {})`. The `unschedule` ensures idempotency across restarts — no duplicate schedules. Wrap both in try/catch with `log.info` on success and `log.error` on failure.
- `cloud/apps/api/tests/queue/handlers/run-state-audit.test.ts` (new):
  - Test: COMPLETED run with 25pp pair asymmetry → audit emits `PAIR_ASYMMETRY` with `source='audit'`.
  - Test: RUNNING run with unsummarized transcripts → audit does NOT emit `STRANDED_TRANSCRIPT` (status-scoped).
  - Test: audit run does NOT call `reconstructOrphans` or `maybeAdvanceRunStatus`.
  - Test: audit emits rows with `source='audit'` coexisting with default-sweep `source='default'` rows.

### Wave 6 — GraphQL exposure [CHECKPOINT]

**Files**
- `cloud/apps/api/src/graphql/types/run-anomaly.ts`:
  - Define Pothos enum mapping Prisma `default`/`audit` to GraphQL values `DEFAULT`/`AUDIT`.
  - Add `source` field on the `RunAnomaly` GraphQL type using the new enum.
- `cloud/apps/api/tests/graphql/run.test.ts`: add assertion that querying `run { anomalies { source } }` returns the correct enum values for mixed default/audit rows.

### Wave 7 — STATUS.md cleanup + verification [CHECKPOINT]

**Files**
- `STATUS.md`: remove follow-up #3 (audit sweep).
- Verification:
  - `npx turbo lint build --filter=@valuerank/api` → 0 errors.
  - `npx turbo test --filter=@valuerank/api` (with DB) → all tests pass.
  - `grep -RIn "syncAnomalies\|upsertAnomaly\|resolveAnomaly" cloud/apps/api/src` → every call site passes a `source` argument.
  - Manual inspection: `boss.getSchedules()` at test server startup includes `run_state_audit`.

---

## Residual Risks (each with `verification:`)

- **Risk: the default sweep and audit sweep run on the same run at nearly the same time; if a race produces both writing the same `(runId, type, subject)` with different sources, the upserts succeed independently (different rows by unique key) — no conflict. Verify no implicit ordering assumption exists.**
  verification: integration-style test that fires default and audit handlers concurrently against the same fixture run; assert both anomaly rows land and neither overwrites the other.

- **Risk: `boss.schedule()` at server startup may register the schedule multiple times across worker restarts.**
  verification: Wave 5 wrapping — use `boss.unschedule()` before `schedule()`, or rely on PgBoss idempotency (check docs); add a test-server-startup assertion that only one schedule entry exists for the name.

- **Risk: the Pothos `RunAnomalySource` GraphQL enum name collides with the Prisma import.**
  verification: import Prisma enum as `RunAnomalySourceDb` (alias) and declare the GraphQL enum with the name `RunAnomalySource`; test that `introspection` returns the expected values.

- **Risk: audit sweep scanning every non-terminal + recent COMPLETED run daily could be slow on a large DB.**
  verification: measure duration against a dev DB seeded with 5k runs; target < 30s total. If slower, batch runs or shrink scope.

- **Risk: `undefined ?? CONSTANT` vs `0 ?? CONSTANT` — the `0` case correctly overrides because `0` is not nullish, but is easy to confuse with "unset" at a glance.**
  verification: unit test explicitly passes `overrides: { pairAsymmetryThresholdPct: 0 }` and asserts delta of 1pp fires; then passes `overrides: {}` (empty) and asserts default 0pp threshold still fires. Comment in-code explaining the `??` semantics.

---

## Verification Before Push

Per `cloud/CLAUDE.md` preflight:
1. `npx turbo lint --filter=@valuerank/db` — 0 errors.
2. `npx turbo lint --filter=@valuerank/api` — 0 errors.
3. `npm run db:test:setup`.
4. `npx turbo test --filter=@valuerank/api`.
5. `npx turbo build --filter=@valuerank/api`.

---

## Constitution Validation

| Requirement | Status |
|---|---|
| Type safety — no `any` | PASS — enums and threshold overrides typed |
| File size ≤ 400 lines prod | PASS — audit handler ~150 lines; detector edits small |
| Test coverage ≥ 80% | PASS — each wave has tests |
| Structured logging | PASS — audit handler uses its own `createLogger` |
| Prisma `migrate dev` | PASS — one migration for schema additions |
| Soft-delete filter | PASS — no change |
| Protected files untouched | PASS — CLAUDE.md/AGENTS.md/MEMORY.md/.gitignore off-limits |

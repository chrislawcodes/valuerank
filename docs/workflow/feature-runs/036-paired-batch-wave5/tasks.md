# Tasks — Feature 036: Paired-Batch Wave 5

The authoritative task list with file paths, line numbers, and grep checks lives in [`docs/tech-debt/wave5-spec.md`](../../../tech-debt/wave5-spec.md) under "Implementation tasks". This file is the FF checkpoint structure.

---

## Wave 1 — Stop writes + loud-fail

### T1-1 — Reject `launchMode` input + drop the branch

**File**: `cloud/apps/api/src/graphql/mutations/run/lifecycle.ts`

- [ ] After input validation, throw `ValidationError` if `input.launchMode != null` with the migration message from spec.
- [ ] Drop the `launchMode` branching block (lines 117–204).
- [ ] Drop writes of `jobChoiceLaunchMode`, `jobChoiceValueFirst`, `companionRunId`, `methodologySafe`.

### T1-2 — Drop launch-flow writes

**Files**:
- `cloud/apps/api/src/graphql/mutations/domain/launch/execute-runs.ts` — drop `jobChoiceLaunchMode`, `jobChoiceValueFirst`, `methodologySafe` from `executeBackfillRuns` config.
- `cloud/apps/api/src/graphql/mutations/domain/launch/plan-slots.ts` — drop `configExtras` writes of these fields. The post-Wave-4 `tokens !== null` gating goes away too — `configExtras` becomes `undefined` for all slots.
- `cloud/apps/api/src/graphql/mutations/domain/launch/plan-backfill.ts` — same as plan-slots.

### T1-3 — Delete dead `lifecycle-helpers` exports

**File**: `cloud/apps/api/src/graphql/mutations/run/lifecycle-helpers.ts`

- [ ] Delete `persistPairedCompanionRunIds`, `mergeCompanionRunId`, `getConfiguredCompanionRunId`. Confirm zero callers via grep.

[CHECKPOINT]

---

## Wave 2 — Delete `PAIRED_BATCH_TOPUP`

### T2-1 — Top-up handler

**File**: `cloud/apps/api/src/queue/handlers/top-up-probes.ts`

- [ ] Delete paths conditioned on `jobChoiceLaunchMode === 'PAIRED_BATCH_TOPUP'`. Keep generic per-run logic.

### T2-2 — Type unions

**Files**:
- `cloud/apps/web/src/components/runs/useRunForm.ts` — drop from `launchMode` union.
- `cloud/apps/web/src/api/run-json-types.ts` — drop from union.
- `cloud/apps/api/src/graphql/types/inputs/start-run.ts` — drop entire `launchMode` input field.

### T2-3 — Backfill script

**File**: `cloud/scripts/backfill-reparse-decisions.ts`

- [ ] Per spec: leave as-is for now. Filters historical data only; degrades gracefully.

[CHECKPOINT]

---

## Wave 3 — Delete dead `valuePairModelVotes`

**Files**:
- `cloud/apps/api/src/services/analysis/domain-analysis-snapshot-builder.ts` — delete computation + output field (lines ~200–250 + ~344).
- `cloud/apps/api/src/services/analysis/domain-analysis-cache-types.ts` — drop the field from the snapshot output type.
- `cloud/apps/api/src/services/analysis/domain-analysis-cache.ts` — delete `readValuePairModelVotesFromSnapshot` (line ~449).

[CHECKPOINT]

---

## Wave 4 — Prisma migration

### T4-1 — Capture pre-flight counts

- [ ] On test DB: `SELECT COUNT(*) FROM run_anomalies WHERE type = 'PAIR_ASYMMETRY';`
- [ ] On prod DB: same query (record in PR description for rollback comparison).

### T4-2 — Write the migration

**File**: `cloud/packages/db/prisma/migrations/<timestamp>_remove_pair_asymmetry_enum/migration.sql`

Two-step migration per spec:
1. `DELETE FROM run_anomalies WHERE type = 'PAIR_ASYMMETRY';`
2. Rename old enum, create new without `PAIR_ASYMMETRY`, swap column type, drop old enum.

### T4-3 — Update Prisma schema

**File**: `cloud/packages/db/prisma/schema.prisma`

- [ ] Remove `PAIR_ASYMMETRY` from `RunAnomalyType` enum.

### T4-4 — Verify on test DB

- [ ] `npx prisma migrate dev --name remove_pair_asymmetry_enum --schema packages/db/prisma/schema.prisma` runs cleanly.
- [ ] Capture deleted-rows count for comparison with prod count.

[CHECKPOINT]

---

## Wave 5 — GraphQL schema field removals

### T5-1 — `Run` type fields

**File**: `cloud/apps/api/src/graphql/types/run.ts`

- [ ] Remove `pairedBatchGroupId` field + resolver.
- [ ] Remove `companionRunId` field + resolver.
- [ ] Remove the `companionRunId?: string | null` from the type-level shape.

### T5-2 — `startRun` input

**File**: `cloud/apps/api/src/graphql/types/inputs/start-run.ts`

- [ ] Remove `launchMode` input field.

### T5-3 — `RunAnomalyType` enum

**File**: `cloud/apps/api/src/graphql/types/run-anomaly.ts`

- [ ] Remove `'PAIR_ASYMMETRY'` from `RunAnomalyTypeEnum`.
- [ ] Remove the label entry.

### T5-4 — Anomaly-detection types

**File**: `cloud/apps/api/src/services/run/anomaly-detection.ts`

- [ ] Remove `'PAIR_ASYMMETRY'` from `AnomalyDraft['type']` union and `RunAnomalyType` exported type.

### T5-5 — Re-emit schema + codegen

- [ ] `npm run emit-schema --workspace @valuerank/api`
- [ ] `npm run codegen --workspace @valuerank/web`
- [ ] Verify `cloud/apps/web/schema.graphql` updated; codegen succeeds with no orphan types.

[CHECKPOINT]

---

## Wave 6 — Web operation + UI cleanup

### T6-1 — GraphQL operations

- [ ] Drop `companionRunId`, `pairedBatchGroupId` from `cloud/apps/web/src/api/operations/runs.graphql`.
- [ ] `grep -rn "companionRunId\|pairedBatchGroupId" cloud/apps/web/src/api/operations` clean.
- [ ] Re-run codegen.

### T6-2 — Web UI deletions

**Delete**:
- [ ] `cloud/apps/web/src/pages/DefinitionDetail/StartPairedBatchPage.tsx`
- [ ] Route + nav links (search `start-paired-batch`)
- [ ] `cloud/apps/web/src/components/analysis/PairedRunComparisonCard.tsx`

**Modify**:
- [ ] `cloud/apps/web/src/components/runs/RunCard.tsx` — drop the paired-batch badge (~line 112).
- [ ] `cloud/apps/web/src/components/runs/RunForm.tsx` + `useRunForm.ts` — drop `launchMode` state, `LaunchMode` type, picker UI.
- [ ] `cloud/apps/web/src/pages/RunDetail/RunDetail.tsx` (~lines 32–40, 109, 206) — drop `launchMode`-derived labels and the topup button.
- [ ] `cloud/apps/web/src/pages/AnalysisDetail.tsx` (~lines 59–65, 305–306) — drop `launchMode`-conditional logic.
- [ ] `cloud/apps/web/src/components/analysis/tabs/OverviewSummaryTable.tsx` (~lines 304–321) — drop the `analysisMode === 'paired'` block + `companionRun`/`companionAnalysis` props.
- [ ] `cloud/apps/web/src/api/run-json-types.ts` — drop `jobChoiceLaunchMode`, `jobChoiceBatchGroupId`, `companionRunId`, `methodologySafe` from `RunConfig`.
- [ ] `cloud/apps/web/src/utils/methodology.ts` — clean leftover refs.
- [ ] `cloud/apps/web/src/utils/pairedScopeAdapter.ts` — audit + clean.

### T6-3 — Web enum consumers

- [ ] `cloud/apps/web/src/components/status/OpenAnomaliesSection.tsx` (~line 31) — drop `'PAIR_ASYMMETRY'`.
- [ ] `cloud/apps/web/src/components/status/StatusFilters.tsx` (~line 12) — drop.
- [ ] `cloud/apps/web/src/components/status/AnomalyRow.tsx` (~line 297) — drop `case 'PAIR_ASYMMETRY':`.

### T6-4 — Confirmation greps

- [ ] `grep -rn "StartPairedBatchPage\|launchMode\|jobChoiceBatchGroupId" cloud/apps/web/src --include="*.ts" --include="*.tsx"` empty (excl. Wave 6 files).
- [ ] `grep -rn "PAIR_ASYMMETRY" cloud/apps/web/src --include="*.ts" --include="*.tsx"` empty.

[CHECKPOINT]

---

## Wave 7 — MCP tool outputs

**Files** under `cloud/apps/api/src/mcp/tools/`:

- [ ] `get-run-results.ts` — drop pair fields from output.
- [ ] `get-run-summary.ts` — same.
- [ ] `grep -rn "companionRunId\|pairedBatchGroupId\|jobChoiceLaunchMode" cloud/apps/api/src/mcp/` clean.

[CHECKPOINT]

---

## Wave 8 — Tests

**Update**:
- [ ] `cloud/apps/api/tests/graphql/types/run.test.ts` — drop tests for removed fields.
- [ ] `cloud/apps/api/tests/graphql/mutations/run.test.ts` — drop `launchMode` input tests; drop `companionRunId` write assertions.
- [ ] `cloud/apps/api/tests/graphql/mutations/domain.test.ts` — same.
- [ ] `cloud/apps/api/tests/queue/handlers/top-up-probes.test.ts` (if exists) — drop `PAIRED_BATCH_TOPUP` tests.
- [ ] `cloud/apps/api/tests/services/run/anomaly-persistence.test.ts:69` — drop the `'PAIR_ASYMMETRY'` reference.

**Add**:
- [ ] Regression guard: `RunAnomalyTypeEnum` does NOT include `'PAIR_ASYMMETRY'`.
- [ ] Regression guard: `startRun` rejects `launchMode` input with `ValidationError`.

[CHECKPOINT]

---

## Wave 9 — Verify

- [ ] Lint shared, db, api, web — all clean.
- [ ] `DATABASE_URL=... JWT_SECRET=... npm run test --workspace @valuerank/api`
- [ ] `DATABASE_URL=... JWT_SECRET=... npm run test --workspace @valuerank/web`
- [ ] `npm run build --workspace @valuerank/api`
- [ ] `npm run build --workspace @valuerank/web`
- [ ] `npm run codegen --workspace @valuerank/web` — clean.
- [ ] `npx prisma migrate dev --schema packages/db/prisma/schema.prisma` — clean on test DB.
- [ ] All "Final greps" from spec § "Final greps" return empty (excluding Wave 6 files + `dist/`).

[CHECKPOINT]

# Wave 5 — Implementation Spec

**Status:** Draft
**Last updated:** 2026-05-09
**Scope:** Wave 5 of the [paired-batch removal cleanup](remove-paired-batch-concept.md). Schema + UI cleanup wave.

## What this wave does

Wave 5 deletes the schema fields and UI affordances that Wave 4 made obsolete. By the time Wave 5 starts, no code reads any of these fields — Wave 4 repointed all consumers. Wave 5 is mechanical removal:

- GraphQL schema: remove `Run.pairedBatchGroupId`, `Run.companionRunId`, `Run.launchMode` (input on `startRun`), `'PAIR_ASYMMETRY'` enum value
- Stop writing `companionRunId`, `jobChoiceLaunchMode`, `jobChoiceValueFirst`, `methodologySafe`
- Delete the `PAIRED_BATCH_TOPUP` top-up handler paths
- Delete `persistPairedCompanionRunIds`, `mergeCompanionRunId`, `getConfiguredCompanionRunId` from `lifecycle-helpers.ts` (now-dead after Wave 4)
- Delete the `StartPairedBatchPage`, the launch-mode picker on `RunForm`, the paired-batch badge on `RunCard`, the topup button on `RunDetail`
- Delete `PairedRunComparisonCard` and its render site. The pooled-vignette-metrics replacement is deferred to Wave 6.
- Database migration: delete existing `PAIR_ASYMMETRY` rows and remove the enum value
- Address the `runCategory` default change by **failing loudly**: any caller that passes `launchMode` (the input is being removed) gets a hard `ValidationError` directing them to pass `runCategory` explicitly. Pre-deploy script audit (Task 1) finds and updates internal callers.
- Delete the dead `valuePairModelVotes` storage from snapshot builder
- Update MCP tool outputs to drop pair-related fields
- Changelog entry calling out the JSON export contract change

It's a big wave by file count, but lower-risk than Wave 4 because the data-layer changes are done. The risks here are: build breaks from missing schema fields, Prisma migration data loss, and public API contract changes.

## What does NOT ship in Wave 5

| Concern | Where it goes |
|---|---|
| `legacyCompanionPairedRun.ts` deletion | Wave 6 |
| `job-choice-bridge-report.ts` script + tests deletion | Wave 6 |
| `docs/backend/paired-batch-run-flow.md` deletion | Wave 6 |
| Optional cleanup migration to strip `pair_key` and `jobChoice*` from old JSON content/config | Wave 6 (decide separately) |
| Glossary and PRD updates | Wave 6 |
| Pooled-vignette-metrics replacement card (replaces deleted `PairedRunComparisonCard`) | Wave 6 — needs design before build |

## Pre-flight (must complete before Wave 5 PR opens)

### A. Wave 4 must be merged

Confirm Wave 4 (the analysis-layer rewrite) is on `main`. Specifically:

- `Run.mirroredRuns` resolver exists
- `models-consistency.ts` and `ModelsConsistencyResult` type are gone
- Coverage dedup is signature-based
- `aggregate-preparation.ts` uses `pairedSibling`-derived partner

If any of these is missing, Wave 5 prerequisites are not met.

### B. Snapshot baseline (lighter than Wave 4)

Wave 5 changes wire format and UI, not analysis math. The numerical-drift risk is largely eliminated by Wave 4's snapshot diff. But run a quick smoke check before the PR:

```
npm run wave5:smoke -- --against production
```

This script (write it as `cloud/scripts/wave5-prod-smoke.ts`) hits the post-Wave-4 production endpoints with a basic query bundle and confirms:
- `domainCoverage`, `pressureSensitivity`, `domainEvaluation` queries work
- `Run.mirroredRuns` returns sensible data on a known paired run
- `Run.pairedBatchGroupId` and `Run.companionRunId` still resolve (about to be removed; one last sanity check)

### C. Plan the Prisma migration's data-handling step

The `RunAnomalyType` Prisma enum has `'PAIR_ASYMMETRY'` as one of its values. Existing `run_anomalies` rows with this type still exist — Wave 3 deleted the detector but preserved the historical rows.

Decision required before the migration: **delete or preserve the historical PAIR_ASYMMETRY rows?**

| Option | Effect |
|---|---|
| **Delete** (recommended) | `DELETE FROM run_anomalies WHERE type = 'PAIR_ASYMMETRY'` runs as part of the migration. Lose historical anomaly rows. The rows weren't reliable anyway (the detector fired on `>0%` delta, very noisy) and aren't surfaced in any active report. |
| Preserve | Need a placeholder type to migrate them to. There is no good placeholder — every existing type means something semantically different. Forces the migration to be more complex. |

The spec assumes "delete." If you want preserve, we have to add an `'ARCHIVED'` enum value or similar, which is itself a bigger schema change.

Before running the migration, capture a count of rows that will be deleted:

```sql
SELECT COUNT(*) FROM run_anomalies WHERE type = 'PAIR_ASYMMETRY';
```

Save the count for the rollback plan.

## Implementation tasks

Order matters. Each task assumes the previous is in place.

### Task 1 — Stop writing the soon-to-be-dead fields

Before removing anything from the schema, stop writing the fields. This way new runs after this task lands look like the post-Wave-5 state, but the schema/UI still works.

**File: `cloud/apps/api/src/graphql/mutations/run/lifecycle.ts`**

- Around lines 117–204, the single-run mutation has a branching block on `launchMode`. **Fail loudly on `launchMode`**: at the top of the mutation, after input validation, if `input.launchMode` is provided (non-null, non-undefined), throw a `ValidationError` with a clear message:

  ```
  if (input.launchMode != null) {
    throw new ValidationError(
      "launchMode is no longer supported. The 'PAIRED_BATCH' / 'PAIRED_BATCH_TOPUP' / 'AD_HOC_BATCH' / 'STANDARD' modes have been removed. " +
      "If you previously relied on launchMode='PAIRED_BATCH' to default runCategory to 'PRODUCTION', " +
      "pass runCategory: 'PRODUCTION' explicitly. See docs/tech-debt/wave5-spec.md for migration."
    );
  }
  ```

  This forces every caller to update before their next launch. Better than silent drift to `'UNKNOWN_LEGACY'`.

- Drop the `launchMode` branching block (lines 117–204) entirely. After the validation throw above, no `launchMode` value reaches the rest of the mutation.
- Drop writes of `jobChoiceLaunchMode`, `jobChoiceValueFirst`, `companionRunId`, `methodologySafe` from any mutation paths.

**Pre-deploy script audit (must run before this task):**

```
grep -rn "launchMode" cloud/scripts --include="*.ts"
```

For each script that passes `launchMode: 'PAIRED_BATCH'` (or any other value):
- If it doesn't pass `runCategory`, add `runCategory: 'PRODUCTION'` (or whichever category is appropriate for the script's purpose)
- Drop the `launchMode` argument from the call

This ensures internal scripts don't trip the new ValidationError on first run after deploy.

**File: `cloud/apps/api/src/graphql/mutations/domain/launch/execute-runs.ts`**

- Drop `jobChoiceLaunchMode` and `jobChoiceValueFirst` writes from the `executeBackfillRuns` config block (around line 143). After Wave 4 these are still being written but to no consumer; Wave 5 removes the writes.
- Drop `methodologySafe: true` write.

**File: `cloud/apps/api/src/graphql/mutations/domain/launch/plan-slots.ts`** and **`plan-backfill.ts`**

- Drop `jobChoiceLaunchMode` and `jobChoiceValueFirst` writes from the `configExtras`.

**File: `cloud/apps/api/src/graphql/mutations/run/lifecycle-helpers.ts`**

- Delete `persistPairedCompanionRunIds`, `mergeCompanionRunId`, `getConfiguredCompanionRunId`. They've been dead since Wave 4. Verify no callers via `grep -rn "persistPairedCompanionRunIds\|mergeCompanionRunId\|getConfiguredCompanionRunId" cloud/`.

### Task 2 — Delete the `PAIRED_BATCH_TOPUP` feature

**File: `cloud/apps/api/src/queue/handlers/top-up-probes.ts`**

- The handler has paths conditioned on `jobChoiceLaunchMode === 'PAIRED_BATCH_TOPUP'`. Delete those paths. Keep the generic top-up logic for individual runs.

**Files referencing `PAIRED_BATCH_TOPUP`:**

- `cloud/apps/web/src/components/runs/useRunForm.ts` — drop from the `launchMode` union type
- `cloud/apps/web/src/api/run-json-types.ts` — same
- `cloud/apps/api/src/graphql/types/inputs/start-run.ts` — drop from the documented values, then drop the entire `launchMode` input field

**File: `cloud/scripts/backfill-reparse-decisions.ts`**

- Currently filters by `jobChoiceLaunchMode IN ('PAIRED_BATCH', 'PAIRED_BATCH_TOPUP')`. After Wave 5, no new runs will have these — the script can still operate on historical data. Decide:
  - Leave as-is (filters historical data only — degrades gracefully)
  - Update the filter to use signature-based criteria
  - Delete the script (it's a backfill, not a recurring tool)

The spec assumes "leave as-is" for now; Wave 6 may revisit.

### Task 3 — Remove GraphQL schema fields

**File: `cloud/apps/api/src/graphql/types/run.ts`**

- Remove the `pairedBatchGroupId` field declaration (around lines 30, 194–200) and its resolver
- Remove the `companionRunId` field declaration (around lines 29, 174–180) and its resolver
- Remove the legacy `companionRunId?: string | null` from the type-level shape

**File: `cloud/apps/api/src/graphql/types/inputs/start-run.ts`**

- Remove the `launchMode` input field

**File: `cloud/apps/api/src/graphql/types/run-anomaly.ts`**

- Remove `'PAIR_ASYMMETRY'` from `RunAnomalyTypeEnum`
- Remove the label entry for it

**File: `cloud/apps/api/src/services/run/anomaly-detection.ts`**

- Remove `'PAIR_ASYMMETRY'` from the `AnomalyDraft['type']` union and the `RunAnomalyType` exported type

**Regenerate the schema:**

```
npm run emit-schema --workspace @valuerank/api
```

This updates `cloud/apps/web/schema.graphql`. Then:

```
npm run codegen --workspace @valuerank/web
```

### Task 4 — Update web operation files

**Files (drop the removed fields from selection sets):**

- `cloud/apps/web/src/api/operations/runs.graphql` — drop `companionRunId`, `pairedBatchGroupId`
- Any other `.graphql` operation files that select these fields (`grep -rn "companionRunId\|pairedBatchGroupId" cloud/apps/web/src/api/operations`)

After updating, run codegen again to confirm no orphan types.

### Task 5 — Web UI cleanup

**Delete:**

- `cloud/apps/web/src/pages/DefinitionDetail/StartPairedBatchPage.tsx` — the dedicated paired-batch launch page
- The route from the router
- Any nav link to the page (search for `start-paired-batch` in the codebase)

**Modify:**

- `cloud/apps/web/src/components/runs/RunCard.tsx` (line ~112): drop the paired-batch badge rendering
- `cloud/apps/web/src/components/runs/RunForm.tsx` and `useRunForm.ts`: drop the `launchMode` state, the `LaunchMode` type union, the picker UI, the conditional rendering tied to `'PAIRED_BATCH'`
- `cloud/apps/web/src/pages/RunDetail/RunDetail.tsx` (lines ~32–40, 109, 206): drop `launchMode`-derived labels and the "Start topup batch" button
- `cloud/apps/web/src/pages/AnalysisDetail.tsx` (lines ~59–65, 305–306): drop `launchMode`-conditional subtitle/interpretation logic
- `cloud/apps/web/src/components/analysis/PairedRunComparisonCard.tsx`: **delete the file.** Also delete the render site at [`OverviewSummaryTable.tsx:304-321`](../../cloud/apps/web/src/components/analysis/tabs/OverviewSummaryTable.tsx:304) (the `analysisMode === 'paired' ? <PairedRunComparisonCard ... /> : <ModeAvailabilitySection ... />` block) along with the supporting props plumbed in (`companionRun`, `companionAnalysis`). Wave 6 adds a pooled-vignette-metrics replacement card.
- `cloud/apps/web/src/api/run-json-types.ts`: drop `jobChoiceLaunchMode`, `jobChoiceBatchGroupId`, `companionRunId`, `methodologySafe` from the `RunConfig` types
- `cloud/apps/web/src/utils/methodology.ts`: any remaining references (Wave 2 already cleaned most)
- `cloud/apps/web/src/utils/pairedScopeAdapter.ts`: audit; clean up references to the removed fields

**Confirmation:**

`grep -rn "StartPairedBatchPage\|launchMode\|jobChoiceBatchGroupId" cloud/apps/web/src --include="*.ts" --include="*.tsx"` should be empty after this task (excluding `legacyCompanionPairedRun.ts` which is Wave 6).

### Task 6 — Database migration

**File: `cloud/packages/db/prisma/migrations/<timestamp>_remove_pair_asymmetry_enum/migration.sql`**

Two-step migration:

```sql
-- Step 1: delete historical PAIR_ASYMMETRY anomaly rows.
-- Detector was deleted in Wave 3; no new rows are created.
-- Rows are noisy historical artifacts (detector fired on >0% delta).
DELETE FROM run_anomalies WHERE type = 'PAIR_ASYMMETRY';

-- Step 2: remove the enum value.
-- Postgres doesn't support DROP VALUE directly; use the standard
-- "create new enum, swap, drop old" pattern.
ALTER TYPE "RunAnomalyType" RENAME TO "RunAnomalyType_old";

CREATE TYPE "RunAnomalyType" AS ENUM (
  'STRANDED_TRANSCRIPT',
  'ORPHAN_TRANSCRIPT',
  'SUMMARIZING_STALL',
  'MODEL_TRANSCRIPT_SHORTFALL',
  'SCHEDULED_COUNT_MISMATCH',
  'INVALID_RESPONSE_FAILURE'
);

ALTER TABLE run_anomalies
  ALTER COLUMN type TYPE "RunAnomalyType" USING type::text::"RunAnomalyType";

DROP TYPE "RunAnomalyType_old";
```

**Update `cloud/packages/db/prisma/schema.prisma`:**

- Remove `'PAIR_ASYMMETRY'` from the `RunAnomalyType` enum definition

**Verify the migration on the test database first:**

```
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
  npx prisma migrate dev --name remove_pair_asymmetry_enum --schema packages/db/prisma/schema.prisma
```

Capture the deleted-rows count from the test DB for comparison with prod.

### Task 7 — Update web UI consumers of the removed enum value

**Files:**

- `cloud/apps/web/src/components/status/OpenAnomaliesSection.tsx` (around line 31): drop `'PAIR_ASYMMETRY'` from the typed array
- `cloud/apps/web/src/components/status/StatusFilters.tsx` (around line 12): same
- `cloud/apps/web/src/components/status/AnomalyRow.tsx` (around line 297): remove the `case 'PAIR_ASYMMETRY':` switch branch

`grep -rn "PAIR_ASYMMETRY" cloud/apps/web/src --include="*.ts" --include="*.tsx"` should return zero matches after this task.

### Task 8 — Delete dead `valuePairModelVotes` storage

**File: `cloud/apps/api/src/services/analysis/domain-analysis-snapshot-builder.ts`**

Around lines 200–250, delete:
- The `valuePairModelVotes` computation (the loop that sums `entry.wins += aCell.wins` etc.)
- The `valuePairModelVotes` field in the snapshot output (around line 344)

**File: `cloud/apps/api/src/services/analysis/domain-analysis-cache-types.ts`**

- Remove `valuePairModelVotes?: Record<string, { wins: number; losses: number }>;` from the snapshot output type (around line 80)

**File: `cloud/apps/api/src/services/analysis/domain-analysis-cache.ts`**

- Delete the `readValuePairModelVotesFromSnapshot` function (around line 449). It's exported but no consumer imports it.

Existing snapshots in the database have this field; they'll just have an extra unused JSON key. No migration needed for the existing snapshot data.

### Task 9 — MCP tool outputs

**Files under `cloud/apps/api/src/mcp/tools/`:**

Audit for any tool that exposed pair-related fields in its output:
- `get-run-results.ts`
- `get-run-summary.ts`
- Others: `grep -rn "companionRunId\|pairedBatchGroupId\|jobChoiceLaunchMode" cloud/apps/api/src/mcp/`

For each: drop the field from the output. MCP tools are external API — note in changelog as a contract change.

### Task 10 — Tests

Update tests to reflect the removed fields:

- `cloud/apps/api/tests/graphql/types/run.test.ts`: drop tests for removed fields
- `cloud/apps/api/tests/graphql/mutations/run.test.ts`: drop `launchMode` input tests; drop `companionRunId` write assertions
- `cloud/apps/api/tests/graphql/mutations/domain.test.ts`: same
- `cloud/apps/api/tests/queue/handlers/top-up-probes.test.ts` (if exists): drop `PAIRED_BATCH_TOPUP` tests
- `cloud/apps/api/tests/services/run/anomaly-persistence.test.ts:69`: drop the `'PAIR_ASYMMETRY'` reference

Add:
- A test asserting `RunAnomalyTypeEnum` does NOT include `'PAIR_ASYMMETRY'` (regression guard)
- A test confirming the `launchMode` input is no longer accepted on `startRun` (or accepted-and-ignored, depending on backwards-compat decision)

No `@ts-ignore`, no `eslint-disable`, no `as any`.

### Task 11 — Verify

```
npm run lint --workspace @valuerank/shared
npm run lint --workspace @valuerank/db
npm run lint --workspace @valuerank/api
npm run lint --workspace @valuerank/web
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
  JWT_SECRET="test-secret-that-is-at-least-32-characters-long" \
  npm run test --workspace @valuerank/api
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
  JWT_SECRET="test-secret-that-is-at-least-32-characters-long" \
  npm run test --workspace @valuerank/web
npm run build --workspace @valuerank/api
npm run build --workspace @valuerank/web
npm run codegen --workspace @valuerank/web
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
  npx prisma migrate dev --schema packages/db/prisma/schema.prisma
```

All must return 0 errors.

### Final greps (should be empty after Wave 5)

```
grep -rn "pairedBatchGroupId\|companionRunId" cloud/apps/api/src --include="*.ts"
grep -rn "jobChoiceLaunchMode\|jobChoiceBatchGroupId\|jobChoiceValueFirst\|methodologySafe" cloud/apps/api/src --include="*.ts"
grep -rn "PAIRED_BATCH_TOPUP" cloud/apps --include="*.ts" --include="*.tsx"
grep -rn "PAIR_ASYMMETRY" cloud/apps/api cloud/apps/web --include="*.ts" --include="*.tsx" --include="*.graphql"
grep -rn "persistPairedCompanionRunIds\|mergeCompanionRunId\|getConfiguredCompanionRunId" cloud/ --include="*.ts"
grep -rn "valuePairModelVotes" cloud/apps/api/src --include="*.ts"
grep -rn "StartPairedBatchPage" cloud/apps/web/src --include="*.tsx" --include="*.ts"
```

(Some matches in `cloud/apps/api/dist/` are fine.)

`legacyCompanionPairedRun.ts` and `job-choice-bridge-report.ts` may still reference some of these — those are Wave 6 deletions.

## Order of changes

| Step | What | Why this order |
|---|---|---|
| 1 | Pre-flight (smoke test against prod, count anomaly rows) | Establishes baseline |
| 2 | Task 1 (stop writes) | Future runs match post-Wave-5 state |
| 3 | Task 2 (delete topup paths) | Frees up downstream cleanup |
| 4 | Task 8 (delete dead valuePairModelVotes) | Independent, low-risk |
| 5 | Task 6 (Prisma migration) | Schema changes need to land before code that depends on them |
| 6 | Task 3 (GraphQL schema removals) | After Prisma migration; triggers codegen |
| 7 | Task 7 (web enum consumers) | After the enum value is removed |
| 8 | Task 4 (web operation files) | After GraphQL schema |
| 9 | Task 5 (web UI cleanup) | After web ops + codegen |
| 10 | Task 9 (MCP outputs) | Independent; bundle into PR |
| 11 | Task 10 (tests) | Mechanical follow-up |
| 12 | Task 11 (verify) | Confirms green |

## Constraints

- DO NOT MODIFY: `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `cloud/agents.md`, `MEMORY.md`, `GEMINI.md`, `.gitignore`, `STATUS.md`, `experiments.md`, the docs in `docs/tech-debt/`, or any file outside the inventory above.
- DO NOT use `@ts-ignore`, `eslint-disable`, or `as any`.
- DO NOT delete `legacyCompanionPairedRun.ts` (Wave 6).
- DO NOT delete `cloud/scripts/job-choice-bridge-report.ts` (Wave 6).
- DO NOT delete `docs/backend/paired-batch-run-flow.md` (Wave 6).
- DO NOT touch `cloud/apps/api/src/graphql/queries/models-stability-math.ts`. Sample-count weighting there is intentional.
- DO NOT push or open the PR until preflight passes locally and the migration runs cleanly on the test DB.

## Risk and rollback

| Failure | Symptom | Recovery |
|---|---|---|
| Prisma migration deletes more rows than expected | Production data loss | Mitigation: capture pre-migration row count via Pre-flight C; compare post-migration. If counts diverge, the issue surfaced before deploy. |
| Migration fails on prod (Postgres can't drop the enum) | Deploy stuck | The migration is the standard "rename, create new, swap, drop" pattern that should work, but if it doesn't, revert the migration and ship without the enum removal. The `RunAnomalyType` value can stay another wave. |
| Schema removal breaks an undocumented client | External consumer hits 404 / GraphQL error | Mitigation: Wave 5's pre-flight smoke test catches this for the queries we own. External MCP/script consumers are documented in the changelog. If a client breaks, the schema change is reversible. |
| Caller passes `launchMode` after Wave 5 deploys | Hard `ValidationError` from `startRun`. Run is not created. | This is **intentional** — fail loudly so we find every caller. Mitigation: pre-deploy script audit (Task 1) finds and updates internal callers. External MCP/API consumers see the error message and update. The error message names the migration path (use `runCategory` explicitly). |
| Build break from missed UI consumer | TS error during `npm run build --workspace @valuerank/web` | Caught by preflight. Find the missed consumer, update, re-run. |

**Worst case:** `gh pr revert <wave-5-pr> --branch hotfix/wave5-revert`. The migration's row deletion is not auto-reversible; if you need to revert, the Prisma migration's down step (or a fresh migration that re-adds the enum value) restores the schema, but historical PAIR_ASYMMETRY rows are gone. This is acceptable — the rows weren't reliable.

## Cleanup after Wave 5 stabilizes (~7 days post-deploy)

| File | Action |
|---|---|
| `cloud/scripts/wave5-prod-smoke.ts` | Delete (was for the one-shot smoke check) |

Most other Wave 5 artifacts (UI deletions, schema changes, Prisma migration) are permanent.

## Sign-off log

| Phase | Approved by | Date |
|---|---|---|
| Spec reviewed (Gemini) — round 1 | | |
| Spec reviewed (Codex) — round 1 | | |
| Spec reviewed (Claude / human) | | |
| Pre-flight smoke test run | | |
| Pre-flight anomaly row count captured | | |
| Migration tested on local DB | | |
| Wave 5 PR opened | | |
| Wave 5 PR merged | | |
| Post-deploy verification | | |

## Related

- [Remove paired-batch concept](remove-paired-batch-concept.md) — parent planning doc
- [Wave 4 spec](wave4-spec.md) — predecessor wave (analysis-layer rewrite)
- [Wave 3 spec](wave3-spec.md) — anomaly-detector deletion

# Wave 3 — Implementation Spec (revised after adversarial review round 2)

**Status:** Draft
**Last updated:** 2026-05-09
**Scope:** Wave 3 of the [paired-batch removal cleanup](remove-paired-batch-concept.md).

## What changed since round 1 → round 2 → round 3

Adversarial review across two rounds caught scope errors. The spec narrowed twice; this version is the final scope.

**Round 1 → 2:** Defer schema changes, coverage logic changes, and `PAIR_ASYMMETRY` enum removal to Waves 4–5. Avoids breaking UI consumers and Prisma migrations.

**Round 2 → 3 (this version):** Defer the launch-flow changes (stop writing `batchGroupId`, delete `pair-grouping.ts`, flatten launch groups) to Wave 4 too. Two reasons:

1. The launch-mode/`jobChoiceValueFirst` writes live inside `if (group.pairKey !== null)`. Flattening groups makes that branch unreachable, silently dropping fields the spec said to keep until Wave 5.
2. Coverage dedup still keys on `batchGroupId`. New runs with null `batchGroupId` would fail to dedup → 2x coverage counts on new domains until Wave 4's dedup rewrite ships.

Net effect: **Wave 3 is anomaly-detector-only.** Plus a pre-flight production audit. That's it.

## What ships in Wave 3

Two concrete changes:

1. **Delete the PAIR_ASYMMETRY detector function** and its callers. No new `PAIR_ASYMMETRY` anomalies get produced after this ships. Existing rows in `run_anomalies` are preserved untouched. The enum value `'PAIR_ASYMMETRY'` itself stays in the GraphQL schema, the Prisma enum, and the TS type union — Wave 5 removes it. UI code that switches on the value keeps working.
2. **Pre-flight production data audit.** Confirm zero historical paired definitions are missing value tokens before Wave 4 starts removing the `jobChoiceValueFirst` fallback in coverage.

What is **not** in scope:

| Concern | Where it goes |
|---|---|
| Stop writing `jobChoiceBatchGroupId` in launch flows | Wave 4 (deferred from Wave 3 in round-3 review) |
| Delete `pair-grouping.ts` and flatten launch groups | Wave 4 (same reason) |
| `Run.config.companionRunId` | Wave 4 — repoint readers, then Wave 5 stops writing |
| `Run.config.jobChoiceLaunchMode` | Wave 5 |
| `Run.config.jobChoiceValueFirst` | Wave 4 (remove the coverage fallback that reads it) + Wave 5 (stop writing) |
| `PAIRED_BATCH_TOPUP` feature | Wave 5 |
| `Run.pairedBatchGroupId` GraphQL field removal | Wave 5 |
| `PAIR_ASYMMETRY` enum value removal + Prisma migration | Wave 5 |
| Coverage direction labeling rewrite | Wave 4 — coverage helper already reads `definitionSnapshot.components` on the primary path; Wave 4 removes the legacy `jobChoiceValueFirst` fallback |
| Coverage dedup rewrite | Wave 4 |
| Models Consistency / transcript-view repoint | Wave 4 |
| UI cleanup (`RunCard` badge, `StartPairedBatchPage` deletion) | Wave 5 |

This narrowness is deliberate. Each later wave is independently ship-able once Wave 3 is in.

## Pre-flight (must complete before Wave 3 PR opens)

### A. Wave 2 must be merged

Confirm Wave 2's commit (`06a1a242` or its squash equivalent) is on `main`. Wave 3 assumes `methodology.pair_key` is gone and that resolvers are token-only.

### B. Production data audit — paired definitions must have value tokens

This is non-negotiable. Wave 4 will start reading value tokens from `Run.config.definitionSnapshot.components` to derive direction. If any production paired definition is missing those tokens, runs against it will silently disappear from coverage matrices.

Run from the repo root, against production via Railway:

```sql
-- Definitions that have been launched as paired runs but are missing value tokens.
-- Scopes to the specific definitions used in paired launches, not their whole domain,
-- to avoid over-reporting unrelated definitions.
SELECT DISTINCT
  d.id,
  d.domain_id,
  d.name,
  d.content -> 'methodology' ->> 'family' AS methodology_family,
  d.content -> 'components' -> 'value_first' ->> 'token' AS value_first_token,
  d.content -> 'components' -> 'value_second' ->> 'token' AS value_second_token
FROM definitions d
JOIN runs r ON r.definition_id = d.id
WHERE d.deleted_at IS NULL
  AND r.deleted_at IS NULL
  AND r.config ->> 'jobChoiceLaunchMode' IN ('PAIRED_BATCH', 'PAIRED_BATCH_TOPUP')
  AND (
    d.content -> 'components' -> 'value_first' ->> 'token' IS NULL
    OR d.content -> 'components' -> 'value_second' ->> 'token' IS NULL
  );
```

**Expected result:** zero rows. If any rows return:

1. Stop. Do not start Wave 4.
2. Open a follow-up issue: "Backfill value tokens for legacy paired definitions: <N> rows."
3. Backfill the missing tokens before Wave 4 ships. There is no allowlist option — Wave 4 needs every paired definition to have value tokens or coverage will silently drop those runs.

The script `cloud/scripts/preflight-wave4-token-audit.sql` should be added to the repo for posterity. (Note: "wave4" not "wave3" because the audit gates Wave 4's coverage rewrite, not Wave 3's anomaly-detector deletion.)

### C. Existing anomaly count baseline

Capture the current count of `PAIR_ASYMMETRY` anomalies. Used for verification post-deploy that no new ones are created. SQL:

```sql
SELECT COUNT(*) FROM run_anomalies
WHERE type = 'PAIR_ASYMMETRY' AND resolved_at IS NULL;
```

Save the result alongside the data-audit output.

## Implementation tasks

### Task 1 — Delete `detectPairAsymmetry` function and remove its callers

The detector finds sibling runs by `Run.config.jobChoiceBatchGroupId`. Wave 3 stops writing that field (Task 2), so the detector would return `null` for all new runs anyway. Deleting it cleanly stops generating new `PAIR_ASYMMETRY` anomalies. Existing anomalies in the database are preserved.

**File: [cloud/apps/api/src/services/run/anomaly-detection.ts](../../cloud/apps/api/src/services/run/anomaly-detection.ts)**

- Delete the `detectPairAsymmetry` function (currently lines 255–360 — verify with line-count before editing; size has shifted post-Wave-2).
- Delete the imports `PAIR_ASYMMETRY_MIN_PROBES`, `PAIR_ASYMMETRY_THRESHOLD_PCT` (currently lines 9–10).
- Delete the `pairAsymmetryThresholdPct?: number` field from the `AnomalyThresholds` type (currently around line 75) — no callers after the function is gone.
- Delete the `getGroupId` helper (currently around line 105) **only if it has no other callers**. Run `grep -rn "getGroupId" cloud/apps/api/src` to confirm.
- Delete the `RunConfig.jobChoiceBatchGroupId` field declaration (currently around line 43) **only if it has no other readers in this file**.
- Leave `'PAIR_ASYMMETRY'` in the `AnomalyDraft['type']` union and the `RunAnomalyType` exported type. They survive until Wave 5. Web code that switches on these continues to compile and render historical anomalies.

**File: [cloud/apps/api/src/services/run/anomaly-thresholds.ts](../../cloud/apps/api/src/services/run/anomaly-thresholds.ts)**

- Delete `PAIR_ASYMMETRY_THRESHOLD_PCT` and `PAIR_ASYMMETRY_MIN_PROBES` exports (currently lines 4–5). Confirm no other importers via `grep -rn "PAIR_ASYMMETRY_THRESHOLD_PCT\|PAIR_ASYMMETRY_MIN_PROBES" cloud/`.

**File: [cloud/apps/api/src/queue/handlers/run-state-reconcile.ts](../../cloud/apps/api/src/queue/handlers/run-state-reconcile.ts)**

- Remove the `detectPairAsymmetry` import.
- Remove both `syncAnomalies(runId, 'PAIR_ASYMMETRY', pair === null ? [] : [pair], 'default')` call sites (currently lines 260 and 284) and their surrounding try/catch blocks. Verify by `grep -n "PAIR_ASYMMETRY" cloud/apps/api/src/queue/handlers/run-state-reconcile.ts`.

**File: [cloud/apps/api/src/queue/handlers/run-state-audit.ts](../../cloud/apps/api/src/queue/handlers/run-state-audit.ts)**

- Remove `'PAIR_ASYMMETRY'` from the `scannedTypes` array (currently around line 96). Without this, the audit handler would call `syncAnomalies` with an empty drafts list, which would silently *resolve* existing `PAIR_ASYMMETRY` anomalies as it sweeps. We want existing anomalies preserved as historical record.

### Task 2 — Update affected tests

Tests asserting on the `PAIR_ASYMMETRY` detector or its surrounding wiring:

| File | What asserts | Action |
|---|---|---|
| [cloud/apps/api/tests/services/run/anomaly-detection.test.ts](../../cloud/apps/api/tests/services/run/anomaly-detection.test.ts) | `PAIR_ASYMMETRY` detector tests | Delete the entire `detectPairAsymmetry` describe block |
| [cloud/apps/api/tests/services/run/anomaly-persistence.test.ts:69](../../cloud/apps/api/tests/services/run/anomaly-persistence.test.ts:69) | References `'PAIR_ASYMMETRY'` type literal | Audit: keep if it's just exercising the type union (still allowed), update if it asserts the detector ran |
| [cloud/apps/api/tests/queue/handlers/run-state-audit.test.ts:76](../../cloud/apps/api/tests/queue/handlers/run-state-audit.test.ts:76) | Asserts `'PAIR_ASYMMETRY'` is in `scannedTypes` | Remove that specific assertion — we removed it from `scannedTypes` |

The launch-flow tests ([run.test.ts:677](../../cloud/apps/api/tests/graphql/mutations/run.test.ts:677), [domain.test.ts:577](../../cloud/apps/api/tests/graphql/mutations/domain.test.ts:577), [domain-coverage-integration.test.ts:60](../../cloud/apps/api/tests/graphql/queries/domain-coverage-integration.test.ts:60)) still assert `jobChoiceBatchGroupId` writes — leave them alone in Wave 3. Wave 4 updates them when the writes actually stop.

No `@ts-ignore`, no `eslint-disable`, no `as any`. Fix types properly.

### Task 3 — Verify

Run from `cloud/`:

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
```

All must return 0 errors. Pre-existing warnings are fine.

**No codegen needed.** Wave 3 makes no schema changes.

## Order of changes

| Step | What | Why this order |
|---|---|---|
| 1 | Pre-flight data audit | Gates Wave 4, but run during Wave 3 prep. If production has token-less paired definitions, schedule the backfill now so Wave 4 isn't blocked later. |
| 2 | Pre-flight anomaly count baseline | Establishes "current PAIR_ASYMMETRY count" — verified post-deploy that no new ones appear |
| 3 | Delete `detectPairAsymmetry` + reconciler call sites + `scannedTypes` entry + threshold constants | The actual code change |
| 4 | Update affected tests | Mechanical follow-up |
| 5 | Run preflight | Confirms green |

This is a single, small PR. ~5 files of code change plus test updates.

## Constraints

- **DO NOT MODIFY:** `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `MEMORY.md`, `GEMINI.md`, `.gitignore`, `STATUS.md`, `experiments.md`, the docs in `docs/tech-debt/` (this spec, the parent plan), or any file outside the inventory above. If you discover a file that needs changing, flag it in the PR description, do not edit it.
- **DO NOT** use `@ts-ignore`, `eslint-disable`, or `as any` to silence type errors.
- **DO NOT** change the GraphQL schema. No `Run.pairedBatchGroupId` removal, no `PAIR_ASYMMETRY` enum value removal. Those are Wave 5.
- **DO NOT** touch coverage logic (direction labeling, dedup). Wave 4.
- **DO NOT** touch the launch flow. No `pair-grouping.ts` deletion, no `jobChoiceBatchGroupId` writes-stop, no `launch-orchestrator.ts` flattening. Wave 4.
- **DO NOT** touch `companionRunId`, `jobChoiceLaunchMode`, or `PAIRED_BATCH_TOPUP`. Later waves.
- **DO NOT** push or open the PR until preflight passes locally.

## Post-deploy verification

48 hours after Wave 3 deploys:

1. Run the anomaly count query:
   ```sql
   SELECT COUNT(*) FROM run_anomalies
   WHERE type = 'PAIR_ASYMMETRY'
     AND resolved_at IS NULL
     AND created_at > '<wave-3-deploy-time>';
   ```
   Expected: zero. If non-zero, the deletion of `detectPairAsymmetry` didn't fully take effect — grep prod for `detectPairAsymmetry` callers.
2. Confirm the [parent plan](remove-paired-batch-concept.md) sign-off log gets the Wave 3 row checked.

That's it. Wave 3 doesn't change coverage matrices, the launch flow, or anything observable in the UI. The verification surface is correspondingly small.

## Rollback

If Wave 3 deploys but new `PAIR_ASYMMETRY` anomalies still appear:
- A caller of `detectPairAsymmetry` was missed. Grep prod for `detectPairAsymmetry` and patch.

If anything else regresses:
- It shouldn't. Wave 3's blast radius is intentionally minimal. If something does break, the wave's narrowness makes a revert cheap: `gh pr revert <wave-3-pr> --branch hotfix/wave3-revert`. Wave 2 is unaffected.

## Sign-off log

| Phase | Approved by | Date |
|---|---|---|
| Spec reviewed (Gemini) — round 1 | review complete; findings incorporated | 2026-05-09 |
| Spec reviewed (Codex) — round 1 | review complete; findings incorporated | 2026-05-09 |
| Spec reviewed (Gemini) — round 2 | review complete; deferred launch-flow changes to Wave 4 | 2026-05-09 |
| Spec reviewed (Codex) — round 2 | review complete; same | 2026-05-09 |
| Spec reviewed (Claude / human) | | |
| Pre-flight data audit run (gates Wave 4, scheduled now) | | |
| Wave 3 PR opened | | |
| Wave 3 PR merged | | |
| Post-deploy verification 48 hours | | |

## Related

- [Remove paired-batch concept](remove-paired-batch-concept.md) — parent planning doc
- [Wave 2 commit (06a1a242)](https://github.com/chrislawcodes/valuerank/commit/06a1a242) — `pair_key` deletion

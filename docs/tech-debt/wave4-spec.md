# Wave 4 — Implementation Spec (signature-based, simplified)

**Status:** Final draft
**Last updated:** 2026-05-09
**Scope:** Wave 4 of the [paired-batch removal cleanup](remove-paired-batch-concept.md). The big analysis-layer rewrite.

## What this wave does

Wave 4 stops the analysis layer from depending on launch-time pair grouping. The replacement primitive is **signature + value tokens**: two runs are comparable when they have the same trial signature (`v{definitionVersion}t{temperature}`) and their definitions have mirrored value tokens.

After this wave:

- Coverage matrices dedup by `(signature, canonical-value-pair)`. No `batchGroupId` reads.
- Paired-mode transcript view fetches *all* mirrored runs at the same signature, not "the partner." No tie-breaking, no time windows.
- **Models Consistency report is deleted entirely.** Archived feature.
- Aggregate analysis preparation derives partners from `Definition.pairedSibling`. Falls back to the legacy `companionRunId` only when the template has it set.
- Domain launch flow stops writing `jobChoiceBatchGroupId`. `jobChoiceLaunchMode` and `jobChoiceValueFirst` writes hoist out of the now-deleted pair-conditional branch.

It's the analysis-rewrite wave so it carries real risk of silent numerical drift. The wave bundles a snapshot-baseline + post-deploy diff regime.

## Decisions confirmed by the user before this revision

| # | Decision | Rationale |
|---|---|---|
| 1 | When viewing analysis for run A, "find values from the opposite order" means *get all matching mirrored runs*, not pick one partner | Removes the partner concept from the data model. No tie-breaking. |
| 2 | Always pool same-signature mirrored data | Pool across launches automatically. No per-launch grouping. |
| 3 | Delete the Models Consistency report entirely | Already archived; removing it eliminates a major chunk of `companionRunId` consumers |
| 4 | Models Stability's sample-count weighting (`weightedMean` in `models-stability-math.ts`) stays as-is | Intentional design choice for that report; out of scope here |

## What does NOT ship in Wave 4

| Concern | Where it goes |
|---|---|
| `Run.pairedBatchGroupId` GraphQL schema field removal | Wave 5 |
| `Run.config.companionRunId` writes-stop | Wave 5 |
| `Run.config.jobChoiceLaunchMode` writes-stop | Wave 5 |
| `Run.config.jobChoiceValueFirst` writes-stop | Wave 5 |
| `PAIRED_BATCH_TOPUP` feature deletion | Wave 5 |
| `PAIR_ASYMMETRY` enum value removal + Prisma migration | Wave 5 |
| UI cleanup (`RunCard` badge, `StartPairedBatchPage` deletion, launch-mode picker) | Wave 5 |
| `legacyCompanionPairedRun.ts` deletion | Wave 6 |
| Dead `valuePairModelVotes` storage cleanup | Wave 5 or 6 (no consumer reads it; safe to delete) |

## The comparability primitive

A "mirrored run" of a given run is a run where:

1. Same signature (`formatRunSignature` from [`domain-coverage-gql-types.ts:144`](../../cloud/apps/api/src/graphql/queries/domain-coverage-gql-types.ts:144))
2. Definition has mirrored value tokens (A's `value_first.token` = B's `value_second.token` and vice versa)
3. Same domain
4. Not soft-deleted

Multiple matches are pooled. The plural is the API.

## Pre-flight (must complete before Wave 4 PR opens)

### A. Wave 3 must be merged

Confirm the Wave 3 squash commit (`9704624f`) is on `main`.

### B. Production data audit — paired definitions must have value tokens

```sql
SELECT DISTINCT
  d.id, d.domain_id, d.name,
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

Expected: zero rows. If any rows return, backfill before Wave 4.

Save as `cloud/scripts/preflight-wave4-token-audit.sql`.

### C. Pre-flight: version-divergence audit (new — addresses Codex round-1 critical #2)

The signature-based dedup splits runs whose paired-sibling definitions have diverged versions (because signature includes `definitionVersion`). Old `batchGroupId`-based dedup merged them. Find any production paired definition pairs where versions differ:

```sql
WITH paired_pairs AS (
  SELECT
    d1.id AS def_a_id,
    d1.version AS def_a_version,
    d1.content -> 'components' -> 'value_first' ->> 'token' AS def_a_first,
    d1.content -> 'components' -> 'value_second' ->> 'token' AS def_a_second,
    d2.id AS def_b_id,
    d2.version AS def_b_version
  FROM definitions d1
  JOIN definitions d2 ON d1.domain_id = d2.domain_id AND d1.id != d2.id
  WHERE d1.deleted_at IS NULL
    AND d2.deleted_at IS NULL
    AND d1.content -> 'components' -> 'value_first' ->> 'token' = d2.content -> 'components' -> 'value_second' ->> 'token'
    AND d1.content -> 'components' -> 'value_second' ->> 'token' = d2.content -> 'components' -> 'value_first' ->> 'token'
)
SELECT * FROM paired_pairs WHERE def_a_version != def_b_version;
```

If any rows return: those pairs will dedup as 2 units after Wave 4 (was 1). Document each in the allowed-deltas file as expected. Not a blocker — just transparency.

### D. Snapshot baseline capture (one-shot)

Write `cloud/scripts/wave4-prod-baseline.ts` that hits production GraphQL with a fixed query bundle and writes timestamped JSON to `cloud/tests/snapshot-baselines/wave4-prod-pre-deploy-${ISO_DATE}.json`. Commit the file before opening the Wave 4 PR.

Query bundle:
- `domainCoverage` for the 3 most-active domains (last 30 days)
- `pressureSensitivity` for the 5 most-recently-launched paired definitions
- `runAnomaliesByType` for the last 7 days

(`modelsConsistency` is deleted — not in the bundle. Wave 4 verifies the page is gone.)

Pin resolved entity IDs in the baseline JSON.

## Implementation tasks

Order matters.

### Task 1 — Coverage dedup: `(signature, canonical-pair)` replacement

**File: [`cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts`](../../cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts)**

Replace `deduplicateRunsByGroupId` with `deduplicateRunsBySignaturePair`:

```
deduplicateRunsBySignaturePair<T extends { config: unknown }>(
  runs: T[],
  options?: { completenessOf?: (run: T) => boolean }
): T[]
```

Dedup key per run: `(formatRunSignature(run.config), canonicalValuePairKey(run.config.definitionSnapshot.components))`.

Where `canonicalValuePairKey(components)` returns `[components.value_first.token, components.value_second.token].sort().join('::')` — lex-sorted matches the analysis layer.

Tie-breaking: same `completenessOf` semantics as the old function.

Delete `getCoverageBatchGroupId`. Delete the `jobChoiceValueFirst` fallback in coverage direction labeling. Audit every caller of `deduplicateRunsByGroupId` and swap to the new function.

**Why it preserves historical counts in the common case:** both halves of a single paired-batch launch have the same `definitionVersion` (sibling definitions launched together) and same temperature, so signature matches; mirrored tokens give same canonical key. They merge as before.

**Documented exception (Pre-flight C):** if any production paired definitions have divergent versions, they'll split. Listed in `wave4-allowed-deltas.json`.

### Task 2 — Paired-mode transcript view: fetch all mirrored runs

**Add `Run.mirroredRuns: [Run!]!` GraphQL resolver.**

**File: [`cloud/apps/api/src/graphql/types/run.ts`](../../cloud/apps/api/src/graphql/types/run.ts)**

```graphql
type Run {
  ...
  """
  All non-deleted runs in the same domain whose definition has mirrored
  value tokens AND whose signature matches this run's signature. Pooled
  for analysis-time order-effect comparison. Empty when no mirrored runs
  exist or when this run isn't a paired-vignette run.
  """
  mirroredRuns: [Run!]!
}
```

Implementation:

1. Compute `signature = formatRunSignature(run.config)`.
2. Get the run's definition's value tokens via `getComponentTokens(definition.content)`. If null, return `[]`.
3. Find all definitions in the same domain whose tokens are mirrored.
4. Query all runs of those definitions ordered by `createdAt DESC`, filter to runs where `formatRunSignature(config) === signature` and `deletedAt === null`. Exclude the current run id.
5. Return the full list.

No tie-breaking. No "most recent" pick. Caller pools.

**Update: [`cloud/apps/web/src/api/operations/runs.graphql`](../../cloud/apps/web/src/api/operations/runs.graphql)**

Add `mirroredRuns { id, status, ... }` to the relevant Run fragments. Run `npm run codegen --workspace @valuerank/web`.

**Repoint paired-mode UI consumers** to read `run.mirroredRuns` (plural) instead of `run.companionRunId` (singular):

- [`cloud/apps/web/src/utils/analysisTranscriptParams.ts`](../../cloud/apps/web/src/utils/analysisTranscriptParams.ts) — drop the `companionRunId` URL param as primary, keep as optional filter
- [`cloud/apps/web/src/hooks/useAnalysisTranscriptsData.ts`](../../cloud/apps/web/src/hooks/useAnalysisTranscriptsData.ts) — fetch transcripts for ALL `mirroredRuns`, not just one companion
- [`cloud/apps/web/src/hooks/useAnalysisTranscriptParams.ts`](../../cloud/apps/web/src/hooks/useAnalysisTranscriptParams.ts) — same
- [`cloud/apps/web/src/utils/pairedScopeAdapter.ts`](../../cloud/apps/web/src/utils/pairedScopeAdapter.ts) — audit; should already use value tokens
- [`cloud/apps/web/src/pages/AnalysisDetail.tsx`](../../cloud/apps/web/src/pages/AnalysisDetail.tsx) — replace `run.companionRunId` reads with `run.mirroredRuns` iteration

**Tests:**

- Existing test at [`AnalysisConditionDetail.test.tsx:711`](../../cloud/apps/web/tests/pages/AnalysisConditionDetail.test.tsx:711) — adapt or delete; the "absent companionRunId" path is now the default, not a fallback.
- New: "mirroredRuns returns all same-signature mirrored runs in domain."
- New: "mirroredRuns returns empty for a non-paired run."
- New: "mirroredRuns excludes deleted runs."
- New: "mirroredRuns excludes the run itself."

### Task 3 — Delete Models Consistency entirely

The whole report goes away.

**API side:**

- Delete [`cloud/apps/api/src/graphql/queries/models-consistency.ts`](../../cloud/apps/api/src/graphql/queries/models-consistency.ts)
- Delete [`cloud/apps/api/src/services/consistency/orderEffectPairing.ts`](../../cloud/apps/api/src/services/consistency/orderEffectPairing.ts) — used only by Models Consistency. Verify with `grep -rn "orderEffectPairing\|computeOrderEffect" cloud/apps/api/src` before deleting.
- Delete the API tests for Models Consistency (`grep -rn "modelsConsistency\b\|ModelsConsistencyResult" cloud/apps/api/tests`)

**GraphQL schema:**

- Remove the `modelsConsistency` query and the `ModelsConsistencyResult` (plus its sub-types) from the GraphQL schema. The schema is generated from Pothos type declarations — this means deleting the type-builder files (likely under `cloud/apps/api/src/graphql/types/` for any consistency types).
- Run `npm run emit-schema --workspace @valuerank/api` to regenerate `cloud/apps/web/schema.graphql`. Then `npm run codegen --workspace @valuerank/web`.

**Web side:**

- Delete [`cloud/apps/web/src/api/operations/modelsConsistency.ts`](../../cloud/apps/web/src/api/operations/modelsConsistency.ts) and the matching `.graphql` operation file.
- Find and delete the page component (`grep -rn "ModelsConsistencyResult\|modelsConsistency" cloud/apps/web/src/pages` should locate it).
- Delete the route from the router.
- Remove any nav link / menu entry pointing to the page.
- Delete the page's tests.

**Final grep should return empty:**

```
grep -rn "modelsConsistency\|ModelsConsistencyResult\|orderEffectPairing\|computeOrderEffect\|getCompanionRunId" cloud/ \
  --include="*.ts" --include="*.tsx" --include="*.graphql"
```

(`getCompanionRunId` lives in `models-consistency.ts` — should disappear with it. If it's used elsewhere, audit.)

### Task 4 — Aggregate-prep: derive partner from `pairedSibling`

**File: [`cloud/apps/api/src/services/analysis/aggregate/aggregate-preparation.ts`](../../cloud/apps/api/src/services/analysis/aggregate/aggregate-preparation.ts)**

Around lines 284–288, the aggregate prep reads `companionRunId` from the run's template config. Replace with sibling-derivation:

- If `templateConfig.companionRunId` is set, use it (legacy compat — preserves historical aggregate templates).
- Otherwise, look up the run's definition's `pairedSibling`. If a sibling exists, find the most recent run of the sibling that matches the current run's signature. That's the partner.
- If no sibling or no matching run, no partner.

This is simpler than Task 2's full pooling because aggregate-prep needs *one* partner per run (the historical template behavior), not the full pooled set.

### Task 5 — Stop writing `jobChoiceBatchGroupId`, delete pair-grouping, flatten launch groups

This is the launch-flow surgery. Order within the task matters.

**5a. Hoist `jobChoiceLaunchMode` and `jobChoiceValueFirst` writes out of the pair-conditional branch.** Without this, flattening (5b) makes the writes unreachable.

- [`cloud/apps/api/src/graphql/mutations/domain/launch/plan-slots.ts`](../../cloud/apps/api/src/graphql/mutations/domain/launch/plan-slots.ts) (around line 120)
- [`cloud/apps/api/src/graphql/mutations/domain/launch/execute-runs.ts`](../../cloud/apps/api/src/graphql/mutations/domain/launch/execute-runs.ts) (around line 127)
- [`cloud/apps/api/src/graphql/mutations/run/lifecycle.ts`](../../cloud/apps/api/src/graphql/mutations/run/lifecycle.ts) (around lines 117–204)

In each: move the writes for `jobChoiceLaunchMode` and `jobChoiceValueFirst` outside the `if (group.pairKey !== null)` (or equivalent) block so every launch slot's `configExtras` gets them. Inside the conditional, only `jobChoiceBatchGroupId` and the `batchGroupId = randomUUID()` generator stay (scheduled for deletion in 5d).

Verify with tests that runs created via every launch path still have `jobChoiceLaunchMode` and `jobChoiceValueFirst` populated.

**5b. Delete `pair-grouping.ts` module.**

- Delete [`cloud/apps/api/src/graphql/mutations/domain/launch/pair-grouping.ts`](../../cloud/apps/api/src/graphql/mutations/domain/launch/pair-grouping.ts) entirely.

**5c. Flatten launch groups in the orchestrator.**

- [`cloud/apps/api/src/graphql/mutations/domain/launch/launch-orchestrator.ts`](../../cloud/apps/api/src/graphql/mutations/domain/launch/launch-orchestrator.ts): remove the `groupDefinitionsByPairKey` import (around line 8), the call site (around line 97), and the `incompletePairKeys` warning loop. Each targeted definition becomes its own launch group.
- [`cloud/apps/api/src/graphql/mutations/domain/launch/types.ts`](../../cloud/apps/api/src/graphql/mutations/domain/launch/types.ts): remove `LaunchGroup.pairKey` if no longer read.

**5d. Drop `jobChoiceBatchGroupId` writes.**

- `plan-slots.ts`, `plan-backfill.ts`, `execute-runs.ts`: delete the `jobChoiceBatchGroupId` line and the `batchGroupId = randomUUID()` generator.
- `resolve-backfill.ts`: audit `runMatchesSingleModel`; remove any `batchGroupId` comparison.
- `backfill-orchestrator.ts`: drop pair-aware backfill mode.
- `lifecycle.ts`: drop `jobChoiceBatchGroupId` writes (lines ~117–204). Keep the `jobChoiceLaunchMode` branching — Wave 5 deletes that.

### Task 6 — Update tests

| File | What asserts | Action |
|---|---|---|
| [`run.test.ts:677`](../../cloud/apps/api/tests/graphql/mutations/run.test.ts:677) | `jobChoiceBatchGroupId` is set | Drop that assertion. Keep `jobChoiceLaunchMode`. |
| [`domain.test.ts:577`](../../cloud/apps/api/tests/graphql/mutations/domain.test.ts:577) | Same | Same |
| [`domain-coverage-integration.test.ts:60`](../../cloud/apps/api/tests/graphql/queries/domain-coverage-integration.test.ts:60) | Dedup-by-batchGroupId behavior | Replace with dedup-by-signature-pair assertions |
| Any test asserting on Models Consistency | Various | Delete (Task 3) |
| `cloud/apps/api/tests/graphql/types/run.test.ts` (extend or new) | — | Add `mirroredRuns` resolver tests (see Task 2) |

**New equivalence test:** `cloud/apps/api/tests/services/analysis/coverage-equivalence.test.ts`. On a fixture where paired runs have matching signatures and mirrored tokens, assert `deduplicateRunsBySignaturePair` produces the same dedup key set as `deduplicateRunsByGroupId` did. Document the version-divergence case as a known divergence.

No `@ts-ignore`, no `eslint-disable`, no `as any`.

### Task 7 — Verify

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
```

All must return 0 errors. Codegen runs because Task 2 adds `Run.mirroredRuns` and Task 3 removes `modelsConsistency`.

### Task 8 — Snapshot diff against pre-deploy baseline

```
npm run wave4:verify -- --baseline cloud/tests/snapshot-baselines/wave4-prod-pre-deploy-${ISO_DATE}.json
```

**Allowed deltas (only these are non-failures):**

| Delta | Reason |
|---|---|
| Coverage matrix counts may *decrease* where the same paired pair was launched multiple times at the same signature | Signature-based dedup pools across launches (matches "look at the data directly") |
| Coverage matrix counts may *increase* (split) for paired pairs whose sibling definitions have divergent `definitionVersion` | Documented in Pre-flight C; expected when versions diverge |
| `Run.config.jobChoiceBatchGroupId` returns null on new runs | Wave 4 stops writing |
| `modelsConsistency` query returns 404 | Feature deleted |

Any other delta fails CI.

## Order of changes

| Step | What | Why this order |
|---|---|---|
| 1 | Pre-flight: data audit + version-divergence audit + baseline capture | Gates the wave |
| 2 | Task 2 (`mirroredRuns` resolver + codegen) | Other tasks may depend on this |
| 3 | Task 1 (coverage dedup + direction) | Readers must work with definitionSnapshot path before legacy fallback removed |
| 4 | Task 3 (delete Models Consistency) | Independent; can land in any order |
| 5 | Task 4 (aggregate-prep) | Independent |
| 6 | Task 5 (launch flow) | Last — depends on readers being repointed |
| 7 | Task 6 (tests) | Mechanical follow-up |
| 8 | Task 7 (preflight) + Task 8 (snapshot diff) | Confirms green |

Steps 3 and 4 and 5 can ship in separate PRs if the diff gets too large. Step 6 (launch flow) must be last regardless. For this implementation we ship as one PR — the wave is already a defined unit.

## Constraints

- DO NOT MODIFY: `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `cloud/agents.md`, `MEMORY.md`, `GEMINI.md`, `.gitignore`, `STATUS.md`, `experiments.md`, the docs in `docs/tech-debt/`, or any file outside the inventory above.
- DO NOT use `@ts-ignore`, `eslint-disable`, or `as any`.
- DO NOT change the GraphQL schema except to ADD `Run.mirroredRuns` and REMOVE `modelsConsistency` + `ModelsConsistencyResult`. No `Run.pairedBatchGroupId` removal, no `companionRunId` removal, no enum changes — Wave 5.
- DO NOT touch `companionRunId` writes, `jobChoiceLaunchMode` writes (other than the hoist in Task 5a), `jobChoiceValueFirst` writes (other than the hoist in Task 5a). Wave 5.
- DO NOT touch `models-stability-math.ts`. The sample-count weighting there is intentional for that report (more data = more reliable estimate). Out of scope.
- DO NOT delete `legacyCompanionPairedRun.ts` (Wave 6).
- DO NOT delete `lifecycle-helpers.ts` `persistPairedCompanionRunIds`. Becomes dead code after Wave 4 but stays defined until Wave 5.
- DO NOT introduce time-window heuristics. Signature + value tokens are the comparability primitive.

## Risk and rollback

| Failure | Symptom | Recovery |
|---|---|---|
| Direction labeling wrong on historical runs | Coverage matrices show flipped direction counts | Pre-flight gates this. Should not happen. |
| Coverage counts shift unexpectedly | Snapshot diff rejects | Inspect the specific shift. Most likely: same paired pair launched multiple times at same signature (expected delta) or version-divergent paired definitions (also expected). If the shift looks wrong, revert. |
| Models Consistency deletion broke unexpected dependents | Build error or runtime error | Codex should catch via grep. If something slips through, revert and audit dependents more carefully. |
| `mirroredRuns` resolver wrong | Paired-mode UI shows wrong/empty mirrored runs | Tests should catch. If post-deploy issue, the URL parameter `companionRunId` can still filter to a specific run as a fallback. |

**Worst case:** `gh pr revert <wave-4-pr> --branch hotfix/wave4-revert`. Wave 3 unaffected. Wave 5 cannot ship until Wave 4 is back in place.

## Cleanup after Wave 4 stabilizes (~7 days post-deploy)

| File | Action |
|---|---|
| `cloud/tests/snapshot-baselines/wave4-allowed-deltas.json` | Delete |
| `cloud/scripts/wave4-prod-baseline.ts` | Delete |
| `cloud/scripts/preflight-wave4-token-audit.sql` | Move to `cloud/scripts/archive/` |
| `cloud/tests/snapshot-baselines/wave4-prod-pre-deploy-*.json` | Move to archive |

The unit-level equivalence tests stay as permanent regression guards. `Run.mirroredRuns` resolver also stays — it's a load-bearing API field.

## Sign-off log

| Phase | Approved by | Date |
|---|---|---|
| Spec reviewed (Gemini) — round 1 | findings incorporated | 2026-05-09 |
| Spec reviewed (Codex) — round 1 | findings incorporated | 2026-05-09 |
| Spec simplifications (post-user-decisions) | applied | 2026-05-09 |
| Implementation (Codex) | | |
| Diff review (Codex round 2) | | |
| Pre-flight data audit run | | |
| Pre-flight baseline captured | | |
| Wave 4 PR opened | | |
| Wave 4 PR merged | | |
| Post-deploy snapshot diff passes | | |
| 7-day stability confirmed; cleanup ships | | |

## Related

- [Remove paired-batch concept](remove-paired-batch-concept.md) — parent planning doc
- [Wave 3 spec](wave3-spec.md) — predecessor wave (anomaly-detector deletion)
- [`formatTrialSignature`](../../cloud/packages/shared/src/trial-signature.ts) — canonical signature implementation
- [`formatRunSignature` / `runMatchesSignature`](../../cloud/apps/api/src/graphql/queries/domain-coverage-gql-types.ts:144) — existing helpers Wave 4 leans on

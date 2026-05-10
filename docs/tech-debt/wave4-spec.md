# Wave 4 — Implementation Spec

**Status:** Draft (not yet reviewed)
**Last updated:** 2026-05-09
**Scope:** Wave 4 of the [paired-batch removal cleanup](remove-paired-batch-concept.md). The biggest, riskiest wave.

## What this wave does

Wave 4 is where the analysis layer stops depending on launch-time pair grouping. After this wave:

- Coverage matrices derive direction and pair grouping from value tokens (already on the primary path; this wave removes the legacy fallback)
- Models Consistency report finds order-effect partners by mirrored definitions, not `companionRunId`
- Aggregate analysis preparation derives partners from `Definition.pairedSibling`
- Paired-mode transcript view falls back to `Definition.pairedSibling` when `companionRunId` is absent
- Domain launch flow stops writing `jobChoiceBatchGroupId` and stops grouping definitions by `pair_key`
- The write paths for `jobChoiceLaunchMode` and `jobChoiceValueFirst` move out of the now-dead pair-conditional branch — every launch slot still gets these fields stamped

It's risky because it touches the analysis surface that produces the data the product is about. Numerical drift in coverage, pressure-sensitivity, or Models Consistency would invalidate downstream interpretation. The wave includes a snapshot-baseline + post-deploy diff regime to catch silent shifts.

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

## Pre-flight (must complete before Wave 4 PR opens)

### A. Wave 3 must be merged

Confirm Wave 3 (the `detectPairAsymmetry` deletion) is on `main`.

### B. Production data audit — paired definitions must have value tokens

This is the hard precondition. Wave 4 starts removing the `jobChoiceValueFirst` fallback in coverage. If any production paired definition is missing value tokens, runs against it disappear from coverage matrices.

Run from the repo root, against production via Railway:

```sql
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

**Expected: zero rows.** If any rows return: stop. Backfill the missing tokens before Wave 4 ships. There is no allowlist option.

Save the script as `cloud/scripts/preflight-wave4-token-audit.sql`.

### C. Snapshot baseline capture (one-shot)

Capture the current production output of the analysis surfaces Wave 4 changes. The post-deploy diff compares against these baselines.

Add a script `cloud/scripts/wave4-prod-baseline.ts` that hits production GraphQL with a fixed query bundle and writes timestamped JSON to `cloud/tests/snapshot-baselines/wave4-prod-pre-deploy-${ISO_DATE}.json`. Commit the file.

**Query bundle:**

| Query | Args | Why |
|---|---|---|
| `domainCoverage` | The 3 most-active domains by run count in the last 30 days | Catches coverage matrix shifts |
| `pressureSensitivity` | The 5 most-recently-launched paired definitions | Catches pair-grouping shifts in pressure analysis |
| `modelsConsistency` | The 3 most-active model pairs | Catches order-effect analysis shifts |
| `runAnomaliesByType` (or equivalent) | Last 7 days | Sanity check: only `PAIR_ASYMMETRY` should drop |
| `domainEvaluation` | The 5 most recent evaluations | Confirms launch-flow surface unaffected |

Pin the resolved entity IDs in the baseline JSON so the post-deploy verify step hits the same entities.

### D. Equivalence tests (added in this wave's PR, not pre-flight)

Listed under Task 5 below — but plan the unit fixtures now so they're ready when Wave 4 starts.

## Implementation tasks

Order matters. Each task assumes the previous is in place.

### Task 1 — Replace coverage dedup and direction lookup

**Decision: drop dedup entirely.** Each run is counted as its own coverage unit. The "paired batch as one unit" semantic was a launch-grouping artifact that we're removing.

Coverage matrix counts will shift on historical data: a paired-batch launch that previously counted as 1 dedup unit will now count as 2 (one per definition half). This is the **expected, documented delta** for Wave 4 and the only one that requires entries in `wave4-allowed-deltas.json`.

**Alternative considered: preserve historical dedup via batchGroupId + canonical-pair fallback.** Keeps historical counts byte-identical, defers the count shift to Wave 5. Rejected because (a) two-step transitions are risky, (b) the direction we're going is "no batch unit at all" — defer just postpones the same conversation.

**File: `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts`**

- Delete `deduplicateRunsByGroupId` (currently around lines 180–230).
- Delete `getCoverageBatchGroupId` (currently around line 265). It only existed to serve the deleted dedup.
- Audit every caller of `deduplicateRunsByGroupId` (`grep -rn "deduplicateRunsByGroupId" cloud/apps/api/src`). For each: replace the call with the un-deduplicated input list. The downstream aggregation (trial counts, model breakdowns) will count each run independently.
- For coverage direction labeling around lines 280–320: the helper already reads `definitionSnapshot.components` on the primary path. Delete the `jobChoiceValueFirst` fallback. After this, direction comes from value tokens only.

**File: `cloud/apps/api/src/graphql/queries/domain-coverage.ts`**

- The existing call to `getCoverageDirection(run.config)` around line 284 already routes through the helper. After Task 1's helper change, this site doesn't need editing — it just stops hitting the fallback path.
- Verify the resolver doesn't have its own dedup logic. If it does, audit and treat the same way.

### Task 2 — Repoint paired-mode transcript view to `Definition.pairedSibling`

The transcript-comparison UI uses `Run.config.companionRunId` to find a run's pair partner. Wave 4 makes `Definition.pairedSibling` the fallback so the UI works on runs that lack a stored companion pointer.

**File: `cloud/apps/web/src/utils/analysisTranscriptParams.ts`**

- The `companionRunId` reads (currently around lines 112, 129, 136) stay as the primary path. Add a fallback: if `companionRunId` is absent, derive it from `definition.pairedSibling.id` (read from the run's `definition` relation, or from a sibling-resolution query).
- The fallback path is what [AnalysisConditionDetail.test.tsx:711](../../cloud/apps/web/tests/pages/AnalysisConditionDetail.test.tsx:711) already exercises ("uses pairedSibling on the run definition to resolve the companion when companionRunId is absent"). That test stays valid.

**File: `cloud/apps/web/src/hooks/useAnalysisTranscriptsData.ts`**

- Around line 56: when fetching the companion run, if `companionRunId` is empty, query the run's definition's `pairedSibling`, then load the most recent run for that sibling that matches the current run's models/config.
- The "most recent matching run" lookup is the new piece. Add a small helper or inline query.

**File: `cloud/apps/web/src/hooks/useAnalysisTranscriptParams.ts`**

- Around line 31: same — `companionRunId` from URL stays primary, sibling-derived is fallback.

**File: `cloud/apps/web/src/utils/pairedScopeAdapter.ts`**

- Audit. Likely keep — analysis-time scoping uses value tokens, not stored pair pointers.

**File: `cloud/apps/web/src/pages/AnalysisDetail.tsx`**

- Lines 173–175 read `run.companionRunId` directly. Replace with sibling-derived fallback.

**Tests:**

- The existing test at [AnalysisConditionDetail.test.tsx:711](../../cloud/apps/web/tests/pages/AnalysisConditionDetail.test.tsx:711) already covers the absent-companionRunId path. Verify it still passes after the repoint.
- Add a new test: "paired-mode view works on a run launched after Wave 4 (no companionRunId in config)". Assert the partner is found via pairedSibling.

### Task 3 — Repoint Models Consistency to mirrored definitions

**File: `cloud/apps/api/src/graphql/queries/models-consistency.ts`**

- Around line 44: the resolver currently joins runs by `companionRunId` to pair them for order-effect analysis. Replace with: for each candidate run, find runs in the same model + same domain whose definition is the `pairedSibling` of the current run's definition, within a recent time window (default 30 days). This window heuristic is necessary because we no longer have the explicit launch-event grouping.

  The window value should be configurable. Suggested constant: `MODELS_CONSISTENCY_PARTNER_WINDOW_DAYS = 30` in `cloud/apps/api/src/services/run/anomaly-thresholds.ts` or a new `models-consistency-thresholds.ts` if that file is for anomaly stuff only.

- If multiple candidate partner runs match, pick the one closest in `createdAt` to the current run. Document this in a comment — it's a heuristic that replaces what was previously an exact lookup.

**Tests:**

- Update existing tests to verify partner-finding produces same results on fixture data with `companionRunId` populated.
- Add a new test: "partner resolved via pairedSibling when no companionRunId" — verify it picks the closest sibling run in the time window.
- Add a corner case test: "no partner found within window returns the run as ungrouped" — should not crash.

### Task 4 — Repoint aggregate analysis preparation

**File: `cloud/apps/api/src/services/analysis/aggregate/aggregate-preparation.ts`**

- Around lines 284–288, the aggregate prep reads `companionRunId` from the run's template config. Replace with the same sibling-derivation pattern as Task 3 — but here, since the aggregate is per-run, just use `definition.pairedSibling` directly (no time window needed because the aggregate config's companion is whichever the user selected at aggregate-creation time).
- If the historical aggregate template still has `companionRunId` set, keep using it (preserve historical behavior). Only fall back to pairedSibling when `companionRunId` is absent.

### Task 5 — Stop writing `jobChoiceBatchGroupId`, delete pair-grouping, flatten launch groups

This is the launch-flow surgery. Order within the task matters:

**5a. Move `jobChoiceLaunchMode` and `jobChoiceValueFirst` writes out of the pair-conditional branch first.** Without this, flattening the groups (5b) makes the writes unreachable. This is the cascade hazard Codex flagged in round-2 review.

  **File: `cloud/apps/api/src/graphql/mutations/domain/launch/plan-slots.ts`**
  - Around line 120, the pair-conditional `if (group.pairKey !== null)` block writes both fields. Move those writes out of the conditional so every launch slot's `configExtras` gets them, regardless of grouping.
  - Inside the conditional, only `jobChoiceBatchGroupId: batchGroupId` should remain — and that gets deleted in step 5d.

  **File: `cloud/apps/api/src/graphql/mutations/domain/launch/execute-runs.ts`**
  - Around line 127, same pattern: lift `jobChoiceLaunchMode` and `jobChoiceValueFirst` out of the pair-conditional. Only `jobChoiceBatchGroupId` and `batchGroupId = randomUUID()` stay inside, scheduled for deletion.

  **File: `cloud/apps/api/src/graphql/mutations/run/lifecycle.ts`**
  - Around lines 117–204: same hoisting. The single-run mutation has its own pair-conditional.

  **Verify with tests** that runs created via every launch path still have `jobChoiceLaunchMode` and `jobChoiceValueFirst` populated. Then proceed.

**5b. Delete `pair-grouping.ts` module.**

  **File: `cloud/apps/api/src/graphql/mutations/domain/launch/pair-grouping.ts`**
  - Delete the entire file. Both exports (`extractPairedMethodology`, `groupDefinitionsByPairKey`) go away.

**5c. Flatten launch groups in the orchestrator.**

  **File: `cloud/apps/api/src/graphql/mutations/domain/launch/launch-orchestrator.ts`**
  - Remove the `groupDefinitionsByPairKey` import (around line 8).
  - Remove the call site (around line 97) and the `incompletePairKeys` warning loop (lines 98–103).
  - Replace with a flat list: each targeted definition becomes its own launch group (with `pairKey: null` and `definitions: [def]`).

  **File: `cloud/apps/api/src/graphql/mutations/domain/launch/types.ts`**
  - Remove `LaunchGroup.pairKey` from the type if no longer read (verify with grep).

**5d. Drop `jobChoiceBatchGroupId` writes.**

  **Files (all under `cloud/apps/api/src/graphql/mutations/domain/launch/`):**
  - `plan-slots.ts`: delete `jobChoiceBatchGroupId: batchGroupId` line.
  - `plan-backfill.ts`: same.
  - `execute-runs.ts`: delete the `batchGroupId = randomUUID()` generator and the `jobChoiceBatchGroupId` line in `executeBackfillRuns`.
  - `resolve-backfill.ts`: audit `runMatchesSingleModel`; remove any `batchGroupId` comparison branch.
  - `backfill-orchestrator.ts`: drop pair-aware backfill mode; treat each definition as a single backfill target.

  **File: `cloud/apps/api/src/graphql/mutations/run/lifecycle.ts`**
  - Drop `jobChoiceBatchGroupId` writes (the `mergeBatchGroupId` calls around lines 117–204). Keep the surrounding `jobChoiceLaunchMode` branching — Wave 5 deletes that.

### Task 6 — Update tests

**Tests to update (existing assertions on `jobChoiceBatchGroupId` being written):**

- [cloud/apps/api/tests/graphql/mutations/run.test.ts:677](../../cloud/apps/api/tests/graphql/mutations/run.test.ts:677) — drop the `jobChoiceBatchGroupId` assertion. Keep the assertion that `jobChoiceLaunchMode` is set.
- [cloud/apps/api/tests/graphql/mutations/domain.test.ts:577](../../cloud/apps/api/tests/graphql/mutations/domain.test.ts:577) — same.
- [cloud/apps/api/tests/graphql/queries/domain-coverage-integration.test.ts:60](../../cloud/apps/api/tests/graphql/queries/domain-coverage-integration.test.ts:60) — the test asserts dedup-by-batchGroupId behavior. Replace with assertions that each run is counted independently.

**Tests to add (equivalence + new behavior):**

- `cloud/apps/api/tests/services/analysis/coverage-equivalence.test.ts` *(new)*:
  - Assert `getCoverageDirection(run)` produces the same value before and after by hitting fixtures that have both `jobChoiceValueFirst` populated (legacy) and definitionSnapshot.components populated (new). Result must match.
  - The legacy fallback removal is what's being tested. If results differ for any fixture, the historical migration is incomplete — investigate.
- `cloud/apps/api/tests/graphql/queries/models-consistency.test.ts` (extend if exists):
  - "Resolves partner via pairedSibling when companionRunId is absent" — exercise the new fallback path with a fixture run that lacks companionRunId.
  - "No partner within window returns ungrouped" — corner case.
- `cloud/apps/api/tests/services/run/anomaly-detection.test.ts`:
  - Assert `RunAnomalyTypeEnum` still includes `'PAIR_ASYMMETRY'` (the value stays until Wave 5).
- `cloud/apps/api/tests/graphql/queries/domain-coverage.test.ts`:
  - Update fixtures: paired runs no longer share a batchGroupId. Assert coverage counts each run independently. Document the count change in test comments.

### Task 7 — Verify

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

All must return 0 errors.

**No codegen needed.** Wave 4 makes no schema changes.

### Task 8 — Snapshot diff against pre-deploy baseline

Run the verification script:

```
npm run wave4:verify -- --baseline cloud/tests/snapshot-baselines/wave4-prod-pre-deploy-${ISO_DATE}.json
```

This re-hits production, diffs against the captured baseline, and applies the allowed-deltas filter from `cloud/tests/snapshot-baselines/wave4-allowed-deltas.json`.

**Allowed deltas (only these are non-failures):**

- Coverage matrix counts: paired-batch dedup units may inflate to 2x where dedup previously merged halves. Document each affected matrix in the allowed-deltas file with a note.
- `PAIR_ASYMMETRY` anomaly count delta: should be unchanged from Wave 3 baseline (no new ones since Wave 3 deleted the detector).
- `Run.config.jobChoiceBatchGroupId` field: starts returning null on new runs. The schema field is still queryable.

Any other delta fails CI and blocks the merge.

## Order of changes

| Step | What | Why this order |
|---|---|---|
| 1 | Pre-flight: data audit + baseline capture | Gates the wave |
| 2 | Task 1 (coverage dedup + direction) | Readers must work on definitionSnapshot before writers stop providing the legacy field |
| 3 | Task 2 (paired-mode UI) + Task 3 (Models Consistency) + Task 4 (aggregate-prep) | Repointing readers so they work without companionRunId. Independent of each other; can land in any order. |
| 4 | Task 5 (launch flow) | Must come last — depends on the readers being repointed |
| 5 | Task 6 (tests) | Mechanical follow-up |
| 6 | Task 7 (preflight) + Task 8 (snapshot diff) | Confirms green |

Steps 2 and 3 can ship in separate PRs if the diff gets too large. Step 4 must be last regardless.

## Constraints

- DO NOT MODIFY: `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `cloud/agents.md`, `MEMORY.md`, `GEMINI.md`, `.gitignore`, `STATUS.md`, `experiments.md`, the docs in `docs/tech-debt/`, or any file outside the inventory above.
- DO NOT use `@ts-ignore`, `eslint-disable`, or `as any`.
- DO NOT change the GraphQL schema. No `Run.pairedBatchGroupId` removal, no `companionRunId` field removal, no enum changes. Wave 5.
- DO NOT touch `companionRunId` writes, `jobChoiceLaunchMode` writes, `jobChoiceValueFirst` writes (other than the hoist in Task 5a). Wave 5 stops the writes.
- DO NOT delete `legacyCompanionPairedRun.ts` (Wave 6).
- DO NOT delete `lifecycle-helpers.ts` `persistPairedCompanionRunIds`. It becomes dead code in Wave 4 (no caller after the launch-flow changes), but it stays defined until Wave 5.
- DO NOT push or open the PR until preflight passes locally and the snapshot diff returns no disallowed deltas.

## Risk and rollback

This is the high-risk wave. The failure modes:

| Failure | Symptom | Recovery |
|---|---|---|
| Direction labeling wrong on historical runs | Coverage matrices show flipped direction counts | The pre-flight data audit gates this. If it returned zero, this shouldn't happen. If it does, revert. |
| Models Consistency partner-finding picks wrong sibling | Order-effect deltas shift | The 30-day window is heuristic. If it picks a different partner than `companionRunId` did, document the delta in allowed-deltas. If shifts are large, narrow the window. |
| Paired-mode transcript view fails to find companion | UI breaks for users running paired comparisons | The fallback test ([AnalysisConditionDetail.test.tsx:711](../../cloud/apps/web/tests/pages/AnalysisConditionDetail.test.tsx:711)) covers this. If it broke in production but not in tests, the test fixture was incomplete. |
| Coverage counts inflate more than expected | Allowed-deltas check rejects the diff | Either accept the inflation (update allowed-deltas with a note) or revert and reconsider preserving historical dedup via batchGroupId fallback. |

**Worst case:** `gh pr revert <wave-4-pr> --branch hotfix/wave4-revert`. Wave 3 is unaffected. Wave 5 cannot ship until Wave 4 is back in place — if revert happens, Wave 5 schema cleanup also blocks.

The post-deploy snapshot diff catches these within minutes of deploy. Decision deadline: 30 minutes after CI flags a disallowed delta.

## Cleanup after Wave 4 stabilizes (~7 days post-deploy)

| File | Action |
|---|---|
| `cloud/tests/snapshot-baselines/wave4-allowed-deltas.json` | Delete |
| `cloud/scripts/wave4-prod-baseline.ts` | Delete (script was for one-shot capture) |
| `cloud/scripts/preflight-wave4-token-audit.sql` | Move to `cloud/scripts/archive/` |
| `cloud/tests/snapshot-baselines/wave4-prod-pre-deploy-*.json` | Move to archive |

The unit-level equivalence tests (`coverage-equivalence.test.ts`) stay as permanent regression guards.

## Sign-off log

| Phase | Approved by | Date |
|---|---|---|
| Spec reviewed (Gemini) — round 1 | | |
| Spec reviewed (Codex) — round 1 | | |
| Spec reviewed (Claude / human) | | |
| Pre-flight data audit run | | |
| Pre-flight baseline captured | | |
| Wave 4 PR opened | | |
| Wave 4 PR merged | | |
| Post-deploy snapshot diff passes | | |
| 7-day stability confirmed; cleanup ships | | |

## Related

- [Remove paired-batch concept](remove-paired-batch-concept.md) — parent planning doc
- [Wave 3 spec](wave3-spec.md) — predecessor wave (anomaly-detector deletion)

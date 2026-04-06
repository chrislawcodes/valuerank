# Technical Plan: Top-up to Target Batch Count

## Architecture Overview

The feature requires changes at three layers:
1. **Backend mutation** — accept `targetBatchCount`, query existing counts, compute per-group deltas, launch only the delta
2. **Backend query** — `domainTrialsPlan` must return existing batch counts per vignette for the UI preview
3. **Frontend** — new `targetBatchCount` state + input in `LaunchControlsPanel`; grid display in `TrialGridTable`; mutation wiring in `DomainTrialsDashboard`

---

## File Scope

| File | Change |
|------|--------|
| `cloud/apps/api/src/graphql/mutations/domain.ts` | Add `targetBatchCount` arg to `startDomainEvaluation`; extend `launchDomainEvaluation` input type; add per-group top-up logic in `launchDomainEvaluation` |
| `cloud/apps/api/src/graphql/queries/domain/planning.ts` | Add `existingBatchCount` per vignette to `DomainTrialPlanResult` (via new field on vignette type) |
| `cloud/apps/api/src/graphql/queries/domain/types.ts` | Add `existingBatchCount: number` to vignette type definition |
| `cloud/apps/web/src/api/operations/domains.ts` | Add `targetBatchCount` to `START_DOMAIN_EVALUATION_MUTATION`; add `existingBatchCount` to `DOMAIN_TRIALS_PLAN_QUERY` vignette fragment; update TS types |
| `cloud/apps/web/src/pages/DomainTrialsDashboard.tsx` | Add `targetBatchCount` state; pass to mutation; pass `existingBatchCounts` map and `targetBatchCount` to `TrialGridTable`; pass `targetBatchCount` to `LaunchControlsPanel` and `LaunchConfirmModal` |
| `cloud/apps/web/src/components/domains/domainTrials/LaunchControlsPanel.tsx` | Add `targetBatchCountEnabled`, `targetBatchCountInput`, `hasValidTargetBatchCount`, and setters to props; render "Target batch count" input |
| `cloud/apps/web/src/components/domains/domainTrials/TrialGridTable.tsx` | Add `existingBatchCounts` map prop and `targetBatchCount` prop; update "Batches" column to show existing/needed when target mode is on |
| `cloud/apps/web/src/components/domains/domainTrials/LaunchConfirmModal.tsx` | Add `targetBatchCount` prop; show "Target: N batches per vignette" in confirm details |

---

## Backend Design

### `DomainEvaluationLaunchInput` extension

Add optional field: `targetBatchCount?: number | null`

### `launchDomainEvaluation` changes

After `groupDefinitionsByPairKey` and before budget loop:

**Step 1: Query existing run counts**
```
When targetBatchCount is set (> 0):
  Query db.run.findMany for all latestDefinitionIds where:
    - runCategory = scopeCategory
    - deletedAt = null
    - status in [COMPLETED, PENDING, RUNNING, PAUSED, SUMMARIZING]
    - config temperature matches launch temperature

  Build: existingCountByDefinitionId: Map<string, number>
  (count matching runs per definitionId)
```

**Step 2: Compute per-group delta**
```
For each LaunchGroup:
  If group.pairKey != null (paired):
    pairMin = min(existingCountByDefinitionId[A] ?? 0, existingCountByDefinitionId[B] ?? 0)
    delta = max(0, targetBatchCount - pairMin)
    Store delta for each def in group

  If group.pairKey == null (single):
    existing = existingCountByDefinitionId[def.id] ?? 0
    delta = max(0, targetBatchCount - existing)
    Store delta for def
```

**Step 3: Skip zero-delta groups**
```
Filter launchGroups: only include groups where delta > 0
```

**Step 4: Launch delta times**
```
For each launchable group:
  For i in 0..delta:
    For each def in group:
      startRunService(...)  // each call = 1 batch

Actually: startRun is already called once per definition. To launch `delta` runs,
we repeat the startRun call `delta` times per definition.

Implementation: wrap the existing per-definition launch in a loop from 0 to delta.
Since startRun is already called inside a Promise.allSettled batch,
we expand the definitions array: if delta=3 for vignette X, include X three times in the launch list.
The configExtras (batchGroupId) must be unique per invocation for paired batches.
```

**Key constraint:** For paired batches, each batch pair needs its OWN `batchGroupId`. So the expansion must re-generate `batchGroupId` per invocation. The `definitionConfigExtras` map approach won't work for repeated entries — replace it with a `launchSlots` array where each slot is `{ definition, configExtras }`. For delta=3 on a paired group A+B, generate 3 UUID values; slot0-A and slot0-B share uuid0, slot1-A/slot1-B share uuid1, etc.

`domainEvaluationRun.createMany` records each started run. With expansion, each batch iteration produces its own run record — this is correct (each is a distinct batch).

### `startDomainEvaluation` resolver

Add `targetBatchCount: t.arg.int({ required: false })` arg. Pass through to `launchDomainEvaluation`.

---

## Frontend Design

### DomainTrialsDashboard state additions

```typescript
const [targetBatchCountEnabled, setTargetBatchCountEnabled] = useState(false);
const [targetBatchCountInput, setTargetBatchCountInput] = useState('5');
const parsedTargetBatchCount = Number.parseInt(targetBatchCountInput, 10);
const hasValidTargetBatchCount = Number.isFinite(parsedTargetBatchCount) && parsedTargetBatchCount >= 1;
const targetBatchCount = targetBatchCountEnabled && hasValidTargetBatchCount ? parsedTargetBatchCount : undefined;
```

Pass `targetBatchCount` to `startDomainEvaluation` mutation.

Build `existingBatchCounts` map from plan query `vignettes[].existingBatchCount`.

### DOMAIN_TRIALS_PLAN_QUERY vignette fragment change

Add `existingBatchCount` field.

### START_DOMAIN_EVALUATION_MUTATION change

Add `$targetBatchCount: Int` var and pass to mutation.

### Types change

`StartDomainEvaluationMutationVariables` gets `targetBatchCount?: number`.
Plan vignette type gets `existingBatchCount: number`.

---

## Data Flow

```
User sets targetBatchCount=5 in LaunchControlsPanel
  → DomainTrialsDashboard state update
  → TrialGridTable renders "2 existing / 3 to launch (target 5)" per vignette
  → User clicks confirm → LaunchConfirmModal shows "Target: 5 batches per vignette"
  → handleStart fires startDomainEvaluation({ ..., targetBatchCount: 5 })
  → Backend queries existing runs, computes deltas, launches delta×N runs
  → Response: startedRuns = total runs started (may be less than vignettes × 1)
```

---

## Key Constraints

1. Paired batch expansion requires fresh `batchGroupId` per batch iteration. The expansion logic must be refactored from a flat "one entry per definition" approach to a "repeat N times" approach with fresh UUIDs.

2. The existing `hasActiveEquivalentRun` guard must NOT skip runs when target mode is on — it guards against re-launching an identical-config batch when one is already in-flight. With target mode, the user explicitly wants delta more batches. The guard checks if ANY run with the same exact config exists; in top-up mode we are intentionally launching duplicates. **The duplicate guard must be removed when `targetBatchCount` is set** — or narrowed to "don't launch if already at/above target". Actually, re-reading: the guard is a hard block that throws an error. It must be skipped entirely when targetBatchCount is used, because the whole point is to launch duplicates.

3. `runSamplesPerScenario` check in `hasActiveEquivalentRun` — this whole check is designed to prevent double-launching. In target-count mode, it must not block. Solution: only apply the guard when `targetBatchCount` is null/undefined.

---

## No Schema Migration

No database schema changes required. The feature is entirely at the GraphQL + business logic level.

---

## Tests to Add

- `cloud/apps/api/tests/graphql/mutations/domain.test.ts` — add test cases for `targetBatchCount`:
  - when targetBatchCount=2 and 1 completed batch exists, launches 1 more
  - when targetBatchCount=2 and 2 completed batches exist, launches 0 (skip all)
  - when targetBatchCount=2 and paired vignette A=1, B=2, launches 1 A + 1 B
  - when targetBatchCount is null, existing behavior unchanged

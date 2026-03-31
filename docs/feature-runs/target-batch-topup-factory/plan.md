# Implementation Plan: Top-up to Target Batch Count

**Feature slug:** target-batch-topup
**Date:** 2026-03-31
**Based on:** spec.md (post-Gemini review)

---

## Architecture Overview

The feature adds an optional `targetBatchCount` parameter to the domain evaluation launch flow. When set, the system counts existing completed + inflight batches per vignette (with matching signature) and launches only the top-up batches needed to reach the target.

The change spans three layers:
1. **Backend query** — extend `domainTrialsPlan` to expose per-vignette `existingBatchCount`
2. **Backend mutation** — extend `launchDomainEvaluation` to accept `targetBatchCount` and loop launches per top-up count
3. **Frontend** — add target count input, wire existing counts through grid and confirm modal

---

## Phase 0: New Shared Helper (top-up logic extraction)

### Files
- `cloud/apps/api/src/graphql/queries/domain/shared.ts`

### Changes

Extract top-up computation into a single shared function `computeTopUpCounts` in `domain/shared.ts`. This function is called by both the query (planning.ts) and the mutation (domain.ts) to ensure consistent logic.

```typescript
export type TopUpEntry = {
  existingCount: number;
  topUpCount: number;  // 0 when already at or above target
};

export async function computeTopUpCounts(
  definitionIds: string[],
  targetBatchCount: number,
  effectiveSignature: string | null,
): Promise<Map<string, TopUpEntry>>
```

Implementation:
1. Query all `COMPLETED | PENDING | RUNNING | SUMMARIZING | PAUSED` runs for the definition IDs
2. Filter by `effectiveSignature` using the existing local `runMatchesSignature` function
3. Count runs per definitionId → `existingCountByDefinitionId`
4. For each definitionId: `topUpCount = Math.max(0, targetBatchCount - existingCount)`
5. Return map of definitionId → `{ existingCount, topUpCount }`

For paired groups, the caller computes `pairExisting = Math.min(countA, countB)` and uses that as the shared existing count for both members of the pair. This paired-min logic lives in the callers (not in `computeTopUpCounts`) since callers already have pair grouping logic.

---

## Phase 1: Backend — Query Extension (domainTrialsPlan)

### Files
- `cloud/apps/api/src/graphql/queries/domain/shared.ts`
- `cloud/apps/api/src/graphql/queries/domain/types.ts`
- `cloud/apps/api/src/graphql/queries/domain/planning.ts`

### Changes

**shared.ts**: Add `existingBatchCount: number` and `topUpCount: number` to `DomainTrialPlanVignette` type. Both default to 0 when `targetBatchCount` is not provided.

**types.ts**: Add `existingBatchCount: t.exposeInt('existingBatchCount')` and `topUpCount: t.exposeInt('topUpCount')` to `DomainTrialPlanVignetteRef`.

**planning.ts**:
1. Add `targetBatchCount?: number | null` to `DomainEstimateInput` type
2. Add `targetBatchCount: t.arg.int({ required: false })` to `domainTrialsPlan` resolver args
3. In `buildDomainEstimate`, when `targetBatchCount` is provided:
   - Call `computeTopUpCounts(selectedDefinitionIds, targetBatchCount, effectiveSignature)`
   - Apply paired-min logic using existing pair grouping: for each pair group, set `existingCount = Math.min(countA, countB)` for both members
   - Set `existingBatchCount` and `topUpCount` on each vignette row
   - Adjust `totalEstimatedCost` to reflect only top-up batches (multiply per-definition cost by `topUpCount`)
4. When `targetBatchCount` is absent: `existingBatchCount = 0`, `topUpCount` not used (grid shows original count)

**Cost estimate adjustment**: The `estimateDomainEvaluationCost` query does NOT need to change for this feature (it's used for its own purpose with explicit per-run params). The `domainTrialsPlan` total cost gets adjusted to reflect top-up batches only when `targetBatchCount` is provided.

**Signature matching approach**: Reuse the local `runMatchesSignature` helper already in `domain/shared.ts`. The effective signature for this query is derived from the temperature arg (same as today).

**Key constraint**: `existingBatchCount` and `topUpCount` both default to 0 when `targetBatchCount` is absent. This is backward-compatible — the frontend only uses these fields when it sent a `targetBatchCount`.

---

## Phase 2: Backend — Mutation Extension (startDomainEvaluation)

### Files
- `cloud/apps/api/src/graphql/mutations/domain.ts`

### Changes

**Add `targetBatchCount` to `DomainEvaluationLaunchInput`**:
```typescript
targetBatchCount?: number | null;
```

**Add `targetBatchCount` to `DomainEvaluationLaunchInput`**:
```typescript
targetBatchCount?: number | null;
```

**Modify how launchableGroups are built** (preserving the existing batch-launch mechanism):

Instead of looping launches per top-up count, modify how `launchableGroups` is populated. After computing `topUpCount` per group via `computeTopUpCounts`, push each group into `launchableGroups` **`topUpCount` times** (or 1 time when no `targetBatchCount`). This preserves the existing `Promise.allSettled` batching mechanism in full.

```typescript
// After grouping and before budget loop:
const topUpByGroup: Map<LaunchGroup, number> = new Map();
if (targetBatchCount != null) {
  const topUpCounts = await computeTopUpCounts(latestDefinitionIds, targetBatchCount, effectiveSignature);
  for (const group of launchGroups) {
    const existingCounts = group.definitions.map(d => topUpCounts.get(d.id)?.existingCount ?? 0);
    const pairExisting = group.pairKey != null ? Math.min(...existingCounts) : (existingCounts[0] ?? 0);
    const topUp = Math.max(0, targetBatchCount - pairExisting);
    topUpByGroup.set(group, topUp);
  }
}
```

Then in the group iteration loop:
```typescript
const repetitions = topUpByGroup.get(group) ?? 1;
for (let i = 0; i < repetitions; i++) {
  // add group to launchableGroups / launchableDefinitions
}
```

Skip groups where `repetitions === 0`.

**Note on the active-run duplicate guard**: The existing `hasActiveEquivalentRun` check runs before the top-up loop and guards against re-launching when a run with identical config is already active. This stays in place. The top-up loop adds *additional* runs beyond the first, which won't trigger this guard since it checks for "any active equivalent" at the whole-domain level. This is correct: the guard prevents double-click re-launch; top-up intentionally adds more runs.

**Add `targetBatchCount` arg to GraphQL mutation**:
```graphql
targetBatchCount: t.arg.int({ required: false })
```

**Validation**: If `targetBatchCount` is provided and `< 1`, throw a validation error.

---

## Phase 3: Frontend — Web Operations Update

### Files
- `cloud/apps/web/src/api/operations/domains.ts`

### Changes

1. **DOMAIN_TRIALS_PLAN_QUERY**: Add `existingBatchCount` to the vignette fields in the GQL query. Add `$targetBatchCount: Int` variable and pass it through.

2. **DomainTrialsPlanQueryVariables**: Add `targetBatchCount?: number`

3. **DomainTrialsPlanQueryResult vignette type**: Add `existingBatchCount: number`

4. **START_DOMAIN_EVALUATION_MUTATION**: Add `$targetBatchCount: Int` variable and pass to `startDomainEvaluation(targetBatchCount: $targetBatchCount)`

5. **StartDomainEvaluationMutationVariables**: Add `targetBatchCount?: number`

---

## Phase 4: Frontend — LaunchControlsPanel

### Files
- `cloud/apps/web/src/components/domains/domainTrials/LaunchControlsPanel.tsx`

### Changes

Add new props to `LaunchControlsPanelProps`:
```typescript
targetBatchCountEnabled: boolean;
targetBatchCountInput: string;
hasValidTargetBatchCount: boolean;
onSetTargetBatchCountEnabled: (value: boolean) => void;
onSetTargetBatchCountInput: (value: string) => void;
```

Add UI in the main controls row (not hidden in Advanced):
```tsx
<label className="inline-flex items-center gap-2 text-sm text-gray-700">
  <input type="checkbox" checked={targetBatchCountEnabled} onChange={...} />
  Target batch count
</label>
<input
  type="number"
  min={1}
  step={1}
  placeholder="e.g. 5"
  value={targetBatchCountInput}
  disabled={!targetBatchCountEnabled}
  className="w-20 px-2 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-100"
/>
{targetBatchCountEnabled && !hasValidTargetBatchCount && (
  <p className="text-xs text-amber-700">Must be a whole number ≥ 1</p>
)}
```

Add `targetBatchCountEnabled && !hasValidTargetBatchCount` to the launch button disabled condition.

---

## Phase 5: Frontend — TrialGridTable

### Files
- `cloud/apps/web/src/components/domains/domainTrials/TrialGridTable.tsx`

### Changes

Add optional props to `TrialGridTableProps`:
```typescript
targetBatchCount?: number;
existingBatchCountByDefinitionId?: Map<string, number>;
```

Add optional props to `TrialGridTableProps`:
```typescript
topUpCountByDefinitionId?: Map<string, number>;
existingBatchCountByDefinitionId?: Map<string, number>;
```

In the "Batches" column cell, when `topUpCountByDefinitionId` is provided:
- `existing = existingBatchCountByDefinitionId?.get(definitionId) ?? 0`
- `topUp = topUpCountByDefinitionId.get(definitionId) ?? 0` — use backend-provided value (correct for paired vignettes)
- Display:
  - `topUp > 0`: `{existing} existing, launching {topUp}`
  - `topUp === 0`: `{existing} existing (target met)`

When `topUpCountByDefinitionId` is not provided, show model count as today.

---

## Phase 6: Frontend — LaunchConfirmModal

### Files
- `cloud/apps/web/src/components/domains/domainTrials/LaunchConfirmModal.tsx`

### Changes

Add optional `targetBatchCount?: number` prop. When provided, show a "Target batch count: N" row in the confirmation summary.

---

## Phase 7: Frontend — DomainTrialsDashboard

### Files
- `cloud/apps/web/src/pages/DomainTrialsDashboard.tsx`

### Changes

1. Add state: `targetBatchCountEnabled`, `targetBatchCountInput`
2. Compute: `parsedTargetBatchCount`, `hasValidTargetBatchCount`
3. Pass `targetBatchCount` to `DOMAIN_TRIALS_PLAN_QUERY` when enabled
4. Build `existingBatchCountByDefinitionId` from plan query result
5. Pass new props to `LaunchControlsPanel`, `TrialGridTable`, `LaunchConfirmModal`
6. In `handleStart`: pass `targetBatchCount` to mutation when enabled and valid
7. Add `targetBatchCountEnabled && !hasValidTargetBatchCount` to launch guard

---

## Key Constraints

- `domain.ts` mutations file is already >1100 lines. New `countExistingBatchesPerDefinition` helper must be compact (≤30 lines). No scope creep.
- `DomainTrialPlanVignette` type change is additive — `existingBatchCount` defaults to 0. Existing clients won't break.
- The `hasActiveEquivalentRun` check at the domain level remains unchanged. It guards against re-launching the same config twice in one click; top-up is intentional multi-batch.
- The existing `runMatchesSignature` function in `domain/shared.ts` is the correct one to reuse (it handles both vnew and legacy signatures).

---

## Test Considerations

- `cloud/apps/api/tests/graphql/mutations/domain.test.ts` — add tests for `targetBatchCount` arg: skips vignettes at target, launches topUp × per group, paired min logic
- `cloud/apps/api/tests/graphql/queries/domain.test.ts` (if exists) — test `existingBatchCount` returned correctly
- Component tests for `LaunchControlsPanel`, `TrialGridTable` if they have existing test files

---

## Implementation Order

1. Phase 1 (query extension) — enables frontend to consume counts
2. Phase 2 (mutation extension) — core top-up logic
3. Phase 3 (web operations) — update GQL strings and types
4. Phase 4 (LaunchControlsPanel) — UI input
5. Phase 5 (TrialGridTable) — grid display
6. Phase 6 (LaunchConfirmModal) — modal summary
7. Phase 7 (DomainTrialsDashboard) — wire everything together

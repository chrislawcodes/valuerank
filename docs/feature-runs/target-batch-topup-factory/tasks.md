# Tasks: Top-up to Target Batch Count

**Feature slug:** target-batch-topup
**Date:** 2026-03-31
**Based on:** plan.md + Codex feasibility review

---

## US-2: Per-vignette top-up computation (backend)

### Task 1: Extract `computeTopUpCounts` shared helper
- [ ] Add `TopUpEntry` type to `cloud/apps/api/src/graphql/queries/domain/shared.ts`:
  ```typescript
  export type TopUpEntry = { existingCount: number; topUpCount: number };
  ```
- [ ] Add `computeTopUpCounts(definitionIds: string[], targetBatchCount: number, scopeCategory: string, modelIds: string[], temperature: number | null, samplesPerScenario: number): Promise<Map<string, number>>` to `cloud/apps/api/src/graphql/queries/domain/shared.ts`
  - This function returns a Map of definitionId → existing run count
  - Queries `COMPLETED | PENDING | RUNNING | SUMMARIZING | PAUSED` runs where `definitionId in definitionIds`, `runCategory: scopeCategory`, `deletedAt: null`
  - Counts runs per definitionId (value = count of matching non-aggregate runs, consistent with existing count logic)
  - Does NOT apply paired-min — that logic is in the callers which have pair grouping info
- [ ] Export the function

**Note on signature**: The "same run signature" means same `scopeCategory`, `modelIds`, `temperature`, and `samplesPerScenario`. We check these directly from run.config rather than using the string-based `runMatchesSignature` helper (which was designed for vnew signature strings, not this broader matching).

### Task 2: Extend `DomainTrialPlanVignette` type with batch count fields
- [ ] In `cloud/apps/api/src/graphql/queries/domain/shared.ts`, add `existingBatchCount: number` and `topUpCount: number` to `DomainTrialPlanVignette` type (both default 0)
- [ ] In `cloud/apps/api/src/graphql/queries/domain/planning.ts`, change the inline `vignettes` shape in `DomainEstimateInternals.trialPlan` from:
  ```typescript
  vignettes: Array<{ definitionId: string; definitionName: string; definitionVersion: number; signature: string; scenarioCount: number; }>;
  ```
  to:
  ```typescript
  vignettes: DomainTrialPlanVignette[];
  ```
  (import `DomainTrialPlanVignette` from `./shared.js`)
- [ ] In `cloud/apps/api/src/graphql/queries/domain/types.ts`, add `existingBatchCount: t.exposeInt('existingBatchCount')` and `topUpCount: t.exposeInt('topUpCount')` to `DomainTrialPlanVignetteRef`

### Task 3: Extend `domainTrialsPlan` query to compute and return batch counts
- [ ] In `cloud/apps/api/src/graphql/queries/domain/planning.ts`:
  - Add `targetBatchCount?: number | null` to `DomainEstimateInput` type
  - Add `scopeCategory?: string | null` to `DomainEstimateInput` type (for passing to `computeTopUpCounts`)
  - Add `targetBatchCount: t.arg.int({ required: false })` and `scopeCategory: t.arg.string({ required: false })` to `domainTrialsPlan` resolver args
  - In `buildDomainEstimate`, when `targetBatchCount != null`:
    - Call `computeTopUpCounts(selectedDefinitionIds, targetBatchCount, effectiveScopeCategory, selectedModels, temperature, samplesPerScenario ?? 1)`
    - Apply paired-min using pair grouping: for each pair group, `existingCount = Math.min(countA, countB)` for both members; for singles, direct count
    - `topUpCount = Math.max(0, targetBatchCount - existingCount)` per definition
    - Set `existingBatchCount` and `topUpCount` on each vignette row in `trialPlan.vignettes`
    - Adjust `totalEstimatedCost` in `trialPlan`: multiply each definition's per-batch estimate by its `topUpCount` (not 1)
  - When `targetBatchCount` is absent: `existingBatchCount = 0`, `topUpCount = 0`
  - Pass `targetBatchCount` and `scopeCategory` from resolver args → `buildDomainEstimate`

### Task 4: Extend `startDomainEvaluation` mutation with target batch top-up logic
- [ ] In `cloud/apps/api/src/graphql/mutations/domain.ts`:
  - Add `targetBatchCount?: number | null` to `DomainEvaluationLaunchInput` type
  - Import `computeTopUpCounts` from `'../queries/domain/shared.js'`
  - In `launchDomainEvaluation`, after computing `launchGroups`:
    - If `targetBatchCount != null`:
      - Call `computeTopUpCounts(latestDefinitionIds, targetBatchCount, scopeCategory, normalizedModels, temperature ?? null, samplesPerScenario)`
      - For each group: `pairExisting = group.pairKey != null ? Math.min(countA, countB) : countA`; `repetitions = Math.max(0, targetBatchCount - pairExisting)`
    - If `targetBatchCount == null`: `repetitions = 1` for all groups
  - **Top-up launch loop** (replaces the simple group push):
    Replace `launchableGroups.push(group)` with:
    ```typescript
    for (let rep = 0; rep < repetitions; rep++) {
      launchableGroups.push({ ...group, repIndex: rep });
    }
    ```
    Where `repIndex` is a local-only field (not stored) used to ensure each repetition generates a fresh `batchGroupId` in the `definitionConfigExtras` loop.
  - In the `definitionConfigExtras` pre-compute loop: iterate over `launchableGroups` (now may have multiple entries per original group). For paired groups, call `randomUUID()` fresh per LaunchGroup entry (i.e., per rep). This ensures each top-up paired batch gets its own `batchGroupId`.
  - The `launchableDefinitions` array construction must also be updated to iterate `launchableGroups` with rep-awareness (one entry per rep per group).
  - Add `targetBatchCount: t.arg.int({ required: false })` to `startDomainEvaluation` mutation args
  - Add validation: `if (args.targetBatchCount != null && args.targetBatchCount < 1)` throw `'targetBatchCount must be at least 1'`
  - Pass `targetBatchCount: args.targetBatchCount ?? null` to `launchDomainEvaluation`
- **Key type constraint**: `LaunchGroup` needs a `repIndex` field or the loop must use a wrapper type. Do NOT modify the `LaunchGroup` type stored in the `groups` map — create a new local type `LaunchGroupRep = LaunchGroup & { batchGroupId: string | null }` pre-computed at the top-up stage.

**Cleaner approach for configExtras**: Instead of modifying how `definitionConfigExtras` is built, pre-build a `LaunchGroupRep[]` array before the budget loop:
```typescript
type LaunchGroupRep = {
  group: LaunchGroup;
  batchGroupId: string | null;  // randomUUID() per paired rep, null for singles
};
const launchGroupReps: LaunchGroupRep[] = [];
for (const group of launchGroups) {
  const repetitions = ...; // from topUpCounts
  for (let rep = 0; rep < repetitions; rep++) {
    launchGroupReps.push({
      group,
      batchGroupId: group.pairKey !== null ? randomUUID() : null,
    });
  }
}
```
Then use `launchGroupReps` in the budget loop and configExtras loop. This avoids mutating `LaunchGroup` and generates fresh `batchGroupId`s cleanly.

---

## US-3 + US-1: Grid display and UI controls (frontend)

### Task 5: Update web operations GQL strings and types
- [ ] In `cloud/apps/web/src/api/operations/domains.ts`:
  - Add `existingBatchCount` and `topUpCount` to `DOMAIN_TRIALS_PLAN_QUERY` vignette fields
  - Add `$targetBatchCount: Int` and `$scopeCategory: String` variables to `DOMAIN_TRIALS_PLAN_QUERY` and pass through
  - Add `targetBatchCount?: number` and `scopeCategory?: string` to `DomainTrialsPlanQueryVariables`
  - Add `existingBatchCount: number` and `topUpCount: number` to vignette type in `DomainTrialsPlanQueryResult`
  - Add `$targetBatchCount: Int` to `START_DOMAIN_EVALUATION_MUTATION` and pass `targetBatchCount: $targetBatchCount`
  - Add `targetBatchCount?: number` to `StartDomainEvaluationMutationVariables`

### Task 6: LaunchControlsPanel — add target batch count input
- [ ] In `cloud/apps/web/src/components/domains/domainTrials/LaunchControlsPanel.tsx`:
  - Add props: `targetBatchCountEnabled: boolean`, `targetBatchCountInput: string`, `hasValidTargetBatchCount: boolean`, `onSetTargetBatchCountEnabled: (v: boolean) => void`, `onSetTargetBatchCountInput: (v: string) => void`
  - Add checkbox + number input in main controls row (not in Advanced section)
  - Show `"Must be a whole number ≥ 1"` when enabled but invalid
  - Disable launch button when `targetBatchCountEnabled && !hasValidTargetBatchCount`

### Task 7: TrialGridTable — show batch counts in target mode
- [ ] In `cloud/apps/web/src/components/domains/domainTrials/TrialGridTable.tsx`:
  - Add optional props: `topUpCountByDefinitionId?: Map<string, number>`, `existingBatchCountByDefinitionId?: Map<string, number>`
  - In "Batches" column: when `topUpCountByDefinitionId` is provided, use backend-provided `topUpCount` (correct for paired vignettes):
    - `topUp > 0`: `{existing} existing, launching {topUp}`
    - `topUp === 0`: `{existing} existing (target met)`
  - Fallback: show model count when props absent (no regression)

### Task 8: LaunchConfirmModal — show target batch count
- [ ] In `cloud/apps/web/src/components/domains/domainTrials/LaunchConfirmModal.tsx`:
  - Add optional `targetBatchCount?: number` prop
  - When provided, show "Target batch count: N" row in summary

### Task 9: DomainTrialsDashboard — wire everything together
- [ ] In `cloud/apps/web/src/pages/DomainTrialsDashboard.tsx`:
  - Add state: `targetBatchCountEnabled: boolean` (init false), `targetBatchCountInput: string` (init '5')
  - Compute: `parsedTargetBatchCount = Number.parseInt(targetBatchCountInput, 10)`, `hasValidTargetBatchCount = Number.isInteger(parsedTargetBatchCount) && parsedTargetBatchCount >= 1`
  - Pass `targetBatchCount: targetBatchCountEnabled && hasValidTargetBatchCount ? parsedTargetBatchCount : undefined` to `DOMAIN_TRIALS_PLAN_QUERY` variables
  - Pass `scopeCategory` to `DOMAIN_TRIALS_PLAN_QUERY` variables (already known from state)
  - Build `existingBatchCountByDefinitionId: Map<string, number>` from `plan?.vignettes.map(v => [v.definitionId, v.existingBatchCount])`
  - Build `topUpCountByDefinitionId: Map<string, number>` from `plan?.vignettes.map(v => [v.definitionId, v.topUpCount])`
  - **Cost display in target mode**: when `targetBatchCountEnabled && hasValidTargetBatchCount`, prefer `plan?.totalEstimatedCost` (which is top-up-adjusted) over `estimate?.totalEstimatedCost` for display in `LaunchControlsPanel` and `LaunchConfirmModal`. When target mode is off, use existing logic.
  - Pass `topUpCountByDefinitionId` and `existingBatchCountByDefinitionId` to `TrialGridTable`
  - Pass `targetBatchCount` to `LaunchConfirmModal` when enabled
  - In `handleStart`: pass `targetBatchCount: targetBatchCountEnabled && hasValidTargetBatchCount ? parsedTargetBatchCount : undefined`
  - Add `(targetBatchCountEnabled && !hasValidTargetBatchCount)` to handleStart guard

---

## Quality Checklist

- [ ] `npm run build --workspace @valuerank/api` passes with no type errors
- [ ] `npm run lint --workspace @valuerank/api` passes (no `any`, strict mode, noUncheckedIndexedAccess)
- [ ] `npm run build --workspace @valuerank/web` passes
- [ ] `npm run lint --workspace @valuerank/web` passes
- [ ] No file exceeds 400-line limit (check domain.ts after changes)
- [ ] Protected files untouched: CLAUDE.md, AGENTS.md, MEMORY.md, .gitignore
- [ ] Backward compatible: when `targetBatchCount` absent, behavior identical to before
- [ ] `computeTopUpCounts` used by both query and mutation (no duplicated logic)
- [ ] Each paired top-up batch gets a fresh `batchGroupId`
- [ ] No `@ts-ignore` or `any` types introduced
- [ ] `DomainEstimateInternals.trialPlan.vignettes` uses `DomainTrialPlanVignette[]` (not inline shape)

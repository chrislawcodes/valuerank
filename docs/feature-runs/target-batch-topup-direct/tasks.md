# Tasks: Target Batch Top-up

## Phase 1: Backend — Types + Query (existingBatchCount)

- [ ] **T1.1** Add `existingBatchCount: number` to `DomainTrialPlanVignette` type in `cloud/apps/api/src/graphql/queries/domain/shared.ts`
- [ ] **T1.2** Expose `existingBatchCount` on `DomainTrialPlanVignetteRef` in `cloud/apps/api/src/graphql/queries/domain/types.ts`
- [ ] **T1.3** Add `scopeCategory` arg to `domainTrialsPlan` query field in `cloud/apps/api/src/graphql/queries/domain/planning.ts` (default 'PRODUCTION'); pass it through to `buildDomainEstimate`
- [ ] **T1.4** In `buildDomainEstimate` in `cloud/apps/api/src/graphql/queries/domain/planning.ts`:
  - Query completed + in-flight runs per definition: `db.run.findMany` where `definitionId in latestDefinitionIds`, `runCategory = effectiveScopeCategory`, `deletedAt = null`, status in `[COMPLETED, PENDING, RUNNING, PAUSED, SUMMARIZING]`
  - Filter by temperature match: `parseTemperature(run.config?.temperature) === temperature`
  - Build `existingCountByDefinitionId: Map<string, number>`
  - Set `existingBatchCount: existingCountByDefinitionId.get(def.id) ?? 0` on each vignette in the result

## Phase 2: Backend — Mutation (targetBatchCount + launch logic)

- [ ] **T2.1** Add `targetBatchCount?: number | null` to `DomainEvaluationLaunchInput` type in `cloud/apps/api/src/graphql/mutations/domain.ts`
- [ ] **T2.2** Add `targetBatchCount: t.arg.int({ required: false })` arg to `startDomainEvaluation` mutation field
- [ ] **T2.3** Pass `targetBatchCount: args.targetBatchCount ?? null` into `launchDomainEvaluation` call
- [ ] **T2.4** In `launchDomainEvaluation`, after `groupDefinitionsByPairKey`:
  - When `targetBatchCount` is set (> 0):
    - Query existing runs per definitionId: `db.run.findMany` where `definitionId in latestDefinitionIds`, `runCategory = scopeCategory`, `deletedAt = null`, status in `[COMPLETED, PENDING, RUNNING, PAUSED, SUMMARIZING]`
    - Filter by temperature match (using `parseTemperature`)
    - Build `existingCountByDefinitionId: Map<string, number>`
    - For paired groups: `pairMin = min(existingA ?? 0, existingB ?? 0)`, `delta = max(0, targetBatchCount - pairMin)`. Set `deltaByGroupKey` for this group's pairKey.
    - For single groups: `existing = existingCountByDefinitionId[def.id] ?? 0`, `delta = max(0, targetBatchCount - existing)`
    - Store delta per group (Map keyed by group index or pairKey)
  - When `targetBatchCount` is NOT set: delta = 1 for all groups
- [ ] **T2.5** Skip the `hasActiveEquivalentRun` guard when `targetBatchCount` is set (the delta computation already prevents over-launching)
- [ ] **T2.6** Replace `definitionConfigExtras` map + single startRun loop with a `launchSlots` array:
  - For each group with delta > 0:
    - For `i` in `0..delta`:
      - If paired: generate `batchGroupId = randomUUID()`, push two slots (one for A, one for B) sharing this UUID
      - If single: push one slot with `configExtras = undefined`
  - The existing budget-cap logic must wrap the ENTIRE delta for a group atomically (not per-slot). `groupCost = (per-definition estimate sum) × delta`. If `projectedCostUsd + groupCost > budgetCap`, skip the whole group.
- [ ] **T2.7** Update `launchableDefinitions` to be derived from slots: `slots.map(s => s.definition)`
- [ ] **T2.8** Update `domainEvaluationRun.createMany` to record one entry per started run (unchanged in logic, just more runs now)

## Phase 3: Web — GraphQL operations types

- [ ] **T3.1** Add `$scopeCategory: String` variable and arg to `DOMAIN_TRIALS_PLAN_QUERY`, and add `existingBatchCount` to the vignette fragment in `cloud/apps/web/src/api/operations/domains.ts`
- [ ] **T3.2** Update `DomainTrialsPlanQueryResult` TS type: vignettes get `existingBatchCount: number`; update `DomainTrialsPlanQueryVariables` to include `scopeCategory?: string`
- [ ] **T3.3** Add `$targetBatchCount: Int` variable and arg to `START_DOMAIN_EVALUATION_MUTATION`
- [ ] **T3.4** Update `StartDomainEvaluationMutationVariables` type: add `targetBatchCount?: number`

## Phase 4: Web — LaunchControlsPanel

- [ ] **T4.1** Add props to `LaunchControlsPanelProps`:
  - `targetBatchCountEnabled: boolean`
  - `targetBatchCountInput: string`
  - `hasValidTargetBatchCount: boolean`
  - `onSetTargetBatchCountEnabled: (value: boolean) => void`
  - `onSetTargetBatchCountInput: (value: string) => void`
- [ ] **T4.2** Render "Target batch count" checkbox + number input in the controls panel (alongside budget cap controls)
  - Checkbox label: "Target batch count"
  - Input: `type="number"` min=1, step=1, disabled when not enabled
  - Show validation hint when enabled but invalid

## Phase 5: Web — TrialGridTable

- [ ] **T5.1** Add props to `TrialGridTableProps`:
  - `existingBatchCounts?: Map<string, number>` (keyed by definitionId)
  - `targetBatchCount?: number`
- [ ] **T5.2** Update "Batches" column rendering:
  - When `targetBatchCount` is set: show `{existing} existing / {max(0, targetBatchCount - existing)} to launch (target {targetBatchCount})`
  - When `targetBatchCount` is not set: preserve existing behavior (show `models.length`)

## Phase 6: Web — LaunchConfirmModal

- [ ] **T6.1** Add `targetBatchCount?: number` prop to `LaunchConfirmModalProps`
- [ ] **T6.2** Show "Target: N batches per vignette" in the confirm details when `targetBatchCount` is set

## Phase 7: Web — DomainTrialsDashboard wiring

- [ ] **T7.1** Add state: `targetBatchCountEnabled`, `targetBatchCountInput`, derived `parsedTargetBatchCount`, `hasValidTargetBatchCount`, `targetBatchCount`
- [ ] **T7.2** Pass `scopeCategory` to `DOMAIN_TRIALS_PLAN_QUERY` variables
- [ ] **T7.3a** Build `existingBatchCounts` map from plan vignettes: `Map<string, number>` keyed by `definitionId`
- [ ] **T7.3** Pass target state + setters to `LaunchControlsPanel`
- [ ] **T7.4** Pass `existingBatchCounts` and `targetBatchCount` to `TrialGridTable`
- [ ] **T7.5** Pass `targetBatchCount` to `LaunchConfirmModal`
- [ ] **T7.6** Pass `targetBatchCount` to `startDomainEvaluation` mutation call in `handleStart`

## Phase 8: Tests

- [ ] **T8.1** In `cloud/apps/api/tests/graphql/mutations/domain.test.ts`: add test for `targetBatchCount=2` when 1 completed run exists → launches 1 more
- [ ] **T8.2** Add test: `targetBatchCount=2` and 2 existing runs → launches 0 (skips all vignettes)
- [ ] **T8.3** Add test: `targetBatchCount=null` → existing 1-batch behavior unchanged
- [ ] **T8.4** Add test for paired group: A=1, B=2, targetBatchCount=3 → launches 2 A + 2 B

## Quality Checklist

- [ ] `npm run build --workspace @valuerank/api` passes
- [ ] `npm run build --workspace @valuerank/web` passes
- [ ] `npm run lint --workspace @valuerank/api` passes (no `any`, no unused imports)
- [ ] `npm run lint --workspace @valuerank/web` passes
- [ ] `npm run test --workspace @valuerank/api` passes
- [ ] `npm run test --workspace @valuerank/web` passes
- [ ] No `@ts-ignore` or `as any` added
- [ ] `DomainTrialPlanVignette.existingBatchCount` is always a number (default 0 when no runs exist)
- [ ] Zero-delta groups are excluded from launch list
- [ ] Budget cap logic: estimated cost for each group is multiplied by delta before checking budget

## DO NOT TOUCH

- `cloud/apps/web/src/pages/StartPairedBatchPage.tsx`
- `cloud/apps/web/src/pages/DomainCoverage.tsx`
- `groupDefinitionsByPairKey` function signature or logic
- CLAUDE.md, AGENTS.md, MEMORY.md, .gitignore

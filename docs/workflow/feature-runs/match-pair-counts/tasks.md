# Tasks: Match Pair Counts and condition-level coverage detection

Source of truth: [spec.md](./spec.md) and [plan.md](./plan.md). All decisions, edge cases, and verification rules live there. This file is the executable task list — slice boundaries are marked with `- [CHECKPOINT]` items.

## Branch & Setup

Implementation branch: `match-pair-counts` forked from `origin/main` (HEAD `057658f0` at start of this run).

Codex implementation prompts must start with `git fetch origin && git checkout -b match-pair-counts origin/main`. NOT branching from this worktree's HEAD `728da7d1`.

Pre-flight checks for each slice: lint + typecheck on `@valuerank/api` and `@valuerank/web`. Test DB setup: `DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" npm run db:test:setup`.

---

## Slice 1: Detection (resolver + new fields + client plumbing)

Estimated diff: ~350 lines. Independent.

- [ ] **T1.1** Widen the resolver's transcripts query in `cloud/apps/api/src/graphql/queries/domain-coverage.ts` (around line 167-176): add `scenarioId: true, sampleIndex: true` to the `select` block (currently only `modelId: true`). No other query changes.

- [ ] **T1.2** Add per-direction Set<slotKey> aggregation in `cloud/apps/api/src/graphql/queries/domain-coverage.ts`: parallel to the existing `directionalGroupsByDefinitionId` block (around line 296-311), build a `directionalSlotsByDefinitionId: Map<defId, Map<direction, Set<slotKey>>>` where `slotKey = "${scenarioId}|${modelId}|${sampleIndex}"`. Iterate run transcripts skipping null `scenarioId` OR null `sampleIndex`, applying the existing `filterModelIds` gate, and excluding aggregate / soft-deleted runs.

- [ ] **T1.3** Track leftover slots separately in `cloud/apps/api/src/graphql/queries/domain-coverage.ts`: build `directionalLeftoverSlotsByDefinitionId` for transcripts in INCOMPLETE runs (when `complete === false`, before the existing `continue`). Apply identical exclusion gates as the main slot aggregation: null-scenarioId, null-sampleIndex, filterModelIds, soft-delete, aggregate-run exclusion. The leftover Set must NEVER include a transcript that the main path would have filtered out.

- [ ] **T1.4** Add `computeConditionCounts` helper in `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts`. Inputs: per-definition direction Maps and contributing definition IDs. Output: `{ pairedConditionCount, orphanedConditionCount, perDirection: Map<direction, { filledSlots: number, definitionIds: string[] }> }`. `pairedConditionCount` = size of intersection of two largest direction Sets; `orphanedConditionCount` = size of symmetric difference. Handle 0/1/2/>2 directions per existing `selectPrimaryDefinitionCounts` shape.

- [ ] **T1.5** Build `directionalCoverage[]` per cell in `cloud/apps/api/src/graphql/queries/domain-coverage.ts`: per direction, populate `{ direction, completeBatches, filledSlots, leftoverConditions, definitionIds }` and sort definitionIds alphabetically.

- [ ] **T1.6** Add `DirectionalCoverage` GraphQL type and the new fields (`pairedConditionCount`, `orphanedConditionCount`, `directionalCoverage`, `contributingDefinitionIds`) to `DomainValueCoverageCell` in `cloud/apps/api/src/graphql/queries/domain-coverage-gql-types.ts`. Match the schema descriptions in plan.md.

- [ ] **T1.7** Update web GraphQL operation in `cloud/apps/web/src/api/operations/domainCoverage.graphql` and `domainCoverage.ts` to query the new fields. Run `npm run codegen --workspace @valuerank/web` to regenerate `cloud/apps/web/src/generated/graphql.ts`.

- [ ] **T1.8** Thread the new fields through the prop type in `cloud/apps/web/src/components/domains/CoverageCell.tsx` and `CoverageMatrix.tsx` (no rendering changes yet — slice 3 owns the popover).

- [ ] **T1.9** Add unit tests in `cloud/apps/api/tests/graphql/queries/domain-coverage.test.ts` covering: balanced cell (paired non-zero, orphaned 0); asymmetric at trial level only (same batches, different leftoverConditions); asymmetric at batch level; fully one-sided (paired 0, orphaned = filledSlots of present side); null `scenarioId` / null `sampleIndex` excluded; retry duplicates collapsed; aggregate runs excluded; soft-deleted runs and transcripts excluded; >2 directions corruption uses two largest; `filterModelIds` gate respected.

- [ ] **T1.10** Verify slice 1: `npx turbo lint build test --filter=@valuerank/api --filter=@valuerank/web` passes (with DATABASE_URL + JWT_SECRET env vars). Codegen ran cleanly. Commit message: `feat: add condition-level coverage detection to domainValueCoverage`.

- [CHECKPOINT] diff review for slice 1

---

## Slice 2: Backend launch (PAIRED_BATCH_TOPUP) + downstream readers

Estimated diff: ~280 lines.

- [ ] **T2.1** Extend `LaunchMode` enum/union with `PAIRED_BATCH_TOPUP` and add `topUpDirection: String` optional input field in `cloud/apps/api/src/graphql/mutations/run/lifecycle.ts` (and any types module / schema definition file the existing modes live in).

- [ ] **T2.2** Implement the new launch path in `cloud/apps/api/src/graphql/mutations/run/lifecycle.ts` around line 115. New branch: validate `topUpDirection` non-blank; load Definition and call `resolveDefinitionContent` from `@valuerank/db`; call `extractValuePair` (existing utility at `domain-coverage-utils.ts:5`) and reject if `topUpDirection` is not one of `valueA`/`valueB`; reject if caller supplied `runCategory` other than `PRODUCTION`; create ONE run with `configExtras: { jobChoiceLaunchMode: 'PAIRED_BATCH_TOPUP', jobChoiceBatchGroupId: crypto.randomUUID(), jobChoiceValueFirst: topUpDirection, methodologySafe: true }`. Set `runCategory: 'PRODUCTION'`. Do NOT call `persistPairedCompanionRunIds`.

- [ ] **T2.3** Audit log entry in `cloud/apps/api/src/graphql/mutations/run/lifecycle.ts`: `log.info({ runId, definitionId, userId, launchMode: 'PAIRED_BATCH_TOPUP', topUpDirection, ... }, 'Top-up run started')`. Asserted via mocked logger in tests.

- [ ] **T2.4** Thread `PAIRED_BATCH_TOPUP` through `cloud/apps/web/src/api/run-json-types.ts` (extend `jobChoiceLaunchMode` union to include the new value).

- [ ] **T2.5** Add a label for the top-up mode in `cloud/apps/web/src/pages/RunDetail/RunDetail.tsx` (recommend "Paired batch top-up"). Use a TypeScript-exhaustive switch so adding a future mode without updating it fails the build.

- [ ] **T2.6** Review `cloud/apps/web/src/pages/AnalysisDetail.tsx` `isPairedBatch` logic: top-up runs are NOT paired structurally (per spec decision 6). Add a separate label like "Top-up run" if helpful, but do not pass `companionRun`. Don't break `PAIRED_BATCH` rendering.

- [ ] **T2.7** Add mutation tests in `cloud/apps/api/tests/graphql/mutations/run/lifecycle.test.ts` (or new `paired-batch-topup.test.ts`): happy path (one run, right config, no companion); missing topUpDirection → error; blank topUpDirection → error; mismatched value name → error; runCategory override → error; deleted definition → error; existing PAIRED_BATCH and AD_HOC_BATCH unchanged (regression); audit log structured payload contains expected fields.

- [ ] **T2.8** Add web test in `cloud/apps/web/tests/pages/RunDetail.test.tsx`: top-up run renders with non-empty label.

- [ ] **T2.9** Verify slice 2: `npx turbo lint build test --filter=@valuerank/api --filter=@valuerank/web` passes. TypeScript exhaustiveness check fires if any consumer is missed. Commit message: `feat: add PAIRED_BATCH_TOPUP launch mode for paired-batch top-ups`.

- [CHECKPOINT] diff review for slice 2

---

## Slice 3: UI (popover + Match Pair Counts + summary card)

Estimated diff: ~400 lines. Depends on slice 1 (cell exposes new fields) and slice 2 (mutation accepts new mode).

- [ ] **T3.1** Create `cloud/apps/web/src/utils/coverageGap.ts` exporting `computeLaggingDirection(cell)` (returns `{ direction, definitionId } | null`) implementing spec's 6-rule tie-breaker reading `directionalCoverage[].filledSlots` and `[].completeBatches`. Also export `formatPairLabel(valueA, valueB)` using existing `VALUE_LABELS` from `domainAnalysisData`. Pure functions, no React.

- [ ] **T3.2** Add unit tests in `cloud/apps/web/tests/utils/coverageGap.test.ts` covering each rule branch (A<B, A>B, A=B with batch tiebreak, all-equal no-gap, one-sided, alphabetical fallback) and multi-definition aggregate cells.

- [ ] **T3.3** Create shared trial-count helper at `cloud/packages/shared/src/launch-trial-count.ts` exporting `computeLaunchTrialCount({ scenarioCount, samplePercentage, samplesPerScenario, scenarioIds, modelCount })`. Two branches matching backend `sampleScenarios()` formula in `cloud/apps/api/src/services/run/start-helpers.ts:163`: sample-percentage uses `Math.max(1, Math.floor(scenarioCount * samplePercentage / 100))`; specific-condition (when `scenarioIds` non-empty) uses `scenarioIds.length`. Export from `cloud/packages/shared/src/index.ts`.

- [ ] **T3.4** Add tests in `cloud/packages/shared/tests/launch-trial-count.test.ts`: round-trip vs backend `sampleScenarios()` on a fixture set; edge cases for samplePercentage at 100, sub-1, and specific-condition mode.

- [ ] **T3.5** Update `cloud/apps/web/src/components/domains/CoverageCell.tsx` popover: add Transcripts column header above the per-model breakdown (only when at least one model row is shown); render per-direction `X batches + Y conditions` (read from `directionalCoverage`); add Match Pair Counts link (gated on `aggregateRunId === null && (orphanedBatchCount > 0 || orphanedConditionCount > 0)`); show informational warning when `incompleteBatchCount > 0` (no specific count, always plural); link target `/definitions/<launchDefinitionId>/start-paired-batch` with route state per spec's `StartPairedBatchRouteState.matchPairCounts`. `launchDefinitionId` follows DefinitionId-to-launch rule: `directionalCoverage[laggingDirection].definitionIds[0]` (alphabetically-first by id) with cell `definitionId` as fallback.

- [ ] **T3.6** Update `cloud/apps/web/src/pages/DefinitionDetail/StartPairedBatchPage.tsx`: read `routeState.matchPairCounts` (optional; behavior unchanged when absent). When present, render summary card above `<RunForm>` (pair label via `formatPairLabel`, 2-row before/after table, footer with batch + trial deltas), pre-fill form per spec decision 7 (defaults + `launchMode: 'PAIRED_BATCH_TOPUP'`, `jobChoiceValueFirst` pinned, read-only), recompute "after" on form change via `computeLaunchTrialCount`, pass `topUpDirection` to mutation. Show yellow note if recomputed "after" leaves a residual mismatch.

- [ ] **T3.7** Add component tests in `cloud/apps/web/tests/components/domains/CoverageCell.test.tsx`: popover renders Transcripts header; renders X batches + Y conditions per direction; Match Pair Counts visible only on cells with a gap; hidden on aggregate cells; warning shown when incompleteBatchCount > 0; click navigates with correct route state.

- [ ] **T3.8** Add page tests in `cloud/apps/web/tests/pages/DefinitionDetail/StartPairedBatchPage.test.tsx`: summary card renders when route state has `matchPairCounts`; card recomputes after-state when scenarioCount, samplesPerScenario, samplePercentage change; form submits with `launchMode: 'PAIRED_BATCH_TOPUP'` and `topUpDirection`; refresh / no-route-state path renders form unchanged (US-5 regression).

- [ ] **T3.9** Verify slice 3: `npx turbo lint build test --filter=@valuerank/web --filter=@valuerank/shared` passes. Commit message: `feat: add Match Pair Counts UI and condition-level popover display`.

- [CHECKPOINT] diff review for slice 3

---

## Pre-merge production smoke test (per ship skill Step 4.5)

After all 3 slices land but BEFORE merge, run via ANY of these execution paths (whichever is available at smoke-test time): valuerank MCP `graphql_query` tool (preferred), authenticated curl against the production GraphQL endpoint with the API key, or local Apollo Sandbox connected to production.

Smoke-test steps:

1. `gh auth status` confirm logged in
2. Run `domainValueCoverage` against the largest production domain
3. Confirm: `pairedConditionCount` and `orphanedConditionCount` are non-null integers on every cell; for the known asymmetric cell `achievement::power_dominance` (was 14/16 batches in PR #759 smoke test) `orphanedConditionCount > 0` and `directionalCoverage` shows ~14 vs ~16 complete batches with substantial filledSlots; for known balanced `achievement::conformity_interpersonal` `orphanedConditionCount` is small or zero; resolver query latency within 200ms of pre-feature baseline
4. Manual UI test: click an asymmetric cell, click Match Pair Counts, verify summary card renders, submit, verify the new run appears in the runs list with `launchMode: 'PAIRED_BATCH_TOPUP'`

If any check fails, do NOT merge. Investigate before retrying.

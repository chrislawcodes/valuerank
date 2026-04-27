# Plan — Compact (architecture + slice structure)

## 3-slice architecture

```
[Slice 1: Detection] → [Slice 2: Backend launch] → [Slice 3: UI]
```

- **Slice 1**: Resolver expansion + new GraphQL fields + client GQL operation update + codegen + prop-type threading + tests. ~350 lines. Independent.
- **Slice 2**: New `PAIRED_BATCH_TOPUP` launch mode + validation + downstream-reader threading (run-json-types, RunDetail, AnalysisDetail) + tests. ~280 lines.
- **Slice 3**: Cell popover update + Match Pair Counts action + Start Paired Batch summary card + shared trial-count helper + lagging-direction client helper + tests. ~400 lines. Depends on slices 1 + 2.

## Branch strategy

**Critical:** worktree HEAD is `728da7d1` (pre-PR-#756 / pre-PR-#759). Implementation MUST fork from `origin/main` HEAD `057658f0`:

```bash
git fetch origin && git checkout -b match-pair-counts origin/main
```

NOT branching from this worktree's HEAD.

## No schema migrations

All work uses existing Prisma fields. No `prisma migrate` step. Existing fields used:
- `Run.config.jobChoiceValueFirst`, `jobChoiceBatchGroupId`, `jobChoiceLaunchMode` (gains new value `'PAIRED_BATCH_TOPUP'`), `companionRunId` (intentionally unset for top-ups)
- `Run.runCategory` ('PRODUCTION' for top-ups)
- `Transcript.scenarioId`, `sampleIndex`, `modelId` (resolver query is widened to select all three)

## Resolver implementation hints (slice 1)

- Widen the existing `transcripts.select` block in `cloud/apps/api/src/graphql/queries/domain-coverage.ts` (around line 167-176) to include `scenarioId: true, sampleIndex: true`
- Per-direction `Set<slotKey>` aggregation: build alongside existing `directionalGroupsByDefinitionId` (around line 296-311); `slotKey = "${scenarioId}|${modelId}|${sampleIndex}"`
- Skip transcripts with null `scenarioId` OR null `sampleIndex` (matching `coverage-completeness.ts` pattern)
- Apply existing `filterModelIds` gate (line 209-210); skip soft-deleted runs/transcripts (`deletedAt: null`); skip aggregate runs
- Track leftover slots separately (transcripts in INCOMPLETE runs, where `complete === false` before the existing `continue`); apply identical gates
- New helper `computeConditionCounts` in `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts`: returns `{ pairedConditionCount, orphanedConditionCount, perDirection: Map<direction, { filledSlots, definitionIds }> }`. Handle 0/1/2/>2 directions per existing `selectPrimaryDefinitionCounts` shape.
- Build `directionalCoverage[]` per cell: `{ direction, completeBatches, filledSlots, leftoverConditions, definitionIds }` with `definitionIds` sorted alphabetically.

## Mutation implementation hints (slice 2)

- New branch in `cloud/apps/api/src/graphql/mutations/run/lifecycle.ts` around line 115 (where existing `if (launchMode === 'PAIRED_BATCH')` lives): `else if (launchMode === 'PAIRED_BATCH_TOPUP')`. Validate, load definition + `extractValuePair`, reject mismatched/conflicting inputs, call `startRunService` with the right `configExtras`. Do NOT call `persistPairedCompanionRunIds`.
- Thread `'PAIRED_BATCH_TOPUP'` through `cloud/apps/web/src/api/run-json-types.ts` (extend the launch-mode union), `RunDetail.tsx` (add label), `AnalysisDetail.tsx` (review `isPairedBatch` — top-ups are NOT paired structurally, no `companionRun`).
- Use a TypeScript exhaustive switch in a `runLabels.ts` helper so any future mode without a label fails the build.

## UI implementation hints (slice 3)

- New file `cloud/apps/web/src/utils/coverageGap.ts`: pure helpers `computeLaggingDirection(cell)` (returns `{ direction, definitionId } | null`) and `formatPairLabel(valueA, valueB)`.
- Shared helper `cloud/packages/shared/src/launch-trial-count.ts`: `computeLaunchTrialCount(input)` matching backend `sampleScenarios()` exactly. Export from `cloud/packages/shared/src/index.ts`.
- Update `CoverageCell.tsx` popover: Transcripts header, X batches + Y conditions per direction, Match Pair Counts link with route state per the spec contract. Hide on aggregate cells.
- Update `StartPairedBatchPage.tsx`: detect `routeState.matchPairCounts`, render summary card with pre-filled form locked to top-up mode + lagging direction.

## Residual risks (each with verifiable pre-merge check)

- **Risk 1**: Resolver query expansion adds latency. Verify: real-data query against largest production cell, compare latency before/after; reject if >200ms regression.
- **Risk 2**: Slot dedupe correctness on retry-heavy cells. Verify: regression test fixture with two same-direction runs filling the same slot; assert that slot counts once.
- **Risk 3**: Top-up run treated wrong by aggregate analysis. Verify: integration test launches baseline N-trial paired batch + M-trial top-up, runs aggregate analysis, asserts result reflects N+M trials' data.
- **Risk 4**: UI summary card math drifts from backend. Verify: shared `computeLaunchTrialCount` helper consumed by both UI and backend tests; round-trip assertion.
- **Risk 5**: Route state lost on refresh / new tab. Verify: integration test refreshes Match Pair Counts page, asserts standard form renders without crash.
- **Risk 6**: New launch mode breaks existing readers. Verify: TypeScript exhaustiveness check via switch in `runLabels.ts`; RunDetail test asserts top-up renders with non-empty label.
- **Risk 7**: Aggregate analysis silently includes top-up run with wrong data. Verify: same as Risk 3; tests must assert N+M trials' DATA contributes (not just inclusion in `sourceRunIds`).
- **Risk 8**: Audit log payload silently drifts. Verify: mutation test mocks logger, asserts structured payload contains expected fields.

## Pre-merge production smoke test (Step 4.5)

Required because this changes a GraphQL resolver. Use the valuerank MCP `graphql_query` tool (or curl with API key, or Apollo Sandbox) to:
1. Run `domainValueCoverage` against the largest production domain
2. Confirm `pairedConditionCount` and `orphanedConditionCount` are non-null integers on every cell
3. For known asymmetric cell `achievement::power_dominance` (was 14/16 batches in PR #759 smoke test): `orphanedConditionCount > 0`, `directionalCoverage` shows ~14 vs ~16 with substantial filledSlots
4. For known balanced `achievement::conformity_interpersonal`: `orphanedConditionCount` near zero
5. Manual UI: click an asymmetric cell, click Match Pair Counts, verify summary card renders, submit, verify run appears with `launchMode: 'PAIRED_BATCH_TOPUP'`

If any check fails, do NOT merge.

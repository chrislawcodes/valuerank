# Closeout: Match Pair Counts and condition-level coverage detection

## What shipped

PR [chrislawcodes/valuerank#766](https://github.com/chrislawcodes/valuerank/pull/766) — branch `match-pair-counts` against `main` HEAD `3878e844`.

### Backend (API)

- **Resolver expansion** (`cloud/apps/api/src/graphql/queries/domain-coverage.ts`): widened the `transcripts` Prisma selection to include `scenarioId` and `sampleIndex`, added per-direction `Set<slotKey>` aggregation alongside the existing directional groups, and tracked leftover slots from incomplete runs separately.
- **New helper** `computeConditionCounts` (`domain-coverage-utils.ts`): computes `pairedConditionCount` (set intersection size) and `orphanedConditionCount` (symmetric difference size) plus per-direction breakdowns. Handles 0/1/2/>2 directions per the existing `selectPrimaryDefinitionCounts` shape.
- **GraphQL schema additions** (`domain-coverage-gql-types.ts`): new `DirectionalCoverage` type with `direction`, `completeBatches`, `filledSlots`, `leftoverConditions`, `definitionIds`. New scalars on `DomainValueCoverageCell`: `pairedConditionCount`, `orphanedConditionCount`, `directionalCoverage`, `contributingDefinitionIds`.
- **New launch mode** `PAIRED_BATCH_TOPUP` (`mutations/run/lifecycle.ts`): single-direction launch with `methodologySafe: true`, `runCategory: 'PRODUCTION'`, fresh `jobChoiceBatchGroupId`, no companion. Validates `topUpDirection` matches the target definition's value pair (loaded via `resolveDefinitionContent` + `extractValuePair`). Rejects conflicting `runCategory` input.

### Frontend (web)

- **Cell popover** (`CoverageCell.tsx`): added "Transcripts" column header on the per-model breakdown; extended PR #764's "Direction imbalance" orange box to a column-header table showing both batch and condition counts per direction; added "Match Pair Counts" CTA link below "Start Paired Batch", gated on `hasImbalance` (which already excludes pure-aggregate cells).
- **Pure helper** `coverageGap.ts`: `computeLaggingDirection` (6-rule deterministic tie-breaker) + `formatPairLabel` (using `VALUE_LABELS`).
- **Start Paired Batch page** (`StartPairedBatchPage.tsx`): when arrived via Match Pair Counts, renders summary card with before/after diff per direction, footer with batch and trial deltas, pre-fills form to `PAIRED_BATCH_TOPUP` mode with locked direction.
- **Shared helper** `cloud/packages/shared/src/launch-trial-count.ts`: matches backend `sampleScenarios()` formula exactly so card recompute and backend launch never drift.
- **Downstream readers**: `RunDetail.tsx` and `AnalysisDetail.tsx` thread the new `PAIRED_BATCH_TOPUP` value through their launch-mode label maps. `run-json-types.ts` updated.

### Tests

- **API**: 81 unit tests in `domain-coverage.test.ts` (835 lines) + `domain-coverage-integration.test.ts` (527 lines, split out for the 1200-line CI hard limit). Includes 2 new regression tests for the disjoint-slots bug caught during diff review.
- **Web**: `CoverageCell.test.tsx` (3 tests including new aggregateRunId gate regression), `coverageGap.test.ts` (rule-by-rule), `StartPairedBatchPage.test.tsx` (route state, summary card, refresh fallback), `RunDetail.test.tsx` (top-up label).
- **Shared**: `launch-trial-count.test.ts` (round-trip vs backend sampleScenarios formula).

## Verification status

- [x] **Lint + build clean** across `@valuerank/shared`, `@valuerank/api`, `@valuerank/web` (9 turbo tasks)
- [x] **Tests pass** locally (81 api + 3 web cell tests)
- [x] **All 7 CI checks pass** on PR #766 (Detect changed paths, Lint & Build, Feature Factory Tests, Web Tests 1/3 + 2/3 + 3/3, API & DB Tests)
- [x] **Production smoke against existing fields** — domainValueCoverage returns 45 healthy cells, 6 asymmetric, math correct (no regression on PR #759 / PR #764 functionality)
- [ ] **Production smoke against new fields** — pending merge; will validate `pairedConditionCount`/`orphanedConditionCount`/`directionalCoverage` on a known asymmetric production cell post-merge

## Workflow artifacts

- `spec.md` (39 KB) — 9 spec-level decisions, 6 user stories, 9 counting invariants, 6-rule lagging-direction tie-breaker, integration with PR #759 / PR #764
- `spec-acceptance.md` (compact summary, 8 KB) used as the Codex prompt context — contains 8 integration rules for PR #764 coexistence
- `plan.md` (27 KB) — 3-slice architecture, GraphQL schema additions, 8 residual risks each with verifiable pre-merge checks, branch-from-main strategy
- `plan-summary.md` (compact summary, 7 KB) used as the Codex prompt context
- `tasks.md` (8 KB) — checkbox-format tasks with `[CHECKPOINT]` slice boundaries
- 14 review files under `reviews/` (spec, plan, tasks, diff stages × 2 Codex + 1 Gemini lens, multiple rounds)

## Bugs caught and fixed during diff review

Two HIGH-severity bugs were caught by the diff-stage adversarial review and hand-fixed before push:

1. **`computeConditionCounts` size-vs-intersection bug** (commit `146b1eef`): the original implementation used `min(setA.size, setB.size)` for `pairedConditionCount` and `(max - min)` for `orphanedConditionCount`. That was wrong whenever slot identities did not overlap — `{s1, s2}` vs `{s3, s4}` would have shipped reporting "fully paired (2)" when the true intersection is 0. Fixed to use real Set intersection / symmetric difference. Two regression tests added: disjoint identities (paired=0, orphaned=4) and partial overlap (paired = |intersection|, orphaned = |symmetric difference|).

2. **`aggregateRunId === null` gate hiding the CTA on every cell** (commit `5674b32d`): the resolver sets `aggregateRunId` from `latestAggregateRunIdByDefinitionId ?? latestMatchingRunIdByDefinitionId`, so it is non-null on every cell with any completed run. Gating the CTA on `aggregateRunId === null` hid Match Pair Counts on virtually every cell with real data — the feature was unreachable in the common case. Fixed by removing the redundant gate; pure-aggregate cells are already excluded by `hasImbalance` since aggregate runs do not contribute to orphan counts. Tests updated to verify both invariants.

## What remains open

- **Post-merge production smoke** for the new fields (Step 4.5 from the ship skill): query `domainValueCoverage` against a known asymmetric production cell and confirm `pairedConditionCount` / `orphanedConditionCount` / `directionalCoverage` return correct values. The 6 asymmetric prod cells found during the pre-merge smoke are good candidates.
- **Disjoint-slots tie-breaker edge case**: when both directions have equal `filledSlots` and `completeBatches` but the slot identities are disjoint (orphanedConditionCount > 0), `computeLaggingDirection` returns `null`. The cell falls back to alphabetical-first via `valueA <= valueB ? valueA : valueB`. This is acceptable per the spec's tie-breaker chain but is a niche edge case worth observing in production data.
- **>2 directions corruption corner case**: `computeConditionCounts` keeps the two largest direction sets when the data has more than two distinct `jobChoiceValueFirst` tokens. This silently drops the 3rd+ directions' slot identities. Documented as a known limitation; rare data-corruption case not worth fixing pre-merge.

## Deferred risks

- **Resolver query latency**: the widened `transcripts` selection adds two columns per row. Pre-merge baseline check on the largest production cell was not done; CI lint/build doesn't measure latency. Plan calls this out (Risk 1) with verification "before merging slice 1, run graphql_query against the largest known production cell". This should be done before merge.
- **Aggregate analysis correctness for top-up runs**: a top-up run is a single non-paired non-aggregate run with a fresh `jobChoiceBatchGroupId`. Plan Risk #3 requires "integration test launches baseline N-trial paired batch + M-trial top-up, runs aggregate analysis, asserts result reflects N+M trials' data". Not yet done. Should be verified before the first real-data top-up launch.

## Where workflow artifacts live

`docs/workflow/feature-runs/match-pair-counts/` — committed on the `match-pair-counts` branch.

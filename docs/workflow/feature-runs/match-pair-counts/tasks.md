# Tasks: Match Pair Counts and condition-level coverage detection

Source of truth: [spec.md](./spec.md) and [plan.md](./plan.md). All decisions, edge cases, and verification rules live there. This file is the executable task list — slice boundaries, dependency order, and parallel annotations.

## Branch & Setup

**Implementation branch:** `match-pair-counts` forked from `origin/main` (HEAD `057658f0` at start of this run). Codex implementation prompts MUST start with:

```bash
git fetch origin && git checkout -b match-pair-counts origin/main
```

NOT branching from this worktree's HEAD `728da7d1`.

**Pre-flight checks (Codex prompts must run before each slice):**

- `npm run lint --workspace @valuerank/api` clean
- `npm run typecheck --workspace @valuerank/api` clean
- `npm run typecheck --workspace @valuerank/web` clean

**Test database setup** (only needed for slice 1 + slice 2 integration tests):

```bash
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" npm run db:test:setup
```

---

## Slice 1: Detection (resolver + new fields + client plumbing)

**Estimated diff: ~350 lines.** Independent (no dep on slices 2/3).

### 1.1 — Widen the resolver's transcripts query
- File: `cloud/apps/api/src/graphql/queries/domain-coverage.ts` (around line 167-176, the `transcripts: { where, select }` block in the `db.run.findMany` call)
- Add `scenarioId: true, sampleIndex: true` to the `select` block (currently only `modelId: true`)
- No other query changes

### 1.2 — Add per-direction `Set<slotKey>` aggregation
- File: `cloud/apps/api/src/graphql/queries/domain-coverage.ts`
- After the existing `directionalGroupsByDefinitionId` block (around line 296-311), add a parallel `directionalSlotsByDefinitionId: Map<string, Map<string, Set<string>>>` where the outer key is definitionId, the middle key is direction, and the inner Set holds slot keys formatted as `"${scenarioId}|${modelId}|${sampleIndex}"`
- Iterate the run's transcripts: skip when `scenarioId == null` OR `sampleIndex == null`; respect the existing `filterModelIds` gate (line 209-210); skip soft-deleted runs and transcripts; skip aggregate runs; add the slot key to the appropriate direction's Set
- Track separately: a `directionalLeftoverSlotsByDefinitionId` for transcripts in INCOMPLETE runs (when `complete === false`, before the existing `continue`). **Apply the same exclusion gates** as the main slot aggregation: null-scenarioId, null-sampleIndex, filterModelIds, soft-delete, aggregate-run exclusion. The leftover Set must NEVER include a transcript that the main path would have filtered out

### 1.3 — Compute cell-level paired/orphaned condition counts
- File: `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts`
- New exported function `computeConditionCounts(directionalSlotsByDefinitionId, contributingDefinitionIds)`:
  - Merges all definitions' direction Maps into a cell-level `Map<direction, Set<slotKey>>`
  - Returns `{ pairedConditionCount, orphanedConditionCount, perDirection: Map<direction, { filledSlots: number, definitionIds: string[] }> }`
  - `pairedConditionCount` = size of intersection of two largest direction Sets (handle 0/1/2/>2 directions matching the existing `selectPrimaryDefinitionCounts` shape)
  - `orphanedConditionCount` = size of symmetric difference of those two sets
- Tests in `cloud/apps/api/tests/graphql/queries/domain-coverage-utils.test.ts`: balanced cell (paired=N, orphaned=0), asymmetric (paired=min, orphaned=|A-B|), one-sided (paired=0, orphaned=N), corruption case (>2 directions; uses the two largest)

### 1.4 — Compute leftoverConditions per direction
- File: `cloud/apps/api/src/graphql/queries/domain-coverage.ts`
- Per direction: `leftoverConditions = size of merged Set<slotKey> across incomplete runs in that direction (deduped by slot)`
- Build `directionalCoverage[]` list per cell: `{ direction, completeBatches, filledSlots, leftoverConditions, definitionIds }`

### 1.5 — Add new GraphQL types and fields
- File: `cloud/apps/api/src/graphql/queries/domain-coverage-gql-types.ts`
- Add `DirectionalCoverage` type (5 fields per plan)
- Add `pairedConditionCount`, `orphanedConditionCount`, `directionalCoverage`, `contributingDefinitionIds` to `DomainValueCoverageCell`
- Field descriptions matching the plan's GraphQL Schema section

### 1.6 — Update web client GQL operation
- Files: `cloud/apps/web/src/api/operations/domainCoverage.graphql` and `domainCoverage.ts`
- Query the new fields in the existing `domainValueCoverage` operation
- Run `npm run codegen --workspace @valuerank/web` to regenerate `cloud/apps/web/src/generated/graphql.ts`

### 1.7 — Thread types through CoverageCell + CoverageMatrix
- Files: `cloud/apps/web/src/components/domains/CoverageCell.tsx`, `CoverageMatrix.tsx`
- Add the new fields to `CoverageCellProps` (no rendering changes yet — slice 3 owns the popover)
- Pass through from `CoverageMatrix` to `CoverageCell`

### 1.8 — Tests
- New tests in `cloud/apps/api/tests/graphql/queries/domain-coverage.test.ts`:
  - Balanced cell — `pairedConditionCount` non-zero, `orphanedConditionCount === 0`
  - Asymmetric cell at trial level only (same batches, different leftoverConditions) — paired and orphaned both reflect the slot diff
  - Asymmetric at batch level — paired and orphaned reflect the difference
  - Fully one-sided cell — paired = 0, orphaned = filledSlots of present side
  - Null `scenarioId` rows excluded
  - Retry duplicates collapsed (two transcripts on same slot count once)
  - Aggregate runs excluded
  - Soft-deleted runs and transcripts excluded
  - >2 directions corruption — uses two largest counts
  - `filterModelIds` filter applied — only specified models contribute
- Test fixture: build `existingTranscripts` with explicit slot tuples to drive each case

### 1.9 — Verify and commit
- `npm run lint --workspace @valuerank/api` clean
- `npm run test --workspace @valuerank/api -- domain-coverage` clean (with `DATABASE_URL` env)
- `npm run build --workspace @valuerank/api` clean
- `npm run codegen --workspace @valuerank/web` ran cleanly
- `npm run lint --workspace @valuerank/web` clean
- `npm run build --workspace @valuerank/web` clean
- Commit message: `feat: add condition-level coverage detection to domainValueCoverage`

`[CHECKPOINT]` — diff review for slice 1.

---

## Slice 2: Backend launch (`PAIRED_BATCH_TOPUP`) + downstream readers

**Estimated diff: ~280 lines.** Depends on: nothing strict, but ideally landed after slice 1 so the smoke-test query has the new condition fields available.

### 2.1 — Add new launch mode value
- File: `cloud/apps/api/src/graphql/mutations/run/lifecycle.ts` (and its types — likely in a separate types file or schema definition)
- Extend the `LaunchMode` enum (or string union, whichever the codebase uses) with `PAIRED_BATCH_TOPUP`
- Add `topUpDirection: String` optional input field to the mutation

### 2.2 — Implement the new launch path
- File: `cloud/apps/api/src/graphql/mutations/run/lifecycle.ts` (around line 115, the `if (launchMode === 'PAIRED_BATCH')` branch)
- New `else if (launchMode === 'PAIRED_BATCH_TOPUP')` branch:
  - Validate `topUpDirection` is supplied and non-blank
  - Load Definition and resolve content via `resolveDefinitionContent` from `@valuerank/db`
  - Call `extractValuePair(resolvedContent)` (verified to exist at `domain-coverage-utils.ts:5`); reject if `topUpDirection` is not one of `valueA` / `valueB`
  - If `runCategory` was supplied as anything other than `PRODUCTION` or undefined, reject with ValidationError
  - Create ONE run via `startRunService` with config:
    ```ts
    configExtras: {
      jobChoiceLaunchMode: 'PAIRED_BATCH_TOPUP',
      jobChoiceBatchGroupId: crypto.randomUUID(),
      jobChoiceValueFirst: topUpDirection,
      methodologySafe: true,
    }
    ```
  - Set `runCategory: 'PRODUCTION'` (matching existing PAIRED_BATCH default)
  - Do NOT call `persistPairedCompanionRunIds` — top-up runs stand alone
  - Audit log entry: `log.info({ ... launchMode: 'PAIRED_BATCH_TOPUP', topUpDirection, runId, definitionId, userId, ... }, 'Top-up run started')`

### 2.3 — Thread launch mode through downstream consumers
- File: `cloud/apps/web/src/api/run-json-types.ts` (around line 10-23) — extend the `jobChoiceLaunchMode` union to include `'PAIRED_BATCH_TOPUP'`
- File: `cloud/apps/web/src/pages/RunDetail/RunDetail.tsx` (around line 88-92) — add a label for the top-up mode (recommendation: "Paired batch top-up")
- File: `cloud/apps/web/src/pages/AnalysisDetail.tsx` (around line 288) — review whether `isPairedBatch` should treat top-up as paired (recommendation: NO — top-up runs are statistical, not structural; see plan Verified Facts). Add a separate label like "Top-up run" if helpful, but do not pass `companionRun`
- TypeScript exhaustiveness: add a switch in a `runLabels.ts` helper (or wherever existing labels live) that exhaustively maps each launch mode to a label, so adding a new mode without updating it fails the build

### 2.4 — Tests
- File: `cloud/apps/api/tests/graphql/mutations/run/lifecycle.test.ts` (extend existing or create a `paired-batch-topup.test.ts`):
  - Happy path — launches one run with the right config, no companion
  - Missing `topUpDirection` — error
  - Blank `topUpDirection` — error
  - `topUpDirection` not matching either dimension — error
  - `runCategory: 'EXPLORATION'` (or any non-PRODUCTION) — error
  - Deleted definition — error
  - Existing `PAIRED_BATCH` and `AD_HOC_BATCH` modes still create runs as today (regression suite)
  - Audit log structured payload contains `{ launchMode, topUpDirection, runId, definitionId }` — assert via mocked logger
- File: `cloud/apps/web/tests/pages/RunDetail.test.tsx` — top-up run renders with a non-empty label

### 2.5 — Verify and commit
- `npm run lint --workspace @valuerank/api` clean
- `npm run test --workspace @valuerank/api -- lifecycle` clean
- `npm run build --workspace @valuerank/api` clean
- `npm run lint --workspace @valuerank/web` clean
- `npm run typecheck --workspace @valuerank/web` clean (exhaustiveness check verified by `tsc`)
- `npm run test --workspace @valuerank/web -- RunDetail` clean
- Commit message: `feat: add PAIRED_BATCH_TOPUP launch mode for paired-batch top-ups`

`[CHECKPOINT]` — diff review for slice 2.

---

## Slice 3: UI (popover + Match Pair Counts + summary card)

**Estimated diff: ~400 lines.** Depends on: slice 1 (cell exposes new fields) and slice 2 (mutation accepts `PAIRED_BATCH_TOPUP`).

### 3.1 — Pure helper module
- New file: `cloud/apps/web/src/utils/coverageGap.ts`
  - `computeLaggingDirection(cell)` per the spec's 6-rule tie-breaker, reading `directionalCoverage[].filledSlots` and `directionalCoverage[].completeBatches`
  - `formatPairLabel(valueA, valueB)` using the existing `VALUE_LABELS` from `domainAnalysisData`
- Tests `cloud/apps/web/tests/utils/coverageGap.test.ts`:
  - Each rule branch (A<B, A>B, A=B with batch tiebreak, all-equal no-gap, one-sided, alphabetical fallback)
  - Multi-definition aggregate cell (verifies the fallback to cell `definitionId`)

### 3.2 — Shared trial-count helper
- New file: `cloud/packages/shared/src/launch-trial-count.ts`
  - `computeLaunchTrialCount({ scenarioCount, samplePercentage, samplesPerScenario, scenarioIds, modelCount })` returning `number` of trials per launched direction
  - Two branches matching the backend's `sampleScenarios()` formula in `cloud/apps/api/src/services/run/start-helpers.ts:163`:
    - sample-percentage: `modelCount × max(1, floor(scenarioCount × samplePercentage / 100)) × samplesPerScenario`
    - specific-condition (when `scenarioIds` is non-empty): `modelCount × scenarioIds.length × samplesPerScenario`
  - Export the helper from `cloud/packages/shared/src/index.ts`
- Tests in `cloud/packages/shared/tests/launch-trial-count.test.ts`:
  - Round-trip: feed the helper the same inputs that backend `sampleScenarios()` uses, assert agreement on a fixture set
  - Edge cases: `samplePercentage = 100`, `samplePercentage < 1` (clamps to 1 scenario), specific-condition mode

### 3.3 — Update the cell popover
- File: `cloud/apps/web/src/components/domains/CoverageCell.tsx`
- Add a "Transcripts" header above the per-model breakdown column (only when at least one model is shown)
- Replace or augment the existing single-line per-direction display with the "X batches + Y conditions" notation, reading from `directionalCoverage`
- Compute `laggingDirection = computeLaggingDirection(cell)`
- Add Match Pair Counts link, gated on:
  - `aggregateRunId === null` (not an aggregate cell), AND
  - `cell.orphanedBatchCount > 0 || cell.orphanedConditionCount > 0`
- When `incompleteBatchCount > 0`, show the informational warning (no specific count) above the action
- Match Pair Counts link target: `/definitions/<launchDefinitionId>/start-paired-batch` with route state matching the spec's `StartPairedBatchRouteState.matchPairCounts` shape. **`launchDefinitionId` is determined by the spec's DefinitionId-to-launch rule** (see plan.md "Lagging-direction selection on the client"): it's `directionalCoverage[laggingDirection].definitionIds[0]` if non-empty, falling back to the cell's `definitionId` field. For multi-definition cells where multiple defs produce runs in the lagging direction, the FIRST element of `definitionIds` is used (the resolver returns these in deterministic order — alphabetical by id — so the choice is reproducible)

### 3.4 — Update Start Paired Batch page
- File: `cloud/apps/web/src/pages/DefinitionDetail/StartPairedBatchPage.tsx`
- Read `routeState.matchPairCounts` (optional; behavior unchanged when absent)
- When present:
  - Render a summary card above `<RunForm>`: pair label (computed via `formatPairLabel`), 2-row before/after table, footer line with batch + trial deltas
  - Pre-fill `<RunForm>` per Spec decision 7: defaults + `launchMode = 'PAIRED_BATCH_TOPUP'`, `jobChoiceValueFirst` pinned to lagging direction (read-only)
  - Recompute the "after" state on every form change using `computeLaunchTrialCount`
  - Pass `topUpDirection` to the `startRun` mutation
  - Show a yellow note in the card if the recomputed "after" leaves a residual mismatch (gap not closed, or one side overshoots)

### 3.5 — Tests
- File: `cloud/apps/web/tests/components/domains/CoverageCell.test.tsx`:
  - Popover renders Transcripts header
  - Popover renders X batches + Y conditions per direction
  - Match Pair Counts link visible on a cell with a gap, hidden when balanced, hidden on aggregate cell
  - Warning shown when incompleteBatchCount > 0
  - Click navigates with correct route state
- File: `cloud/apps/web/tests/pages/DefinitionDetail/StartPairedBatchPage.test.tsx`:
  - Renders summary card when route state has `matchPairCounts`
  - Card recomputes after-state when scenarioCount, samplesPerScenario, samplePercentage change
  - Form submits with `launchMode: 'PAIRED_BATCH_TOPUP'` and `topUpDirection`
  - Refresh / no-route-state path renders form unchanged (US-5 regression)

### 3.6 — Verify and commit
- `npm run lint --workspace @valuerank/web` clean
- `npm run test --workspace @valuerank/web` clean
- `npm run build --workspace @valuerank/web` clean
- `npm run lint --workspace @valuerank/shared` clean (for the shared helper)
- `npm run test --workspace @valuerank/shared` clean
- Commit message: `feat: add Match Pair Counts UI and condition-level popover display`

`[CHECKPOINT]` — diff review for slice 3.

---

## Pre-merge production smoke test (per ship skill Step 4.5)

After all 3 slices land but BEFORE merge, run via ANY of these execution paths (whichever is available at smoke-test time):

- **Preferred:** the valuerank MCP `graphql_query` tool (configured in `.mcp.json` per `MEMORY.md`)
- **Fallback A:** authenticated curl: `curl -X POST https://api.valuerank.app/graphql -H "X-API-Key: $VALUERANK_API_KEY" -H "Content-Type: application/json" -d '{"query": "..."}'` using the production API key from secrets
- **Fallback B:** local Apollo Sandbox connected to the production GraphQL endpoint with the API key

Smoke-test steps:

1. `gh auth status` — confirm logged in
2. Run `domainValueCoverage` against the largest production domain via one of the above paths
3. Confirm:
   - `pairedConditionCount` and `orphanedConditionCount` are non-null integers on every cell
   - For known asymmetric cell `achievement::power_dominance` (was 14/16 batches in PR #759 smoke test): `orphanedConditionCount > 0`, the two-largest direction counts in `directionalCoverage` show ~14 vs ~16 complete batches with substantial filledSlots in each
   - For known balanced cell `achievement::conformity_interpersonal`: `orphanedConditionCount` is small or zero
   - Resolver query latency is within 200ms of pre-feature baseline (Risk #1 verification)
4. Test a launch: open the local dev UI, navigate to value coverage, click an asymmetric cell, click Match Pair Counts. Confirm the Start Paired Batch page renders the summary card. Submit. Confirm the new run appears in the runs list with launchMode `PAIRED_BATCH_TOPUP`.

If any check fails, do NOT merge. Investigate before retrying.

---

## Parallelization annotations

`[P]` markers — slice 1, 2, 3 each touch disjoint primary file sets. They CAN be implemented in parallel with these caveats:

- Slice 3 reads `cell.orphanedConditionCount` (slice 1) and dispatches `launchMode: 'PAIRED_BATCH_TOPUP'` (slice 2) — slice 3 mocks both during local development, but final integration requires slices 1+2 to be merged first
- Slice 1 and slice 2 share NO files; safe to develop in parallel
- All three share the `cloud/packages/shared` import path through the launch-trial-count helper (slice 3 owns it; slice 1 doesn't touch it)

Recommended sequencing for one PR with three slices: 1 → 2 → 3 (sequential, easier to review). For three separate PRs: 1 in parallel with 2 if the operator is comfortable with the cross-slice mocking effort.

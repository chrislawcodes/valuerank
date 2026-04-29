# Tasks: Pressure Sensitivity Table Redesign v2

**Slug:** `sensitivity-table-redesign-v2`  
**Branch:** `claude/sensitivity-table-redesign-v2`  
**Plan:** `docs/workflow/feature-runs/sensitivity-table-redesign-v2/plan.md`

## Slice A — Backend Math, Resolver, Types, SDL

Estimated diff: ~250-350 lines.

Files:

- `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts`
- `cloud/apps/api/tests/services/pressure-sensitivity/aggregation.test.ts`
- `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts`
- `cloud/apps/api/src/graphql/types/pressure-sensitivity.ts`
- `cloud/apps/api/tests/graphql/queries/pressure-sensitivity.test.ts`
- `cloud/apps/web/schema.graphql`

Steps:

1. Replace v1 delta helpers with v2 pressure-response helpers:
   - `pooledDirectionalReduction(grid, minN)`
   - `summarizePressureResponse(values)`
   - pooled binomial proportions, not mean of cell rates
   - Newcombe diff CI on the two directional pools only
2. Add canonical first/second pair mapping:
   - transform reverse-ordered vignettes into canonical first/second coordinates
   - expose `firstValueToken`, `firstValueLabel`, `secondValueToken`, `secondValueLabel`
   - remove `ownToken` and `opponentToken` from the v2 pair shape
3. Update Pothos types:
   - add `PressureResponse` with `value`, `ciLow`, `ciHigh`, `baselineRate`, `pushTowardFirstRate`, `pushTowardSecondRate`, `qualifyingTrials`, `reason`
   - add `PressureResponseSummary` with nullable `mean`, `rangeMin`, `rangeMax`, and non-null `pairsMeasured`
   - remove per-pair `winRateDelta`
   - remove top-level per-pair `qualifyingTrials`
   - remove per-model `winRateDeltaSummary` and `pairsPositive`
   - remove pressure-sensitivity `excludedScenariosCount` and per-pair `definitionsExcluded`
   - rename `directionalSanityCheck.breakdown[].winRateDelta` to `pressureResponse`
4. Update resolver behavior:
   - compute 6-cell directional pool, 6-cell mirror pool, and 5-cell diagonal baseline by label membership
   - set reason precedence: both directional pools thin, directional thin, mirror thin, baseline thin, else null
   - keep baseline optional while allowing defined response
   - keep no-measured-pairs models in `insufficient[]` with null summary fields and `pairsMeasured = 0`
   - add `pressureConditionExcludedCount` and `pressureConditionExclusionBreakdown`
   - preserve `transcriptCapHit`
   - preserve source-run collision warning and deterministic run precedence: database `id asc`, then last-write-wins
5. Add/refresh backend tests:
   - unequal cell sizes where pooled rate differs from mean-of-cell-rates
   - reverse-ordered vignette canonicalization
   - standard, thin, both-thin, baseline-thin, and response-defined/baseline-missing cases
   - empty, single-pair, and multi-pair summaries
   - boundary 0% and 100% proportions
   - every pressure-condition exclusion bucket
   - overlapping scored exclusion fixture increments exactly one documented-precedence bucket and total +1
   - unscored/refusal case does not increment pressure-condition exclusions
   - source-run collision fixture is stable under shuffled eligible-run input
   - GraphQL query executes the updated selection against resolver shape
6. Regenerate SDL.

Verification:

```bash
cd cloud
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test?pgbouncer=true" JWT_SECRET="test-secret-that-is-at-least-32-characters-long" npm run test --workspace @valuerank/api -- pressure-sensitivity
npx turbo build --filter=@valuerank/api
grep -RE "winRateDelta|winRateDeltaSummary|pairsPositive|excludedScenariosCount|definitionsExcluded|ownToken|opponentToken|WinRateDelta|WinRateDeltaSummary" apps/api packages workers apps/web/schema.graphql --include='*.ts' --include='*.graphql'
```

Expected: tests/build pass and grep returns zero matches.

- Slice A checkpoint: backend math, resolver, types, tests, and SDL complete [CHECKPOINT]

## Slice B — Web Operation, Codegen, Derived Types

Estimated diff: ~100-180 lines, mostly generated output.

Files:

- `cloud/apps/web/src/api/operations/pressureSensitivity.graphql`
- `cloud/apps/web/src/api/operations/pressureSensitivity.ts`
- `cloud/apps/web/src/generated/graphql.ts`

Steps:

1. Update the pressure-sensitivity GraphQL operation:
   - query `pressureResponse`
   - query `pressureResponseSummary`
   - query first/second token+label fields
   - query `pressureConditionExcludedCount` and `pressureConditionExclusionBreakdown`
   - query renamed sanity-check `pressureResponse`
2. Remove old operation fields:
   - `winRateDelta`
   - `winRateDeltaSummary`
   - `pairsPositive`
   - top-level per-pair `qualifyingTrials`
   - `ownToken`
   - `opponentToken`
   - `excludedScenariosCount`
   - per-pair `definitionsExcluded`
3. Regenerate web GraphQL types.
4. Add a targeted operation/generated-type assertion or snapshot that proves top-level per-pair `qualifyingTrials` is gone while `pressureResponse.qualifyingTrials` remains.

Verification:

```bash
cd cloud
npm run codegen --workspace @valuerank/web
npx turbo build --filter=@valuerank/api
grep -RE "winRateDelta|winRateDeltaSummary|pairsPositive|excludedScenariosCount|definitionsExcluded|ownToken|opponentToken|WinRateDelta|WinRateDeltaSummary" apps/web/src/api/operations apps/web/src/generated --include='*.ts' --include='*.graphql'
```

Expected: codegen/build pass and grep returns zero matches.

- Slice B checkpoint: web operation and generated types complete [CHECKPOINT]

## Slice C — Web Components, Copy, Tests

Estimated diff: ~250-350 lines.

Files:

- `cloud/apps/web/src/components/models/PressureSensitivitySummary.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivitySummary.test.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityDetail.test.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityCrossValueMap.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityCrossValueMap.test.tsx`
- `cloud/apps/web/src/components/models/PressureGrid.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivitySanityCheck.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivitySanityCheck.test.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityLimitations.tsx`
- `cloud/apps/web/src/components/models/pressureSensitivityFormatting.ts`
- `cloud/apps/web/src/pages/PressureSensitivity.tsx`

Steps:

1. Update shared formatting:
   - percentage-point values use one decimal place
   - positive/negative values use explicit signs where the UI calls for signed copy
   - exact zero renders `0.0 pp` without a sign
2. Rebuild cross-model summary:
   - columns: Model and Pressure response
   - row sort fixed by `pressureResponseSummary.mean` descending, then model label ascending
   - remove header sort toggle/click handler
   - cell text exactly `{mean} pp · range across this model's pairs: [{rangeMin}, {rangeMax}]`
   - negative values render red plus `▼`
   - exact zero uses neutral styling
   - no baseline appears in cross-model summary
3. Rebuild per-pair detail:
   - columns: Value pair, Baseline, Push toward first, Push toward other, Pressure response, Trials
   - labels use `firstValueLabel` / `secondValueLabel`
   - response cell shows signed pp plus 95% CI
   - null response renders `—` with reason-copy hover text
   - `baselineRate = null` renders `—` without hiding defined response
   - Trials uses `pressureResponse.qualifyingTrials`
   - when `qualifyingTrials !== n`, row hover/detail copy shows `{qualifyingTrials} of {n} scored trials used`
   - Trials tooltip names Baseline, Push toward first, Push toward other, and explains CI denominator
4. Preserve and update drilldown:
   - row click still opens `PressureGrid`
   - `PressureGrid` uses canonical first/second labels and no stale own/opponent display contract
5. Update cross-value map:
   - read signed `pair.pressureResponse.value`
   - remove `Math.abs`
   - use diverging sign-aware color scale
   - title and accessible label say Pressure response and include signed value
   - assert positive, zero, and negative title/accessible-label text
6. Update sanity check:
   - read renamed `pressureResponse`
   - labels say Pressure response
   - no `winRateDelta` references remain
7. Update copy:
   - intro/limitations describe Pressure response, range-across-pairs, low refusal rate, and cell-selection sensitivity
   - remove legacy visible labels such as `Win rate Delta`, `Win rate Δ ± CI`, `Low pressure`, `High pressure`, `responsive`, and `moved up`
8. Update coverage warnings:
   - render transcript-cap warning before report tables when `transcriptCapHit`
   - render pressure-condition exclusion copy when nonzero
   - append lower-bound sentence when both transcript cap and pressure-condition exclusions are present
9. Preserve insufficient footer:
   - models with no defined `pressureResponse` values render in `insufficient[]`
   - they do not appear in ranked table
   - summary fields are null and `pairsMeasured = 0`
10. Add/refresh web tests:
   - cross-model range annotation
   - fixed descending row order and no reversible header sort
   - negative, positive, and exact-zero rendering
   - mixed-count Trials audit copy
   - null reasons using `reason-copy.md`
   - baseline missing while response remains defined
   - pressure-condition exclusion warning and transcript-cap lower-bound sentence
   - no-measured-pairs footer path
   - signed cross-value map title and accessible labels
   - sanity-check label and field rename

Verification:

```bash
cd cloud
npm run test --workspace @valuerank/web -- PressureSensitivity
npx turbo build --filter=@valuerank/web
grep -RE "winRateDelta|winRateDeltaSummary|pairsPositive|excludedScenariosCount|definitionsExcluded|ownToken|opponentToken|WinRateDelta|WinRateDeltaSummary" . --include='*.ts' --include='*.tsx' --include='*.graphql'
```

Expected: tests/build pass and grep returns zero matches across `cloud/`, including generated code.

- Slice C checkpoint: web UI, copy, tests, and final grep complete [CHECKPOINT]

## Final Preflight Before Push

Run from `cloud/`:

```bash
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test?pgbouncer=true" JWT_SECRET="test-secret-that-is-at-least-32-characters-long" npm run test --workspace @valuerank/api -- pressure-sensitivity
npm run test --workspace @valuerank/web -- PressureSensitivity
npm run codegen --workspace @valuerank/web
npx turbo build --filter=@valuerank/api
npx turbo build --filter=@valuerank/web
grep -RE "winRateDelta|winRateDeltaSummary|pairsPositive|excludedScenariosCount|definitionsExcluded|ownToken|opponentToken|WinRateDelta|WinRateDeltaSummary" . --include='*.ts' --include='*.tsx' --include='*.graphql'
```

Expected: all commands pass and grep returns zero matches.

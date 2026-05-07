# Tasks: Model Grouping Pairwise Significance

Plan: `docs/workflow/feature-runs/model-grouping-pairwise-significance/plan.md`  
Spec: `docs/workflow/feature-runs/model-grouping-pairwise-significance/spec.md`

**IMPORTANT:** The first implementation used the wrong methodology (permutation test + Cohen's d).
All tasks below target the correct methodology: exact McNemar test + matched-pairs odds ratio.
The existing code in `math.ts`, the resolver, and web components must be reworked accordingly.

Constraints: keep each slice small and focused. `[CHECKPOINT]` marks a diff-review boundary.

---

## Slice A — API: math helpers, resolver, types, schema [CHECKPOINT]

Estimated diff: ~350 lines changed (rework existing files, not net-new).

### A1. Rewrite math helpers

- [ ] Rewrite `cloud/apps/api/src/services/model-grouping-significance/math.ts`.
- [ ] Remove: `pairedPermutationPValue`, `pairedCohensD`, `pairedMeanConfidenceInterval`,
      `studentTQuantile`, `mean`, `sampleStandardDeviation`, `STUDENT_T_975`.
- [ ] Add `exactMcNemar(b: number, c: number): number`:
  - Returns 1.0 when b + c === 0.
  - Uses exact binomial CDF: `p = 2 * P(X <= min(b,c))` where `X ~ Binom(b+c, 0.5)`.
  - Compute the CDF in log-space using log-sum of log-binomial-coefficients to avoid overflow.
  - Return `Math.min(1, result)`.
- [ ] Add `matchedPairsOddsRatio(b: number, c: number): number | null`:
  - Returns `null` when b === 0 and c > 0 (undefined, prefer model B).
  - Returns `null` when b > 0 and c === 0 (undefined, prefer model A).
  - Returns 1.0 when b === 0 and c === 0 (no discordance).
  - Returns c / b otherwise.
- [ ] Add `oddsRatioCI(b: number, c: number, alpha: number): { low: number | null; high: number | null }`:
  - Returns `{ low: null, high: null }` when b === 0 or c === 0.
  - Woolf logit: `SE = sqrt(1/b + 1/c)`, z = `norminv(1 - alpha/2)` (use 1.96 for alpha=0.05).
  - `low = exp(log(c/b) - z * SE)`, `high = exp(log(c/b) + z * SE)`.
- [ ] Update `classifyEffectSize(oddsRatio: number | null): 'Weak' | 'Strong'`:
  - Returns `'Weak'` when OR is null or in [0.5, 2.0].
  - Returns `'Strong'` when OR is outside [0.5, 2.0].
- [ ] Update `classifyVerdict` to accept `oddsRatio` instead of `effectSize`:
  - Signature: `{ correctedPValue: number | null; oddsRatio: number | null; alpha?: number }`.
  - Logic unchanged: `'Significant'` if p < alpha and effectLabel='Strong', `'Weak'` if p < alpha
    and effectLabel='Weak', `'Not significant'` if p >= alpha.
- [ ] Keep `holmBonferroni` unchanged.
- [ ] No `any` types. All helpers are pure (no I/O, no logger).

### A2. Update GraphQL types

- [ ] Update `cloud/apps/api/src/graphql/types/model-grouping-significance.ts`.
- [ ] In `ModelGroupingSignificanceRowShape`:
  - Add: `agreementRate: number` (concordant / n, always 0–1).
  - Add: `discordantAtoB: number` (integer count b).
  - Add: `discordantBtoA: number` (integer count c).
  - Add: `oddsRatio: number | null`.
  - Remove: `meanDifference: number | null`.
  - Remove: `effectSize: number | null`.
  - Keep: `rawPValue`, `holmCorrectedPValue`, `effectLabel`, `confidenceIntervalLow/High`,
    `verdict`, `n`, `modelAId/Label`, `modelBId/Label`.
- [ ] In the Pothos objectType for `ModelGroupingSignificanceRow`:
  - Expose `agreementRate` as `Float!` (non-nullable).
  - Expose `discordantAtoB` as `Int!` (non-nullable).
  - Expose `discordantBtoA` as `Int!` (non-nullable).
  - Expose `oddsRatio` as `Float` (nullable).
  - Remove the `meanDifference` and `effectSize` expose calls.
  - Note: `confidenceIntervalLow/High` stay as `Float` (nullable) — now used for OR CI.

### A3. Rewrite the resolver

- [ ] Rewrite `cloud/apps/api/src/graphql/queries/model-grouping-significance.ts`.
- [ ] Keep the query field registration, args (`modelIds`, `domainId`, `scope`, `signature`),
      and the early-exit for `< 2` selected models.
- [ ] Replace the snapshot-based data access with transcript-based data access:
  1. Call `resolveSignatureRuns(latestDefinitionIds, signature, defaultModelIds)` from
     `../../graphql/queries/domain/shared.js`. To get `latestDefinitionIds`, call
     `resolveDomainAnalysisScopeDefinitions` from
     `../../services/analysis/domain-analysis-scope-loader.js`.
  2. If `filteredSourceRunIds` is empty, throw `ValidationError` with the same loud message.
  3. Batch-query transcripts (batch size 500) with:
     `{ runId: { in: filteredSourceRunIds }, deletedAt: null }`.
     Select: `id, runId, modelId, decisionMetadata, definitionSnapshot, deletedAt,
     scenario { id, orientationFlipped, deletedAt }`.
  4. For each transcript, extract (definitionId, modelId, outcome):
     - `definitionId` from `filteredSourceRunDefinitionById.get(transcript.runId)`.
     - Skip if deletedAt, scenario null/deleted, or definitionId not found.
     - `valuePair` from `getSnapshotValuePair(transcript.definitionSnapshot)` (import from
       `../../services/analysis/transcript-cell-accumulator.js`).
     - `resolved` from `resolveTranscriptDecisionModel(...)` (import from
       `../../graphql/queries/domain/decision-model.js`).
     - Skip if direction is 'unknown' or 'unscored'.
     - outcome = `assignOwnOpponent(firstValueToken, secondValueToken, direction)`.
     - Skip if outcome is 'unscored'.
  5. Accumulate into `Map<"${definitionId}::${modelId}", {wins: number, losses: number}>`:
     - outcome === 'own_picked' → wins++
     - outcome === 'opponent_picked' → losses++
     - outcome === 'neutral' → skip (neutral does not count as a binary choice)
- [ ] After accumulation, build a `Map<modelId, Set<definitionId>>` of covered definitions.
- [ ] Compute the intersection of definitions covered by ALL selected models.
- [ ] If any selected model is missing definitions from the intersection: throw ValidationError
      with a message that names the missing model.
- [ ] Also fail if a model has no transcripts in the scope at all.
- [ ] For each definition in the intersection, derive binary choice per model:
      `wins > losses → 1 (chose own), else → 0 (chose opponent or tie)`.
- [ ] For each model pair (A, B) in alphabetical-by-label order:
  - Count concordant (n11 + n00), discordantAtoB (b), discordantBtoA (c).
  - `n = concordant + discordantAtoB + discordantBtoA`.
  - `agreementRate = concordant / n` (0 if n=0).
  - `rawPValue = exactMcNemar(b, c)`.
  - `oddsRatio = matchedPairsOddsRatio(b, c)`.
  - `{ low, high } = oddsRatioCI(b, c, 0.05)`.
  - `effectLabel = classifyEffectSize(oddsRatio)`.
- [ ] Apply `holmBonferroni` across all raw p-values.
- [ ] Set `verdict = classifyVerdict({ correctedPValue, oddsRatio })` for each pair.
- [ ] Return sorted rows (alphabetical by modelALabel, then modelBLabel).
- [ ] Keep file under 300 lines; move any large helper blocks to `math.ts` if needed.

### A4. Update schema.graphql

- [ ] In `cloud/apps/web/schema.graphql`, find `type ModelGroupingSignificanceRow` and:
  - Add: `agreementRate: Float!`
  - Add: `discordantAtoB: Int!`
  - Add: `discordantBtoA: Int!`
  - Add: `oddsRatio: Float`
  - Remove: `meanDifference: Float`
  - Remove: `effectSize: Float`
  - Note: `confidenceIntervalLow/High` stay (now used for OR CI).

### A5. Update math tests

- [ ] Rewrite `cloud/apps/api/tests/services/model-grouping-significance/math.test.ts`:
  - `exactMcNemar(0, 0)` → 1.0
  - `exactMcNemar(0, 5)` → approximately 0.0625 (exact binomial 2 * (0.5)^5)
  - `exactMcNemar(5, 5)` → 1.0 (symmetric)
  - `exactMcNemar(1, 10)` → below 0.05 (clearly asymmetric)
  - `matchedPairsOddsRatio(0, 0)` → 1.0
  - `matchedPairsOddsRatio(0, 5)` → null
  - `matchedPairsOddsRatio(5, 0)` → null
  - `matchedPairsOddsRatio(4, 1)` → 0.25
  - `oddsRatioCI(4, 1, 0.05)` → valid finite interval
  - `oddsRatioCI(0, 5, 0.05)` → `{ low: null, high: null }`
  - `classifyEffectSize(1.5)` → `'Weak'`
  - `classifyEffectSize(3.0)` → `'Strong'`
  - `classifyEffectSize(0.3)` → `'Strong'`
  - `holmBonferroni` existing tests must still pass
  - `classifyVerdict` updated tests using oddsRatio

### A6. Add API integration test

- [ ] Create `cloud/apps/api/tests/graphql/queries/model-grouping-significance.test.ts`.
- [ ] Add a happy-path test: 2 models, shared definitions, correct McNemar p-value returned.
- [ ] Add missing-coverage test: resolver throws when a model has no transcripts.
- [ ] Add zero-discordance test: b=c=0, agreementRate=1, p=1.
- [ ] Add a 3+ models test: Holm-Bonferroni corrects all pairs.

### A7. Verify Slice A

- [ ] `npm run lint --workspace @valuerank/api`
- [ ] `npm run test --workspace @valuerank/api` (math tests + integration tests must pass)
- [ ] `npm run build --workspace @valuerank/api`
- [ ] Confirm `ModelGroupingSignificanceRow` in schema output has the new fields.

**Slice A checkpoint.**

---

## Slice B — Web: query layer, codegen, page wiring [CHECKPOINT]

Estimated diff: ~80 lines changed.

### B1. Update the GraphQL operation

- [ ] Edit `cloud/apps/web/src/api/operations/modelGroupingSignificance.graphql`:
  - Remove `meanDifference`, `effectSize` from the row selection.
  - Add `agreementRate`, `discordantAtoB`, `discordantBtoA`, `oddsRatio`.
  - Keep all other fields (`rawPValue`, `holmCorrectedPValue`, `effectLabel`,
    `confidenceIntervalLow`, `confidenceIntervalHigh`, `verdict`, `n`,
    `modelAId`, `modelALabel`, `modelBId`, `modelBLabel`).

### B2. Run codegen

- [ ] Run `npm run codegen --workspace @valuerank/web` from `cloud/`.
- [ ] Confirm no TypeScript errors in `cloud/apps/web/src/api/operations/modelGroupingSignificance.ts`.
- [ ] Confirm `ModelGroupingSignificanceRow` in generated types has the new fields.

### B3. Verify page wiring

- [ ] Open `cloud/apps/web/src/pages/ModelsGroups.tsx`.
- [ ] Confirm the `MODEL_GROUPING_SIGNIFICANCE_QUERY` is already wired with correct scope variables
      (`modelIds`, `domainId`, `scope`, `signature`).
- [ ] Confirm `ModelGroupingSignificanceSection` still receives `report`, `selectedModelCount`,
      `scopeLabel`, `loading`, `errorMessage` as before.
- [ ] Make any small fixes needed; do not change the page logic beyond what's required.

### B4. Verify Slice B

- [ ] `npm run lint --workspace @valuerank/web`
- [ ] `npm run build --workspace @valuerank/web` (confirms codegen types compile)

**Slice B checkpoint.**

---

## Slice C — Web: heatmap, table, component tests [CHECKPOINT]

Estimated diff: ~200 lines changed (rework existing components and update tests).

### C1. Update the heatmap

- [ ] Edit `cloud/apps/web/src/components/models/ModelGroupingSignificanceHeatmap.tsx`.
- [ ] Remove the `effectSize`-based `getTone` function.
- [ ] Add an `agreementRate`-based color function:
  - High agreement (near 1.0) → muted green or neutral tone.
  - Low agreement (near 0.0) → rose or amber tone.
  - Use the existing `cn` pattern for Tailwind class selection.
- [ ] Update cell hover tooltip to show `agreementRate`, `discordantAtoB`, `discordantBtoA`,
      and `verdict` instead of `effectSize` and `meanDifference`.
- [ ] Keep the significance ring/badge (Significant → ring-2, Weak → ring-1 amber).
- [ ] Keep the diagonal placeholder unchanged.
- [ ] Remove all references to `effectSize` and `meanDifference` from the component.

### C2. Update the sortable table

- [ ] Edit `cloud/apps/web/src/components/models/ModelGroupingSignificanceTable.tsx`.
- [ ] Add these columns (in order after Model B):
  - `agreement rate` — sortable, displays as percentage (e.g. "72%")
  - `discordant A→B` — sortable integer
  - `discordant B→A` — sortable integer
- [ ] Rename the `effect size` column header to `odds ratio`.
- [ ] Update the sort key type: replace `effectSize` with `oddsRatio`.
- [ ] Update `sortRows` to sort by `oddsRatio` instead of `effectSize`.
- [ ] Update the `getValue` function for `confidenceInterval` sort key to use `oddsRatio`
      as the midpoint proxy when both CI bounds are null.
- [ ] Update `formatEffectSize` → `formatOddsRatio`: show as `×2.50` format (multiplicative).
- [ ] Add `formatAgreementRate(value: number): string` → e.g. `"72%"`.
- [ ] Add `formatDiscordant(value: number): string` → plain integer string.
- [ ] Keep the `effectLabel` and `verdict` columns unchanged.
- [ ] Remove all references to `meanDifference` and `effectSize`.
- [ ] The CI column still shows `[low, high]` but now represents the OR CI, not mean difference.
      Update the format string to use `×` prefix (e.g. `[×0.40, ×1.80]`).

### C3. Update component tests

- [ ] Rewrite `cloud/apps/web/src/components/models/ModelGroupingSignificanceHeatmap.test.tsx`:
  - Update `createRow` to use `agreementRate`, `discordantAtoB`, `discordantBtoA`, `oddsRatio`
    instead of `meanDifference`, `effectSize`.
  - Remove any `meanDifference` or `effectSize` assertions.
  - Add assertion that hover text includes `agreementRate`.
  - Keep the diagonal placeholder test.
  - Keep the significance badge (`S`, `W`) tests.

- [ ] Rewrite `cloud/apps/web/src/components/models/ModelGroupingSignificanceTable.test.tsx`:
  - Update `createRow` to use `agreementRate`, `discordantAtoB`, `discordantBtoA`, `oddsRatio`
    instead of `meanDifference`, `effectSize`.
  - Add test for agreement rate column rendering.
  - Add test for discordant A→B and B→A column rendering.
  - Keep the sort-by-p-value test (update expected field references).
  - Keep the verdict badge test.
  - Keep the no-double-headed-arrow test.

### C4. Verify Slice C

- [ ] `npm run lint --workspace @valuerank/web`
- [ ] `npm run test --workspace @valuerank/web` (component tests must pass)
- [ ] `npm run build --workspace @valuerank/web`

**Slice C checkpoint.**

---

## Slice D — Copy, docs, and final regression [CHECKPOINT]

Estimated diff: ~40 lines.

### D1. Review section copy

- [ ] Open `cloud/apps/web/src/components/models/ModelGroupingSignificanceSection.tsx`.
- [ ] Confirm the scope summary copy says "binary side choices" and "McNemar's test"
      (not permutation test or win rates).
- [ ] Confirm the copy says "corrected for multiple comparisons" (Holm-Bonferroni).
- [ ] Confirm no copy implies one model is "better" than another.
- [ ] Make minimal copy edits if anything is inaccurate. Do not change layout or logic.

### D2. Final verification

- [ ] Re-run `npm run lint --workspace @valuerank/api`
- [ ] Re-run `npm run test --workspace @valuerank/api`
- [ ] Re-run `npm run build --workspace @valuerank/api`
- [ ] Re-run `npm run lint --workspace @valuerank/web`
- [ ] Re-run `npm run test --workspace @valuerank/web`
- [ ] Re-run `npm run build --workspace @valuerank/web`
- [ ] Confirm the report still sits at the bottom of `/models` and the rest of the page is unchanged.
- [ ] Confirm `ModelGroupingSignificanceRow` in schema.graphql has the new fields and not the old ones.

**Slice D checkpoint.**

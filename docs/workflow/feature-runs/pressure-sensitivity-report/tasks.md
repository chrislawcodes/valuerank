# Tasks: Pressure Sensitivity Report

Plan: `docs/workflow/feature-runs/pressure-sensitivity-report/plan.md`
Spec: `docs/workflow/feature-runs/pressure-sensitivity-report/spec.md`

Constraints: each slice ≤ ~300 changed lines. `[CHECKPOINT]` marks a diff-review boundary.

---

## Slice A — API: normalization adapter + aggregation + resolver + SDL [CHECKPOINT]

Estimated diff: ~330 lines. If Slice A grows past 300 lines, split into A-Helpers (A1–A3) and A-Resolver (A4–A6); do not duplicate logic.

### A1. Export `toComparableNumber` `cloud/apps/api/src/services/analysis/scenario-metadata.ts` [P: scenario-metadata.ts, scenarios-utils.ts, value-pair.ts]

- [ ] Change `toComparableNumber` from a private function to a named export. Add a TSDoc comment explaining its specific purpose: "Coerces dimension-value strings/numbers to a canonical number for label normalization. Use only for scenario-dimension lookup; not a general-purpose number parser."
- [ ] Run existing `scenario-metadata.test.ts` to confirm no behavior change for current callers.

### A2. Safe level-lookup adapter `cloud/apps/api/src/graphql/queries/scenarios-utils.ts` [P: scenario-metadata.ts, scenarios-utils.ts, value-pair.ts]

- [ ] Add named export `buildSafeLevelLookup(definitionDimension: DefinitionDimension): SafeLevelLookup`.
- [ ] `SafeLevelLookup` type: `{ lookup: (rawLabel: unknown) => number | null; exclusionReason: 'collision' | 'out-of-range' | 'empty-levels' | 'legacy-values-only' | null }`.
- [ ] Implementation steps inside the function (per plan Decision 2):
  1. Read raw `definitionDimension.levels[]` directly. If missing/empty AND `definitionDimension.values[]` is present → return `{ lookup: () => null, exclusionReason: 'legacy-values-only' }`.
  2. If missing/empty AND no `values[]` → return `{ exclusionReason: 'empty-levels' }`.
  3. Validate every `level.score` is an integer in 1..5 (use `Number.isInteger`); on first failure return `{ exclusionReason: 'out-of-range' }`.
  4. Detect collision per FR-002a:
     - **Label-vs-label**: any two levels share the same trimmed/lowercased label;
     - **Score-vs-score**: any two levels share the same score;
     - **Label-vs-score**: any one level's trimmed label, when coerced via `toComparableNumber`, equals another level's score.
     On detection return `{ exclusionReason: 'collision' }`.
  5. Build a `Map<string, number>` keyed on trimmed-lowercased labels AND stringified scores. Both forms map to the level's score.
  6. Return `{ lookup, exclusionReason: null }` where `lookup(input)` trims the input string, applies `toComparableNumber`, falls back to lowercased trim, queries the map, returns the score or `null`.
- [ ] Do **not** modify `getLevelNormalizationMap` or `getDimensionLevelsFromDefinition`.
- [ ] File stays under 300 lines (current size + ~80 line additions).

### A2b. Safe level-lookup tests `cloud/apps/api/src/graphql/queries/scenarios-utils.test.ts`

Per plan Testing Strategy:

- [ ] Canonical 5-level Definition → all five labels (`negligible / minimal / moderate / substantial / full`) resolve to scores 1–5.
- [ ] **Label-vs-label collision**: `[{score: 1, label: 'moderate'}, {score: 3, label: 'moderate'}]` → `exclusionReason: 'collision'`.
- [ ] **Score-vs-score collision**: `[{score: 1, label: 'low'}, {score: 1, label: 'minimal'}]` → `exclusionReason: 'collision'`.
- [ ] **Label-vs-score collision**: `[{score: 1, label: 'low'}, {score: 2, label: '1'}]` → `exclusionReason: 'collision'`.
- [ ] Out-of-range: score 6 → `'out-of-range'`; score 0 → `'out-of-range'`; score 1.5 → `'out-of-range'`.
- [ ] Trimmed input: lookup of `' moderate '` → 3.
- [ ] Numeric variant: lookup of `'1.0'` → 1.
- [ ] Legacy values[] only → `'legacy-values-only'`; empty levels[] no values[] → `'empty-levels'`.
- [ ] `lookup` returns null on totally unknown labels.

### A3. Value-pair canonicalization `cloud/apps/api/src/services/pressure-sensitivity/value-pair.ts` [P: scenario-metadata.ts, scenarios-utils.ts, value-pair.ts]

- [ ] Create file with named exports per plan Decision 13:
  - `canonicalValuePairKey(tokenA: unknown, tokenB: unknown): string | null` — returns `[a, b].sort().join('::')` for valid non-self string tokens; null otherwise.
  - `assignOwnOpponent(valueFirstToken: string, valueSecondToken: string, canonicalDirection: 'favor_first' | 'favor_second' | 'neutral' | 'refusal' | 'unknown'): 'own_picked' | 'opponent_picked' | 'neutral' | 'unscored'` — alphabetical own/opponent assignment within the canonical pair; swaps favor_first/favor_second when `valueFirstToken` doesn't equal canonical own.
  - `assignOwnOpponentLevels(definitionDimensions: { name: string; levels?: unknown[] }[], scenarioDimensionValues: Record<string, unknown>, lookup: (rawLabel: unknown) => number | null, ownToken: string): { ownLevel: number; opponentLevel: number } | null` — looks up own/opponent dimension by name (token), returns the (own, opponent) level pair or null on miss.
- [ ] All three pure functions, fully typed, no `any`.

### A3b. Value-pair tests `cloud/apps/api/src/services/pressure-sensitivity/value-pair.test.ts`

- [ ] `canonicalValuePairKey('power', 'achievement')` === `canonicalValuePairKey('achievement', 'power')` === `'achievement::power'`.
- [ ] Self-pair returns null; missing tokens return null; non-string tokens return null.
- [ ] `assignOwnOpponent` happy path: tokens `['power', 'achievement']`, canonical own = `achievement`, valueFirstToken=`power` → `favor_first` maps to `opponent_picked`, `favor_second` maps to `own_picked`.
- [ ] `assignOwnOpponent` non-flip path: valueFirstToken = canonical own → `favor_first` maps to `own_picked`.
- [ ] `assignOwnOpponent` `refusal` and `unknown` map to `unscored`; `neutral` maps to `neutral`.
- [ ] `assignOwnOpponentLevels` looks up dimension by token name; returns null if either dimension is missing or its label isn't in the lookup.

### A4. Aggregation pure functions `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts`

- [ ] Create file with named exports per plan Decision 1:
  - `buildCellMetrics(observations: Array<{ outcome: 'own_picked' | 'opponent_picked' | 'neutral' | 'unscored'; strength: 'strong' | 'lean' | null }>): { n: number; unscoredCount: number; winRate: number | null; conviction: number | null; netScore: number | null }` — applies the canonical formulas from spec FR-003: win rate = `prioritized / (prioritized + deprioritized + neutral)` (using own_picked as prioritized); conviction = `(2*strongly + somewhat) / (strongly + somewhat)` over own_picked rows only, undefined when no picks; netScore via the canonical 2:1 formula.
  - `applyBandReduction(grid: Cell[][], minN: number): { directionDelta: number | null; convictionDelta: number | null; netScoreDelta: number | null }` — high band own≥4, low band own≤2, both bands need at least one cell with N≥minN; if either band empty → all three deltas null.
  - `computeBaselineWinRate(grid: Cell[][], minN: number): { value: number | null; ceilingFloorFlag: 'ceiling' | 'floor' | null }` — lowest populated own-level meeting minN; ceiling at ≥0.9, floor at ≤0.1.
  - `aggregateSensitivity(perPair: Array<{ netScoreDelta: number | null }>): { value: number | null; valuePairsMeasured: number }` — `mean(|netScoreDelta|)` over pairs with defined delta.
- [ ] All pure; no logger imports; no `any`.
- [ ] File under 300 lines.

### A4b. Aggregation tests `cloud/apps/api/src/services/pressure-sensitivity/aggregation.test.ts`

- [ ] `buildCellMetrics` with 2 own_picked-strong + 1 neutral → win rate = 2/3, conviction = 2.0, netScore = 4/3, n = 3, unscoredCount = 0.
- [ ] `buildCellMetrics` with 1 unscored only → win rate = null (or 0/0 sentinel), conviction = null, n = 0, unscoredCount = 1.
- [ ] `buildCellMetrics` with 0 own_picked + 2 opponent_picked-strong → win rate = 0, conviction = null (no picks for own), netScore = -1 (per formula).
- [ ] `applyBandReduction` standard 5×5 grid → expected deltas hand-computed.
- [ ] `applyBandReduction` empty low band → all three deltas null.
- [ ] `applyBandReduction` empty high band → all three deltas null.
- [ ] `applyBandReduction` low band has N=2 only (below minN=3) → all three deltas null.
- [ ] `computeBaselineWinRate` level 1 has N≥3 with rate 0.95 → ceiling flag.
- [ ] `computeBaselineWinRate` level 1 empty, level 2 has N≥3 with rate 0.5 → returns level-2 mean, no flag.
- [ ] `aggregateSensitivity` over [0.3, null, 0.5, 0.1] → value = 0.3, valuePairsMeasured = 3.

### A5. Definition validation pass `cloud/apps/api/src/services/pressure-sensitivity/definition-validation.ts`

- [ ] Create file with named export `validateDefinitionForPressureSensitivity(definitionId: string): Promise<ValidationResult>` per plan Decision 11.
- [ ] `ValidationResult` type: `{ status: 'eligible'; resolvedContent: ResolvedDefinitionContent } | { status: 'excluded'; reason: 'a' | 'b' | 'c' | 'd' | 'e' | 'g' | 'h' }`.
- [ ] Implementation:
  1. Call `resolveDefinitionContent(definitionId)` from `@valuerank/db` to get fully inherited content.
  2. Check FR-018(a): `content.dimensions[]` missing AND `content.values[]` present → reason `'a'` (legacy single-dimension).
  3. Check FR-018(b): `content.dimensions[]` present but each has missing/empty `levels[]` → reason `'b'`.
  4. Check FR-018(c): any score in any dimension is non-integer or out of 1..5 → reason `'c'`.
  5. Check FR-018(d): unrecognized scenario labels — this is per-scenario, not per-Definition. Skipped here; resolver checks per-scenario.
  6. Check FR-018(e): collision detection per `buildSafeLevelLookup` result on each dimension; if any returns `'collision'` → reason `'e'`.
  7. Check FR-018(g): `content.components.value_first.token` or `value_second.token` missing/non-string/equal → reason `'g'`.
  8. Otherwise → `{ status: 'eligible', resolvedContent }`.
- [ ] **Reason `(h) mixed-content-disagreement`** is per-scenario (not per-Definition); the resolver applies it via `normalizeScenarioAnalysisMetadata`'s null return.
- [ ] File under 200 lines.

### A5b. Definition validation tests `cloud/apps/api/src/services/pressure-sensitivity/definition-validation.test.ts`

- [ ] One fixture per reason `(a)–(c), (e), (g)` returns the matching reason.
- [ ] Eligible canonical Definition returns `{ status: 'eligible', resolvedContent }`.
- [ ] Forked Definition that inherits levels from parent → `'eligible'` (verifies `resolveDefinitionContent` is being used, not raw `content`). Use a fixture where `definition.content.dimensions` is `undefined` but the parent provides them.

### A6. Pothos types `cloud/apps/api/src/graphql/types/pressure-sensitivity.ts`

- [ ] Define and register Pothos object types per plan Decision 5:
  - `InsufficientPressureSensitivityModel` — `{ modelId, label, providerName, reason }`
  - `ExcludedDefinition` — `{ definitionId, name, reason }`
  - `SensitivityCell` — `{ ownLevel, opponentLevel, n, unscoredCount, winRate, conviction, netScore, lowData }`
  - `BandStat` — `{ value: Float, lowBandMean: Float, highBandMean: Float }` (each delta wraps this)
  - `BaselineWinRate` — `{ value: Float, ceilingFloorFlag: String }`
  - `PressureSensitivityValuePair` — `{ pairKey, ownToken, opponentToken, directionDelta: BandStat, convictionDelta: BandStat, netScoreDelta: BandStat, baselineWinRate: BaselineWinRate, n, unscoredCount, grid: [SensitivityCell], definitionsMeasured, definitionsExcluded }`
  - `PressureSensitivityModel` — `{ modelId, label, provider, aggregateSensitivity: { value, valuePairsMeasured, valuePairsExcluded }, valuePairs: [PressureSensitivityValuePair], unscoredCount }`
  - `DirectionalSanityCheck` — `{ positivePct, flatPct, negativePct, unmeasurableCount }`
  - `PressureSensitivityResult` — `{ models: [PressureSensitivityModel], insufficient: [InsufficientPressureSensitivityModel], excludedDefinitions: [ExcludedDefinition], directionalSanityCheck: DirectionalSanityCheck }`
- [ ] Export Refs; add one import line to `cloud/apps/api/src/graphql/types/index.ts`.

### A7. Resolver `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts`

- [ ] Register `builder.queryField('pressureSensitivity', …)`:
  - Return: `PressureSensitivityResultRef`
  - Args: `domainId: ID (optional)`, `providerId: ID (optional)`, `signature: String (required)`
- [ ] Resolver flow per plan Decision 4 + Slice A pseudocode:
  1. Load active model roster (`db.llmModel.findMany({ where: { status: 'ACTIVE' }, include: { provider: true } })`); filter by `providerId` if set.
  2. Load candidate aggregate runs: `db.run.findMany({ where: { tags: { some: { tag: { name: 'Aggregate' } } }, status: 'COMPLETED', deletedAt: null, ...(domainId && { definition: { domainId } }) }, include: { definition: true } })`.
  3. Filter runs in memory: `runs.filter(r => runMatchesSignature(r.config, signature))`.
  4. Distinct definition IDs from eligible runs → call `validateDefinitionForPressureSensitivity` for each. Track `excludedDefinitions[]` with reasons.
  5. For each eligible Definition build the safe lookup per dimension via `buildSafeLevelLookup`. If any dimension returns `'collision'` (caught here even if validation pass missed it), exclude.
  6. Stream raw transcripts: `db.transcript.findMany({ where: { runId: { in: eligibleRunIds }, modelId: { in: rosterModelIds }, deletedAt: null }, include: { scenario: { select: { orientationFlipped: true, content: true } }, definitionSnapshot: true, decisionMetadata: true } })`.
  7. For each transcript:
     a. Call `resolveTranscriptDecisionModel({ decisionMetadata, definitionSnapshot, orientationFlipped })` from `domain/decision-model.ts` — returns canonical decision direction.
     b. Call `buildCanonicalValueOutcomes(canonicalDirection, valueA, valueB)` to map to value outcomes (only when direction is non-null).
     c. Map to `(model, pairKey, ownLevel, opponentLevel)` cell:
        - `pairKey = canonicalValuePairKey(definition.content.components.value_first.token, definition.content.components.value_second.token)`.
        - own/opponent tokens from sorted pair.
        - `outcome = assignOwnOpponent(valueFirstToken, valueSecondToken, canonicalDirection)` — handles direction remap.
        - Extract scenario dimension values via `normalizeScenarioAnalysisMetadata(scenario.content)`. If null → reason `'h'` mixed-content-disagreement (track per-scenario count under a new `excludedScenarios` accumulator).
        - `assignOwnOpponentLevels(definition.dimensions, normalizedScenarioDims, lookup, ownToken)` → `{ ownLevel, opponentLevel }` or null.
     d. Push observation `{ outcome, strength }` into the cell's bucket.
  8. For each cell call `buildCellMetrics`. Apply N≥3 threshold per FR-004 (Cell.lowData = true when N<3).
  9. For each `(model, pairKey)` collect populated cells → `applyBandReduction` and `computeBaselineWinRate`.
  10. Reason `(f) insufficient cell coverage` assigned to (model, pair) buckets where every Cell.lowData = true OR both bands are empty after the gate.
  11. `aggregateSensitivity` per model.
  12. Compute `directionalSanityCheck` across all (model, pair) combos with defined `directionDelta`.
  13. Models with no qualifying value pairs → push to `insufficient[]` with `reason: 'no-coverage'`.
- [ ] File under 400 lines.

### A7b. Resolver tests `cloud/apps/api/src/graphql/queries/pressure-sensitivity.test.ts`

Per plan Testing Strategy:

- [ ] Mock `db.llmModel.findMany`, `db.run.findMany`, `db.transcript.findMany` via `vi.mock`.
- [ ] Real imports for `runMatchesSignature`, `resolveTranscriptDecisionModel`, `buildValueOutcomes`, `buildCanonicalValueOutcomes`, `aggregation.*`, `validateDefinitionForPressureSensitivity`, `buildSafeLevelLookup`, `value-pair.*`, `normalizeScenarioAnalysisMetadata`, `resolveDefinitionContent`.
- [ ] Fixtures:
  - **Normal case:** 2 models × 3 definitions; expected per-model aggregate matches hand-computed value.
  - **No-pooling fixture:** 1 model × 1 scenario × 3 transcripts → cell `n === 3` (verifies plan Decision 4 no-pooling).
  - **Collision Definition** lands in `excludedDefinitions` with reason `'e'`; transcripts NOT in any `valuePairs`.
  - **Mirror coverage:** `Power -> Achievement` valid + `Achievement -> Power` excluded → bucket reports `definitionsMeasured: 1, definitionsExcluded: 1`; transcripts only from the included Definition.
  - **Forked Definition** that inherits `dimensions` from parent → eligible (verifies `resolveDefinitionContent`).
  - **Ceiling baseline** fixture: low-band mean win rate 0.95 → ceiling flag set.
  - **Empty band fixture**: all populated cells in own≥4 → directionDelta null, pair NOT in aggregate denominator.
  - **Refusal-heavy fixture**: 2 refusals + 1 own_picked-strong in cell → `n = 1`, `unscoredCount = 2`.
  - **Mixed-content-disagreement scenario**: tracks scenario in excluded counts under reason `'h'`.
  - **Mirrored direction remap:** Definition where `value_first = 'power'`, `value_second = 'achievement'` (so canonical own = `'achievement'`); transcript with `canonicalDirection = 'favor_first'` → bucketed as `opponent_picked` (verifies FR-019/Decision 13 remap).
  - **Directional sanity check:** half pairs with positive `directionDelta`, half negative → reported percentages match.
  - **Signature filter applied:** runs with non-matching signature are excluded.

### A8. Register query and SDL

- [ ] `cloud/apps/api/src/graphql/queries/index.ts` — add `import './pressure-sensitivity.js';`.
- [ ] `cloud/apps/web/schema.graphql` — append SDL mirroring Pothos types from A6.
- [ ] `npm run lint --workspace @valuerank/api` — no errors.
- [ ] `npm run test --workspace @valuerank/api` — Slice A tests pass.
- [ ] `npm run build --workspace @valuerank/api` — no TS errors.

**Slice A checkpoint.**

---

## Slice B — Web: types + routing + page skeleton + nav surfaces [CHECKPOINT]

Estimated diff: ~220 lines.

### B1. GraphQL operation `cloud/apps/web/src/api/operations/pressureSensitivity.graphql`

- [ ] Write the query matching the SDL from A8; include all nested fields needed for cross-model summary, per-model detail, per-pair grid, cross-value heat map, and sanity check.

### B2. Operation re-export `cloud/apps/web/src/api/operations/pressureSensitivity.ts`

- [ ] Re-export `PressureSensitivityQueryDocument`, `PressureSensitivityQueryResult`, `PressureSensitivityQueryVariables` from `../../generated/graphql`.

### B3. Codegen

- [ ] `npm run codegen --workspace @valuerank/web` — verify no errors.

### B4. Page skeleton `cloud/apps/web/src/pages/PressureSensitivity.tsx`

- [ ] Read `domainId` and `signature` from `useSearchParams()`. If absent, fetch `DomainAvailableSignaturesQuery`, pick `DEFAULT_SIGNATURE` and the first domain (matching Matrix's first-load behavior). Write the resolved defaults back to the URL via `setSearchParams({ domainId, signature }, { replace: true })` on first render.
- [ ] Fire `pressureSensitivity` query with required `signature`; optional `domainId`, `providerId`.
- [ ] Maintain `selectedModelId` state (default: first model in summary). When user clicks a row in the cross-model summary, update `selectedModelId`.
- [ ] Loading, error, and empty-state shells. Empty state distinguishes:
  - Pipeline-pending (no `models[]`, all `insufficient[]` reasons are `no-coverage`) → pipeline-dependency message.
  - Partial coverage → cross-model summary + per-model detail visible; insufficient footer renders the rest.
- [ ] Placeholder divs for cross-model summary / per-model detail / per-pair grid / cross-value heat map / sanity check / limitations / filters.

### B5. Routing `cloud/apps/web/src/App.tsx`

- [ ] Add `<Route path="/models/pressure-sensitivity" element={<PressureSensitivity />} />`.
- [ ] Do **not** modify any existing route.

### B6. Desktop nav `cloud/apps/web/src/components/layout/NavTabs.tsx` [P: NavTabs.tsx, MobileNav.tsx]

- [ ] Append `{ name: 'Pressure Sensitivity', path: '/models/pressure-sensitivity' }` to the `modelsMenuItems` array (currently lines 38–42).
- [ ] Do **not** modify existing entries (Matrix / Domain Shifts / Consistency / Circumplex).

### B7. Mobile nav `cloud/apps/web/src/components/layout/MobileNav.tsx` [P: NavTabs.tsx, MobileNav.tsx]

- [ ] Append `{ name: 'Pressure Sensitivity', path: '/models/pressure-sensitivity', icon: BarChart2 }` to the Models entry's `subItems` array (currently lines 26–29).
- [ ] Do **not** modify existing sub-items.

### B8. Smoke tests

- [ ] Open `/models` — Matrix renders unchanged.
- [ ] Open `/models/pressure-sensitivity` — page skeleton renders; loading state visible; query fires with correct variables.
- [ ] Desktop nav + mobile nav both show new entry.
- [ ] `npm run test --workspace @valuerank/web`, `npm run build --workspace @valuerank/web` — no errors.

**Slice B checkpoint.**

---

## Slice C — Web: cross-model summary + per-model detail + per-pair 2D grid [CHECKPOINT]

Estimated diff: ~290 lines.

### C1. Cross-model summary `cloud/apps/web/src/components/models/PressureSensitivitySummary.tsx` [P: PressureSensitivitySummary.tsx, PressureSensitivityDetail.tsx, PressureGrid.tsx]

- [ ] Sortable table per FR-009. Columns: Model, Provider, Aggregate Sensitivity, Spread (sparkline of per-pair |netScoreDelta|), Pairs Measured, Pairs Excluded.
- [ ] Default sort: Aggregate Sensitivity descending.
- [ ] Row click → `onSelectModel(modelId)` callback.
- [ ] Sparkline uses existing `Sparkline` component; values are sorted per-pair |netScoreDelta| in descending order.
- [ ] Inline cross-vignette-calibration limitation badge in header (per FR-014a).
- [ ] File under 200 lines.

### C2. Per-model detail `cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx` [P: PressureSensitivitySummary.tsx, PressureSensitivityDetail.tsx, PressureGrid.tsx]

- [ ] Input prop: `model: PressureSensitivityModel`.
- [ ] Per-pair table per FR-010. Columns: Value Pair, Direction Δ, Conviction Δ, netScore Δ, Baseline Win Rate, Ceiling/Floor Flag, N, Unscored, Definitions Measured/Excluded.
- [ ] Hover tooltip on each Δ cell shows low-band mean, high-band mean, and the subtraction.
- [ ] Conviction column header tooltip shows the FR-014b caveat (self-report not calibrated).
- [ ] Low-data Δ rendered as "—" with hover explanation.
- [ ] Row click → opens per-pair 2D grid drill-down (C3) for that pair.
- [ ] File under 220 lines.

### C3. Per-pair 2D grid `cloud/apps/web/src/components/models/PressureGrid.tsx` [P: PressureSensitivitySummary.tsx, PressureSensitivityDetail.tsx, PressureGrid.tsx]

- [ ] 5×5 grid (own × opponent, levels 1–5).
- [ ] Cell color from `netScore` by default per Decision 8; toggle button switches metric to `winRate` or `conviction`.
- [ ] Divergent palette (red/grey/blue) keyed to value range.
- [ ] Cells with `lowData=true` rendered in a distinct neutral grey with a "low data" hover label.
- [ ] Cell click opens drill-down panel showing N, unscoredCount, winRate, conviction, netScore for that cell.
- [ ] File under 180 lines.

### C4. Wire into `PressureSensitivity.tsx`

- [ ] Replace B4 placeholder divs with `PressureSensitivitySummary`, `PressureSensitivityDetail`, `PressureGrid`.
- [ ] Maintain `selectedModelId` and `selectedPairKey` state.

### C5. Component tests

- [ ] `PressureSensitivitySummary.test.tsx` — renders ranked table; sparkline visible; row click fires callback.
- [ ] `PressureSensitivityDetail.test.tsx` — renders per-pair rows; ceiling flag visible when set; low-data row renders "—".
- [ ] `PressureGrid.test.tsx` — 5×5 cells render; metric toggle changes cell colors; low-data cells visually distinct; cell click opens panel.
- [ ] `npm run test --workspace @valuerank/web` — all pass.

**Slice C checkpoint.**

---

## Slice D — Web: cross-value heat map + sanity check + limitations + filters [CHECKPOINT]

Estimated diff: ~310 lines. **If > 300, split into D-Map+SanityCheck and D-Limitations+Filters.**

### D1. Cross-value heat map `cloud/apps/web/src/components/models/PressureSensitivityCrossValueMap.tsx` [P: PressureSensitivityCrossValueMap.tsx, PressureSensitivitySanityCheck.tsx, PressureSensitivityLimitations.tsx, PressureSensitivityFilters.tsx]

- [ ] Model × value-pair grid per FR-012. Rows = models, columns = value pairs (sorted alphabetically by `pairKey`).
- [ ] Cell value = aggregate sensitivity for that (model, pair) — i.e., `|netScoreDelta|`.
- [ ] Cell color via same divergent scale as PressureGrid cells.
- [ ] Cells where pair has undefined Δ or insufficient coverage are greyed with a "low data" label.
- [ ] Inline cross-vignette-calibration limitation badge near the chart header (per FR-014a).
- [ ] File under 200 lines.

### D2. Directional sanity check `cloud/apps/web/src/components/models/PressureSensitivitySanityCheck.tsx` [P: PressureSensitivityCrossValueMap.tsx, PressureSensitivitySanityCheck.tsx, PressureSensitivityLimitations.tsx, PressureSensitivityFilters.tsx]

- [ ] Bottom-of-page panel per FR-013. Renders `positivePct`, `flatPct`, `negativePct` plus an "unmeasurable" count.
- [ ] Click to expand: list of (model, pair) entries grouped by direction.
- [ ] Below 70% positive triggers a "warning" visual treatment per SC-007 (yellow border + note).
- [ ] File under 120 lines.

### D3. Limitations panel `cloud/apps/web/src/components/models/PressureSensitivityLimitations.tsx` [P: PressureSensitivityCrossValueMap.tsx, PressureSensitivitySanityCheck.tsx, PressureSensitivityLimitations.tsx, PressureSensitivityFilters.tsx]

- [ ] Static copy per FR-014, all five caveats: cross-vignette calibration, conviction self-report, sycophancy, N<3 exclusion, banding-averages-opponent-pressure interaction loss, aggregate-sensitivity unweighted by coverage.
- [ ] Plain English; high-school reading level; Flesch-Kincaid grade ≤ 10 (per SC-006).
- [ ] File under 100 lines.

### D4. Filters `cloud/apps/web/src/components/models/PressureSensitivityFilters.tsx` [P: PressureSensitivityCrossValueMap.tsx, PressureSensitivitySanityCheck.tsx, PressureSensitivityLimitations.tsx, PressureSensitivityFilters.tsx]

- [ ] Two filters: Domain (select incl. "All"), Provider (select incl. "All"). Wired to `pressureSensitivity` query variables.
- [ ] `signature` is NOT a filter — it is URL-driven (per Slice B).
- [ ] File under 100 lines.

### D5. Wire into `PressureSensitivity.tsx`

- [ ] Mount `PressureSensitivityFilters` above the cross-model summary.
- [ ] Mount `PressureSensitivityCrossValueMap` after per-model detail but before sanity check.
- [ ] Mount `PressureSensitivitySanityCheck` near bottom of page.
- [ ] Mount `PressureSensitivityLimitations` after sanity check (last visible block).

### D6. Component tests

- [ ] `PressureSensitivityCrossValueMap.test.tsx` — model × pair grid; greyed low-data cells; calibration badge visible.
- [ ] `PressureSensitivitySanityCheck.test.tsx` — renders breakdown; below-70% warning visual when `positivePct < 70`.
- [ ] `PressureSensitivityLimitations.test.tsx` — renders all five FR-014 caveats.
- [ ] `PressureSensitivityFilters.test.tsx` — filter changes dispatch expected query variables.
- [ ] `npm run test --workspace @valuerank/web`, `npm run build --workspace @valuerank/web` — no errors.

**Slice D checkpoint.**

---

## Parallel Task Summary

- A1 / A2 / A3 — `[P]`, disjoint files in same slice (scenario-metadata.ts, scenarios-utils.ts, value-pair.ts).
- C1 / C2 / C3 — `[P]`, disjoint files, same fetched data.
- D1 / D2 / D3 / D4 — `[P]`, disjoint files.
- B6 / B7 (desktop + mobile nav) — `[P]`, disjoint files.

Run `parallel --slug pressure-sensitivity-report` before each slice's checkpoint to validate annotations.

---

## Verification Checklist (per slice)

- [ ] Preflight lint on touched workspace(s)
- [ ] Tests on touched workspace(s)
- [ ] Build on touched workspace(s)
- [ ] `git status` — no unintended files changed
- [ ] Existing `/models` Matrix still renders (regression)
- [ ] Existing `/models/consistency` Consistency still renders unchanged
- [ ] Existing `/domains/analysis/value-detail` (ConditionMatrix) still renders unchanged
- [ ] No modifications to `getLevelNormalizationMap`, `getDimensionLevelsFromDefinition`, `buildValueOutcomes`, `buildCanonicalValueOutcomes`, or `resolveTranscriptDecisionModel`
- [ ] No `6 - score` arithmetic on pressure-level inputs anywhere in new code (only on response scores via `buildValueOutcomes`)

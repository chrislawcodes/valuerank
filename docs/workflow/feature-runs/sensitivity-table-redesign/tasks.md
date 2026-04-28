# Tasks: Sensitivity Table Redesign

Plan: `docs/workflow/feature-runs/sensitivity-table-redesign/plan.md`
Spec: `docs/workflow/feature-runs/sensitivity-table-redesign/spec.md`

Constraints: each slice ≤ ~300 changed lines. `[CHECKPOINT]` marks a Gemini diff-review boundary.

---

## Slice A — Backend math + resolver + types + SDL [CHECKPOINT]

Estimated diff: ~280 lines.

### A1. CI math helpers in `aggregation.ts`

- [ ] Export `wilsonInterval(matches: number, trials: number, z?: number): { p: number; low: number; high: number }` — Wilson score interval on a single proportion. Default z = 1.96. Handle boundary cases: `trials = 0` → return `{ p: 0, low: 0, high: 0 }`; `matches = 0` returns lower bound at 0; `matches = trials` returns upper bound at 1.
- [ ] Export `diffProportionCI(pLow: number, nLow: number, pHigh: number, nHigh: number, z?: number): { ciLow: number; ciHigh: number } | null` — Newcombe Method-10 CI on `pHigh − pLow`. Returns null when either trial count is 0.
- [ ] Export `tBasedMeanCI(values: ReadonlyArray<number>, alpha?: number): { mean: number | null; ciLow: number | null; ciHigh: number | null; n: number }` — t-based CI on a sample mean. Default alpha = 0.05. Returns null for `mean`/CIs when `values.length < 2` (df=0). Use `studentT.quantile(1 - alpha/2, n-1)` lookup or implement a small inline approximation good for n in 2-50.

### A1b. Aggregation tests

- [ ] `wilsonInterval(20, 25)` → `p = 0.80`, low ≈ 0.61, high ≈ 0.92 within 4 decimals.
- [ ] `wilsonInterval(0, 10)` → low = 0, high finite.
- [ ] `wilsonInterval(10, 10)` → high = 1, low finite.
- [ ] `diffProportionCI(0.30, 100, 0.70, 100)` → CI roughly symmetric around +0.40, within Newcombe Method-10 reference values.
- [ ] `diffProportionCI(2/14, 14, 1/11, 11)` → matches Newcombe 1998 Table II reference values (≈ [−0.16, 0.21]).
- [ ] `diffProportionCI(0.5, 0, 0.5, 10)` → returns null.
- [ ] `tBasedMeanCI([0.3, 0.5, 0.4, 0.45])` → mean = 0.4125, CI half-width matches `t(0.025, df=3) × sd/√4` within 4 decimals.
- [ ] `tBasedMeanCI([0.3])` → mean = 0.3, ciLow = null, ciHigh = null.
- [ ] `tBasedMeanCI([])` → all null, n = 0.

### A2. Per-pair Δ extension in resolver

- [ ] In `pressure-sensitivity.ts`, after `applyBandReduction(grid, MIN_N)` returns the existing direction/conviction/netScore deltas, also compute `n_low_band` and `n_high_band` (sum of `cell.n` across qualifying cells in each band).
- [ ] Compute `directionCI = diffProportionCI(reduction.lowBandWinRate, n_low_band, reduction.highBandWinRate, n_high_band)`. Pass through `null` if either band has no qualifying cells.
- [ ] Extend the existing `BandStat` shape passed to the GraphQL response with `ciLow` and `ciHigh` fields. Conviction Δ and netScore Δ keep emitting null CIs for now (resolver still returns the structures).

### A3. Per-model summary in resolver

- [ ] After looping per-pair for a given model, collect `perPairDirectionDeltas: number[]` for pairs where `directionDelta.value !== null`. Also collect `perPairLowBandRates` and `perPairHighBandRates` from the same pairs.
- [ ] Compute `directionDeltaSummary = { mean, ciLow, ciHigh, lowBandMean, highBandMean, pairsMeasured }`:
  - `mean = tBasedMeanCI(perPairDirectionDeltas).mean`
  - `ciLow / ciHigh = tBasedMeanCI(perPairDirectionDeltas).{ciLow, ciHigh}`
  - `lowBandMean = mean(perPairLowBandRates)`
  - `highBandMean = mean(perPairHighBandRates)`
  - `pairsMeasured = perPairDirectionDeltas.length`
- [ ] Push `directionDeltaSummary` into the per-model output shape.

### A4. Pothos types

- [ ] Extend `BandStatShape` (`graphql/types/pressure-sensitivity.ts`) with `ciLow: Float | null` and `ciHigh: Float | null` fields. Update Pothos definition accordingly.
- [ ] Add new shape `DirectionDeltaSummaryShape` with fields: `mean: Float | null`, `ciLow: Float | null`, `ciHigh: Float | null`, `lowBandMean: Float | null`, `highBandMean: Float | null`, `pairsMeasured: Int!`. Define corresponding Pothos object type.
- [ ] Extend `PressureSensitivityModelShape` with `directionDeltaSummary: DirectionDeltaSummaryShape`. Update the Pothos field definition.
- [ ] Mark `aggregateSensitivity` field with a `@deprecated` directive in the field definition (use Pothos's `deprecationReason: "Use directionDeltaSummary instead. Will be removed in a future release."`).

### A5. SDL regen

- [ ] Run `LOG_LEVEL=silent DATABASE_URL=postgresql://x:x@localhost/x JWT_SECRET=placeholder-for-schema-emit-xxxxxxxxx npx tsx src/scripts/emit-schema.ts > ../../apps/web/schema.graphql` from `cloud/apps/api/`.
- [ ] Verify schema.graphql contains the new types and the deprecation marker.
- [ ] `npx turbo build --filter=@valuerank/api` — should be clean.

**Slice A checkpoint.**

---

## Slice B — Web operation + types [CHECKPOINT]

Estimated diff: ~80 lines.

### B1. GraphQL operation

- [ ] In `cloud/apps/web/src/api/operations/pressureSensitivity.graphql`, update the query:
  - On each `valuePairs` entry, request `directionDelta { value lowBandMean highBandMean ciLow ciHigh }` (the two new CI fields). Remove `convictionDelta` and `netScoreDelta` field selections from the operation document.
  - On each model, add `directionDeltaSummary { mean ciLow ciHigh lowBandMean highBandMean pairsMeasured }`.
  - Remove `aggregateSensitivity` from the model selection.
- [ ] Keep the rest of the operation (insufficient, excludedDefinitions, directionalSanityCheck, etc.) unchanged.

### B2. Codegen

- [ ] `npm run codegen --workspace @valuerank/web` — should regenerate `cloud/apps/web/src/generated/graphql.ts` cleanly.

### B3. Operation re-exports

- [ ] In `cloud/apps/web/src/api/operations/pressureSensitivity.ts`, update derived type re-exports:
  - Add `PressureSensitivityDirectionDeltaSummary = PressureSensitivityModel['directionDeltaSummary']`.
  - Add `PressureSensitivityBandStatWithCI` for the BandStat type (so it carries the new ciLow/ciHigh).
  - Remove conviction/netScore/aggregate type re-exports if they are no longer referenced anywhere on the web side.

**Slice B checkpoint.**

---

## Slice C — Web components: rebuilt tables + HeaderTooltip [CHECKPOINT]

Estimated diff: ~300 lines.

### C1. HeaderTooltip primitive `cloud/apps/web/src/components/ui/HeaderTooltip.tsx`

- [ ] First check if a suitable tooltip primitive exists (`grep -r "Tooltip" cloud/apps/web/src/components/ui/`). If yes, wrap it; if no, write a fresh one.
- [ ] Component signature: `<HeaderTooltip content={string | ReactNode} children={ReactNode} />`. Renders an inline ⓘ icon (Lucide `Info` or similar) next to the children, with a tooltip surfacing the content on `hover` or `focus`.
- [ ] Accessibility: tooltip MUST also fire on keyboard focus (`:focus-visible`). Use `aria-describedby` linking the tooltip to the icon. Width-bounded (max ~280px).
- [ ] File under 80 lines.

### C2. CeilingFloorBadge `cloud/apps/web/src/components/models/CeilingFloorBadge.tsx`

- [ ] Extract the existing `CeilingFloorBadge` from `PressureSensitivityDetail.tsx` into its own file.
- [ ] Same API as the existing inline component.
- [ ] File under 30 lines.

### C3. Rebuilt cross-model summary `PressureSensitivitySummary.tsx`

- [ ] Replace the entire component body with the new 4-column layout:
  - Group header `<th colSpan={3}>Win Rate</th>` (with HeaderTooltip on the group label) above the three Win Rate columns (Low pressure, High pressure, Win rate Δ).
  - Column headers: Model | Low pressure | High pressure | Win rate Δ ± CI. Each header gets a HeaderTooltip with the approved copy from plan.md.
  - Data binding:
    - Low pressure cell: `model.directionDeltaSummary.lowBandMean` → format as `(value * 100).toFixed(0) + '%'`. Inline ceiling/floor badge if value ≥ 0.9 or ≤ 0.1.
    - High pressure cell: `model.directionDeltaSummary.highBandMean` → format as percent.
    - Win rate Δ cell: `model.directionDeltaSummary.mean` formatted as `+X pp` or `−X pp`, with CI as `± Y pp` (`(ciHigh - ciLow) / 2` half-width). Negative values get `text-red-700` class.
    - When `pairsMeasured < 2` (CI undefined), show value with `(thin)` annotation in muted color instead of `± CI`.
    - When `pairsMeasured === 0` or `mean === null`, render the row in the insufficient footer (or with `—` in the Δ cell).
- [ ] Drop: Provider column, Aggregate sensitivity column, Pairs measured column, Spread sparkline, the existing per-pair spread visualization, the cross-vignette calibration warning badge (now lives in the limitations panel).
- [ ] Default sort: Win rate Δ descending. Click header to toggle. Rows with undefined Δ sort to bottom.
- [ ] File under 200 lines.

### C4. Rebuilt per-pair detail `PressureSensitivityDetail.tsx`

- [ ] Replace the entire component body with the new 5-column layout:
  - Group header `<th colSpan={3}>Win Rate</th>` over Low / High / Δ columns.
  - Columns: Value Pair | Low pressure | High pressure | Win rate Δ ± CI | Trials.
  - Data binding:
    - Low pressure cell: `pair.directionDelta.lowBandMean` as percent. Ceiling/floor badge inline.
    - High pressure cell: `pair.directionDelta.highBandMean` as percent.
    - Win rate Δ cell: `pair.directionDelta.value` formatted as `+X pp ± Y pp` (CI half-width from `ciLow`/`ciHigh`). Negative red. When value is null, render `—` with hover explainer reading "low band thin" / "high band thin" / "both bands thin" depending on which band is missing qualifying cells.
    - Trials cell: sum of cell `n` across the pair's grid (already in scope).
- [ ] Drop: Defs column, Baseline column, Conviction Δ column, netScore Δ column.
- [ ] Existing 2D pressure grid drilldown logic preserved (click a row → `<PressureGrid pair={selectedPair} />`).
- [ ] Default sort: |Win rate Δ| descending. Rows with undefined Δ sort to bottom.
- [ ] File under 220 lines.

### C5. Page wiring `cloud/apps/web/src/pages/PressureSensitivity.tsx`

- [ ] Verify props passed to `PressureSensitivitySummary` and `PressureSensitivityDetail` still match (likely no changes — both components consume the data they receive directly).
- [ ] Verify the existing limitations panel, sanity check, cross-value heat map, filters all still render unchanged.
- [ ] No nav changes, no route changes.

### C6. Lint + build

- [ ] `npx turbo build --filter=@valuerank/web` from `cloud/` — clean.
- [ ] `npm run lint --workspace @valuerank/web` — no new errors. (Existing baseline of 115 warnings is unchanged.)

### C7. Component tests

- [ ] `PressureSensitivitySummary.test.tsx` — renders 4 columns; sort toggles on header click; negative Δ renders in red; ceiling badge appears at ≥ 0.9 baseline.
- [ ] `PressureSensitivityDetail.test.tsx` — renders 5 columns; "—" appears for unmeasurable Δ; trials column matches data.
- [ ] `HeaderTooltip.test.tsx` — focus surfaces tooltip; aria attributes present.

**Slice C checkpoint.**

---

## Verification checklist (final, pre-PR)

- [ ] Preflight: lint + build for both `@valuerank/api` and `@valuerank/web` clean.
- [ ] Existing unit tests (38 from v1) still pass.
- [ ] New aggregation tests (10+) pass.
- [ ] Component tests pass.
- [ ] Manual: open `/models/pressure-sensitivity?domainId=cmmqi1urq0000e4y3ot8sfm06&signature=vnewtd` against staging — page renders without runtime errors. (If staging is the prod app, test post-deploy.)
- [ ] Smoke test: query `pressureSensitivity` via MCP `graphql_query` — verify `directionDeltaSummary` populated for at least one model.
- [ ] git status — no unintended files changed.
- [ ] Existing `/models/consistency` and Matrix routes still render.

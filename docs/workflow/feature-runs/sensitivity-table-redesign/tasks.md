# Tasks: Sensitivity Table Redesign

Plan: `docs/workflow/feature-runs/sensitivity-table-redesign/plan.md`
Spec: `docs/workflow/feature-runs/sensitivity-table-redesign/spec.md`

Constraints: each slice ≤ ~350 changed lines. `[CHECKPOINT]` marks a Codex+Gemini diff-review boundary.

**Naming reminder (per user direction):** all NEW GraphQL fields use `winRateDelta` / `winRateDeltaSummary`. The legacy `directionDelta` / `directionDeltaSummary` / `convictionDelta` / `netScoreDelta` / `aggregateSensitivity` names are removed entirely from the new surface — references to them only appear in this document where we are explicitly *deleting* them.

---

## Slice A — Backend math + resolver + types + SDL [CHECKPOINT]

Estimated diff: ~350 lines.

### A1. Extend cell shape with `successes`

- [ ] In `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts`, extend `CellMetrics` and `Cell` to include `successes: number` (= `ownPicked` count) alongside the existing `n`. Update `buildCellMetrics` to set `successes = ownPicked`.
- [ ] Add unit test asserting `buildCellMetrics` returns `successes` matching `ownPicked` count for a fixture with mixed outcomes.

### A2. CI math helpers in `aggregation.ts`

- [ ] Export `wilsonInterval(matches: number, trials: number, z?: number): { p: number; low: number; high: number } | null`. Default z = 1.96. Returns null when `trials <= 0` or `matches < 0` or `matches > trials` or any input is non-finite. Boundary cases: `matches = 0` → low = 0; `matches = trials` → high = 1.
- [ ] Export `diffProportionCI(pLow: number, nLow: number, pHigh: number, nHigh: number, z?: number): { ciLow: number; ciHigh: number } | null` — Newcombe Method-10 CI on `pHigh − pLow`. Implementation MUST match the pseudocode in plan Decision 1: for d = p1 − p2, lower half uses `(p1 − l1)² + (u2 − p2)²`, upper half uses `(u1 − p1)² + (p2 − l2)²` where p1 = pHigh, p2 = pLow. Returns null when either trial count is 0 or any input is non-finite.
- [ ] Export `tBasedMeanCI(values: ReadonlyArray<number>, alpha?: number): { mean: number | null; ciLow: number | null; ciHigh: number | null; n: number }`. Default alpha = 0.05. Filter out non-finite values before computing. Returns mean = single-value mean and null CIs when n < 2 (df = 0). Use a small inline `studentTQuantile(p, df)` approximation (Hill 1970 algorithm or table lookup good for df 1-50).
- [ ] Export `pooledBandReduction(grid: ReadonlyArray<Cell>, minN: number): WinRateDeltaResult` where `WinRateDeltaResult = { value: number | null; ciLow: number | null; ciHigh: number | null; lowBandMean: number | null; highBandMean: number | null; reason: 'low-band-thin' | 'high-band-thin' | 'both-bands-thin' | null; qualifyingTrials: number }`. Implementation:
  - Filter low-band qualifying cells: `c.ownLevel <= 2 && c.n >= minN`.
  - Filter high-band qualifying cells: `c.ownLevel >= 4 && c.n >= minN`.
  - If low.length === 0 && high.length === 0 → return all nulls with reason `'both-bands-thin'`, qualifyingTrials = 0.
  - If low.length === 0 → return all nulls with reason `'low-band-thin'`, qualifyingTrials = sum of high-band `n`.
  - If high.length === 0 → return all nulls with reason `'high-band-thin'`, qualifyingTrials = sum of low-band `n`.
  - Otherwise: `successesLow = sum(low.successes)`, `nLow = sum(low.n)`, `pLow = successesLow / nLow`. Same for high. `value = pHigh - pLow`. CI from `diffProportionCI(pLow, nLow, pHigh, nHigh)`. `lowBandMean = pLow`, `highBandMean = pHigh`. `reason = null`. `qualifyingTrials = nLow + nHigh`.

### A3. Aggregation tests (`aggregation.test.ts`)

- [ ] `wilsonInterval(20, 25)` → p = 0.80, low ≈ 0.61, high ≈ 0.92 within 4 decimals.
- [ ] `wilsonInterval(0, 10)` → low = 0, high finite.
- [ ] `wilsonInterval(10, 10)` → high = 1, low finite.
- [ ] `wilsonInterval(NaN, 10)` → null.
- [ ] `wilsonInterval(5, 0)` → null.
- [ ] `diffProportionCI(0.30, 100, 0.70, 100)` → CI roughly symmetric around +0.40, within Newcombe Method-10 reference values.
- [ ] `diffProportionCI(2/14, 14, 1/11, 11)` → matches Newcombe 1998 Table II reference values (≈ [−0.16, 0.21] on the difference d = p2/14 − p1/11; adjust sign to plan convention pHigh − pLow).
- [ ] `diffProportionCI(0.5, 0, 0.5, 10)` → null.
- [ ] `tBasedMeanCI([0.3, 0.5, 0.4, 0.45])` → mean = 0.4125; CI half-width matches `t(0.025, df=3) × sd/√4` within 4 decimals.
- [ ] `tBasedMeanCI([0.3])` → mean = 0.3, ciLow = null, ciHigh = null, n = 1.
- [ ] `tBasedMeanCI([])` → mean = null, ciLow = null, ciHigh = null, n = 0.
- [ ] `tBasedMeanCI([0.3, NaN, 0.4])` → filters NaN; mean computed from [0.3, 0.4]; n = 2.
- [ ] `pooledBandReduction` fixture: 3 low-band cells with `n = [10, 20, 30]` and `successes = [3, 4, 5]`, 2 high-band cells with `n = [10, 10]` and `successes = [7, 8]` → `lowBandMean = 12/60 = 0.20`, `highBandMean = 15/20 = 0.75`, `value = 0.55`, `qualifyingTrials = 80`. Critically, `lowBandMean` is NOT `(0.30 + 0.20 + 0.167)/3 ≈ 0.222` — the test asserts the pooled value to lock in Decision 1.
- [ ] `pooledBandReduction` thin-band fixtures: low-band only thin → reason `'low-band-thin'`, value null, lowBandMean null, highBandMean populated, qualifyingTrials = sum of high-band n. Same for high-only and both-thin.

### A4. Resolver rewrite in `pressure-sensitivity.ts`

- [ ] Move `FLAT_DELTA_THRESHOLD` from a private const inside `pressure-sensitivity.ts` (line 43) into `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts` as an exported constant. The resolver imports it from the new shared location. This avoids duplicating the threshold for the new `pairsPositive` counter (round-3 task review MEDIUM).
- [ ] Replace usage of `applyBandReduction` for the per-pair output with `pooledBandReduction(grid, MIN_N)`. The legacy `applyBandReduction` may be deleted if no other code paths use it.
- [ ] For each pair, construct `winRateDelta = { value, ciLow, ciHigh, lowBandMean, highBandMean, reason }` from `pooledBandReduction` output. Also expose `qualifyingTrials` at the per-pair level (separate field, used by the Trials column per FR-008b).
- [ ] **Remove** the per-pair `directionDelta`, `convictionDelta`, `netScoreDelta` fields from the resolver's output mapping. **Remove** the per-pair `baselineWinRate` field as well (the ceiling/floor badge now follows the Low pressure cell value per FR-007, so `computeBaselineWinRate` and the `baselineWinRate` field are orphaned). Stop emitting `aggregateSensitivity` on the per-model output. The cell-level `conviction` field stays (still used by the 2D pressure grid drilldown).
- [ ] **Delete the now-orphaned helpers and types from `aggregation.ts`:** `applyBandReduction` (replaced by `pooledBandReduction`), `computeBaselineWinRate` (no longer used), and the obsolete type aliases `DeltaTriplet`, `BaselineWinRate`, `AggregateSensitivity` (no callers after the field removal). Remove their re-imports from the resolver.
- [ ] **Delete the now-orphaned Pothos type refs** from `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts` (or `.../graphql/types/pressure-sensitivity.ts`, whichever defines them): `BandStatRef`, `BaselineWinRateRef`, `AggregateSensitivityRef`. Removing the fields without removing the refs leaves dead Pothos object types in the schema definition file.
- [ ] **Re-seat the model-ordering default.** The current resolver sorts the per-model output by `aggregateSensitivity.value` (line ~519). Replace that with a sort by `winRateDeltaSummary.mean` descending (with `null` summaries to the bottom) so the page's `selectedModelId = models[0]` default still picks the most-sensitive model. Without this, the default detail panel becomes arbitrary (round-3 task review MEDIUM).
- [ ] After looping per-pair for a given model, collect `perPairWinRateDeltas: number[]` for pairs where `winRateDelta.value !== null`. Also collect `perPairLowBandRates` and `perPairHighBandRates` from the same set of pairs. Increment `pairsPositive` per FR-013a: `for each pair, if winRateDelta.value !== null && winRateDelta.value > FLAT_DELTA_THRESHOLD then pairsPositive += 1`.
- [ ] Compute `winRateDeltaSummary = { mean, ciLow, ciHigh, lowBandMean, highBandMean, pairsMeasured, pairsPositive }`:
  - `mean / ciLow / ciHigh` from `tBasedMeanCI(perPairWinRateDeltas)`.
  - `lowBandMean = mean(perPairLowBandRates)` (arithmetic mean of per-pair band means).
  - `highBandMean = mean(perPairHighBandRates)`.
  - `pairsMeasured = perPairWinRateDeltas.length`.
  - `pairsPositive` from the counter above.
- [ ] Push `winRateDeltaSummary` into the per-model output shape.
- [ ] Transcript-cap warning (Decision 8 / FR-019): when the pagination loop exits because `scanned >= TRANSCRIPT_FETCH_LIMIT` AND the cursor still points to additional rows, call `log.warn({ sourceRunIds, scanned, limit: TRANSCRIPT_FETCH_LIMIT, code: 'transcript_cap_hit' }, 'Transcript fetch hit cap; results may be biased')`. Set a top-level `transcriptCapHit: boolean` field on the resolver's return value (true when the cap was hit, false otherwise). **Make sure both the early-return path (line ~172-174 short-circuit when no source runs found) AND `buildEmptyResult()` (line ~568-587) include `transcriptCapHit: false`** so the GraphQL response shape is consistent across all code paths (round-3 task review MEDIUM).
- [ ] Source-run collision warning (Decision 9 / FR-020): when `sourceRunToDefId.set(sourceRunId, defId)` would overwrite an existing entry with a different defId, call `log.warn({ sourceRunId, existingDefinitionId: existing, newDefinitionId: defId, code: 'source_run_collision' }, 'sourceRunId mapped to multiple definitions; last write wins')`. Then proceed with the set (last-write-wins is preserved).

### A5. Pothos types / SDL

- [ ] In `cloud/apps/api/src/graphql/types/pressure-sensitivity.ts`, add new shape `WinRateDeltaShape` with fields: `value: Float | null`, `ciLow: Float | null`, `ciHigh: Float | null`, `lowBandMean: Float | null`, `highBandMean: Float | null`, `reason: String | null`. Define corresponding Pothos object type.
- [ ] Add new shape `WinRateDeltaSummaryShape` with fields: `mean: Float | null`, `ciLow: Float | null`, `ciHigh: Float | null`, `lowBandMean: Float | null`, `highBandMean: Float | null`, `pairsMeasured: Int!`, `pairsPositive: Int!`. Define corresponding Pothos object type.
- [ ] Add `qualifyingTrials: Int!` field to the per-pair shape.
- [ ] Add `transcriptCapHit: Boolean!` field to the top-level `PressureSensitivityResponse` shape.
- [ ] Replace the per-pair `directionDelta` field with `winRateDelta: WinRateDeltaShape`. Add `winRateDeltaSummary: WinRateDeltaSummaryShape` to the per-model shape.
- [ ] **Delete** the per-pair `directionDelta`, `convictionDelta`, `netScoreDelta`, `baselineWinRate` fields and the per-model `aggregateSensitivity` field from the Pothos type definitions (no `@deprecated` directive — fields are removed).

### A6. SDL regen

- [ ] Run `LOG_LEVEL=silent DATABASE_URL=postgresql://x:x@localhost/x JWT_SECRET=placeholder-for-schema-emit-xxxxxxxxx npx tsx src/scripts/emit-schema.ts > ../../apps/web/schema.graphql` from `cloud/apps/api/`.
- [ ] Verify `cloud/apps/web/schema.graphql` contains `winRateDelta`, `winRateDeltaSummary`, `qualifyingTrials`, `transcriptCapHit` AND does NOT contain `directionDelta`, `convictionDelta`, `netScoreDelta`, `baselineWinRate`, or `aggregateSensitivity`.
- [ ] `npx turbo build --filter=@valuerank/api` — clean.
- [ ] **Diff-checkpoint command (Slice A — BACKEND-ONLY scope):** `grep -RE "directionDelta|convictionDelta|netScoreDelta|baselineWinRate|aggregateSensitivity" cloud/apps/api cloud/packages cloud/workers cloud/apps/web/schema.graphql --include='*.ts' --include='*.graphql'` must return zero matches. The frontend (`cloud/apps/web/src`) still contains references at this point — it only gets cleaned up in Slice B and C. Scoping the Slice A grep to the backend (`apps/api`, `packages`, `workers`) plus the SDL snapshot (`schema.graphql`) keeps the checkpoint runnable in the dependency order. The wider check that covers the whole tree runs at the end of Slice C and again as the final pre-PR check.

### A7. Resolver tests

- [ ] In `pressure-sensitivity.test.ts`, add fixtures and assertions:
  - Per-pair output object includes `winRateDelta` with `{ value, ciLow, ciHigh, lowBandMean, highBandMean, reason }`. Includes `qualifyingTrials`. Does NOT include `directionDelta`, `convictionDelta`, `netScoreDelta`.
  - Per-model output includes `winRateDeltaSummary` with the seven fields (mean, ciLow, ciHigh, lowBandMean, highBandMean, pairsMeasured, pairsPositive). Does NOT include `aggregateSensitivity`.
  - Top-level response includes `transcriptCapHit: false` for fixtures that fit under the cap.
  - Spy on `log.warn`: simulating `scanned == TRANSCRIPT_FETCH_LIMIT` with non-empty cursor causes one warn call with `{ code: 'transcript_cap_hit' }` and the response's `transcriptCapHit === true`.
  - Spy on `log.warn`: feeding a fixture where two aggregate runs share a sourceRunId with different definitionIds causes one warn call with `{ code: 'source_run_collision' }`. The resolver still completes (last-write-wins preserved).
  - **`pairsPositive` boundary fixture:** a model with three measured pairs at `winRateDelta.value = [0.019, 0.021, 0.05]`. Expected `pairsPositive = 2` (only the second and third cross `> FLAT_DELTA_THRESHOLD = 0.02`). Documents the exact boundary so a future change does not silently flip the comparison to `>=` or `> 0`.
  - **Old field absence:** assert `'directionDelta' in pair === false`, same for `convictionDelta`, `netScoreDelta`, `baselineWinRate`. For per-model: `'aggregateSensitivity' in model === false`.

**Slice A checkpoint.**

---

## Slice B — Web operation + types [CHECKPOINT]

Estimated diff: ~80 lines.

### B1. GraphQL operation

- [ ] In `cloud/apps/web/src/api/operations/pressureSensitivity.graphql`:
  - On each `valuePairs` entry, request `winRateDelta { value lowBandMean highBandMean ciLow ciHigh reason }` and `qualifyingTrials`. Remove the `directionDelta`, `convictionDelta`, `netScoreDelta` field selections.
  - On each model, add `winRateDeltaSummary { mean ciLow ciHigh lowBandMean highBandMean pairsMeasured pairsPositive }`. Remove `aggregateSensitivity`.
  - At the top level, request `transcriptCapHit`.
- [ ] Keep the rest of the operation (insufficient, excludedDefinitions, sanity check, etc.) unchanged.

### B2. Codegen

- [ ] `npm run codegen --workspace @valuerank/web` — regenerates `cloud/apps/web/src/generated/graphql.ts` cleanly.

### B3. Operation re-exports

- [ ] In `cloud/apps/web/src/api/operations/pressureSensitivity.ts`, update derived type re-exports:
  - Add `PressureSensitivityWinRateDelta = NonNullable<...['winRateDelta']>`.
  - Add `PressureSensitivityWinRateDeltaSummary = NonNullable<...['winRateDeltaSummary']>`.
  - Remove `directionDelta` / `convictionDelta` / `netScoreDelta` / `aggregateSensitivity` derived re-exports.

**Slice B checkpoint** (Codex + Gemini diff review).

---

## Slice C — Web components: rebuilt tables + HeaderTooltip [CHECKPOINT]

Estimated diff: ~350 lines.

### C1. HeaderTooltip wrapper `cloud/apps/web/src/components/ui/HeaderTooltip.tsx`

**Reuse, don't reinvent.** The existing `Tooltip` primitive at `cloud/apps/web/src/components/ui/Tooltip.tsx` already handles hover/focus, `role="tooltip"`, and `aria-describedby`. Build a thin wrapper around it for header cells, modeled on the existing `HeaderTooltipTrigger` in `cloud/apps/web/src/components/runs/SortHeaderButton.tsx`.

- [ ] Component signature: `<HeaderTooltip label={ReactNode} content={string | ReactNode} />`. Renders `label` followed by an inline ⓘ icon button (Lucide `Info`) wrapped in `<Tooltip content={...}>`.
- [ ] The ⓘ trigger MUST be `<button type="button" aria-label="...">` so it is keyboard-focusable and announces correctly. The existing `Tooltip` primitive handles the rest of the a11y contract.
- [ ] Click on the ⓘ button MUST call `event.stopPropagation()` so it does not bubble to a parent sortable header (round-2 finding). Add an explicit `onClick={(e) => e.stopPropagation()}`.
- [ ] File under 60 lines (it's mostly composition, not new logic).

### C2. HeaderTooltip tests `cloud/apps/web/src/components/ui/HeaderTooltip.test.tsx`

The existing `Tooltip` primitive uses `onMouseEnter` / `onMouseLeave` with a 200 ms delay before showing (`Tooltip.tsx#L44/L99/L140`). Test events MUST match the primitive's actual handlers.

- [ ] `fireEvent.focus(triggerButton)` → tooltip text is rendered (focus path is immediate, no timer); `triggerButton.getAttribute('aria-describedby')` resolves to a node with `role="tooltip"`.
- [ ] `fireEvent.blur(triggerButton)` → tooltip is removed.
- [ ] `fireEvent.mouseEnter(triggerButton)` plus `vi.advanceTimersByTime(200)` → tooltip appears (use Vitest fake timers).
- [ ] `fireEvent.mouseLeave(triggerButton)` → tooltip is removed.
- [ ] `fireEvent.click(triggerButton)` → propagation stopped (assert via spy on parent `onClick`).

### C2b. CeilingFloorBadge regression test `cloud/apps/web/src/components/models/CeilingFloorBadge.test.tsx`

- [ ] Render `<CeilingFloorBadge flag="ceiling" />` → element with text "ceiling" and classes including `bg-amber-100 text-amber-800`.
- [ ] Render `<CeilingFloorBadge flag="floor" />` → element with text "floor" and the same Tailwind classes.
- [ ] Render `<CeilingFloorBadge flag={null} />` → renders nothing (returns null).

### C3. CeilingFloorBadge `cloud/apps/web/src/components/models/CeilingFloorBadge.tsx`

- [ ] Extract the existing `CeilingFloorBadge` from `PressureSensitivityDetail.tsx` into its own file. Same API.
- [ ] File under 30 lines.

### C4. Rebuilt cross-model summary `PressureSensitivitySummary.tsx`

- [ ] Replace the entire component body with the new 4-column layout:
  - Group header `<th colSpan={3}>Win Rate</th>` (with HeaderTooltip on the group label) above the three Win Rate columns.
  - Column headers: Model | Low pressure | High pressure | Win rate Δ ± CI. Each gets a HeaderTooltip with the approved copy from plan.md.
  - Data binding:
    - Low pressure cell: `model.winRateDeltaSummary.lowBandMean` → format as `(value * 100).toFixed(0) + '%'`. Inline ceiling/floor badge if value ≥ 0.9 or ≤ 0.1.
    - High pressure cell: `model.winRateDeltaSummary.highBandMean` → format as percent.
    - Win rate Δ cell: `model.winRateDeltaSummary.mean` formatted as `+X pp` or `−X pp`, with CI as `± Y pp` (`(ciHigh - ciLow) / 2` half-width). Negative values get `text-red-700` class AND a leading `▼` glyph (Decision 5 + WCAG 1.4.1). Append `· N/M moved up` annotation where N = `pairsPositive`, M = `pairsMeasured`.
    - When `pairsMeasured < 2` (CI undefined), show value with `(thin)` annotation in muted color instead of `± CI`.
    - When `pairsMeasured === 0` or `mean === null`, render the row in the insufficient footer (or with `—` in the Δ cell).
- [ ] Drop: Provider, Aggregate sensitivity, Pairs measured, Spread sparkline columns.
- [ ] Default sort: primary = Win rate Δ desc; secondary = model name asc (tie-break per Decision 7). Click header to toggle. Rows with undefined Δ sort to bottom.
- [ ] File under 220 lines.

### C5. Rebuilt per-pair detail `PressureSensitivityDetail.tsx`

- [ ] Replace the entire component body with the new 5-column layout:
  - Group header `<th colSpan={3}>Win Rate</th>` over Low / High / Δ.
  - Columns: Value Pair | Low pressure | High pressure | Win rate Δ ± CI | Trials.
  - Data binding:
    - Low pressure cell: `pair.winRateDelta.lowBandMean` as percent. Ceiling/floor badge inline IF the value is defined (FR-007a — no badge when cell shows "—").
    - High pressure cell: `pair.winRateDelta.highBandMean` as percent.
    - Win rate Δ cell: `pair.winRateDelta.value` formatted as `+X pp ± Y pp` (half-width from `ciLow`/`ciHigh`). Negative values get `text-red-700` AND leading `▼`. When value is null, render `—` with hover tooltip whose text comes from `pair.winRateDelta.reason` per FR-008 mapping.
    - Trials cell: `pair.qualifyingTrials` (per FR-008b — NOT the legacy `pairN` total).
- [ ] Drop: Defs column, Baseline column, Conviction Δ column, netScore Δ column.
- [ ] Existing 2D pressure grid drilldown logic preserved (click a row → `<PressureGrid pair={selectedPair} />`).
- [ ] Default sort: primary = |Win rate Δ| desc; secondary = pair label asc (tie-break per Decision 7). Rows with undefined Δ sort to bottom.
- [ ] File under 240 lines.

### C6. Carve-outs (FR-017)

- [ ] In `PressureSensitivityCrossValueMap.tsx`, switch `pair.netScoreDelta.value` → `pair.winRateDelta.value`. ALSO update the visible cell title (`PressureSensitivityCrossValueMap.tsx:103` references `|netScore Δ|`) to read `|Win rate Δ|`. The legend, color scale, and any other places that mention "netScore" or "direction" must be updated to "Win rate Δ" — full text sweep, not just the data binding.
- [ ] In `PressureSensitivitySanityCheck.tsx`, full label sweep:
  - Panel title: "Directional sanity check" → "Win rate sanity check".
  - "measurable Direction Δ" copy → "measurable Win rate Δ".
  - Breakdown table header "Direction Δ" → "Win rate Δ".
  - Copy line "Below 70% positive direction" → "Below 70% positive movement" (or equivalent — keep meaning, drop the word "direction").
  - Field reads from `pair.directionDelta` → `pair.winRateDelta`.
  - Classification thresholds (`positive` if `Δ > 0.02`, `flat`, `negative`) stay the same.

### C7. Page wiring `cloud/apps/web/src/pages/PressureSensitivity.tsx`

- [ ] **Rewrite the page intro copy.** The current intro at lines ~185-190 says "Three Δ metrics across the (own × opponent) pressure grid" — this is stale after the redesign which surfaces only Win rate Δ. Replace with copy framed around win rate (one paragraph, plain language) per spec User Stories US-1/US-2 (round-3 task review LOW).
- [ ] When `data.pressureSensitivity.transcriptCapHit === true`, render an amber banner above the report: "Coverage warning: this report scanned the maximum 500,000 transcripts and stopped before reaching the end of the data. Win rates and CIs may be biased toward earlier transcripts in the corpus." (Decision 8 / FR-019).
- [ ] Verify the existing limitations panel, sanity check, cross-value heat map, filters all render unchanged otherwise.

### C7a. Endpoint CI hover affordance (FR / spec rule 6)

- [ ] In `PressureSensitivityDetail.tsx`, wrap the Low pressure and High pressure cells in a hover/focus tooltip showing the endpoint Wilson CI (computed from `pair.winRateDelta.lowBandMean / highBandMean` and the corresponding qualifying trial counts derived from cell metadata, OR — simpler — surface `wilsonInterval(p, n)` recomputed in the frontend using `p` and a band-trial-count field). Exact computation deferred to implementation; the spec only requires "endpoint CIs available via hover tooltip", not on-cell rendering. If exposing band trial counts to the frontend is heavy, an acceptable v1 fallback is to show the cell value with a concise text tooltip ("Pooled win rate across qualifying low-pressure cells. CI omitted from this view; see drilldown for cell-level intervals.") (round-3 task review LOW).

### C8. Lint + build

- [ ] `npx turbo build --filter=@valuerank/web` from `cloud/` — clean.
- [ ] `npm run lint --workspace @valuerank/web` — no new errors.

### C9. Component tests

- [ ] `PressureSensitivitySummary.test.tsx`:
  - Renders 4 columns under "Win Rate" group header; no Provider/Aggregate/Pairs Measured/Spread.
  - Default sort = Δ desc with alphabetical tie-break (assert via fixture with two identical-Δ models in non-alphabetical input order).
  - Negative Δ has `text-red-700` class AND leading `▼` glyph.
  - Ceiling badge appears at `lowBandMean ≥ 0.9`; no badge when `lowBandMean === null`.
  - `(thin)` annotation when `pairsMeasured = 1`.
  - `pairsPositive / pairsMeasured` renders as `· N/M moved up`.
  - Tooltip body for Win rate Δ contains the substring "spread of per-pair Δs".
- [ ] `PressureSensitivityDetail.test.tsx`:
  - Renders 5 columns; no Defs/Baseline/Conviction/netScore.
  - Default sort = |Δ| desc with alphabetical tie-break.
  - "—" Δ cell shows the reason hover text per FR-008 mapping.
  - Thin-band Low/High cell shows "—" and NO ceiling/floor badge (FR-007a).
  - Trials column reads `qualifyingTrials`.
- [ ] `PressureSensitivityCrossValueMap.test.tsx` — cell color now driven by `winRateDelta.value`.
- [ ] `PressureSensitivitySanityCheck.test.tsx` — header label is "Win rate Δ"; field reads come from `winRateDelta`.
- [ ] `PressureSensitivity.test.tsx` (page-level) — banner renders when `transcriptCapHit === true`, hidden when false.

**Slice C checkpoint** (Codex + Gemini diff review).

---

## Verification checklist (final, pre-PR)

- [ ] Preflight: lint + build for both `@valuerank/api` and `@valuerank/web` clean.
- [ ] Existing unit tests (38 from v1) still pass.
- [ ] New aggregation tests (15+) pass.
- [ ] New resolver tests pass.
- [ ] New component tests pass.
- [ ] **Old-field-removal grep (post-codegen, INCLUDES generated dir):** `grep -RE "directionDelta|convictionDelta|netScoreDelta|baselineWinRate|aggregateSensitivity" cloud --include='*.ts' --include='*.tsx' --include='*.graphql'` returns zero matches anywhere — the post-Slice-B codegen MUST have re-emitted clean types. If the generated file still contains old names, the GraphQL operation in Slice B is incomplete and must be fixed before merge (round-3 task review MEDIUM M-01).
- [ ] Manual: open `/models/pressure-sensitivity?domainId=cmmqi1urq0000e4y3ot8sfm06&signature=vnewtd` against staging — page renders without runtime errors.
- [ ] Smoke test: query `pressureSensitivity` via MCP `graphql_query` — verify `winRateDeltaSummary` populated for at least one model and `transcriptCapHit` is present.
- [ ] git status — no unintended files changed.
- [ ] Existing `/models/consistency` and Matrix routes still render.

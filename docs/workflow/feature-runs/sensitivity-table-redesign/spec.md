# Spec: Pressure Sensitivity Table Redesign

**Feature slug:** sensitivity-table-redesign
**Created:** 2026-04-28
**Status:** draft
**Path:** Feature Factory (`docs/workflow/feature-runs/sensitivity-table-redesign/`)

---

## Background

The Pressure Sensitivity report shipped in PR #770 (with hotfixes in #772 and #774) currently exposes three Δ metrics per `(model, value pair)` — Direction Δ, Conviction Δ, netScore Δ — and rolls them into a single ranked "aggregate sensitivity" headline. After post-deploy review with the user, three issues surfaced:

1. **Aggregate sensitivity isn't interpretable.** A `mean(|netScoreDelta|)` value like 0.234 doesn't tell a reader what the model actually does. Survey-methodology readers want a metric in real units (percentage points of win rate) with confidence intervals.
2. **Conviction Δ doesn't behave like a pressure-sensitivity metric.** Firmness ("strongly" vs "somewhat" language) is mostly a model-voice property — it tracks training and writing style, not pressure level. Conviction Δ across pairs comes out near zero for most models, swamping the signal we actually want to measure.
3. **"Direction Δ" is poorly named.** The metric is literally a win-rate change in percentage points. Calling it "Direction Δ" is inherited terminology that doesn't match the rest of ValueRank, which uses "win rate" everywhere.

This spec replaces the headline view with two tables that focus exclusively on win-rate sensitivity, expose CIs honestly, and use vocabulary consistent with the rest of the app.

---

## Discovery: Assumptions Carried In

Discovery was completed against the prior conversation. The following assumptions are carried in:

1. **Drop conviction/firmness columns from both tables.** The resolver still emits conviction data (free side-effect of the existing aggregation pipeline) and the 2D pressure grid drilldown can still expose it per-cell, but the headline tables don't show it.
2. **Rename "Direction Δ" → "Win rate Δ".** Matches the rest of ValueRank's vocabulary; "Direction" was a confusing inherited label.
3. **Cross-model report: 4 columns** under a "Win Rate" group header — Model | Low pressure | High pressure | Win rate Δ ± CI. Drop Provider, Aggregate sensitivity, Pairs measured, and Spread sparkline.
4. **Per-pair report: 5 columns** under a "Win Rate" group header — Value Pair | Low pressure | High pressure | Win rate Δ ± CI | Trials. Drop Defs and Baseline (Baseline was always redundant with Low pressure win rate).
5. **CI computation:**
   - Per-pair Win rate Δ: Wilson-propagated CI on the difference of two binomial proportions. **The point estimate must also be recomputed as a pooled binomial proportion** (`successes_high / trials_high − successes_low / trials_low`), not as the mean of per-cell win rates. Tracking band-level `successes` and `trials` requires extending the cell shape to expose `ownPicked` count (matches/successes) alongside `n` (trials).
   - Cross-model summary: t-based CI on the mean across pairs (df = pairsMeasured − 1), where each pair's per-pair Δ is treated as one observation.
   - Cross-model summary headline annotation: alongside the mean Δ ± CI, surface `n_positive / n_total` (count of measured pairs whose per-pair Δ is positive) so opposing-direction cancellation is visible. A model averaging +0 pp with 5/10 positive shows "movement in opposite directions cancels," not "model is unmoved."
6. **Display rules:**
   - Low/High pressure shown as percent (e.g. "30%").
   - Win rate Δ shown as percentage points (e.g. "+40 pp ± 7 pp").
   - Negative Δ values rendered in red.
   - Ceiling/floor flag rendered inline as a small badge on the Low pressure cell when baseline ≥ 0.9 or ≤ 0.1.
   - Δ shows "—" with a hover explainer when the band-coverage rule (≥1 cell with N≥3 in both bands) is not met.
   - **No CIs on Low/High pressure cells in the table itself.** Endpoint CIs available via hover tooltip.
7. **Tooltips:** every column header gets a ⓘ icon with the approved copy from conversation. Group header ("Win Rate") also gets a tooltip.
8. **Backend:** extend the per-pair resolver shape to include CI fields, and add a new per-model `winRateDeltaSummary`. **Remove** `directionDelta`, `convictionDelta`, `netScoreDelta`, and `aggregateSensitivity` from the GraphQL output entirely (no deprecation window — this is a monorepo with no external consumers, and keeping dead fields would let the old vocabulary leak back in).

---

## Product Goal

The Pressure Sensitivity report's headline view should let a researcher answer one question quickly: **how much does pressure move each model's pick rate, and how confident are we in that number?**

Numbers should:
- Be in interpretable units (percentage points of win rate).
- Carry CIs that say something honest about uncertainty.
- Use vocabulary consistent with the rest of ValueRank.
- Avoid columns that don't add information (firmness, aggregate sensitivity, sparklines).

---

## User Stories

### US-1 — See cross-model win-rate sensitivity at a glance (P1)

As a researcher, I want one table that ranks every model by how much pressure moves its win rate, with low-pressure and high-pressure values shown alongside the Δ.

**Why this priority:** This is the headline finding of the report.

**Independent test:** Open `/models/pressure-sensitivity`. The cross-model summary renders with 4 columns: Model, Low pressure, High pressure, Win rate Δ ± CI. Sorted by Win rate Δ descending.

**Acceptance scenarios:**

1. **Given** I open the page, **when** the cross-model summary loads, **then** I see a single table grouped under a "Win Rate" header with four columns. There are no firmness/conviction columns, no Provider column, no Aggregate sensitivity column.
2. **Given** the summary is visible, **when** I click the Win rate Δ column header, **then** the table re-sorts by that column.
3. **Given** the summary is visible, **when** any model has Win rate Δ < 0, **then** that cell renders the value in red so it stands out as moving against expectation.
4. **Given** the summary is visible, **when** any model's Low pressure win rate is in the ceiling range (≥ 0.9), **then** that cell renders an inline "ceiling" badge.

### US-2 — Drill into a single model's per-pair sensitivity (P1)

As a researcher who sees a model in a surprising position on the cross-model summary, I want to select that model and see its per-pair win-rate sensitivity broken out, with the same column structure.

**Acceptance scenarios:**

1. **Given** I select a model, **when** the per-pair detail loads, **then** I see a single table grouped under a "Win Rate" header with five columns: Value Pair, Low pressure, High pressure, Win rate Δ ± CI, Trials.
2. **Given** the per-pair table is visible, **when** any pair has too few trials in either pressure band to compute Δ, **then** that row shows "—" in the Δ column with a hover explainer ("low band thin" or "high band thin").
3. **Given** I click a row, **when** the per-pair drill-down opens, **then** I see the existing 5×5 pressure heat map for that pair (unchanged from current behavior).

### US-3 — See what each metric means via hover tooltips (P1)

As a researcher who hasn't built the report and may not remember what "low pressure" means, I want every column header to have a ⓘ icon with a short tooltip explaining the metric.

**Acceptance scenarios:**

1. **Given** I hover (or focus, on keyboard) any column header, **when** the tooltip opens, **then** I see a plain-English explanation of what the column means, including units where relevant.
2. **Given** I hover the Win rate Δ column header, **when** the tooltip opens, **then** the copy explicitly defines "light pressure" (own ≤ 2) and "heavy pressure" (own ≥ 4) and explains why level 3 is excluded.
3. **Given** I hover the group header "Win Rate", **when** the tooltip opens, **then** the copy explains the win-rate metric and references that it matches the formula used elsewhere in ValueRank.

### US-4 — See uncertainty on Δ values (P2)

As a researcher who needs to know whether ranking differences are real, I want every Win rate Δ to carry a 95% CI.

**Acceptance scenarios:**

1. **Given** the cross-model summary is visible, **when** I look at any Win rate Δ cell, **then** I see the value followed by a 95% CI in the same units (e.g. "+40 pp ± 7 pp").
2. **Given** the per-pair table is visible, **when** I look at any Win rate Δ cell, **then** the cell shows the trial-level CI (Wilson-propagated) for that pair.
3. **Given** I hover the Win rate Δ column header, **when** the tooltip opens, **then** it says explicitly that the cross-model CI reflects spread across pairs and the per-pair CI reflects trial-level uncertainty within the pair.

---

## Edge Cases

- **A model has < 2 measured pairs:** the cross-model row's CI is undefined (t-distribution needs df ≥ 1). Show the Δ value with "—" in place of the ± CI, or omit the row entirely (move to insufficient footer). Recommendation: show value with "(thin)" annotation rather than dropping the model.
- **A pair's low or high band has zero qualifying cells (N≥3):** Δ shows "—". Tooltip explains which side is missing.
- **A pair has trials but parsing rejected all of them:** Trials column shows 0; Δ shows "—".
- **A pair's low band win rate is exactly 0% or 100%:** Wilson CI handles boundary cases (no division-by-zero crash). Should fall back to a one-sided interval if the standard formula degenerates.
- **All cells are at ceiling (≥0.9) for a pair:** ceiling badge renders, Δ likely small or 0.
- **Negative Δ at extreme magnitudes (< −20 pp):** still rendered in red; do not special-case.
- **Cross-model "Low pressure" or "High pressure" cell when a model has only one pair measured:** show the single value without the across-pair averaging label.
- **Tooltip overflow on narrow screens:** tooltip should be width-bounded (max ~280px) and not break table layout.
- **Sorting by Win rate Δ when some rows have undefined Δ:** undefined rows sort to the bottom regardless of direction.

---

## Functional Requirements

- **FR-001:** System MUST render the cross-model summary with exactly 4 columns under a "Win Rate" group header: Model, Low pressure win rate, High pressure win rate, Win rate Δ ± CI. No other columns.
- **FR-002:** System MUST render the per-pair detail table with exactly 5 columns under a "Win Rate" group header: Value Pair, Low pressure win rate, High pressure win rate, Win rate Δ ± CI, Trials. No other columns.
- **FR-003:** System MUST display Low and High pressure win rates as percentages (e.g. "30%") with no CI in the cell.
- **FR-004:** System MUST display Win rate Δ as a signed percentage-point value with 95% CI in the same units (e.g. "+40 pp ± 7 pp"). Negative values MUST render in a red color class.
- **FR-005:** Per-pair Win rate Δ MUST be computed as a pooled binomial proportion difference: sum `successes` (own_picked count) and `trials` (n) across the cells in each band that meet N ≥ 3, then `Δ = (successes_high / trials_high) − (successes_low / trials_low)`. The point estimate MUST NOT be computed as the mean of per-cell win rates (that quantity does not match what the Wilson CI describes). The 95% CI MUST be a Wilson-propagated formula on the difference of two binomial proportions using the same band totals.
- **FR-005a:** The cell-level data shape MUST expose `successes` (own_picked count) alongside `n` (total scored trials) so band-level totals can be summed correctly. The existing `winRate` field MAY be retained for the 2D pressure grid display but MUST NOT be used for the Δ point estimate.
- **FR-005b:** Per-pair `lowBandMean` and `highBandMean` displayed in the Low pressure / High pressure cells MUST also be computed as pooled binomial proportions (`sum(successes) / sum(trials)` across qualifying cells in the band), NOT as the arithmetic mean of per-cell win rates. This keeps the Low/High display consistent with the Δ point estimate (high − low). The existing `applyBandReduction` averaging logic MUST be replaced for the per-pair output; the 2D pressure grid may still display per-cell win rates as it currently does.
- **FR-005c:** `applyBandReduction` (or its replacement) MUST return a `reason` field indicating WHY the Δ is undefined when applicable: `'low-band-thin'` (low band has no qualifying cells), `'high-band-thin'` (high band has no qualifying cells), `'both-bands-thin'` (neither band qualifies), or `null` (Δ is defined). The frontend uses this to render a specific explainer in the "—" cell hover tooltip per FR-008. Add the field to the per-pair `winRateDelta` output.
- **FR-006:** Cross-model summary Win rate Δ MUST be computed as the unweighted mean of per-pair Δ values (one observation per measured pair), with a t-based 95% CI (df = pairsMeasured − 1). Three coverage cases:
  - **pairsMeasured = 0:** model goes into the existing `insufficient[]` footer with reason `no-coverage`. Do NOT render the row in the summary table.
  - **pairsMeasured = 1:** model renders as a row in the summary table. The mean Δ is the single pair's Δ. The CI is undefined (`ciLow`/`ciHigh` both null). Cell displays the Δ value followed by `(thin)` annotation in muted styling instead of `± CI`.
  - **pairsMeasured ≥ 2:** standard t-based CI rendering as `+X pp ± Y pp`.
- **FR-006a:** The cross-model summary cell MUST surface `n_positive / n_total` alongside the mean Δ ± CI, where "positive" means **per-pair Δ > FLAT_DELTA_THRESHOLD** (the same shared constant used by the directional sanity check). The implementation MUST import the constant from the existing `FLAT_DELTA_THRESHOLD` source rather than hard-coding `0.02`, so a future change to the threshold updates both annotations atomically. Format: `+40 pp ± 7 pp · 9/11 moved up` (the user-facing copy MUST say "moved up" or "increased" rather than the bare word "positive", because "positive" colloquially means `> 0` and would mislabel small flat moves). The header tooltip MUST define the cutoff numerically (currently 2 pp). The annotation surfaces unconditionally (not only when cancellation is present) so the count is comparable across models.
- **FR-006b:** The cross-model summary `winRateDeltaSummary` is computed over per-pair Δs (one observation per measured pair, post-pooling of multiple definitions per pair). It is NOT computed over raw definitions. The `lowBandMean` and `highBandMean` fields in the summary are arithmetic means of per-pair band means across measured pairs and may NOT equal `highBandMean − lowBandMean = mean` for the same model — these are three independent across-pair statistics, surfaced separately for transparency.
- **FR-007:** System MUST render an inline "ceiling" badge on the per-pair Low pressure cell when the **same value displayed in that cell** (i.e. the per-pair pooled low-band win rate from FR-005b) is ≥ 0.9; "floor" badge when ≤ 0.1. The badge MUST follow the displayed cell value, NOT the legacy `computeBaselineWinRate` quantity (which selects the lowest populated own-pressure level). If a future report needs a different baseline definition, it lives in its own field. This keeps the badge and the cell value visually consistent — a user never sees a "ceiling" badge attached to a 73% cell.
- **FR-007a:** When the Low pressure cell is rendering "—" per FR-008a (low band thin), no ceiling/floor badge is rendered. The badge requires a defined cell value to attach to.
- **FR-008:** System MUST render "—" in the Win rate Δ cell when the band-coverage rule fails for that row (≥1 cell with N ≥ 3 required in both bands). Hover MUST explain which band is thin, using the `reason` field returned by the resolver per FR-005c. Specific text:
  - `'low-band-thin'` → "Low pressure band has no cells with N ≥ 3 trials. Try adding more low-pressure runs."
  - `'high-band-thin'` → "High pressure band has no cells with N ≥ 3 trials. Try adding more high-pressure runs."
  - `'both-bands-thin'` → "Neither pressure band has cells with N ≥ 3 trials. This pair needs more coverage to compute a Δ."
- **FR-008a:** When one band is thin (no cells meet N ≥ 3) but the other has data, the thin band's Low pressure / High pressure cell MUST also render "—" with the same hover explainer text as the Δ cell. The non-thin band's cell renders its pooled value normally. Concretely, the resolver MUST return `null` for `lowBandMean` when the low band is thin and `null` for `highBandMean` when the high band is thin; the frontend renders `null` as "—". This prevents the row from showing a Low pressure value with no Δ, which would suggest more coverage than the row actually has.
- **FR-008b:** Per-pair `Trials` column MUST count ONLY trials that contributed to a qualifying cell (a cell with N ≥ 3 in either the low or high band). Trials in cells that didn't meet the N ≥ 3 threshold, refused/unparseable observations, and observations from `ownLevel = 3` cells (the excluded middle band) MUST NOT be counted. The legacy `pairN` quantity (sum across all cells in the pair) is NOT what this column displays. Resolver MUST emit a new `qualifyingTrials` field per pair that excludes non-qualifying trials; frontend renders that field. This prevents a row from looking better-covered than the data behind the displayed metrics actually justifies.
- **FR-008c:** Existing per-pair coverage signals (`unscoredCount`, `definitionsMeasured`, `definitionsExcluded`) and per-page coverage footer signals (`insufficient[]`, `excludedDefinitions`, `excludedScenariosCount`) MUST continue to be emitted by the resolver and rendered by the frontend. The redesign drops the Defs and Baseline columns from the per-pair table proper but does NOT drop these transparency signals. They live in the existing coverage footer / drilldown surfaces and continue to inform the user when data was discarded.
- **FR-009:** System MUST attach a ⓘ icon to every column header (and to the "Win Rate" group header) that surfaces a tooltip on hover or keyboard focus. Tooltip copy MUST match the approved text recorded in `plan.md`.
- **FR-010:** System MUST use the `Win rate Δ` label everywhere the metric is displayed. The legacy "Direction Δ" label MUST NOT appear in the user-facing UI.
- **FR-011:** System MUST sort the cross-model summary by Win rate Δ descending by default. Per-pair table sorts by |Win rate Δ| descending by default. Both sorts MUST place rows with undefined Δ at the bottom.
- **FR-012:** Backend resolver MUST emit, for each per-pair entry, a `winRateDelta` object with `value`, `ciLow`, `ciHigh`, `lowBandMean`, `highBandMean`, `reason` fields. This field replaces the v1 `directionDelta` object — `directionDelta` MUST be removed from the GraphQL output entirely (no overlap window).
- **FR-013:** Backend resolver MUST emit, for each model, a new `winRateDeltaSummary` object with `mean`, `ciLow`, `ciHigh`, `lowBandMean` (mean across measured pairs of per-pair low-band rates), `highBandMean` (same for high), `pairsMeasured` (count of pairs with defined Δ), and `pairsPositive` (count of pairs where per-pair Δ > 0.02 — the same threshold used by the directional sanity check per FR-017). The frontend uses `pairsPositive / pairsMeasured` to render the moved-up annotation per FR-006a.
- **FR-013a:** The `pairsPositive` counter MUST be tracked PER MODEL (incremented inside the resolver's per-model loop for each measured pair whose Δ exceeds the 0.02 positive threshold). The existing global directional-sanity counters in the resolver are independent of this and continue to drive the bottom-of-page sanity panel. Do NOT reuse the global counter for per-model `pairsPositive`.
- **FR-014:** Backend resolver MUST remove `directionDelta` (per-pair), `convictionDelta` (per-pair), `netScoreDelta` (per-pair), and `aggregateSensitivity` (per-model) from the GraphQL output. The corresponding SDL types MUST be updated and the resolver MUST stop computing/returning them. Verification: `grep -RE "directionDelta|convictionDelta|netScoreDelta|aggregateSensitivity" cloud/apps/api/src cloud/apps/web/src` MUST return zero matches outside auto-generated GraphQL codegen output. Conviction and netScore can return in a follow-up "Model Voice" report under their own field names if needed.
- **FR-015:** Cells with insufficient band coverage MUST NOT contribute to the cross-model `winRateDeltaSummary` mean or CI calculation. The pair's `pairsMeasured` count reflects only pairs with a defined Δ.
- **FR-016:** Existing 2D pressure grid (`PressureGrid.tsx`) MUST continue to render unchanged. It may still expose conviction values in cell drilldowns.
- **FR-017:** Existing cross-value heat map, directional sanity check panel, limitations panel, and filters continue to render with their existing structure and behavior. Two narrow carve-outs apply:
  - **(a) Cross-value heat map:** the cell metric MUST switch from `pair.netScoreDelta.value` to `pair.winRateDelta.value`. The heat map's purpose is to surface "is sensitivity a model trait or value-specific?" — the redesigned report's headline metric is Win rate Δ, so the heat map colors cells by that. This is a one-line read change inside the existing component; the rest of the heat map (rendering, low-data handling, calibration banner) stays.
  - **(b) Directional sanity check panel:** the user-visible label "Direction Δ" MUST be renamed to "Win rate Δ" in the panel copy and breakdown table header. The classification thresholds (`positive` if `Δ > 0.02`, `flat` if `|Δ| ≤ 0.02`, `negative` if `Δ < -0.02`) stay the same as v1. **Note:** because FR-005/FR-005b change how the underlying `winRateDelta.value` is computed (pooled binomial, not mean of per-cell rates), individual pairs' classifications WILL shift in some cases. This is an expected and desirable consequence of the math fix — it is NOT a regression. The carve-out is "label change + same threshold logic", not "same data". The headline annotation `pairsPositive` count uses the same 0.02 threshold so it agrees with the sanity-check tally.
- **FR-017a:** Apart from FR-017's narrow carve-outs, no other components in the report change in this redesign.
- **FR-018:** All new aggregation math (Wilson-propagated diff CI, t-based across-pairs CI) MUST live in `services/pressure-sensitivity/aggregation.ts` as pure functions with unit tests in `aggregation.test.ts`.
- **FR-019:** When the resolver's transcript fetch hits the `TRANSCRIPT_FETCH_LIMIT` cap (currently 500,000 rows) and the cursor has more pages, the resolver MUST log a structured warning at level `warn` with code `transcript_cap_hit` and fields `{ sourceRunIds, scanned, limit }`. The query MUST also surface a top-level boolean `transcriptCapHit: boolean` on the GraphQL response so the frontend can render a coverage banner above the report when truncation occurs. This makes silent bias detectable both in production logs and in the UI.
- **FR-020:** When the resolver detects a `sourceRunId → definitionId` collision (the same source run ID appears under more than one aggregate-tagged run with conflicting definitions), it MUST log a structured warning at level `warn` with code `source_run_collision` and fields `{ sourceRunId, conflictingDefinitionIds }`. Last-write-wins behavior is preserved (matches v1) so this PR does not introduce a behavior change; the warning is the diagnostic hook for a future fix.

---

## Success Criteria

- **SC-001:** A researcher reading the report for the first time can answer "which models are most sensitive to pressure?" in under 30 seconds of scan time.
- **SC-002:** Every Win rate Δ value on the page has a 95% CI; no Δ is displayed without uncertainty.
- **SC-003:** No existing Models-tab test passes become failures; the existing Matrix and Consistency views are unchanged.
- **SC-004:** The new per-pair Wilson-propagated CI math passes textbook unit tests (e.g., agreement with worked examples for diff-of-proportions CI within 4 decimals).
- **SC-005:** The cross-model t-based CI math passes textbook unit tests (e.g., for n=10, mean=0.4, sd=0.1, the CI half-width matches `t(0.025, df=9) × 0.1/√10` within 4 decimals).
- **SC-006:** Every column header tooltip is reachable by keyboard focus, not only mouse hover.
- **SC-007:** The page renders correctly on the existing prod tenant for the canonical signature `vnewtd` against the seed domain `cmmqi1urq0000e4y3ot8sfm06`. At least one model in the cross-model summary has a measurable Win rate Δ.

---

## Non-Goals

- Adding Conviction or Firmness columns to either table. Conviction Δ stays computed in the resolver but is not exposed in the headline view; a future "Model Voice" report can surface it separately.
- Adding netScore Δ as a column. Same reasoning.
- Adding Aggregate sensitivity. Replaced entirely by the explicit Win rate Δ columns.
- Statistical tests (ANOVA, hypothesis testing, multiple-comparison correction). The CI is the only uncertainty machinery in v1.
- Recalibrating level labels across vignettes (acknowledged measurement limitation, not addressed in this report).
- Modifying the 2D pressure grid, cross-value heat map (beyond FR-017a one-line metric switch), sanity check panel (beyond FR-017b label rename), limitations panel, or filters. Each is its own concern.
- Multiple-comparisons correction. Surface CIs, leave hypothesis testing for a later report.
- ANOVA, Bayesian shrinkage, or other tests that pool across models.
- Re-architecting the source-runs plumbing introduced in PR #772 (see Residual Risks below).

---

## Residual Risks (acknowledged, scoped out of this PR)

These are real risks surfaced during adversarial review. They are NOT addressed in this redesign because each is either pre-existing infrastructure work or a known statistical limitation. They are tracked here so they don't get lost.

1. **Transcript fetch is capped at 500,000 rows per query.** The resolver paginates with a hard ceiling (introduced in PR #774 to avoid OOM). On large domains the query silently truncates and the pooled win rates / CIs become biased. **Mitigation in this PR:** when truncation triggers, the resolver MUST log a structured warning (`level=warn, code=transcript_cap_hit, sourceRunIds=[...], scanned=500000`) so we can detect it in production logs. **Long-term fix:** a streaming aggregator that doesn't materialize all transcripts in memory. Out of scope here.

2. **`sourceRunToDefId` map collisions.** The resolver builds a Map from `sourceRunId → definitionId` with blind `Map.set()` overwrites. If the same source run appears in multiple aggregate-tagged runs with different definitions, transcripts are silently attributed to the last one seen. **Mitigation in this PR:** when a collision is detected, log a structured warning (`level=warn, code=source_run_collision, sourceRunId=..., definitions=[...]`) and continue with last-write-wins behavior (matching v1 production behavior). **Long-term fix:** require uniqueness or aggregate the data per (sourceRunId, definitionId) pair. Out of scope here — it's a v1 bug, not a redesign concern.

3. **Single-pair `(thin)` rows can sort to the top of the cross-model summary.** With sort default = Win rate Δ descending and `pairsMeasured = 1` rows showing a value but no CI, a model with one noisy +80pp pair can rank above a model with 10 stable +60pp pairs. The `(thin)` annotation flags this but does not exclude the row from sorting. Documented for users in the column tooltip. A future refinement could sort thin rows to the bottom; for v1 we keep the simpler "value-only" sort to make the data legible.

4. **Multiple-comparisons inflation.** The page surfaces dozens of CIs across (model × pair) combinations. Some will exclude zero by chance alone. The limitations panel already covers this; we do not add a multiple-comparison correction in this redesign.

5. **Arbitrary 0.02 threshold cliff.** Δ = 0.019 classifies as flat, Δ = 0.021 classifies as positive, even though they're statistically indistinguishable. The threshold is documented in column tooltips and the limitations panel. Not changed here.

6. **Sanity-panel classification will shift for some pairs (expected).** Per FR-017b, the sanity panel reuses the same `Δ > 0.02` threshold but the underlying `Δ` is now computed differently (pooled binomial, not mean of per-cell rates). Some borderline pairs will move between flat/positive/negative compared to v1. This is a correctness improvement, not a regression.

---

## Open Questions

*(All resolved during conversation; preserved here for plan-phase reference.)*

1. ~~Should we show CIs on Low/High pressure cells?~~ — **No.** Showing endpoint CIs alongside Δ CI invites the reader to mentally combine them, which is statistically wrong. Endpoint uncertainty available via hover tooltip on demand.
2. ~~Sort default?~~ — **Win rate Δ descending** (cross-model), |Win rate Δ| descending (per-pair).
3. ~~CI formula?~~ — **t-based** for cross-model across-pairs mean (df = pairsMeasured − 1); **Wilson-propagated** for per-pair diff-of-proportions.
4. ~~Should Conviction Δ stay in this report or move to its own?~~ — **Move.** Drop it from this report's headline view; defer a "Model Voice" report as a separate concern.
5. ~~Should we drop the netScore Δ column entirely?~~ — **Yes**, from headline view. Resolver may keep emitting; UI stops reading.

---

## Dependencies

- **Existing pressure-sensitivity resolver** at `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts` continues to source from raw transcripts via the source-runs path (PR #772) with the payload optimizations (PR #774). This redesign extends the per-pair output and adds a new per-model summary; it does not change the data-source plumbing.
- **`ModelValueDetailDrawer.tsx`** continues to define the canonical win-rate formula (`prioritized / (prioritized + deprioritized + neutral)`); the new tooltip copy references this consistency.
- **Existing tooltip / Popover component** in `cloud/apps/web/src/components/ui/` is reused for the ⓘ icon header tooltips. If a suitable component does not exist, the plan phase decides whether to add one or use a lightweight inline `<Tooltip>` primitive.
- **Existing pressure grid drilldown** (`PressureGrid.tsx`) continues to render below the per-pair detail table; no changes.

---

## Glossary (terms reused)

| Term | Meaning | Source |
|---|---|---|
| Win rate | `prioritized / (prioritized + deprioritized + neutral)` per cell | `ModelValueDetailDrawer.tsx` |
| Light pressure | Own pressure level 1 or 2 (low band) | this spec |
| Heavy pressure | Own pressure level 4 or 5 (high band) | this spec |
| Win rate Δ | High-band mean win rate − low-band mean win rate, in percentage points | this spec (renamed from "Direction Δ") |
| Wilson-propagated CI | 95% CI on the difference of two binomial proportions using the Wilson score interval propagation formula | textbook (e.g. Newcombe 1998) |
| t-based CI | 95% CI on a sample mean using the Student t distribution | textbook |
| Pairs measured | Count of value pairs where the model has a defined Win rate Δ | this spec |
| Trials | Total scored trials behind a per-pair row (refusals and unparseable responses excluded) | this spec (renamed from "N") |

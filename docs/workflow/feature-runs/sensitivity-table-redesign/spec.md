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
   - Per-pair Win rate Δ: Wilson-propagated CI on the difference of two binomial proportions, using the trial counts at the low and high bands.
   - Cross-model summary: t-based CI on the mean across pairs (df = pairsMeasured − 1), where each pair's per-pair Δ is treated as one observation.
6. **Display rules:**
   - Low/High pressure shown as percent (e.g. "30%").
   - Win rate Δ shown as percentage points (e.g. "+40 pp ± 7 pp").
   - Negative Δ values rendered in red.
   - Ceiling/floor flag rendered inline as a small badge on the Low pressure cell when baseline ≥ 0.9 or ≤ 0.1.
   - Δ shows "—" with a hover explainer when the band-coverage rule (≥1 cell with N≥3 in both bands) is not met.
   - **No CIs on Low/High pressure cells in the table itself.** Endpoint CIs available via hover tooltip.
7. **Tooltips:** every column header gets a ⓘ icon with the approved copy from conversation. Group header ("Win Rate") also gets a tooltip.
8. **Backend:** extend the resolver shape to include per-pair Direction Δ CI fields and a new `directionDeltaSummary` on each model. Deprecate `aggregateSensitivity` (keep on schema for one release; stop displaying).

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
- **FR-005:** Per-pair Win rate Δ CI MUST use a Wilson-propagated formula on the difference of two binomial proportions, with trial counts taken from the low-band and high-band cells that meet N ≥ 3.
- **FR-006:** Cross-model summary Win rate Δ MUST be computed as the unweighted mean of per-pair Δ values (one observation per measured pair), with a t-based 95% CI (df = pairsMeasured − 1). When pairsMeasured < 2, the CI is undefined and the cell renders "(thin)".
- **FR-007:** System MUST render an inline "ceiling" badge on the Low pressure cell when the baseline win rate ≥ 0.9; "floor" badge when ≤ 0.1.
- **FR-008:** System MUST render "—" in the Win rate Δ cell when the band-coverage rule fails for that row (≥1 cell with N ≥ 3 required in both bands). Hover MUST explain which band is thin.
- **FR-009:** System MUST attach a ⓘ icon to every column header (and to the "Win Rate" group header) that surfaces a tooltip on hover or keyboard focus. Tooltip copy MUST match the approved text recorded in `plan.md`.
- **FR-010:** System MUST use the `Win rate Δ` label everywhere the metric is displayed. The legacy "Direction Δ" label MUST NOT appear in the user-facing UI.
- **FR-011:** System MUST sort the cross-model summary by Win rate Δ descending by default. Per-pair table sorts by |Win rate Δ| descending by default. Both sorts MUST place rows with undefined Δ at the bottom.
- **FR-012:** Backend resolver MUST emit, for each per-pair entry, a `directionDelta` object with `value`, `ciLow`, `ciHigh`, `lowBandMean`, `highBandMean` fields (existing structure extended with the two new CI fields).
- **FR-013:** Backend resolver MUST emit, for each model, a new `directionDeltaSummary` object with `mean`, `ciLow`, `ciHigh`, `lowBandMean` (mean across pairs of low-band rates), `highBandMean` (same for high), and `pairsMeasured` (count of pairs with defined Δ).
- **FR-014:** Backend resolver MAY continue to emit `convictionDelta`, `netScoreDelta`, and `aggregateSensitivity` on the existing schema. Frontend MUST stop reading them. They MAY be removed in a follow-up release.
- **FR-015:** Cells with insufficient band coverage MUST NOT contribute to the cross-model `directionDeltaSummary` mean or CI calculation. The pair's `pairsMeasured` count reflects only pairs with a defined Δ.
- **FR-016:** Existing 2D pressure grid (`PressureGrid.tsx`) MUST continue to render unchanged. It may still expose conviction values in cell drilldowns.
- **FR-017:** Existing cross-value heat map, directional sanity check panel, limitations panel, and filters MUST continue to render unchanged.
- **FR-018:** All new aggregation math (Wilson-propagated diff CI, t-based across-pairs CI) MUST live in `services/pressure-sensitivity/aggregation.ts` as pure functions with unit tests in `aggregation.test.ts`.

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
- Modifying the 2D pressure grid, cross-value heat map, sanity check panel, limitations panel, or filters. Each is its own concern.
- Removing the deprecated `aggregateSensitivity` / `convictionDelta` / `netScoreDelta` fields from the GraphQL schema. Frontend stops reading them; backend keeps emitting them this release for safety.

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

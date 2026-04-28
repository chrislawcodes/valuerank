# Spec: Pressure Sensitivity Report

**Feature slug:** pressure-sensitivity-report
**Created:** 2026-04-27
**Status:** draft
**Path:** Feature Factory (`docs/workflow/feature-runs/pressure-sensitivity-report/`)

---

## Background

ValueRank vignettes ramp up the **pressure** on each value using level scales (typically a 5-point scale: `negligible → minimal → moderate → substantial → full`, scored `1–5`). Each scenario has two pressure dimensions — pressure on the value being measured (own) and pressure on the opposing value (opponent). The system already records, per transcript, both **what a model chose** (binary: target value, opponent, or neutral) and **how firmly** (5 strength buckets: `strongly / somewhat / neutral / opponentSomewhat / opponentStrongly`), and combines those into a `netScore` ∈ [-2, 2] using a 2:1 weighting in `canonicalConditionSummary.ts`.

There is no report today that asks: **as we vary pressure, how much does a model's response actually move?** The existing condition matrix shows the response inside one vignette. The new `Coherence` metric in `models-consistency-report` rolls pressure-response into a single binary per pair (coherent or not). Neither answers, per model, **which values move under pressure and which don't**, nor lets a researcher compare models on that question.

This spec adds a new **Pressure Sensitivity** report under the `Models` tab. Sensitivity is treated as a descriptive characterization, not a pass/fail audit: a model can be sensitive or insensitive on any given value, and either is a legitimate finding to surface.

---

## Discovery: Assumptions Carried In

Discovery was completed against the prior conversation. The user answered all key decisions; the following assumptions are carried in:

1. **Sensitivity definition.** For each `(model, value pair)`, sensitivity is the **range of response across the 2D pressure grid** (own level × opponent level). Reported as three separate metrics, not collapsed:
   - **Direction Δ** — change in win rate from low-pressure cells to high-pressure cells
   - **Conviction Δ** — change in average decision strength among picks from low to high pressure
   - **netScore Δ** — combined view using the existing 2:1 strongly/somewhat formula
2. **Minimum N per cell = 3.** Cells below threshold are hidden or visually distinguished as low-data; they are not used in the Δ computation.
3. **Layout: one model at a time.** A model selector switches the per-model detail view. No side-by-side comparison view in v1.
4. **Location.** New top-level page under the existing `Models` nav link.
5. **Reuse `getLevelNormalizationMap`** from `cloud/apps/api/src/graphql/queries/scenarios-utils.ts` to map scenario dimension labels back to integer level scores 1–5.
6. **Skip `options[]` alternative phrasing handling.** Verified via two production definition samples and the `LevelPresetVersion` schema (single `l1`–`l5` label per level): production data does not use alternative phrasings.
7. **Reuse existing strength buckets and netScore formula** from `canonicalConditionSummary.ts`. No new weighting.
8. **Ceiling/floor cases are flagged, not excluded.** Flag based on baseline win rate at the lowest own-pressure level; surface via a badge so readers can distinguish "model is firm" from "no room to move".
9. **New aggregation pivot.** Across vignettes for the same value pair, indexed by integer pressure level scores 1–5 on both own and opponent dimensions. The existing condition aggregation is per-vignette only.
10. **No statistical machinery.** No confidence intervals, variance decomposition, multiple-comparison correction, or hypothesis testing. This is a descriptive analysis, not a research instrument.
11. **No level recalibration.** Acknowledged as a measurement limitation in the on-page limitations panel.
12. **No sycophancy or instruction-following confound detection.** Acknowledged in the limitations panel.

---

## Product Goal

The `Pressure Sensitivity` report should let a researcher quickly answer:

1. **Which models are most sensitive to pressure overall?** (cross-model context)
2. **For a given model, which values move under pressure and which don't?** (per-model, per-value)
3. **Is sensitivity a model-level trait, or is it value-specific?** (visual, via a model × value heat map)
4. **Is the pressure manipulation working as designed?** (directional sanity check)

All four should be answerable in under 60 seconds of scan time. Drill-down on any cell should expose the underlying counts and the formula that produced the displayed number.

---

## User Stories

### US-1 — See cross-model sensitivity at a glance (P1)

As a researcher, I want a ranked summary at the top of the page showing every model's aggregate sensitivity, so I can see how the field distributes from "most movable" to "most firm".

**Why this priority:** This is the headline finding for question 1.

**Independent test:** Open the report; a ranked table renders with one row per model, ordered by aggregate sensitivity, with per-value spread visible inline.

**Acceptance scenarios:**

1. **Given** I open `Models → Pressure Sensitivity`, **when** the page loads, **then** I see a ranked table at the top with one row per model, ordered by aggregate sensitivity (descending).
2. **Given** the summary table is visible, **when** I look at any row, **then** I see a small inline distribution (sparkline or stacked bar) showing the spread of per-value sensitivity scores, so I can tell whether the aggregate reflects consistent behavior or averages over wild variation.
3. **Given** a model lacks sufficient coverage to compute aggregate sensitivity, **when** the table renders, **then** that model is shown in an "Insufficient coverage" footer with a specific reason, not silently dropped.

### US-2 — Drill into a single model's per-value detail (P1)

As a researcher who sees a model in a surprising position on the cross-model summary, I want to select that model and see its per-value sensitivity broken out, so I can answer question 2 (which values move and which don't).

**Why this priority:** This view answers the per-model question and is the diagnosis layer behind US-1.

**Acceptance scenarios:**

1. **Given** I select a model, **when** the per-model detail loads, **then** I see a table with one row per value pair tested for that model.
2. **Given** the per-value table is visible, **when** I look at any row, **then** I see columns for: value pair, **Direction Δ** (win rate change), **Conviction Δ** (strength change), **netScore Δ** (combined), **baseline win rate** at lowest own pressure, **ceiling/floor flag**, and **N transcripts** behind the row.
3. **Given** a value pair has fewer than 3 transcripts in any cell of its 2D grid, **when** the row renders, **then** the affected metric shows a low-data marker rather than a number.
4. **Given** a value pair's baseline win rate is at or near 0.0 or 1.0, **when** the row renders, **then** the ceiling/floor flag is set so a reader can distinguish "model is firm" from "no room to move".
5. **Given** I click a row, **when** the per-pair drill-down opens, **then** I see the **2D pressure heat map** (own level × opponent level) for that pair with the underlying counts per cell.

### US-3 — Answer "is sensitivity a model trait or value-specific?" visually (P1)

As a researcher who wants to characterize a model, I want a model × value heat map of sensitivity scores, so I can see whether the same model is sensitive across many values or only certain ones.

**Why this priority:** This is the third of the four core questions and only one chart answers it.

**Acceptance scenarios:**

1. **Given** I open the report, **when** I scroll past the cross-model summary, **then** I see a heat map with one row per model and one column per value pair, cells colored by sensitivity score.
2. **Given** the heat map is visible, **when** a model's row is uniformly dark or uniformly light, **then** the visual reads as "trait" (consistent across values).
3. **Given** the heat map is visible, **when** a model's row varies wildly across columns, **then** the visual reads as "value-specific" (sensitive on some values, not others).
4. **Given** a (model, value) cell has insufficient data, **when** the cell renders, **then** it is greyed and labeled, not zero-colored.

### US-4 — Sanity-check that pressure points the right way (P1)

As a researcher, I want to know whether the pressure manipulation is doing what it claims to do — does increasing own pressure on a value actually increase that value's win rate?

**Why this priority:** This is the AAPOR-style validity check for the whole report. If pressure is not directional in many cases, the rest of the report becomes hard to interpret, so the check needs to be visible.

**Acceptance scenarios:**

1. **Given** the report is open, **when** I scroll to the bottom, **then** I see a **Directional Sanity Check** panel reporting the percentage of (model, value pair) combinations where increased own pressure produced increased win rate.
2. **Given** the panel is visible, **when** I expand it, **then** I see the breakdown by direction: % positive (expected direction), % flat, % negative (against the expected direction).
3. **Given** the panel is visible, **when** I click a count, **then** I see the list of (model, value pair) combinations contributing to that count.

### US-5 — See math behind every number (P2)

As a researcher who will cite this report, I want the formulas and intermediate counts available on the page itself, not buried in a methods doc.

**Acceptance scenarios:**

1. **Given** I hover or click any column header on the per-model detail table, **when** the info opens, **then** I see a plain-English definition and the formula used to compute that metric.
2. **Given** I hover any displayed Δ value, **when** the tooltip opens, **then** I see the high-pressure cell summary, the low-pressure cell summary, and the subtraction that produced the Δ.
3. **Given** I click a cell of the 2D heat map, **when** the panel opens, **then** I see N transcripts, win rate, conviction breakdown, and netScore for that cell.

### US-6 — Limitations are surfaced on-page (P2)

As a researcher, I want known caveats about this measurement to be visible on the report, not buried in documentation.

**Acceptance scenarios:**

1. **Given** the report is open, **when** I scroll past the directional sanity check, **then** I see a **Limitations** panel.
2. **Given** the panel is visible, **when** I read it, **then** it covers: cross-vignette level calibration is assumed not validated; LLM strongly/somewhat is a self-report not a calibrated confidence scale; sycophancy and instruction-following can mimic sensitivity; cells with N < 3 are excluded.

### US-7 — Empty and partial-coverage states are explicit (P2)

As a user opening the report before coverage is sufficient, I want clear messaging about what is or isn't measurable.

**Acceptance scenarios:**

1. **Given** no models have any (own, opponent) cell with N ≥ 3, **when** the report loads, **then** an empty state explains the coverage requirement.
2. **Given** some models have coverage and some don't, **when** the report loads, **then** the summary table shows the covered models and the footer lists the rest with reasons.
3. **Given** a per-model row has only one or two value pairs at sufficient N, **when** the row renders, **then** a coverage warning badge indicates the aggregate is based on thin data.

---

## Edge Cases

- **All cells in a 2D grid have N < 3 for a value pair:** the row is shown with a "low coverage" marker; Δ values are not computed.
- **Only the diagonal cells are populated:** the band-coverage rule in FR-021 governs; if neither the low band (own ≤ 2) nor the high band (own ≥ 4) has a qualifying cell, Δ is undefined for that pair. No diagonal-endpoint fallback.
- **Baseline win rate at lowest own pressure is at 0.0 or 1.0:** flag ceiling/floor; show the Δ values but display the flag prominently so readers do not over-interpret a small or zero Δ.
- **Direction Δ is negative (pressure backfires):** show the value with the sign and a small visual flag; this case feeds the Directional Sanity Check.
- **Conviction Δ is undefined** (no picks in either the low or high band): show "—" and exclude from aggregate.
- **A vignette uses a non-standard level scale** (e.g., custom labels not in the normalized level map, or scores outside 1–5): drop those vignettes per FR-018 with the specific reason (c) or (d); do not fall back to raw labels and do not crash.
- **A scenario dimension value contains whitespace or formatted-number variants** (e.g. `" moderate"`, `"1.0"`, `"01"`): the new aggregation MUST trim whitespace and apply the same numeric-string normalization used in `scenario-metadata.ts` before lookup. Variants that still fail lookup are excluded under FR-018 (d), not assigned to phantom buckets.
- **A Definition has duplicate labels or duplicate scores across its `levels[]` array:** reject the Definition under FR-018 (e) and count the exclusion. Map-based normalization would otherwise silently overwrite earlier entries.
- **A model has runs across only one own-pressure level for a value pair:** Direction and Conviction Δ are undefined for that pair; show "—".
- **Definition uses legacy `values[]` (single dimension) rather than `dimensions[].levels[]`:** exclude from this report; surface count in excluded footer. Sensitivity requires two pressure dimensions.
- **Two models tested on disjoint sets of value pairs:** the cross-model summary aggregate is computed only over pairs each model actually has at sufficient N; show coverage count alongside aggregate so readers can see the denominator differs.

---

## Functional Requirements

- **FR-001:** System MUST render a Pressure Sensitivity report at a new route under the `Models` tab (exact route TBD in plan phase).
- **FR-002:** System MUST aggregate transcripts by `(model, value pair, own_level_score, opponent_level_score)`, where level scores are integers in 1–5 derived from each vignette's parent Definition. Scenario dimension values MUST be extracted via `normalizeScenarioAnalysisMetadata` from `cloud/apps/api/src/services/analysis/scenario-metadata.ts` so `content.dimensions`, `content.dimension_values`, and mixed content are handled uniformly. Label-to-score mapping operates on each Definition's `dimensions[].levels[]` array (NOT on `content` directly): `getLevelNormalizationMap` accepts a `DefinitionDimension` and reads its `levels[]`/`values[]` to build a normalized score map. Two known gaps in that helper are addressed in this spec: (i) it uses raw, untrimmed string keys, so the new aggregation MUST trim/normalize scenario-side dimension values via the same `toComparableNumber`-style logic from `scenario-metadata.ts` BEFORE map lookup; (ii) it has no collision detection — see FR-002a.
- **FR-002a:** Level-label normalization MUST detect map-collision risk in the parent Definition. A Definition's `levels[]` array is in collision if (i) any two levels share the same label after trim/normalization, (ii) any two levels share the same score, or (iii) any one level's label equals any other level's score after string coercion. The new aggregation MUST run a pre-pass over each Definition's raw `dimensions[].levels[]` array (not the post-normalization map) to detect collisions and reject the entire Definition under FR-018 reason (e). Both label and score may be used as map keys for normal lookup, because rejection-on-collision guarantees no key conflict survives. This rule replaces the alternative "label-only keying" option for clarity.
- **FR-002b:** All scenario-dimension extraction and label normalization MUST go through a **single canonical pipeline** that imports existing helpers where they fit and adds a small, named adapter where they do not.

  (a) **Scenario-side extraction** — read dimension values via `normalizeScenarioAnalysisMetadata` from `cloud/apps/api/src/services/analysis/scenario-metadata.ts` so `content.dimensions`, `content.dimension_values`, and mixed content are handled uniformly.

  (b) **Definition-side level resolution** — call `getDimensionLevelsFromDefinition` (also in `scenarios-utils.ts`) to obtain a `DefinitionDimension`'s `levels[]`/`values[]` array; this helper falls back from `levels[]` to `values[]` and is the correct primitive for legacy compatibility. Do NOT use `getLevelNormalizationMap` for legacy-aware lookup; it only reads `levels[]`.

  (c) **Label-to-score lookup** — `getLevelNormalizationMap` returns a `Map<string, string>` keyed on raw, untrimmed labels and stringified scores. The plan phase MUST add (or expose) a small adapter that (i) trims and applies the same `toComparableNumber`-style coercion used in `scenario-metadata.ts` to BOTH the input value and every map key, (ii) detects label/score collisions per FR-002a before building the map, and (iii) rejects out-of-range scores per FR-020. `toComparableNumber` is currently private to `scenario-metadata.ts`; the plan phase MUST decide whether to export it or duplicate the small function — implementing the spec without one of those steps is not possible. Acknowledge: this is **net-new code**, even though the building blocks exist. Calling it "a wiring of existing helpers" understates the work; the adapter is a new exported function in `scenarios-utils.ts` (or a sibling module).

  (d) **Re-implementation discipline** — the new aggregation resolver does not duplicate scenario extraction or core normalization logic. It calls (a), (b), and (c.adapter) and adds aggregation/banding logic only.
- **FR-003:** For each cell in the (own × opponent) grid, system MUST compute the following four cell-level metrics with explicit formulas:
  (a) **N** = count of pooled `(model, scenario)` observations in the cell whose canonical direction is `prioritized`, `deprioritized`, or `neutral` (per FR-022 pooling and FR-023 refusal/unknown exclusion). Refusals and unknowns are excluded from N and tracked separately in `unscored_count` per FR-023. There is no contradiction with FR-023: N is the scored-trial count, not a raw transcript count;
  (b) **Win rate** = `prioritized / (prioritized + deprioritized + neutral)`, where the prioritized/deprioritized/neutral classification per transcript comes from `buildValueOutcomes` / `buildCanonicalValueOutcomes` in `cloud/apps/api/src/services/analysis/aggregate/aggregate-helpers.ts` (which already handles orientation flip on the response score per FR-019). The denominator uses the same convention surfaced in the `ModelValueDetailDrawer.tsx` tooltip text: this is the fraction of trials where the target value won, with `neutral` in the denominator and `unscored` (refusal/unknown per FR-023) excluded entirely. The win rate metric is canonical for the Models UI but is not pre-computed in `canonicalConditionSummary.ts`; that file computes `netScore` and bucket counts. Implementation MUST derive win rate from those counts. Tooltips (per FR-015) MUST state explicitly that this is "wins over scored trials," excluding refusals/unknowns;
  (c) **Conviction** = `(2 × strongly + somewhat) / (strongly + somewhat)` when `(strongly + somewhat) ≥ 1`, otherwise undefined for the cell. This is the mean strength **among target-value picks only** (denominator excludes neutral and opponent picks); it is NOT the netScore formula. Cells with zero target-value picks contribute nothing to the conviction band mean.
  (d) **netScore** = existing formula `(2 × strongly + somewhat − 2 × opponentStrongly − opponentSomewhat) / totalTrials` from `canonicalConditionSummary.ts`, unchanged.
- **FR-004:** Cells with N < 3 MUST be marked as low-data and excluded from Δ computation. The threshold is configurable in code (constant, not a user-facing filter in v1).
- **FR-005:** For each `(model, value pair)`, system MUST compute three Δ metrics across the populated cells of the (own × opponent) grid:
  (a) **Direction Δ** = high-band mean win rate − low-band mean win rate, where the high band is cells with own_level_score ≥ 4 and the low band is cells with own_level_score ≤ 2; if either band is empty, Δ is undefined;
  (b) **Conviction Δ** = same band logic applied to the conviction metric;
  (c) **netScore Δ** = same band logic applied to the netScore metric.
- **FR-006:** For each `(model, value pair)`, system MUST compute a **baseline win rate** = mean win rate across cells with own_level_score = 1 that meet the N ≥ 3 threshold (per FR-004). If no level-1 cell meets the threshold, fall back to the lowest populated level whose cell meets N ≥ 3. If no own-pressure level has any qualifying cell, the baseline is undefined and ceiling/floor flags are not applied.
- **FR-007:** A pair is flagged **ceiling** if baseline win rate ≥ 0.9, **floor** if baseline win rate ≤ 0.1, otherwise no flag. Threshold values are constants in code.
- **FR-008:** For each model, system MUST compute an **aggregate sensitivity** = mean of the absolute netScore Δ across the model's value pairs that have a defined Δ.
- **FR-009:** System MUST render the cross-model summary table with one row per model and columns: model name, provider, aggregate sensitivity, inline per-value spread visualization, count of value pairs measured, count of value pairs excluded.
- **FR-010:** System MUST render a per-model detail view with one row per value pair and columns: value pair, Direction Δ, Conviction Δ, netScore Δ, baseline win rate, ceiling/floor flag, N transcripts.
- **FR-011:** System MUST render a 2D pressure heat map (own × opponent) per value pair on demand (e.g., row click), showing the chosen metric per cell with the underlying N visible on hover.
- **FR-012:** System MUST render a model × value heat map at the page level showing aggregate sensitivity per (model, value pair) cell, with low-coverage cells visually distinguished.
- **FR-013:** System MUST render a **Directional Sanity Check** panel at the bottom of the page reporting the percentage of (model, value pair) combinations where Direction Δ is positive (expected), zero/flat (|Δ| < 0.02), or negative (against expectation). The denominator is the count of (model, value pair) combinations with a **defined** Direction Δ — pairs with undefined Δ (insufficient band coverage per FR-021) are reported as a separate "unmeasurable" count next to the panel, not in the percentage. Click-through MUST surface the underlying list filtered by direction or unmeasurable.
- **FR-014:** System MUST render a **Limitations** panel that surfaces, prominently and on the page itself (not in tooltips):
  (a) **Cross-vignette level calibration is not validated** — comparing sensitivity scores across different value pairs is suspect because "pressure level 4" in one vignette may not represent the same intensity as "pressure level 4" in another. This caveat applies directly to the cross-model summary (US-1) and the model × value heat map (US-3); both views should display the limitation badge inline near their headers.
  (b) **Conviction is a model self-report**, not a calibrated confidence scale. Sycophantic models can increase stated conviction without changing decision logic, which would inflate this report's Conviction Δ.
  (c) **Sycophancy and instruction-following can mimic sensitivity** — a model that mirrors prompt emphasis without actual value reasoning will look pressure-sensitive to this report.
  (d) **Cells with N < 3 are excluded** — see FR-004, FR-006, FR-021.
  (e) **Excluded vignettes are counted, not silenced** — see FR-018.
  (f) **Banding intentionally averages across opponent pressure** — Direction Δ, Conviction Δ, and netScore Δ collapse the 2D grid to a 1D summary by mean-aggregating each band over opponent levels. This can mask interactions where a model becomes more (or less) firm specifically when opponent pressure is high. The per-pair 2D heat map (FR-011) is the only place these interactions remain visible; the panel MUST link to it.
  (g) **Aggregate sensitivity is unweighted by coverage** — `mean(|netScore Δ|)` across pairs treats a model measured on three highly elastic pairs as more sensitive than a model measured on twelve modestly elastic pairs. The cross-model summary (FR-009) shows the pair count alongside the aggregate; the limitations panel MUST also state this explicitly so readers do not over-rank thin-coverage models.
- **FR-015:** System MUST surface every displayed metric's plain-English definition and formula on the page (tooltip or inline expander acceptable). Every Δ MUST be traceable on hover or click to the band means and counts that produced it.
- **FR-016:** System MUST handle the empty and partial-coverage states described in US-7: pipeline-pending empty state, per-model insufficient-coverage footer, per-row low-coverage warning badge.
- **FR-017:** System MUST NOT modify the existing condition analysis resolvers, `ConditionMatrix`, or the `Coherence` metric introduced by `models-consistency-report`. The new aggregation is additive.
- **FR-017a:** **Run-scope filter.** The new aggregation MUST follow the same run-scope boundary used by `models-consistency.ts`: include only runs with `status = 'COMPLETED'`, `deletedAt IS NULL`, and the `AGGREGATE` analysis tag (or the equivalent canonical filter the consistency report uses). Any other run state MUST be excluded silently from the aggregation; no transcripts from other runs may enter the (own × opponent) grid.
- **FR-018:** System MUST exclude vignettes that cannot be aggregated and account for the exclusion reason via a **raw-definition validation pass** that runs against each Definition's raw `content` BEFORE label normalization erases the signal. The pass produces a per-Definition `exclusion_reason` value drawn from this enumeration (mutually exclusive; first match wins, evaluated top-to-bottom):
  (a) **legacy single-dimension content** — definition uses `values[]` with no `dimensions[].levels[]` structure (sensitivity requires two pressure dimensions);
  (b) **missing or empty `levels[]`** — definition has `dimensions[]` but no usable level scores;
  (c) **out-of-range or non-integer scores** — definition has scores outside 1–5 or non-integer scores (e.g. 0, 6, 1.5);
  (d) **unrecognized scenario labels** — scenario dimension value does not exact-match any known label/score in the parent definition's normalized level map (no fallback to raw label; phantom buckets are not allowed);
  (e) **map collision** — see FR-002a;
  (f) **insufficient cell coverage** — every (own × opponent) cell has N < 3 (this reason is decided after aggregation, not in the raw-definition pass; the pass marks the Definition as eligible and the aggregator decides (f) post-bucket);
  (g) **missing or self-referential value-pair tokens** — `Definition.content.components.value_first.token` or `value_second.token` is missing, non-string, or `value_first.token === value_second.token` (self-pair, ambiguous own/opponent assignment). This reason is decided in the same raw-definition pass as (a)-(e).
  (h) **mixed-content disagreement** — `normalizeScenarioAnalysisMetadata` returned null for a scenario because `content.dimensions` and `content.dimension_values` disagree on the same dimension (one says "moderate", the other says 4 — and they don't reconcile). Affected scenarios are excluded under this reason rather than silently treated as empty-dimension records. The resolver MUST track per-scenario counts.
  Distinguishing (a) from (b) requires inspecting both `dimensions` and `values` content paths; using only `getLevelNormalizationMap`'s empty-map signal is not sufficient. The validation pass MUST persist the per-Definition exclusion reason alongside the aggregated counts so the "excluded" footer can later cite it without re-deriving from sanitized records.
- **FR-019:** System MUST handle `scenario.orientationFlipped = true` correctly. The `6 - score` rule in `cloud/apps/api/src/services/analysis/aggregate/aggregate-helpers.ts` operates on the model's **response score** (the 1-5 response scale that maps to prioritized/deprioritized/neutral via `buildValueOutcomes`), NOT on input pressure level scores. The new aggregation MUST therefore:
  (a) Use the existing `buildValueOutcomes` helper (or its canonical equivalent) so the prioritized/deprioritized/neutral classification is computed correctly for flipped scenarios — never re-implement this logic with raw response scores;
  (b) Determine the dimension-to-value mapping from `Definition.content.components.value_first.token` / `value_second.token`, which is stable across flipped and non-flipped scenarios. In other words: `orientationFlipped` does NOT affect which scenario dimension corresponds to which value's pressure level. It only affects how the response score is interpreted as a vote.
  (c) Apply NO transformation (`6 - score` or otherwise) to pressure level scores derived from scenario dimension values. Pressure level scores enter the (own × opponent) grid as-is once mapped via FR-002b.
- **FR-020:** System MUST validate that level scores from each Definition are integers in 1–5 before using them. Vignettes whose Definition declares scores outside this range MUST be excluded under FR-018 reason (c). The validation MUST run once per Definition during aggregation, not per transcript.
- **FR-021:** Direction Δ, Conviction Δ, and netScore Δ MUST require **at least one populated cell in each band** (low band: own_level_score ≤ 2, qualifying per N ≥ 3; high band: own_level_score ≥ 4, qualifying per N ≥ 3). If either band has zero qualifying cells, Δ is undefined; do not fall back to diagonal endpoints or impute. The "diagonal-only populated grid" edge case is resolved by this rule: if a band has no qualifying cell, Δ is undefined regardless of what the other cells contain.
- **FR-022:** **Data source — raw transcripts, no pooling.** The existing AGGREGATE analysis output (`perScenario`, `perPair`, etc., as parsed by `buildParsedModelData` in `models-consistency.ts`) is **summarized** and does not carry the per-transcript pressure-level data needed for the (own × opponent) grid. The new aggregation MUST therefore source from **raw transcripts** filtered per FR-017a. Each transcript is one observation; N = transcript count per cell, NOT scenario count. This matches the prevailing analytics semantic across `aggregate-transcript-builder.ts`, `domain-analysis-aggregation.ts`, and `domain-coverage.test.ts`, which all count duplicate transcripts as separate trials. The "repeated runs are pooled before counting" tooltip text in `ModelValueDetailDrawer.tsx` does NOT reflect what the analytics pipeline actually computes; this report aligns with the pipeline, not the tooltip. Re-running the same scenario for the same model is allowed to inflate N — that is the existing convention. Per-transcript canonicalization MUST go through `resolveTranscriptDecisionModel` (per plan Decision 4) before the canonical direction is used.
- **FR-023:** **Refusal and unknown direction handling.** Transcripts whose canonical direction is `refusal` or `unknown` (per `aggregate-helpers.ts` `buildCanonicalValueOutcomes` and `canonicalConditionSummary.ts` `unknownCount`) MUST be excluded from N, win rate, conviction, and netScore for the cell — they are not "neutral". The aggregation MUST track an `unscored_count` per cell (refusals + unknowns) and surface the total per `(model, value pair)` in the per-model detail view (a small inline indicator next to N), so a high refusal rate is not silently treated as low coverage.
- **FR-024:** **Value pair canonicalization and own/opponent assignment.** The unit of analysis in this report is the **value pair**, not the individual value. Where the product goal text refers to "values that move under pressure" (Q2), it is shorthand for "value pairs that move under pressure"; the per-model detail view (FR-010) and the cross-value heat map (FR-012) are both **per-pair**, not per-value. There is no per-value rollup in v1.

  Pair identity is the canonical key `[token_a, token_b].sort().join('::')` derived from `Definition.content.components.value_first.token` and `value_second.token`. Mirrored definitions (e.g., `Power -> Achievement` and `Achievement -> Power`) collapse to the same value pair bucket and their transcripts are pooled together at the value-pair level.

  Within a value pair, "own" and "opponent" are assigned **per pair** by alphabetical tie-break of the two tokens: `own = sorted_tokens[0]`, `opponent = sorted_tokens[1]`. This is a deterministic convention, not a user-selectable target — the user does not pick "own" in v1. For each scenario the resolver looks up the Definition's `dimensions[]` entry whose `name` matches the own token; that entry's level score is the row coordinate, the other dimension's level score is the column coordinate. If a scenario's parent Definition lists `own` as `value_second` (i.e., the Definition's narrative ordering puts own second), the dimension-to-value mapping is still resolved by token name, NOT by `value_first`/`value_second` position — the position-based alphabetical convention only governs which token is "own" within the pair.

  Value pairs that cannot be canonicalized (missing tokens, non-string tokens, self-pair) are excluded under FR-018 reason (g).

  Mirror coverage edge case: when one Definition in a mirror pair (e.g., `Power -> Achievement`) is excluded under FR-018 but its mirror (`Achievement -> Power`) is not, the value-pair bucket retains the included Definition's transcripts and reports the exclusion under the same pair's count of excluded Definitions; coverage counts MUST cite "Definitions measured / Definitions excluded" rather than "Definitions total" so partial-mirror coverage is visible.

---

## Success Criteria

- **SC-001:** A researcher reading the report for the first time can answer the four product-goal questions in under 60 seconds of scan time.
- **SC-002:** Every numeric value on the page is traceable to a formula and to raw counts in three or fewer interactions.
- **SC-003:** No existing Models-tab test passes become failures; the existing `cross-domain Stability` and `Consistency` views are unchanged.
- **SC-004:** The report renders in under 2 seconds with the full current model roster once analysis data is in cache.
- **SC-005:** A user opening the report before coverage exists sees the empty state, not a broken chart or a chart of zeroes.
- **SC-006:** On-page copy for every metric reads at high-school level (Flesch-Kincaid grade 10 or below) and the exact formula appears on the page.
- **SC-007:** The Directional Sanity Check reports a number; if it shows < 70% positive direction, the report still renders without misleading the reader (limitations panel and on-page note explain).

---

## Non-Goals

- Adding or changing models, vignettes, value pairs, or domains.
- Statistical machinery: confidence intervals, variance decomposition, multiple-comparison correction, formal hypothesis testing.
- Recalibrating level labels across vignettes.
- Detecting or mitigating sycophancy or instruction-following confounds.
- Handling `options[]` alternative phrasings on `DimensionLevel` (unused in production data).
- Curve fitting, slope regression, or any analysis that assumes monotonic response to pressure.
- Multi-model side-by-side comparison view (deferred).
- Re-implementing or replacing the `Coherence` metric from `models-consistency-report`. The two reports are additive: `Coherence` is a single binary per pair; this report decomposes the response.
- Modifying or embedding `ConditionMatrix` or `PairedStabilityView`. Optional links to those existing pages are acceptable, not embedding.

---

## Open Questions

*(Do not block spec checkpoint; resolved in plan phase.)*

1. **Exact route** — `Models → Pressure Sensitivity` as a tab inside Models, or a top-level child route. To be decided alongside the existing Models nav structure.
2. **Aggregate sensitivity formula** — current spec uses `mean(|netScore Δ|)` across pairs. Alternatives: median (less sensitive to one outlier pair), or a weighted mean by N. Plan phase to confirm.
3. ~~High/low band thresholds~~ — **decided**: own_level_score ≥ 4 (high band), ≤ 2 (low band), level 3 intentionally excluded from the band split to compare extremes. FR-005 is canonical; this open question is closed.
4. **2D heat map: which metric drives the cell color by default?** — netScore Δ is the headline, but per-cell display may default to win rate. Plan phase to confirm the default and any toggle.
5. **Inline per-value spread visualization** — sparkline, mini stacked bar, or bullet chart. Plan phase to choose based on the components already in the codebase.

---

## Dependencies

- **`scenario-metadata.ts`** in `cloud/apps/api/src/services/analysis/` continues to be the canonical extractor for scenario dimension values across `dimensions`, `dimension_values`, and mixed content paths. The new aggregation reuses this rather than re-implementing extraction.
- **`getLevelNormalizationMap`** in `cloud/apps/api/src/graphql/queries/scenarios-utils.ts` is consulted for label-to-score mapping per Definition. Known gaps documented in this spec: it only reads `content.dimensions`, uses exact-match keys, and does not guard against label-vs-score collisions or out-of-range scores. The new aggregation MUST work around these gaps per FR-002, FR-002a, FR-018, FR-020.
- **Orientation flip** convention in `cloud/apps/api/src/services/analysis/aggregate/aggregate-helpers.ts` (`6 - score` rule when `orientationFlipped = true`) and the threading pattern in `cloud/apps/api/src/graphql/queries/models-consistency.ts` are reused per FR-019.
- **Decision strength buckets** (`strongly`, `somewhat`, `neutral`, `opponentSomewhat`, `opponentStrongly`) and the `netScore` formula in `canonicalConditionSummary.ts` are reused as the canonical decision representation. Win-rate denominator follows the same canonical formula (`prioritized / total` including neutral).
- **Definition content schema** continues to expose `dimensions[].levels[].score` for vignettes that follow the current pattern. Legacy `values[]` and `dimension_values` paths are recognized for exclusion accounting (FR-018) but do not contribute to the aggregation in v1.
- **GraphQL schema** for transcripts/scenarios continues to expose decision strength, scenario dimension values, and `scenario.orientationFlipped`.

---

## Code Reuse Notes (canonical references for plan phase)

| Need | Existing helper / reference |
|---|---|
| Extract scenario dimension values across `dimensions` / `dimension_values` paths | `cloud/apps/api/src/services/analysis/scenario-metadata.ts` |
| Get a Definition's level/value array (with legacy `values[]` fallback) | `getDimensionLevelsFromDefinition` in `cloud/apps/api/src/graphql/queries/scenarios-utils.ts` |
| Map label → score (raw, untrimmed) | `getLevelNormalizationMap` in `cloud/apps/api/src/graphql/queries/scenarios-utils.ts` (known gaps; see FR-002a, FR-002b(c), FR-018) — wrapped by the new adapter |
| Numeric-string normalization (`"1.0"` → 1) | `toComparableNumber` in `cloud/apps/api/src/services/analysis/scenario-metadata.ts` — currently private; export or duplicate per FR-002b(c) |
| Orientation flip (`6 - score`) | `cloud/apps/api/src/services/analysis/aggregate/aggregate-helpers.ts`; threaded through `models-consistency.ts` |
| Decision strength buckets + netScore | `cloud/apps/web/src/utils/canonicalConditionSummary.ts` |
| Win rate canonical denominator | `cloud/apps/web/src/components/models/ModelValueDetailDrawer.tsx` (uses `prioritized / total`) |
| Pattern for analogous Models-tab report (Coherence) | `cloud/apps/api/src/graphql/queries/models-consistency.ts` and the prior feature run at `docs/workflow/feature-runs/models-consistency-report/` |

---

## Glossary (canonical terms reused)

| Term | Meaning | Source |
|---|---|---|
| Level / pressure level | Integer score 1–5 on a value's intensity dimension within a vignette | `DimensionLevel.score` in Definition content |
| Own pressure | Pressure level on the value being measured | this spec |
| Opponent pressure | Pressure level on the opposing value in the pair | this spec |
| Win rate | `prioritized / (prioritized + deprioritized + neutral)` per cell | `ModelValueDetailDrawer.tsx` |
| Conviction | Mean decision strength among picks, using existing 2:1 strongly/somewhat weighting | derived from `canonicalConditionSummary.ts` |
| netScore | Existing combined metric: `(2×strongly + somewhat − 2×opponentStrongly − opponentSomewhat) / total` | `canonicalConditionSummary.ts` |
| Direction Δ | High-band mean win rate − low-band mean win rate | this spec, FR-005 |
| Conviction Δ | High-band mean conviction − low-band mean conviction | this spec, FR-005 |
| netScore Δ | High-band mean netScore − low-band mean netScore | this spec, FR-005 |
| Baseline win rate | Mean win rate at the lowest populated own-pressure level | this spec, FR-006 |
| Aggregate sensitivity | `mean(|netScore Δ|)` across a model's defined value pairs | this spec, FR-008 |

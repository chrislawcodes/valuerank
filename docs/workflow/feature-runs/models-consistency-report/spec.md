# Spec: Models Consistency Report

**Feature slug:** models-consistency-report
**Created:** 2026-04-18
**Revised:** 2026-04-19
**Status:** draft
**Path:** Feature Factory (`docs/workflow/feature-runs/models-consistency-report/`)

---

## Background

The `Models` tab today answers **"which values does each model favor, and is the pattern stable across domains?"** using the existing `cross-domain Stability` metric (variance of win rate across domains).

It does **not** answer two related questions that both AAPOR survey methodologists and AI-alignment researchers ask about any instrument and any respondent:

1. **If we ask the same question twice, does the model give the same answer?** (a within-scenario reliability question)
2. **As we ramp up the pressure to favor one value inside a vignette, does the model's response follow that pressure?** (a dose-response question)

This spec adds a new report inside the `Models` tab, named **Consistency**, that shows two metrics per model — **Repeatability** and **Coherence** — and plots them as a failure-mode map. The framing is *characterization*, not pass/fail audit: every model lands somewhere, and the location tells you what kind of inconsistency it has.

---

## Discovery: Assumptions Carried In

Discovery was completed against the prior conversation with the user. The following assumptions are carried in:

1. **Report name** is **Consistency**, lives under the existing `Models` tab alongside the current `cross-domain Stability` view.
2. **Metric 1** is named **Repeatability**. Do **not** call it "Stability" (collides with the existing Models-tab metric) or "Reliability" (too jargon-y). Alternatives (Steadiness, Same-Answer Rate, Self-Agreement, Stickiness) may be revisited in plan phase.
3. **Metric 2** is named **Coherence**. No collision with existing vocabulary.
4. **Repeatability** reuses `baselineReliability` per scenario from `analysisSemantics.reliability.ts`, but the **model-level value is computed fresh** using random-effects meta-analysis (see FR-004). We do not display the naive coverage-weighted pool.
5. **Coherence pressure scale**: for each `(model, value pair)`, we flatten the existing 2D condition grid to a 1D "net pressure" rank defined as `(appeal of target value) − (appeal of opposing value)` for each condition. We compute Spearman rank correlation ρ between net pressure rank and win rate across conditions. A pair counts as **coherent** if ρ ≥ 0.8 **and** the correlation's p-value is < 0.05. `Coherence(model) = (coherent pairs) / (total pairs tested)`.
6. **Confidence intervals** for Repeatability use **random-effects meta-analysis**: compute per-scenario Wilson 95% CIs, then combine using DerSimonian-Laird pooling to account for between-scenario variance (τ²). The final ± reflects both within-scenario sampling error and between-scenario heterogeneity. Coherence does not carry a ± in v1 (it is itself a proportion over a small number of pairs; the per-pair ρ and p are shown directly in drill-down).
7. **Failure-mode map**: main view is a scatter, x = Repeatability, y = Coherence, one dot per model, color = provider, size = n scenarios measured. Quadrant lines at **Repeatability = 0.85** (midpoint of Landis & Koch substantial-to-almost-perfect) and **Coherence = 0.80** (conventional psychometric floor). Region labels in plain English:
   - **Reliable & follows pressure** (high / high)
   - **Follows pressure but jittery** (low / high)
   - **Steady but doesn't follow pressure** (high / low)
   - **Neither steady nor responsive** (low / low)
8. **Drill-down — summary + links, not embeds**: the ConditionMatrix and PairedStabilityView components are not embedded or modified. Instead the report computes summary chips (per-pair ρ with coherent ✓/✗; same/flipped/noisy proportions for order effects) and provides **"View condition matrix →"** / **"View transcripts →"** links that open the existing components on their current pages.
9. **Progressive disclosure**: every summary number on the report page exposes its intermediate calculations. Click or hover opens a tooltip/panel stack that lets a reader trace any number back to the formula and raw counts it was computed from (see FR-015).
10. **On-page copy** uses high-school English. The **exact formula** for each metric appears on the page, not only in a methods appendix.
11. **Primary audiences**: AAPOR survey methodologists and AI-alignment researchers. **Secondary**: ACM reviewers, moral-psychology researchers, AI policy/governance analysts.
12. **Data scope**: current 8-model roster, 270 definitions, 3 domains. No new data collection. Report depends on `AGGREGATE`-analysis pipeline being populated across definitions (user fixing in parallel).

---

## Product Goal

The `Consistency` report should let a researcher quickly answer:

1. **Which models answer the same question the same way across trials?**
2. **Which models respond lawfully to increasing pressure inside a vignette?**
3. **What type of inconsistency — noise, rigidity, or both — characterizes each model?**

All three should be answerable in under 30 seconds of scan time, with progressive drill-down available for any model that looks surprising.

---

## User Stories

### US-1 — See the failure-mode map at a glance (P1)

As an AAPOR or alignment researcher, I want one scatter plot that shows every model's Repeatability against its Coherence so I can see the distribution of failure modes across the whole field.

**Why this priority:** The scatter IS the headline finding.

**Independent test:** Open the report; a scatter renders with dots for every model with sufficient coverage; quadrant lines and region labels are visible without hover.

**Acceptance scenarios:**

1. **Given** I open `Models → Consistency`, **when** the page loads, **then** I see a scatter with Repeatability on x, Coherence on y, one dot per model, color-coded by provider.
2. **Given** the scatter is visible, **when** I look without interacting, **then** I see quadrant lines at 0.85 / 0.80 and the four region labels in plain English.
3. **Given** a model has insufficient coverage, **when** the scatter renders, **then** that model appears in an "Insufficient coverage" footer with the specific reason, not silently dropped.

### US-2 — See each metric spelled out with its equation and intermediate math (P1)

As a researcher who will cite this report, I want every metric's plain-English definition, exact formula, and intermediate calculations available on the page itself.

**Why this priority:** Credibility bar for both audiences. Reviewers reject reports that hide the math.

**Independent test:** Every displayed number has a progressive-disclosure path to its formula and raw counts (see FR-015).

**Acceptance scenarios:**

1. **Given** I hover or click the Repeatability column header, **when** the info opens, **then** I see a plain-English definition, the per-scenario Wilson formula, and the random-effects pooling formula.
2. **Given** I hover or click the Coherence column header, **when** the info opens, **then** I see the definition, the net-pressure formula, the Spearman threshold, and the aggregation.
3. **Given** any `± X%` value on Repeatability, **when** I hover, **then** I see that it is a random-effects CI and the within/between components are shown separately.
4. **Given** I am reading the copy, **when** I read it aloud, **then** it reads at or below US high-school level.

### US-3 — Rank and compare models in a table (P1)

As a researcher, I want a table under the scatter listing every model with Repeatability ± CI, Coherence, and coverage counts, sortable by any column.

**Acceptance scenarios:**

1. **Given** the report is open, **when** I scroll below the scatter, **then** I see a table with columns: Model, Provider, Repeatability ± CI, Coherence (with coherent-pair fraction), n scenarios measured, n coherent pairs / total.
2. **Given** the table is visible, **when** I click a column header, **then** the table sorts by that column, ascending then descending on subsequent clicks.
3. **Given** the table is sorted, **when** I click a row, **then** the per-model drill-down opens.

### US-4 — Drill down to diagnose why a model sits where it does (P1)

As a researcher who sees a model in an unexpected quadrant, I want to click in and see per-domain, per-pair, and order-effect summaries with links out to the existing detail tools.

**Why this priority:** The diagnosis is the finding. Without drill-down the map is just a picture.

**Acceptance scenarios:**

1. **Given** I click a dot or row, **when** the drill-down opens, **then** I see (a) headline with model name, region label, and one-line plain-English explanation, (b) Repeatability per domain (Job / Neighborhood / Software) with its own ± CI, (c) per-pair Coherence chips showing ρ, p-value, and coherent ✓/✗, (d) an order-effect summary (same / flipped / noisy proportions).
2. **Given** the per-domain panel is visible, **when** one domain is materially different from the others, **then** it is flagged visually.
3. **Given** a per-pair Coherence chip is visible, **when** I click or hover, **then** I see the per-condition win-rate progression, and a **"View condition matrix →"** link that opens the existing ConditionMatrix page for that definition.
4. **Given** the order-effect summary is visible, **when** I click it, **then** I see a **"View transcripts →"** link that opens the existing PairedStabilityView page.

### US-5 — Filter by domain, provider, and coverage (P2)

As a researcher focusing on one domain or provider, I want to filter the scatter and table without leaving the page.

**Acceptance scenarios:**

1. **Given** the report is open, **when** I change the Domain filter, **then** the scatter and table recompute using only that domain's runs.
2. **Given** the Min n filter is set, **when** the scatter renders, **then** models below that threshold move to the "Insufficient coverage" footer.
3. **Given** the Provider filter is set, **when** the scatter renders, **then** only matching models appear.

### US-6 — Understand empty states and coverage gaps (P2)

As a user opening the report before the aggregation pipeline has caught up, I want clear messaging about what's missing.

**Acceptance scenarios:**

1. **Given** no models have `AGGREGATE`-eligible coverage, **when** the report loads, **then** an empty state names the pipeline dependency and suggests when to retry.
2. **Given** some models have coverage and some don't, **when** the report loads, **then** the scatter shows the covered ones and the footer lists the rest with reasons.
3. **Given** a model has low but non-zero coverage, **when** its row renders, **then** a warning badge indicates the CI is wider than usual.
4. **Given** the pipeline emits an `invalid-summary-shape` error for a model, **when** the row renders, **then** it is shown distinctly from simple low-coverage cases so malformed data is not silently mislabeled.

### US-7 — Copy-ready methodology block (P3)

As a researcher writing a paper, I want a copy-paste methodology block describing exactly how Repeatability, Coherence, and CIs are computed, with citations.

**Acceptance scenario:**

1. **Given** I click "Copy methodology", **when** I paste into a doc, **then** I see a well-formed paragraph with definitions, formulas, thresholds, and citations (Landis & Koch, DerSimonian-Laird, Wilson).

---

## Edge Cases

- **Model with only one run's worth of repeat coverage:** CI will be wide. Show with a coverage warning badge; do not hide.
- **Model with 0 `AGGREGATE`-eligible scenarios:** list in "Insufficient coverage" footer with "No repeat coverage available."
- **Value pair where Spearman ρ is unstable** (small n, or ρ's p-value > 0.05): mark the pair as `indeterminate` (gray) rather than coherent or not, and exclude from both numerator and denominator of Coherence. Do not rely on a flat "n < 3" cutoff — use p-value instead.
- **All models in the same quadrant:** the map is still useful. Show the scatter with an annotation calling out the homogeneity explicitly.
- **Order-reversed pair missing for a scenario:** order-effect summary shows "n/a" for that pair, not zero.
- **Domain filter or provider filter with no matches:** show explanatory empty state.
- **Refresh during pipeline backfill:** report reads from existing analysis JSON; stale reads are acceptable. This report does not trigger re-computation.
- **`invalid-summary-shape` payload from the pipeline:** surface as a distinct row state, separate from no-repeat-coverage, so corruption is visible.
- **2D condition grid is irregular** (not every `(row, col)` has scenarios): compute net-pressure rank over the conditions that exist; do not impute missing cells.

---

## Functional Requirements

- **FR-001:** System MUST render a Consistency report at a new route under the `Models` tab (exact route TBD in plan phase).
- **FR-002:** System MUST compute **per-scenario Repeatability** using the existing `baselineReliability` definition from `analysisSemantics.reliability.ts` as an input, treating per-scenario match/total counts as the Bernoulli data.
- **FR-003:** System MUST compute **Coherence** per `(model, value pair)`:
  (a) Assign each condition a `net_pressure = (appeal of target value) − (appeal of opposing value)` using the canonical condition-grid appeal levels;
  (b) Compute Spearman rank correlation ρ between `net_pressure` rank and condition win rate across all conditions in the pair;
  (c) The pair is **coherent** if ρ ≥ 0.8 AND p < 0.05;
  (d) `Coherence(model) = (coherent pairs) / (determinate pairs)`, where `determinate` excludes pairs with insufficient data to compute a p-value.
- **FR-004:** System MUST compute **model-level Repeatability ± CI** using random-effects meta-analysis:
  (a) Compute per-scenario Wilson 95% CI from clean `(matches, trials)` counts;
  (b) Estimate between-scenario variance τ² using DerSimonian-Laird;
  (c) Combine with inverse-variance weighted mean and random-effects variance to produce a model-level 95% CI that reflects both within- and between-scenario uncertainty;
  (d) Display both the within-scenario and between-scenario components separately in the Level-2 tooltip (see FR-015).
- **FR-005:** System MUST render a scatter with Repeatability on x (0.5–1.0), Coherence on y (0.0–1.0), one dot per model, color = provider, size = n scenarios measured.
- **FR-006:** System MUST draw quadrant lines at Repeatability = 0.85 and Coherence = 0.80, with region labels visible without interaction.
- **FR-007:** System MUST render a sortable table below the scatter with columns: Model, Provider, Repeatability ± CI, Coherence (as `k / n pairs coherent`), n scenarios measured.
- **FR-008:** System MUST provide a drill-down per model showing: (a) headline with region label and plain-English explanation; (b) Repeatability per domain (Job / Neighborhood / Software) with its own random-effects CI; (c) per-pair Coherence chips with ρ, p-value, coherent ✓/✗; (d) order-effect summary (same / flipped / noisy proportions). Drill-down MUST include links to `ConditionMatrix` and `PairedStabilityView` pages; it MUST NOT embed or modify those components.
- **FR-009:** System MUST expose filters for Domain, Provider, and Min n (number of scenarios measured).
- **FR-010:** System MUST render plain-English on-page copy for each metric that includes (a) a high-school-level explanation and (b) the exact formula. Tooltip/expandable placement is acceptable; the content must be on the page.
- **FR-011:** System MUST render an empty state when no models have sufficient coverage, and MUST surface `invalid-summary-shape` pipeline errors as a state distinct from low-coverage.
- **FR-012:** System MUST NOT modify or rename the existing Models-tab `cross-domain Stability` metric or its terminology.
- **FR-013:** System MUST use the word "Repeatability" (not "Stability", not "Reliability") for Metric 1 in all user-visible copy, unless the plan phase explicitly chooses an alternative from the discovery list.
- **FR-014:** System MUST treat `AGGREGATE`-eligible analysis availability as a data dependency; the report must render correctly once the pipeline is populated without triggering re-computation.
- **FR-015:** System MUST provide **progressive disclosure** for every summary number. Hover or click MUST expose a tooltip/panel stack with:
  (a) **Level 2** — the metric's plain-English definition, the aggregation formula, and separated intermediate components (e.g. within-scenario vs. between-scenario variance for Repeatability; coherent-pair fraction and representative ρ-distribution summary for Coherence);
  (b) **Level 3** — a table of the underlying per-scenario or per-pair values that rolled up into the summary (each row showing its own n, statistic, and confidence or p-value);
  (c) **Level 4** — for any Level-3 row, a plain-English "we asked this question N times; the model matched K times" drilldown with the per-row formula written out and a link to the source transcripts.
  No summary number on the report page should be a black box.

---

## Success Criteria

- **SC-001:** A researcher reading the report for the first time can describe each model's failure mode in under 30 seconds.
- **SC-002:** On-page copy for every metric passes a high-school-reading-level check (Flesch-Kincaid grade 10 or below).
- **SC-003:** Every numeric value on the page is traceable to a formula and to raw counts within three clicks (see FR-015).
- **SC-004:** No existing Models-tab test passes become failures; the existing `cross-domain Stability` UI is byte-for-byte unchanged.
- **SC-005:** The report renders in under 2 seconds with the full current model roster, once analysis JSON is in the client cache.
- **SC-006:** Users hitting the report while the `AGGREGATE` pipeline is still backfilling see the pipeline-pending empty state, not a broken chart.
- **SC-007:** For any displayed number, a user can click through to the exact formula and the intermediate values it was computed from, within three clicks.

---

## Non-Goals

- Adding or changing models, vignettes, or domains.
- Rewriting or renaming the existing Models-tab `cross-domain Stability` metric.
- Implementing the alternative within-model transitivity definition of Coherence (we commit to the net-pressure / Spearman approach).
- Modifying or embedding `ConditionMatrix` or `PairedStabilityView` — the report links to them in their existing form.
- Building the `Similarity` (B2) or `Disagreement` (B3) reports — separate features.
- Debugging the `AGGREGATE`-analysis pipeline backfill — tracked separately.
- Bootstrap CI for Repeatability (possible v2 upgrade if reviewers push back on random-effects).
- Publishing a methods paper — downstream of this UI.

---

## Open Questions

*(Do not block spec checkpoint; resolved in plan phase.)*

1. **Final name for Metric 1** — default `Repeatability`. Alternatives: `Steadiness`, `Same-Answer Rate`, `Self-Agreement`, `Stickiness`.
2. **Quadrant line values** — defaults 0.85 / 0.80. May be tuned once aggregated data is visible across all 270 definitions.
3. **Routing** — nest under existing `Models` tab vs. new top-level `Models → Consistency` route.
4. **Net-pressure definition of appeal levels** — we assume the existing canonical condition grid's `strongly / somewhat / neutral / opponentSomewhat / opponentStrongly` labels can be mapped to integer pressure levels. Plan phase must confirm the exact mapping (e.g. `+2 / +1 / 0 / −1 / −2`) and how to handle scenarios that deviate from this 5-point canonical grid.

---

## Dependencies

- **Analysis pipeline** emits `AGGREGATE`-typed analyses populated with per-scenario `baselineReliability` counts across the relevant definitions.
- **`baselineReliability`** semantics in `analysisSemantics.reliability.ts` continue to expose per-scenario match/total counts (or a direct field can be added — see Open Question — but this report needs *some* path to per-scenario Bernoulli counts).
- **`ConditionMatrix`** page at `cloud/apps/web/src/components/domains/ConditionMatrix.tsx` continues to render correctly in its current form; we link to it.
- **`PairedStabilityView`** at `cloud/apps/web/src/pages/PairedStabilityView.tsx` continues to render correctly; we link to it.
- **Canonical condition labels** from `canonicalConditionSummary.ts` provide the appeal-level ordering used to compute net pressure.

---

## Glossary (canonical terms reused)

| Term | Meaning | Source |
|---|---|---|
| Stability (existing) | Cross-domain consistency of a value's win rate across domains (MAD of win rate) | `stabilityDots.ts` |
| baselineReliability | Within-scenario test-retest agreement rate per analysis | `analysisSemantics.reliability.ts` |
| Win rate | `prioritized / (prioritized + deprioritized + neutral)` per condition | `ModelValueDetailDrawer.tsx` |
| Condition | One cell in a vignette's 2D pressure grid with canonical appeal-level labels | `canonicalConditionSummary.ts` |
| Net pressure | `(target value appeal level) − (opposing value appeal level)` per condition | new (defined in FR-003) |
| Definition / vignette | One value-pair tension narrative | repo-wide |

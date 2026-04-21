# Spec: Circumplex Report

**Feature slug:** circumplex-report
**Created:** 2026-04-20
**Status:** draft
**Path:** Feature Factory (`docs/workflow/feature-runs/circumplex-report/`)

---

## Background

Schwartz's theory of basic human values claims that the 10 values form a **circumplex** — a circular motivational continuum where adjacent values are compatible and opposite values conflict. This factor structure was validated on decades of Likert-rating survey data (Schwartz 1992; Schwartz et al. 2012).

Our existing `Models / Matrix` and `Models / Consistency` pages describe *what* each LLM prioritizes and *how consistent* its choices are. Neither asks whether LLMs themselves exhibit the circumplex structure — whether human-centered Schwartz theory transfers to LLM forced-choice behavior.

An early cross-model test (N=11, population-level) returned Spearman ρ ≈ +0.01 between theoretical circular distance and empirical correlation. Population-level, the circumplex does **not** hold. Notably, Conformity and Tradition — adjacent Conservation values that humans correlate ~+0.5 on — correlated **−0.81** in our LLM population. This is plausibly an RLHF-shaped rupture of the Conservation factor.

That result was based on a tiny sample of models-as-respondents. The deeper question is whether **each individual model** exhibits the circumplex internally, computed from its own pairwise-preference behavior. That is the question this report answers.

This spec adds a third report under the `Models` tab, named **Circumplex**, that lets a researcher pick one or more eligible models and see, for each, whether the model's pairwise choices form a circumplex.

---

## Discovery: Assumptions Carried In

Three discovery questions were asked and answered:

1. **Correlation unit: Option A (value-profile correlation).** For each value V, its "profile" is the vector of V's win rates against each of the other 9 values. The 10×10 similarity matrix is the Pearson correlation of these profiles across values. This measures *structural similarity* — do two values have similar "enemies and friends" across the rest of the value space — which is the methodologically correct test for circumplex structure. The alternative (direct dominance, Option B) answers a different question (head-to-head matchup) and is not suitable for a circumplex test.

2. **Data extraction: pool across all pressure conditions.** Our data has a 5×5 pressure grid per value pair (~25 conditions × ~3 trials each ≈ 75 trials per pair). For the circumplex test, pool all trials across all conditions. The symmetric grid causes pressure-asymmetry effects to cancel on average, and pooling gives ~75 trials per pair for stable correlations. A separate "circumplex under pressure" analysis (diagonal-only / equal-pressure) is deliberately **deferred** as follow-up.

3. **Verdict format: show both the numeric statistic and a cutoff band (Option C).** Display the raw Spearman ρ to 2 decimal places, its p-value to 3 decimal places, and a plain-language label based on fixed cutoffs (`ρ ≤ −0.5` → "Clear"; `−0.5 < ρ ≤ −0.2` → "Partial"; `ρ > −0.2` → "Not evident"). Power-users read the numbers; casual readers read the label. The verdict band is removable later if it proves unhelpful.

Additional assumptions carried in:

4. **Nav placement:** `Models` dropdown → `Circumplex`, alongside existing `Matrix` and `Consistency` items. Pattern matches the existing Models-tab nav convention.

5. **Signature scope:** single signature at a time (default `vnewtd`), honored via `?signature=...` URL parameter; signature dropdown reuses the pattern from Consistency.

6. **Eligibility filter:** a model qualifies if it has at least **N trials per Schwartz value** (default N = 5, UI-configurable), pooled across all pairs and conditions, for the selected signature. At our ~75-trials-per-pair × 9-pairs-per-value baseline, N=5 is effectively a "has-any-data" filter; it admits all production models with basic coverage. The threshold exists to gracefully handle partially-covered models rather than to aggressively prune.

7. **Data scope:** same 11-model production roster, 4 domains, `vnewtd` signature. No new data collection. Resolver reads from the already-populated aggregate analysis pipeline.

8. **Primary audiences:** AAPOR survey methodologists (response to the "you didn't validate factor structure" critique), moral-psychology researchers (novel empirical result on LLM value structure), and AI-alignment researchers (RLHF-shaping evidence). **Secondary:** ACM reviewers.

9. **Methodology explanation is required on-page.** Option A is a novel application to LLM forced-choice behavior, and the value-profile framing is not obvious. The page MUST include a collapsible "Details" section explaining the methodology in plain language with a worked example.

---

## Product Goal

The `Circumplex` report should let a researcher answer:

1. **Does this specific LLM exhibit the Schwartz circumplex structure in its own pairwise-preference behavior?**
2. **How closely do this model's empirical value positions match the theoretical circular order?**
3. **How do different models compare on circumplex fit?**

All three should be answerable in under 60 seconds of scanning, with progressive drill-down available for any model's detailed correlation matrix and methodology.

---

## User Stories

### US-1 — Pick models and see per-model circumplex fit (P1)

As a researcher, I want to pick one or more LLM models with sufficient data and see, for each, whether the model's pairwise-preference behavior forms a Schwartz circumplex, so I can answer whether human value theory transfers to LLM choice behavior.

**Why this priority:** This is the headline question the report exists to answer.

**Independent test:** Navigate to `/models/circumplex`, select at least one eligible model, and see that model's 10×10 value-profile correlation matrix, Spearman ρ statistic, p-value, and verdict label render correctly.

**Acceptance scenarios:**

1. **Given** I open `Models → Circumplex`, **when** the page loads, **then** I see a model picker populated only with models that meet the eligibility threshold for the current signature.
2. **Given** I select one eligible model, **when** the results render, **then** I see: (a) a 10×10 correlation matrix in Schwartz's canonical circular order, color-coded by correlation strength; (b) a Spearman ρ displayed to 2 decimal places; (c) a p-value displayed to 3 decimal places; (d) a verdict label ("Clear circumplex structure," "Partial circumplex structure," or "Circumplex not evident").
3. **Given** I select a model that has data for fewer than all 10 values OR has any value with fewer than N trials, **when** the picker loads, **then** that model is hidden from the picker by default and its absence is explained in a small footer ("N models hidden due to insufficient data").
4. **Given** an eligibility threshold slider, **when** I change N, **then** the picker re-filters and the displayed results update immediately.

### US-2 — Understand the methodology via an on-page Details section (P1)

As an AAPOR-style reviewer or a researcher who will cite this report, I want the methodology explained on the page itself, so I can evaluate whether the measure is defensible without reading an external methods appendix.

**Why this priority:** Novel application to LLMs; we cannot assume readers know what value-profile correlation is. Without an on-page explanation the report fails credibility review.

**Independent test:** Open the report, locate a Details section, and verify it contains (a) plain-language explanation of structural vs direct-dominance framing; (b) a worked example with concrete numbers; (c) a citation to Schwartz 2012 noting this is a novel application to LLM forced-choice behavior.

**Acceptance scenarios:**

1. **Given** the report is open, **when** I look for methodology, **then** a clearly-labeled collapsible section (e.g., "How this is computed" / "Methodology details") is visible and expandable.
2. **Given** I expand that section, **then** I see a plain-English explanation of: (a) what a value profile is; (b) why we correlate profiles instead of direct win rates; (c) a worked example (Universalism vs Benevolence: they can tie head-to-head yet still be structurally similar); (d) a citation to Schwartz 2012 and a note that this is a novel application to LLM forced-choice data.
3. **Given** the section is expanded, **when** I re-load the page or share the URL, **then** its open/closed state is preserved via a URL parameter (e.g., `?methodology=open`). URL state is required (over localStorage) so researchers sharing a link land on the same view their collaborator saw.

### US-3 — Visualize the empirical vs theoretical structure with MDS (P2)

As a researcher, I want a visual representation of how closely the empirical value arrangement matches the theoretical circle, so I can see *where* the circumplex breaks (not just *whether*).

**Why this priority:** The numeric ρ answers yes/no; the visualization answers *how*. Important for the "Conformity ↔ Tradition" type findings where the departure is localized rather than uniform.

**Independent test:** Select one eligible model, locate the MDS scatter beneath the matrix, and verify the 10 values are plotted with their theoretical circular positions overlaid as a dotted reference circle.

**Acceptance scenarios:**

1. **Given** I select a model, **when** the results render, **then** a 2D classical-MDS scatter renders alongside the correlation matrix, with the 10 values plotted as labeled dots.
2. **Given** the scatter is visible, **when** I look for theoretical context, **then** a dotted reference circle shows where each value *would* sit if the circumplex held exactly, and the empirical dots can be compared to their theoretical positions.
3. **Given** a value's empirical position is far from its theoretical position, **when** I hover (or focus) the empirical dot, **then** a tooltip shows its theoretical position, its empirical position, and how far off-axis it is.

### US-4 — Compare multiple models side-by-side (P3)

As a researcher, I want to pick several models at once and see their circumplex results laid out for direct comparison, so I can identify which models preserve the circumplex vs which break it.

**Why this priority:** Individual-model results are interpretable in isolation; a comparison view is additional polish for researchers who want cross-model patterns.

**Independent test:** Select two or more eligible models; verify each model's matrix + MDS + statistics render in a grid or repeating layout.

**Acceptance scenarios:**

1. **Given** I have multiple eligible models selected, **when** the results render, **then** each model's circumplex panel (matrix + MDS + statistics + verdict) appears in a repeating layout (grid or stacked).
2. **Given** the comparison layout, **when** I scan across models, **then** ρ values and verdict labels are visually aligned so they can be compared without hunting.

---

## Functional Requirements

### Data and resolver

- **FR-001**: System MUST expose a new GraphQL query `circumplexAnalysis(modelIds: [ID!]!, signature: String!, minTrialsPerValue: Int)` that returns, for each requested model, the 10 Schwartz values' pairwise win rates pooled across all pressure conditions and domains for the given signature. **Data-sourcing note:** the existing `modelsAnalysis` query aggregates at the snapshot/domain level (equal-weighted per vignette) and does not expose pairwise trial counts. The plan phase MUST decide between (a) a new resolver that computes pairwise stats directly from transcripts (mirroring the approach used for `reliabilitySummary.perPair` in the Consistency pipeline), (b) a new materialized aggregate computed alongside existing analysis, or (c) reuse of the domain-averaged data with an explicit methodology caveat. The spec is agnostic between these — the plan picks.
- **FR-002**: The resolver MUST operate on the 10 refined-Schwartz value keys currently used throughout ValueRank: `Self_Direction_Action`, `Stimulation`, `Hedonism`, `Achievement`, `Power_Dominance`, `Security_Personal`, `Conformity_Interpersonal`, `Tradition`, `Benevolence_Dependability`, `Universalism_Nature`. This is the subset of the 19 refined values that ValueRank currently measures (see `cloud/apps/web/src/data/domainAnalysisData.ts` `VALUE_LABELS`). The canonical circular order for the report is this sequence; documentation in a new `docs/schwartz-canonical-order.md` (created during implementation) MUST note that this is a ValueRank-specific 10-value subset of the 19-value refined model and cite Schwartz 2012 for the circular structure.
- **FR-003**: For each `(model, valueA, valueB)` ordered pair, the resolver MUST return `{ winRate: Float, trials: Int, neutrals: Int }` where `winRate = prioritized_A / (prioritized_A + prioritized_B + neutral)` pooled across all conditions and trials. This matches the canonical `winRate` definition in `docs/canonical-glossary.md`; neutral outcomes are included in the denominator so pairwise win rates are directly comparable to the rest of ValueRank. The methodology section MUST note that neutral outcomes pull paired win rates toward 0.5 and therefore compress the profile-correlation signal, but that correlations are scale-invariant so circumplex structure is still detectable.
- **FR-004**: For each model the resolver MUST return the per-value trial count `{ valueKey, trials }` so the eligibility filter can be evaluated client-side.
- **FR-005**: The resolver MUST return every requested model exactly once, including models with zero trials for the selected signature (returned with `trials = 0` for every value). The client is the single source of truth for applying the eligibility filter. For the "N models hidden" footer count: the client requests the full roster of model IDs from a separate existing query (`llmModels`), and the `circumplexAnalysis` resolver returns only data for those requested IDs. `totalHiddenModels` (see Key Entities) is computed client-side as `roster.length − eligible.length`; it is NOT computed server-side. Remove `totalHiddenModels` from any server-side response shape — it appears only as a derived client-side value.
- **FR-006**: The resolver MUST honor soft-delete on upstream Prisma queries (`deletedAt: null`).
- **FR-007**: The new query module MUST be placed in `cloud/apps/api/src/graphql/queries/` and registered via the existing `autoImportDir` mechanism; manual edits to `queries/index.ts` are not required and SHOULD NOT be added.

### Eligibility and filtering

- **FR-008**: A model is **eligible** if it has at least `minTrialsPerValue` trials on every one of the 10 Schwartz values for the selected signature (default `minTrialsPerValue = 5`, UI-configurable).
- **FR-009**: The UI MUST show an eligibility-threshold control that defaults to 5 and allows adjustment (slider or number input).
- **FR-010**: When the threshold changes, the model picker MUST re-filter without a full page reload.
- **FR-011**: Ineligible models MUST NOT appear in the picker dropdown. The page MUST show a small note stating how many models are hidden at the current threshold.
- **FR-011a**: Selection-recovery: when the eligible model list changes (threshold change, signature change, back/forward navigation), if a currently-selected model becomes ineligible the UI MUST drop it from the selected set and, if the selected set becomes empty, auto-select the first eligible model. This matches the existing `ModelsConsistency.tsx` selection pattern so stale URL state does not strand the page on a blank result. When a model is silently dropped, the UI MUST display a transient notice (e.g., "1 model removed: Gemini 2.5 Flash fell below the n=5 threshold") that persists until dismissed or until the selection changes again. Eligible-model sort order MUST be deterministic: alphabetical by `modelLabel` ascending, so auto-selection and URL-backed navigation are reproducible.
- **FR-011b**: Per-pair coverage handling: even when a model passes the per-value eligibility filter, individual pairwise cells may have zero or very-low trial counts (e.g., a value-pair that was never tested in the available domains). The UI MUST visually flag cells with `trials < 20` (e.g., hatched background or a small "n=3" badge) and the resolver MUST return per-pair trial counts so the UI can compute this. A value's profile MUST be excluded from the Pearson profile correlation and MDS input when **either** (a) fewer than 6 of its 9 pair cells are determinate (< ⅔ coverage), OR (b) any determinate cell has `trials < 20`. The 6-cell floor is chosen so a profile Pearson correlation has at least 6 paired observations — sufficient for a non-degenerate r statistic without carrying catastrophically wide CIs. Exclusions MUST be surfaced in `excludedValues` (see Key Entities) and noted in the verdict panel.

### Circumplex computation

- **FR-012**: For each selected model, the system MUST compute a 10×10 **value-profile correlation matrix** where:
  - For each value V, its profile vector is `[winRate(V over O) for O in the other 9 values]`.
  - Cell (i, j) of the correlation matrix is `pearson_r(profile_i, profile_j)` across the 9-dimensional profiles, aligned by common opponents.
  - The matrix MUST use the canonical Schwartz circular order (FR-002).
- **FR-013**: For each selected model, the system MUST compute a Spearman ρ and p-value between:
  - The theoretical circular distance of each value pair (1 through 5 steps around the 10-value circle), and
  - The empirical profile correlation of that pair (from FR-012).
- **FR-014**: The system MUST compute a 2D classical-MDS projection of the 10 values from the correlation matrix (distance = 1 − correlation), returning (x, y) coordinates per value.

### Display

- **FR-015**: Main view URL MUST be `/models/circumplex`, listed in the Models top-nav dropdown alongside Matrix and Consistency.
- **FR-016**: The page MUST show a signature dropdown defaulting to `vnewtd` and honoring `?signature=<sig>` URL parameter. **Signature source:** the existing `domainAvailableSignatures` query is domain-scoped and cannot serve a domain-less report. The plan phase MUST either (a) add a new `globalAvailableSignatures` query that enumerates all signatures present in the aggregate analysis layer, or (b) use the union across all existing domains for the initial ship with a note that domain-specific signature gaps may appear. Spec is agnostic between these.
- **FR-017**: The page MUST show a multi-select model picker filtered by eligibility (FR-008 through FR-011).
- **FR-018**: For each selected model, the page MUST render a card containing:
  - Model label and provider (provider sourced from the existing `LlmModel.providerName` field; the `CircumplexResult` MUST include `providerName` in its GraphQL schema)
  - 10×10 correlation matrix rendered as a heatmap, values in canonical circular order, labeled using the existing `VALUE_LABELS` map from `cloud/apps/web/src/data/domainAnalysisData.ts`. The actual labels produced by that map are: "Self-Direction", "Stimulation", "Hedonism", "Achievement", "Power", "Security", "Conformity", "Tradition", "Benevolence", "Universalism". Implementation MUST read these from the map rather than re-listing them, so label drift cannot happen.
  - Numeric Spearman ρ (2 decimal places) and p-value (3 decimal places)
  - Verdict label based on fixed cutoffs: `ρ ≤ −0.5` → "Clear circumplex structure"; `−0.5 < ρ ≤ −0.2` → "Partial circumplex structure"; `ρ > −0.2` → "Circumplex not evident"
  - 2D MDS scatter with empirical dots and a dotted theoretical-circle reference
  - MDS stress value (sum of squared residuals normalized by input-distance magnitude, or equivalent goodness-of-fit number), displayed with a short explainer so non-experts can assess how much the 2D projection distorts the correlation structure
- **FR-018a**: Failure / loading states — the page MUST use the shared `ErrorMessage` and `Loading` components (as used by `ModelsConsistency` and `Models`) to surface GraphQL errors and in-flight queries. A specific error state MUST exist for "signature has no data" (empty result set), distinct from "query failed" (network/schema error).
- **FR-019**: The page MUST include a collapsible "Methodology" (or "How this is computed") section that contains:
  - Plain-language explanation of structural similarity vs direct dominance
  - A worked example (Universalism vs Benevolence: tie head-to-head yet structurally similar via shared profiles)
  - A citation to Schwartz et al. 2012 (with DOI) and an explicit note that this is a novel application to LLM forced-choice data, not a validated measure
- **FR-020**: When multiple models are selected, their per-model cards MUST render in a grid or stacked layout such that matrix, MDS, and statistics are visually aligned for cross-model scanning.

### Guardrails

- **FR-021**: Labeling rules — **two-layer convention**:
  - **Prose, section headings, and tooltips** MUST use the canonical full Schwartz names from `docs/values-summary.md` (e.g., "Universalism — Nature", "Benevolence — Dependability", "Power — Dominance", "Conformity — Interpersonal", "Security — Personal", "Self-Direction — Action"). No invented nicknames anywhere.
  - **Matrix headers, axis ticks, and other tight-space labels** MUST use the existing short-label mapping already shipped in `cloud/apps/web/src/data/domainAnalysisData.ts` (`VALUE_LABELS`). Actual map entries (authoritative): `Self-Direction`, `Stimulation`, `Hedonism`, `Achievement`, `Power`, `Security`, `Conformity`, `Tradition`, `Benevolence`, `Universalism`. This spec SHOULD NOT introduce a competing short-label set. Implementation MUST read labels from the map at render time, not hard-code them, so any future refinement of the map propagates automatically.
  - **Scope note:** the file `cloud/apps/web/src/data/domainAnalysisData.ts` contains both stable exports (`VALUE_KEYS`, `VALUE_LABELS`, `VALUE_DESCRIPTIONS`) and a temporary static data export (`DOMAIN_ANALYSIS_MODELS`, marked "TODO: Replace with API-backed data"). This spec depends ONLY on the stable label exports, not on the static data. The deprecation TODO does not affect our dependency.
  - A dedicated `docs/schwartz-canonical-order.md` (or equivalent section added to `docs/canonical-glossary.md`) MUST be created during implementation to document: (a) the canonical circular order used in FR-002, (b) a pointer to `VALUE_LABELS` as the label source, (c) the theoretical angle for each value (`i × 36°`). This doc becomes the single source of truth referenced by both the resolver and the UI.
- **FR-022**: Higher-order family names (Self-Transcendence, Conservation, Self-Enhancement, Openness to Change) SHOULD appear in the methodology section to explain the circumplex structure but are NOT used as value labels in the matrix or MDS plot — those use the 10 individual value names per FR-021.
- **FR-023**: The report MUST NOT frame results as pass/fail model evaluation. The verdict band is descriptive ("Clear / Partial / Not evident"), not evaluative ("Good / Bad").
- **FR-024**: File size caps per `cloud/CLAUDE.md` MUST be respected: prod files warn at 400, error at 700; test files warn at 800, error at 1200.

---

## Success Criteria

- **SC-001**: A researcher can navigate `Models → Circumplex`, pick a model, and see the full result (matrix + MDS + ρ + p-value + verdict + methodology link) in under 10 seconds of interaction.
- **SC-002**: The methodology Details section is visible on the page without navigation to another screen.
- **SC-003**: Researchers can change the eligibility threshold and see the picker re-filter in under 1 second.
- **SC-004**: At the default threshold (N=5), at least 8 of our 11 production models qualify for the report.
- **SC-005**: No UI claim or label implies the measure is validated. All language frames the measure as a novel application to LLM forced-choice behavior.

---

## Edge Cases

- **Zero eligible models at current threshold** → page shows an empty state ("No models meet the current threshold") with a suggestion to lower the threshold; the slider remains interactive.
- **Model has partial coverage (< 10 values)** → model is ineligible at the default threshold; appears in the hidden-models footer count but not in the picker.
- **Selected model becomes ineligible when threshold is raised** → the model is removed from the results grid; a note explains it is now below threshold.
- **Fewer than 3 pressure conditions per pair on some pair** → treat the pair as having however many trials exist; include if trial count meets threshold, flag low-count pairs visually in the matrix (e.g., small "n<20" badge in the cell).
- **Degenerate profile (all ties, zero variance)** → correlation is undefined; render as "—" with a hover note; Spearman ρ computation MUST exclude affected pairs and report the exclusion count in the methodology section. If fewer than 30 pairs remain (out of 45), the ρ/p display MUST show "insufficient determinate pairs" rather than a suspect number.
- **Two values have identical profiles** → correlation = 1.0; show as dark green in the matrix; no special handling.
- **MDS cannot embed cleanly (negative eigenvalues or high stress)** → classical MDS on `1 − correlation` can produce negative eigenvalues when the correlation structure is not Euclidean. If the first two eigenvalues combined explain < 50% of the total absolute eigenvalue sum, the MDS scatter MUST be replaced with a warning panel ("2D embedding does not cleanly represent this model's correlation structure — see the matrix for the full picture"). Fall back to showing only the matrix + ρ/p + verdict; do not attempt a misleading 2D projection.
- **Value excluded from MDS due to undefined profile** → that value's dot is omitted from the MDS scatter and its absence is annotated in the plot legend (e.g., "1 value excluded: [name] — insufficient data").
- **No signature data at all for the selected signature** → page shows an empty state for the signature, links back to the signature dropdown.
- **Browser back/forward with multiple models selected** → selected models SHOULD persist via URL parameters (e.g., `?models=claude,gpt-5.1`). If a selected model becomes ineligible at the current threshold on reload, it is dropped silently and a note logs the drop.

---

## Key Entities

**CircumplexResult** (per model, per signature)
- `modelId`, `modelLabel`, `providerName` — `providerName` sourced from `LlmModel.providerName` upstream
- `signature`
- `valueOrder: [ValueKey!]` — canonical circular order used
- `profileCorrelationMatrix: [[Float!]!]!` — 10×10, aligned to valueOrder. Cells with insufficient determinate pair support return `null` instead of a spurious value
- `pairTrialCounts: [[Int!]!]!` — 10×10, aligned to valueOrder. Supports the per-pair coverage flagging required by FR-011b
- `excludedValues: [ValueKey!]` — values excluded from profile correlation / MDS due to insufficient pair coverage
- `spearmanRho: Float` — circular-distance vs correlation, nullable if too few determinate pairs remain
- `spearmanP: Float` — nullable for the same reason
- `verdictBand: "clear" | "partial" | "not_evident" | "insufficient_data"`
- `mds2d: [{ valueKey, x, y, theoreticalAngleDeg }]` — excluded values omitted
- `mdsStress: Float` — goodness-of-fit metric for the 2D projection
- `mdsWarning: String` — null when MDS embeds cleanly; non-null short message when the embedding is poor (first two eigenvalues < 50% of total absolute eigenvalue sum)
- `trialsPerValue: [{ valueKey, trials }]` — for eligibility check

**CircumplexAnalysisResult** (top-level query payload)
- `signature`
- `requestedModels: [CircumplexResult!]!` — one per requested modelId
- `eligibilityThreshold: Int` — echo of input
  - Note: `totalHiddenModels` is NOT a server-returned field. It is computed client-side using the full model roster from the existing `llmModels` query and the eligibility filter.

---

## Assumptions

- Classical (metric) MDS is sufficient; no need for non-metric MDS given the interpretability of correlation-based distance.
- Spearman ρ is preferred over Pearson r for the circular-distance test because the "theoretical distance" axis is ordinal (1-5 integer steps).
- P-values for Spearman ρ on 45 pairs will be computed via the standard t-approximation rather than a permutation test; this is a first-ship simplification. A note in the methodology section should acknowledge this.
- When `minTrialsPerValue` is very loose (e.g., 5), some models may still produce noisy correlations. The report does not visually flag "low-statistical-power" models beyond the threshold slider; future work could add per-cell confidence indicators.
- The "theoretical angle" for each value on the MDS reference circle is `i × 36°` for the i-th value in canonical order (0° through 324°).

---

## Residual Risks (acknowledged, not blocking)

The following risks were surfaced during adversarial review and are accepted as known limitations of the v1 report. The methodology section MUST name them explicitly so readers can assess the measure for themselves.

- **Verdict cutoffs are editorial, not psychometric.** The bands (`ρ ≤ −0.5` "Clear" etc.) are chosen for readability. The methodology section MUST state that researchers should rely on the raw ρ and p-value rather than the band, and that the cutoffs have no normative basis in the circumplex literature.
- **Pooling across pressure conditions can wash out condition-specific structure.** A model may exhibit circumplex structure at neutral pressure and break under heavy appeal (or vice versa). This report only tests the pooled structure. A follow-up "circumplex under pressure" analysis is explicitly out of scope (see Non-goals).
- **Spearman p-values assume independence across the 45 pairs, which does not hold.** Every profile shares the same 9 opponents with every other profile, so pairwise correlations are not truly independent. Reported p-values may look more certain than the data warrants. The methodology MUST acknowledge this and recommend treating significance as directional, not definitive. A permutation-based p-value is noted as future work.
- **Novel methodology carries interpretation risk.** The value-profile correlation approach is novel to LLM forced-choice behavior. Researchers unfamiliar with psychometric circumplex methods may misread the matrix as direct win-rate data. The methodology section MUST include the worked example and the "structural vs direct" framing; success depends on this being clearly explained.
- **Visualization library is not pinned in the spec.** The plan phase MUST select and document the charting library (e.g., recharts, visx, or d3) before implementation. Inline-SVG hand-rolled visualization is acceptable for both the matrix heatmap and the MDS scatter if the existing library set doesn't offer clean primitives.

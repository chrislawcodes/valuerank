# Spec: Pressure Sensitivity Table Redesign v2

**Feature slug:** sensitivity-table-redesign-v2
**Created:** 2026-04-29
**Status:** draft
**Path:** Feature Factory (`docs/workflow/feature-runs/sensitivity-table-redesign-v2/`)

---

## Background

Pressure Sensitivity v1 shipped in PR #778, with a hotfix in PR #780. It replaced older aggregate pressure metrics with a clearer `Win rate Delta` table, but post-deploy smoke testing surfaced a methodology problem: the headline high-band pool mixed three different kinds of cells.

The v1 high-band pool included:

1. **Directional cells:** first value at full pressure and second value at negligible pressure.
2. **Tied cells:** both values at full pressure.
3. **Inverted cells:** first value at heavy pressure and second value at full pressure.

Pooling those cells diluted the directional signal. The shipped headline showed 7 of 10 frontier models with negative `Win rate Delta`, implying models resisted directed pressure. That is almost certainly not the correct interpretation.

This v2 redesign replaces the headline metric with **Pressure response**. It compares two mirrored directional pools and subtracts them, so each value pair's baseline preference cancels out.

---

## Discovery: Assumptions Carried In

Discovery is complete because the methodology is locked by the handoff. The following decisions are carried into this spec:

1. **Drop refusals from the denominator and footnote the rate.** Refusals are rare on the canonical signature: about 21 refusals out of about 113,000 trials across 10 frontier models (<0.02%). The worst single model observed was DeepSeek Reasoner at 12 refusals out of about 11,300 trials (0.11%).
2. **Use the 6-cell directional pool and 5-cell diagonal baseline.** Directional pools use label membership, not integer distance. Labels are ordinal and are not treated as evenly spaced.
3. **Drop the v1 binary `responsive: X/Y` tag and do not apply a multiple-comparisons correction.** The report shows effect sizes instead of significance-based classifications.
4. **Use range notation for cross-model spread, not plus/minus notation.** The cross-model range is dispersion across value pairs, not a confidence interval.
5. **Use an atomic GraphQL removal.** Remove v1 fields in lockstep with the v2 fields. Do not keep a compatibility layer.
6. **Treat v1 artifacts as templates only.** Do not edit the v1 workflow folder.

Sensitivity validation is recorded in `sensitivity-check-results.md`.

---

## Product Goal

The Pressure Sensitivity report should let a researcher answer one question quickly:

**How much does the prompt's direction move each model's choices, after accounting for the model's underlying value preference?**

The report should:

- Use a headline metric in percentage points.
- Separate directional response from baseline preference.
- Show per-pair trial-level uncertainty.
- Show cross-model spread as a range across pairs.
- Avoid binary "responsive" labels that invite overclaiming.

---

## User Stories

### US-1 — View Cross-Model Pressure Response (P1)

As a researcher, I want the top table to rank models by Pressure response so I can see which models are most moved by directional prompt pressure.

**Independent test:** Open `/models/pressure-sensitivity`. The cross-model table has two columns: Model and Pressure response. Rows are sorted by `pressureResponseSummary.mean` descending, then model name ascending.

**Acceptance scenarios:**

1. **Given** the report loads, **when** I look at the cross-model summary, **then** I see one data column labeled "Pressure response".
2. **Given** a model has a measured response, **when** I read the cell, **then** I see the mean response in pp plus the text `range across this model's pairs: [min, max]`.
3. **Given** a model has a negative mean response, **when** the cell renders, **then** it uses `text-red-700` and a leading `▼` glyph.
4. **Given** I click a model row, **when** the detail table updates, **then** the selected model's per-pair rows are shown.

### US-2 — Drill Into Per-Pair Detail (P1)

As a researcher, I want to inspect one model's value pairs so I can see whether the headline response is broad or driven by a few pairs.

**Acceptance scenarios:**

1. **Given** a selected model, **when** the per-pair table loads, **then** it shows columns for Value pair, Baseline, Push toward first, Push toward other, Pressure response, and Trials.
2. **Given** a pair has a defined response, **when** I read its Pressure response cell, **then** I see a signed pp value with a 95% trial-level CI.
3. **Given** a pair has a missing directional pool, **when** I read its Pressure response cell, **then** I see `—` with a reason-specific hover message.
4. **Given** I click a row, **when** the drilldown opens, **then** the existing 5x5 pressure grid still renders for that pair.

### US-3 — Understand The Metrics Through Tooltips (P1)

As a researcher, I want header tooltips that explain each column in plain language.

**Acceptance scenarios:**

1. **Given** I hover or keyboard-focus a header info trigger, **when** the tooltip opens, **then** it explains the metric and its units.
2. **Given** I inspect the Pressure response tooltip, **when** I read it, **then** it explains that push-toward-first minus push-toward-other cancels baseline preference.
3. **Given** I inspect the Trials tooltip, **when** I read it, **then** it says refusals, unparseable responses, and unused cells are excluded.

### US-4 — See Trial-Level Uncertainty (P2)

As a researcher, I want per-pair CIs so I can tell whether a surprising pair is well supported by trials.

**Acceptance scenarios:**

1. **Given** a pair has both directional pools, **when** the Pressure response cell renders, **then** it shows a 95% Newcombe diff-of-proportions CI.
2. **Given** the baseline rate is shown, **when** I inspect it, **then** it is a point estimate only in the table. Endpoint CI may be available in hover copy.
3. **Given** I read the cross-model table, **when** I see the range annotation, **then** it is labeled as a range across pairs, not as a CI.

---

## Edge Cases

- **Directional pool missing:** `pressureResponse.value` is null and `reason = 'directional-thin'`. The row shows `—` for response.
- **Mirror pool missing:** `pressureResponse.value` is null and `reason = 'inverted-thin'`.
- **Both directional pools missing:** `reason = 'directional-and-inverted-thin'`.
- **Baseline pool missing:** `baselineRate` is null and `reason = 'baseline-thin'` only when the response is otherwise computable. The response can still be defined.
- **Baseline measurable but one directional pool missing:** the pair stays visible in the per-pair table. `baselineRate` may render normally, `pressureResponse.value` renders `—`, and the pair does not contribute to cross-model `mean`, `rangeMin`, `rangeMax`, or `pairsMeasured`.
- **Directional response measurable but baseline missing:** the pair stays visible. `pressureResponse.value` renders normally, `baselineRate` renders `—`, and the pair contributes to cross-model summary because the headline metric is defined.
- **All pools thin:** all rates are null, `qualifyingTrials = 0`, and the reason explains the directional failure.
- **Multiple thin reasons apply:** directional reasons take precedence over baseline-only reasons. `baseline-thin` is used only when both directional pools are present and the diagonal baseline pool is missing. When both directional pools are missing, use `directional-and-inverted-thin` even if baseline is also thin.
- **Negative response:** render red plus `▼`, never color alone.
- **All-zero responses:** cross-model sort falls back to model name; per-pair sort falls back to pair label.
- **Undefined response sort:** undefined rows sort to the bottom.
- **Boundary proportions:** Newcombe/Wilson math handles 0% and 100% pools without division-by-zero.
- **Exact zero response:** render as neutral `0 pp` with no up/down glyph and no red styling.
- **Baseline does not aggregate cleanly across pairs:** it appears only in per-pair detail.
- **Low refusal rate:** refusals stay excluded from denominators and are described in methods/limitations copy.
- **Transcript cap:** v1 diagnostic carve-out stays intact and remains user-visible through a report-level warning when `transcriptCapHit` is true.
- **Source-run collision:** v1 log warning carve-out stays intact. Collision resolution remains deterministic last-write-wins over the resolver's stable source-run ordering.
- **No measured pairs for a model:** the model stays in the existing `insufficient[]` footer rather than the ranked `models[]` table. If a summary object is constructed internally for tests, `mean`, `rangeMin`, and `rangeMax` are null and `pairsMeasured = 0`.
- **One measured pair for a model:** `pressureResponseSummary.mean`, `rangeMin`, and `rangeMax` all equal the single measured pair's response.

---

## Functional Requirements

- **FR-001:** The cross-model summary MUST render exactly two columns: Model and Pressure response.
- **FR-002:** The cross-model summary MUST sort by `pressureResponseSummary.mean` descending, with model label ascending as the tie-breaker. Models with no measured pairs remain in the existing `insufficient[]` footer rather than the ranked `models[]` array.
- **FR-003:** A cross-model Pressure response cell MUST render `{mean} pp · range across this model's pairs: [{rangeMin}, {rangeMax}]`.
- **FR-004:** Cross-model range fields MUST be computed from per-pair Pressure response values as `min` and `max`. They MUST NOT be labeled or formatted as a confidence interval. When a model has no measured pairs, `mean`, `rangeMin`, and `rangeMax` MUST all be null. When a model has one measured pair, `rangeMin` and `rangeMax` MUST both equal that pair's response.
- **FR-005:** Cross-model mean MUST be an equal-weight arithmetic mean of measured per-pair Pressure responses.
- **FR-006:** Cross-model summary MUST expose `pairsMeasured`, the count of pairs with defined Pressure response.
- **FR-007:** Per-pair detail MUST render Value pair, Baseline, Push toward first, Push toward other, Pressure response, and Trials.
- **FR-008:** Per-pair default sort MUST be absolute Pressure response descending, with pair label ascending as the tie-breaker. Rows with null response sort to the bottom.
- **FR-009:** Per-pair pair labels MUST use explicit first/second fields, e.g. `Honesty ↔ Privacy`, because the directional pools depend on which value is first. The source of truth for first/second is the stable canonical pair ordering used by `canonicalValuePairKey`, not whichever order a particular vignette happened to present.
- **FR-009a:** Backend implementation MUST map every condition into that canonical first/second coordinate before pooling. Reverse-ordered vignettes may share one canonical pair row only if their condition levels are transformed into the same first/second coordinate. The implementation MUST NOT mix untransformed `A -> B` and `B -> A` conditions in the same directional pool.
- **FR-009b:** The per-pair GraphQL shape MUST add explicit fields named `firstValueToken`, `firstValueLabel`, `secondValueToken`, and `secondValueLabel`. These fields are the canonical first/second order from `canonicalValuePairKey`. Labels MUST use the same contract as `cloud/apps/web/src/utils/displayLabels.ts`: convert the token to string, replace underscores with spaces, and trim. If existing `ownToken` / `opponentToken` remain in the response, they MUST be documented and implemented as aliases of `firstValueToken` / `secondValueToken`; otherwise the v2 frontend MUST stop requesting them. The per-pair table, pressure grid label, and cross-value map MUST use the explicit first/second fields for display.
- **FR-010:** Pressure levels MUST be selected by label membership. The implementation may map labels to existing numeric levels, but it MUST NOT use integer distance as the metric definition.
- **FR-011:** Directional pool MUST include qualifying cells where first value pressure is heavy/full and second value pressure is negligible/low/moderate.
- **FR-012:** Mirror pool MUST include qualifying cells where second value pressure is heavy/full and first value pressure is negligible/low/moderate.
- **FR-013:** Baseline pool MUST include diagonal cells where both values use the same pressure label.
- **FR-014:** A cell qualifies for a pool only when `n >= MIN_N`, where `MIN_N` remains the v1 threshold of 3.
- **FR-015:** Pool win rate MUST be `sum(successes) / sum(n)` over qualifying cells, not the mean of cell win rates.
- **FR-016:** Per-pair Pressure response MUST be `pushTowardFirstRate - pushTowardSecondRate`.
- **FR-017:** Per-pair CI MUST use the existing Newcombe Method-10 diff-of-proportions helper on the two pooled binomial proportions.
- **FR-018:** Baseline appears as a point estimate in the per-pair table. It MUST NOT be averaged into a cross-model baseline headline.
- **FR-019:** Per-pair `pressureResponse.qualifyingTrials` MUST equal the sum of `n` across qualifying cells used in any displayed win-rate pool: baseline, directional, or mirror. A baseline cell contributes only when it qualifies with `n >= MIN_N`; when `baselineRate` is null, no baseline cells contribute to `qualifyingTrials`. This number is the total scored-trial support behind the row's displayed win-rate columns, not the denominator of the Pressure response CI alone. The CI denominator remains the two directional pools only.
- **FR-019a:** The per-pair detail table MUST render the Trials column from `pressureResponse.qualifyingTrials`. It MUST NOT render the legacy pair-level `n` field in that column. The pair-level raw scored trial count `n` MUST remain available as a secondary coverage signal and MUST be shown in row hover/detail copy as `{qualifyingTrials} of {n} scored trials used` when the two counts differ.
- **FR-019b:** Trials tooltip copy MUST explicitly say the count includes the Baseline, Push toward first, and Push toward other pools, and that the Pressure response CI uses only the two directional pools.
- **FR-020:** If `pressureResponse.value` is null, the frontend MUST render `—` with hover text mapped from `reason`. Copy MUST match `docs/workflow/feature-runs/sensitivity-table-redesign-v2/reason-copy.md`.
- **FR-021:** Reason values MUST be exactly: `'directional-thin'`, `'inverted-thin'`, `'baseline-thin'`, `'directional-and-inverted-thin'`, or null. Precedence MUST be: both directional pools missing -> `'directional-and-inverted-thin'`; directional pool missing -> `'directional-thin'`; mirror pool missing -> `'inverted-thin'`; only baseline pool missing -> `'baseline-thin'`; otherwise null.
- **FR-022:** Negative Pressure response values MUST render with `text-red-700` plus a leading `▼` glyph.
- **FR-022a:** Exact zero Pressure response MUST render as neutral `0 pp` with no leading glyph. Positive values may render without a glyph; negative values require `▼`.
- **FR-023:** The GraphQL schema MUST remove per-pair `winRateDelta` and top-level per-pair `qualifyingTrials` from v1 and add per-pair `pressureResponse`.
- **FR-024:** The GraphQL schema MUST remove per-model `winRateDeltaSummary` and `pairsPositive` from v1 and add per-model `pressureResponseSummary`.
- **FR-025:** `PressureResponse` MUST expose `value`, `ciLow`, `ciHigh`, `baselineRate`, `pushTowardFirstRate`, `pushTowardSecondRate`, `qualifyingTrials`, and `reason`.
- **FR-026:** `PressureResponseSummary` MUST expose `mean`, `rangeMin`, `rangeMax`, and `pairsMeasured`. `mean`, `rangeMin`, and `rangeMax` MUST be nullable floats; `pairsMeasured` MUST be a non-null integer.
- **FR-027:** The frontend GraphQL operation and generated types MUST use only the v2 fields after codegen.
- **FR-028:** The cross-value map MUST read signed `pair.pressureResponse.value` and label the metric as Pressure response. It MUST preserve direction instead of taking `Math.abs`, because negative response is meaningful in v2. Legend, color scale, cell title, and accessible label copy MUST be updated from absolute `Win rate Delta` wording to signed Pressure response wording. Visual encoding MUST be sign-aware in the cell fill itself: positive values use the positive side of a diverging scale, negative values use the negative side, and zero uses a neutral style. Cell title text MUST include the signed value, e.g. `Pressure response: -12 pp`.
- **FR-029:** The sanity check panel MUST read Pressure response values, not v1 `winRateDelta` fields. The `directionalSanityCheck.breakdown[]` payload MUST rename its numeric delta field to `pressureResponse` or an equivalent non-v1 name so final grep finds no `winRateDelta` references. Classification thresholds can remain the v1 `Delta > 0.02` thresholds, but user-facing labels must say Pressure response.
- **FR-030:** The page intro and limitations panel MUST describe Pressure response and include the cell-selection sensitivity disclosure.
- **FR-031:** Existing v1 carve-outs MUST remain intact: `transcriptCapHit`, `source_run_collision` log warning behavior, refusal exclusion, insufficient coverage surfaces, and the 5x5 pressure grid. `source_run_collision` remains a structured server log warning only; adding a user-facing GraphQL warning field is out of scope for v2.
- **FR-031a:** When `transcriptCapHit` is true, the frontend MUST render the existing report-level coverage warning before the tables so users do not read truncated results as authoritative.
- **FR-031b:** Source-run collision resolution MUST remain deterministic. The resolver MUST preserve stable source-run ordering before applying last-write-wins behavior, and tests or code review MUST verify that ordering is not removed.
- **FR-031c:** If a transcript reaches pressure-sensitivity analysis but cannot be mapped into a scored pressure condition, the resolver MUST increment a concrete top-level field named `pressureConditionExcludedCount: Int!`. This field is the authoritative total for pre-cell pressure-condition exclusions and replaces user-facing reliance on `excludedScenariosCount` for this report. Counting precedence is: unscored/refusal outcomes increment the existing unscored/refusal path and do NOT increment pressure-condition exclusions; for scored outcomes, the resolver MUST increment exactly one breakdown bucket for each drop branch. Buckets are: `sourceRunMapping` when `sourceRunToDefId.get(...)` returns null, `definitionMetadata` when `definitionMeta.get(...)` returns null, `missingScenario` when `scenario == null`, `invalidMetadata` when `normalizeScenarioAnalysisMetadata(...) === null`, and `levelAssignment` when `assignOwnOpponentLevels(...) === null`. The resolver MUST also expose `pressureConditionExclusionBreakdown: { sourceRunMapping: Int!, definitionMetadata: Int!, missingScenario: Int!, invalidMetadata: Int!, levelAssignment: Int! }`, and `pressureConditionExcludedCount` MUST equal the sum of that breakdown. The frontend MUST surface `pressureConditionExcludedCount` in the existing coverage/limitations area when nonzero using the copy: `Pressure-condition exclusions: {count} transcripts could not be mapped into the pressure grid and were excluded before scoring.` Developer/debug copy MAY include the breakdown. The transcript MUST NOT silently disappear from every audit count.
- **FR-031c-1:** `excludedScenariosCount` MUST not be requested or rendered by the v2 frontend. If it remains in the backend schema for unrelated consumers, it is legacy and not part of the v2 pressure-condition audit story.
- **FR-031d:** The v2 frontend MUST stop requesting and rendering per-pair `definitionsExcluded`. The visible coverage footer MUST not show `definitionsExcluded: 0` or any equivalent dead zero. If a future implementation makes definition exclusion accounting accurate again, it can reintroduce that field in a separate change with tests.
- **FR-032:** Verification grep after Slice A MUST find no `winRateDelta`, `winRateDeltaSummary`, or `pairsPositive` references in backend code, packages, workers, or SDL. Final verification after Slice C MUST find zero matches across `cloud/`, including generated code.
- **FR-033:** The PR MUST NOT be opened until API SDL, web operation, generated GraphQL types, API build/tests, and web build/tests all pass from the same branch head. The PR body MUST call out that this is an atomic schema cutover and that pre-merge production smoke cannot query the v2 fields until after merge/deploy. No partial API-only or web-only rollout is allowed.

---

## Success Criteria

- **SC-001:** The cross-model table communicates which models have the largest Pressure response in under 30 seconds of scan time.
- **SC-002:** The v1 misleading `Win rate Delta` fields are fully removed from schema, resolver, operation, generated types, and UI code.
- **SC-003:** Per-pair Pressure response math is covered by unit tests for standard, thin, baseline-thin, and all-thin cases.
- **SC-004:** Cross-model summary math is covered by unit tests for empty, single-pair, and multi-pair inputs.
- **SC-005:** Frontend tests cover cross-model range annotation, negative rendering, default sorts, reason hovers, and the carve-out components.
- **SC-006:** API and web builds pass before PR creation.
- **SC-007:** PR body lists exact validation commands and explains why pre-merge production smoke cannot query the new schema before merge.
- **SC-008:** Resolver tests cover `pressureConditionExclusionBreakdown` for missing scenario, invalid metadata, and level-assignment failures, and assert the total equals the sum.
- **SC-009:** Aggregation tests cover baseline-thin, baseline-only, and mixed baseline/directional rows so baseline behavior is not only covered by UI assumptions.
- **SC-010:** Resolver tests cover `sourceRunMapping` and `definitionMetadata` pressure-condition exclusion buckets, plus the no-double-count rule for unscored/refusal outcomes.

---

## Non-Goals

- Keeping a v1 GraphQL compatibility layer.
- Reintroducing the `responsive: X/Y` summary tag.
- Applying multiple-comparisons correction.
- Changing the pressure grid drilldown behavior.
- Reworking the source-runs data model.
- Changing refusal parsing policy beyond documenting the exclusion.
- Adding Bayesian shrinkage, meta-analysis weighting, or model-level hypothesis tests.
- Writing closeout or postmortem before the human reviews and merges the PR.

---

## Open Questions

None. The v2 design is locked by the handoff.

---

## Dependencies

- Existing pressure-sensitivity resolver: `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts`.
- Existing pressure-sensitivity aggregation helpers: `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts`.
- Pothos pressure-sensitivity types: `cloud/apps/api/src/graphql/types/pressure-sensitivity.ts`.
- Web GraphQL operation: `cloud/apps/web/src/api/operations/pressureSensitivity.graphql`.
- Web components under `cloud/apps/web/src/components/models/`.
- Generated SDL: `cloud/apps/web/schema.graphql`.
- Generated web GraphQL types: `cloud/apps/web/src/generated/graphql.ts`.
- v1 workflow artifacts under `docs/workflow/feature-runs/sensitivity-table-redesign/` for structure only.

---

## Glossary

| Term | Meaning |
|---|---|
| Pressure response | Push-toward-first win rate minus push-toward-second win rate, in percentage points. |
| Directional pool | Cells where prompt pressure clearly favors the first value: first in {heavy, full}, second in {negligible, low, moderate}. |
| Mirror pool | Cells where prompt pressure clearly favors the second value: second in {heavy, full}, first in {negligible, low, moderate}. |
| Baseline | Pooled win rate from diagonal cells where both values have the same pressure label. |
| Range across pairs | Minimum and maximum measured per-pair Pressure response for one model. A dispersion statistic, not a CI. |
| Qualifying trials | Trials in cells with `n >= 3` that belong to one of the pools used by the table. |

---

## Residual Risks

1. **Cell-selection stability is limited.** Default is defensible as a middle-ground headline rule, but the sensitivity check is not proof of corpus-wide stability. Pairs near zero and pairs whose sign or magnitude changes sharply across plausible rules should be treated as uncertain. This comes directly from the sensitivity check recorded in `sensitivity-check-results.md`.

2. **Cross-model range is dispersion, not precision.** A wide range means the model behaves differently across value pairs. It does not mean the model estimate is statistically uncertain in the same sense as a confidence interval. The UI mitigates this by using explicit range wording and avoiding plus/minus notation.

3. **No multiple-comparisons correction.** The report shows about 450 per-pair CIs across models and pairs. Some intervals may look notable by chance. The mitigation is to avoid a binary "responsive" count and to frame values as effect sizes.

4. **Refusals are excluded from denominators.** The observed refusal rate is very low on the canonical signature (<0.02% overall, worst observed model 0.11%), so this should not materially bias the headline. The rate is footnoted in methods/limitations copy.

5. **Baseline can be thin while response remains defined.** A missing diagonal baseline does not invalidate the directional response. The UI must avoid implying that the response itself is missing when only `baselineRate` is null.

6. **Existing resolver data-source risks remain.** Transcript caps and source-run collisions are existing risks from v1. This feature keeps the warning surfaces and does not re-architect the data source.

7. **MIN_N remains low.** `MIN_N = 3` preserves v1 coverage behavior but individual cells at the threshold are noisy. Pooling reduces but does not erase that variance. The mitigation is to show per-pair CIs, disclose the limitation, and avoid binary responsive labels.

8. **Near-zero model ranking can look more stable than it is.** Cross-model rows are sorted by mean Pressure response, so models near 0 pp may swap order due to small changes. The range annotation and limitations copy should discourage over-reading exact rank near zero.

9. **Atomic schema removal has deployment coupling risk.** Removing v1 fields and adding v2 fields in one change can break the page if API and web deploy out of sync. This is accepted because the app is a monorepo with no external GraphQL consumers. Preflight build/codegen and CI are the mitigation.

10. **Equal-weight model means amplify sparse-pair noise.** Each measured pair contributes one observation to the model mean, regardless of how many trials supported that pair. This is intentional because the headline is a per-pair behavioral average, not a trial-weighted corpus average, but sparse outlier pairs can still move the model rank.

11. **Response can be defined when baseline is missing.** The directional subtraction does not require diagonal baseline cells, so the report can compute Pressure response while showing `—` for baseline. This is statistically valid for the response metric but weakens user interpretation of underlying preference for that pair.

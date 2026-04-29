# Implementation Plan: Pressure Sensitivity Table Redesign v2

**Branch:** `claude/sensitivity-table-redesign-v2`
**Date:** 2026-04-29
**Spec:** `docs/workflow/feature-runs/sensitivity-table-redesign-v2/spec.md`

## Summary

Replace v1 `Win rate Delta` with v2 `Pressure response`.

- Backend computes directional, mirror, and diagonal baseline pools by label membership.
- GraphQL removes v1 `winRateDelta`, `winRateDeltaSummary`, `pairsPositive`, and top-level per-pair `qualifyingTrials`.
- Web tables render a single cross-model Pressure response column and a per-pair detail table with Baseline, Push toward first, Push toward other, Pressure response, and Trials.
- Review-gate findings from Codex and the human-approved Codex fallback requirements review are carried into implementation tasks, especially exclusion accounting and atomic schema verification.

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Accepted into plan/tasks. Findings describe migration blast radius, reducer rewrite, and exclusion-audit implementation obligations now explicitly covered by FR-031c/FR-033 and success criteria; no further product-spec change needed.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: Accepted into plan/tasks. Legacy exclusion fields must be removed from v2 frontend reads, source-run collision determinism must be verified, and no-coverage partial evidence remains an accepted insufficient-footer behavior.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Human-approved Codex 5.4 Mini fallback requirements review found no HIGH/MEDIUM blockers; residual risks carried into plan.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Accepted into final plan and Slice A/B/C tasks. Findings drove explicit schema field removal, renamed sanity-check payload, fixed source-run precedence verification, no-measured-pairs coverage, and UI formatting/accessibility tests.
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: Accepted into final plan and tasks. The contradictory legacy-field compatibility path was removed; v2 pressure-sensitivity SDL now explicitly removes legacy sensitivity, audit, and orientation fields.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Accepted into final plan and tasks. Added verification for legacy exclusion removal, Trials audit copy, overlapping exclusion precedence, no-measured-pairs footer behavior, and signed accessible labels.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: Accepted after marker-format repair. Tasks checkpoint passed with Slice A/B/C marker lines recognized by the runner.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: HIGH (unreachable exclusion buckets) accepted as defense-in-depth; MEDIUM (surviving pool rate dropped) fixed in Slice A amendment; LOW findings noted.
- review: reviews/diff.codex.regression-adversarial.review.md | status: accepted | note: HIGH (unreachable exclusion buckets) accepted as defense-in-depth; MEDIUM (both rates nulled when one pool is thin) fixed in Slice A amendment.
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: HIGH (missing exclusion-bucket tests) fixed in Slice A amendment; MEDIUM (missing canonicalization test) fixed in Slice A amendment.

## Technical Context

| Area | Detail |
|---|---|
| API | Pothos GraphQL in `cloud/apps/api/src/graphql/` |
| Math | Pure helpers in `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts` |
| SDL | Emitted to `cloud/apps/web/schema.graphql` |
| Web | React + generated urql types under `cloud/apps/web/src/` |
| Codegen | `npm run codegen --workspace @valuerank/web` from `cloud/` |
| Verification | API tests/build, web codegen/tests/build, final grep for v1 field names |

## Architecture Decisions

### Decision 1: Directional pools use canonical first/second coordinates

Use canonical pair order as the stable first/second coordinate. Reverse-ordered vignettes may share a row only after their condition levels are transformed into that same canonical coordinate.

Rationale: the metric is directional. Mixing untransformed `A -> B` and `B -> A` would erase the signal.

Verification: resolver tests include a reverse-ordered fixture and assert it lands in the same pair with levels transformed correctly.

### Decision 2: Pressure response uses pooled binomial proportions

For each pool, compute `sum(successes) / sum(n)`. Do not average cell win rates.

Rationale: the Newcombe CI describes a difference of two binomial proportions, so the point estimate and CI must use the same estimand.

Verification: aggregation tests include unequal cell sizes where pooled rate differs from mean-of-cell-rates.

### Decision 3: Baseline is a per-pair detail only

Baseline uses diagonal cells and renders as a point estimate. It does not aggregate into the cross-model summary.

Rationale: first/second baseline preference is pair-specific and does not summarize cleanly across pairs.

Verification: component tests assert no baseline value appears in the cross-model summary.

### Decision 4: Exclusion audit uses one authoritative v2 count

Add `pressureConditionExcludedCount` and `pressureConditionExclusionBreakdown` for scored transcripts that cannot enter a pressure grid. Remove legacy pressure-sensitivity schema fields `excludedScenariosCount` and per-pair `definitionsExcluded` from the v2 SDL so generated client types cannot preserve the old audit story.

Rationale: v1 exclusion surfaces were fragmented and one field was a dead zero. The v2 report needs one clear audit story.

Verification: resolver tests cover every breakdown bucket and assert the total equals the sum.

### Decision 5: Atomic schema removal is gated by preflight

No compatibility layer for the v1 sensitivity metric or legacy pressure-sensitivity audit fields. Do not open the PR until API SDL, web operation, generated types, tests, and builds all pass from the same branch head.

Rationale: this is a monorepo report with no external GraphQL consumers. A compatibility layer would keep old language alive.

Verification: final grep over `cloud/` returns zero matches for `winRateDelta`, `winRateDeltaSummary`, `pairsPositive`, `excludedScenariosCount`, `definitionsExcluded`, `ownToken`, and `opponentToken`, including generated SDL/types. Top-level per-pair `qualifyingTrials` is removed; `pressureResponse.qualifyingTrials` remains required.

### Decision 6: Cross-value map becomes signed

The cross-value map reads signed `pressureResponse.value` and uses a diverging scale. It must not use `Math.abs`.

Rationale: negative response is meaningful and must not be hidden.

Verification: component test asserts negative and positive values use different signed titles/classes.

## Approved Tooltip Copy

| Header | Tooltip text |
|---|---|
| Win Rate (group) | The percentage of trials where the model picked the value. Same formula used everywhere in ValueRank: picks / (picks + non-picks + neutrals). All four columns under this header are versions of that calculation, just on different slices of the data. |
| Baseline | The model's underlying preference for this value, with no directional pressure from the prompt. Computed from cells where pressure is symmetric on both sides — the 5 diagonal cells where own and other are at the same label. In those cells the prompt has no directional advantage, so whatever the model picks reflects its own preferences. |
| Push toward first value | The model's win rate in the cells where the prompt clearly pushes toward this value: heavy or full pressure on this value, AND negligible / low / moderate pressure on the other value. 6 cells. A model that follows the prompt should have this much higher than the baseline. |
| Push toward other | The mirror. The model's win rate (still for this value) in the cells where the prompt clearly pushes toward the OTHER value. 6 cells. A model that follows the prompt should have this much lower than the baseline. |
| Pressure response (per-pair) | How much the prompt's direction moves the model. Push-toward-this minus push-toward-other, in percentage points. The model's underlying preference cancels out in the subtraction — both halves share the same baseline preference. So this number is purely about how much directional pressure shifts behavior. Positive = the prompt steers the model toward this value. Negative = the model goes against the prompt (uncommon and worth investigating). The 95% CI is trial-level uncertainty within this pair (Wilson-propagated diff of two pooled proportions). |
| Pressure response (cross-model) | The headline measure of how much the prompt's direction moves the model. For each value pair, we compute the gap between two specific situations: how often the model picks a value when the prompt clearly pushes toward it, vs. how often the model still picks it when the prompt clearly pushes the OTHER way. The model's preferences cancel in the subtraction, so this number is purely about how much the prompt's direction shifts behavior. We then average across all measured pairs. The "range across this model's pairs" annotation shows the smallest and largest per-pair values — wide range means the model behaves differently on different value pairs. |
| Trials | Total scored trials behind this row's displayed win rates. Counts trials inside the Baseline, Push toward first, and Push toward other pools that met the coverage threshold (N >= 3). The Pressure response CI uses only the two directional pools. Refusals, unparseable responses, and trials in cells we did not use are excluded. |

Formatting rule: percentage-point values in summary cells, detail cells, tooltips, titles, and accessible labels render with one decimal place and an explicit sign for positive/negative values; exact zero renders as `0.0 pp` without a sign.

Null reason hover copy lives in `docs/workflow/feature-runs/sensitivity-table-redesign-v2/reason-copy.md`.

## Implementation Slices

### Slice A — Backend math + resolver + types + SDL [CHECKPOINT]

Files:

- `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts`
- `cloud/apps/api/tests/services/pressure-sensitivity/aggregation.test.ts`
- `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts`
- `cloud/apps/api/src/graphql/types/pressure-sensitivity.ts`
- `cloud/apps/api/tests/graphql/queries/pressure-sensitivity.test.ts`
- `cloud/apps/web/schema.graphql`

Work:

- Add `pooledDirectionalReduction(grid, minN)`.
- Add `summarizePressureResponse(values)`.
- Remove obsolete v1 reducers and summary helpers.
- Add `PressureResponse` and `PressureResponseSummary` Pothos types.
- Add first/second token+label fields.
- Remove per-pair `winRateDelta` and top-level per-pair `qualifyingTrials`; `qualifyingTrials` lives only under `pressureResponse`.
- Rename `directionalSanityCheck.breakdown[].winRateDelta` to a non-v1 field such as `pressureResponse`, and update the sanity-check resolver/tests to use that name.
- Remove `ownToken` / `opponentToken` from the v2 pair shape; `firstValueToken` / `secondValueToken` are the only orientation fields.
- Add `pressureConditionExcludedCount` and breakdown fields.
- Remove existing `excludedScenariosCount` and per-pair `definitionsExcluded` from the pressure-sensitivity schema.
- Preserve `transcriptCapHit` and `source_run_collision` warning behavior.
- Keep source-run collision resolution deterministic by preserving the resolver's current run precedence: eligible runs are ordered by database `id asc`, `buildSourceRunToDefIdMap` applies last-write-wins in that run order, and source-run IDs inside a single run keep their existing config order. Add a test that shuffled eligible-run input is normalized to the same `id asc` winner and warning.
- Add a resolver test for overlapping pressure-condition exclusion branches: one scored transcript fixture must be capable of matching more than one drop path, then assert exactly one bucket increments, the bucket follows documented precedence, and `pressureConditionExcludedCount` increases by exactly 1.
- Regenerate SDL.

Verification:

```bash
cd cloud
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test?pgbouncer=true" JWT_SECRET="test-secret-that-is-at-least-32-characters-long" npm run test --workspace @valuerank/api -- pressure-sensitivity
npx turbo build --filter=@valuerank/api
grep -RE "winRateDelta|winRateDeltaSummary|pairsPositive|excludedScenariosCount|definitionsExcluded|ownToken|opponentToken|WinRateDelta|WinRateDeltaSummary" apps/api packages workers apps/web/schema.graphql --include='*.ts' --include='*.graphql'
```

The grep must return zero matches.

API GraphQL tests must execute the updated pressure-sensitivity selection against the resolver shape so SDL/codegen/build success cannot hide a runtime nullability or field-name mismatch.

### Slice B — Web operation + codegen + derived types [CHECKPOINT]

Files:

- `cloud/apps/web/src/api/operations/pressureSensitivity.graphql`
- `cloud/apps/web/src/api/operations/pressureSensitivity.ts`
- `cloud/apps/web/src/generated/graphql.ts`

Work:

- Query `pressureResponse` and `pressureResponseSummary`.
- Query first/second fields and pressure-condition exclusion fields.
- Stop querying v1 `winRateDelta`, `winRateDeltaSummary`, `pairsPositive`, top-level per-pair `qualifyingTrials`, `ownToken`, `opponentToken`, `excludedScenariosCount`, and per-pair `definitionsExcluded`.
- Regenerate web GraphQL types.

Verification:

```bash
cd cloud
npm run codegen --workspace @valuerank/web
npx turbo build --filter=@valuerank/api
grep -RE "winRateDelta|winRateDeltaSummary|pairsPositive|excludedScenariosCount|definitionsExcluded|ownToken|opponentToken|WinRateDelta|WinRateDeltaSummary" apps/web/src/api/operations apps/web/src/generated --include='*.ts' --include='*.graphql'
```

The grep must return zero matches so the operation and generated types cannot keep stale v1 sensitivity, orientation, or exclusion fields. Add a targeted generated-type or operation assertion for top-level per-pair `qualifyingTrials`, because `pressureResponse.qualifyingTrials` is still required.

### Slice C — Web components + tests [CHECKPOINT]

Files:

- `cloud/apps/web/src/components/models/PressureSensitivitySummary.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityCrossValueMap.tsx`
- `cloud/apps/web/src/components/models/PressureGrid.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivitySanityCheck.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityLimitations.tsx`
- `cloud/apps/web/src/components/models/pressureSensitivityFormatting.ts`
- `cloud/apps/web/src/pages/PressureSensitivity.tsx`
- Related component tests.

Work:

- Rebuild cross-model table as Model + Pressure response.
- Cross-model response cell format is exactly `{mean} pp · range across this model's pairs: [{rangeMin}, {rangeMax}]`; do not use CI or plus/minus notation.
- Replace legacy visible metric labels, including `Win rate Delta`, `Win rate Δ ± CI`, `Low pressure`, and `High pressure`, with the v2 labels `Pressure response`, `Baseline`, `Push toward first`, and `Push toward other`.
- Remove the existing summary sort toggle and header click handler; model rows stay sorted by Pressure response descending.
- Rebuild per-pair table with Baseline, Push toward first, Push toward other, Pressure response, Trials.
- Render Trials from `pressureResponse.qualifyingTrials`, not the legacy pair-level `n`.
- When `pressureResponse.qualifyingTrials !== n`, show the secondary audit copy `{qualifyingTrials} of {n} scored trials used` in row hover/detail copy.
- Keep the Trials tooltip aligned with the approved copy: it names Baseline, Push toward first, and Push toward other as included pools, and says the Pressure response CI uses only the two directional pools.
- Preserve row click drilldown into the existing 5x5 `PressureGrid`, and update the grid display contract to use canonical first/second labels instead of stale own/opponent display assumptions.
- Add negative red+`▼` rendering and neutral exact-zero rendering.
- Assert exact-zero summary and detail cells use neutral styling and render as `0.0 pp`, not positive or negative.
- Update signed cross-value map.
- Update sanity-check field reads and labels to use the renamed Pressure response payload, not `winRateDelta`.
- Update intro and limitations copy.
- Render pressure-condition exclusion warning when nonzero.
- Render transcript-cap warning above the report tables when `transcriptCapHit` is true.
- Render pressure-condition exclusion copy in the existing coverage/limitations area exactly as specified in the spec. If `transcriptCapHit` is true, append: `This count is a lower bound because the transcript scan was capped.`
- Preserve the no-measured-pairs footer path: models with no defined `pressureResponse` values stay in `insufficient[]`, not the ranked table, with null summary fields and `pairsMeasured = 0`.
- Update tests.

Verification:

```bash
cd cloud
npm run test --workspace @valuerank/web -- PressureSensitivity
npx turbo build --filter=@valuerank/web
grep -RE "winRateDelta|winRateDeltaSummary|pairsPositive|excludedScenariosCount|definitionsExcluded|ownToken|opponentToken|WinRateDelta|WinRateDeltaSummary" . --include='*.ts' --include='*.tsx' --include='*.graphql'
```

The legacy field grep must return zero matches across `cloud/`, including generated code.

Component tests must include a mixed-count row where `qualifyingTrials < n` and assert both the visible Trials value and `{qualifyingTrials} of {n} scored trials used` audit copy. Page-level tests must render both `transcriptCapHit` and `pressureConditionExcludedCount` and assert the exclusion warning includes the lower-bound sentence. Summary tests must assert row order is fixed descending by Pressure response and cannot be reversed by clicking the header. Aggregation or page tests must include a no-measured-pairs model and assert it renders in `insufficient[]`, not the ranked table, with null summary fields and `pairsMeasured = 0`. Cross-value map and detail-table tests must assert signed title and accessible-label text for positive, zero, and negative Pressure response values.

## Residual Risks

- **Small sensitivity sample.** The sensitivity check covers 10 sampled model/pair cases, not the full corpus.  
  **verification:** keep `sensitivity-check-results.md` in the PR and ensure limitations copy says default is a middle-ground rule, not proof of stability.

- **Sparse pairs can move equal-weight means.** Each measured pair has equal model-level weight.  
  **verification:** component tests assert the range annotation renders, and limitations copy warns that wide range means pair-to-pair variation.

- **Atomic schema cutover can break if partial.** API and web must land together.  
  **verification:** run API build, web codegen, web build, and final grep before push; list all commands in PR body.

- **Exclusion counts may double count if branch precedence is wrong.** New breakdown spans several resolver exits.  
  **verification:** resolver tests cover each bucket and an unscored/refusal case that must not increment pressure-condition exclusions.

- **Exclusion counts become lower bounds on capped scans.** When `transcriptCapHit` is true, any count derived from scanned transcripts is incomplete.  
  **verification:** page-level test renders both `transcriptCapHit` and `pressureConditionExcludedCount` and asserts the warning says the exclusion count is a lower bound.

- **Baseline-missing rows can be misread.** Response can be defined without baseline.  
  **verification:** detail tests assert `baselineRate = null` renders `—` while response still renders, and tooltip copy uses `baseline-thin` text from `reason-copy.md`.

- **Dropping `pairsPositive` removes sign-mix summary.** This is intentional per locked methodology because the binary classification count was removed.  
  **verification:** summary tests assert no `pairsPositive` or legacy sign-mix summary text appears; per-pair detail and range remain available for sign-mix inspection.

## Rollout

- No migration.
- No production smoke before merge because production schema is v1.
- PR body must state that post-deploy smoke is required after Railway deploys `main`.

## Open Items

None. All spec decisions are locked; remaining work is implementation and verification.

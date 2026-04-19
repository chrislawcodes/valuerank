# Tasks: Models Consistency Report

Plan: `docs/workflow/feature-runs/models-consistency-report/plan.md`
Spec: `docs/workflow/feature-runs/models-consistency-report/spec.md`

Constraints: each slice ≤ ~300 changed lines. `[CHECKPOINT]` marks a diff-review boundary.

---

## Slice A — API: statistics + resolver + SDL [CHECKPOINT]

Estimated diff: ~340 lines. If the order-effect pairing extraction exceeds ~60 lines, split into A1 (extraction PR) and A2 (consistency service). Do **not** duplicate pairing logic.

### A1. Statistics module `cloud/apps/api/src/services/consistency/statistics.ts` [P: statistics.ts, statistics.test.ts]

- [ ] Create file with named exports:
  - `wilsonInterval(matches: number, trials: number, z?: number): { low: number; high: number; p: number }` — Wilson score 95% CI on a proportion; default `z = 1.96`.
  - `dersimonianLairdPool(scenarioStats: Array<{ p: number; n: number }>): { estimate: number; ciLow: number; ciHigh: number; withinSd: number; betweenSd: number; tauSquared: number }` — random-effects meta-analysis. Handle degenerate cases: single-scenario input → fall back to Wilson on that scenario's `(p, n)` and set `betweenSd = 0, tauSquared = 0`.
  - `spearmanRankCorrelation(x: number[], y: number[]): { rho: number; p: number }` — tied-rank-corrected Spearman with two-sided p-value. Throw on length mismatch.
  - `coherenceForPair(conditionStats: Array<{ pressureRank: number; winRate: number }>): { rho: number | null; p: number | null; coherent: boolean; determinate: boolean }` — applies Decision 4's four-condition determinate check. Return `{ rho: null, p: null, coherent: false, determinate: false }` on indeterminate input.
  - `netPressureRank(condition: { targetAppeal: CanonicalAppealLevel; opponentAppeal: CanonicalAppealLevel }): number | null` — map `+2 / +1 / 0 / −1 / −2`; returns `null` for non-canonical labels.
- [ ] All functions pure, no side effects, no logger imports.
- [ ] File under 400 lines.

### A1b. Statistics tests `cloud/apps/api/src/services/consistency/statistics.test.ts` [P: statistics.ts, statistics.test.ts]

- [ ] Wilson: `wilsonInterval(20, 25)` returns `p = 0.80`, `CI ≈ [0.61, 0.92]`.
- [ ] DerSimonian-Laird: worked example from DerSimonian & Laird 1986 — assert `estimate`, `tauSquared`, `ciLow`, `ciHigh` within 4 decimals of reference.
- [ ] DL degenerate — single scenario: `betweenSd = 0`; CI equals the scenario's Wilson CI.
- [ ] Spearman tied ranks: reference example from Kendall & Gibbons — `rho` within 4 decimals.
- [ ] `coherenceForPair` with zero-variance pressure input → `{ determinate: false }`.
- [ ] `coherenceForPair` with ρ = 0.9, p < 0.05, n = 5 → `{ coherent: true, determinate: true }`.
- [ ] `coherenceForPair` with ρ = 0.9 but p > 0.05 (small n) → `{ coherent: false, determinate: true }`.
- [ ] `coherenceForPair` with n < 3 → `{ determinate: false }`.
- [ ] `netPressureRank` canonical labels → `+2 / +1 / 0 / −1 / −2`; unknown label → `null`.

### A2. Order-effect pairing helper `cloud/apps/api/src/services/consistency/orderEffectPairing.ts`

- [ ] Extract pairing logic currently in `useAnalysisTranscriptsData.ts` / `analysisTranscriptParams.ts` into a pure server-side helper:
  - `computeOrderEffect(primaryTranscripts, companionTranscripts): { samePct: number; flippedPct: number; noisyPct: number; notApplicable: boolean }`
  - Either list empty → `{ notApplicable: true, samePct: 0, flippedPct: 0, noisyPct: 0 }`.
  - "Same" = same decision side across orders; "Flipped" = opposite decision sides; "Noisy" = unresolvable or indeterminate per canonical decision buckets.
- [ ] If extraction requires > 60 lines of change outside the feature's scope paths, STOP and open a **separate** extraction PR (Slice A1). Do not duplicate.

### A2b. Order-effect tests `cloud/apps/api/src/services/consistency/orderEffectPairing.test.ts`

- [ ] Both orders all same → `samePct = 100`.
- [ ] Both orders all flipped → `flippedPct = 100`.
- [ ] Mixed → correct proportions summing to 100.
- [ ] Only one order present → `notApplicable: true`.

### A3. Pothos types `cloud/apps/api/src/graphql/types/models-consistency.ts`

- [ ] Define and register Pothos object types:
  - `InsufficientModel` — `{ modelId, label, providerName, reason }` (reason: `no-repeat-coverage` | `invalid-summary-shape` | `below-min-scenarios`)
  - `ConsistencyPerScenario` — `{ scenarioId, matches, trials, p, ciLow, ciHigh }`
  - `ConsistencyPerDomain` — `{ domainId, domainName, value, ciLow, ciHigh, scenariosMeasured }`
  - `Repeatability` — `{ value, ciLow, ciHigh, withinScenarioSd, betweenScenarioSd, scenariosMeasured, perDomain: [ConsistencyPerDomain], perScenario: [ConsistencyPerScenario] }`
  - `ConsistencyPerPair` — `{ domainId, valueKey, rho, pValue, coherent, determinate, conditionsMeasured: Int!, targetAnalysisRunId, targetCompanionRunId, primaryConditionIds, companionConditionIds, perCondition: [{ netPressureRank: Int!, winRate: Float!, matches: Int!, trials: Int!, scenarioId: String! }] }` — the `perCondition` array powers the Coherence MetricDisclosure Level-4 rows with explicit counts and source IDs for each condition; `scenarioId` feeds the transcripts deep-link.
  - `Coherence` — `{ value, coherentPairs, determinatePairs, indeterminatePairs, perPair: [ConsistencyPerPair] }`
  - `OrderEffect` — `{ samePct, flippedPct, noisyPct, notApplicable }`
  - `ModelConsistencyResult` — `{ modelId, label, providerName, repeatability, coherence, orderEffect }`
  - `ModelsConsistencyResult` — `{ models: [ModelConsistencyResult], insufficient: [InsufficientModel] }`
- [ ] Export Refs; add one import line to `cloud/apps/api/src/graphql/types/index.ts`.

### A4. Resolver `cloud/apps/api/src/graphql/queries/models-consistency.ts`

- [ ] Register `builder.queryField('modelsConsistency', …)`:
  - Return: `ModelsConsistencyResultRef`
  - Args: `domainId: ID (optional)`, `providerId: ID (optional)`, `minScenarios: Int (optional, default 1)`, `signature: String (required)`
- [ ] Resolver flow (per plan Decision 9 and Slice A pseudocode):
  1. Load active model roster: `db.llmModel.findMany({ where: { status: 'ACTIVE' }, include: { provider: true } })`.
  2. Filter by `providerId` arg if present.
  3. Load candidate aggregate runs: `db.run.findMany({ where: { tags: { some: { tag: { name: 'Aggregate' } } }, status: 'COMPLETED', deletedAt: null, ...(domainId && { definition: { domainId } }) }, include: { analysisResults: true } })`.
  4. Filter runs in memory: `runs.filter(r => runMatchesSignature(r.config, signature))` using the helper from `domain-coverage-gql-types.ts`.
  5. For each model in roster:
     a. Gather `analysisResults` where `analysisType === 'AGGREGATE' && status === 'CURRENT'`.
     b. Parse each via `parseRawReliabilitySummaryEntry(ar.reliabilitySummary?.perModel?.[model.modelId])`.
     c. If all parses are invalid-shape → push to `insufficient[]` with `reason: 'invalid-summary-shape'`.
     d. If no valid entries → push to `insufficient[]` with `reason: 'no-repeat-coverage'`.
     e. If no per-scenario `{ matches, trials }` data on valid entries (pipeline not yet backfilled) → push to `insufficient[]` with `reason: 'no-repeat-coverage'`.
  6. `dersimonianLairdPool` → model-level Repeatability + CI.
  7. Pool separately per domain → `repeatability.perDomain`.
  8. For each `(model, value pair)`:
     a. Extract per-condition `{ netPressureRank, winRate }` plus run IDs and condition IDs.
     b. `coherenceForPair` → `{ rho, p, coherent, determinate }`.
     c. Push to `coherence.perPair`.
  9. Aggregate `coherence.value = coherentPairs / determinatePairs` (0 if denominator is 0).
  10. `orderEffectPairing.computeOrderEffect(...)` → `orderEffect`.
  11. Apply `minScenarios`: models with `scenariosMeasured < minScenarios` → **move from `models[]` to `insufficient[]`** (remove from `models[]` in the same step) with `reason: 'below-min-scenarios'`. A model must appear in exactly one of the two arrays.
- [ ] File under 400 lines.

### A4b. Resolver tests `cloud/apps/api/src/graphql/queries/models-consistency.test.ts`

Per plan Testing Strategy — mock discrete dependencies:

- [ ] Mock `db.llmModel.findMany` and `db.run.findMany` via `vi.mock`.
- [ ] Use real imports for `runMatchesSignature`, `parseRawReliabilitySummaryEntry`, `statistics.*`, `orderEffectPairing.computeOrderEffect`.
- [ ] Fixtures:
  - Normal 3 × 5 case → expected Repeatability and Coherence values.
  - `invalid-summary-shape` model → in `insufficient[]` with correct reason.
  - Signature filter — two signatures present; only matching runs included.
  - `minScenarios: 5` with a model at 2 → model in `insufficient[]` with `below-min-scenarios`.
  - No coverage → all models in `insufficient[]` with `no-repeat-coverage`; `models: []`.
  - Pipeline missing per-scenario field → affected models in `insufficient[]` with `no-repeat-coverage`.

### A5. SDL `cloud/apps/web/schema.graphql`

- [ ] Append ~70 lines of SDL mirroring the Pothos types.
- [ ] `npm run lint --workspace @valuerank/api` — no errors.
- [ ] `npm run test --workspace @valuerank/api` — Slice A tests pass.
- [ ] `npm run build --workspace @valuerank/api` — no TS errors.

**Slice A checkpoint.**

---

## Slice B — Web: types + routing + page skeleton [CHECKPOINT]

Estimated diff: ~200 lines.

### B1. GraphQL operation `cloud/apps/web/src/api/operations/modelsConsistency.graphql`

- [ ] Write the query matching the SDL from A5; include all nested fields needed for scatter, table, drill-down, and disclosure.

### B2. Operation re-export `cloud/apps/web/src/api/operations/modelsConsistency.ts`

- [ ] Re-export `ModelsConsistencyQueryDocument`, `ModelsConsistencyQueryResult`, `ModelsConsistencyQueryVariables` from `../../generated/graphql`.

### B3. Codegen

- [ ] `npm run codegen --workspace @valuerank/web` — verify no errors.

### B4. Page skeleton `cloud/apps/web/src/pages/ModelsConsistency.tsx`

- [ ] Read `domainId` and `signature` from `useSearchParams()`. If absent, fetch `DomainAvailableSignaturesQuery`, pick `DEFAULT_SIGNATURE` and the first domain (matching Matrix's first-load behavior). **Write the resolved defaults back to the URL via `setSearchParams({ domainId, signature }, { replace: true })` on first render** so tab links, the Matrix sub-tab nav, and shareable URLs stay in sync with what the page is actually querying.
- [ ] Fire `modelsConsistency` query with required `signature`; optional `domainId`, `providerId`, `minScenarios`.
- [ ] Loading, error, and empty-state shells. Empty state distinguishes:
  - Pipeline-pending (no `models[]`, all `insufficient[]` reasons are `no-repeat-coverage`) → pipeline-dependency message.
  - Partial coverage → scatter + table + footer (C4 below).
  - Invalid-summary-shape only → distinct message.
- [ ] Placeholder divs for scatter / table / footer / drill-down.

### B5. Routing `cloud/apps/web/src/App.tsx`

- [ ] Add `<Route path="/models/consistency" element={<ModelsConsistency />} />`.
- [ ] Do **not** modify any existing route.

### B6. Sub-tab nav `cloud/apps/web/src/components/models/ModelsTabNav.tsx`

- [ ] Two links: Matrix → `/models?domainId={current}&signature={current}`; Consistency → `/models/consistency?domainId={current}&signature={current}`.
- [ ] Active state from `useLocation()`. Accept `domainId` and `signature` props.
- [ ] Mount inside `ModelsConsistency.tsx`. Mount inside `Models.tsx` as an additive render (does not modify `Models.tsx` state, query calls, or existing markup — only adds a nav element at the top). If even this additive change conflicts with the spec's SC-004 reading, fall back to mounting the nav only on the new page and rely on direct-URL navigation from the Matrix.
- [ ] Regression test: open `/models`, assert existing Matrix still renders; nav has two tabs; Matrix is active.

**Slice B checkpoint.**

---

## Slice C — Web: scatter + table + insufficient footer [CHECKPOINT]

Estimated diff: ~280 lines.

### C1. Scatter `cloud/apps/web/src/components/models/ConsistencyScatter.tsx` [P: ConsistencyScatter.tsx, ConsistencyTable.tsx, InsufficientCoverageFooter.tsx]

- [ ] Use `recharts` ScatterChart.
- [ ] x-axis 0.5–1.0 labeled "Repeatability"; y-axis 0.0–1.0 labeled "Coherence".
- [ ] One dot per model; `fill` from provider palette; `r` from `repeatability.scenariosMeasured`.
- [ ] Quadrant reference lines at `x = 0.85` and `y = 0.80`.
- [ ] Four region labels in quadrant corners (plan-defined plain-English text).
- [ ] Tooltip on hover: model, Repeatability, Coherence, n scenarios.
- [ ] File under 200 lines.

### C2. Table `cloud/apps/web/src/components/models/ConsistencyTable.tsx` [P: ConsistencyScatter.tsx, ConsistencyTable.tsx, InsufficientCoverageFooter.tsx]

- [ ] Columns: Model, Provider, Repeatability (value with `± X.X%` from CI), Coherence (`k / n pairs`), n scenarios.
- [ ] Sort key + direction state; click header to toggle.
- [ ] Row click → `onSelectModel(modelId)` callback.
- [ ] File under 200 lines.

### C3. Insufficient footer `cloud/apps/web/src/components/models/InsufficientCoverageFooter.tsx` [P: ConsistencyScatter.tsx, ConsistencyTable.tsx, InsufficientCoverageFooter.tsx]

- [ ] Group `insufficient[]` by `reason`:
  - "No repeat coverage" — pipeline-pending message.
  - "Pipeline data malformed" — distinct warning color.
  - "Below minimum coverage" — notes the `minScenarios` filter value.
- [ ] File under 100 lines.

### C4. Wire into `ModelsConsistency.tsx`

- [ ] Replace B4 placeholder divs; feed `data.modelsConsistency.models` and `data.modelsConsistency.insufficient`.
- [ ] `onSelectModel` state in the page; drill-down remains a placeholder until Slice D.

### C5. Component tests

- [ ] `ConsistencyScatter.test.tsx` — renders N dots; reference lines and region labels present.
- [ ] `ConsistencyTable.test.tsx` — column sort toggles; row click invokes callback.
- [ ] `InsufficientCoverageFooter.test.tsx` — groups by reason; renders each group distinctly.
- [ ] `npm run test --workspace @valuerank/web` — all pass.

**Slice C checkpoint.**

---

## Slice D — Web: drill-down + MetricDisclosure + filters [CHECKPOINT]

Estimated diff: ~330 lines. **If > 300, split into D1 (Drill + Filters) + D2 (MetricDisclosure).**

### D1. Drill-down `cloud/apps/web/src/components/models/ConsistencyDrill.tsx`

- [ ] Input prop: `model: ModelConsistencyResult`.
- [ ] Headline: model name, provider, region label derived from `(repeatability.value, coherence.value)` and thresholds, plus plan's one-line explanation.
- [ ] Repeatability-by-domain: 3 rows from `repeatability.perDomain`; render `value ± CI` and `scenariosMeasured`.
- [ ] Per-pair Coherence chips grid using `CoherenceChip` (inline sub-component). Each shows value-pair label, ρ, p-value, coherent ✓/✗.
- [ ] `View condition matrix →` link on each chip. Build the URL exactly:
  ```
  /domains/analysis/value-detail
    ?domainId={encodeURIComponent(pair.domainId)}
    &modelId={encodeURIComponent(model.modelId)}
    &valueKey={encodeURIComponent(pair.valueKey)}
    &signature={encodeURIComponent(currentSignature)}
    &scoreMethod=LOG_ODDS
  ```
  Reference: `ModelValueDetailDrawer.tsx` line 340.
- [ ] Order-effect panel: render `samePct / flippedPct / noisyPct` as bars or text. `View transcripts →` link built via `buildAnalysisTranscriptsPath(ANALYSIS_BASE_PATH, pair.targetAnalysisRunId, searchParams)` with search params:
  - `modelId`
  - `repeatPattern=noisy` (NOT `paired-stability` — that is not a valid value)
  - `companionRunId={pair.targetCompanionRunId}`
  - `primaryConditionIds={pair.primaryConditionIds.join(',')}`
  - `companionConditionIds={pair.companionConditionIds.join(',')}`
  - Reference: `OverviewTabComponents.tsx` lines 201–202.
- [ ] File under 250 lines.

### D2. MetricDisclosure `cloud/apps/web/src/components/models/MetricDisclosure.tsx`

- [ ] Generic 4-level progressive-disclosure component:
  - Level 1 — value displayed by parent.
  - Level 2 — popover: plain-English definition, exact formula, intermediate components (within/between SD for Repeatability; coherent/determinate counts for Coherence).
  - Level 3 — expandable per-scenario / per-pair table.
  - Level 4 — tooltip on any row: explicit counts (`we asked N times; matched K; p%`) with formula and source link.
- [ ] Accepts a `MetricDefinition` generic prop with definition text, formula, Level-3 table data, and a row formatter.
- [ ] File under 200 lines.

### D3. Filters `cloud/apps/web/src/components/models/ConsistencyFilters.tsx` [P: ConsistencyFilters.tsx, ConsistencyDrill.tsx]

- [ ] Three filters: Domain (select incl. "All"), Provider (select incl. "All"), Min n (number, default 5).
- [ ] Wired to `modelsConsistency` query variables.
- [ ] `signature` is NOT a filter — it is URL-driven (plan Decision 9).

### D4. Wire into `ModelsConsistency.tsx`

- [ ] Replace C4's drill-down placeholder with `ConsistencyDrill`.
- [ ] Mount `MetricDisclosure` in the table's Repeatability and Coherence cells.
- [ ] Mount `ConsistencyFilters` above the scatter.

### D5. Component + URL tests

- [ ] `ConsistencyDrill.test.tsx` — renders all four sections; handles `orderEffect.notApplicable = true`.
- [ ] URL-shape assertions — "View condition matrix →" URL matches the expected string (no navigation).
- [ ] URL-shape assertions — "View transcripts →" URL includes `primaryConditionIds` AND `companionConditionIds`.
- [ ] `MetricDisclosure.test.tsx` — Level 2 → 3 → 4 navigation works.
- [ ] `ConsistencyFilters.test.tsx` — filter changes dispatch expected query variables.
- [ ] `npm run test --workspace @valuerank/web`, `npm run build --workspace @valuerank/web` — no errors.

**Slice D checkpoint.**

---

## Parallel Task Summary

- A1 statistics.ts + A1b statistics.test.ts — `[P]`, disjoint files, same slice.
- C1 scatter + C2 table + C3 footer — `[P]`, disjoint files, same fetched data.
- D1 drill + D3 filters — `[P]`, disjoint files.
- D1 drill vs. D2 MetricDisclosure — partial-P: build Disclosure first in isolation, then wire into Drill.

Run `parallel --slug models-consistency-report` before each slice's checkpoint to validate annotations.

---

## Verification Checklist (per slice)

- [ ] Preflight lint on touched workspace(s)
- [ ] Tests on touched workspace(s)
- [ ] Build on touched workspace(s)
- [ ] `git status` — no unintended files changed
- [ ] Existing `/models` Matrix still renders (regression)
- [ ] Existing `/domains/analysis/value-detail` (ConditionMatrix) and `/analysis/:id/transcripts` (PairedStabilityView) still render unchanged

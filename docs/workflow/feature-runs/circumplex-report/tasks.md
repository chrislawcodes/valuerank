# Tasks: Circumplex Report

Plan: `docs/workflow/feature-runs/circumplex-report/plan.md`
Spec: `docs/workflow/feature-runs/circumplex-report/spec.md`

Constraints: each slice ≤ ~300 changed lines. `[CHECKPOINT]` marks a diff-review boundary.

---

## Slice A — API: shared extractions + aggregation + statistics + resolver + SDL [CHECKPOINT]

Estimated diff: ~450 lines. If statistics exceeds ~300 lines on its own, split the `classicalMds2d` + `anchorMdsRotation` implementation into a separate `mds.ts` module to keep per-file caps.

### A1. Extract Spearman to shared statistics module [P: spearman.ts, spearman.test.ts]

- [ ] Create `cloud/apps/api/src/services/statistics/spearman.ts` containing the existing `spearmanRankCorrelation(x, y)` implementation moved from `cloud/apps/api/src/services/consistency/statistics.ts`.
- [ ] Update `cloud/apps/api/src/services/consistency/statistics.ts` to import and re-export from the new shared module — no behavioral change.
- [ ] Create `cloud/apps/api/src/services/statistics/spearman.test.ts` — move the existing Spearman test cases from `consistency/statistics.test.ts` verbatim.
- [ ] Remove now-duplicate Spearman tests from `consistency/statistics.test.ts`.
- [ ] Run `npm run test --workspace @valuerank/api` — all existing tests must still pass.

### A2. Extract signature-preference helper [P: signature-preference.ts, signature-preference.test.ts]

- [ ] Create `cloud/packages/shared/src/signature-preference.ts` exporting `preferDefaultSignature(available: AvailableSignature[]): string | null`, implementing the existing preference chain from `cloud/apps/web/src/components/domains/coverageMatrixHelpers.ts`: `vnewtd` → `vnewt0` → most-recent virtual (prefix `v*`) → highest preamble version with lowest temperature.
- [ ] Add tests: empty input → `null`; `vnewtd` present → `vnewtd`; `vnewtd` absent + `vnewt0` present → `vnewt0`; no virtual → highest-version exact signature.
- [ ] Update `coverageMatrixHelpers.ts` to import and re-export from `@valuerank/shared/signature-preference` — no behavioral change.
- [ ] Run existing consistency and domain-analysis tests; confirm no regressions.

### A3. Canonical Schwartz order in shared [P: schwartz.ts, schwartz.test.ts]

- [ ] Create `cloud/packages/shared/src/schwartz.ts` with:
  - `SCHWARTZ_CIRCULAR_ORDER: readonly ValueKey[]` — exactly: `["Self_Direction_Action", "Stimulation", "Hedonism", "Achievement", "Power_Dominance", "Security_Personal", "Conformity_Interpersonal", "Tradition", "Benevolence_Dependability", "Universalism_Nature"]`.
  - `theoreticalAngleDeg(index: number, count?: number): number` — returns `(index / count) * 360` with `count = 10` default.
  - `circularDistance(i: number, j: number, count?: number): number` — min steps around a circle of `count` points.
- [ ] Add tests asserting:
  - Length is exactly 10 and list matches the exact key order above.
  - `theoreticalAngleDeg(0) === 0`, `theoreticalAngleDeg(5) === 180`.
  - `circularDistance(0, 5, 10) === 5`, `circularDistance(0, 9, 10) === 1`, `circularDistance(9, 0, 10) === 1`.

### A4. Circumplex statistics module `cloud/apps/api/src/services/circumplex/statistics.ts`

- [ ] Named exports:
  - `pearsonCorrelation(x: (number | null)[], y: (number | null)[]): number | null` — operates on paired values, drops pairs where either value is null, returns null for <3 valid pairs or zero-variance in either vector.
  - `valueProfileMatrix(pairwiseWinRates: number[][], pairTrialCounts: number[][], excluded: Set<number>): (number | null)[][]` — builds the 10×10 symmetric profile-correlation matrix per spec FR-012 (with Option A methodology: each value's profile is its 9-vector of win rates against other values; correlate profiles). Diagonal is 1.0 for non-excluded values; **null for excluded values** (self-correlation of an excluded profile is undefined, not 1). Excluded rows/cols are all null (including the diagonal cell at the excluded index).
  - `circumplexFit(profileMatrix: (number|null)[][], canonicalOrder: ValueKey[]): { rho: number|null, p: number|null, determinatePairs: number, verdict: "clear" | "partial" | "not_evident" | "insufficient_data" }` — wraps shared `spearmanRankCorrelation` (which returns `{ rho, p }` with tied-rank correction and a two-sided t-approximation p-value). `circumplexFit` collects determinate (theoretical-distance, empirical-correlation) pairs from the off-diagonal upper triangle of the profile matrix, passes them to the shared helper, and returns the helper's rho/p unchanged when ≥ 15 determinate pairs are available. Returns `{ rho: null, p: null, verdict: "insufficient_data" }` when < 15 determinate pairs OR when either input vector has zero variance. Otherwise applies fixed-cutoff bands per spec FR-018 based on `rho`.
  - `classicalMds2d(distanceMatrix: (number|null)[][]): { coords: Array<{ x: number; y: number } | null>, stress: number, excluded: number[], warning: string | null }` — double-centering MDS; returns coord=null for excluded indices; warning non-null if first two eigenvalues < 50% of total absolute eigenvalue sum.
  - `anchorMdsRotation(coords, canonicalOrder, anchorKey: ValueKey = "Self_Direction_Action"): typeof coords` — rotates so the first included value starting at `anchorKey` (in canonical order) lands at theoretical angle 0°, defined as the 12 o'clock position `(x: 0, y: +r)` where +y is up on the screen. Falls back to next included value in canonical order if `anchorKey` is excluded. This convention matches the test assertion in A4b (`Self_Direction_Action at (0, y_top)`); it is deliberately a UI-screen convention, not the math convention where 0° = positive x-axis.
- [ ] All functions pure; no logger imports; no global state.
- [ ] File under 400 lines.

### A4b. Circumplex statistics tests `cloud/apps/api/src/services/circumplex/statistics.test.ts`

- [ ] `pearsonCorrelation` — identical vectors → 1.0; opposite → −1.0; zero-variance → null; <3 paired points → null; [1,2,3] vs [2,4,6] → 1.0.
- [ ] `valueProfileMatrix` worked example: 4-value synthetic input where two values have identical profiles → matrix cell = 1.0.
- [ ] `valueProfileMatrix` with one excluded value → that row and column are all null (except diagonal).
- [ ] `circumplexFit` with strongly-monotone decreasing correlation-vs-distance → `rho < -0.5`, verdict `"clear"`.
- [ ] `circumplexFit` with random correlations → `|rho| < 0.2`, verdict `"not_evident"`.
- [ ] `circumplexFit` with fewer than 15 determinate pairs → `verdict: "insufficient_data"`, `rho: null`, `p: null`.
- [ ] `classicalMds2d` on identity-like distance matrix → low stress, warning null.
- [ ] `classicalMds2d` with degenerate near-colinear distances → warning string set (first two eigenvalues explain < 50%).
- [ ] `anchorMdsRotation` with Self_Direction_Action included → rotation places it at (0, y_top).
- [ ] `anchorMdsRotation` with Self_Direction_Action excluded but Stimulation included → Stimulation at top.

### A5. Canonicalization helper import audit

- [ ] Inside `cloud/apps/api/src/services/`, locate the existing `resolveTranscriptDecisionModel` helper (referenced in `domain-analysis-aggregation.ts` and `value-detail.ts` per plan Decision 1). Document its exact module path in this tasks file as a comment so later tasks can import it.
- [ ] Inside `cloud/apps/api/src/graphql/queries/models-consistency.ts`, locate `runMatchesSignature` and confirm it is exported (not file-private). If not, export it or extract to a small shared file `signature-matcher.ts`.
- [ ] No code changes in this step beyond exports — just the audit results recorded in comments.

### A6. Aggregation `cloud/apps/api/src/services/circumplex/aggregation.ts`

- [ ] Named export `aggregatePairwiseWinRates({ modelIds, signature, db }): Promise<Map<modelId, PairwiseMatrix>>` where `PairwiseMatrix` is a 10×10 struct with `{ winRate: number|null, trials: number, neutrals: number }` per ordered pair. `winRate` is `null` when the denominator (`prioritized_A + prioritized_B + neutral`) is 0 for that cell.
- [ ] Flow:
  1. Load candidate aggregate runs: `db.run.findMany({ where: { tags: { some: { tag: { name: 'Aggregate' } } }, status: 'COMPLETED', deletedAt: null }, include: { analysisResults: true } })`.
  2. Filter: `runs.filter(r => runMatchesSignature(r.config, signature))`.
  3. For each run, load its transcripts **filtered to the requested `modelIds` list** (`where: { modelId: { in: modelIds } }`) with minimum fields needed for canonicalization (modelId, scenarioId, orientationFlipped, pairOverride, decision metadata). Do not aggregate transcripts for models not in `modelIds` — that wastes cycles and memory.
  4. For each transcript: `resolveTranscriptDecisionModel(transcript, { orientationFlipped, pairOverride })`. Drop `unknown`.
  5. Accumulate into per-(modelId, valueA, valueB) buckets. Each pair has a DIRECTIONAL win-rate cell: cell (A, B) counts trials where A was prioritized over B, and cell (B, A) counts the inverse. The two cells share a neutral count (ties are the same event regardless of direction) and sum to a symmetric trial count. "Directional" cells avoid the spec's earlier ambiguous "mirror" language.
  6. Compute `winRate(A, B) = prioritized_A / (prioritized_A + prioritized_B + neutral)` per the canonical formula. If the denominator is 0 (no trials ever compared A and B for this model at this signature), emit `winRate: null, trials: 0`.
  7. When summing per-value trial counts for eligibility (A7): sum `trials` across cells where the value appears as the LEFT side only — i.e., for value V, `totalTrials(V) = sum over opponents O of trials(V, O)`. Do not double-count by also adding cells (O, V); those are the same trials viewed from the other side.
- [ ] File under 400 lines.

### A6b. Aggregation tests `cloud/apps/api/src/services/circumplex/aggregation.test.ts`

- [ ] Mock `db.run.findMany` and transcript loader.
- [ ] Fixture: 2 runs, one with `orientationFlipped: true` where canonical decision is "favor_first". The pairwise counts MUST be identical to an unflipped fixture that produces the same canonical decision. (Key correctness test.)
- [ ] Fixture with `status: 'FAILED'` run → that run's transcripts ignored.
- [ ] Fixture with `deletedAt` set → ignored.
- [ ] Fixture where `runMatchesSignature` returns false → ignored.
- [ ] Fixture with `decision: 'unknown'` transcripts → not counted.

### A7. Eligibility `cloud/apps/api/src/services/circumplex/eligibility.ts`

- [ ] Named export `classifyEligibility({ model, pairwise, minTrialsPerValue }): { status: 'eligible' | 'insufficient', reason?: string, trialsPerValue: Array<{ valueKey, trials }> }`.
- [ ] Rules:
  - `status: 'insufficient', reason: 'no_transcripts_for_signature'` — all pairwise cells have `trials === 0`.
  - `status: 'insufficient', reason: 'missing_values'` — one or more values have `totalTrials === 0` (i.e., never tested).
  - `status: 'insufficient', reason: 'below_threshold'` — some value has `0 < totalTrials < minTrialsPerValue`.
  - `status: 'eligible'` — all 10 values pass the threshold.
- [ ] File ≤ 150 lines.

### A7b. Eligibility tests

- [ ] Full coverage, all values ≥ threshold → eligible.
- [ ] Missing one value → insufficient / missing_values.
- [ ] All values present but one below threshold → insufficient / below_threshold.
- [ ] No transcripts at all → insufficient / no_transcripts_for_signature.

### A8. Pothos types `cloud/apps/api/src/graphql/types/circumplex.ts`

- [ ] Register types:
  - `CircumplexPerValue` — `{ valueKey: String!, trials: Int! }`
  - `CircumplexMdsCoord` — `{ valueKey: String!, x: Float!, y: Float!, theoreticalAngleDeg: Float! }`
  - `CircumplexResult` — `{ modelId, modelLabel, providerName, signature, valueOrder: [String!]!, profileCorrelationMatrix: [[Float]]!, pairTrialCounts: [[Int!]!]!, excludedValues: [String!]!, spearmanRho: Float, spearmanP: Float, verdictBand: String!, mds2d: [CircumplexMdsCoord!]!, mdsStress: Float!, mdsWarning: String, trialsPerValue: [CircumplexPerValue!]! }` — note `profileCorrelationMatrix` is a non-null list of non-null lists of **nullable** Floats so excluded cells and degenerate correlations can be represented as null.
  - `CircumplexInsufficientModel` — `{ modelId, modelLabel, providerName, reason: String!, trialsPerValue: [CircumplexPerValue!]! }`
  - `CircumplexAnalysisResult` — `{ signature, models: [CircumplexResult!]!, insufficient: [CircumplexInsufficientModel!]!, eligibilityThreshold: Int! }`
  - `AvailableSignature` — `{ signature: String!, mostRecentRunAt: DateTime }`
- [ ] Export Refs; add an import line to `cloud/apps/api/src/graphql/types/index.ts` if it exists (else rely on autoImport).

### A9. Resolver: circumplex analysis `cloud/apps/api/src/graphql/queries/circumplex-analysis.ts`

- [ ] Register `builder.queryField('circumplexAnalysis', …)`:
  - Return: `CircumplexAnalysisResultRef`
  - Args: `modelIds: [ID!]! (required)`, `signature: String! (required)`, `minTrialsPerValue: Int (optional, default 5)`
- [ ] Flow:
  1. Load roster subset: `db.llmModel.findMany({ where: { id: { in: modelIds } }, include: { provider: true } })`.
  2. Call `aggregatePairwiseWinRates({ modelIds, signature, db })`.
  3. For each model in roster: `classifyEligibility(...)`.
  4. For each eligible model: compute `valueProfileMatrix`, `circumplexFit`, `classicalMds2d`, `anchorMdsRotation`.
  5. Construct payload: eligible → `models`, insufficient → `insufficient`.
- [ ] File under 400 lines.

### A10. Resolver: available signatures `cloud/apps/api/src/graphql/queries/available-signatures.ts`

- [ ] Register `builder.queryField('availableSignatures', …)`:
  - Return: `[AvailableSignature!]!`
  - No args.
- [ ] Flow: `db.run.findMany({ where: { tags: { some: { tag: { name: 'Aggregate' } } }, status: 'COMPLETED', deletedAt: null }, select: { config: true, createdAt: true } })` → extract signature via `formatTrialSignature(run.config)` → deduplicate with most-recent `createdAt` per signature → return sorted by recency desc.
- [ ] File ≤ 100 lines.

### A11. SDL regeneration + import audit

- [ ] Run `npm run codegen --workspace @valuerank/web`. Commit the updated `cloud/apps/web/schema.graphql`.
- [ ] Confirm `circumplex-analysis.ts` and `available-signatures.ts` are picked up by `autoImportDir` (no manual edit to `queries/index.ts`).

### A12. Preflight

- [ ] `npm run lint --workspace @valuerank/api`
- [ ] `npm run test --workspace @valuerank/api`
- [ ] `npm run build --workspace @valuerank/api`
- [ ] `npm run lint --workspace @valuerank/web` (SDL shape check)
- [ ] Manual smoke: `curl` against local GraphQL → `circumplexAnalysis(modelIds:["claude-sonnet-4-5"], signature:"vnewtd")` returns a populated matrix.

**[CHECKPOINT]**

---

## Slice B — Web: types + routing + page skeleton + model picker [CHECKPOINT]

Estimated diff: ~280 lines.

### B1. Typed operations `cloud/apps/web/src/api/operations/circumplex.ts`

- [ ] Define and export:
  - `CIRCUMPLEX_ANALYSIS_QUERY` (GraphQL document)
  - `AVAILABLE_SIGNATURES_QUERY`
  - Typed variables + result interfaces matching the SDL.
- [ ] Use `@graphql-codegen` output from `npm run codegen --workspace @valuerank/web`.

### B2. Available-signatures hook `cloud/apps/web/src/hooks/useAvailableSignatures.ts`

- [ ] `useAvailableSignatures(): { signatures: string[], defaultSignature: string | null, loading, error }`.
- [ ] Imports `preferDefaultSignature` from `@valuerank/shared/signature-preference` (A2).

### B3. Page component `cloud/apps/web/src/pages/ModelsCircumplex.tsx`

- [ ] URL params: `signature`, `models` (comma-separated), `n` (threshold), `methodology` (`open` | `closed`, default `closed`).
- [ ] State derived from URL, not duplicated.
- [ ] Flow:
  1. Load available signatures via B2 hook; pick default via `preferDefaultSignature` if URL has no `signature`.
  2. Load LLM model roster via existing `llmModels` query (used only for the roster list displayed in the picker; eligibility itself is server-computed).
  3. **Always-on query:** once the roster AND a signature are available, issue `circumplexAnalysis({ modelIds: roster.map(m => m.id), signature, minTrialsPerValue: n || 5 })`. No nested-array (do not wrap `roster.map(...)` in another array). This query runs on every page load — whether arriving with an empty URL or a deep-link URL with `?models=...` — so the picker always has fresh `{models, insufficient}` to classify against.
  4. **Loading state:** show the shared `<Loading>` component while the query is in flight.
  5. **Error state:** show the shared `<ErrorMessage>` component if the query errors; include a retry affordance.
  6. **Empty state:** if the query resolves with `models: []` AND `insufficient: []` (no models registered for this signature), show a non-alarming empty message pointing to the signature dropdown.
  7. **Bootstrap selection:** if the URL has no `models` param, auto-select the first alphabetical entry in `result.models` and write it back to URL. If the URL already has `models=`, preserve the intersection with `result.models` (drop ineligible entries silently — see step 8).
  8. On any selection change (user click, selection-recovery drop, threshold change causing drop): rewrite URL via `setSearchParams(..., { replace: true })`.
  9. When selected models include any not in `result.models` (e.g., became ineligible on threshold change), drop them and show a transient notice (plan Decision 9).
- [ ] Render signature dropdown, threshold control, model picker, methodology panel (stub for now, filled in Slice D), results area (empty until Slice C).
- [ ] File ≤ 400 lines. Split sub-components into `components/models/circumplex/` if approaching cap.

### B4. Model picker `cloud/apps/web/src/components/models/CircumplexModelPicker.tsx`

- [ ] Props: `{ eligible: CircumplexResult[], insufficient: CircumplexInsufficientModel[], selectedModelIds: string[], onToggle(modelId) }`.
- [ ] Render eligible as normal multi-select entries; insufficient as disabled/greyed entries with a small "n trials: missing_values / below_threshold / no_data" badge.
- [ ] "N models hidden" footer shows `insufficient.length`.
- [ ] File ≤ 200 lines.

### B5. Nav `cloud/apps/web/src/components/layout/NavTabs.tsx`

- [ ] Add `{ label: 'Circumplex', path: '/models/circumplex' }` to `modelsMenuItems`, after `Matrix` and `Consistency`.

### B6. Router `cloud/apps/web/src/App.tsx` (or router config file)

- [ ] Register `/models/circumplex` → `<ModelsCircumplex />`.

### B7. Preflight

- [ ] `npm run lint --workspace @valuerank/web`
- [ ] `npm run test --workspace @valuerank/web`
- [ ] `npm run build --workspace @valuerank/web`
- [ ] Manual: navigate to `/models/circumplex`, see picker populate with eligible + insufficient models; select one eligible; no results rendered yet (that's Slice C).

**[CHECKPOINT]**

---

## Slice C — Web: correlation matrix + MDS scatter + verdict [CHECKPOINT]

Estimated diff: ~320 lines. If any component exceeds 200 lines, split into a presentational + container pair.

### C1. Correlation matrix heatmap `cloud/apps/web/src/components/models/circumplex/CircumplexMatrix.tsx`

- [ ] Props: `{ matrix: (number|null)[][], pairTrialCounts: number[][], valueOrder: ValueKey[], excludedValues: Set<ValueKey> }`.
- [ ] Render as inline SVG: 10×10 grid of rects, color scale `domain: [-1, 0, 1]`, `range: [red, white, green]` via `d3-scale.scaleLinear`.
- [ ] Row/column labels from `VALUE_LABELS` map.
- [ ] Cells with `trials < 20` get a hatched overlay; cells where `matrix[i][j] === null` render grey with "—".
- [ ] Hover tooltip shows numeric correlation + trial count + both values' full canonical name.
- [ ] File ≤ 200 lines.

### C2. MDS scatter `cloud/apps/web/src/components/models/circumplex/CircumplexMdsScatter.tsx`

- [ ] Props: `{ mds: CircumplexMdsCoord[], excludedValues: ValueKey[], mdsWarning: string | null, mdsStress: number }`.
- [ ] Render inline SVG with:
  - A dotted reference circle (theoretical positions at `i × 36°`).
  - One labeled dot per included value.
  - If `mdsWarning` is non-null, replace scatter with the warning panel.
  - Show `Stress: 0.XX` below the plot with a tooltip explaining what stress means.
- [ ] File ≤ 180 lines.

### C3. Verdict panel `cloud/apps/web/src/components/models/circumplex/CircumplexVerdictPanel.tsx`

- [ ] Props: `{ rho: number|null, p: number|null, verdictBand: string, excludedValues: ValueKey[] }`.
- [ ] Display: numeric ρ to 2 decimals, p to 3 decimals; verdict label with color (emerald for clear, amber for partial, grey for not_evident, orange for insufficient_data); excluded-values list if non-empty.
- [ ] File ≤ 120 lines.

### C4. Model card `cloud/apps/web/src/components/models/circumplex/CircumplexModelCard.tsx`

- [ ] Props: `{ result: CircumplexResult }`.
- [ ] Composes: model label + provider header → matrix → MDS → verdict.
- [ ] Grid layout on desktop; stacked on mobile.
- [ ] File ≤ 150 lines.

### C5. Integration in page

- [ ] `ModelsCircumplex.tsx`: when selected models resolve, render a grid of `<CircumplexModelCard>`s.
- [ ] If multiple selected, repeat the card in a responsive grid (spec US-4).

### C6. Preflight

- [ ] Lint + test + build.
- [ ] Manual: select one eligible model, see matrix + MDS + verdict render correctly. Select multiple, see grid.
- [ ] Manual: deliberately create a model with < 15 determinate pairs (via low threshold + low data) and confirm `verdict: insufficient_data` renders cleanly.

**[CHECKPOINT]**

---

## Slice D — Web: methodology + threshold slider + canonical-order doc + polish [CHECKPOINT]

Estimated diff: ~200 lines + doc.

### D1. Methodology panel `cloud/apps/web/src/components/models/circumplex/CircumplexMethodologyPanel.tsx`

- [ ] Collapsible panel. Open state in URL as `?methodology=open` (plan Decision 3).
- [ ] Static JSX content:
  - Plain-language framing of structural similarity vs direct dominance.
  - Worked example with concrete numbers: Universalism vs Benevolence — same profile against other values → high correlation despite 50/50 direct matchup.
  - Why this is the methodologically correct test for Schwartz circumplex structure.
  - Citation: Schwartz et al. 2012 (with DOI link).
  - Caveat: "Novel application to LLM forced-choice behavior; not a validated measure."
  - Note on verdict cutoffs: editorial, not psychometric; read ρ and p directly.
- [ ] File ≤ 250 lines.

### D2. Threshold control `cloud/apps/web/src/components/models/circumplex/CircumplexThresholdControl.tsx`

- [ ] Numeric input (with min=1, step=1) labeled "Minimum trials per value".
- [ ] On change: rewrite `?n=` URL param; trigger re-query.
- [ ] File ≤ 80 lines.

### D3. Transient notice for dropped models

- [ ] Small toast or inline banner: "1 model removed: [name] fell below the n=X threshold" when selection-recovery drops a model.
- [ ] Dismissable; auto-clears on next selection change.
- [ ] Integrate into `ModelsCircumplex.tsx`.

### D4. Canonical-order doc `docs/schwartz-canonical-order.md`

- [ ] Document the 10-value canonical circular order (cites `@valuerank/shared/schwartz` as source of truth).
- [ ] Document `VALUE_LABELS` as the label source (stable export; distinct from the temporary `DOMAIN_ANALYSIS_MODELS` static snapshot).
- [ ] Document theoretical angles per value.
- [ ] Note this is a ValueRank-specific 10-value subset of the 19-value refined Schwartz model; cite Schwartz 2012.

### D5. URL-state for methodology section

- [ ] Wire up `?methodology=open` / `?methodology=closed` in `ModelsCircumplex.tsx`.
- [ ] Default closed.

### D6. Final preflight

- [ ] `npm run lint --workspace @valuerank/shared`
- [ ] `npm run lint --workspace @valuerank/db` (no change expected)
- [ ] `npm run lint --workspace @valuerank/api`
- [ ] `npm run build --workspace @valuerank/api`
- [ ] `npm run lint --workspace @valuerank/web`
- [ ] `npm run test --workspace @valuerank/web`
- [ ] `npm run build --workspace @valuerank/web`

**[CHECKPOINT]**

---

## Parallel Analysis

Tasks marked `[P: file1, file2]` are candidates for parallel implementation — they touch disjoint files only:

- A1 (spearman extraction) and A2 (signature-preference extraction) touch disjoint file sets and can run in parallel.
- A3 (schwartz module) is disjoint from A1/A2 and can run in parallel.
- Within Slice B: B5 (NavTabs) and B6 (router) touch separate files; B3 and B4 can be done sequentially with B3 providing the page shell.
- Within Slice C: C1, C2, C3 are sibling components and can be implemented in parallel; C4 depends on all three.
- Within Slice D: D1, D2, D4 are disjoint and can run in parallel; D3 and D5 integrate into `ModelsCircumplex.tsx` and should be sequenced to avoid merge conflicts in that file.

---

## Risks & notes for implementer

- **Canonicalization is load-bearing.** Do not short-circuit the transcript → canonical-decision pipeline with a raw win-rate query. Tests in A6b include an orientation-flipped fixture; this must pass before moving on.
- **Freshness gates.** Never read from runs that are not `COMPLETED`, that have `deletedAt` set, or that don't match the signature. Tests in A6b cover each case.
- **Null-heavy profiles are expected.** With default threshold N=5, some value profiles will have many null cells. `pearsonCorrelation` must drop null-paired entries; `valueProfileMatrix` must mark rows with < 6 determinate cells as excluded; `circumplexFit` must mark `<15` determinate pairs as `insufficient_data`.
- **Anchor fallback.** If Self-Direction is excluded, the MDS rotation anchor falls back to the next included value in canonical order.
- **SDL regeneration must succeed.** If `npm run codegen` fails on Slice A, the web types in Slice B will drift. Run codegen at the end of A, not the start of B.

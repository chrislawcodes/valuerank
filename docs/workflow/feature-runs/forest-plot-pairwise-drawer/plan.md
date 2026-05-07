# Plan: Forest Plot for Pairwise Win Rate Matrix Drawer

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: All four MEDIUM findings addressed. (1) Pair-averaged rendering at <=5pp gap: FR-006 now explicit — square only, no bracket, no CI bar. (2) refusalRate field semantics for aggregated rows: ForestPlotRow.refusalRate type doc now specifies max-of-directions for averaged rows (matches FR-009 threshold rule, no drift). (3-4) UNVERIFIED: 1e-9 strictness and Assumption 0 enforcement: accepted as designed — these are intentional hard invariants per FR-014 PooledMeanDivergenceError and FR-012 MultipleVignettesPerDirectionError; production data verification is in spec Assumptions and Slice 2 verification step.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: All three findings addressed. (1) MEDIUM toggle vs row-expand precedence: Edge Cases now spells out — global toggle is source of truth, ON disables click-to-expand and resets row state, OFF collapses everything back. (2) MEDIUM other-filter divergence between resolver and matrix: accepted as part of the FR-014 PooledMeanDivergenceError contract — the runtime check and Slice 2 manual verification cover the equivalence; if other filter rules diverge they will be caught by the integration test in Slice 3. (3) LOW loading state: Edge Cases now explicitly requires a skeleton placeholder during the GraphQL query in-flight.

## Architecture

### Data flow

```
PairwiseWinRateMatrix (existing)
  ↓ onCellClick(row, column) — only when single-model + specific-domain + signature
DomainAnalysis page (existing) — owns drawer state
  ↓ render <PairwiseCellDrawer rowValueKey columnValueKey modelId domainId signature />
PairwiseCellDrawer (NEW)
  ↓ useQuery(DOMAIN_ANALYSIS_PAIR_DETAIL_QUERY, { rowValueKey, columnValueKey, modelId, domainId, signature })
ForestPlot (NEW) ← rows derived from query result
```

### Backend layers

```
domainAnalysisPairDetail resolver (NEW; pair-detail.ts)
  ├─ reuses data-loading helpers from value-detail.ts (reads runs, transcripts, scenarios, valuePairByDefinition)
  ├─ filters vignettes to the single (rowValueKey, columnValueKey) pair, both directions
  ├─ for each surviving vignette: computes wilsonCI95 (NEW utility) → winRateCI95Low/High
  ├─ for the cell: computes pooledMin/Mean/Max via simple aggregation; computeISquared (extends pairwise-math.ts)
  └─ returns DomainAnalysisPairDetailResult (NEW Pothos type)

cloud/apps/api/src/utils/binomial-ci.ts (NEW)
  └─ wilsonCI95(successes, n) — standard z=1.96 Wilson interval

cloud/apps/api/src/utils/pairwise-math.ts (EXTEND)
  └─ computeISquared(estimates) — Cochran's Q with binomial-variance weights, EPSILON-clamped

cloud/apps/api/src/graphql/queries/domain/analysis/pair-detail.ts (NEW)
cloud/apps/api/src/graphql/queries/domain/analysis/pair-detail-types.ts (NEW)
cloud/apps/api/src/graphql/queries/index.ts (EXTEND — register import)
```

### Frontend layers

```
PairwiseWinRateMatrix.tsx (EXTEND)
  └─ accept new props (selectedModelId, domainId, signature, onCellClick)
  └─ wire click handler to non-diagonal interactive cells

DomainAnalysis.tsx (EXTEND)
  └─ derive selectedModelId from current selection (single = id, multi/all = null)
  └─ own openPair: { row, column } | null state
  └─ pass selection state to matrix; render PairwiseCellDrawer when openPair set
  └─ effect to clear openPair when any of (modelId, domainId, signature) changes

PairwiseCellDrawer.tsx (NEW)
  └─ useQuery for pair detail
  └─ render header, methodology footer (FR-020), and ForestPlot
  └─ handle loading, empty (0 vignettes), no-usable-data (validEstimateCount=0), single-vignette edge cases

ForestPlot.tsx (NEW)
  └─ pure component, takes rows + summary + iSquared
  └─ SVG-based render
  └─ pair-averaged toggle / split-by-direction toggle (lifted state)
  └─ row click → either expand (averaged 2-direction row) or onRowClick(row) for navigation
```

### Wave breakdown

This feature is one wave with three implementation slices, separated by stable interface boundaries to keep each diff under ~300 lines:

| Slice | Scope | Approx LOC | Stable boundary at end |
|---|---|---|---|
| Slice 1 — Backend math + types | binomial-ci.ts (new), pairwise-math.ts extend, unit tests for both | ~200 | New utilities exported; no resolver changes yet |
| Slice 2 — Backend resolver + GraphQL | pair-detail.ts (new), pair-detail-types.ts (new), index.ts register, web operations + codegen | ~250 | New `domainAnalysisPairDetail` query resolves on the dev API |
| Slice 3 — Frontend (drawer + forest plot + matrix wiring) | ForestPlot.tsx (new), PairwiseCellDrawer.tsx (new), PairwiseWinRateMatrix.tsx extend, DomainAnalysis.tsx wire-up, integration test | ~300 | Drawer opens on cell click; forest plot renders end-to-end |

`[CHECKPOINT]` boundaries in tasks.md will sit between these slices.

## Implementation strategy per slice

### Slice 1 — Backend math + types

**Files**:
- `cloud/apps/api/src/utils/binomial-ci.ts` (NEW)
- `cloud/apps/api/src/utils/__tests__/binomial-ci.test.ts` (NEW)
- `cloud/apps/api/src/utils/pairwise-math.ts` (EXTEND — add `computeISquared`)
- `cloud/apps/api/src/utils/__tests__/pairwise-math.test.ts` (EXTEND or NEW — add tests for `computeISquared`)

**Approach**:
1. `wilsonCI95(successes, n)` — straightforward Wilson formula with z=1.96. Return null when n=0; when successes=0 lower bound is 0; when successes=n upper bound is 1; otherwise standard formula.
2. `computeISquared(estimates)` — implement per FR-011 algorithm. Filter null/zero-trial first; epsilon-clamp variance for p∈{0,1}; compute Q with weighted mean; return I² in [0, 100].
3. Unit tests target SC-005 (Wilson CI) and SC-006 (I² edge cases) explicitly.

**Verification before exiting slice**:
- `npx turbo test --filter=@valuerank/api` passes new tests
- `npx turbo build --filter=@valuerank/api` clean
- Manual sanity check: `wilsonCI95(80, 125)` returns approximately `[0.553, 0.716]` (verified with R/scipy)

### Slice 2 — Backend resolver + GraphQL surface

**Files**:
- `cloud/apps/api/src/graphql/queries/domain/analysis/pair-detail-types.ts` (NEW)
- `cloud/apps/api/src/graphql/queries/domain/analysis/pair-detail.ts` (NEW)
- `cloud/apps/api/src/graphql/queries/index.ts` (EXTEND — import new resolver)
- `cloud/apps/web/src/api/operations/domainAnalysis.ts` (EXTEND — new query + types)
- `cloud/apps/web/src/generated/graphql.ts` (REGENERATED via codegen)

**Approach**:
1. Read `value-detail.ts` carefully; copy the data-loading scaffold (definitions → runs → transcripts → scenarios → valuePairByDefinition).
2. Filter to vignettes where `(valueA, valueB)` matches the query's `(rowValueKey, columnValueKey)` in either direction. Track each vignette's `framingDirection` based on which side of the pair matches `rowValueKey`.
3. For each surviving vignette compute prioritized/deprioritized/neutral counts, selectedValueWinRate, refusalRate, and Wilson CI via `wilsonCI95`.
4. After all vignettes: filter null/zero-trial to compute pooledMin/Mean/Max and iSquared.
5. Match the existing matrix cell value: pooledMean's mean MUST equal the matrix's `pairwiseWinRates` cell for the same model+signature+pair. Add a logged warning if it diverges.
6. Web side: add `DOMAIN_ANALYSIS_PAIR_DETAIL_QUERY` and types; run codegen.

**Verification before exiting slice**:
- `npx turbo test --filter=@valuerank/api` passes
- `npx turbo build --filter=@valuerank/api` clean
- Codegen run; `npx turbo build --filter=@valuerank/web` clean
- Live query against the local dev API for one known pair (e.g. Achievement vs Benevolence_Dependability for claude-sonnet-4-5 on Software Approach Choice) returns vignettes and pooledMean ≈ 100% (per known data)
- Manual verification that `pooledMean` matches `pairwiseWinRates` matrix cell for the same input

### Slice 3 — Frontend drawer + forest plot + matrix wiring

**Files**:
- `cloud/apps/web/src/components/domains/ForestPlot.tsx` (NEW)
- `cloud/apps/web/src/components/domains/PairwiseCellDrawer.tsx` (NEW)
- `cloud/apps/web/src/components/domains/PairwiseWinRateMatrix.tsx` (EXTEND — props + click)
- `cloud/apps/web/src/pages/DomainAnalysis.tsx` (EXTEND — drawer state + selection wiring)
- Test file(s) for ForestPlot rendering basics

**Approach**:
1. ForestPlot first as a pure component with props per the spec's `ForestPlotProps`. SVG-based; no D3 dependency. Build out the visual grammar: square + bar (CI) + bracket (range, dashed) + reference line + summary band + I² label.
2. Pair-averaging logic lives in a derive function inside the drawer (not the resolver) — takes the resolver's per-vignette output and produces ForestPlotRows for the current toggle state.
3. PairwiseCellDrawer wires the GraphQL query + state for the toggle + render of the forest plot. Handle empty / no-usable-data / single-vignette edge cases (FR Edge Cases section).
4. PairwiseWinRateMatrix accepts the new props and adds the click handler; existing matrix rendering unchanged when props are null or cell is non-clickable.
5. DomainAnalysis owns drawer state and effect to clear it on selection change.
6. Integration test (Playwright or RTL): for a known cell, click → drawer opens → forest plot has expected number of rows.

**Verification before exiting slice**:
- `npx turbo lint --filter=@valuerank/web` clean
- `npx turbo test --filter=@valuerank/web` passes new tests
- `npx turbo build --filter=@valuerank/web` clean
- Manual: open the matrix on `localhost:3030`, verify cell click opens drawer, forest plot renders, toggle works, hover tooltips show CI bounds, framing-gap warning appears for the known Universalism pair

## Risk callouts

### Architectural risks

- **Drawer state ownership.** DomainAnalysis.tsx already manages a lot of state (selection bar, multiple report sections). Adding drawer state could be argued for moving into a sub-component. **Mitigation**: keep drawer state at DomainAnalysis level for Wave 1; if it grows complex, refactor in a follow-up. Single state field (`openPair: { row, column } | null`) is small enough to live there cleanly.
- **Component boundary between ForestPlot and PairwiseCellDrawer.** ForestPlot should be pure (no GraphQL). PairwiseCellDrawer fetches and transforms. Boundary is the `ForestPlotProps` contract.
- **`pooledMean` equivalence with matrix.** FR-014 makes this a hard guarantee. Slice 2 must compare resolver output against the matrix source for at least one cell before merge. The test in Slice 3 codifies it.

### Performance risks

- **Resolver fetches all transcripts for all vignettes in scope.** For Wave 1 this is fine — current data has ≤18 vignettes per pair. **Verification**: time a live query against the dev API for one cell and confirm < 500ms. If a future domain has hundreds of vignettes, pagination may be needed (Wave 2+).
- **Forest plot SVG render with many rows.** Even at 18 rows it's trivial. **Verification**: not a concern at current scale; not adding virtualization.

### Methodological risks

These are recorded in spec.md's Residual Risks section with verification actions. Carrying forward:

- **Cognitive load on users (methodology footer)**. **Verification**: post-launch walkthrough with one methodologist; if they cannot answer "where does a tie sit on this plot?" without re-reading, file a Wave 2 follow-up.
- **Magic-number thresholds (5pp, 15pp, 5%)**. **Verification**: post-launch threshold-distribution analysis script; recalibrate if any threshold flags > 30% or < 1% of cells.
- **Disabled-state usability gap**. **Verification**: first Wave 2 user test trigger.
- **`pooledMean` vs matrix cell value drift**. **Verification**: integration test in Slice 3; logged warning in resolver also serves as runtime canary.
- **I² center-of-mass mismatch with displayed mean**. **Verification**: acknowledged in FR-020; no further verification action since this is a transparently disclosed methodological choice.

### Implementation risks

- **Codegen step easy to forget.** `npm run codegen --workspace @valuerank/web` MUST run after Slice 2's GraphQL changes. **Verification**: Slice 2 task list explicitly includes the codegen step; the slice's diff review will fail typecheck if it was skipped.
- **Existing query index registration.** New queries register as a side effect of import in `cloud/apps/api/src/graphql/queries/index.ts`. Easy to miss. **Verification**: explicit task line item; integration test against the resolver will fail if the query isn't registered.

## Residual Risks (Plan Stage)

- **Spec-stage methodological residual risks** are carried forward verbatim from spec.md (cognitive load, magic numbers, disabled-state, pooledMean drift, I² center mismatch); each has a verification action specified in spec.md.
- **Plan-stage implementation risks** are the four bullets in "Implementation risks" above; each carries an inline verification action.
- **Cross-stage**: Codex implements per slice with `[CHECKPOINT]` boundaries; Sonnet reviews each slice's diff before advancing. **Verification**: slice diff checkpoints catch implementation drift before merge.

## Out of Scope (carried from spec)

- Trust signal corner flags (Wave 2)
- Sparkline previews (Wave 2)
- Methodology disclosure block on the page (Wave 2)
- Forest plot for the Win Rate by Values by Model drawer (Wave 3)
- Multi-model and ALL_DOMAINS forest plot variants
- Cell-level bootstrap CIs
- Pagination / virtualization for very large vignette sets

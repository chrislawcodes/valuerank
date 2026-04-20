# Implementation Plan: Circumplex Report

**Branch:** `claude/consistency-signature-dropdown` | **Date:** 2026-04-20
**Spec:** `docs/workflow/feature-runs/circumplex-report/spec.md`

## Summary

Add a `/models/circumplex` page (third item under the Models dropdown, after Matrix and Consistency) that lets a researcher pick one or more LLM models with sufficient data and, for each, see a 10×10 value-profile correlation matrix, MDS scatter with theoretical-circle overlay, Spearman ρ/p-value, verdict band, and a collapsible methodology section. All statistics are computed server-side from pooled pairwise win rates; the client renders. No new DB tables.

Four implementation slices, each under ~300 lines: (A) API — pairwise aggregation + circumplex stats + resolver + SDL; (B) web — types + routing + page skeleton + model picker; (C) web — correlation-matrix heatmap + MDS scatter; (D) web — methodology panel + error/empty states + canonical-order doc.

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: HIGH (aggregation pipeline — modelsAnalysis equal-weights at snapshot level, not raw trial pooling): spec FR-001 revised to explicitly defer data-source decision to plan phase with three candidate paths (live transcripts, new materialized aggregate, or domain-averaged reuse with caveat). MEDIUM (signature source — domainAvailableSignatures is domain-scoped): FR-016 revised to name the gap and defer global-signature-query decision to plan phase. MEDIUM (FR-021 labeling taxonomy underspecified): FR-021 rewritten with explicit two-layer convention, names VALUE_LABELS exact entries, and requires implementation to read labels at render time rather than hard-coding. Residual risks (MDS anchoring, caching policy) moved to explicit Residual Risks section. Round-3 Codex runner call failed due to external Codex API rate limits; round-1 and round-2 Codex runs completed successfully and their findings are the basis of these accepted resolutions.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: MEDIUM (providerName missing from CircumplexResult entity): added to Key Entities. MEDIUM (per-pair coverage not handled): FR-011b added — per-pair trial counts returned by resolver, UI flags cells with trials<20, values with insufficient determinate pair coverage (<6 of 9 cells, or any cell <20 trials) excluded from correlation/MDS and surfaced in excludedValues. LOW (stable sort order): FR-011a specifies alphabetical by modelLabel ascending. LOW (VALUE_LABELS example drift): FR-018 and FR-021 now reference the shared map authoritatively with the exact label strings. LOW (error state undefined): FR-018a added requiring reuse of ErrorMessage and Loading components with distinct 'no data for signature' vs 'query failed' states. Round-3 Codex runner call failed due to external Codex API rate limits; round-2 Codex run completed and its findings are the basis of these accepted resolutions.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: HIGH (VALUE_LABELS example mismatch — spec listed labels that don't exist in the actual map): FR-018 and FR-021 updated to list the actual label entries (Self-Direction, Stimulation, Hedonism, Achievement, Power, Security, Conformity, Tradition, Benevolence, Universalism) and require reading from the map at render time. HIGH (dependency on temporary domainAnalysisData.ts file): FR-021 scope note added distinguishing stable exports (VALUE_LABELS et al.) from the temporary DOMAIN_ANALYSIS_MODELS static snapshot; spec depends only on stable exports. MEDIUM (filtering logic contradiction — totalHiddenModels implied server-side computation): FR-005 revised to explicitly compute totalHiddenModels client-side using existing llmModels query; field removed from server response shape in Key Entities. MEDIUM (sparse-data guardrail too weak): FR-011b tightened from '<3 determinate cells' to '<6 of 9 determinate cells OR any cell <20 trials' with rationale. Residual risks (resolver performance, URL state complexity) noted in spec Residual Risks section and deferred to plan phase.
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: HIGH (orientation-aware canonicalization missing): Decision 1 rewritten — aggregation now routes every transcript through resolveTranscriptDecisionModel() with orientationFlipped + pairOverride before counting wins, drops unknown decisions, and gates on COMPLETED + deletedAt IS NULL + runMatchesSignature. Explicit test in wave A (flipped scenarios must produce identical counts to unflipped). MEDIUM (picker cannot determine eligibility from llmModels): Decision 8 added — server returns {models, insufficient} mirroring ModelsConsistency; client renders both lists; no llmModels roundtrip needed. MEDIUM (null-aware Spearman wrapper): Decision 4 revised — circumplexFit wraps the shared spearmanRankCorrelation and returns nullable rho/p with 'insufficient_data' verdict when below threshold; Self-Direction exclusion falls back to next included value in canonical order. Residual risks acknowledged in plan.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: HIGH (freshness and signature gates dropped): Decision 1 rewritten — explicitly gates on run.status=COMPLETED, run.deletedAt IS NULL, and runMatchesSignature(run.config, signature) reused from models-consistency.ts before any transcript work. MEDIUM (signature-default rule underspecified): Decision 2 revised to import/extract the existing default-preference chain (vnewtd → vnewt0 → virtual → highest-version) from coverageMatrixHelpers.ts via a new @valuerank/shared/signature-preference extraction. LOW (first-load model selection not defined): Decision 9 added — page bootstraps default selection from first alphabetical eligible model; URL write-back on selection change keeps URL and UI in sync.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: MEDIUM (picker data dependency): Decision 8 makes the server return {models, insufficient} in one payload — no separate lightweight-query dance. MEDIUM (URL/UI sync for dropped models): Decision 9 specifies URL write-back via setSearchParams(replace:true) on any selection change, including selection-recovery drops. MEDIUM (Spearman module duplication + anchor edge case): Decision 4 now extracts spearmanRankCorrelation to @valuerank/shared; test cases explicitly include Self-Direction-excluded scenario; anchor rule falls back to next canonical-order included value. MEDIUM (sparse-data test coverage): wave A unit tests enumerate zero-variance, all-null, 3-pair-min, one-value-excluded, Self-Direction-excluded profiles. Residual risks (statistical approximation, SVG rendering perf) accepted.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: HIGH (zero-denominator in winRate): A6 step 6 now emits winRate=null, trials=0 when denominator is 0, preventing NaN propagation. MEDIUM (totalTrials double-counting in symmetric matrix): A6 step 7 added — totalTrials(V) counts cells where V is the LEFT side only, avoiding double-count. MEDIUM (B3 nested-array bug): B3 step 3 rewritten with explicit note 'No nested-array — do not wrap roster.map(...) in another array'. MEDIUM (circumplexFit p-value source): A4 circumplexFit now explicitly says it passes the determinate pairs to the shared spearmanRankCorrelation and returns that helper's p-value unchanged; t-approximation inherited from helper.
- review: reviews/tasks.codex.dependency-order-adversarial.review.md | status: accepted | note: HIGH (schema type [[Float]!]! cannot hold nulls): A8 CircumplexResult.profileCorrelationMatrix changed from [[Float]!]! to [[Float]]! with explicit note about nullable Floats. MEDIUM (B3 deep-link missing query path): B3 now specifies 'always-on query' — the circumplexAnalysis call runs on every page load regardless of URL state. MEDIUM (circumplexFit p-value source): same fix as execution review. MEDIUM (A6 no modelIds filter): A6 step 3 now explicitly filters transcripts with modelId IN modelIds. Residual risks (helper path confirmation, default-signature tie-breaking) accepted.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: HIGH (MDS rotation contradiction — 0° vs y_top): A4 anchorMdsRotation now explicitly documents that 0° means 12 o'clock (x:0, y:+r) on the UI screen, NOT the math-convention positive x-axis. A4b test assertion (0, y_top) is correct under this convention. HIGH (expensive default load): accepted as residual risk — at 11 production models the cost is negligible; ModelsConsistency already uses the same pattern; will revisit at ≥50 models. MEDIUM (valueProfileMatrix diagonal for excluded values): A4 now specifies excluded-value diagonal is null, not 1.0. MEDIUM (missing loading/error states in B3): B3 steps 4-6 now specify shared Loading + ErrorMessage + empty-state components. LOW findings (magic numbers, B4 hidden vs greyed terminology, signature preference brittleness, typo risk in Schwartz order, aggregation 'mirror' language) — all accepted as residual tech debt; B4 terminology clarified (insufficient models are rendered as disabled/greyed, not hidden; the 'N models hidden' phrasing is a count label not a visibility toggle).

## Technical Context

| Aspect | Detail |
|---|---|
| Language | TypeScript (strict, no `any`) |
| API framework | Pothos (code-first GraphQL) |
| SDL snapshot | `cloud/apps/web/schema.graphql` — manually maintained |
| Web framework | React + urql + Vite |
| Codegen | `npm run codegen --workspace @valuerank/web` |
| DB access | Prisma reads from existing `Transcript` + `AggregateAnalysis` tables — no new tables |
| Testing | Vitest (API and web) |
| File size limit | 400 lines / file (CI enforced) |
| New DB tables | None |
| Performance target | 11 models × 4 domains × ~75 trials/pair = ~30k transcripts/request; resolver completes in < 800 ms uncached |

---

## Architecture Decisions

### Decision 1: Live-transcript aggregation through existing canonicalization helpers

**Chosen:** The `circumplexAnalysis` resolver aggregates pairwise win rates directly from transcripts, but **not via raw SQL counts**. Every transcript passes through the same canonicalization pipeline the rest of the codebase uses:

1. **Run-level gates (before any transcript work):** Scope to aggregate runs where `run.status = 'COMPLETED'` AND `run.deletedAt IS NULL` AND `runMatchesSignature(run.config, signature) === true`. Reuse the existing `runMatchesSignature` helper from `cloud/apps/api/src/graphql/queries/models-consistency.ts`. Never read from running, failed, or soft-deleted runs.
2. **Transcript-level canonicalization:** Route every transcript through `resolveTranscriptDecisionModel(transcript, { orientationFlipped, pairOverride })` before counting wins. This handles orientation-flipped scenarios (where the "left" and "right" value were swapped for counterbalancing) and any pair-override metadata. Drop transcripts whose canonical decision is `unknown` — do not attribute them to either value. Reuse the existing helper from `cloud/apps/api/src/services/analysis/` (path to be confirmed in wave A; see `domain-analysis-aggregation.ts` and `value-detail.ts` for usage examples).
3. **Neutral handling:** Neutral outcomes count toward the denominator per canonical `winRate` definition (spec FR-003). The canonicalization helper already normalizes these.

The resolver then aggregates the canonicalized per-transcript decisions into the 10×10 win-rate matrix in memory. No new Prisma table, no pipeline change.

**Rationale:**
- Skipping canonicalization produces wrong answers on any counterbalanced run — orientation flips alone would silently invert ~half the pairwise cells. This is a correctness requirement, not a performance choice.
- Run-level gates (`COMPLETED`, `deletedAt IS NULL`, `runMatchesSignature`) match what every other Models-tab report uses. Without them, stale/deleted/mis-scoped runs bleed into the circumplex matrix.
- Live aggregation remains viable at ~30k canonicalized-transcript rows per request. If performance regresses at ≥ 100k rows, add a `ModelPairwiseStats` materialized view in follow-up work.

**Alternatives considered:**
- Raw SQL `count(*) group by` on transcripts — rejected; silently wrong on orientation-flipped data.
- New materialized view + pipeline emission — rejected for v1 (pipeline churn, rollout complexity).
- Reuse `modelsAnalysis` — rejected because domain-equal-weighting changes correlations materially.

### Decision 2: New `availableSignatures` global resolver + canonical default order

**Chosen:** Add `Query.availableSignatures: [AvailableSignature!]!` that returns the distinct set of signatures present across all `COMPLETED`, non-deleted aggregate-analysis runs, ordered by recency.

**Default-signature preference order (must match existing repo convention):**
1. `vnewtd` if present (the shipped "new @ default temp" convention)
2. `vnewt0` if present (new @ temp 0)
3. The most recent virtual signature (prefix `v*`)
4. The exact signature with highest preamble version + lowest temperature

This preference is encoded in the existing `coverageMatrixHelpers.ts` / `ModelsConsistency.tsx` chain; the circumplex page MUST import and reuse that helper (or extract it to `@valuerank/shared/signature-preference` if the import coupling is awkward). Picking a different default here would make the circumplex page show a different baseline from the rest of the Models tab — bad UX.

**Rationale:**
- `domainAvailableSignatures` requires a `domainId`; circumplex has no domain axis.
- A global resolver is ~1 SQL query (distinct on the aggregate table) — negligible cost.
- Gives other future Models-tab reports the same signature picker primitive.
- Matching the existing default-preference rule keeps reports consistent with each other.

### Decision 3: URL state for model selection + methodology open/closed; no query-param pollution

**Chosen:** `?models=claude-sonnet-4-5,gpt-5.1&signature=vnewtd&methodology=open&n=5`. Model IDs in comma-separated form; threshold as `n`; signature already in use on Consistency. Selection lives in the URL; the page treats the URL as source of truth and reconciles on change.

**Rationale:**
- Researcher-shareable URLs (primary audience constraint).
- URL length: worst case 11 model IDs + query params ≈ 400 chars, well below browser/server limits. Not a concern at current scale.
- Methodology expand/collapse is UI state but also a shareability concern (spec US-2 AC-3); URL wins for shareability.

### Decision 4: Statistics module — pure functions + explicit null-aware wrappers + extracted shared utility

**Chosen:** `cloud/apps/api/src/services/circumplex/statistics.ts` (≤ 400 lines):

```
pearsonCorrelation(x, y)                    → number | null   (null for zero-variance OR <3 paired points)
valueProfileMatrix(pairwiseWinRates)        → (number|null)[10][10]   (nulls where excluded)
circularDistance(i, j, k = 10)              → number          (min steps around the circle)
circumplexFit(profileMatrix)                → { rho: number|null, p: number|null, verdict, determinatePairs }
classicalMds2d(distanceMatrix)              → { coords, stress, excluded: ValueKey[], warning: string|null }
anchorMdsRotation(coords, valueOrder)       → coords          (rotates so first included value in canonical order is at top)
```

**Shared utility extraction:** The Spearman-rank-correlation function currently lives at `cloud/apps/api/src/services/consistency/statistics.ts`. Wave A MUST extract it to a new `cloud/apps/api/src/services/statistics/spearman.ts` (or equivalent shared location) and re-export it from both the consistency and circumplex statistics modules. Do NOT copy-paste — shared logic belongs in one place. A simple file-move + import-update commit at the start of wave A, with the existing consistency tests unchanged, proves the refactor didn't break anything.

**Null-aware circumplex Spearman:** The shared `spearmanRankCorrelation` returns `{ rho: 0, p: 1 }` for short/degenerate inputs (historically desired by Consistency). Circumplex needs nullable results. `circumplexFit` MUST wrap the shared helper and return `{ rho: null, p: null, verdict: "insufficient_data" }` when the determinate pair count is below the threshold (default: < 15 of 45 pairs, tunable) or when the distance/correlation vectors collapse to constants. The shared helper's zero-fallback is preserved; circumplex-specific null logic lives in the wrapper.

**MDS rotation anchor:** Rotate the MDS output so the canonical first-included value is at theoretical angle 0° (top). If Self-Direction is excluded (insufficient data), fall back to the next value in canonical order that IS included. If no values are included, MDS is not rendered (consistent with the `mdsWarning` state in spec Key Entities).

All pure functions; worked-example unit tests cite textbook values (tied-rank Spearman from Kendall & Gibbons; Pearson from any standard stats text). Test cases MUST include: zero-variance profile, all-null profile, 3-pair minimum profile, one-value-excluded profile, and Self-Direction-excluded profile.

### Decision 5: Visualization — inline SVG, no new chart library

**Chosen:** Both the 10×10 correlation heatmap and the MDS scatter render as inline SVG using `d3-scale` for axis math (already a transitive dep in the web workspace — no new package install). No recharts, no visx, no Chart.js.

**Rationale:**
- `ConsistencyScatter.tsx` already ships inline-SVG dots/labels; style and motion conventions already exist.
- Heatmap is trivial (10×10 rects); scatter is 10 dots + dotted-circle overlay — both well under 150 LoC each.
- Avoids pulling in a charting lib for two small views.

### Decision 6: 10-value canonical order encoded once in shared data

**Chosen:** Add `SCHWARTZ_CIRCULAR_ORDER: readonly ValueKey[]` to `cloud/packages/shared/src/schwartz.ts` (new file) alongside a tiny helper `theoreticalAngleDeg(valueKey)`. Both the API resolver (for `valueOrder` in the payload) and the web (for axis labels, MDS reference circle) import from `@valuerank/shared`.

**Rationale:**
- Single source of truth; matches the spec requirement in FR-021 (dedicated ordering doc / export).
- The doc `docs/schwartz-canonical-order.md` (spec FR-021) cites this module as the canonical encoding.

### Decision 7: Methodology panel copy is static; no CMS or content pipeline

**Chosen:** The methodology panel copy (plain-language explanation, Universalism/Benevolence worked example, Schwartz 2012 citation, novel-application caveat) is authored as a React component with static JSX. No Markdown rendering, no content-service abstraction.

**Rationale:**
- One page, one panel. Adding infrastructure for "content" is overkill.
- Copy is product-owner-reviewed before ship; changes land via normal code review.

### Decision 8: Eligibility classification is server-side; picker renders server lists

**Chosen:** The `circumplexAnalysis` resolver returns **two separate lists** in the payload, mirroring the `ModelsConsistency` pattern:

```
CircumplexAnalysisResult {
  signature: String!
  models: [CircumplexResult!]!              # eligible, with full per-model stats
  insufficient: [InsufficientModel!]!       # ineligible, with per-value trial counts + reason
  eligibilityThreshold: Int!
}
```

`InsufficientModel` carries the same identity fields (`modelId`, `modelLabel`, `providerName`) plus `trialsPerValue` and a `reason` string (`"missing_values"`, `"below_threshold"`, `"no_transcripts_for_signature"`). The picker renders the union and visually separates eligible from insufficient (disabled, greyed, with reason). The footer count `N models hidden` is `insufficient.length`.

**Rationale:**
- The full model roster via `llmModels` does not carry per-value trial counts, so client-side eligibility is impossible without another round-trip (gemini review M1 + codex architecture M2).
- Server-side classification keeps the picker a simple render of two lists.
- Matches the shipped pattern in `ModelsConsistency` — same mental model for researchers using both pages.

**Revises earlier spec FR-005 and FR-008:** the client is no longer the "single source of truth" for eligibility; the SERVER is. Spec language to be clarified during wave A when the SDL is finalized.

### Decision 9: First-load bootstrap + URL-write-back on selection change

**Chosen:** When the page loads with no `?models=` URL parameter (or with an empty list), auto-select the first model from `result.models` (alphabetical-by-label per spec FR-011a). When selection changes — whether by user action or by the selection-recovery rule in FR-011a (dropping ineligible models on threshold/signature change) — the URL MUST be rewritten via `setSearchParams(..., { replace: true })` so the URL and UI stay consistent. Never leave the URL with IDs that aren't currently selected.

**Rationale:**
- Matches `Models.tsx` and `ModelsConsistency.tsx` bootstrap behavior — no blank initial view.
- Keeps URLs shareable: a collaborator opening the link sees the same selection state as the original sharer, minus any now-ineligible models.

---

## Wave Breakdown

Each wave is bounded by a `[CHECKPOINT]` in `tasks.md` and should change ≤ 300 lines.

### Wave A — API: aggregation + statistics + resolver + SDL

1. **Extract shared Spearman utility** (Decision 4): move `spearmanRankCorrelation` out of `cloud/apps/api/src/services/consistency/statistics.ts` into `cloud/apps/api/src/services/statistics/spearman.ts`; re-export from the consistency module. Existing consistency tests must continue to pass unchanged.
2. `cloud/apps/api/src/services/circumplex/statistics.ts` — pure functions per Decision 4 (pearson, valueProfileMatrix, circumplexFit, classicalMds2d, anchorMdsRotation).
3. `cloud/apps/api/src/services/circumplex/aggregation.ts` — live-transcript path per Decision 1:
   - Load aggregate runs filtered by `status=COMPLETED` AND `deletedAt IS NULL` AND `runMatchesSignature(run.config, signature)`.
   - For each run, load transcripts and canonicalize via `resolveTranscriptDecisionModel(transcript, { orientationFlipped, pairOverride })`.
   - Drop `unknown` canonical decisions.
   - Accumulate per-pair prioritized/deprioritized/neutral counts.
   - Reducer output: 10×10 pairwise matrix with trial counts and per-value totals.
4. `cloud/apps/api/src/services/circumplex/eligibility.ts` — classifies each requested model as eligible or insufficient (Decision 8), given per-value trial totals + threshold. Returns `{ models, insufficient }`.
5. `cloud/apps/api/src/graphql/queries/circumplex-analysis.ts` — Pothos resolver. Imports aggregation + eligibility + statistics. Payload shape per Decision 8. Uses existing `autoImportDir` registration.
6. `cloud/apps/api/src/graphql/queries/available-signatures.ts` — Pothos resolver for Decision 2.
7. `cloud/apps/web/schema.graphql` — regenerated; SDL snapshot commit.
8. `cloud/packages/shared/src/schwartz.ts` — `SCHWARTZ_CIRCULAR_ORDER` + `theoreticalAngleDeg` helper.
9. `cloud/packages/shared/src/signature-preference.ts` — extracted default-signature preference helper (Decision 2); re-exported from consistency helpers if already there, otherwise a fresh extraction from `coverageMatrixHelpers.ts`.
10. Unit tests:
    - `circumplex/statistics.test.ts` — worked examples including zero-variance, all-null, 3-pair-min, one-value-excluded, Self-Direction-excluded.
    - `circumplex/aggregation.test.ts` — fixture transcripts (including orientation-flipped ones) → expected canonicalized matrix. Key test: flipping orientation on a scenario must produce identical pairwise counts as the unflipped version.
    - `circumplex/eligibility.test.ts` — models with missing values, below-threshold values, full coverage.
    - `statistics/spearman.test.ts` — moved from consistency, unchanged assertions.

**Verification:** `npm run lint --workspace @valuerank/api && npm run test --workspace @valuerank/api && npm run build --workspace @valuerank/api`. Manual GraphQL query against local API returns a populated matrix for `claude-sonnet-4-5`.

**[CHECKPOINT]**

### Wave B — Web: types + routing + page skeleton + model picker

1. `cloud/apps/web/src/api/operations/circumplex.ts` — typed query, generated from SDL. Shape matches Decision 8 payload.
2. `cloud/apps/web/src/pages/ModelsCircumplex.tsx` — page component; reads URL params, renders Loading/ErrorMessage/empty states. Bootstraps default selection on first load per Decision 9 (first alphabetical model from `result.models`). Writes back to URL on selection change.
3. `cloud/apps/web/src/components/models/CircumplexModelPicker.tsx` — multi-select that renders `result.models` as eligible options and `result.insufficient` as disabled/greyed entries with a reason badge. Does NOT fetch `llmModels` separately — the server payload carries everything.
4. `cloud/apps/web/src/components/layout/NavTabs.tsx` — add "Circumplex" to the Models dropdown.
5. `cloud/apps/web/src/App.tsx` (or router equivalent) — register `/models/circumplex`.
6. `cloud/apps/web/src/hooks/useAvailableSignatures.ts` — small hook wrapping Decision 2's query. Applies the extracted default-preference helper for initial value.

**Verification:** `npm run lint --workspace @valuerank/web && npm run test --workspace @valuerank/web && npm run build --workspace @valuerank/web`. Navigate to `/models/circumplex` on local dev server; picker populates; nothing else renders yet (selection is empty).

**[CHECKPOINT]**

### Wave C — Web: correlation-matrix heatmap + MDS scatter + verdict

1. `cloud/apps/web/src/components/models/CircumplexMatrix.tsx` — 10×10 SVG heatmap per Decision 5.
2. `cloud/apps/web/src/components/models/CircumplexMdsScatter.tsx` — SVG scatter + dotted theoretical circle per Decision 5.
3. `cloud/apps/web/src/components/models/CircumplexVerdictPanel.tsx` — ρ / p / band label display per spec FR-018.
4. `cloud/apps/web/src/components/models/CircumplexModelCard.tsx` — composes matrix + MDS + verdict + model label.
5. Wire these into `ModelsCircumplex.tsx` so selecting a model renders the card.

**Verification:** lint + test + build + manual: select one model, see matrix + MDS + verdict render correctly. Select multiple models, see grid layout.

**[CHECKPOINT]**

### Wave D — Web: methodology panel + docs + polish

1. `cloud/apps/web/src/components/models/CircumplexMethodologyPanel.tsx` — collapsible; static copy per Decision 7.
2. `cloud/apps/web/src/components/models/CircumplexThresholdControl.tsx` — slider / number input for `minTrialsPerValue`.
3. `docs/schwartz-canonical-order.md` — per spec FR-021; cites `@valuerank/shared/schwartz` as source of truth.
4. Transient notice for silently-dropped ineligible selections (FR-011a).
5. URL-param handling for methodology open/closed (Decision 3).
6. Final lint + build + manual smoke test.

**Verification:** lint + test + build + preflight gate.

**[CHECKPOINT]**

---

## Risks

- **(HIGH) Live aggregation performance.** At ~30k transcripts per request we expect sub-second response, but we have not benchmarked. If wave A hits > 2s on local Postgres, add an early index on `(modelId, signature, scenarioId)` before proceeding. If still slow, fall back to a materialized-view approach (out of v1 scope).
- **(MEDIUM) Label drift.** Decision 6 centralizes the canonical order, but if a future feature adds a value to ValueRank without updating `@valuerank/shared/schwartz`, the circumplex page will silently drop it. Mitigate: unit test in `shared/schwartz.test.ts` asserts `SCHWARTZ_CIRCULAR_ORDER.length === 10` and enumerates the expected keys.
- **(MEDIUM) URL length.** Worst case ~400 chars with 11 selected models. Monitor; if users start selecting ≥ 20 models in practice, switch to sessionStorage for selection and URL for signature + threshold only.
- **(LOW) Inline SVG ergonomics.** Custom SVG means no built-in tooltip primitives; we'll hand-roll hover handlers. If this becomes unwieldy in wave C, escape hatch is to add `@visx/tooltip` (small add).
- **(LOW) MDS rotation non-determinism.** Classical MDS output can rotate/flip arbitrarily. Decision: anchor by rotating so Self-Direction's MDS position is at the top (theoretical 0°); flag if the rotation creates > 90° disagreement with theoretical order.

---

## Out of Scope (explicitly deferred)

- Pooled / across-models circumplex test.
- Cross-signature circumplex drift analysis.
- Circumplex-under-pressure (diagonal-only) analysis.
- Human-baseline overlay (needs external reference data).
- Non-metric MDS alternative.
- Materialized-view resolution of Decision 1's live-aggregation fallback.
- Permutation-based Spearman p-value (t-approximation used per spec assumption).

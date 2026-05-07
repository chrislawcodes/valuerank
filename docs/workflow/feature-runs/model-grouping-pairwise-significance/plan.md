# Implementation Plan: Model Grouping Pairwise Significance

**Branch:** `codex/model-grouping-pairwise-significance` | **Date:** 2026-05-07  
**Spec:** `docs/workflow/feature-runs/model-grouping-pairwise-significance/spec.md`

## Summary

Add a new report at the bottom of the existing `/models` page that answers one question:

**Which selected models make significantly different binary side choices on the same vignettes?**

The report uses the page header picker scope, one binary side choice per definition per model
(collapsed from all trials), an exact two-sided McNemar test, and Holm-Bonferroni correction
across all selected model pairs. The backend owns the math. The client renders a heatmap plus
a sortable table.

## Review Reconciliation (Gemini spec review, 2026-05-07)

- Finding 1 accepted: the metric is now explicit. The unit of analysis is one binary side choice
  per definition (vignette) per model. Multiple trials on the same definition are collapsed to a
  single choice (majority vote: wins > losses → chose own value).
- Finding 2 accepted: the report follows the same header-picker scope as the page — selected
  models, domain/all-domains, signature. It does NOT follow the `dataSource` toggle because
  the statistical test is always McNemar on binary choices, not continuous win rates.
- Finding 3 accepted: missing vignette coverage is a hard failure. If any selected model has no
  scored transcripts for a definition that other selected models have, the resolver fails loudly.
- Finding 4 accepted: the backend owns the test, correction, and effect size. The client renders.

## Methodology Correction (plan update, 2026-05-07)

The first plan draft incorrectly used:
- paired permutation test on value-key win rates (continuous)
- Cohen's d as effect size
- t-based mean difference confidence interval
- snapshot aggregate data (per-value-key, not per-definition)

The spec requires:
- exact two-sided McNemar test on paired binary choices (per-definition)
- matched-pairs odds ratio as effect size
- Woolf logit odds ratio confidence interval
- transcript-level data to produce one binary choice per definition per model

All references to permutation test, Cohen's d, mean difference, and effectSize in the earlier
plan and tasks are superseded by this document.

## Technical Context

| Aspect | Detail |
|---|---|
| Language | TypeScript (strict) |
| Web framework | React + urql + Vite |
| API framework | Pothos + Prisma |
| Existing page | `cloud/apps/web/src/pages/ModelsGroups.tsx` for `/models` |
| Existing filters | `selectedScope`, `selectedDomainId`, `selectedSignature`, model multiselect |
| New math owner | API resolver |
| Testing | Vitest (web and API) |
| Key helper | `resolveSignatureRuns` from `cloud/apps/api/src/graphql/queries/domain/shared.ts` |
| Key helper | `accumulateTranscriptCells` context + reuse from `transcript-cell-accumulator.ts` |
| Key helper | `resolveTranscriptDecisionModel` for binary outcome extraction |

## Architecture Decisions

### Decision 1: Keep the report inside `/models`

**Chosen:** Add the report as a new section at the bottom of the existing Model Groups page.

**Rationale:** The user defined it this way. The page already owns the relevant filters.

### Decision 2: Use the page header picker scope exactly

**Chosen:** The report uses selected models, domain/all-domains, and signature from the page header.
It does NOT follow the `dataSource` toggle. The report always uses binary side choices on
definitions, not continuous win rates from the existing log-odds or win-rate cluster view.

**Rationale:** McNemar on binary choices is a different analysis. Mixing it with the dataSource
toggle would imply it recomputes as the user toggles, which is wrong.

### Decision 3: One binary choice per definition per model

**Chosen:** For each (definition, model) pair, collapse all scored transcripts to a single binary
choice: wins > losses → chose own (canonical first) value; else → chose opponent value. Ties
default to opponent (conservative: no strong preference).

**Rationale:** This matches the spec's requirement to not over-weight vignettes with more trials.

### Decision 4: Data source is transcripts, not snapshot aggregates

**Chosen:** The resolver queries transcripts in batches (same 500-row batch pattern as
`domain-analysis-snapshot-builder.ts`) using `resolveSignatureRuns` to identify the run IDs.

**Rationale:** The existing snapshot only stores per-value-key aggregates. McNemar requires
per-definition paired binary choices. Snapshot data cannot reconstruct paired vignette outcomes.

The per-definition binary choice is extracted using:
- `filteredSourceRunDefinitionById` from `resolveSignatureRuns` — maps run IDs to definition IDs
- `getSnapshotValuePair` from `transcript-cell-accumulator.ts` — extracts canonical value pair
- `resolveTranscriptDecisionModel` — extracts canonical direction from `decisionMetadata`
- `assignOwnOpponent` — maps direction to own_picked / opponent_picked

The resolver builds a local `Map<"${definitionId}::${modelId}", {wins, losses}>` without levels
or value-key sub-keys (levels are not needed for McNemar).

### Decision 5: Missing coverage is a hard failure

**Chosen:** If any selected model has zero scored transcripts for a definition that the other
selected models cover, the resolver throws a loud ValidationError.

**Rationale:** Silent partial comparisons would produce misleading statistical results.

### Decision 6: Exact two-sided McNemar test

**Chosen:** For each model pair, use an exact binomial test on the discordant counts (b, c).
- `p = 2 * min(P(X ≤ min(b,c)), P(X ≥ max(b,c)))` where `X ~ Binom(b+c, 0.5)`
- When `b + c = 0` (perfect agreement): `p = 1.0`

**Rationale:** The spec explicitly requires this. The exact test is correct for small samples.
The permutation test used in the first draft is wrong for binary paired data.

### Decision 7: Matched-pairs odds ratio

**Chosen:** Effect size is `oddsRatio = c / b`.
- When `b = 0` and `c > 0`: OR is undefined (report null)
- When `b = 0` and `c = 0`: OR is 1.0 (no discordance, neutral)
- CI uses the Woolf logit method: `[exp(log(c/b) ± 1.96 * sqrt(1/b + 1/c))]`
- When b or c is 0, CI is null

**Rationale:** The spec requires matched-pairs OR. Cohen's d used in the first draft is wrong
for binary McNemar data.

### Decision 8: Weak band uses odds ratio thresholds

**Chosen:**
- `effectLabel = "Weak"` if OR in [0.5, 2.0]; `"Strong"` otherwise (always set)
- `verdict = "Significant"` if corrected p < 0.05 AND effectLabel = "Strong"
- `verdict = "Weak"` if corrected p < 0.05 AND effectLabel = "Weak"
- `verdict = "Not significant"` if corrected p ≥ 0.05

**Rationale:** The spec defines the weak band as OR 0.5–2.0. The first draft used |d| < 0.5
(Cohen's d threshold), which does not apply.

### Decision 9: Existing sort control and table patterns are reused

**Chosen:** The report table uses the app's standard sortable-table control and sort direction
indicator (↑/↓). No double-headed arrow icon.

## New GraphQL Shape

The row type gains three fields and changes two:

| Field | Old | New | Notes |
|---|---|---|---|
| `agreementRate` | — | `Float!` | concordant / n |
| `discordantAtoB` | — | `Int!` | b count |
| `discordantBtoA` | — | `Int!` | c count |
| `oddsRatio` | — | `Float` | c/b, null when undefined |
| `meanDifference` | `Float` | removed | was wrong methodology |
| `effectSize` | `Float` | removed | was Cohen's d, wrong |
| `confidenceIntervalLow/High` | `Float` | kept, now OR CI | Woolf method |

The client-side table gains columns for `agreement rate`, `discordant A→B`, `discordant B→A`,
and renames the effect-size column to `odds ratio`.

## Implementation Slices

### Slice A — API: math, resolver, types, and schema [CHECKPOINT]

Rework `math.ts`, the resolver, and the GraphQL types.

**Files:**
- `cloud/apps/api/src/services/model-grouping-significance/math.ts` (rewrite)
- `cloud/apps/api/src/graphql/queries/model-grouping-significance.ts` (rewrite resolver)
- `cloud/apps/api/src/graphql/types/model-grouping-significance.ts` (update fields)
- `cloud/apps/web/schema.graphql` (update SDL)
- `cloud/apps/api/tests/services/model-grouping-significance/math.test.ts` (update tests)
- new API integration test file under `cloud/apps/api/tests/graphql/queries/`

**Work:**
- `math.ts`: replace permutation + Cohen's d with `exactMcNemar(b, c)`,
  `matchedPairsOddsRatio(b, c)`, `oddsRatioCI(b, c, alpha)`, updated
  `classifyEffectSize` (OR-based), updated `classifyVerdict` (OR-based).
  Keep `holmBonferroni` unchanged.
- Resolver: query transcripts via `resolveSignatureRuns` → batch transcript read →
  build `Map<"${defId}::${modelId}", {wins, losses}>` → derive binary choices →
  McNemar per pair → Holm-Bonferroni → return rows with agreementRate, discordantAtoB,
  discordantBtoA, oddsRatio, OR CI.
- Types: add `agreementRate: Float!`, `discordantAtoB: Int!`, `discordantBtoA: Int!`,
  `oddsRatio: Float`; remove `meanDifference`, `effectSize`.
- schema.graphql: mirror type changes.

**Verification:**
- Math unit tests: exact binomial p-value, OR, Woolf CI, Holm-Bonferroni
- Resolver integration tests: happy path, missing coverage error, zero-discordance, 3+ pairs

### Slice B — Web: query layer, page wiring, and report shell [CHECKPOINT]

Update the GraphQL operation and run codegen.

**Files:**
- `cloud/apps/web/src/api/operations/modelGroupingSignificance.graphql` (update fields)
- `cloud/apps/web/src/api/operations/modelGroupingSignificance.ts` (re-export codegen)
- `cloud/apps/web/src/pages/ModelsGroups.tsx` (already wired; verify scope propagation)
- `cloud/apps/web/src/components/models/ModelGroupingSignificanceSection.tsx` (verify)

**Work:**
- Replace `meanDifference`, `effectSize` with `agreementRate`, `discordantAtoB`,
  `discordantBtoA`, `oddsRatio` in the .graphql query.
- Run codegen and confirm generated types compile.
- Verify `ModelsGroups.tsx` still passes correct scope variables.
- Verify `ModelGroupingSignificanceSection.tsx` still renders correctly with new shape.

**Verification:**
- codegen succeeds, no type errors
- web lint and build pass

### Slice C — Web: heatmap and sortable table [CHECKPOINT]

Update the heatmap color encoding and the table columns to match the new fields.

**Files:**
- `cloud/apps/web/src/components/models/ModelGroupingSignificanceHeatmap.tsx`
- `cloud/apps/web/src/components/models/ModelGroupingSignificanceTable.tsx`
- `cloud/apps/web/src/components/models/ModelGroupingSignificanceHeatmap.test.tsx`
- `cloud/apps/web/src/components/models/ModelGroupingSignificanceTable.test.tsx`

**Work:**
- Heatmap: color cells by `agreementRate` (not effectSize). Higher agreement = more muted/green.
  Significance border/badge unchanged. Hover text shows agreement rate and discordant counts.
- Table: add `agreement rate`, `discordant A→B`, `discordant B→A` columns.
  Rename `effect size` → `odds ratio` column; update formatters.
  Keep `effectLabel` and `verdict` columns. Remove meanDifference references.
- Update tests: fix test data to use new fields (no meanDifference/effectSize, use
  agreementRate/discordantAtoB/discordantBtoA/oddsRatio).

**Verification:**
- web lint, test (both component test files must pass), build

### Slice D — Copy, docs, and final verification [CHECKPOINT]

Review copy for accuracy. Run all checks.

**Files:**
- `cloud/apps/web/src/components/models/ModelGroupingSignificanceSection.tsx` (copy review)
- Possibly `docs/canonical-glossary.md` for small cross-reference

**Work:**
- Confirm the section copy says McNemar test (not permutation test) and binary side choices.
- Confirm no copy implies "better" model.
- Final lint + test + build for api and web.

## Data Flow

1. Page header picker → selected models, scope (domain/all-domains), signature
2. Page passes scope to `modelGroupingSignificance` query
3. Resolver calls `resolveSignatureRuns` → gets run IDs for the scope + signature
4. Resolver batch-queries transcripts for those run IDs
5. Per transcript: extract (definitionId, modelId, own_picked|opponent_picked)
6. Resolver groups to `Map<defId::modelId, {wins, losses}>` and derives binary choices
7. For each model pair: count concordant + discordant (b, c) across all definitions
8. Fail loudly if any selected model is missing definitions
9. Exact McNemar → raw p-value; Holm-Bonferroni → corrected p-value
10. OR = c/b; Woolf CI; classifyEffectSize and classifyVerdict
11. Client renders heatmap (color = agreementRate) + sortable table

## Testing Strategy

### API

- Math unit tests (math.test.ts):
  - `exactMcNemar(0, 0)` → 1.0
  - `exactMcNemar(0, 10)` → ~0.002 (exact binomial)
  - `exactMcNemar(5, 5)` → 1.0
  - `matchedPairsOddsRatio(4, 1)` → 0.25
  - `oddsRatioCI(b, c, 0.05)` → valid finite interval when both > 0
  - `holmBonferroni` unchanged, existing tests pass
  - `classifyEffectSize` with OR inputs (0.3 → "Strong", 1.5 → "Weak", 3.0 → "Strong")
  - `classifyVerdict` with OR inputs

- Resolver integration tests:
  - Happy path: 2 models, shared vignettes, correct McNemar result
  - Missing coverage: 1 model missing a definition → ValidationError
  - Zero discordance (b=c=0): rows render with p=1, OR=1, agreementRate=1
  - 3+ models: Holm-Bonferroni applies across all pairs

### Web

- Component tests:
  - Heatmap: color reflects agreementRate; significance badge present for Significant/Weak
  - Table: correct columns present (agreement rate, discordant A→B, B→A, odds ratio)
  - Table sort: all columns sortable; no double-headed arrow icon

## Risks

1. Transcript query on large domains may be slow compared to snapshot reads.
   Mitigation: use the same 500-row batch pattern as the snapshot builder.
2. When b or c is 0, the OR and CI are undefined. Show null gracefully.
3. The "Weak" label in the verdict column and the "Weak" effectLabel share the same word
   but refer to different things. The table layout must make this clear.
4. Existing tests for heatmap and table use `meanDifference` and `effectSize` fields that no
   longer exist. All those tests must be updated before the build passes.

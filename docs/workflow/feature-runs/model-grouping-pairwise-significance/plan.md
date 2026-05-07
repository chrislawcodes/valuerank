# Implementation Plan: Model Grouping Pairwise Significance

**Branch:** `codex/model-grouping-pairwise-significance` | **Date:** 2026-05-07  
**Spec:** `docs/workflow/feature-runs/model-grouping-pairwise-significance/spec.md`

## Summary

Add a new report at the bottom of the existing `/models` page that answers one question:

**Which selected models are statistically significantly different in their value preferences?**

The report uses the page header picker scope, one average win-rate score per vignette, a paired permutation test, and Holm-Bonferroni correction across all selected model pairs. The backend owns the math. The client renders a heatmap plus a sortable table.

## Review Reconciliation

- Gemini finding 1 accepted in plan form: the metric is now explicit. `score` means the existing equal-vignette **win rate of the value**.
- Gemini finding 2 accepted in plan form: the report follows the same header-picker scope as the page. That means selected models, domain/all-domains choice, signature, and any other header filters already on `/models`.
- Gemini finding 3 accepted in plan form: missing vignette coverage means the selected slice does not have a complete vignette set for every selected model. The resolver must fail loudly instead of dropping missing data.
- Gemini finding 4 accepted in plan form: the backend owns the pairwise permutation test, Holm-Bonferroni adjustment, effect size, and confidence interval. The client should not recompute the statistics.

## Technical Context

| Aspect | Detail |
|---|---|
| Language | TypeScript (strict) |
| Web framework | React + urql + Vite |
| API framework | Pothos + Prisma |
| Existing page | `cloud/apps/web/src/pages/ModelsGroups.tsx` for `/models` |
| Existing filters | `selectedScope`, `selectedDomainId`, `selectedSignature`, model multiselect, and the page `dataSource` toggle |
| Existing page controls | `AnalysisContextBar`, `ModelAnalysisSettingsBar`, `ModelGroupsSection`, `ModelSimilarityTableSection` |
| New math owner | API resolver |
| Testing | Vitest (web and API) |
| Data sensitivity | Medium-high, because the feature affects statistical interpretation |

## Architecture Decisions

### Decision 1: Keep the report inside `/models`

**Chosen:** Add the report as a new section at the bottom of the existing Model Groups page.

**Rationale:**
- The user asked for the report at the bottom of the Model Grouping page.
- The page already owns the relevant filters and selected models.
- Keeping the feature in-place avoids a new navigation surface.

### Decision 2: Use the page header picker scope exactly as-is

**Chosen:** The report uses the same scope as the rest of the page:
- selected models
- domain vs all-domains choice
- selected domain ID
- selected signature
- any other header picker state already wired into the page

**Rationale:**
- The user explicitly defined scope that way.
- The report should never compare a different slice than the rest of the page.

### Decision 3: The score is the existing equal-vignette win rate

**Chosen:** For each selected model and vignette, use the existing equal-vignette win-rate definition exactly as-is.

**Rationale:**
- This keeps the new report aligned with current `/models` semantics.
- It avoids inventing a new meaning for “score.”
- It keeps the pairwise test focused on value preference, not a new metric.

### Decision 4: Backend owns the stats

**Chosen:** The API computes the paired permutation test, p-values, Holm-Bonferroni correction, Cohen’s d, and the confidence interval. The web app only renders the returned results.

**Rationale:**
- One source of truth for the math.
- Lower risk of client/server drift.
- Easier to test and easier to explain.

### Decision 5: Missing coverage is a hard failure

**Chosen:** If the selected scope does not produce the same vignette set for every selected model, the resolver returns a loud error state.

**Rationale:**
- This matches the spec’s fail-loud rule.
- It prevents silent partial comparisons.

### Decision 6: Existing sort control and table patterns should be reused

**Chosen:** The report table uses the app’s standard sortable-table control and its current sort direction indicator pattern. Do not introduce a double-headed arrow icon.

**Rationale:**
- Keeps the UI consistent with the rest of the app.
- Reduces new interaction patterns for a simple reporting table.

## Implementation Slices

### Slice A — API: pairwise stats resolver and types [CHECKPOINT]

Estimated diff: ~250-350 lines

**Files likely involved:**
- `cloud/apps/api/src/graphql/types/models-analysis.ts`
- `cloud/apps/api/src/graphql/queries/models-analysis.ts`
- `cloud/apps/api/src/graphql/types/index.ts`
- `cloud/apps/api/src/graphql/queries/index.ts`
- `cloud/apps/web/schema.graphql`
- new API test file(s) under `cloud/apps/api/tests/`

**Work:**
- Extend the models-analysis GraphQL shape, or add a sibling field on the same page query, to return pairwise significance rows.
- Add a result type for pairwise rows, plus any required coverage metadata.
- Make the resolver consume the header-picker scope values passed from the page.
- Build the vignette-level win-rate inputs server-side.
- Run the paired permutation test and Holm-Bonferroni correction in the resolver.
- Return the corrected row results plus a hard error when coverage is incomplete.

**Key implementation rule:**
- The resolver should not return a partial “best effort” result when a selected model is missing vignettes in the current scope.

**Verification:**
- API unit/integration tests for:
  - complete coverage happy path
  - missing coverage error path
  - all-zero / tie rows
  - multiple pair correction

### Slice B — Web: query layer, page wiring, and report shell [CHECKPOINT]

Estimated diff: ~200-300 lines

**Files likely involved:**
- `cloud/apps/web/src/api/operations/modelsAnalysis.graphql`
- `cloud/apps/web/src/api/operations/modelsAnalysis.ts`
- `cloud/apps/web/src/pages/ModelsGroups.tsx`
- new web component file(s) under `cloud/apps/web/src/components/models/`

**Work:**
- Extend the page query to fetch the pairwise significance payload.
- Pass the current header-picker scope into the query.
- Add a new section component at the bottom of the page.
- Keep the existing page content above it unchanged.
- Show a simple empty state when fewer than two models are selected.

**Verification:**
- Web tests for:
  - section renders at page bottom
  - fewer than two models shows empty state
  - filters change the report scope

### Slice C — Web: heatmap and sortable table [CHECKPOINT]

Estimated diff: ~250-350 lines

**Files likely involved:**
- new component file(s) under `cloud/apps/web/src/components/models/`
- maybe a small shared table helper if the standard sort pattern needs it

**Work:**
- Render the pairwise heatmap with:
  - color = effect size
  - significance marker or border = Holm-Bonferroni result
  - signed direction visible in hover or cell copy
- Render the table with columns:
  - Model A
  - Model B
  - raw p-value
  - Holm-corrected p-value
  - effect size
  - effect label
  - confidence interval
- Make every column sortable.
- Keep the table as the source of truth.

**Verification:**
- Component tests for:
  - sort behavior
  - verdict labels
  - heatmap color/significance mapping
  - row hover details

### Slice D — Docs, copy, and final polish [CHECKPOINT]

Estimated diff: ~80-160 lines

**Files likely involved:**
- `docs/canonical-glossary.md` if the new methodology wording needs a small update
- page-level copy strings in the new component
- maybe `STATUS.md` if the feature is meaningfully complete at the end of this work

**Work:**
- Add the plain-language explanation for:
  - selected-model scope
  - one vignette = one unit
  - why weak differences are still shown
  - why missing coverage fails loudly
- Make sure the report wording does not imply “better.”

**Verification:**
- Copy review by grep and targeted UI test snapshots if needed

## Data Flow

1. The page header picker defines the scope.
2. The page passes that scope into the models-analysis query.
3. The API resolver loads only the selected slice.
4. For each model and vignette, the resolver computes the existing equal-vignette win-rate score.
5. The resolver builds paired differences for every selected model pair.
6. The resolver computes the paired permutation test, effect size, and CI.
7. Holm-Bonferroni adjusts the p-values across the selected pairs.
8. The client renders the heatmap and the sortable table.

## Testing Strategy

### API

- Add fixtures that cover:
  - 2-model happy path
  - 8-model full pair matrix
  - missing vignette coverage error
  - ties / zero differences
  - multiple-comparison correction
- Verify the resolver refuses to return a partial comparison set.

### Web

- Add a page test for `/models` with the new section visible.
- Add a component test for the sortable table.
- Add a component test for the heatmap cell encoding.
- Add a page test that changes the header picker and confirms the report scope changes with it.

## Risks

1. The page already has multiple control layers, so the new report could be confusing if the scope copy is not clear.
   verification: add a short scope summary directly above the report.
2. The table will grow quickly as models are selected.
   verification: make the heatmap the fast scan layer and keep the table compact.
3. The fail-loud rule could be too strict if the upstream slice is often incomplete.
   verification: add a focused missing-data test so we can see exactly what fails before implementing the UI.
4. The backend math will be more complex than the current `/models` payload.
   verification: keep the resolver pure where possible and cover the math with unit tests.


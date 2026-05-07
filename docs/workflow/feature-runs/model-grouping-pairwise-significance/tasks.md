# Tasks: Model Grouping Pairwise Significance

Plan: `docs/workflow/feature-runs/model-grouping-pairwise-significance/plan.md`  
Spec: `docs/workflow/feature-runs/model-grouping-pairwise-significance/spec.md`

Constraints: keep each slice small and focused. `[CHECKPOINT]` marks a diff-review boundary.

---

## Slice A — API: pairwise stats resolver, types, and schema [CHECKPOINT]

Estimated diff: ~300 lines. If the slice grows too large, split helper math into a separate service file before expanding the resolver.

### A1. Add pairwise significance GraphQL types

- [ ] Create `cloud/apps/api/src/graphql/types/model-grouping-significance.ts`.
- [ ] Define Pothos object types for the response shape:
  - `ModelGroupingSignificanceModel`
  - `ModelGroupingSignificanceRow`
  - `ModelGroupingSignificanceResult`
  - `ModelGroupingSignificanceHeatmapCell` if the resolver needs a small nested cell type
- [ ] Keep the type names aligned with the report name and avoid reusing the existing `modelsAnalysis` result names.
- [ ] Export the Refs from the new types file.
- [ ] Keep the file under 120 lines if possible.

### A2. Add pairwise significance resolver

- [ ] Create `cloud/apps/api/src/graphql/queries/model-grouping-significance.ts`.
- [ ] Register a new query field, `modelGroupingSignificance`.
- [ ] Query args should include:
  - `modelIds: [ID!]!`
  - `domainId: ID`
  - `signature: String`
- [ ] Read the selected scope from the same header-picker values the page already uses.
- [ ] Use the backend as the owner of the math. The resolver should return final pairwise rows, not ask the client to recompute significance.
- [ ] Use the existing equal-vignette win-rate definition exactly as-is for the model score used in the test.
- [ ] Compute one paired observation per vignette within the selected scope.
- [ ] Build the pairwise test internally:
  - paired permutation test
  - Holm-Bonferroni correction across all selected pairs
  - Cohen's d effect size
  - 95% confidence interval for the mean difference
- [ ] Return one row per model pair, with the verdict labels:
  - `Significant`
  - `Weak`
  - `Not significant`
- [ ] Return a loud error when the selected scope does not have complete vignette coverage for every selected model.
- [ ] Do not return a partial comparison set when coverage is incomplete.
- [ ] Do not expose raw vignette averages to the client as the main contract. Keep the client-facing payload to final pairwise rows plus minimal model labels / scope metadata.
- [ ] Keep the file under 300 lines by moving testable math into a service module if needed.

### A3. Add pure math helpers

- [ ] Create `cloud/apps/api/src/services/model-grouping-significance/math.ts`.
- [ ] Add pure helpers for:
  - building vignette-level model averages from the equal-vignette source data
  - paired permutation p-values
  - Holm-Bonferroni correction
  - Cohen's d
  - paired mean confidence intervals
- [ ] Keep the helpers free of I/O and logger imports.
- [ ] Reuse the project's strict typing rules; do not use `any`.

### A4. Register the new query in API wiring

- [ ] Add the new type import in `cloud/apps/api/src/graphql/types/index.ts`.
- [ ] Add the new query import in `cloud/apps/api/src/graphql/queries/index.ts`.
- [ ] Append the matching SDL to `cloud/apps/web/schema.graphql`.

### A5. Add API tests

- [ ] Add a happy-path API test for a complete selected slice.
- [ ] Add a missing-coverage test that proves the resolver fails loudly.
- [ ] Add a tie / zero-difference test.
- [ ] Add a multiple-comparison test with 3+ pairs.
- [ ] Add a test that proves the backend owns the math and the client does not need raw vignette values.

### A6. Verify Slice A

- [ ] `npm run lint --workspace @valuerank/api`
- [ ] `npm run test --workspace @valuerank/api`
- [ ] `npm run build --workspace @valuerank/api`
- [ ] Confirm the new GraphQL field is exposed in the compiled schema output.

**Slice A checkpoint.**

---

## Slice B — Web: query layer, page wiring, and section shell [CHECKPOINT]

Estimated diff: ~220 lines.

### B1. Add the web GraphQL operation

- [ ] Create `cloud/apps/web/src/api/operations/modelGroupingSignificance.graphql`.
- [ ] Query the new `modelGroupingSignificance` field with:
  - `modelIds`
  - `domainId`
  - `signature`
- [ ] Request only the fields needed for the heatmap, table, and scope copy.

### B2. Add the web operation re-export

- [ ] Create `cloud/apps/web/src/api/operations/modelGroupingSignificance.ts`.
- [ ] Re-export the generated GraphQL document and types.

### B3. Wire the page

- [ ] Update `cloud/apps/web/src/pages/ModelsGroups.tsx`.
- [ ] Pass the selected model IDs from the header picker into the new query.
- [ ] Pass the current header-picker scope into the new query.
- [ ] Keep the report scope aligned with the same page filters already used above it.
- [ ] Do not use the page's `dataSource` toggle for this report. The report always uses the existing equal-vignette win-rate metric.
- [ ] Add a bottom-of-page section mount point after the existing similarity table.
- [ ] Show a simple empty state when fewer than two models are selected.
- [ ] Surface the backend error as a loud report error rather than trying to recover locally.

### B4. Add the section shell

- [ ] Create `cloud/apps/web/src/components/models/ModelGroupingSignificanceSection.tsx`.
- [ ] Add the section title `Statistical Differences in Value Preferences`.
- [ ] Add the short scope summary copy:
  - only the selected models are compared
  - each vignette counts once
  - Holm-Bonferroni is applied across all selected pairs
- [ ] Keep the section layout as two parts:
  - pairwise heatmap
  - sortable table
- [ ] Make the table the source of truth.
- [ ] Keep the heatmap as a scan layer only.

### B5. Verify Slice B

- [ ] Run codegen for the web package.
- [ ] `npm run lint --workspace @valuerank/web`
- [ ] `npm run test --workspace @valuerank/web`
- [ ] `npm run build --workspace @valuerank/web`
- [ ] Confirm the new section appears at the bottom of `/models`.

**Slice B checkpoint.**

---

## Slice C — Web: heatmap and sortable results table [CHECKPOINT]

Estimated diff: ~280 lines.

### C1. Build the heatmap

- [ ] Create `cloud/apps/web/src/components/models/ModelGroupingSignificanceHeatmap.tsx`.
- [ ] Render a square matrix for the selected models.
- [ ] Use effect size for color.
- [ ] Use a border or icon to show significance after Holm-Bonferroni.
- [ ] Show signed direction in hover text or cell copy.
- [ ] Keep the diagonal muted or blank.
- [ ] Keep the heatmap compact enough to scan quickly.

### C2. Build the sortable table

- [ ] Create `cloud/apps/web/src/components/models/ModelGroupingSignificanceTable.tsx`.
- [ ] Include these columns:
  - `Model A`
  - `Model B`
  - `raw p-value`
  - `Holm-corrected p-value`
  - `effect size`
  - `effect label`
  - `confidence interval`
- [ ] Make every column sortable.
- [ ] Use the app's standard table sort control.
- [ ] Do not use the double-headed arrow icon.
- [ ] Show the verdict labels exactly as agreed:
  - `Significant`
  - `Weak`
  - `Not significant`
- [ ] Label rows with `Weak` when the corrected p-value is below 0.05 and `|d| < 0.5`.
- [ ] Keep the table as the source of truth if the heatmap and table ever feel redundant.

### C3. Add helper copy

- [ ] Add hover text or row copy that explains:
  - the mean difference
  - the confidence interval
  - why a row is significant or weak
- [ ] Keep the language short and plain.

### C4. Verify Slice C

- [ ] Add component tests for:
  - heatmap color and significance mapping
  - table sort behavior
  - verdict labels
  - confidence interval display
- [ ] `npm run lint --workspace @valuerank/web`
- [ ] `npm run test --workspace @valuerank/web`
- [ ] `npm run build --workspace @valuerank/web`

**Slice C checkpoint.**

---

## Slice D — Copy, docs, and regression coverage [CHECKPOINT]

Estimated diff: ~120 lines.

### D1. Add page copy that matches the methodology

- [ ] Update the new section copy so it clearly says the report uses the existing equal-vignette win rate.
- [ ] State that the selected header-picker scope controls the comparison.
- [ ] State that the report fails loudly if the selected slice is incomplete.
- [ ] Avoid any wording that implies the report is ranking models as better or worse.

### D2. Update glossary or doc wording if needed

- [ ] Update `docs/canonical-glossary.md` only if a short cross-reference is needed for the new report wording.
- [ ] Keep the terminology aligned with the existing win-rate definition.

### D3. Add regression coverage for the page scope

- [ ] Add a page test that changes the header picker and confirms the report scope changes with it.
- [ ] Add a test that proves a single selected model shows the empty state.
- [ ] Add a test that proves missing coverage produces the loud error.

### D4. Final verification

- [ ] Re-run the API and web test suites that changed.
- [ ] Re-run the relevant lint and build commands for touched workspaces.
- [ ] Confirm the report still sits at the bottom of the page and the rest of `/models` is unchanged.

**Slice D checkpoint.**


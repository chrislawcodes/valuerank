# Spec: Model Grouping Pairwise Significance

**Feature slug:** `model-grouping-pairwise-significance`  
**Created:** 2026-05-07  
**Status:** draft  
**Path:** Feature Factory (`docs/workflow/feature-runs/model-grouping-pairwise-significance/`)

## Background

The `/models` page already helps people scan model grouping, model similarity, and value-level summaries. What it does not yet answer is a different question:

**Which models are statistically significantly different in their value preferences?**

This report adds that answer to the bottom of the existing Model Groups page. It does **not** frame one model as better than another. It only asks whether two models behave differently enough that chance is a weak explanation.

The current `/models` API returns pooled win rates and domain breakdowns, but it does not provide the vignette-level data needed for a paired test. This feature therefore needs a new pairwise significance data path, either by extending the existing models-analysis response or by adding a sibling field on the same page query.

## Discovery: Assumptions Carried In

The user already made the key choices. Those choices are carried into this spec as assumptions:

1. The report lives at the bottom of the Model Groups page, not on a new page.
2. The report uses only the models currently selected in the page filter.
3. The unit of analysis is one average score per vignette per model.
4. Vignettes must not be overweighted just because they have more trials.
5. The statistical test is a paired permutation test.
6. Multiple pairwise tests use Holm-Bonferroni correction.
7. The report compares all selected model pairs.
8. The report shows all differences, but small effects are labeled `Weak`.
9. Missing vignette data is not allowed. The report must fail loudly.
10. Ties and zero-difference rows are allowed.
11. The significance cutoff is `alpha = 0.05`.
12. The table uses the standard sortable-table control already used elsewhere in the app. Do not use a double-headed arrow icon.

## Product Goal

The report should let a researcher answer, quickly and honestly:

1. Which selected models are different from each other?
2. How strong is each difference?
3. Which differences still hold after correcting for many comparisons?
4. Which differences are small enough that the app should label them as weak?

The report should be readable at a glance, but the table should stay the source of truth.

## In Scope

- A new significance report at the bottom of the `/models` page
- Pairwise comparisons for the currently selected models
- A heatmap overview plus a sortable results table
- A loud error state when vignette coverage is missing
- Table copy and labels for `Significant`, `Weak`, and `Not significant`
- Tests that lock in the methodology and the fail-loud behavior

## Non-Goals

- No new top-level page or navigation item
- No change to the Model Groups clustering math
- No change to the existing similarity table
- No change to the domain-analysis reports
- No pooled-count shortcut that reweights vignettes by trial count
- No silent gap filling when data is missing

## Methodology

### Unit of analysis

For each selected model, compute **one average score per vignette**.

Plain English:

- if a vignette has 1 trial, that one trial sets the vignette average
- if a vignette has 5 trials, those 5 trials are averaged together first
- each vignette still counts once in the model comparison

This is the rule that keeps the report from over-weighting vignettes with more trials.

### Pairwise comparison

For each model pair:

1. Line up the same vignette set for both models.
2. Subtract one model's vignette average from the other model's vignette average.
3. Use those paired differences as the input to the test.
4. Run a **two-sided paired permutation test**.

The pair order should be alphabetical by model name by default. The sign of the mean difference must follow that order:

- positive means `Model A` is higher than `Model B`
- negative means `Model A` is lower than `Model B`

### Multiple comparisons

Because the report compares many model pairs, the raw p-values must be adjusted with **Holm-Bonferroni** across all selected pairs in the current view.

### Effect size

Report **Cohen's d** for the paired vignette differences.

The table should show:

- the numeric effect size
- a short effect label

For this report:

- `Weak` means `|d| < 0.5`
- `Strong` means `|d| >= 0.5`

### Row verdict

The verdict column should use only these labels:

- `Significant`
- `Weak`
- `Not significant`

The verdict should follow both the corrected p-value and the effect size:

- `Significant` = corrected p-value is below `0.05` and `|d| >= 0.5`
- `Weak` = corrected p-value is below `0.05` and `|d| < 0.5`
- `Not significant` = corrected p-value is `>= 0.05`

### Confidence interval

Show a **95% confidence interval for the mean difference** between the two models.

The CI should be based on the paired vignette differences, not on pooled raw transcripts.

### Missing data

Missing vignette data is a hard failure.

The report must not:

- silently drop missing vignettes
- silently compare only the overlapping subset
- silently pad missing values with zeros

If the selected models do not all have the same vignette coverage for the current scope, the report must show an error state and stop.

### Ties and zero differences

Ties are allowed.

If the paired differences are all zero for a pair, the row should still render, with:

- p-value showing no significance
- effect size showing zero or the chosen zero-equivalent format
- confidence interval centered on zero

## UI Requirements

### Placement

- Add the report as the last section on the existing `/models` page.
- Keep the current Model Groups section and the similarity table above it.
- Do not create a separate route.

### Title

The section title must be:

- `Statistical Differences in Value Preferences`

### Layout

The section should have two main parts:

1. A pairwise heatmap for a quick scan
2. A sortable table as the source of truth

### Heatmap

The heatmap should be a square matrix of the selected models.

Requirements:

- color encodes effect size
- border or icon encodes significance after Holm-Bonferroni
- the diagonal can be blank or muted because a model compared with itself is not useful here
- hovering a cell should show the same key stats as the table row

### Table

The table must include these columns:

1. `Model A`
2. `Model B`
3. `raw p-value`
4. `Holm-corrected p-value`
5. `effect size`
6. `effect label`
7. `confidence interval`

The table is the source of truth. The heatmap is only a scan layer.

### Sorting

- Every column must be sortable.
- Default sort should be alphabetical by model pair.
- Use the app's standard sort control for tables.
- Do not use the double-headed arrow icon.

### Scope copy

The section should say, in plain language, that:

- only the selected models are compared
- each vignette counts once
- the report is corrected for multiple comparisons

### Error state

If data is missing, the report must show a loud error that explains the problem in plain English.

The error should say that pairwise significance could not be computed because vignette coverage is incomplete.

## Data Contract

The current `modelsAnalysis` payload is not enough by itself for this report. It only gives pooled win rates and domain breakdowns.

The new data path must provide enough information to compute pairwise significance from vignette-level averages.

At minimum, the backend must provide:

- the selected model IDs and labels
- the vignette IDs in the current scope
- the average score per vignette per selected model
- the pairwise test result for each model pair
- the corrected p-value for each pair
- the effect size and confidence interval for each pair
- a hard error when vignette coverage is incomplete

The client should not try to rebuild the statistics from partially shaped data.

## User Stories

### US-1 — See which selected models differ (P1)

As a researcher, I want to see all pairwise model differences so I can tell which models behave differently in value preference.

**Acceptance scenarios**

1. **Given** I open `/models` with at least two models selected, **when** the page loads, **then** I see the new report at the bottom of the page.
2. **Given** the report is visible, **when** I scan the heatmap, **then** I can quickly see which model pairs have larger or smaller differences.
3. **Given** the report is visible, **when** I read the table, **then** I can see every selected model pair and its test result.

### US-2 — Use the same vignette once, not many times (P1)

As a researcher, I want each vignette to count once so that a busy vignette does not dominate the result just because it has more trials.

**Acceptance scenarios**

1. **Given** a vignette has multiple trials for one model, **when** the report computes the pairwise test, **then** those trials are averaged before the comparison.
2. **Given** one vignette has more trials than another, **when** the report computes the comparison, **then** the larger trial count does not give that vignette extra weight.

### US-3 — Fail loudly on missing data (P1)

As a researcher, I want the report to stop if vignette coverage is incomplete so I do not trust a partial answer.

**Acceptance scenarios**

1. **Given** one selected model is missing a vignette that another selected model has, **when** the report tries to load, **then** I see a clear error instead of a partial table.
2. **Given** the data are incomplete, **when** I inspect the page, **then** the report does not silently drop the missing vignette and continue.

### US-4 — Read weak differences quickly (P2)

As a researcher, I want small but significant differences to be labeled as weak so I do not overread them.

**Acceptance scenarios**

1. **Given** a pair has a corrected p-value below `0.05` and `|d| < 0.5`, **when** the table renders, **then** the verdict says `Weak`.
2. **Given** a pair has a corrected p-value below `0.05` and `|d| >= 0.5`, **when** the table renders, **then** the verdict says `Significant`.
3. **Given** a pair is not significant after correction, **when** the table renders, **then** the verdict says `Not significant`.

## Acceptance Criteria

1. The `/models` page shows a new `Statistical Differences in Value Preferences` section at the bottom.
2. The section uses only the models selected in the page filter.
3. Each vignette is averaged once per model before any comparison is run.
4. The report compares all selected model pairs.
5. The report uses a two-sided paired permutation test.
6. Holm-Bonferroni correction is applied across the selected pairwise tests.
7. The table shows `Model A`, `Model B`, raw p-value, Holm-corrected p-value, effect size, effect label, and confidence interval.
8. The table is sortable by every column using the app's standard sort control.
9. The heatmap uses effect size for color and significance for the visible marker or border.
10. `Weak` is used for significant rows with `|d| < 0.5`.
11. Missing vignette coverage produces a loud error state.
12. Ties and zero-difference rows still render.
13. The report never silently reweights a vignette because it has more trials.
14. The report does not change the existing Model Groups clustering or similarity reports.

## Risks

- A table with 8 selected models produces 28 pairwise rows, so the page can get busy fast.
- If the heatmap is too dense, readers may ignore the table and overread the scan layer.
- A loud error on missing data is correct, but it may frustrate users if the upstream data are often incomplete.
- The distinction between `Weak` and `Not significant` must stay very clear or readers may misread the verdict column.

## Likely Files

- `cloud/apps/web/src/pages/ModelsGroups.tsx`
- `cloud/apps/web/src/components/models/ModelGroupsSignificanceSection.tsx`
- `cloud/apps/web/src/components/models/PairwiseSignificanceHeatmap.tsx`
- `cloud/apps/web/src/components/models/PairwiseSignificanceTable.tsx`
- `cloud/apps/web/src/api/operations/modelsAnalysis.ts`
- `cloud/apps/api/src/graphql/queries/models-analysis.ts`
- `cloud/apps/api/src/graphql/types/models-analysis.ts`
- `cloud/apps/web/tests/pages/ModelsGroups.test.tsx`
- `cloud/apps/web/tests/components/PairwiseSignificanceTable.test.tsx`
- `cloud/apps/api/tests/graphql/queries/models-analysis.test.ts`


# Spec: Equal-Vignette Reporting

**Feature slug:** `equal-vignette-reporting`  
**Created:** 2026-04-30  
**Status:** draft  
**Workflow:** Feature Factory

## Background

ValueRank currently has two different win-rate methodologies showing up in model-reporting surfaces:

1. the newer **equal-vignette** path, where runs are averaged within each vignette and each vignette counts once
2. the older **count-based** path, where pooled `prioritized / (prioritized + deprioritized + neutral)` counts can overweight vignettes that happened to receive more trials

This mismatch is visible on `/models`, where the `All domains value priorities` table and the `Model preference table` can disagree for the same model/value cell.

The domain-analysis snapshot pipeline already computes the methodology we want. The remaining problem is that some reporting surfaces still recompute win rates from pooled counts or retain backward-compatibility fallbacks that preserve the older weighting behavior.

## Discovery: Assumptions Carried In

Requirements are stable enough to draft the spec without more questions. These assumptions are carried in explicitly:

1. Canonical reporting metric is equal-weight by vignette after equal-weight pooling across runs within each vignette.
2. Extra trials within one vignette must not increase that vignette's weight.
3. Domains currently have equal vignette counts, so equal-domain and global equal-vignette summaries are equivalent in today's data, but the implementation should still encode the equal-vignette rule rather than rely on that balance forever.
4. This feature standardizes existing model-reporting surfaces. It does not redesign unrelated analytics reports.

## Product Goal

All model-reporting surfaces that present cross-vignette value win rates should use one shared methodology:

- average runs equally within each vignette
- average vignettes equally
- for cross-domain summaries, average domain vignette-level win rates consistently

For the reports in scope, a user should no longer be able to find one cell on `/models` where the two tables disagree because they are using different weighting rules.

## In Scope

- `/models` page reporting consistency
- `/domains/analysis` value-priorities consistency with the same methodology
- `modelsAnalysis` compatibility behavior for legacy snapshots, if that behavior currently preserves the old count-based metric
- user-facing copy and docs that define the reporting methodology for these surfaces
- tests that lock in the equal-vignette methodology

## Out Of Scope

- launch planning, batch-counting, or run orchestration
- pressure sensitivity, condition-level detail views, or other reports that intentionally use a different unit of analysis
- broad GraphQL renames or schema cleanups unless required for clarity

## Canonical Metric Definition

For a given `model × value`:

### Step 1 — Within-vignette run pooling

If a vignette has multiple runs or trial batches, compute that vignette's win rate as the simple mean of its run-level win rates.

Plain-language meaning:

> A vignette with 5 runs should not count 5 times as much as a vignette with 1 run.

### Step 2 — Within-domain vignette pooling

For one domain, compute the domain value win rate as the simple mean of the vignette win rates for that `model × value`.

Plain-language meaning:

> Each vignette in the domain counts once.

### Step 3 — Cross-domain reporting

For cross-domain reporting surfaces, compute the final value as the equal-vignette average across all eligible domains.

Implementation note:

- when all domains have equal vignette counts, this is numerically identical to a simple mean of domain win rates
- if domain vignette counts ever drift, the reporting methodology must still follow equal-vignette weighting rather than silently changing meaning

## Non-Canonical Metric

The following metric is **not** canonical for the reporting surfaces in scope:

```text
prioritized / (prioritized + deprioritized + neutral)
```

when `prioritized`, `deprioritized`, and `neutral` are pooled across multiple vignettes that may have received different numbers of runs.

This count-based recomputation can overweight vignettes that happened to accumulate more trials and must not be used as the displayed methodology for the in-scope model-reporting surfaces.

## User Stories

### US-1 — `/models` tables agree on one methodology (P1)

As a researcher, I want the two main `/models` reports to use the same weighting rule so I can trust that a cell means the same thing in both places.

**Acceptance scenarios**

1. **Given** I open `/models`, **when** I compare the same `model × value` cell between `All domains value priorities` and `Model preference table`, **then** the values come from the same underlying methodology.
2. **Given** a vignette has more runs than another vignette, **when** both contribute to a reported cell, **then** the higher-run vignette does not get extra weight.
3. **Given** formatting differs between tables, **when** the underlying metric is the same, **then** any visible difference is explainable by formatting only, not methodology.

### US-2 — Domain analysis stays aligned (P1)

As a researcher, I want the domain-analysis value priorities report to use the same methodology as the model-analysis reporting surfaces so the product does not contradict itself.

**Acceptance scenarios**

1. **Given** a value-priorities table is built from model reporting data, **when** win rates are present from the equal-vignette snapshot path, **then** the UI uses that path instead of recomputing from pooled counts.
2. **Given** legacy data exists, **when** equal-vignette data is unavailable, **then** the product does not silently mix methodologies within the same report without explicit code and test coverage.

### US-3 — Users can understand the metric (P2)

As a researcher, I want tooltips and docs to describe the actual weighting rule so I do not infer the wrong methodology from old wording.

**Acceptance scenarios**

1. **Given** I open a model-value detail surface, **when** I read the win-rate explanation, **then** it explains equal run weighting within vignette and equal vignette weighting in the report.
2. **Given** I read the glossary or reporting docs, **when** they define the in-scope win-rate metric, **then** they match the canonical equal-vignette methodology.

## Affected Surfaces

### 1. `/models`

Current production behavior:

- `All domains value priorities` is built from `DomainAnalysis` snapshot data and currently recomputes `winRates` from pooled counts in `Models.tsx`
- `Model preference table` reads `modelsAnalysis` and uses `pooledWinRate`

Required outcome:

- both tables read the equal-vignette methodology
- any remaining display difference should be formatting only

### 2. `/domains/analysis`

Current behavior:

- `DomainAnalysis.tsx` already prefers `modelsAnalysis.pooledWinRate`
- it still retains a count-based fallback when equal-vignette values are missing

Required outcome:

- confirm whether the fallback should remain as temporary legacy support or be removed from the canonical reporting path

### 3. `modelsAnalysis` API resolver

Current behavior:

- newer snapshots use `valueWinRates` and `vignetteCount`
- older snapshots can still fall back to pooled counts
- this fallback can currently happen per value, not only per snapshot

Required outcome:

- decide and implement the correct legacy policy for this feature:
  - preferred: do not silently mix methodologies within one row; if equal-vignette data is unavailable, return `null` for the reporting metric and rely on snapshot rebuild / refresh
  - acceptable transitional option: retain a temporary compatibility fallback only if it is clearly documented, explicitly tested, and not presented as the canonical metric

## Implementation Notes

The domain-analysis snapshot pipeline already computes the desired math in:

- `cloud/apps/api/src/services/analysis/domain-analysis-snapshot-aggregator.ts`

That pipeline should remain the source of truth unless the implementation uncovers a real bug in the aggregation itself.

The main expected implementation work is:

1. remove count-based recomputation from in-scope reporting UIs
2. tighten or remove legacy fallbacks that preserve the old weighting
3. update tests and explanatory copy

## Acceptance Criteria

1. On `/models`, both main tables use the equal-vignette methodology for the same `model × value` cells.
2. The in-scope reporting metric does not overweight vignettes with more trials.
3. Cross-domain reporting follows equal-vignette weighting even if domain vignette counts drift in the future.
4. Any retained fallback for legacy snapshots is explicit, scoped, and covered by tests; silent mixed-method rows are not allowed.
5. User-facing methodology explanations for the in-scope reports match the implemented weighting rule.

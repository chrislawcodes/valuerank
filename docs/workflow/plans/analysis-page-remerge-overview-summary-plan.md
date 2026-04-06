# Analysis Page Remerge And Overview Summary Plan

## Why We Want This

The temporary split between `Analysis` and `Analysis (Old V1)` solved a transition problem, but it is now creating a product problem.

Right now:

- the new `Analysis` page has better semantics for preference, repeatability, and eligible pooled aggregates
- the old V1 page has better texture for condition detail, decision frequency, and transcript drilldown
- users have to decide which page to trust
- the new page still feels too close to a second version of the old decisions surface
- the split adds routing, testing, migration, and maintenance complexity

The goal of this feature is to go back to one primary `Analysis` page, keep the better semantics, keep the useful V1 drilldowns, and make the `Overview` tab clearly answer:

1. what does the model prefer overall?
2. how repeatable is that preference?
3. is low repeatability mostly because the model is torn, or because it is noisy?

The summary should stay readable at a high-school reading level.

## Product Direction

We are no longer treating the V2 page as a separate long-term destination.

We are merging the useful semantics back into the main analysis experience:

- remove the temporary V2-only `Analysis` split
- rename `Analysis (Old V1)` back to `Analysis`
- hard-remove `/analysis-v1` routes
- keep one route family and one primary analysis entry point

This is a consolidation step, not a redesign of the whole analysis product.

## Authoritative Surviving Implementation

The surviving detail shell is the current V1 shell:

- [Analysis.tsx](/Users/chrislaw/valuerank-vignette-analysis/cloud/apps/web/src/pages/Analysis.tsx)
- [AnalysisDetail.tsx](/Users/chrislaw/valuerank-vignette-analysis/cloud/apps/web/src/pages/AnalysisDetail.tsx)
- [components/analysis/*](/Users/chrislaw/valuerank-vignette-analysis/cloud/apps/web/src/components/analysis)

The surviving tab stack is the current V1 tab stack:

- `Overview`
- `Decisions`
- `Scenarios`
- `Stability`

The temporary V2 split is not the surviving shell.

This means:

- keep the current V1 detail-page behavior as the base
- move that behavior back under the canonical `Analysis` route family and filenames
- port in the newer semantic data and summary behavior where needed
- delete the temporary V2-only route/page split after migration

The temporary V2 helper that may survive is:

- [analysis-v2/analysisSemantics.ts](/Users/chrislaw/valuerank-vignette-analysis/cloud/apps/web/src/components/analysis-v2/analysisSemantics.ts)

if it is still the cleanest owner of summary parsing and semantic mapping.

The temporary V2 page shell does **not** survive.
The temporary V2 tab components do **not** survive.

The following are removed after migration:

- [AnalysisV1.tsx](/Users/chrislaw/valuerank-vignette-analysis/cloud/apps/web/src/pages/AnalysisV1.tsx)
- [AnalysisDetailV1.tsx](/Users/chrislaw/valuerank-vignette-analysis/cloud/apps/web/src/pages/AnalysisDetailV1.tsx)
- [analysis-v2/AnalysisPanel.tsx](/Users/chrislaw/valuerank-vignette-analysis/cloud/apps/web/src/components/analysis-v2/AnalysisPanel.tsx)
- [analysis-v2/tabs/*](/Users/chrislaw/valuerank-vignette-analysis/cloud/apps/web/src/components/analysis-v2/tabs)
- all `/analysis-v1` route wiring

## Core UX Decision

The top of the `Overview` tab should become the summary-first surface.

The new summary table sits **above** the existing `Decision Frequency` table.

The existing `Decision Frequency` section stays as a useful drilldown because it lets users scan raw decision shape quickly.

The summary table answers the high-level question.
The decision frequency table helps explain it.

## Locked Product Decisions

### Routes

- `/analysis` stays as the main analysis list route
- `/analysis/:id` stays as the main analysis detail route
- `/analysis-v1`
- `/analysis-v1/:id`
- `/analysis-v1/:id/transcripts`

All `/analysis-v1` routes are hard-removed.
Do not keep redirects.
Do not keep aliases.

The removal behavior is also locked:

- removed `/analysis-v1` URLs must not silently redirect to `/`
- removed `/analysis-v1` URLs must not silently redirect to `/analysis`
- they should fall through to the app’s normal not-found behavior

If the current catch-all redirect prevents that, this feature must explicitly add a not-found path that preserves the “no redirects” requirement for removed V1 routes.

### Unified Behavior

- eligible same-signature baseline aggregates appear on the unified `Analysis` page
- ineligible and legacy aggregates keep the same blocked-state semantics already defined by aggregate metadata
- `Stability` tab stays in place
- transcript drilldowns keep using the standard transcript page

Important:

- “unified” means one page shell and one route family
- it does **not** mean every repeat-derived submetric must be available for aggregates in this slice
- it does mean the surviving tab stack is the current V1 tab stack

### Overview Summary Table

The new summary table is placed above the existing `Decision Frequency` section on `Overview`.

The locked columns are:

- `Model`
- `Preference`
- `Decision Consistency`
- `Value Consistency`
- `Stable %`
- `Torn %`
- `Noisy %`

### Preference Column Format

`Preference` uses the combined format:

- favored value name
- signed distance from neutral
- plain-English strength label

Example:

- `Fairness (+1.20, Strong)`

This replaces the need for separate `Signed Center`, `Preference Strength`, `Top Prioritized Values`, or `Top Deprioritized Values` in the summary table.

### Repeatability Columns

`Decision Consistency`, `Value Consistency`, `Stable %`, `Torn %`, and `Noisy %` appear for all runs.

For runs that are viewable on the unified page:

- `Preference` renders from the newer preference summary when available
- repeat-derived columns render from repeatability data when available

When repeat data is truly missing:

- show `—`

When some repeat evidence exists but the repeat-derived metric is not publishable:

- still show `—`
- tooltip/details must explain whether this is:
  - no repeat data
  - some repeat data, but below threshold
  - not available for this run type in this slice

Do not hide the table.
Do not hide the row.

This table does **not** bypass page-level blocked states for:

- ineligible aggregates
- legacy aggregates
- other runs that remain fully blocked by the existing analysis contract

Those still show their blocked state at the page level.

### Exact Metric Mapping

The summary table must use the existing published semantics directly.

- `Preference`:
  - source: `preferenceSummary.perModel[modelId]`
- `Decision Consistency`:
  - source: `reliabilitySummary.perModel[modelId].baselineReliability`
- `Value Consistency`:
  - source: `reliabilitySummary.perModel[modelId].directionalAgreement`

Do not invent new summary-level consistency formulas in the page layer.

`Decision Consistency` and `Value Consistency` render as percentages.

If their source metric is null:

- render `—`
- use tooltip/details for the reason

### Stable / Torn / Noisy Display

`Stable %`, `Torn %`, and `Noisy %` show:

- percentage in the cell
- count in tooltip/details

Example:

- cell: `48%`
- details: `12 of 25 repeated conditions`

These columns are mutually exclusive and exhaustive over the classified denominator.

For rows where classification is unavailable in this slice:

- render `—`

### Exact Stable / Torn / Noisy Contract

For this feature, `Stable %`, `Torn %`, and `Noisy %` are a rollup of **condition-level** classifications.

The denominator is:

- repeated baseline conditions for that model
- with `sampleCount >= 2`
- and a valid condition-level classification

The categories are mutually exclusive and exhaustive over that denominator:

- `Stable + Torn + Noisy = 100%`

First-pass classification uses existing per-condition repeatability fields from the worker’s repeat-analysis surface for non-aggregate runs:

- `directionalAgreement`
- `medianSignedDistance`
- `neutralShare`

First-pass classification rules:

- `Stable`
  - `directionalAgreement >= 0.80`
- `Torn`
  - `directionalAgreement < 0.80`
  - and `abs(medianSignedDistance) < 0.35`
  - and not captured by the stable close-call rule below
- `Noisy`
  - `directionalAgreement < 0.80`
  - and `abs(medianSignedDistance) >= 0.35`

Stable close-call rule:

- if `neutralShare >= 0.60`
- and `abs(medianSignedDistance) < 0.20`
- classify as `Stable`, not `Torn`

This keeps “close to the middle, but consistently so” from being mislabeled as torn.

### Aggregate Rule For Stable / Torn / Noisy

These three columns are **not** computed for eligible aggregates in this slice.

Reason:

- the current aggregate repeatability surfaces do not preserve run boundaries in a way that is safe for condition-level torn/noisy classification

So for eligible aggregates:

- `Preference` can render
- `Decision Consistency` can render
- `Value Consistency` can render
- `Stable %`, `Torn %`, `Noisy %` render as `—`
- tooltip/details explain that condition-level torn/noisy rollups are not available yet for pooled aggregates

This is intentional.
It avoids folding cross-run drift into condition-level instability labels.

### Drilldown Behavior

Clicking a `Stable %`, `Torn %`, or `Noisy %` cell should:

- open the existing transcript drilldown page
- use the standard transcript format
- filter to the matching conditions for that category

This is not an inline drawer.
This is not a modal.

Exact drilldown contract for this slice:

- route stays the standard transcript route
- add query params:
  - `modelId=<modelId>`
  - `repeatPattern=stable|torn|noisy`
  - `conditionIds=<comma-separated canonical condition ids>`

`conditionIds` is the source of truth for the transcript filter.

For this slice, canonical condition id means the baseline `scenarioId`.
Do not introduce a second condition-identity scheme for this drilldown.

`repeatPattern` is used for header/context copy only.

The landing page remains the standard transcript list in the existing transcript format.

The transcript page must add first-class support for this filter contract.

This is not satisfied by generic pivot-cell filtering alone.

Required behavior:

- if `repeatPattern` and `conditionIds` are present
- the transcript page filters to those exact condition ids
- the standard transcript list remains the visible result
- aggregate signature switching must preserve the repeat-pattern drilldown contract when it stays valid for the selected signature
- `—` cells must not navigate and must not emit these params

### Confidence Context

Users want to know not just the percentage, but how much evidence supports the classification.

The table or nearby summary helper must also expose:

- how much run-level evidence contributed
- how many repeated conditions reached the stronger-confidence threshold

For this feature, the stronger-confidence threshold is:

- `10+` repeats on a condition

This does **not** replace the main `Stable %`, `Torn %`, `Noisy %` columns.
It provides evidence context for interpreting them.

Placement is locked:

- global evidence context appears in a short helper line directly above the summary table
  - normal runs: show completed batch count
  - eligible aggregates: show contributing source-run count
- per-model confidence context appears in the tooltip/details for `Stable %`, `Torn %`, and `Noisy %`

Do not scatter this evidence context into unrelated page sections.

For runs where category percentages render as `—`, the tooltip/details must still say why:

- no repeat data
- some repeat data but not enough to publish
- not available for pooled aggregates in this slice

### Interpretation Principle

`Torn` and `Noisy` are condition-level patterns that roll up into a model-level summary.

We are **not** claiming a model is globally “a torn model” or “a noisy model.”

We are saying:

- what share of repeated conditions look stable
- what share look boundary-sensitive / torn
- what share look noisy / unstable

High variability is still a valid finding.
Warnings and pattern labels must not imply the result is fake or invalid.

## Summary Table Meaning

### Preference

This means:

- which value the model leans toward overall
- how far from neutral it tends to sit on average

Example:

- `Fairness (+1.20, Strong)` means the model leans toward `Fairness` and sits meaningfully away from neutral in that direction.

### Decision Consistency

This means:

- when the same condition is repeated, how similar are the repeated scores?

High:

- repeated scores stay close together

Low:

- repeated scores move around more

### Value Consistency

This means:

- when the same condition is repeated, how often does the model stay on the same side/value?

High:

- repeated answers usually stay on the same value side

Low:

- repeated answers often flip values

### Stable / Torn / Noisy

These are rollups of repeated-condition classifications:

- `Stable %`: repeated conditions that look settled
- `Torn %`: repeated conditions that look close to the decision boundary and flip because the tradeoff is close
- `Noisy %`: repeated conditions that swing more widely and look unstable

This helps users distinguish:

- low consistency because the model is genuinely torn
- low consistency because the model is noisy

These overview categories are a higher-level summary only.
They are not a replacement for the deeper metrics shown in `Stability`.

## Classification Direction

This feature depends on condition-level classification that already uses repeat structure.

The plan does **not** require a brand-new statistical architecture.
It does require a product-facing rollup that is explicit and reviewable.

The intended interpretation is:

- `Stable`: repeated answers stay reasonably close and do not behave like a close-call flip or a wide swing
- `Torn`: repeated answers often cross sides because the condition sits near the boundary
- `Noisy`: repeated answers swing enough that the instability is not well-explained by simple close-call behavior

The implementation should use the existing repeatability surfaces as much as possible for non-aggregate runs.
Do not duplicate unrelated semantic logic in a second path if an existing repeat-analysis surface already provides the needed evidence.

## Where The New Summary Lives

The merged `Overview` tab order should become:

1. summary table
2. decision frequency table
3. the rest of the existing `Overview` content that still belongs there after consolidation

This is a prioritization change.
It is not a full tab redesign.

## Tabs

### Overview

Becomes the primary summary surface.

Top:

- new summary table

Below:

- existing `Decision Frequency`
- existing supporting content that still fits `Overview`

### Decisions

Remains available.

Keep the current decision-distribution and reliability-oriented content that still makes sense after the page consolidation.

The authoritative `Decisions` tab is the current V1 `Decisions` tab implementation in `components/analysis/*`, not the temporary V2 tab.

### Stability

Keep it the way it is.

This feature does not redesign or remove the `Stability` tab.

The authoritative `Stability` tab is the current V1 `Stability` tab implementation in `components/analysis/*`.

`Stability` remains a deeper repeatability drilldown surface using its existing vocabulary and metrics.

Important relationship to `Overview`:

- `Overview` uses `Stable % / Torn % / Noisy %` as a high-level condition-classification summary
- `Stability` remains the lower-level diagnostic view using directional agreement, signed distance, and related detail

These are intentionally different levels of analysis.
`Overview` summarizes.
`Stability` explains.

For this remerge slice, `Stability` keeps its current aggregate behavior from the surviving V1 shell.

This means the product rule is:

- eligible aggregates are unified into the main page for `Overview` and the rest of the surviving page shell
- `Stability` still behaves the same way it already does in the surviving V1 shell for this slice
- the page does not promise that `Stable / Torn / Noisy` and `Stability` are identical classifications

### Scenarios

No major redesign in this feature.

## Aggregate Behavior

Eligible same-signature baseline aggregates should render on the unified `Analysis` page the same way that normal runs do, using:

- the same summary table
- the same repeatability columns where they are valid in this slice
- the same blocked-state behavior where needed

Legacy and ineligible aggregates continue to follow the existing aggregate metadata contract and blocked-state messaging.

This feature does not reopen the aggregate eligibility policy.
It only moves the unified analysis experience back into one page.

## Transcript Drilldown Behavior

The transcript page remains the standard drilldown destination.

New behavior to add:

- clicking `Stable %`
- clicking `Torn %`
- clicking `Noisy %`

opens transcripts filtered to matching conditions.

This should reuse the standard transcript route and filtering pattern instead of creating a second drilldown surface.

## Implementation Slices

### Phase 1: Route And Page Consolidation

- move the primary analysis detail view back to one route family
- remove `/analysis-v1` pages from routing
- remove `Analysis (Old V1)` nav entries
- point the main `Analysis` route back to the consolidated page
- make the current V1 shell authoritative
- remove stale `/analysis-v1` path builders and transcript base-path switching
- collapse analysis routing helpers back to a single `/analysis` base path
- remove V1-only page files
- preserve only the semantic helper pieces from `analysis-v2` that are intentionally reused

### Phase 2: Overview Summary Table

- add the new summary table above `Decision Frequency`
- source `Preference` from the newer semantic summaries
- source `Decision Consistency` from `baselineReliability`
- source `Value Consistency` from `directionalAgreement`
- source `Stable / Torn / Noisy` from the first-pass non-aggregate condition classification contract
- render `—` when repeat data is missing
- render `—` for aggregate torn/noisy columns in this slice

### Phase 3: Stable / Torn / Noisy Drilldown

- add category cell click behavior
- route to transcript drilldown with standard formatting
- filter to matching conditions
- add the new transcript query-param contract for repeat-pattern drilldown

### Phase 4: Cleanup

- remove the now-unused page/component split artifacts explicitly listed in this plan
- update tests and route coverage
- keep the codebase on one primary analysis path

## Implementation Notes

### Keep The Code Path Simple

Do not preserve the temporary split if the code can be unified cleanly.

The target is:

- one primary analysis page
- one primary route family
- one `Overview` summary surface
- one authoritative detail shell: the current V1 shell

There is no “either shell is acceptable” implementation choice in this feature.

### Avoid Reintroducing Semantic Regressions

This consolidation must preserve the good semantic upgrades:

- do not fall back to old `overall.stdDev` consistency semantics
- do not parse raw summary payloads directly in consumer tabs if the current adapter path already owns that job
- do not collapse aggregate eligibility back into a blanket aggregate block

## Testing Requirements

Add or update tests for:

- route removal of `/analysis-v1`
- router-level tests proving removed `/analysis-v1` URLs do not silently redirect to `/` or `/analysis`
- nav cleanup after hard removal
- desktop and mobile nav tests proving the vignette `Analysis (Old V1)` item is gone
- cleanup of stale `/analysis-v1` path generation in transcript routing helpers
- `Overview` summary table rendering on normal runs
- `Overview` summary table rendering on eligible aggregates
- merged-overview integration test proving the summary table renders above `Decision Frequency` on the same page
- `—` rendering when repeat data is missing
- mixed repeat-coverage tests where one model row has repeat metrics and another row shows `—`
- no-repeat interaction tests proving `—` cells do not navigate
- `—` rendering for aggregate `Stable / Torn / Noisy` in this slice
- percentage cells with tooltip/detail counts
- confidence-context tests for contributing runs/batches and the `10+ repeats` threshold
- click-through from `Stable %`, `Torn %`, and `Noisy %` to filtered transcript drilldown
- transcript-page tests for the new `repeatPattern` + `conditionIds` contract
- transcript-page tests for aggregate signature switching preserving the filter contract when valid
- unified aggregate behavior on the main `Analysis` page
- preservation of the existing `Stability` tab behavior
- page-level test proving the unified detail page still exposes `Stability`
- consistency-column mapping to `baselineReliability` and `directionalAgreement`
- exact stable/torn/noisy classification behavior for non-aggregate runs

Existing tests that currently encode the split must be explicitly removed or rewritten, including:

- V1 route/page tests
- nav tests that still expect `Analysis (Old V1)`
- transcript tests that still expect dual-base-path behavior
- overview tests that only cover one side of the split

## Explicit Non-Goals

- redesigning the whole `Stability` tab
- redesigning the whole `Scenarios` tab
- creating a new modal or drawer drilldown
- keeping `/analysis-v1` alive as an alias
- reopening the aggregate eligibility rules themselves

## Done Means

This feature is done when:

- there is one primary `Analysis` page again
- `/analysis-v1` routes are removed
- the `Overview` tab starts with the new summary table
- the summary table includes:
  - `Model`
  - `Preference`
  - `Decision Consistency`
  - `Value Consistency`
  - `Stable %`
  - `Torn %`
  - `Noisy %`
- repeat-based columns show `—` for runs without repeat data
- `Stable %`, `Torn %`, and `Noisy %` drill into the standard transcript page with correct filtering
- the old `Decision Frequency` table remains below the summary as a drilldown
- eligible aggregates use the same unified page behavior
- the codebase no longer carries the temporary V1/V2 page split as a user-facing product concept
- removed `/analysis-v1` URLs no longer silently redirect to another analysis surface

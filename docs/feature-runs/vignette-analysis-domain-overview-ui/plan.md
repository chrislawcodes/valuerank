# Domain Analysis Overview UX Plan

## Summary

Refactor the `/domains/analysis` page so it reads as a cleaner report without changing the analysis data itself. The work is UI-only:

- collapse the evidence-scope callout into a compact disclosure chip
- remove section numbering from headings
- reorder the visible report blocks
- split the model-group summary into its own report block so the page order reads naturally
- make `Similarities and Differences` the visible section title
- remove the nested visible `Pairwise Similarity Matrix` heading

## Architecture Choices

### 1. Keep the data contract unchanged

The page already receives the data it needs from the existing `DomainAnalysis` query and the findings-eligibility query.
This slice will only change how the page renders that data.

`DomainAnalysis.tsx` owns the JSX order of the top-level report blocks. Slice 1 will update that composition point so the visible order matches the new report flow.

### 2. Split the model-group summary from the value table

`ModelGroupsSection.tsx` should own the cluster-summary block and `ValuePrioritiesSection.tsx` should own the main table block. Both should receive the same page payload, but they should render as sibling report blocks so the visible order reads naturally and the heading hierarchy stays simple.

Rationale:

- it matches the requested page order directly
- it removes the confusing nested `Model Groups` / `Value Priorities` heading structure
- it keeps the table rendering independent from cluster-analysis availability

### 3. Use the existing findings-eligibility query for the disclosure

`DomainAnalysis.tsx` already loads `domainFindingsEligibility`.
The compact evidence-scope chip should be derived from that query and the disclosure should stay local to the page.
The expanded panel should use the existing fields already returned by that query: `eligible`, `status`, `summary`, `reasons`, `recommendedActions`, `consideredScopeCategories`, `completedEligibleEvaluationCount`, `latestEligibleEvaluationId`, `latestEligibleScopeCategory`, and `latestEligibleCompletedAt`.
The page should preserve the last settled scope state during a background refetch so the compact chip does not flicker back to loading once a valid result is already visible.

### 4. Keep the similarity matrix accessible with a semantic caption

The visible title should be `Similarities and Differences`.
The matrix itself should use a semantic `<caption>` that is visually hidden with the app’s standard sr-only treatment so screen readers still have a clear name for the table without creating a second visible title.

## Proposed Implementation Slices

### Slice 1: Page shell and evidence-scope disclosure

Files:

- `cloud/apps/web/src/pages/DomainAnalysis.tsx`
- `cloud/apps/web/tests/pages/DomainAnalysis.test.tsx`

Work:

- add the compact evidence-scope disclosure state
- render the collapsed chip by default
- expand to the full details panel on click
- keep the loading placeholder stable while data loads
- define the disclosure states explicitly:
  - loading: `Loading scope...` placeholder chip, disclosure content hidden
  - eligible: green auditable chip or amber diagnostic chip with full details
  - unavailable: gray warning chip with the unavailable explanation
  - query failure: gray warning chip with a short `Eligibility data could not load` note while the report stays visible
- add tests for the new disclosure behavior and the top-level section order
- verify keyboard activation, `aria-expanded`, and `aria-controls` for the disclosure
- verify the disclosure stays focused on its toggle when collapsed again

Expected size:

- about 200 to 260 lines changed

[CHECKPOINT]

### Slice 2: Model groups, value priorities, and ranking

Files:

- `cloud/apps/web/src/components/domains/ModelGroupsSection.tsx`
- `cloud/apps/web/src/components/domains/ValuePrioritiesSection.tsx`
- `cloud/apps/web/src/components/domains/DominanceSection.tsx`
- `cloud/apps/web/tests/components/ModelGroupsSection.test.tsx` if needed
- `cloud/apps/web/tests/components/ValuePrioritiesSection.test.tsx` if needed
- `cloud/apps/web/tests/components/DominanceSection.test.tsx`

Work:

- remove the visible `1.` prefix from the model-group heading
- render `Model Groups` as the first visible report block
- keep the existing `Cluster analysis not available` message inside the model-groups block
- keep the value table visible when cluster analysis is unavailable
- remove the visible numbering from `Value Priorities`
- keep the value table independent from the model-group block so one can render without waiting on the other
- remove the visible numbering from `Ranking and Cycles`

Expected size:

- about 180 to 240 lines changed

[CHECKPOINT]

### Slice 3: Similarities section cleanup

Files:

- `cloud/apps/web/src/components/domains/SimilaritySection.tsx`
- `cloud/apps/web/tests/components/SimilaritySection.test.tsx`

Work:

- remove the visible `3.` prefix from the heading
- change the visible title to `Similarities and Differences`
- remove the nested visible `Pairwise Similarity Matrix` heading
- keep the semantic table caption for accessibility, but hide it visually with the standard sr-only treatment

Expected size:

- about 120 to 180 lines changed

[CHECKPOINT]

## Testing Plan

For each slice:

- run the focused web tests for the files touched by that slice
- run `npm run typecheck --workspace=@valuerank/web`
- if the page shell changes, do a localhost smoke check on `/domains/analysis`
- run a narrow-viewport smoke check for the disclosure and section wrapping
- capture before/after screenshots at desktop and mobile widths and compare the page layout by eye
- add DOM-level assertions for heading order, the disclosure toggle state, and the matrix caption count

For the final combined diff:

- run the relevant web test subset again
- verify the exported CSV button still works
- compare the exported CSV output against the pre-change fixture to confirm headers and row content are unchanged
- verify the report order in the browser

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| The compact evidence-scope chip becomes too subtle | Keep the status text visible and use the existing badge styling pattern already used in the page |
| The expanded details panel becomes too tall on smaller screens | Give it a vertical scroll cap so the page layout stays stable |
| The value-priorities reordering becomes a component refactor | Extract a dedicated `ModelGroupsSection` so each visible block owns its own heading and empty state |
| The similarity matrix title removal confuses screen readers | Keep a semantic table caption with the accessible name `Pairwise similarity matrix` |

## Acceptance Notes

- The visible report order is `Model Groups`, `Value Priorities`, `Ranking and Cycles`, then `Similarities and Differences`
- The compact evidence-scope chip is visible by default
- The evidence-scope disclosure expands and collapses cleanly
- The page does not add any new backend fields or any new analysis math
- The CSV export behavior stays unchanged

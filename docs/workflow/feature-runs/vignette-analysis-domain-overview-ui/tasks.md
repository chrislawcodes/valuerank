# Domain Analysis Overview UX Tasks

## Status

- Slice 1: complete
- Slice 2: complete
- Slice 3: complete
- Web tests and typecheck: passed locally

## Slice 1: Compact evidence-scope disclosure

Files:

- `cloud/apps/web/src/pages/DomainAnalysis.tsx`
- `cloud/apps/web/tests/pages/DomainAnalysis.test.tsx`

Work:

- replace the large evidence-scope callout with a compact disclosure chip
- keep the report visible even when `DOMAIN_FINDINGS_ELIGIBILITY_QUERY` fails
- derive the compact state from the existing eligibility query only
- show `Loading scope...` while the query is still unresolved
- show `auditable findings` or `diagnostic evidence only` once the eligibility field resolves to a boolean
- show `scope unavailable` for malformed or unexpected values
- keep the last settled chip visible during a background refetch instead of flickering back to loading
- render the expanded panel behind an explicit disclosure button with `aria-expanded` and `aria-controls`
- keep the expanded panel scrollable at `50vh`
- add tests for loading, eligible, unavailable, query-error, and keyboard toggle behavior

Expected size:

- about 220 to 280 lines changed

[CHECKPOINT]

## Slice 2: Separate model groups, value priorities, and ranking

Files:

- `cloud/apps/web/src/components/domains/ModelGroupsSection.tsx`
- `cloud/apps/web/src/components/domains/ValuePrioritiesSection.tsx`
- `cloud/apps/web/src/components/domains/DominanceSection.tsx`
- `cloud/apps/web/src/pages/DomainAnalysis.tsx`
- `cloud/apps/web/tests/components/ModelGroupsSection.test.tsx`
- `cloud/apps/web/tests/components/ValuePrioritiesSection.test.tsx`
- `cloud/apps/web/tests/components/DominanceSection.test.tsx`
- `cloud/apps/web/tests/pages/DomainAnalysis.test.tsx`

Work:

- extract the cluster-analysis block into a dedicated `ModelGroupsSection`
- remove the visible numbering from the model-groups title
- make `ModelGroupsSection` render first in the report order
- keep `Cluster analysis not available` in the model-groups block when cluster analysis is missing or skipped
- keep `ValuePrioritiesSection` focused on the value table and remove its numbering
- keep the value table independent from cluster analysis loading
- remove the visible numbering from `Ranking and Cycles`
- update the page shell to render the three sibling sections in the new order
- add/adjust tests for section order and the separated empty-state behavior

Expected size:

- about 220 to 300 lines changed

[CHECKPOINT]

## Slice 3: Similarities section cleanup

Files:

- `cloud/apps/web/src/components/domains/SimilaritySection.tsx`
- `cloud/apps/web/tests/components/SimilaritySection.test.tsx`

Work:

- remove the visible `3.` prefix from the heading
- change the visible title to `Similarities and Differences`
- remove the nested visible `Pairwise Similarity Matrix` heading
- keep the matrix as a native table with an sr-only caption for accessibility
- make sure the caption remains the sole accessible name for the table

Expected size:

- about 120 to 180 lines changed

[CHECKPOINT]

## Verification Plan

For each slice:

- run the focused web tests for the touched files
- run `npm run typecheck --workspace=@valuerank/web`
- when the page shell changes, smoke test `/domains/analysis` locally
- confirm the disclosure toggle works with keyboard and keeps the page stable
- confirm the visible heading order matches the requested report flow

For the final combined diff:

- rerun the targeted web tests for all touched files
- verify the CSV export still returns the same content
- smoke test the production-like page layout in the browser at desktop and mobile widths

## Notes

- Do not change backend contracts or analysis math.
- Do not add a new page-level empty state.
- Keep the export behavior unchanged.
- If cluster analysis is unavailable, the value table should still render.

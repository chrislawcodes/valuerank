# Domain Analysis Overview UX

## Summary

Update the `/domains/analysis` page so it reads like a cleaner report instead of a stacked diagnostics page. The page should start with a compact evidence-scope tag, let the user expand for details, remove section numbering from the report titles, and reorder the visible sections so the page reads from broad model grouping into value-level detail and then into comparison views.

This slice is UI-only. It should not change analysis math, backend contracts, or report data shape.

## Goals

- Show only the short evidence-scope tag by default.
- Let the user expand the evidence-scope section to see the full explanation, reasons, and next step.
- Remove the numeric prefixes from the section titles.
- Reorder the domain analysis sections to:
  1. Model Groups
  2. Value Priorities
  3. Ranking and Cycles
  4. Similarities and Differences
- Make `Similarities and Differences` the visible section title, and stop repeating `Pairwise Similarity Matrix` as a second top-level title in that area.
- Keep the underlying analysis data and navigation behavior unchanged.

## Non-Goals

- No backend schema changes.
- No new metrics or score formulas.
- No AME work in this slice.
- No changes to transcript audit or run detail pages.
- No changes to the domain listing page (`/domains`).
- No changes to the CSV export schema or exported column set.

## Required UX Changes

### Evidence scope

- The current evidence-scope callout should collapse to a small tag by default.
- The compact tag must show the primary status text, such as `auditable findings` or `diagnostic evidence only`, so the user can tell the current state at a glance.
- Use the same badge and disclosure styling patterns already used elsewhere in the app, with a small pill-style tag and a simple chevron disclosure button.
- The compact tag should wrap cleanly on small screens rather than overflowing.
- While the evidence-scope data is loading, show a compact neutral placeholder chip with the text `Loading scope...` in the same slot so the layout does not jump.
- The evidence scope comes from `domainFindingsEligibility.eligible` in `DOMAIN_FINDINGS_ELIGIBILITY_QUERY`. When that value is `true`, the compact tag should read `auditable findings`; when it is `false`, the compact tag should read `diagnostic evidence only`.
- The evidence-scope chip is rendered from the existing eligibility query only; this slice does not add a new data source or suspense boundary.
- If the query succeeds but the field is missing or malformed, show a distinct gray `scope unavailable` chip with a warning icon and warning-style border instead of reusing the auditable look. The expanded details should explain that the current scope could not be confirmed and should not guess between the two known states.
- If the eligibility query itself fails, keep the report content visible and show a distinct gray `scope unavailable` chip with a short `Eligibility data could not load` note so the user can tell the difference between a missing scope and a fetch failure.
- If the eligibility query later refetches in the background after a settled state is already visible, keep the settled chip visible instead of flickering back to `Loading scope...`.
- This slice does not introduce any new evidence-scope states; if a future or unexpected value appears in a successful response, treat it as `scope unavailable` until a later feature defines a new visual state.
- The expanded details panel should cap its height at `50vh` and scroll vertically if the explanation is taller than the viewport, so the page does not jump or overflow on small screens.
- The expanded details should repeat the primary status badge at the top so the user does not lose the current state after expanding.
- When the scope is unavailable, the expanded panel should show the unavailable explanation and any raw reason text that is present, but it should not invent counts or a recommended next step.
- The evidence-scope states should behave as follows:
  - `loading`: show `Loading scope...` in the compact chip and do not show the expanded details body yet.
  - `auditable findings`: show the green auditable chip and the expanded summary, reasons, recommended next step, and counts.
  - `diagnostic evidence only`: show the amber diagnostic chip and the expanded summary, reasons, recommended next step, and counts.
  - `scope unavailable`: show the gray warning chip and the expanded unavailable explanation plus any raw reason text that is present; do not invent counts or a next step.
  - `query error`: show the gray warning chip and the expanded unavailable explanation; keep the rest of the report visible.
- The tag should have a chevron-style button that expands the full detail block.
- The button must use standard disclosure behavior (`aria-expanded`, keyboard activation with Enter/Space, `aria-controls`, and focus staying on the control) and should be labeled like `Show evidence scope details` / `Hide evidence scope details`.
- Expanded state should show the current evidence scope, summary, reasons, recommended next step, and counts.
- The page should still make it obvious whether the selected domain is auditable or diagnostic-only.
- The expanded/collapsed state is local to the page session and does not need to persist across reloads.

### Section titles

- Remove the numeric prefixes from the section headings.
- The page should use plain section labels only.
- The report should feel like a report, not a slide deck.
- The top-level section headings on the page should be `h2` elements.

### Section order

- The page content order should read:
  1. `Model Groups`
  2. `Value Priorities`
  3. `Ranking and Cycles`
  4. `Similarities and Differences`
- The JSX order must match that visible content order; do not use CSS reordering to fake the layout.
- `ModelGroupsSection.tsx` owns the cluster summary block and should render as its own sibling report block so `Model Groups` is first in the page order.
- `ValuePrioritiesSection.tsx` owns the main value table and should render as its own sibling report block immediately after `Model Groups`.
- The top-level section components are sibling report blocks; do not introduce cross-section data dependencies or a new sequential loading chain when reordering them.
- Keep the existing section-level loading and error states for the page as a whole; `ModelGroupsSection.tsx` should show the existing `Cluster analysis not available` message when the cluster analysis is skipped or missing, while `ValuePrioritiesSection.tsx` keeps rendering the value table.
- The `Value Priorities` table should not wait for cluster analysis to render.
- `DominanceSection.tsx` is the `Ranking and Cycles` section.
- `SimilaritySection.tsx` is the `Similarities and Differences` section.
- This slice does not introduce section ids or anchor behavior.

### Similarities section

- The top-level section title should be `Similarities and Differences`.
- The `SimilaritySection.tsx` component should render that section directly.
- The inner `Pairwise Similarity Matrix` title should be removed as a visible heading so the table sits immediately under the main section heading without a second competing title.
- Keep the matrix as a native `<table>` and use a semantic `<caption>` on the table itself, using the accessible name `Pairwise similarity matrix`.
- Render the caption with a screen-reader-only treatment so it remains the accessible name for the table without creating a second visible title.
- The table caption is the sole accessible name for the matrix; do not add a second wrapper label or duplicate aria-labelledby target.
- The visible report heading remains `Similarities and Differences`, while the table caption stays `Pairwise similarity matrix`.
- The table should read like the content of the section, not a separate nested report.

### Section states

- Existing loading, error, and empty states for each section should stay in place.
- If a section has no data, keep showing that section's existing no-data message rather than hiding the section entirely.
- Section reordering should not change what happens when data is missing; it only changes the visible order when the sections are rendered.
- Do not add a new page-level empty state in this slice. If every section is empty, keep the existing section-level no-data messages in place.
- `ModelGroupsSection.tsx` may continue to show the existing `Cluster analysis not available` message while `ValuePrioritiesSection.tsx` still renders the value table.

## Likely Files

- `cloud/apps/web/src/pages/DomainAnalysis.tsx`
- `cloud/apps/web/src/components/domains/ModelGroupsSection.tsx`
- `cloud/apps/web/src/components/domains/ValuePrioritiesSection.tsx`
- `cloud/apps/web/src/components/domains/DominanceSection.tsx`
- `cloud/apps/web/src/components/domains/SimilaritySection.tsx`
- `cloud/apps/web/tests/pages/DomainAnalysis.test.tsx`
- `cloud/apps/web/tests/components/ModelGroupsSection.test.tsx` if a component test is needed
- `cloud/apps/web/tests/components/ValuePrioritiesSection.test.tsx` if a component test is needed

## Acceptance Criteria

- Opening `/domains/analysis` shows a single compact evidence-scope tag by default.
- The compact tag includes the auditable/diagnostic status text.
- While loading, the evidence-scope chip shows `Loading scope...` in the same slot as the final chip.
- Clicking the evidence-scope control expands the detailed message.
- The evidence-scope disclosure keeps the page layout stable while loading, and the control exposes `aria-expanded`.
- The evidence-scope disclosure remains enabled once the page has loaded, even when the state is `scope unavailable`, so the user can open the explanation.
- The visible section headings do not include numeric prefixes.
- The evidence-scope chip and disclosure never overlap the report content while loading or expanding.
- If `domainFindingsEligibility.eligible` is `null`, `undefined`, or any value other than `true` or `false`, the compact chip reads `scope unavailable`.
- If `DOMAIN_FINDINGS_ELIGIBILITY_QUERY` fails, the report still renders and the evidence-scope chip falls back to `scope unavailable`.
- The page already queries `domainFindingsEligibility.eligible` today; this slice does not add a new backend field.
- `Model Groups` appears first in the report content order.
- `Value Priorities` appears after `Model Groups`.
- `Ranking and Cycles` appears after `Value Priorities`.
- `Similarities and Differences` appears last.
- The similarity matrix area does not show a second confusing top-level title underneath the section heading.
- Keyboard users can toggle the evidence-scope disclosure with Enter and Space.
- The expanded evidence-scope panel scrolls vertically if its content is taller than the viewport.
- Existing data loading still works.
- The export button continues to export the same CSV content; this slice only changes the on-screen report layout.

## Risks

- The evidence-scope section is currently a large, informative callout. Collapsing it could hide useful context if the expand control is not obvious.
- Reordering the sections changes how readers scan the page, so labels and spacing need to stay clear.
- Removing the numeric prefixes should be done consistently across the report so the page does not feel half-updated.

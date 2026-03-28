# Analysis Reports Decision Score Phase 1 - Spec

## Context

Phase 1 is the report-page cleanup for the remaining visible analysis surfaces
that still expose legacy 1-5 decision scores. The analysis UI already has
canonical decision presentation in other places, but these report pages still
teach the old score-first model in their tables, headers, and summary text.

This slice is about making the report pages stop showing raw 1-5 decision
scores as user-facing output.

## Problem

The current report surfaces are inconsistent:

- the condition detail report still computes and shows a mean from raw
  `decisionCode` values
- the transcripts report still shows raw numeric decision codes in its visible
  summary text
- the survey results matrix still averages numeric decision codes and renders
  that average directly
- the pages mix canonical decision language with legacy numeric score wording,
  which makes it look like the backend is still driving the report with the
  old scale

We need one small, isolated feature slice that fixes the report output without
changing exports, charts, worker behavior, or backend contracts.

## What We Are Building

This phase upgrades the visible report pages that still surface legacy score
presentation:

- `cloud/apps/web/src/pages/AnalysisConditionDetail.tsx`
- `cloud/apps/web/src/pages/AnalysisTranscripts.tsx`
- `cloud/apps/web/src/pages/SurveyResults.tsx`

The matching tests in scope must be updated or added as needed:

- `cloud/apps/web/tests/pages/AnalysisConditionDetail.test.tsx`
- `cloud/apps/web/tests/pages/AnalysisTranscripts.test.tsx`
- `cloud/apps/web/tests/pages/SurveyResults.test.tsx`

### User-facing behavior

- The condition detail report should replace raw 1-5 score averages with a
  bucketed canonical summary table. The visible buckets are:
  `Strongly favors <value>`, `Somewhat favors <value>`, `Neutral`, and
  `Unknown`. Counts should be shown per bucket instead of a numeric mean.
- The transcripts report should show the canonical decision headline from
  `formatCanonicalDecisionHeadline()` in its visible summary area instead of a
  raw `Decision: 1` style label. Any visible badge, helper text, or aria label
  on that page that describes the decision must use the same canonical wording.
- The survey results matrix should render a canonical cell summary instead of
  averaging numeric decision codes. The cell rule is:
  - no transcripts -> `—`
  - only unknown or unrenderable canonical transcripts -> `Unknown`
  - at least one renderable canonical transcript -> count by canonical
    headline; if one headline has a strict majority of the known transcripts,
    show that headline; otherwise show `Mixed`
  - unknown transcripts do not create an artificial average and do not change
    a clear majority headline
- When these pages expose an editable control or filter choice, the stored
  value may remain the legacy `decisionCode`, but the visible label must use the
  canonical presentation.
- Internal plumbing such as filter params, transcript overrides, or hidden
  backing fields may still use `decisionCode` where required, as long as the
  report output itself does not present it as the score.

## Phase Boundary

This phase stops at visible report-page changes.

### In scope

- report-page text and table updates on the three pages above
- canonical decision display wiring for those pages
- tests for the upgraded report surfaces
- page copy cleanup that removes score-first wording from these reports
- explicit empty-state, unknown-state, mixed-state, and majority-tie handling
  for these surfaces

### Out of scope

- compare charts and comparison dashboards
- export sheets and CSV/XLSX output
- backend aggregation or GraphQL contract changes
- worker behavior or job processing
- redesigning the report layouts or navigation structure
- changes to the meaning of any existing transcript fields

## Acceptance Criteria

- The three report pages no longer render visible 1-5 decision scores as the
  user-facing report output.
- The condition detail page no longer shows a raw numeric mean derived from
  `decisionCode` values as its visible score summary.
- The transcripts page no longer shows raw numeric decision-code text in the
  visible report header or visible labels.
- The survey results matrix no longer exposes averaged numeric decision codes
  in its visible cell values, and mixed cells render `Mixed` instead of a
  numeric average.
- The empty-state, unknown-state, and tie-state behavior for aggregate cells is
  defined and covered by tests.
- Existing navigation, filtering, and transcript drilldown behavior still
  works.
- Automated tests cover the upgraded report pages and pass in the isolated
  worktree.

## Notes

- The canonical report labels in this phase are:
  - `Strongly favors <value>`
  - `Somewhat favors <value>`
  - `Neutral`
  - `Unknown`
  - `Mixed` for aggregate cells that do not collapse to one canonical headline
- The canonical single-transcript headline already exists in
  `cloud/apps/web/src/utils/transcriptDecisionModel.ts`.
- For aggregate cells, `Mixed` means "no single canonical headline has a strict
  majority of the known transcripts in the cell." `Unknown` is only used when
  there are no renderable canonical transcripts.
- This phase intentionally keeps any internal `decisionCode` plumbing that is
  needed for filtering or overrides.
- The goal is to remove legacy score presentation from report output, not to
  rename the underlying data model in this wave.

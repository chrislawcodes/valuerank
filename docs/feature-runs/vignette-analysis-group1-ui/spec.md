# Vignette Analysis Group 1 UI Phase 1 - Spec

## Context

Group 1 is the presentation-only transcript review surface for vignette analysis.
The backend already has a canonical decision envelope for V2-backed transcripts,
but these pages still mix legacy score-first wording, old table labels, and
presentation clutter in a few places.

This slice is about making the transcript-facing pages read like a review tool
for survey researchers, not a score dashboard.

## Problem

The current UI is inconsistent:

- some pages show canonical decision wording while others still lead with old
  score-style labels
- some transcript tables still show presentation clutter like token columns,
  scenario columns, or normalization badges
- shared transcript components can still drift between legacy and canonical
  modes if the parent page does not pass the right display mode
- the condition and report detail pages still teach score-first language in a
  few headings and helper texts

We need one small UI-only feature slice that makes the group 1 surfaces consistent
without changing backend contracts, worker behavior, export math, or analysis math.

## What We Are Building

This phase upgrades the group 1 transcript presentation surfaces:

- `cloud/apps/web/src/pages/AnalysisTranscripts.tsx`
- `cloud/apps/web/src/pages/AnalysisConditionDetail.tsx`
- `cloud/apps/web/src/pages/DomainAnalysisValueDetail.tsx`
- `cloud/apps/web/src/components/runs/TranscriptList.tsx`
- `cloud/apps/web/src/components/runs/TranscriptRow.tsx`
- `cloud/apps/web/src/components/runs/TranscriptViewer.tsx`

The matching tests in scope must be updated as well:

- `cloud/apps/web/tests/components/runs/RunResults.test.tsx`
- `cloud/apps/web/tests/components/runs/TranscriptList.test.tsx`
- `cloud/apps/web/tests/components/runs/TranscriptViewer.test.tsx`
- `cloud/apps/web/tests/pages/AnalysisConditionDetail.test.tsx`
- `cloud/apps/web/tests/pages/AnalysisTranscripts.test.tsx`
- `cloud/apps/web/tests/pages/DomainAnalysisValueDetail.test.tsx`

### User-facing behavior

- Canonical V2-backed transcript views should show plain-language decision
  summaries such as `Strongly favors X`, `Somewhat favors X`, or `Neutral`.
- The shared transcript list, row, and viewer should all agree on the same
  decision mode for a page.
- The deterministic/fallback badge should only appear when the transcript was
  not summarized deterministically, and it should appear first in the decision
  summary area so the user notices it immediately.
- Presentation-only transcript tables should not show extra clutter like token
  columns, scenario columns, or normalization badges.
- The condition and report detail pages should keep their current layout and
  navigation, but the transcript-facing labels and helper text should stop
  teaching score-first language.

## Phase Boundary

This phase stops at presentation-only UI changes.

### In scope

- transcript list, row, and viewer presentation updates
- condition detail transcript-facing label updates
- report detail transcript table label updates
- page-level display mode wiring for V2-backed transcript views
- tests for the upgraded transcript surfaces
- copy and label cleanup that removes score-first wording from these pages

### Out of scope

- backend adapter or contract changes
- worker or export changes
- analytics math or aggregation changes
- AME or other new report metrics
- changes to the meaning of any existing transcript fields
- redesigning the report layouts or navigation structure
- cleanup of legacy numeric fields outside these presentation surfaces

## Acceptance Criteria

- Fully V2-backed transcript surfaces show canonical decision wording in the
  list, row, and viewer.
- Mixed or legacy-only data stays in legacy display mode instead of mixing
  semantics on one surface.
- The deterministic/fallback badge is visible only when it is useful and is
  placed at the front of the decision summary.
- The transcript tables in this slice no longer show the removed clutter
  columns or badge styles.
- The condition and report detail pages still navigate the same way, but their
  transcript-facing text no longer teaches score-first semantics.
- Existing legacy-only behavior stays intact.

## Notes

- The shared transcript components already know how to render legacy versus
  canonical decision modes. This feature is about finishing the page wiring and
  presentation cleanup, not inventing a new contract.
- If a surface is not fully V2-backed, it should stay in legacy mode for the
  whole surface rather than mixing old and new meaning in the same table.

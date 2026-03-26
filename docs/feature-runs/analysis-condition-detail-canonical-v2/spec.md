# Analysis Condition Detail Canonical V2

## Context

The condition detail page still shows a legacy 1-5 decision-code summary even
though transcripts already carry canonical `decisionModelV2` data. The
transcript list audit surface already uses canonical decision headlines, so the
condition detail table should follow that same canonical transcript behavior
instead of the old raw-score path.

This wave is intentionally narrow. It only updates the condition detail table
and its tests. Pivot analysis, the value-detail matrix, transcript list
surfaces, and export/report surfaces stay unchanged unless this spec says
otherwise.

## Assumptions

- The existing `run` query already exposes the `decisionModelV2` transcript
  field needed for the condition detail table, so no API contract change is
  expected.
- The click-through behavior should keep opening the matching transcript slice
  from the condition table, but the visible summary counts should come from the
  canonical transcript decision model rather than from raw scores.
- Unknown or unresolved transcripts must be counted explicitly and shown as a
  separate bucket so they do not distort the known canonical counts.

## Problem

`AnalysisConditionDetail.tsx` still builds a numeric table from legacy
decision-code values:

- headers come from the old 1-5 decision scale
- counts are grouped by raw score instead of canonical decision buckets
- the unknown column is handled separately, but the summary still reads like a
  score table

That makes the condition detail page look disconnected from the canonical
decision behavior used elsewhere in the app.

## What We Are Building

Update the condition detail page so the visible summary table uses the
canonical decision-model-v2 bucket order and labels:

1. `Strongly favors <first value>`
2. `Somewhat favors <first value>`
3. `Neutral`
4. `Somewhat favors <second value>`
5. `Strongly favors <second value>`
6. `Unknown`

The table should still preserve the existing row ordering, column ordering, and
drilldown behavior. The paired and single analysis modes must both work.

## User-Facing Behavior

- The condition detail table shows the ordered canonical decision buckets
  instead of the legacy 1-5 score labels.
- The strong / somewhat labels come from the canonical transcript decision
  model v2 rather than from the old raw score path.
- Unknown / unresolved transcripts are counted explicitly and shown as a
  separate bucket.
- The known transcript counts match the transcripts shown below the table.
- Paired mode still shows the pooled row and the orientation-specific rows in
  the same order as today.
- Single mode still shows one row for the current run.
- Clicking a non-zero known bucket still opens the matching transcript slice.

## Phase Boundary

This phase stops at the condition detail page and its shared helper.

### In scope

- `cloud/apps/web/src/pages/AnalysisConditionDetail.tsx`
- any small shared web helper needed to summarize canonical condition
  transcripts
- targeted tests for the condition detail table and the helper

### Out of scope

- `PivotAnalysisTable.tsx`
- `ConditionDecisionsTable.tsx`
- `DomainAnalysisValueDetail.tsx`
- `AnalysisTranscripts.tsx`
- `SurveyResults.tsx`
- API schema or query changes unless they become necessary to read
  `decisionModelV2`

## Acceptance Criteria

- The condition detail summary no longer uses the raw 1-5 score labels.
- The visible table uses canonical decision-model-v2 bucket labels.
- Unknown / unresolved transcripts are counted separately and do not change
  the known bucket totals.
- The condition detail counts match the transcripts in the corresponding
  transcript slice.
- Paired and single analysis modes still render the correct rows and preserve
  click-through behavior.
- The pivot table and value-detail matrix remain unchanged.
- Automated tests cover the new bucket summary behavior.

## Notes

- The canonical transcript headline behavior already exists in
  `cloud/apps/web/src/utils/transcriptDecisionModel.ts`.
- The summary helper for this wave should stay focused on the condition-detail
  buckets only; it should not alter the pivot analysis helper used elsewhere in
  the app.

# Spec

## Summary

Clean up `SurveyResults` so the report is driven by canonical decision model v2 only.

The page must keep its current layout, routing, filtering, and navigation flow, but the matrix, grouping, summary labels, and export data must come from `decisionModelV2` data instead of legacy 1-5 decision-score logic.

## Problem

`SurveyResults.tsx` still derives its matrix values from legacy `decisionCode` data and has a fallback path that can group numeric scores into buckets. That is no longer acceptable for this report.

This report path must be canonical v2 only:

- no `decisionCode` fallback
- no `meanDecisionScore` fallback
- no `legacy.canonicalScore` fallback
- no `content.score` or `content.decision` fallback
- no quiet downgrade to old score buckets when canonical data is missing

Unknown or unresolved transcripts must remain explicit in the report. They must not be folded into legacy score buckets.

## Goals

1. Remove legacy score logic from the SurveyResults report path.
2. Use canonical `decisionModelV2` data for cell labels, grouping, and summary text.
3. Keep unknown or unresolved transcripts visible as an explicit state.
4. Fail loudly or surface a clear error if canonical v2 data is missing or not renderable.
5. Keep the existing page layout and navigation flow intact.

## Non-Goals

1. Do not change `AnalysisConditionDetail.tsx`.
2. Do not change `DomainAnalysisValueDetail.tsx`.
3. Do not change `AnalysisTranscripts.tsx`.
4. Do not change unrelated compare/report surfaces.
5. Do not add API schema changes unless the existing transcript query is missing a canonical v2 field that the page truly needs.

## Scope

Expected files for this wave:

- `cloud/apps/web/src/pages/SurveyResults.tsx`
- `cloud/apps/web/src/utils/transcriptDecisionModel.ts` if a report-safe guard/helper is needed
- `cloud/apps/web/src/utils/reportDecisionDisplay.ts` if a canonical summary helper is needed
- `cloud/apps/web/tests/pages/SurveyResults.test.tsx`
- `cloud/apps/web/tests/utils/reportDecisionDisplay.test.ts`
- `cloud/apps/web/tests/utils/transcriptDecisionModel.test.ts`

## Behavior

1. The page shows canonical decision v2 labels for matrix cells.
2. Multiple transcripts in the same cell are grouped by canonical v2 summary, not by numeric score.
3. Unknown or unresolved canonical decisions remain explicit as `Unknown`.
4. A transcript counts as `Unknown` when `decisionModelV2` exists but its canonical decision is explicitly unresolved.
5. A transcript counts as malformed or missing when the canonical v2 envelope is absent or structurally incomplete.
6. Missing or malformed canonical v2 data does not fall back to legacy score buckets.
7. In that failure case, the page keeps the surrounding survey shell visible but replaces the matrix area with a clear inline error state.
8. The matrix export uses the same canonical v2 summary labels as the on-screen table.

## Acceptance Criteria

1. The SurveyResults page does not read legacy score fields for display, grouping, or summary generation.
2. The page shows canonical v2 labels and bucket details in the matrix.
3. Unknown or unresolved transcripts are still visible as explicit unknowns.
4. Missing or malformed canonical v2 data produces a clear error state rather than a fallback.
5. A hard guard exists in the report helper or page code so the legacy path throws if it is reached.
6. Tests fail if legacy score fallback logic is reintroduced in this report path.

## Data Contract

The SurveyResults report can render a transcript only when the transcript includes a `decisionModelV2` envelope with `raw`, `canonical`, and `legacy` objects present.

Within that envelope:

- explicit unknown canonical values stay visible as `Unknown`
- `canonical.direction === 'unknown'` and `canonical.strength === 'unknown'` are displayable, not an error
- a missing or partial envelope is treated as a report data error

The existing run transcript query already exposes `decisionModelV2`, so no API change is expected unless a later implementation discovers a missing field in that query.

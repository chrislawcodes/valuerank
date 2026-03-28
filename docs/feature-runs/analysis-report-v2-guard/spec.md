# Spec
# Spec: Report Decision Model v2 Guard

## Problem

Several report-facing surfaces still tolerate legacy decision data when canonical
decision-model-v2 data is missing or incomplete. Today those paths can quietly
fall back to `decisionCode`, `meanDecisionScore`, or
`decisionModelV2.legacy.canonicalScore`, which makes the report look valid even
when the canonical source of truth is absent.

That behavior is unsafe for report surfaces because it mixes canonical report
output with legacy decision scores and hides data quality problems that should
be visible immediately.

## Goal

Make report surfaces fail loudly whenever canonical decision-model-v2 data is
missing or not renderable, and remove all report-facing compatibility fallback
to legacy decision scores.

## Requirements

- Report-facing helpers must throw when canonical decision-model-v2 data is
  missing or not renderable.
- Report-facing pages must not silently fall back to `decisionCode`,
  `meanDecisionScore`, `content.score`, `content.decision`, or
  `decisionModelV2.legacy.canonicalScore`.
- Valid canonical decision-model-v2 data must keep the visible report output
  unchanged.
- The hard guard must be reusable so multiple report pages can share the same
  contract.
- The error message must mention the report helper or page that failed and the
  missing canonical v2 data.
- Existing non-report surfaces may continue to use legacy presentation logic
  where they are not part of the report path.

## Non-goals

- Backend schema changes
- GraphQL contract changes
- New fallback formatting for legacy transcripts
- Reworking the visual design of the report pages
- Changing the meaning of canonical decision data

## In Scope

- `cloud/apps/web/src/utils/transcriptDecisionModel.ts`
- `cloud/apps/web/src/utils/reportDecisionDisplay.ts`
- `cloud/apps/web/src/pages/AnalysisConditionDetail.tsx`
- `cloud/apps/web/src/pages/AnalysisTranscripts.tsx`
- `cloud/apps/web/src/pages/DomainAnalysisValueDetail.tsx`
- `cloud/apps/web/src/pages/SurveyResults.tsx`
- Report-facing tests that need to prove the guard fires and the happy path
  still renders canonically

## Acceptance Criteria

- Report helpers throw when canonical v2 data is missing or not renderable.
- Report pages still render correctly when canonical v2 data is present.
- No report-facing helper or page uses legacy decision scores as a fallback.
- The report guard error clearly identifies the helper or page that failed.
- Tests cover both the happy path and the guard path.

# Analysis Condition Detail Canonical V2 - Plan

## Goal

Replace the legacy 1-5 decision-code summary on `AnalysisConditionDetail`
with a canonical decision-model-v2 summary that mirrors the transcript list's
audit behavior.

## Scope Guardrails

- In scope: the condition detail page, one small shared helper for canonical
  condition transcript bucketing, and focused tests.
- Out of scope: pivot analysis, value-detail matrices, transcript list copy,
  survey results, exports, and backend schema changes.
- No database migration, job, or deployment change is expected.

## Architecture

### Canonical condition summary helper

Add a small web helper that:

- classifies transcripts into ordered canonical buckets
- treats unknown or unrenderable transcripts as an explicit bucket
- derives the canonical value labels from renderable transcript data
- preserves zero-count buckets so the table keeps a stable layout
- keeps the summary logic separate from the pivot analysis helper used by
  `ConditionDecisionsTable`

The helper should be narrow and presentation-focused. It should not change any
backend contract or alter the existing transcript data model.

### Condition detail page

Update `AnalysisConditionDetail.tsx` to:

- use the shared canonical summary helper for each row
- render the canonical bucket labels instead of the raw 1-5 labels
- keep the existing row order: pooled, canonical, flipped in paired mode, and
  a single row in single mode
- keep the existing transcript drilldown behavior for non-zero known buckets
- keep unknown / unresolved transcripts visible in their own explicit bucket

The page can keep using the existing transcript drilldown route. The important
change in this wave is the summary source of truth, not the route shape.

## Implementation Decisions

- Prefer a dedicated helper module under `cloud/apps/web/src/utils/` rather
  than extending the pivot-analysis helper, so the pivot table stays untouched.
- Derive canonical labels from the first renderable transcript in the relevant
  row, with a safe fallback for all-unknown rows.
- Preserve stable bucket ordering so the visible table remains easy to scan and
  test.
- Keep the summary count logic total over known versus unknown transcripts so
  unresolved rows cannot distort the known counts.

## Slice Plan

| Slice | Scope | Files | Exit Rule |
|---|---|---|---|
| 1 | Shared canonical condition summary helper, condition detail page update, and focused tests | `cloud/apps/web/src/utils/conditionDecisionSummary.ts`, `cloud/apps/web/src/pages/AnalysisConditionDetail.tsx`, `cloud/apps/web/tests/utils/conditionDecisionSummary.test.ts`, `cloud/apps/web/tests/pages/AnalysisConditionDetail.test.tsx` | The condition detail page shows canonical decision-model-v2 buckets and labels, with unknown transcripts explicit and click-through preserved |

## Verification

- `npm run build --workspace=@valuerank/web`
- `npm run lint --workspace=@valuerank/web`
- `npm run test --workspace=@valuerank/web -- tests/utils/conditionDecisionSummary.test.ts tests/pages/AnalysisConditionDetail.test.tsx`

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Label derivation falls back incorrectly for sparse data | Confusing table headers | Derive labels from renderable transcript data and keep a generic fallback for all-unknown rows |
| Click-through paths drift while changing the table | Drilldown regressions | Keep the existing navigation target and only swap the summary source |
| Helper logic leaks into the pivot table helper | Unintended UI changes | Use a dedicated helper file for this page only |

# Plan
# Plan: Report Decision Model v2 Guard

## Approach

Use a strict canonical-v2 guard at the report-helper layer, then make each
report page validate or consume only renderable canonical transcripts before it
renders any report output.

The main design rule is simple: if a report surface would need a legacy decision
score to keep going, it must stop instead of inventing a fallback.

## Architecture Decisions

| Decision | Choice | Why |
|---|---|---|
| Guard helper | Add a reusable `requireRenderableTranscriptDecisionModelV2(...)` helper in `transcriptDecisionModel.ts` | Keeps the renderability rule in one place and gives every report surface the same failure message |
| Report summary helper | Make `reportDecisionDisplay.ts` strict and remove legacy fallback branches | Report summaries should only operate on renderable canonical transcripts |
| Audit sorting | Derive audit sort values from canonical v2 direction/strength instead of `legacy.canonicalScore` | Preserves canonical ordering without reading the legacy compat score |
| Condition detail summary | Keep the current visible table shape, but source counts from canonical v2 buckets instead of legacy numeric scores | The page can stay familiar while losing the legacy dependency |
| Transcript report page | Validate the full filtered transcript set before summary or viewer mode is chosen | Prevents mixed V1/V2 report output from silently degrading to legacy mode |
| Domain value detail page | Validate selected-condition transcripts before passing them into the report list and viewer | Keeps the canonical-only contract explicit on the page boundary |
| Survey results page | Build cell summaries only from renderable canonical transcripts and fail on missing canonical data | Avoids a report cell silently turning into a legacy-derived display |

## Implementation Outline

1. Add the strict renderability guard to `transcriptDecisionModel.ts`.
2. Remove legacy fallback behavior from report-facing helpers and switch audit
   sorting to a canonical-only sort key.
3. Update `AnalysisTranscripts` and `DomainAnalysisValueDetail` so they only
   render canonical report output after the guard succeeds.
4. Update `AnalysisConditionDetail` so it keeps the same visible structure but
   gets its counts from canonical v2 bucket data.
5. Update `SurveyResults` so its cell summaries are canonical-only and no longer
   tolerate unknown legacy fallbacks.
6. Update the report-facing tests so they prove the happy path still works and
   the guard path now fails loudly.

## Slice Breakdown

| Slice | Scope | Files | Exit Rule |
|---|---|---|---|
| 1 | Shared guard plus report-helper hardening | `cloud/apps/web/src/utils/transcriptDecisionModel.ts`, `cloud/apps/web/src/utils/reportDecisionDisplay.ts`, `cloud/apps/web/tests/utils/reportDecisionDisplay.test.ts`, `cloud/apps/web/tests/utils/transcriptDecisionModel.test.ts`, `cloud/apps/web/src/components/runs/TranscriptList.tsx` | The shared guard exists, audit sorting no longer reads `legacy.canonicalScore`, and the helper tests prove the guard fires |
| 2 | Transcript report surfaces | `cloud/apps/web/src/pages/AnalysisTranscripts.tsx`, `cloud/apps/web/src/pages/DomainAnalysisValueDetail.tsx`, `cloud/apps/web/tests/pages/AnalysisTranscripts.test.tsx`, `cloud/apps/web/tests/pages/DomainAnalysisValueDetail.test.tsx` | Both report pages render canonically when v2 data is valid and fail loudly when it is not |
| 3 | Condition detail report surface | `cloud/apps/web/src/pages/AnalysisConditionDetail.tsx`, `cloud/apps/web/tests/pages/AnalysisConditionDetail.test.tsx` | The condition detail page keeps its visible structure but no longer reads legacy scores |
| 4 | Survey matrix report surface | `cloud/apps/web/src/pages/SurveyResults.tsx`, `cloud/apps/web/tests/pages/SurveyResults.test.tsx` | The matrix uses canonical-only summaries and throws when canonical data is missing |

## Risk Notes

- The guard must be applied before any report helper can emit visible output,
  otherwise a mixed transcript set could still render a legacy-derived summary.
- Audit sorting must stay canonical-only, but it still needs to preserve the
  expected order of canonical transcripts so the report tables do not feel
  broken.
- The condition detail page must keep the same table layout so the change stays
  focused on source-of-truth handling, not UI churn.

## Verification Plan

For each slice:

- run the focused web tests for the touched files
- run the web build once the slice is complete

Final validation:

- run the full `cloud` web test suite
- confirm the report pages render canonically when canonical v2 data is present
- confirm the guard path throws on missing canonical v2 data

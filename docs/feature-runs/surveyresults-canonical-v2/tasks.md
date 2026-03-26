# Tasks

1. Add a report-safe canonical guard and strict summary wrapper in the transcript decision helpers, then cover it with unit tests for explicit unknown canonical values and missing envelopes. Estimated diff: ~180 lines. [CHECKPOINT]
   - Update `cloud/apps/web/src/utils/transcriptDecisionModel.ts` if a reusable guard is needed.
   - Update `cloud/apps/web/src/utils/reportDecisionDisplay.ts` with a canonical-only helper that throws on missing v2 data.
   - Update `cloud/apps/web/tests/utils/reportDecisionDisplay.test.ts` and `cloud/apps/web/tests/utils/transcriptDecisionModel.test.ts`.
   - Verify that explicit unknown canonical decisions still summarize as `Unknown`.
   - Verify that missing canonical envelopes throw instead of falling back.
   - Verify that partially formed envelopes like `decisionModelV2.canonical: {}` fail before render time.
   - Verify that a transcript carrying both legacy `decisionCode` and valid canonical v2 data still resolves through canonical v2 only.

2. Rewrite `SurveyResults.tsx` and its page test so the matrix, summary labels, and export all come from canonical v2 data only. Estimated diff: ~220 lines. [CHECKPOINT]
   - Remove the legacy `decisionCode` aggregation and the 1-5 override select from the matrix.
   - Build cell output from canonical v2 summaries only.
   - Surface a clear error state when canonical v2 data is missing or malformed.
   - Keep the survey shell, run-level filters, refresh control, and transcript drill-in visible when data is valid.
   - Update `cloud/apps/web/tests/pages/SurveyResults.test.tsx` to prove the page shows canonical labels, keeps unknown explicit, and errors on missing or partial v2 data.
   - Add export coverage that compares the CSV decision column against the rendered canonical summary.
   - Verify the page no longer renders numeric score buckets, the 1-5 selector, or any legacy score text.

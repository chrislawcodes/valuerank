# Analysis Condition Detail Canonical V2 - Tasks

## Slice 1 [CHECKPOINT] internal

**Goal:** Add the canonical condition summary helper and update the condition
detail page to use it.

**Estimated diff size:** about 220-280 lines

**Files**

- `cloud/apps/web/src/utils/conditionDecisionSummary.ts`
- `cloud/apps/web/src/pages/AnalysisConditionDetail.tsx`
- `cloud/apps/web/tests/utils/conditionDecisionSummary.test.ts`
- `cloud/apps/web/tests/pages/AnalysisConditionDetail.test.tsx`

**Work**

1. Add a small shared helper that:
   - classifies transcripts into the canonical condition buckets
   - treats unknown or unresolved transcripts explicitly
   - keeps the bucket order stable
   - derives the bucket labels from renderable transcript data when available
   - preserves a safe fallback for all-unknown rows
2. Update `AnalysisConditionDetail.tsx` to consume the helper for each row
   summary, replace the 1-5 score headers with canonical decision-model-v2
   bucket labels, and keep the existing row ordering and click-through behavior.
3. Keep the paired/single branches intact:
   - paired mode still renders pooled, canonical, and flipped rows in the same
     order
   - single mode still renders one row for the current run
   - unknown counts remain visible and do not affect the known totals
4. Add focused tests for:
   - the helper's canonical bucket classification
   - stable bucket ordering and label derivation
   - explicit unknown handling
   - paired mode row rendering
   - single mode row rendering
   - non-zero bucket click-through

**Exit rule**

- The condition detail page no longer uses the legacy visible 1-5 summary.

**Verification**

- `npm run build --workspace=@valuerank/web`
- `npm run lint --workspace=@valuerank/web`
- `npm run test --workspace=@valuerank/web -- tests/utils/conditionDecisionSummary.test.ts tests/pages/AnalysisConditionDetail.test.tsx`

# Analysis Reports Decision Score Phase 1 - Tasks

## Slice 1 - Shared helper plus condition/transcript report cleanup

**Type:** internal

**Estimated diff size:** about 240-300 lines

**Goal:** Add the shared canonical report helper and update the condition detail
and transcripts report pages so they stop showing raw 1-5 score output.

### Tasks

1. Add a small shared helper module for report decision display, with explicit
   support for:
   - renderable transcript detection
   - canonical single-transcript labels
   - bucketed aggregate counts by canonical headline
   - strict-majority selection over renderable transcripts only
   - explicit `Unknown`, `Mixed`, and empty-cell states
   - a normalized `ReportTranscriptDecision` input type that each page builds
     from its raw query rows before calling the helper, so the helper never
     depends on page-specific GraphQL shapes
   - a stable return shape that includes the canonical bucket counts, an
     explicit `unknownCount` for non-renderable or malformed transcripts, and a
     derived headline value that never recomputes page-local score logic
   - a shared `REPORT_DECISION_BUCKET_ORDER` constant that fixes the canonical
     bucket order across both pages, with zero-count buckets preserved in the
     returned data so the pages never need to infer shape from the current cell
2. Add a focused helper test file for the shared helper with cases covering:
   - empty transcript arrays
   - unknown-only transcript arrays
   - strict-majority cases
   - tie cases
   - mixed known/unknown cases, with assertions that only renderable
     transcripts participate in the majority calculation
   - malformed legacy values such as `0`, `6`, `null`, non-integers, and other
     non-renderable transcript shapes, all of which must flow into the explicit
     `Unknown` bucket and stay out of the strict-majority denominator
   - fixed-order bucket output, including zero-count buckets
3. Update `AnalysisConditionDetail.tsx` so the visible table shows bucketed
   canonical counts instead of a numeric mean, includes an explicit `Unknown`
   bucket, preserves zero-count buckets in the visible table, and keeps the
   existing drilldown behavior intact.
4. Update `AnalysisTranscripts.tsx` so every visible decision summary, helper
   text line, aria label, and header string uses canonical wording instead of
   raw `Decision: 1` style labels.
5. Keep both pages on the same source of truth for visible labels by using the
   shared helper rather than page-local string mapping.
6. Update the targeted tests for these pages so they assert the canonical
   strings, the fixed bucket ordering, the zero-count bucket behavior, and the
   new Unknown-versus-Mixed distinctions.

### Files

- `cloud/apps/web/src/utils/reportDecisionDisplay.ts` or equivalent helper
- `cloud/apps/web/src/pages/AnalysisConditionDetail.tsx`
- `cloud/apps/web/src/pages/AnalysisTranscripts.tsx`
- `cloud/apps/web/tests/utils/reportDecisionDisplay.test.ts`
- `cloud/apps/web/tests/pages/AnalysisConditionDetail.test.tsx`
- `cloud/apps/web/tests/pages/AnalysisTranscripts.test.tsx`

**[CHECKPOINT]**

**Dependencies:** the shared helper contract must be settled before the page
updates so both pages use the same canonical wording and aggregate rules.

**Verification:**

- `npm run build --workspace=@valuerank/web`
- `npm run lint --workspace=@valuerank/web`
- `npm run test --workspace=@valuerank/web -- tests/utils/reportDecisionDisplay.test.ts tests/pages/AnalysisConditionDetail.test.tsx tests/pages/AnalysisTranscripts.test.tsx`

## Slice 2 - Survey results aggregate matrix cleanup

**Type:** internal

**Estimated diff size:** about 180-240 lines

**Goal:** Replace the survey matrix's averaged numeric decision codes with the
canonical aggregate cell rule and keep drilldown useful.

### Tasks

1. Update `SurveyResults.tsx` so the matrix cells use the shared aggregate
   helper instead of averaging raw numeric decision codes.
2. Render the strict-majority canonical headline in the cell when appropriate,
   `Mixed` when no canonical headline has a majority of the renderable
   transcripts, `Unknown` when there are no renderable canonical transcripts,
   and `—` for empty cells. Keep the canonical bucket rows in fixed order even
   when a bucket count is zero.
3. Show the full bucket breakdown in the cell tooltip and in the accessible
   drilldown/details view so the majority label does not hide the underlying
   distribution. The drilldown/details view is the test oracle; the tooltip
   mirrors that content.
4. Keep the existing transcript viewer and override controls working, but
   label any visible choices with the canonical wording from the shared helper.
5. Memoize the per-cell aggregate grouping so large matrices do not recompute
   the same transcript breakdown on every render.
6. Update or add the `SurveyResults` page test so it covers empty, unknown-only,
   strict-majority, mixed-cell, and accessible-breakdown cases.
7. Reuse the shared helper test coverage from Slice 1 rather than duplicating
   the aggregate rules in the page test.

### Files

- `cloud/apps/web/src/pages/SurveyResults.tsx`
- `cloud/apps/web/tests/pages/SurveyResults.test.tsx`
- `cloud/apps/web/tests/utils/reportDecisionDisplay.test.ts`

**[CHECKPOINT]**

**Dependencies:** Slice 1 must land first because Slice 2 depends on the
shared aggregate helper and its contract.

**Verification:**

- `npm run build --workspace=@valuerank/web`
- `npm run lint --workspace=@valuerank/web`
- `npm run test --workspace=@valuerank/web -- tests/utils/reportDecisionDisplay.test.ts tests/pages/SurveyResults.test.tsx`

## Final Validation

After both slices:

- run `npm run build` from `cloud/`
- run `npm run lint` from `cloud/`
- run `npm run test` from `cloud/`
- confirm the feature-run state is ready for PR staging

## Review Reconciliation

- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: Resolved by defining the aggregate helper contract over renderable canonical transcripts, adding strict-majority and tooltip/drilldown breakdown rules, and scoping visible strings, aria text, and tooltips to canonical wording.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Resolved by adding shared helper unit coverage and explicit cases for empty, unknown-only, strict-majority, mixed known/unknown, and malformed legacy values.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Resolved by defining majority input basis, mixed/unknown precedence, the helper source of truth, and a memoized grouped-cell helper contract for the report pages.

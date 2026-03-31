# Vignette Analysis Group 1 UI Phase 1 - Tasks

## Slice 1 - Shared transcript presentation cleanup

**Estimated diff size:** about 220-280 lines

**Goal:** Make the shared transcript list, row, and viewer show the same
canonical decision wording and badge order, and wire `AnalysisTranscripts` to
use that shared presentation consistently.

### Tasks

1. Update the shared transcript formatting helpers if needed so the canonical
   headline reads in plain language, the shared V2-gating helper checks the
   renderable `decisionModelV2` fields, and the badge precedence is explicit
   (`Manual` first, then `Fallback`, then no badge).
2. Update `TranscriptList` so the decision column label, tooltip, and row
   ordering match the canonical display mode without reintroducing scenario or
   token clutter, and keep a stable created-at/id tie-breaker after the primary
   sort.
3. Update `TranscriptRow` so the row shows the new decision summary first and
   keeps legacy mode unchanged when the shared helper says the page is not fully
   V2-backed.
4. Update `TranscriptViewer` so the header presents the same decision summary
   order as the row, keeps the raw evidence section stable, and removes the
   token-count badge/icon treatment from the chrome.
5. Update `AnalysisTranscripts` so it uses the shared display-mode helper for
   the current filtered transcript set, keeps mixed/legacy data in legacy mode,
   and treats an empty visible set as legacy rather than accidentally enabling
   audit mode.
6. Update the relevant tests:
   - `cloud/apps/web/tests/utils/transcriptDecisionModel.test.ts`
   - `cloud/apps/web/tests/components/runs/TranscriptList.test.tsx`
   - `cloud/apps/web/tests/components/runs/TranscriptViewer.test.tsx`
   - `cloud/apps/web/tests/components/runs/RunResults.test.tsx`
   - `cloud/apps/web/tests/pages/AnalysisTranscripts.test.tsx`
   - add a focused helper test for empty, partial, full, and mixed V2 envelopes

**[CHECKPOINT]**

**Dependencies:** the backend must already be returning a renderable
`decisionModelV2` envelope for the transcripts this slice renders. If the
helper sees a partial or empty envelope, the slice must keep the page in legacy
mode rather than guessing.

**Verification:**

- `npm run build --workspace=@valuerank/web`
- `npm run test --workspace=@valuerank/web -- tests/utils/transcriptDecisionModel.test.ts tests/components/runs/TranscriptList.test.tsx tests/components/runs/TranscriptViewer.test.tsx tests/components/runs/RunResults.test.tsx tests/pages/AnalysisTranscripts.test.tsx`

## Slice 2 - Detail-page presentation cleanup

**Estimated diff size:** about 200-260 lines

**Goal:** Make the condition and report detail pages stop teaching score-first
wording in their transcript-facing areas while keeping their layouts and
navigation intact.

### Tasks

1. Update `AnalysisConditionDetail` copy and labels so the transcript-facing
   text does not describe the table as a normalized score table and uses the
   same shared display-mode helper for the condition transcript drilldown.
2. Update `AnalysisConditionDetail` transcript drilldown behavior so it keeps
   the same presentation rules as the shared transcript components, including
   the same all-or-legacy gate for the current condition transcript set.
3. Update `DomainAnalysisValueDetail` labels and table cells so the report
   detail page uses the canonical wording when the condition is fully
   V2-backed, keeps legacy behavior otherwise, and uses the explicit copy map
   from the plan by promoting it into code-local constants or helpers before
   use.
4. Keep the condition and report detail page layouts intact; do not change the
   underlying analytics math or the matrix structure in this phase.
5. Update the relevant tests:
   - `cloud/apps/web/tests/pages/AnalysisConditionDetail.test.tsx`
   - `cloud/apps/web/tests/pages/DomainAnalysisValueDetail.test.tsx`

**[CHECKPOINT]**

**Dependencies:** Slice 1 must be complete first because the detail pages rely
on the shared transcript presentation rules.

**Verification:**

- `npm run build --workspace=@valuerank/web`
- `npm run test --workspace=@valuerank/web -- tests/pages/AnalysisConditionDetail.test.tsx tests/pages/DomainAnalysisValueDetail.test.tsx tests/utils/transcriptDecisionModel.test.ts`

## Final Validation

After both slices:

- run `npm run build` from `cloud/`
- run `npm run lint` from `cloud/`
- run `npm run test` from `cloud/`
- confirm the feature-run state is ready for the spec checkpoint and then the
  plan/tasks review flow

## Review Reconciliation

- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: The task list now includes a dedicated helper test, explicit partial-data fallback handling, and a code-local copy source instead of a loose plan dependency.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: The task list now defines the V2 gate more precisely, covers partial and mixed states in the helper tests, and promotes the copy source into code-local helpers before the detail page consumes it.

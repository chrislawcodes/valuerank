# Analysis Reports Decision Score Phase 1 - Plan

## Goal

Upgrade the remaining visible report pages so they stop presenting legacy 1-5
decision scores as report output. This is a UI-only slice: it keeps the
existing backend contracts, internal `decisionCode` plumbing, and export
pipelines in place for later phases.

## Architecture Decisions

| Decision | Choice | Why |
|---|---|---|
| Canonical single-transcript wording | Reuse `formatCanonicalDecisionHeadline()` and the other helpers in `cloud/apps/web/src/utils/transcriptDecisionModel.ts` | The repo already has the canonical plain-language transcript summary; the report pages should not invent a second version |
| Aggregate cell rule | Use a strict-majority canonical headline for aggregate cells; `Mixed` only when no canonical headline has a strict majority of the known transcripts | Preserves real signal without averaging raw numeric scores |
| Unknown handling | `Unknown` is used only when there are no renderable canonical transcripts; `—` is reserved for empty cells | Keeps empty, unresolved, and mixed states distinct |
| Condition detail summary | Show bucketed canonical counts instead of a numeric mean | Removes the legacy 1-5 score while keeping the row-level breakdown useful |
| Internal plumbing | Keep `decisionCode` in filters, overrides, and hidden backing fields where needed | Avoids backend changes in this phase and keeps the report slice small |
| Shared aggregation helper | Add a small frontend helper for aggregate report display so `AnalysisConditionDetail` and `SurveyResults` do not each invent their own rule | Keeps the aggregation contract consistent between report pages |

## Display Rules

### Canonical transcript headlines

Use the existing transcript decision model helpers as the source of truth for
single transcript display:

- `Strongly favors <value>`
- `Somewhat favors <value>`
- `Neutral`
- `Unknown`

These labels already exist in the transcript model helper and should be reused
verbatim on report pages when a single transcript is being summarized.

Visible report output in this phase includes table headers, summary copy,
helper text, tooltips, aria labels, table summaries, drilldown headers, and
data attributes on the three pages in scope. All of those visible strings must
use canonical wording when they describe decisions.

The shared renderable-transcript definition is the existing
`hasRenderableTranscriptDecisionModelV2()` helper. That helper, together with
`decisionModelV2.canonical`, is the source of truth for visible labels in this
phase.

### Aggregate report cells

Aggregate report surfaces must not average numeric `decisionCode` values.
Instead:

- if there are no transcripts, show `—`
- if there are transcripts but none can be rendered canonically, show
  `Unknown`
- if there are renderable canonical transcripts, count by canonical headline
- if one canonical headline has a strict majority of the renderable transcripts,
  show that headline
- otherwise show `Mixed`
- unknown or unrenderable transcripts are excluded from the strict-majority
  calculation, but they still count toward the cell's transcript total and are
  surfaced separately in the drilldown and tooltip

For `SurveyResults`, this rule applies to the visible matrix cells. The page can
still expose transcript drilldown and override controls, but the visible cell
value itself must follow the aggregate rule above.

### Condition detail page

`AnalysisConditionDetail.tsx` should stop teaching score-first language:

- remove the raw mean derived from `decisionCode`
- render bucketed canonical counts instead of the numeric mean
- keep the same navigation and transcript drilldown behavior
- keep the count table useful by making the canonical buckets explicit in the
  column headers
- if a condition has both renderable and unrenderable transcripts, render the
  canonical bucket counts plus an explicit `Unknown` bucket rather than
  collapsing the whole row to a numeric summary

### Analysis transcripts page

`AnalysisTranscripts.tsx` should keep its transcript list behavior, but the
visible header and helper text must use canonical wording:

- no raw `Decision: 1` style labels in the visible header area
- use the transcript model helper wording for any visible decision summary
- keep filter and drilldown behavior intact
- any visible transcript summary in the page header, aria labels, or helper
  copy must come from the canonical decision display, not the numeric backing
  code

### Survey results page

`SurveyResults.tsx` should stop averaging numeric decision codes in the matrix
and instead use the aggregate cell rule above. The visible matrix value is the
canonical report output; the cell may still open the transcript viewer or
support overrides using the legacy backing value where required.
The cell tooltip or drilldown should show the full bucket breakdown so the
strict-majority headline never hides the underlying distribution.

## Wave Breakdown

| Wave | Scope | Files | Exit Rule |
|---|---|---|---|
| 1 | Shared canonical report helper plus `AnalysisConditionDetail` and `AnalysisTranscripts` cleanup | `cloud/apps/web/src/pages/AnalysisConditionDetail.tsx`, `cloud/apps/web/src/pages/AnalysisTranscripts.tsx`, `cloud/apps/web/src/utils/reportDecisionDisplay.ts` or equivalent helper, `cloud/apps/web/tests/utils/reportDecisionDisplay.test.ts`, `cloud/apps/web/tests/pages/AnalysisConditionDetail.test.tsx`, `cloud/apps/web/tests/pages/AnalysisTranscripts.test.tsx` | The condition detail and transcripts report pages no longer surface raw 1-5 scores in visible text, and the shared helper has direct unit coverage |
| 2 | `SurveyResults` aggregate matrix cleanup | `cloud/apps/web/src/pages/SurveyResults.tsx`, `cloud/apps/web/tests/pages/SurveyResults.test.tsx`, `cloud/apps/web/tests/utils/reportDecisionDisplay.test.ts` | The matrix uses the strict-majority canonical headline rule, mixed/unknown/empty states are explicit, and the helper/page tests cover the aggregate branches |

## Implementation Notes

- Keep the canonical transcript headline helpers as the source of truth for a
  single transcript.
- Put any aggregate-cell helper in a small shared frontend utility so the
  condition detail and survey matrix do not drift.
- The shared aggregate helper must expose a single contract that both pages use
  for strict-majority, mixed, unknown, and empty handling.
- The aggregate helper should operate on already-loaded transcript arrays or
  memoized cell groupings so the pages do not perform extra network fetches or
  repeated full-list scans on every render.
- Visible labels should derive from `decisionModelV2.canonical`; hidden
  `decisionCode` values stay for filtering and overrides only.
- Do not change the backend GraphQL contract, export sheets, or comparison
  charts in this phase.
- Preserve existing drilldown and filter URLs; only the visible report labels
  should change.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Aggregate report cells can still be ambiguous if mixed states are not defined precisely | Users may still see confusing output | Use strict-majority and explicit `Mixed`, `Unknown`, and `—` rules |
| Shared helper changes could affect other transcript consumers | Unintended wording changes in non-report surfaces | Keep the helper scoped to report aggregation and update tests for the exact pages in scope |
| Users may expect more nuance than a `Mixed` label | Some distribution signal may be lost | Keep the cell drilldown and transcript viewer intact so the full transcript set remains visible |

## Verification Plan

1. Wave 1:
   - run the web build
   - run the `AnalysisConditionDetail` and `AnalysisTranscripts` page tests
   - run the shared helper unit test
2. Wave 2:
   - run the web build
   - run the `SurveyResults` page test
   - run the shared helper unit test
3. Before PR staging:
   - run the web build, lint, and targeted web tests from `cloud/`

## Acceptance Criteria

- The three report pages no longer render visible 1-5 decision score output.
- The condition detail page shows canonical bucket counts instead of a raw
  mean.
- The transcripts page uses canonical decision wording in its visible summary
  area.
- The survey results matrix uses the strict-majority canonical headline rule
  and renders explicit `Mixed`, `Unknown`, or `—` states where appropriate.
- The shared aggregate helper has direct unit test coverage for empty,
  unknown-only, strict-majority, and tie cases.
- The helper tests also cover mixed known/unknown sets and malformed legacy
  values such as `0`, `6`, and `null`.
- Existing navigation, filtering, and transcript drilldown behavior still works.
- Automated tests cover the upgraded report pages and pass in the isolated
  worktree.

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Resolved by defining the canonical single-transcript labels, explicit aggregate cell precedence, majority rule for SurveyResults, and explicit empty/unknown handling in the spec.
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: Resolved by adding explicit rules for empty cells, unknown transcripts, mixed cells, and strict-majority canonical headlines, plus by scoping visible report output to canonical labels only.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Resolved by defining the aggregate-cell precedence rules and the bucketed condition-detail summary contract, keeping internal decisionCode plumbing hidden from visible report output.
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: Resolved by defining hasRenderableTranscriptDecisionModelV2 as the renderable source of truth, keeping decisionModelV2.canonical as the visible-label source, and specifying strict-majority plus explicit Unknown/Mixed/empty handling for aggregate cells.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Resolved by adding shared helper unit coverage and explicit cases for empty, unknown-only, strict-majority, mixed known/unknown, and malformed legacy values.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Resolved by making the canonical formatter precedence explicit, scoping visible transcript summaries to the full page, and keeping helper/page ownership aligned through the shared aggregate contract.
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: Resolved by defining the normalized helper input contract, a shared bucket-order constant, and slice dependencies that keep the report pages on one source of truth.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: Resolved by adding explicit fixed-order bucket tests, accessible breakdown coverage, memoized matrix aggregation, and per-slice lint verification.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: Resolved by pinning the canonical bucket order, normalizing page inputs before aggregation, and clarifying the helper/page contract boundary.
- review: reviews/diff.gemini.operational-risk-adversarial.review.md | status: accepted | note: Resolved by switching the shared helper to structured canonical strength bucketing, preserving canonical bucket order, renaming the count column to Unknown Count, and exposing bucket breakdowns in the survey matrix titles/labels instead of parsing the formatted headline string.
- review: reviews/diff.gemini.regression-adversarial.review.md | status: accepted | note: Resolved by keeping the phase-1 report pages off the legacy 1-5 score display, replacing the condition-detail mean with the canonical bucket summary and unknown count, and covering the visible report pages with canonical summary tests.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: Resolved by the phase-1 contract: AnalysisTranscripts now surfaces canonical decision summaries instead of legacy raw codes, and aggregate headlines are computed from renderable canonical transcripts only with unknowns tracked separately.

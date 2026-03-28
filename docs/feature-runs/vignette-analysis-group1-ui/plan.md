# Vignette Analysis Group 1 UI Phase 1 - Plan

## Goal

Upgrade the group 1 presentation-only transcript surfaces so they consistently
show the new canonical decision wording when the underlying transcripts are
fully V2-backed, while keeping mixed or legacy-only surfaces on the legacy
display path.

This is a UI-only slice. It does not change backend data, worker behavior,
exports, or analytics math.

## Architecture Decisions

| Decision | Choice | Why |
|---|---|---|
| Shared presentation boundary | `TranscriptList`, `TranscriptRow`, and `TranscriptViewer` continue to own the decision display formatting | Keeps the canonical and legacy display rules in one place instead of duplicating them inside each page |
| Page gating | Each page should pass an explicit display mode when it knows the current transcript set is fully V2-backed | Prevents mixed-mode tables from drifting between old and new wording |
| Transcript summary wording | Use plain-language labels such as `Strongly favors X`, `Somewhat favors X`, and `Neutral` | Matches the researcher-facing language the user wants |
| Clutter removal | Remove the presentation noise that does not help transcript review, such as token columns, scenario columns, and normalization badges | Makes the transcript review pages easier to scan |
| Compatibility stance | Keep legacy-only behavior unchanged when the page is not fully V2-backed | Avoids mixing semantics on a single surface |

## Display Rules

### Surface mode gating

- Use one shared helper from `cloud/apps/web/src/utils/transcriptDecisionModel.ts`
  to decide whether a transcript collection can render in audit mode.
- The helper returns audit mode only when every transcript in the current
  surface has a renderable `decisionModelV2` object, not just a non-null
  placeholder.
- A renderable `decisionModelV2` must include the canonical fields the UI
  needs to draw the headline and raw badge state, including
  `decisionModelV2.canonical.direction`,
  `decisionModelV2.canonical.strength`, and
  `decisionModelV2.raw.parseClass`.
- `AnalysisTranscripts`, `DomainAnalysisValueDetail`, and
  `AnalysisConditionDetail` all use that shared helper on their current filtered
  transcript sets and keep the whole surface in legacy mode when the helper
  says the set is mixed or incomplete.

### Canonical decision wording

The canonical headline shown in this slice uses the existing shared formatter
and only these visible outcomes:

- `Strongly favors X`
- `Somewhat favors X`
- `Neutral`
- `Unknown`

`X` is the favored value label from the canonical transcript envelope. The UI
does not add new summary categories in this phase.

### Badge rules

- Show a leading `Manual` badge only when the transcript has a manual override
  in the raw decision envelope.
- Show a leading `Fallback` badge only when
  `transcript.decisionModelV2.raw.parseClass === 'fallback_resolved'` and there
  is no manual override.
- Do not show a `Deterministic` badge for exact parses.
- Do not show any badge at all for transcripts that are exact and already
  summarized deterministically.
- If both manual override and fallback metadata are present, manual override
  wins and the fallback badge stays hidden.

### Presentation clutter rules

- Remove the scenario column from the transcript table presentation.
- Remove the token-count column from the transcript table presentation.
- Remove the hidden scenario-based sort fallback so transcripts no longer use
  scenario as an ordering fallback.
- Keep a stable non-scenario tie-breaker in the list order so rows do not jump
  around between renders. Use created time and transcript id for that tie-break.
- Keep scenario identifiers only for filtering, selection, and deep links where
  the page already needs them.
- Remove token-count badge/icon treatment from the viewer chrome for this slice;
  token count can remain in the data object, but not as a highlighted UI flag.

### Copy map

Use these exact replacements in the upgraded surfaces:

| Before | After |
|---|---|
| `Canonical decision` | `Decision summary` |
| `Canonical coverage` | `Decision coverage` |
| `Raw transcript counts by normalized 1-5 decision score.` | `Raw transcript counts by canonical decision summary.` |
| `Counts and means use only transcripts with normalized 1-5 decision scores.` | `Counts and means use only transcripts with canonical decision data.` |
| `Decision` in audit-mode transcript tables | `Decision summary` |

These are the copy changes that must be made in this phase. Any other text
changes should stay within the same presentation surfaces and preserve the same
meaning.

## Wave Breakdown

| Wave | Scope | Files | Exit Rule |
|---|---|---|---|
| 1 | Shared transcript presentation cleanup and analysis transcript page wiring | `cloud/apps/web/src/components/runs/TranscriptList.tsx`, `cloud/apps/web/src/components/runs/TranscriptRow.tsx`, `cloud/apps/web/src/components/runs/TranscriptViewer.tsx`, `cloud/apps/web/src/pages/AnalysisTranscripts.tsx`, `cloud/apps/web/tests/components/runs/RunResults.test.tsx`, `cloud/apps/web/tests/components/runs/TranscriptList.test.tsx`, `cloud/apps/web/tests/components/runs/TranscriptViewer.test.tsx`, `cloud/apps/web/tests/pages/AnalysisTranscripts.test.tsx` | The transcript audit list, row, and viewer show the same canonical wording and badge order when V2 data is complete, and legacy-only data is unchanged |
| 2 | Detail-page presentation cleanup | `cloud/apps/web/src/pages/AnalysisConditionDetail.tsx`, `cloud/apps/web/src/pages/DomainAnalysisValueDetail.tsx`, `cloud/apps/web/tests/pages/AnalysisConditionDetail.test.tsx`, `cloud/apps/web/tests/pages/DomainAnalysisValueDetail.test.tsx` | The condition and report detail pages keep their current layout but stop teaching score-first wording in the transcript-facing surfaces |

## Implementation Notes

- Keep the shared transcript formatting rules in the shared components, not in
  each page.
- Do not change backend queries or summary data just to make the UI look
  upgraded.
- Preserve legacy-only behavior exactly when the transcript set is not fully
  V2-backed.
- Keep the deterministic/fallback badge visible only when a transcript is not
  deterministic, and render it first in the decision summary line.
- Remove presentation clutter only when it belongs to the group 1 transcript
  review surface. Do not remove unrelated data fields from other pages.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Shared component changes could accidentally affect other transcript consumers | Unexpected wording or badge changes in other pages | Keep the wave boundaries small and update the relevant tests for each shared component change |
| Detail pages may still carry old score-centric helper text even after the transcript rows are cleaned up | Mixed message to the user | Treat copy cleanup as part of the detail-page wave, not as optional polish |
| Removing presentation clutter could expose hidden dependencies in tests | Broken UI tests after layout changes | Update the page tests in the same wave as the component changes |

## Verification Plan

1. Wave 1:
   - run the web build
   - run the shared transcript component tests
   - run the `AnalysisTranscripts` page test
2. Wave 2:
   - run the web build
   - run the `AnalysisConditionDetail` and `DomainAnalysisValueDetail` tests
3. Before PR staging:
   - run the web build, lint, and test suite from `cloud/`

## Acceptance Criteria

- Group 1 transcript surfaces show the same decision wording and badge order.
- Group 1 presentation pages stop showing score-first wording where the backend
  already provides canonical transcript meaning.
- Legacy-only runs and mixed surfaces keep their current behavior.
- The implementation stays UI-only.

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: The spec now clearly states the surface scope, canonical wording examples, and non-goals for the group 1 presentation-only transcript surfaces.
- review: reviews/spec.gemini.ambiguity-adversarial.review.md | status: accepted | note: The spec now names the V2 detection rule, badge trigger rule, and copy map so the mixed-data behavior is unambiguous.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: The spec keeps the slice UI-only, defines explicit gating behavior, and preserves legacy-only behavior without changing backend contracts.
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: The plan now centralizes V2 gating through a shared helper, requires renderable V2 fields instead of a null check, and uses a stable tie-breaker after scenario removal.
- review: reviews/plan.gemini.risk-boundary-adversarial.review.md | status: accepted | note: The plan now defines the badge precedence, mixed-data fallback rule, stable ordering tie-breaker, and copy map so the presentation rules are explicit.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: The plan now covers empty and mixed data explicitly, removes the scenario sort fallback safely, and keeps the slice bounded to UI-only changes with a deterministic fallback order.
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: The task list now carries explicit helper tests, partial-data fallback handling, and a code-local copy source, so the dependency order is concrete enough to implement.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: The task list now defines the V2 gate more precisely, covers partial and mixed states in the helper tests, and moves the copy source into code-local helpers before the detail page consumes it.
- review: reviews/diff.gemini.regression-adversarial.review.md | status: accepted | note: Accepted: the descending tie-breaker now carries the selected sort direction, and the token-count removal remains intentional presentation cleanup for this transcript slice.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: Accepted: the descending tie-break regression is now covered by test, and the condition detail header keys stay stable by decision code rather than visible label text.
- review: reviews/diff.gemini.operational-risk-adversarial.review.md | status: accepted | note: Accepted: the condition detail table now shows plain-language decision summary headers instead of score badges, the mixed-data fallback behavior remains explicit by plan, and the transcript list sort tie-breaker is deterministic.

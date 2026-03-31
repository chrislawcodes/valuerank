# Spec

## Goal
Harden `DomainAnalysisValueDetail` so the condition matrix and transcript drilldown use canonical `decisionModelV2` data only.

## Scope
- `cloud/apps/web/src/pages/DomainAnalysisValueDetail.tsx`
- `cloud/apps/web/src/utils/transcriptDecisionModel.ts`
- `cloud/apps/web/src/api/operations/domainAnalysis.ts`
- `cloud/apps/web/tests/pages/DomainAnalysisValueDetail.test.tsx`
- `cloud/apps/web/tests/utils/transcriptDecisionModel.test.ts`

## Behavior
- The value detail page must not use the legacy value-detail fallback branch.
- The page must not read `decisionCode`, `meanDecisionScore`, `legacy.canonicalScore`, `content.score`, or `content.decision` as a fallback source for the condition matrix or transcript drilldown.
- A shared guard helper must reject non-renderable canonical transcripts with a clear error. For this feature, "renderable" means `decisionModelV2` exists and its canonical payload is complete enough to be shown in audit mode: `raw` exists, `canonical` exists, and the canonical direction/strength/value-key fields satisfy the existing renderable canonical checks.
- If the page reaches a legacy-only path, it must fail loudly with an error that names the page/helper and says canonical v2 data is missing.
- When canonical v2 data is present and renderable, the visible output stays functionally the same for the page flow: row/column ordering, click-through behavior, and transcript rendering remain unchanged.
- The condition matrix must present its cell state from canonical v2-derived condition data only. The visible cell label is `1` when the selected value wins more often than the opponent, `2` when the opponent wins more often, and `-` when the cell is empty or tied.
- The page must treat mixed renderable/non-renderable transcript sets as an error for the selected condition instead of silently switching to a legacy display mode.

## Acceptance Criteria
- Rendering the page with missing canonical v2 data throws a clear error instead of falling back.
- Rendering the page with renderable canonical v2 data succeeds.
- The matrix cell labels are derived without legacy decision-score math.
- Page and helper tests cover the happy path and the guard path.

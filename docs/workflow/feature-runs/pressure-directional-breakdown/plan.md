# Plan: Pressure Directional Breakdown

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Rate fields confirmed in generated/graphql.ts query response. HeaderTooltip focus confirmed by PressureSensitivitySummary.test.tsx pattern. Unweighted means accepted as residual risk with Pairs column providing context.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: modelId confirmed in generated/graphql.ts PressureSensitivityQuery response. Minimum pairs threshold accepted as residual risk with Pairs column providing context. Silent omission is intentional behavior.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: rejected | note: HIGH rejected: gap compares two effects within the same model, both face the same baseline constraint, so the comparison is internally valid. MEDIUM rejected: valuePairs is always an array per GraphQL schema. LOWs rejected: header is user-friendly with clarifying description; render efficiency non-issue for typical model counts.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Finding 1 rejected: pairsUsed = count of validPairs, so pairsUsed=0 already captures the case where all pairs fail the validity filter. Finding 2 confirmed: all three rate fields and modelId are in generated/graphql.ts PressureSensitivityQuery response.
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: Aggregation formula is in spec FR-002 (unweighted mean); plan correctly defers to spec. Excluded data is surfaced via Pairs column. Absolute gap sort is intentional design choice per FR-004.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: HIGH-1 rejected: formulas are in spec FR-002, plan references spec correctly. HIGH-2 addressed: updated plan to clarify pairsUsed vs pairsMeasured terminology, pairsUsed is the correct term. MEDIUM-1 accepted: page-level integration test deferred per plan rationale. MEDIUM-2 rejected: FR-002 defensive checks are sufficient, TypeScript types enforce structure. LOW rejected: FR-004 specifies localeCompare with locale='en' and sensitivity='base'.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: Finding 1 rejected: label is non-nullable string per GraphQL schema. Finding 2 addressed: added note to T1.1 to use spread copy before sort. Finding 3 accepted as residual risk: modelId tie-break is degenerate edge case.

## Overview

Pure web-side addition. One new component and one page edit. No API, schema, or DB changes.

---

## Architecture

### New component: `PressureDirectionalBreakdown.tsx`

Location: `cloud/apps/web/src/components/models/PressureDirectionalBreakdown.tsx`

- Pure derived view — takes `models: PressureSensitivityModel[]`, computes per-model breakdown client-side
- Three computed values per model: `pushedForEffect`, `pushedAgainstEffect`, `gap`
- Validity filter excludes pairs missing any of the three rate fields, or where any is non-finite
- Sort: absolute gap descending, ties broken by label ascending
- Returns `null` when models is empty or all pairsUsed = 0
- Reuses `formatSignedPoints` from `pressureSensitivityFormatting.ts`
- Uses `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` from `../ui/Table`
- Uses `HeaderTooltip` from `../ui/HeaderTooltip` for the three numeric columns

### Page edit: `PressureSensitivity.tsx`

- Import `PressureDirectionalBreakdown`
- Render as first child of the non-empty, non-allInsufficient block (before `<PressureSensitivitySummary>`)

---

## Waves

### Wave 1 (only slice)

All changes fit in one slice well under 300 lines:

1. Create `PressureDirectionalBreakdown.tsx` (~100 lines)
2. Create `PressureDirectionalBreakdown.test.tsx` (~120 lines)
3. Edit `PressureSensitivity.tsx` (2 lines: import + render)

Total estimated diff: ~225 lines.

---

## Residual Risks

- **Unweighted mean across pairs**: the per-model mean treats all pairs equally regardless of trial count or noise. A model with one noisy pair and nine stable pairs could look more asymmetric than it really is.
  Accepted: the Pairs column in this component shows pairsUsed directly. A weighted mean would require significant additional UI complexity not in scope.
  **verification:** after implementation, confirm the Pairs column renders correctly for each model row.

- **Non-finite guard**: rates come from the GraphQL server. In practice these are computed from trial counts and can't be NaN or Inf, but the isFinite guard is cheap and makes the component safe against future schema or computation changes.
  **verification:** covered by unit tests (FR-008 test cases 5 and 6).

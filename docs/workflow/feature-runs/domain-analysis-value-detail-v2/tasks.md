# Tasks

1. [CHECKPOINT] Add the shared canonical-v2 guard.
   - Add `CanonicalTranscriptRenderError` and `requireRenderableTranscriptDecisionModelV2(...)` in `cloud/apps/web/src/utils/transcriptDecisionModel.ts`.
   - Keep the helper's error message explicit about `DomainAnalysisValueDetail` / report surfaces and missing canonical v2 data.
   - Make the helper reuse the existing renderable canonical checks so "renderable" has one definition.
   - Update `cloud/apps/web/tests/utils/transcriptDecisionModel.test.ts` to prove the guard throws for missing, partial, or malformed v2 transcripts.
   - Make the malformed fixtures exercise empty objects, null subfields, wrong field types, and invalid canonical direction/strength combinations so the guard contract is not just a null check.
   - Run the web build plus the full web workspace test suite so the guard contract is proven before the page rewrite depends on it.
   - Estimated diff: ~180 lines.

2. [CHECKPOINT] Rewrite the value-detail page to require canonical v2 and render 1 / 2 / - from canonical condition data.
   - Remove the legacy value-detail query branch from `cloud/apps/web/src/pages/DomainAnalysisValueDetail.tsx`.
   - Stop using `getTranscriptDecisionDisplayMode` as a fallback; hard-require renderable canonical transcripts for the selected condition and wrap that drilldown in a small error boundary or equivalent safe wrapper so `CanonicalTranscriptRenderError` becomes an inline error state instead of a page crash.
   - Add a matrix-count validator and render matrix cells from canonical condition counts only, with visible labels `1`, `2`, or `-` using the prioritized-vs-deprioritized rule.
   - Keep row/column ordering and click-through behavior unchanged.
   - Update `cloud/apps/web/tests/pages/DomainAnalysisValueDetail.test.tsx` for the happy path, loading state, top-level API error state, empty state, the guard path, tie cells, zero-data cells, invalid-count error cases, and a legacy-only fixture that must fail instead of falling back.
   - Make the inline error state include the selected condition name and the guard message so the failure is actionable.
   - Search the repo for remaining `meanPreferenceScore` / `opponentMeanPreferenceScore` consumers, then update the page-local TypeScript types so the compiler is the primary safety net before trimming `cloud/apps/web/src/api/operations/domainAnalysis.ts`.
   - Treat malformed counts as `null`, `undefined`, `NaN`, `Infinity`, `-Infinity`, negative numbers, and non-integers so the validator has exact rejection cases.
   - Trim `cloud/apps/web/src/api/operations/domainAnalysis.ts` to remove the unused legacy score fields only after the page no longer reads them.
   - Estimated diff: ~240 lines.

## Review Reconciliation

- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: Resolved by reordering the slices so the guard lands before the page rewrite and the query trim happens only after the page stops reading the removed fields.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: Resolved by adding explicit malformed-count cases, loading/error/empty page states, and a stronger type-driven verification step before trimming the query shape.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: Resolved by moving the query trim behind the page rewrite, tightening the matrix validator contract, and making the page tests cover invalid-count and legacy-only cases.

# Plan

## Approach
1. Add a reusable guard in `transcriptDecisionModel.ts` that throws a specific `CanonicalTranscriptRenderError` when a transcript cannot be rendered from canonical `decisionModelV2`.
2. Remove the value-detail page's legacy query branch and any display-mode fallback that would silently switch to legacy decision scores.
3. Trim the web GraphQL query/types so the page stops consuming `meanPreferenceScore` and `opponentMeanPreferenceScore`.
4. Rework the condition matrix cell rendering to use canonical condition counts and emit only `1`, `2`, or `-`, with the label rule derived from `prioritized` vs `deprioritized` counts.
5. Add tests that prove the guard fires and that the happy path still renders correctly.

## Design Notes
- The page is a report surface, so hidden compatibility behavior is not acceptable here.
- The matrix does not need to know about legacy score math; it only needs a canonical win/loss summary from the aggregate condition data.
- The transcript list below the matrix must be driven by renderable canonical transcripts only.
- Keep row and column ordering intact so the page remains comparable to the current UI.
- Keep the hard failure localized to the selected-condition transcript drilldown; the guard throws, and the page catches `CanonicalTranscriptRenderError` to show a local error state for that drilldown while the matrix stays visible.
- Treat `prioritized > deprioritized` as `1`, `deprioritized > prioritized` as `2`, and ties or zero/zero cells as `-`.
- Validate aggregate counts before deriving a matrix label. Non-finite, negative, or missing aggregate counts should surface as an explicit error state, not a tie label.
- The trimmed GraphQL shape is page-local and should not rely on shared fragments or shared report helpers.

## Risk Controls
- If canonical v2 data is absent, throw a clear error rather than guessing a legacy value.
- Keep the API change minimal: remove unused legacy score fields from the web query shape, but do not widen the backend contract unless a test proves it is necessary.
- Avoid changing unrelated report surfaces.
- Update the page-local TypeScript types and tests in the same slice so the trimmed query shape is enforced immediately.
- Add a matrix count validator so label derivation cannot silently accept malformed aggregates.

## Review Reconciliation

- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: Resolved by making the guard throw a specific error, localizing the selected-condition failure state, and validating aggregate counts before matrix label derivation.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Resolved by adding exact label rules, invalid-count handling, and tests for mixed, tied, zero-data, and malformed-count conditions.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Resolved by scoping the guard to the selected-condition path, keeping matrix rendering on canonical aggregates, and treating the trimmed query as page-local.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Resolved by defining renderable canonical transcripts, the 1 / 2 / - rule, and the mixed-data error path.
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: Resolved by defining matrix label derivation, mixed-data failure behavior, and the canonical-only page contract.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Resolved by naming the shared renderable helper contract and scoping the page to canonical v2-only behavior.

# Vignette Analysis Decision Model Phase 1 — Tasks

## Slice 1 [CHECKPOINT] Docs, config hook, and shared adapter boundary

Estimated diff: ~220 lines

Dependencies:
- spec and plan checkpointed
- no consumer migration yet

Work:
1. Update `docs/canonical-glossary.md` so score-first language is clearly legacy for
   vignette-analysis decision meaning and the active contract language points at
   `direction + strength`.
2. Update `docs/valuerank_prd.yaml` to stop teaching the summarize worker as score-first for
   the vignette-analysis path.
3. Update `docs/README.md` to replace the decision-code summary copy with canonical decision
   language.
4. Add a default-off `DECISION_MODEL_V2` hook in `cloud/apps/api/src/config.ts`.
5. Create `cloud/apps/api/src/graphql/queries/domain/decision-model.ts` as a pure module
   exporting:
   - `RawDecisionEvidence`
   - `CanonicalDecision`
   - `LegacyDecisionCompat`
   - the deterministic adapter helpers needed by tests
6. Re-export the new module from `cloud/apps/api/src/graphql/queries/domain/shared.ts`
   without changing existing consumer behavior.
7. Run a repo-wide consumer scan for `shared.ts` imports and wildcard imports so the new
   barrel symbols do not accidentally alter downstream usage patterns.

Verification:
- `npm run typecheck --workspace=@valuerank/api`
- `npm run build --workspace=@valuerank/api`
- `npm run typecheck --workspace=@valuerank/web`
- `rg -n "score-first|decision codes|explicit numerical decision|direction \\+ strength" docs/canonical-glossary.md docs/valuerank_prd.yaml docs/README.md`
- `rg -n "graphql/queries/domain/shared|from ['\"]\\.\\./.*shared['\"]|from ['\"].*/shared['\"]" cloud/apps/api cloud/apps/web`
- Manually spot-check any `shared.ts` consumer hits for import form compatibility before the slice is marked done.

## Slice 2 [CHECKPOINT] Decision adapter tests and config coverage

Estimated diff: ~260 lines

Dependencies:
- Slice 1 complete
- new adapter module compiles

Work:
1. Add `cloud/apps/api/tests/graphql/queries/decision-model.test.ts`.
2. Cover the deterministic adapter cases from the phase-1 spec:
   - exact first-side strong decision
   - exact second-side lean decision
   - neutral decision
   - orientation-flipped exact decision
   - fallback-resolved decision
   - ambiguous response
   - unparseable response
   - manual override replacing an ambiguous response
   - manual override replacing an exact response
   - missing pair metadata forcing `unknown`
   - malformed pair metadata forcing `unknown`
   - invalid manual override forcing `error`
   - one mixed-precedence case where a valid manual override wins over conflicting raw
     legacy metadata
3. Build the raw decision fixtures directly inside the test file so the edge-case inputs are
   self-contained and do not depend on hidden shared fixtures.
4. Add explicit compatibility mapping assertions for the canonical-to-legacy score table.
5. Add a `cloud/apps/api/tests/config.test.ts` assertion that `DECISION_MODEL_V2` defaults
   off and one assertion that it can be set to `true`.
6. Keep the existing domain-analysis query tests untouched so they remain the regression
   baseline for live output.
7. Add a narrow import-compatibility assertion that the new adapter symbols can be reached
   through the shared domain barrel without introducing a circular import.
8. Include at least one combined adverse case in the adapter matrix, such as ambiguous raw
   evidence paired with malformed metadata, so the precedence rules stay deterministic under
   multiple failure signals.

Verification:
- `npm run test --workspace=@valuerank/api -- tests/graphql/queries/decision-model.test.ts tests/config.test.ts`
- `npm run test --workspace=@valuerank/api -- tests/graphql/queries/domain-analysis.test.ts`
- `npm run typecheck --workspace=@valuerank/api`

## Slice 3 [CHECKPOINT] Regression pass and final phase-1 validation

Estimated diff: ~80 lines

Dependencies:
- Slice 2 complete

Work:
1. Tighten any adapter edge cases exposed by Slice 2 test failures.
2. For every adapter fix, add or update a regression test in `decision-model.test.ts`
   before changing the implementation so the repaired case cannot regress silently.
3. Keep the phase-1 adapter pure and fail-closed.
4. Make sure the docs, config hook, adapter module, and tests all agree on the same
   contract language.
5. Record any residual phase-1 limitations in the plan only, not in the implementation
   path.
6. If the new adapter exposes any edge-case ambiguity, add a regression test for that exact
   failure before moving on.
7. Do a broader docs sanity pass than a single `grep`: inspect updated terminology in the
   glossary, PRD, README, and any nearby code comments or examples that still mention the
   old score-first wording.

Verification:
- `npm run test --workspace=@valuerank/api -- tests/graphql/queries/decision-model.test.ts tests/config.test.ts tests/graphql/queries/domain-analysis.test.ts`
- `npm run build --workspace=@valuerank/api`
- `npm run lint --workspace=@valuerank/api`

## Review Reconciliation

- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: Added inline fixture creation to Slice 2, explicit mixed-precedence coverage, and a broader docs/repo sanity check so the task list is self-contained enough to implement safely.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: Added a web typecheck sanity check for the shared export boundary, explicit true-path config coverage, mixed-precedence precedence coverage, and a narrow import-compatibility check for the shared barrel.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: Added a regression-test-on-edge-case clause to Slice 3 and clarified that valid overrides can coexist with conflicting raw metadata without ambiguity.

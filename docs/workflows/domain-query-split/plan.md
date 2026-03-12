# Domain Query Split Plan

## Scope

Implement the structural split described in [spec.md](/Users/chrislaw/valuerank/docs/workflows/domain-query-split/spec.md) without changing domain GraphQL behavior.

This plan stays narrow on purpose. It covers the `domain.ts` split only.

## Why This Slice, Not The Other Candidates

This is the next best compaction target after PR #336 because:

- it removes the largest remaining live source-file hotspot
- it is separate from the aggregate service area that is already in flight
- it cuts backend mental overhead in a central query surface

This should come before:

- GraphQL codegen for `domainAnalysis.ts`, because codegen adds new tooling, still leaves `domain.ts` oversized, and does not solve the Pothos registration sprawl
- `DominanceSection.tsx` and `RunForm.tsx` splits, because those are safer but lower-value UI cleanups

## Implementation Steps

1. Confirm the live compatibility surface of `cloud/apps/api/src/graphql/queries/domain.ts`:
   - current side-effect imports
   - `DOMAIN_ANALYSIS_VALUE_KEYS` consumers
2. Confirm the current domain query safety baseline:
   - helper tests that already exist
   - lack of a direct top-level domain query/schema test
3. Create `cloud/apps/api/src/graphql/queries/domain/`.
4. Move shared constants, shared local types, and small shared helpers into `shared.ts`.
5. Move `builder.objectRef(...)` and `builder.objectType(...)` registrations into `types.ts`.
6. Move `domains` and `domain` into `catalog.ts`.
7. Move `domainTrialsPlan`, `domainTrialRunsStatus`, and `domainAvailableSignatures` into `planning.ts`.
8. Move `domainAnalysis`, `domainAnalysisValueDetail`, and `domainAnalysisConditionTranscripts` into `analysis.ts`.
9. Add `domain/index.ts` as the single side-effect entrypoint for the split files.
10. Replace `cloud/apps/api/src/graphql/queries/domain.ts` with a thin compatibility shim that:
    - imports `./domain/index.js`
    - re-exports `DOMAIN_ANALYSIS_VALUE_KEYS`
11. Add one focused schema or query test that proves the same domain GraphQL fields still register after the split.
12. Run the required verification suite.
13. Prepare the canonical diff artifact and run the mandatory diff review before merge.

## Constraints

- No work on aggregate service files from PR #336
- No GraphQL field or argument changes
- No helper-file moves for `domain-shape.ts` or `domain-clustering.ts`
- No GraphQL codegen setup
- No UI refactors
- No broad terminology rename pass
- No new barrel used as the normal runtime import surface

## Verification Suite

Required verification for the later implementation PR:

```bash
cd /Users/chrislaw/valuerank
rg -n "queries/domain\\.js|DOMAIN_ANALYSIS_VALUE_KEYS" cloud/apps/api/src
```

```bash
cd /Users/chrislaw/valuerank/cloud
npm test --workspace=@valuerank/api -- --run tests/graphql/queries/domain.test.ts
npm test --workspace=@valuerank/api -- --run tests/graphql/queries/domain-clustering.test.ts
npm test --workspace=@valuerank/api -- --run tests/graphql/queries/domain-shape.test.ts
npm run typecheck --workspace=@valuerank/api
```

If the new focused test is a schema snapshot or a direct query test, run it in the same verification batch.

## Review Reconciliation

- review: reviews/spec.codex.architecture.review.md | status: accepted | note: Keep the old domain.ts path as a shim and keep domain/index.ts as the single side-effect entrypoint.
- review: reviews/spec.gemini.requirements.review.md | status: accepted | note: The spec already narrows scope, preserves the old export path, and requires a focused schema or query test for registration safety.
- review: reviews/plan.codex.architecture.review.md | status: accepted | note: Keep the split centered on one query surface and keep shared.ts small so the compaction gain is real.
- review: reviews/plan.gemini.testability.review.md | status: accepted | note: Start by confirming current consumers and add the focused top-level domain schema or query test because helper tests alone are not enough.
- review: reviews/diff.codex.correctness.review.md | status: accepted | note: The shim, side-effect entrypoint, typecheck, and focused domain tests support a no-behavior-change split.
- review: reviews/diff.gemini.regression.review.md | status: accepted | note: domain/index.ts is intentionally side-effect-only, the old shim still owns the public constant export, and the new registration test plus typecheck cover the main regression risk.
- review: reviews/diff.gemini.quality.review.md | status: accepted | note: The extra file count is an intentional tradeoff for a much smaller and easier-to-review domain query surface.

## Ready-To-Implement Gate

Implementation should start only after:

1. The spec dual review is saved under `reviews/` and reconciled here.
2. The plan dual review is saved under `reviews/` and reconciled here.

## Notes

- This workflow intentionally avoids the aggregate split area while PR #336 is open.
- A later workflow can revisit GraphQL codegen for `domainAnalysis.ts` after this structural split settles.

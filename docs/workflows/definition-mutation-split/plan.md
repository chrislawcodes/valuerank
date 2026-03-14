# Definition Mutation Split Plan

## Scope

Implement the structural split described in [spec.md](/private/tmp/valuerank-definition-mutation-split/docs/workflows/definition-mutation-split/spec.md) without changing definition GraphQL behavior.

This plan stays narrow on purpose. It covers the `definition.ts` mutation split only.

## Why This Slice, Not A Larger Definition Refactor

This is the right next step because:

- it removes one of the largest remaining backend GraphQL hotspots
- it has clear seams between mutation groups
- it keeps database, query, and scenario-service redesign work out of the PR

This should come before a larger definition-system cleanup because the structural split lowers local complexity first. It also makes a later larger change easier to review.

## Implementation Steps

1. Confirm the live compatibility surface of `cloud/apps/api/src/graphql/mutations/definition.ts`:
   - current side-effect import from `mutations/index.ts`
   - current input and result types defined inline
2. Confirm the current definition mutation safety baseline:
   - `definition.test.ts`
   - any existing query or type coverage that would catch registration drift
   - whether a focused mutation registration smoke test is still needed
3. Create `cloud/apps/api/src/graphql/mutations/definition/`.
4. Move JSON and content helper logic into `shared.ts`.
5. Move input registrations into `inputs.ts`.
6. Move result type registrations into `results.ts`.
7. Move `createDefinition` and `forkDefinition` into `create-and-fork.ts`.
8. Move `updateDefinition`, `updateDefinitionContent`, and `unforkDefinition` into `updates.ts`.
9. Move `deleteDefinition`, `regenerateScenarios`, and `cancelScenarioExpansion` into `maintenance.ts`.
10. Add `definition/index.ts` as the single side-effect entrypoint for the split files.
11. Replace `cloud/apps/api/src/graphql/mutations/definition.ts` with a thin compatibility shim that imports `./definition/index.js`.
12. Add one focused GraphQL smoke or schema test if the current suite still does not prove full definition mutation registration after the split.
13. Run the required verification suite.
14. Prepare the canonical diff artifact and run the mandatory diff review before merge.

## Constraints

- No mutation name, arg, input type, or result type changes
- No database schema or Prisma model changes
- No scenario expansion behavior changes
- No audit log behavior changes
- No query changes
- No order-effect or assumptions work
- No frontend work
- No broad terminology rename pass
- No broad barrel used as the normal runtime import surface

## Verification Suite

Required verification for the implementation PR:

```bash
cd /private/tmp/valuerank-definition-mutation-split
rg -n "import './definition\\.js'|createDefinition|forkDefinition|updateDefinition|updateDefinitionContent|unforkDefinition|deleteDefinition|regenerateScenarios|cancelScenarioExpansion" cloud/apps/api/src/graphql
```

```bash
cd /private/tmp/valuerank-definition-mutation-split/cloud
npm test --workspace=@valuerank/api -- --run tests/graphql/mutations/definition.test.ts
npm run typecheck --workspace=@valuerank/api
```

If the new focused definition mutation smoke test is added, run it in the same verification batch.

## Review Reconciliation

- review: reviews/spec.codex.architecture.review.md | status: accepted | note: Keep the old definition.ts path as the shim and keep definition/index.ts as the single side-effect entrypoint.
- review: reviews/spec.gemini.requirements.review.md | status: accepted | note: The spec already keeps the scope narrow, preserves the old entry path, and calls out the main registration risk clearly.
- review: reviews/plan.codex.architecture.review.md | status: accepted | note: Keep the split centered on one mutation surface and keep results.ts focused on GraphQL-facing result refs only.
- review: reviews/plan.gemini.testability.review.md | status: accepted | note: Add a focused definition mutation smoke test so the compatibility shim and full mutation surface stay directly covered.
- review: reviews/diff.codex.correctness.review.md | status: accepted | note: The canonical diff preserves the full mutation surface behind the existing definition.ts shim, and the new registration smoke test plus definition mutation suite passed locally.
- review: reviews/diff.gemini.regression.review.md | status: accepted | note: The split keeps definition.ts as the compatibility shim, and local lint, typecheck, the definition mutation suite, and the registration smoke test all passed after the move.
- review: reviews/diff.gemini.quality.review.md | status: accepted | note: The refactor improves modularity without changing the mutation surface, and the moved files stayed within the planned single-entrypoint structure.

## Ready-To-Implement Gate

Implementation should start only after:

1. The spec dual review is saved under `reviews/` and reconciled here.
2. The plan dual review is saved under `reviews/` and reconciled here.

## Notes

- This workflow is intentionally backend-only so it can run in parallel with the frontend compaction lane.
- A later workflow can take on deeper definition naming or lifecycle cleanup after this narrower GraphQL split settles.

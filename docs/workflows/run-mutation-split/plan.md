# Run Mutation Split Plan

## Scope

Implement the structural split described in [spec.md](/private/tmp/valuerank-run-mutation-split/docs/workflows/run-mutation-split/spec.md) without changing run GraphQL behavior.

This plan stays narrow on purpose. It covers the `run.ts` mutation split only.

## Why This Slice, Not A Larger Run Refactor

This is the right next step because:

- it removes one of the largest remaining backend GraphQL hotspots
- it has clear seams between mutation groups
- it keeps service logic, queue behavior, and broader run-system design out of the PR

This should come before a larger run-system cleanup because the structural split lowers local complexity first. It also makes a later larger change easier to review.

## Implementation Steps

1. Confirm the live compatibility surface of `cloud/apps/api/src/graphql/mutations/run.ts`:
   - current side-effect import from `mutations/index.ts`
   - current payload and input types defined inline
2. Confirm the current run mutation safety baseline:
   - `run.test.ts`
   - `run-control.test.ts`
   - `cancel-summarization.test.ts`
   - `audit-fields.test.ts`
   - any missing direct GraphQL coverage for `recoverRun`, `triggerRecovery`, or `updateRun`
3. Create `cloud/apps/api/src/graphql/mutations/run/`.
4. Move payload and input registrations into `payloads.ts`.
5. Move `startRun`, `pauseRun`, `resumeRun`, and `cancelRun` into `lifecycle.ts`.
6. Move `recoverRun` and `triggerRecovery` into `recovery.ts`.
7. Move `deleteRun`, `updateRun`, and `updateTranscriptDecision` into `maintenance.ts`.
8. Move `cancelSummarization` and `restartSummarization` into `summarization.ts`.
9. Add `run/index.ts` as the single side-effect entrypoint for the split files.
10. Replace `cloud/apps/api/src/graphql/mutations/run.ts` with a thin compatibility shim that imports `./run/index.js`.
11. Add one focused GraphQL smoke or schema test if the current suite still does not prove full run mutation registration after the split.
12. Run the required verification suite.
13. Prepare the canonical diff artifact and run the mandatory diff review before merge.

## Constraints

- No mutation name, arg, or payload changes
- No service extraction from `cloud/apps/api/src/services/run/`
- No queue behavior changes
- No assumptions or order-effect work
- No frontend work
- No broad terminology rename pass
- No broad barrel used as the normal runtime import surface

## Verification Suite

Required verification for the implementation PR:

```bash
cd /private/tmp/valuerank-run-mutation-split
rg -n "import './run\\.js'|startRun|pauseRun|resumeRun|cancelRun|recoverRun|triggerRecovery|deleteRun|updateRun|updateTranscriptDecision|cancelSummarization|restartSummarization" cloud/apps/api/src/graphql
```

```bash
cd /private/tmp/valuerank-run-mutation-split/cloud
npm test --workspace=@valuerank/api -- --run tests/graphql/mutations/run.test.ts
npm test --workspace=@valuerank/api -- --run tests/graphql/mutations/run-control.test.ts
npm test --workspace=@valuerank/api -- --run tests/graphql/mutations/cancel-summarization.test.ts
npm test --workspace=@valuerank/api -- --run tests/graphql/types/audit-fields.test.ts
npm run typecheck --workspace=@valuerank/api
```

If the new focused run mutation smoke test is added, run it in the same verification batch.

## Review Reconciliation

- review: reviews/spec.codex.architecture.review.md | status: accepted | note: Keep the old run.ts path as the shim and keep run/index.ts as the single side-effect entrypoint.
- review: reviews/spec.gemini.requirements.review.md | status: accepted | note: The spec already keeps the scope narrow, preserves the old entry path, and calls out the main registration risk clearly.
- review: reviews/plan.codex.architecture.review.md | status: accepted | note: Keep the split centered on one mutation surface and keep payloads.ts focused on GraphQL-facing shapes only.
- review: reviews/plan.gemini.testability.review.md | status: accepted | note: Add a focused run mutation smoke or schema test because recoverRun, triggerRecovery, and updateRun lack direct GraphQL coverage today.
- review: reviews/diff.codex.correctness.review.md | status: accepted | note: The canonical diff preserves the full mutation surface behind the existing run.ts shim, and the new registration smoke test plus focused run mutation tests passed locally.
- review: reviews/diff.gemini.regression.review.md | status: accepted | note: The split keeps run.ts as the compatibility shim, and the local GraphQL smoke test plus focused run mutation suites passed after the move.
- review: reviews/diff.gemini.quality.review.md | status: accepted | note: The refactor improves modularity without changing the mutation surface, and the moved files stayed within the planned single-entrypoint structure.

## Ready-To-Implement Gate

Implementation should start only after:

1. The spec dual review is saved under `reviews/` and reconciled here.
2. The plan dual review is saved under `reviews/` and reconciled here.

## Notes

- This workflow is intentionally backend-only so it can run in parallel with frontend compaction work.
- A later workflow can take on a larger run-system cleanup after this narrower GraphQL split settles.

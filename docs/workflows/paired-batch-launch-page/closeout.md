# Closeout: paired-batch-launch-page

## Summary

This feature moved the paired-batch launch flow off the definition-detail popup and onto a dedicated route-driven page.

What shipped:

1. `DefinitionDetail` now sends `job-choice` vignettes to `/definitions/:id/start-paired-batch`.
2. `StartPairedBatchPage` owns the page chrome, copy, loading/error states, and submit/navigation handling.
3. `RunForm` accepts a `copyMode` so paired-batch copy can say `Batch Size` and `Batches per vignette` without changing the trial flow.
4. Standard vignette launches still use the existing modal path, so the trial flow is preserved.
5. The paired-batch launch path now inherits the `PRODUCTION` category behavior and the existing backfill keeps prior paired-batch runs visible as production.

## Verification

Completed checks:

- `npm test --workspace=@valuerank/web -- --run tests/pages/DefinitionDetail.test.tsx tests/pages/StartPairedBatchPage.test.tsx tests/components/runs/RunForm.test.tsx`
- `npm run typecheck --workspace=@valuerank/web`
- `npm test --workspace=@valuerank/api -- --run tests/graphql/mutations/run.test.ts`

Earlier verification from this branch also passed:

- web lint
- API run mutation test
- the paired-batch backfill path for existing runs

## Review Reconciliation

Diff-stage review findings were reconciled as follows:

- The route wiring concern was rejected because the route is registered in `cloud/apps/web/src/App.tsx`.
- The concern about breaking standard launches was rejected after restoring the trial modal path.
- The loading/error-copy and prop/layout concerns were treated as design tradeoffs for this slice rather than correctness bugs.

## Residual Risks

1. The paired-batch and trial flows now diverge by methodology family, so future workflows may need a more explicit routing abstraction.
2. The `copyMode` prop is intentionally narrow; if the paired-batch form ever needs different controls instead of just different wording/layout, this shared form will need another pass.

# Paired Batch Launch Page Plan

## Scope

Implement the dedicated paired-batch launch page described in [spec.md](/Users/chrislaw/valuerank/docs/workflows/paired-batch-launch-page/spec.md) without changing the launch payload shape or the server-side category fix.

## Architecture

Keep the current run form logic in place and wrap it with a new route-driven page:

- `DefinitionDetail` becomes the entry point that navigates to the new launch route
- `StartPairedBatchPage` owns the page chrome, data fetching, submission, and error handling
- `RunForm` stays the shared form shell so the launch behavior stays stable
- the server-side `PRODUCTION` default for paired batches remains the source of truth for classification
- the new page should explicitly handle invalid definition IDs and mutation failures so the route behaves well on direct navigation and retry

To avoid regressing other launch surfaces, keep any wording changes that apply only to the paired-batch flow in the new page wrapper or props passed into the shared form. Do not change the regular trial launch consumer path unless a shared label absolutely must move.
The paired-batch page should be the only place that says `Batch Size` so the regular `RunForm` consumer path does not pick up the new terminology by accident.

This keeps the feature readable without duplicating the run-start logic in the new page.

## Proposed Route

Add a dedicated route under the protected vignette routes, such as:

- `/definitions/:id/start-paired-batch`

That route should be reachable from the vignette detail page and should return the user to the vignette detail page on cancel.
If the `:id` does not resolve to a definition or cannot be loaded, the page should render the existing `ErrorMessage`-style failure state with a clear way back rather than mounting an empty form.
On successful launch, the page should navigate to the new run detail page. On mutation failure, it should keep the user on the launch page, preserve the current form values, and surface the error so the user can retry.

## Implementation Steps

1. Add the new page component for paired-batch launches.
2. Wire the definition detail start action to navigate to the new route instead of opening a modal.
3. Remove the modal entry point from the definition detail flow.
4. Update the page copy and form labels to match the glossary terms.
5. Adjust the batch size and batches-per-vignette layout so those controls sit side by side on wider screens.
6. Add a focused page test for the route handoff, invalid-route handling, copy, submission retry behavior, and the desktop layout wrapper that places the batch controls side by side.
7. Run the targeted web test suite and the run mutation test that protects the `PRODUCTION` category behavior.
8. Remove the old modal entry point from the active flow, and delete the dead modal file if it is no longer referenced.

## File-Level Decisions

- The new page should live beside the other definition-detail page files.
- The shared run form components should stay in `cloud/apps/web/src/components/runs/`.
- `DefinitionHeader` can keep its current API if it only needs to navigate to a new route.
- `RunFormModal.tsx` should be removed from the active definition-detail flow once the new page is in place.
- Add a new focused page test file rather than trying to cover every route edge case only through the existing definition-detail test.

## Verification

Targeted verification after implementation:

```bash
cd /Users/chrislaw/valuerank/cloud
npm test --workspace=@valuerank/web -- --run tests/pages/StartPairedBatchPage.test.tsx
npm test --workspace=@valuerank/web -- --run tests/pages/DefinitionDetail.test.tsx
npm test --workspace=@valuerank/web -- --run tests/components/runs/RunForm.test.tsx
npm test --workspace=@valuerank/web -- --run tests/components/runs/RerunDialog.test.tsx
npm test --workspace=@valuerank/api -- --run tests/graphql/mutations/run.test.ts
npm run lint --workspace=@valuerank/web
npm run typecheck --workspace=@valuerank/web
```

If the page extraction adds a focused page test, it should assert the new route and copy directly rather than relying on snapshots.

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: The tasks now spell out the direct-route flow, invalid-route and eligibility handling, dead modal cleanup, and the exact verification commands that were run.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: The tasks now spell out the direct-route flow, invalid-route and eligibility handling, dead modal cleanup, and the exact verification commands that were run.
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: The tasks now spell out the direct-route flow, invalid-route and eligibility handling, dead modal cleanup, and the exact verification commands that were run.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: The tasks now spell out the direct-route flow, invalid-route and eligibility handling, dead modal cleanup, and the exact verification commands that were run.
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: The tasks now spell out the direct-route flow, invalid-route and eligibility handling, dead modal cleanup, and the exact verification commands that were run.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: The tasks now spell out the direct-route flow, invalid-route and eligibility handling, dead modal cleanup, and the exact verification commands that were run.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: The task list now points to the closeout summary for concrete verification evidence, and the current scope already includes the direct-route, invalid-route, retry, and layout tests that were actually run. The remaining edge-case suggestions are residual risk, not missing execution tasks.
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: The API contract is already exercised through the existing run mutation test and the new paired-batch page keeps the shared mutation path. The delete step is backed by focused tests and a live-reference search, so the ordering concern is a reasonable tradeoff rather than a blocker.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: The task list already includes direct-route, invalid-route, back/cancel, eligibility, retry, and layout checks through the focused page tests, and the additional end-to-end ideas are residual risk rather than missing coverage for this slice.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: Route wiring exists in cloud/apps/web/src/App.tsx, standard trial launches still open the modal, and the remaining comments are either covered by the current data flow or are acceptable design tradeoffs for this slice.
- review: reviews/diff.gemini.regression-adversarial.review.md | status: accepted | note: The route is registered in App.tsx, standard trial launches still open the modal, and the remaining comments are either covered by the current data flow or are acceptable design tradeoffs for this slice.
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: The apparent inconsistency is intentional and now communicated by the button labels: standard vignettes still use the modal Start Trial flow, while job-choice vignettes use the dedicated paired-batch route. The other comments are design tradeoffs or future-scaling concerns rather than correctness bugs for this slice.

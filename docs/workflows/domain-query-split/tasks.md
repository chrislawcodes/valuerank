# Domain Query Split Tasks

## Current Status

Spec, plan, implementation, verification, and diff review are complete.

## Task List

- [x] Choose the next compaction slice after PR #336
- [x] Create the workflow folder and first `spec.md`
- [x] Save spec review records:
  - `reviews/spec.codex.architecture.review.md`
  - `reviews/spec.gemini.requirements.review.md`
- [x] Verify the spec review checkpoint
- [x] Write `plan.md`
- [x] Reconcile spec review findings in `plan.md`
- [x] Update spec review records with final resolution
- [x] Save plan review records:
  - `reviews/plan.codex.architecture.review.md`
  - `reviews/plan.gemini.testability.review.md`
- [x] Verify the plan review checkpoint
- [x] Reconcile plan review findings in `plan.md`
- [x] Update plan review records with final resolution
- [x] Start implementation only after the plan checkpoint is reconciled
- [x] Split `domain.ts` into the planned `domain/` modules
- [x] Preserve the old `queries/domain.ts` path as a compatibility shim
- [x] Add a focused top-level domain GraphQL registration test
- [x] Run the focused verification suite
- [x] Write `reviews/implementation.diff.patch`
- [x] Save diff review records
- [x] Reconcile diff review findings in `plan.md`
- [x] Update diff review records with final resolution

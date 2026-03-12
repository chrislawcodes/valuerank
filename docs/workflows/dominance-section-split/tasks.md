# Dominance Section Split Tasks

## Current Status

Spec, plan, implementation, verification, and diff review are complete. PR, CI, merge, and workflow closeout are still pending.

## Task List

- [x] Re-read the compaction plan and current codebase state
- [x] Compare `DominanceSection.tsx` against `RunForm.tsx`
- [x] Confirm `DominanceSection.tsx` is still the safest frontend-only slice
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
- [x] Split `DominanceSection.tsx` into the planned local modules
- [x] Add the focused web component test
- [x] Run the focused verification suite
- [x] Write `reviews/implementation.diff.patch`
- [x] Save diff review records
- [x] Reconcile diff review findings in `plan.md`
- [x] Update diff review records with final resolution
- [ ] Open PR, wait for CI, fix issues if needed, and merge when green

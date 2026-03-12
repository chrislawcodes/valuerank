# Run Form Split Tasks

## Current Status

Spec, plan, implementation, local verification, and diff review are complete. PR, CI, and merge are still pending.

## Task List

- [x] Re-read the compaction plan and current codebase state
- [x] Confirm `RunForm.tsx` is still the best frontend-only compaction target
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
- [x] Split `RunForm.tsx` into the planned local modules
- [x] Keep the current `RunForm` consumer contract stable
- [x] Run the focused web verification suite
- [x] Write `reviews/implementation.diff.patch`
- [x] Save diff review records
- [x] Reconcile diff review findings in `plan.md`
- [x] Update diff review records with final resolution
- [ ] Open PR, wait for CI, fix issues if needed, and merge when green

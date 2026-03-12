# Run Form Split Plan

## Scope

Implement the structural split described in [spec.md](/Users/chrislaw/valuerank-run-form-split/docs/workflows/run-form-split/spec.md) without changing how the run-start form behaves.

This plan stays narrow on purpose. It covers the `RunForm.tsx` split only.

## Why This Slice

`RunForm.tsx` is the right next frontend-only compaction slice because:

- it is the next targeted Tier 3 component hotspot after the merged dominance-section split
- it is separate from the order-effect area that should wait
- it reduces mental overhead in a high-traffic user flow without touching backend behavior
- it already has a natural split between state logic and large form sections

This slice is riskier than the last frontend split because it has two consumers and more state transitions. That is exactly why it is worth narrowing now, but the implementation must stay structural and keep the public shell stable.

## Current Test Baseline

The current web test baseline is better than a first read suggests:

- [RunForm.test.tsx](/Users/chrislaw/valuerank-run-form-split/cloud/apps/web/tests/components/runs/RunForm.test.tsx) already covers model selection, trial size, submit payload shape, validation, and trial-specific condition mode
- [RerunDialog.test.tsx](/Users/chrislaw/valuerank-run-form-split/cloud/apps/web/tests/components/runs/RerunDialog.test.tsx) gives a second consumer path

That means the plan should keep the current tests green and add only one focused test if the split introduces a gap around the new boundaries.

## Implementation Steps

1. Confirm the live consumer surface stays narrow:
   - [RerunDialog.tsx](/Users/chrislaw/valuerank-run-form-split/cloud/apps/web/src/components/runs/RerunDialog.tsx)
   - [RunFormModal.tsx](/Users/chrislaw/valuerank-run-form-split/cloud/apps/web/src/pages/DefinitionDetail/RunFormModal.tsx)
2. Create a focused local split under `cloud/apps/web/src/components/runs/`.
3. Extract form state and derived submit logic into `useRunForm.ts` if that keeps the shell clearly smaller without hiding rendering concerns.
4. Extract the trial-size, specific-condition, and final-trial display block into `DefinitionPicker.tsx`.
5. Extract the temperature and trials-per-narrative controls into `RunConfigPanel.tsx`.
6. Keep [RunForm.tsx](/Users/chrislaw/valuerank-run-form-split/cloud/apps/web/src/components/runs/RunForm.tsx) as the public shell for:
   - hook wiring
   - top-level layout
   - `ModelSelector`
   - `CostBreakdown`
   - actions
   - condition modal placement if that remains the clearest option
7. Run the existing `RunForm` and `RerunDialog` tests and add one focused test only if the split leaves a new boundary weakly covered.
8. Run the required web verification suite.
9. Prepare the canonical diff artifact and run the mandatory diff review before merge.

## Constraints

- No backend work
- No order-effect or order-invariance work
- No visual redesign
- No broad renames
- No prop contract changes for `RunForm`
- No churn in `RerunDialog.tsx` or `RunFormModal.tsx` beyond tiny import-safe adjustments if truly needed

## Verification Suite

Required verification for the later implementation PR:

```bash
cd /Users/chrislaw/valuerank-run-form-split
rg -n "RunForm" cloud/apps/web/src
```

```bash
cd /Users/chrislaw/valuerank-run-form-split/cloud
npm test --workspace=@valuerank/web -- --run tests/components/runs/RunForm.test.tsx
npm test --workspace=@valuerank/web -- --run tests/components/runs/RerunDialog.test.tsx
npm run lint --workspace=@valuerank/web
npm run typecheck --workspace=@valuerank/web
```

If the split needs one new targeted test, prefer a real interaction path over snapshots.

## Review Reconciliation

- review: reviews/spec.codex.architecture.review.md | status: accepted | note: Keep RunForm as the public shell and keep new files local to the run form surface.
- review: reviews/spec.gemini.requirements.review.md | status: accepted | note: Use the existing RunForm and RerunDialog tests as the baseline and add only a targeted test if a boundary gap remains.
- review: reviews/plan.codex.architecture.review.md | status: accepted | note: Keep RunForm as the integration shell, keep new boundaries narrow, and add only a targeted test if the split exposes a coverage gap.
- review: reviews/plan.gemini.testability.review.md | status: accepted | note: Keep RunForm as the integration shell, keep new boundaries narrow, and add only a targeted test if the split exposes a coverage gap.
- review: reviews/diff.codex.correctness.review.md | status: accepted | note: Verified the extracted hook keeps the prior form logic and payload shape, and the focused RunForm plus RerunDialog tests stayed green.
- review: reviews/diff.gemini.regression.review.md | status: accepted | note: Verified the extracted hook keeps the prior form logic and payload shape, and the focused RunForm plus RerunDialog tests stayed green.
- review: reviews/diff.gemini.quality.review.md | status: accepted | note: Verified the extracted hook keeps the prior form logic and payload shape, and the focused RunForm plus RerunDialog tests stayed green.

## Ready-To-Implement Gate

Implementation should start only after:

1. The spec dual review is saved under `reviews/` and reconciled here.
2. The plan dual review is saved under `reviews/` and reconciled here.

## Notes

- The default review-lens pair is a good fit here. No override is needed.
- The goal is not to make every form block reusable. The goal is to make the current form easier to own.

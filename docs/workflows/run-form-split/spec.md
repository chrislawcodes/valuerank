# Run Form Split Spec

## Goal

Break up [RunForm.tsx](/Users/chrislaw/valuerank-run-form-split/cloud/apps/web/src/components/runs/RunForm.tsx) into smaller frontend-only pieces without changing behavior, visuals, or its public API.

This is a structural compaction slice. The `RunForm` export, props, copy, validation rules, modal flow, and submit payload must keep working the same way.

## Why This Should Be Next

`RunForm.tsx` is still the best frontend-only compaction target after the merged dominance-section split.

Why it is the right next slice:

- it is the largest remaining targeted frontend component hotspot in the compaction plan
- it sits on one UI surface even though it has two consumers
- it has clear internal seams between form state, run-size controls, condition selection, and final-trial messaging
- splitting it reduces mental overhead in a busy user flow without touching backend code

Why this should happen now:

- the earlier backend structural compaction PRs are already merged
- the order-effect area should wait, so this keeps compaction moving on a separate frontend surface
- the file is still about 686 lines and mixes too many jobs in one component

## Assumptions

- This PR is structural only. It does not change run-start behavior.
- The safest first pass keeps [RunForm.tsx](/Users/chrislaw/valuerank-run-form-split/cloud/apps/web/src/components/runs/RunForm.tsx) as the public entrypoint.
- Existing consumers in [RerunDialog.tsx](/Users/chrislaw/valuerank-run-form-split/cloud/apps/web/src/components/runs/RerunDialog.tsx) and [RunFormModal.tsx](/Users/chrislaw/valuerank-run-form-split/cloud/apps/web/src/pages/DefinitionDetail/RunFormModal.tsx) should not need behavior changes.
- `ModelSelector.tsx` stays in place and is not part of this split because it was already extracted.
- A focused component test should be added because current direct coverage for this component shape is weak.

## In Scope

- [RunForm.tsx](/Users/chrislaw/valuerank-run-form-split/cloud/apps/web/src/components/runs/RunForm.tsx)
- new local files under `cloud/apps/web/src/components/runs/`
- one focused web test for the split
- keeping current imports from `RerunDialog` and `RunFormModal` stable

## Out Of Scope

- backend run mutation or service work
- order-effect or order-invariance work
- visual redesign
- changing validation rules
- changing submit payload shape
- broad renames
- moving `ModelSelector.tsx` again

## Current File Shape

`RunForm.tsx` currently mixes these jobs:

1. local form state and validation
2. default-model syncing
3. cost estimate shaping
4. final-trial plan display
5. trial-specific condition modal state
6. large render blocks for run-size controls, config, and modal UI

That makes the file harder to review and harder to update safely.

## Proposed File Layout

Create a small local split that keeps [RunForm.tsx](/Users/chrislaw/valuerank-run-form-split/cloud/apps/web/src/components/runs/RunForm.tsx) as the public shell:

```text
cloud/apps/web/src/components/runs/
├── RunForm.tsx
├── DefinitionPicker.tsx
├── RunConfigPanel.tsx
└── useRunForm.ts
```

Keep the shell responsible for:

- top-level hook wiring
- submit callback handoff
- high-level section layout
- action buttons
- opening and closing the condition modal

Move only the heavier internal work:

- `useRunForm.ts`: form state, default syncing, validation, derived counts, and submit-input building
- `DefinitionPicker.tsx`: the trial-size section, specific-condition summary, and final-trial information block
- `RunConfigPanel.tsx`: temperature input and trials-per-narrative controls

If implementation shows the condition modal should stay in the shell for clarity, that is allowed. The goal is better boundaries, not forcing every block into its own file.

## Compatibility Rules

- Keep the public import path at [RunForm.tsx](/Users/chrislaw/valuerank-run-form-split/cloud/apps/web/src/components/runs/RunForm.tsx).
- Keep the `RunForm` export name and prop shape unchanged.
- Keep the current submit payload shape built from `StartRunInput`.
- Keep `ModelSelector` and `CostBreakdown` usage in the same user-facing flow.
- Keep current consumer imports in `RerunDialog.tsx` and `RunFormModal.tsx` working without rewiring behavior.

## Behavior That Must Not Change

- default model selection sync
- model selection validation
- sample-percentage choices
- final-trial behavior
- trial-specific condition selection flow
- temperature validation
- samples-per-scenario behavior
- cost summary behavior
- submit button disabled state
- submit payload contents

## Edge Cases To Keep Safe

- empty model selection
- invalid temperature input
- final-trial mode hiding normal sample settings
- trial-specific condition mode with no selected condition
- condition grid loading and error states
- default models refreshing from cached then network data
- `initialTemperature` prop updates after mount
- rerun and normal run consumers both keeping current behavior

## Risks

### Risk 1: Behavior drift in form state extraction

If `useRunForm.ts` takes too much ownership or changes the timing of state updates, the split could quietly change submit behavior or validation messages.

### Risk 2: Over-splitting the UI

If every small block becomes its own file, the form may get harder to follow instead of easier.

### Risk 3: Weak proof of no-change

This component has many state combinations. A focused test helps, but it must cover a meaningful user path instead of only static text.

## Acceptance Criteria

1. [RunForm.tsx](/Users/chrislaw/valuerank-run-form-split/cloud/apps/web/src/components/runs/RunForm.tsx) becomes a smaller composition shell.
2. The public `RunForm` export path and prop shape stay unchanged.
3. Form state and derived run-input logic move into one focused local hook if that clearly improves readability.
4. The trial-size and condition-selection section moves into a dedicated local component.
5. The temperature and trials-per-narrative controls move into a dedicated local component.
6. No visual or behavior changes are introduced on purpose.
7. Existing consumers still render the form without behavior changes.
8. The PR adds one focused web test that covers a real interaction path through the split form.

## Verification

Minimum verification for implementation later:

```bash
cd /Users/chrislaw/valuerank-run-form-split
rg -n "RunForm" cloud/apps/web/src
```

```bash
cd /Users/chrislaw/valuerank-run-form-split/cloud
npm test --workspace=@valuerank/web -- --run tests/components/RunForm.test.tsx
npm run lint --workspace=@valuerank/web
npm run typecheck --workspace=@valuerank/web
```

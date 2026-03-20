# Paired Batch Launch Page Spec

## Goal

Replace the paired-batch launch popup on the definition detail page with a dedicated route-driven page, and update the page copy to match the glossary terms more closely.

The launch flow must still create paired batches through the existing run mutation path, and paired-batch launches must continue to land in `PRODUCTION` instead of `UNKNOWN_LEGACY`.

## User Story

As a user starting a paired batch from a vignette page, I want to land on a full page that clearly says I am starting a paired batch, uses glossary-aligned language, and gives me enough space to configure the launch without a modal overlay.

## Assumptions

- The popup the user is referring to is the paired-batch launcher on `DefinitionDetail`, not the separate domain-trials confirmation modal.
- `Trial Size` is the current label for the control that sets `samplePercentage`; the new page should relabel that control as `Batch Size` without changing its underlying behavior.
- The existing server-side paired-batch category fix stays in place and is treated as the source of truth for `PRODUCTION` classification.
- The page route should use the definition ID in the URL, and invalid or missing definitions should render a friendly not-found/error state instead of crashing.

## In Scope

- replace the paired-batch modal with a dedicated page and route
- update the launch entry point on the vignette detail page to navigate to that page
- update page copy to use glossary-aligned terminology
- make the batch size and batches-per-vignette controls feel tighter on the new page, including placing those controls next to each other on wider screens
- keep paired-batch launches correctly categorized as `PRODUCTION`
- add or update targeted web tests for the new page and launch handoff
- preserve the regular trial launch flow and the existing `RunForm` behavior used by other consumers

## Out Of Scope

- changing the semantics of batch size, vignette sampling, or paired-batch submission
- redesigning the underlying `RunForm` business logic
- changing the run-category fallback logic again
- touching the domain-trials launch modal
- database migration work for this feature

## Glossary Copy Targets

The new page should prefer:

- `Start Paired Batch` instead of `Start Evaluation`
- `Configure and start a paired batch for "<vignette name>"` instead of `evaluation trial`
- `Batch Size` instead of `Trial Size`
- `Batches per vignette` instead of `Trials per Vignette`

The implementation should keep the existing glossary terms already used elsewhere, such as `vignette` and `paired batch`.
The new page should not change the payload semantics for `samplePercentage`; `Batch Size` is launch-page copy for the current sampling control.

## Acceptance Criteria

1. Clicking the paired-batch launch action on a vignette detail page opens a dedicated page instead of a modal overlay.
2. The new page uses glossary-aligned copy for the title, subtitle, batch size label, and batches-per-vignette label.
3. The batch size control and batches-per-vignette control are visually adjacent on wider screens, while still stacking cleanly on narrow screens.
4. The new route handles direct navigation with a valid definition, invalid definition IDs, cancel/back navigation, and mutation failure without losing the user's form inputs.
5. Paired batches started from the new page still use the existing mutation path and are classified as `PRODUCTION`.
6. The implementation does not regress the regular trial launch flow or the `RunForm` consumers that are not part of the paired-batch page.
7. Targeted tests cover the route handoff, the new copy, invalid-route handling, and successful submission.

## Risks

- It is easy to change only the launch chrome and accidentally leave the old modal as the active entry point.
- The copy change can become confusing if the labels are updated without keeping the underlying form behavior stable.
- Layout changes should stay modest so the launch form remains usable on small screens.
- Because `Batch Size` is copy layered over a percentage-backed control, the page should include enough context for users to understand the setting they are changing.

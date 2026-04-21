# Spec

## Goal
Make the `Models / Circumplex` page easier to scan by tightening the header controls, replacing the methodology open/closed affordance with a dropdown + tooltips, and stacking selected model cards at the standard page width.

## Discovery
- The request is clear enough to proceed without extra questions.
- Assumptions carried in:
  - The target surface is `origin/main`'s `/models/circumplex` route, not the matrix or consistency pages.
  - The change is presentation-only. We keep the current circumplex query, thresholds, and verdict logic unless a tiny UI-only type helper is needed.
  - "Models should have a details line" means the bulky picker becomes a compact expandable selection row instead of a standalone large section.

## Scope
- `cloud/apps/web/src/pages/ModelsCircumplex.tsx`
- `cloud/apps/web/src/components/models/CircumplexMethodologyPanel.tsx`
- `cloud/apps/web/src/components/models/CircumplexModelPicker.tsx`
- `cloud/apps/web/src/components/models/CircumplexModelCard.tsx`
- `cloud/apps/web/tests/components/models/*` as needed for the new layout/controls

## Behavior
- The top controls for `Signature`, `Minimum trials per value`, and `How this is computed` must live in one shared header box.
- The methodology control must use a dropdown instead of the current `details` open/closed treatment.
- The methodology control must provide tooltip copy that explains both `Open` and `Closed` states in plain language.
- The old standalone methodology panel card must be removed from the top row.
- Model selection must move into a compact expandable line so the picker does not dominate the page before a user chooses models.
- The model selection control must still support multi-select, `Select all`, and `Clear`.
- Eligible/insufficient model messaging must stay available, but hidden models should not crowd the default page state.
- Selected circumplex model cards must render one per row at the normal page content width.
- Additional selected models must stack underneath the previous card instead of forming a two-column grid.
- Existing circumplex result content inside each card stays functionally the same unless a small spacing/layout adjustment is required by the new full-width card format.

## Acceptance Criteria
- The page renders one unified header control box instead of separate control and methodology boxes.
- The methodology state is controlled by a dropdown and includes tooltip help for both choices.
- The model picker appears as a compact expandable row and still supports multi-select actions.
- Two or more selected models render as full-width cards stacked vertically.
- Existing circumplex data loading, eligibility filtering, and verdict content still work.

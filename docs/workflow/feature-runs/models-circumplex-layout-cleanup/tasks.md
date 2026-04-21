# Tasks

1. [CHECKPOINT] Merge the top controls into one Circumplex header box.
   - Update `cloud/apps/web/src/pages/ModelsCircumplex.tsx` so `Signature`, `Minimum trials per value`, and `How this is computed` render in one shared header section.
   - Remove the old side-by-side top grid with a separate methodology panel card.
   - Keep the current URL-backed state wiring for signature, threshold, and methodology.
   - Estimated diff: ~120 lines.

2. [CHECKPOINT] Replace the bulky methodology/picker UI with compact controls.
   - Rework `cloud/apps/web/src/components/models/CircumplexMethodologyPanel.tsx` into a compact control surface that uses a dropdown and tooltip help for both `Open` and `Closed`.
   - Rework `cloud/apps/web/src/components/models/CircumplexModelPicker.tsx` into an expandable compact selector row with the existing multi-select actions.
   - Keep insufficient-model context available without overwhelming the default state.
   - Estimated diff: ~180 lines.

3. [CHECKPOINT] Stack selected circumplex cards full-width and verify behavior.
   - Update `cloud/apps/web/src/pages/ModelsCircumplex.tsx` and `cloud/apps/web/src/components/models/CircumplexModelCard.tsx` so selected cards render one per row.
   - Add focused tests under `cloud/apps/web/tests/components/models/` for the merged header controls, compact picker behavior, and stacked card layout.
   - Run targeted web tests plus a web build/type-safe verification for the touched files.
   - Estimated diff: ~180 lines.

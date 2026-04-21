# Plan

## Approach
1. Collapse the current top-row layout in `ModelsCircumplex.tsx` into one standard-width control card that holds signature, threshold, and methodology controls together.
2. Replace `CircumplexMethodologyPanel`'s `details`-style open/closed affordance with a small dropdown-oriented control plus tooltip content that explains what each state does.
3. Rework `CircumplexModelPicker` into a compact expandable selector row so model selection is available but less visually heavy.
4. Change the selected-card container from a two-column grid to a single-column stack and adjust the card internals only as needed for the new width.
5. Add focused UI tests for the merged header controls, compact picker behavior, and stacked selected-card layout.

## Design Notes
- Keep the page at the standard layout width; do not widen the route.
- Reuse existing `Select`, `Tooltip`, and button primitives instead of inventing new control patterns.
- Because the custom `Select` component cannot attach tooltips to individual list items, the tooltip content should explain both dropdown states next to the control.
- Preserve URL-driven state for `signature`, `n`, `methodology`, and `models`.
- Preserve the current insufficient-model filtering rules and notice behavior.

## Risk Controls
- Keep the methodology dropdown values aligned with the existing URL contract: `open` and `closed`.
- Do not change circumplex query variables or eligibility classification logic.
- Keep picker actions deterministic by preserving the existing model ordering/normalization helper behavior.
- Add tests around the compact picker and stacked cards so layout cleanup does not break selection behavior.

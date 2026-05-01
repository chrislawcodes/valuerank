# Spec: Pressure Directional Breakdown

## Summary

Add a new cross-model table to the Pressure Sensitivity page that answers the question: **does pressure work both ways equally for each model?**

The current `pressureResponse` metric (`pushTowardFirstRate − pushTowardSecondRate`) collapses two effects into one number. Two models can show the same `pressureResponse` value but through very different mechanisms — one might respond symmetrically from a position of strong preference, the other might only respond to pressure in one direction. The new table surfaces both effects separately so the user can tell them apart.

---

## Background

For each value pair and model, we already store three win rates:
- `baselineRate`: how often the model picks the first value when both sides have equal pressure
- `pushTowardFirstRate`: win rate when first value's pressure is high (≥4) and other is calm (≤3)
- `pushTowardSecondRate`: win rate when other value's pressure is high (≥4) and first is calm (≤3)

The **pushed-for effect** for a pair is `pushTowardFirstRate − baselineRate`: how much does the model move toward a value when that value is being actively championed?

The **pushed-against effect** for a pair is `baselineRate − pushTowardSecondRate`: how much does the model move away from a value when the other value is being championed?

If both effects are approximately equal, pressure works symmetrically. If one is much larger, the model has a directional bias — it responds more to one type of pressure than the other.

---

## Scope

### In scope

- New file: `cloud/apps/web/src/components/models/PressureDirectionalBreakdown.tsx`
- New file: `cloud/apps/web/src/components/models/PressureDirectionalBreakdown.test.tsx`
- Edit: `cloud/apps/web/src/pages/PressureSensitivity.tsx` — import and render `PressureDirectionalBreakdown` as the first section in the non-empty, non-allInsufficient block

### Out of scope

- No API changes, no GraphQL schema changes, no database changes
- No new GraphQL queries or query variables
- No changes to `pressureSensitivityFormatting.ts` (reuse `formatSignedPoints`)
- No changes to any other component

---

## FR-001: Component API

```typescript
type Props = {
  models: PressureSensitivityModel[];
};

export function PressureDirectionalBreakdown({ models }: Props): JSX.Element | null
```

`PressureSensitivityModel` is imported from `../../api/operations/pressureSensitivity`.

Returns `null` when `models` is empty, or when no models have any valid pairs (pairsUsed = 0 for all models).

---

## FR-002: Per-model row computation

For each model, compute a `ModelRow`:

```
validPairs = model.valuePairs where all three rate fields are strictly finite numbers:
  typeof pressureResponse.baselineRate === 'number' AND Number.isFinite(baselineRate)
  typeof pressureResponse.pushTowardFirstRate === 'number' AND Number.isFinite(pushTowardFirstRate)
  typeof pressureResponse.pushTowardSecondRate === 'number' AND Number.isFinite(pushTowardSecondRate)

  AND pressureResponse itself is not null/undefined (the GraphQL schema declares this
  non-nullable, but a defensive check is cheap).

(Note: pressureResponse.value is NOT part of this filter. The != null check for
pressureResponse itself covers both null and undefined per JS loose equality.)

pairsUsed           = count of validPairs

(Check pairsUsed first. If pairsUsed === 0 skip all mean calculations for this model — no division by zero.)

pushedForEffect     = mean over validPairs of (pushTowardFirstRate − baselineRate)
pushedAgainstEffect = mean over validPairs of (baselineRate − pushTowardSecondRate)
gap                 = pushedForEffect − pushedAgainstEffect
```

If `pairsUsed === 0`, the model produces no row in the table (excluded from render, not shown as a dash row).

---

## FR-003: Table columns

| Column | Header | Content |
|--------|--------|---------|
| 1 | Model | `model.label` |
| 2 | Pushed for | `pushedForEffect` formatted as signed pp |
| 3 | Pushed against | `pushedAgainstEffect` formatted as signed pp |
| 4 | Gap | `gap` formatted as signed pp |
| 5 | Pairs | `pairsUsed` as a plain integer |

All pp cells use `formatSignedPoints(value)` from `pressureSensitivityFormatting.ts`. The Pairs column uses `font-mono text-gray-700`.

Color coding for the three pp columns:
- value < 0 → `text-red-700`; value ≥ 0 → `text-gray-900`; all use `font-mono`

---

## FR-004: Sort order

Rows are sorted by `|gap|` descending (largest asymmetry first). Primary tie-break: `a.label.localeCompare(b.label, 'en', { sensitivity: 'base' })`. Secondary tie-break (when localeCompare returns 0): `a.modelId.localeCompare(b.modelId)` for full determinism.

---

## FR-005: Column tooltips

Use `HeaderTooltip` (from `../ui/HeaderTooltip`) on the four data column headers. The Model column header is a plain text label — no tooltip needed.

| Column | Tooltip text |
|--------|-------------|
| Pushed for | "Average win-rate lift above baseline when a value's pressure is high and the other's is calm, across all measured pairs for this model. Positive means the model moves toward the value being pressed." |
| Pushed against | "How much the model moves away from a value when the competing value is championed, averaged across all measured pairs for this model. A large positive value means the model follows opposing pressure — it yields. Near zero means it holds its position." |
| Gap | "Pushed-for effect minus pushed-against effect. Near zero means pressure works equally in both directions. A large positive gap means the model responds more when a value is directly championed than when it is opposed." |
| Pairs | "Number of value pairs that had sufficient data to compute both directional effects for this model." |

---

## FR-006: Section header and description

```
<h2>Does pressure work both ways?</h2>
<p>
  For each model, this table compares how much the model moves when a value is actively
  pressed versus when it is opposed. Equal effects mean pressure works symmetrically.
  A large gap means the model responds more to one direction than the other.
</p>
```

No `CopyVisualButton` on this section (it is a derived summary, not a raw data table).

---

## FR-007: Page integration

In `cloud/apps/web/src/pages/PressureSensitivity.tsx`, inside the non-empty, non-allInsufficient `<>` block, render `<PressureDirectionalBreakdown models={models} />` as the **first** child, before `<PressureSensitivitySummary>`.

---

## FR-008: Tests

`PressureDirectionalBreakdown.test.tsx` must cover:

1. **Renders heading and all column headers** — confirm "Does pressure work both ways?", "Pushed for", "Pushed against", "Gap" appear
2. **Correct pushedFor/pushedAgainst/gap values** — given a model with two valid pairs, verify computed pp values render correctly
3. **Sort by |gap| descending** — given two models with different |gap|, confirm higher-|gap| model appears first
4. **Ties broken alphabetically** — given two models with equal |gap|, confirm alphabetical order
5. **Excludes models with zero valid pairs** — model with no valid pressureResponse renders no row
6. **Returns null when all models have zero valid pairs** — component returns null (no section rendered)
7. **Returns null for empty models array** — `<PressureDirectionalBreakdown models={[]} />` renders nothing
8. **Red color on negative pushedFor** — verify `text-red-700` class on negative effect cell
9. **Gray color on positive pushedFor** — verify `text-gray-900` class on positive effect cell (prevents regression where all cells turn red)
10. **Red color on negative gap** — verify `text-red-700` on negative gap cell
11. **Sort uses absolute value** — a row with gap = −10pp ranks above a row with gap = +5pp
12. **All four tooltip texts present** — verify tooltip text content for Pushed for, Pushed against, Gap, and Pairs columns on focus
13. **Non-finite pairs excluded** — a model with one valid pair and one pair with NaN rate shows pairsUsed = 1 and correct mean from only the valid pair

---

## Acceptance Criteria

- `npm run lint --workspace @valuerank/web` passes
- `npm run test --workspace @valuerank/web` passes (13 new tests all green)
- `npm run build --workspace @valuerank/web` passes
- The component appears at the top of the pressure sensitivity data section (above the cross-model summary table)
- No regressions in existing pressure sensitivity tests

---

## Non-Goals

- No sorting toggle (the sort order is fixed by |gap|)
- No row click handler / selected-row highlight
- No sorting toggle on the Pairs column
- No snapshot/copy button

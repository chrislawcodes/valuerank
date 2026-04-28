# Implementation Plan: Pressure Sensitivity Table Redesign

**Branch:** `claude/sensitivity-table-redesign` | **Date:** 2026-04-28
**Spec:** `docs/workflow/feature-runs/sensitivity-table-redesign/spec.md`

## Summary

Two table redesigns + supporting backend math:

- **Cross-Model Sensitivity** (`PressureSensitivitySummary.tsx`): replaced with a 4-column table under a "Win Rate" group header (Model, Low pressure, High pressure, Win rate Δ ± CI).
- **Per-Pair Sensitivity** (`PressureSensitivityDetail.tsx`): replaced with a 5-column table under a "Win Rate" group header (Pair, Low pressure, High pressure, Win rate Δ ± CI, Trials).
- **Backend** (`pressure-sensitivity.ts` resolver, `aggregation.ts` math): adds Wilson-propagated CI for per-pair Δ, t-based CI for cross-model summary mean Δ, and a new `directionDeltaSummary` field per model.
- **Tooltips** on every column header via a small reusable `<HeaderTooltip>` component.

Conviction columns disappear entirely from the headline view. Backend still computes conviction (free side-effect) — frontend just stops reading the fields.

## Review Reconciliation

This is a follow-up to PR #770. Discovery and design were settled in conversation post-deploy after methodology critique. No new spec/plan adversarial reviews planned for this iteration — spec was reviewed live with the user; plan and tasks land directly on the implementation flow with a Gemini-only diff review at the end (matches the "Claude implements, Gemini reviews" pattern adopted during the v1 ship).

## Technical Context

| Aspect | Detail |
|---|---|
| Language | TypeScript (strict, no `any`) |
| API framework | Pothos (code-first GraphQL) |
| API schema exposure | `cloud/apps/web/schema.graphql` — manually maintained SDL snapshot |
| Web framework | React + urql + Vite |
| Codegen | `npm run codegen --workspace @valuerank/web` |
| Testing | Vitest (API and web) |
| File size limit | 400 lines max per file |
| New DB tables | None |
| Performance target | Same envelope as v1: < 2 s render on full roster after data is in cache |

---

## Architecture Decisions

### Decision 1: Per-pair Win rate Δ CI uses Newcombe's diff-of-proportions formula

**Chosen:** For each per-pair Δ, compute the 95% CI as the Newcombe Method-10 interval on `p_high − p_low`, where:
- `p_low` = mean win rate across qualifying low-band cells (own ≤ 2, n ≥ 3)
- `p_high` = mean win rate across qualifying high-band cells
- `n_low`, `n_high` = total trials behind the band means

**Implementation pseudocode:**

```typescript
function diffProportionCI(
  pLow: number, nLow: number,
  pHigh: number, nHigh: number,
  z = 1.96
): { ciLow: number; ciHigh: number } | null {
  if (nLow === 0 || nHigh === 0) return null;
  const lowWilson = wilsonInterval(pLow, nLow, z);
  const highWilson = wilsonInterval(pHigh, nHigh, z);
  const delta = pHigh - pLow;
  const lowerHalf = Math.sqrt(
    (pLow - lowWilson.low) ** 2 + (highWilson.high - pHigh) ** 2
  );
  const upperHalf = Math.sqrt(
    (lowWilson.high - pLow) ** 2 + (pHigh - highWilson.low) ** 2
  );
  return { ciLow: delta - lowerHalf, ciHigh: delta + upperHalf };
}
```

**Rationale:**
- Newcombe Method-10 is the recommended interval for `p_high − p_low` when both proportions come from independent samples; it does not assume normality and behaves correctly near 0 and 1 (where naive normal-approx CIs fail).
- Survey-methodology readers will recognize the convention.
- The math is well-documented (Newcombe 1998), making the implementation auditable.

**Alternative considered:** Naive normal-approx (`±1.96 × √(p_low(1−p_low)/n_low + p_high(1−p_high)/n_high)`). Rejected because it gives nonsensical CIs near 0 and 1 (e.g., a CI extending past 100%).

### Decision 2: Cross-model summary CI uses t-based across-pairs interval

**Chosen:** For each model's `directionDeltaSummary`:
- Take per-pair `directionDelta.value` for all measured pairs (defined Δ).
- Compute sample mean, sample sd, and t-based CI: `mean ± t(0.025, df = n − 1) × sd / √n`.
- When `n < 2`, CI is undefined; expose `null` for `ciLow`/`ciHigh` and let the frontend render "(thin)".

**Rationale:**
- Treats each pair as one observation. The "uncertainty" question this CI answers is "how varied is the Δ across the model's measured value pairs?" — which matches what the column claims to summarize.
- T-based interval is the standard for small samples; we'll have 4–15 pairs per model in practice, which is squarely in the "use t, not normal-approx" range.

**Alternative considered:** Random-effects meta-analysis (DerSimonian-Laird), which would weight pairs by their inverse variance. Rejected for v1 — it adds machinery that's hard to defend in plain language to non-statisticians, and the simple t-based interval is what the spec promised. Could revisit for v2.

### Decision 3: `<HeaderTooltip>` is a small new component, scoped to this redesign

**Chosen:** Add `cloud/apps/web/src/components/ui/HeaderTooltip.tsx` — a thin wrapper around either an existing tooltip primitive or a fresh implementation using CSS `:hover` + `:focus` + `aria-describedby`. Renders the ⓘ icon and surfaces tooltip text on hover/keyboard focus. Width-bounded to ~280px.

**Rationale:**
- Existing app uses `title` attributes in some places and a custom popover in others; no reusable header-tooltip primitive exists yet. A small focused component keeps this change clean.
- WCAG accessibility: tooltips MUST be keyboard-reachable, so a CSS-only solution must include focus styles.

**Alternative considered:** Reuse the existing popover component for major drilldowns. Rejected — too heavy for a header tooltip, and the popover requires explicit click-to-open, which is wrong for this UX (we want passive hover/focus).

### Decision 4: Conviction stays in the resolver, off the wire

**Chosen:** The resolver keeps computing per-pair conviction (the math is shared with cell-level metrics in `aggregation.ts`). The GraphQL schema also keeps the `convictionDelta` and `netScoreDelta` fields and `aggregateSensitivity` for one release, marked deprecated in code comments. The frontend stops querying for them.

**Rationale:**
- Removing fields immediately is a breaking schema change for any consumer that may have started reading them; even if there are no current consumers, deprecating-then-removing is the standard pattern.
- The conviction math is needed for the 2D pressure grid drilldown anyway, so removing it now would be premature.
- A future "Model Voice" report can re-surface these fields without backend work.

### Decision 5: Color encoding for negative Δ

**Chosen:** Negative Win rate Δ values render with `text-red-700` (Tailwind class). Positive and zero values use the default text color. The CI annotation (`± X pp`) inherits the same color as the value to keep the unit visually attached.

**Rationale:**
- Negative Δ is rare and noteworthy — should stand out without screaming.
- `text-red-700` is the same shade used elsewhere in the app for warning/error states; keeps the design consistent.

### Decision 6: Ceiling/floor badge styling

**Chosen:** Inline `<span>` with `bg-amber-100 text-amber-800` background, content "ceiling" or "floor" — same component pattern as the existing `CeilingFloorBadge` in `PressureSensitivityDetail.tsx`. Move the component to a shared location (`cloud/apps/web/src/components/models/CeilingFloorBadge.tsx`) so both summary and detail can use it.

**Rationale:**
- Existing badge already has the right look; reuse it.
- Both tables now show the badge on the Low pressure cell, so a shared component avoids drift.

### Decision 7: Sort behavior

**Chosen:**
- Cross-model summary default sort: Win rate Δ descending. Click header toggles ascending.
- Per-pair detail default sort: |Win rate Δ| descending (biggest movers, sign-agnostic).
- Both sorts: rows with undefined Δ go to the bottom regardless of direction.

**Rationale:**
- Cross-model: rank by movement, biggest first.
- Per-pair: sign-agnostic because a +30 pp pair and a −30 pp pair are both interesting; |Δ| sort surfaces them together at the top.

---

## Approved tooltip copy

These get embedded in `HeaderTooltip` props. Locked in conversation.

### Group header: Win Rate
> The percentage of trials where the model picked the value. Same formula as the win rate shown elsewhere in ValueRank: `picks / (picks + non-picks + neutrals)`. Higher = the model picks it more often.

### Column: Low pressure win rate
> The model's win rate when pressure on this value is light (levels 1 or 2 out of 5).
>
> **Cross-model:** averaged across this model's measured value pairs.
> **Per-pair:** for this pair specifically.

### Column: High pressure win rate
> The model's win rate when pressure on this value is heavy (levels 4 or 5 out of 5).
>
> Cross-model: averaged across pairs. Per-pair: for this pair specifically.

### Column: Win rate Δ
> How much the win rate changes from light pressure to heavy pressure, in percentage points.
>
> **Light pressure** = own pressure level 1 or 2 on this value. **Heavy pressure** = level 4 or 5. Level 3 is excluded so the Δ reflects the biggest contrast in the data.
>
> Example: +40 pp means the model picks the value 40 percentage points more often at heavy pressure than at light. Negative means the model picks it less under heavy pressure — usually a signal that something is off.
>
> The 95% CI shows how varied this is across the model's measured value pairs (cross-model) or trial-level uncertainty within the pair (per-pair).

### Column: Trials (per-pair only)
> Total scored trials behind this row. We exclude refusals and unparseable responses. Each trial is one model response that landed in some cell of the 5×5 pressure grid for this pair.

---

## Implementation slices

### Slice A — Backend math + resolver + types + SDL [CHECKPOINT]

Estimated diff: ~300 lines (mostly aggregation.ts additions and resolver wiring).

**Files:**
- `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts` — add `wilsonInterval`, `diffProportionCI`, `tBasedMeanCI`, `directionDeltaSummary` helpers as pure functions
- `cloud/apps/api/src/services/pressure-sensitivity/aggregation.test.ts` — textbook-example unit tests for each new function
- `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts` — wire the new CI fields into the per-pair output and add per-model `directionDeltaSummary`
- `cloud/apps/api/src/graphql/types/pressure-sensitivity.ts` — extend Pothos types with new CI fields and the new summary object
- `cloud/apps/web/schema.graphql` — regenerate via `emit-schema`

### Slice B — Web operation + types [CHECKPOINT]

Estimated diff: ~80 lines.

**Files:**
- `cloud/apps/web/src/api/operations/pressureSensitivity.graphql` — query the new fields; stop querying conviction/netScore/aggregate
- `cloud/apps/web/src/api/operations/pressureSensitivity.ts` — re-export new derived types; remove dead types
- `cloud/apps/web/src/generated/graphql.ts` — regenerated via `npm run codegen`

### Slice C — Web components: rewritten tables + HeaderTooltip [CHECKPOINT]

Estimated diff: ~280 lines.

**Files:**
- `cloud/apps/web/src/components/ui/HeaderTooltip.tsx` (NEW, ~50 lines) — ⓘ icon + tooltip primitive
- `cloud/apps/web/src/components/models/CeilingFloorBadge.tsx` (NEW, ~25 lines) — extracted from `PressureSensitivityDetail.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivitySummary.tsx` — rebuilt with 4 columns under "Win Rate" group header, ⓘ tooltips, ceiling/floor badge on Low cell, negative-Δ red styling
- `cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx` — rebuilt with 5 columns, same conventions; conviction columns removed; existing `PressureGrid` drilldown unchanged
- `cloud/apps/web/src/pages/PressureSensitivity.tsx` — minor adjustment if any prop wiring changes (probably none)

---

## Residual Risks

Every Residual Risk carries a `verification:` line.

- **CI math regression on real data**: Wilson-propagated diff CI could produce unexpected values at boundary conditions (e.g., one band at 100% win rate).
  Mitigation: explicit unit test for boundary cases; include reference values from Newcombe 1998 worked examples.
  **verification:** Slice A test fixture: `wilsonInterval(20, 25)` returns the textbook value `[0.61, 0.92]` for 95% CI on p̂=0.80; `diffProportionCI(0.30, 100, 0.70, 100)` produces a CI symmetric around +0.40. Both are unit-tested before merge.

- **Frontend renders deprecated fields and breaks if backend strips them later**: codegen still includes `convictionDelta` etc. for now, but if a future release removes them the page would break.
  Mitigation: explicit comment in the GraphQL operation file that we deliberately stopped querying these fields; type re-exports are deleted so any future use would fail TypeScript.
  **verification:** post-Slice C, grep the web codebase for `convictionDelta`, `netScoreDelta`, and `aggregateSensitivity` — all matches must be in the generated file or in the backend (no usage in our own component code).

- **Tooltip not keyboard-reachable**: a CSS-only `:hover` tooltip fails accessibility.
  Mitigation: `HeaderTooltip` MUST also surface tooltip on `:focus` and `:focus-visible`.
  **verification:** manual keyboard test — Tab to a column header's ⓘ icon, tooltip appears.

- **Newcombe Method-10 implementation drift**: easy to get the formula wrong.
  Mitigation: unit-test against ≥2 worked examples from the original paper.
  **verification:** test cases pulled from Newcombe 1998 Table II (e.g., `2/14 vs 1/11` → diff CI ≈ `[−0.16, 0.21]`).

- **Per-pair `n_low` and `n_high` not surfaced from existing aggregation**: current aggregation tracks `n` per cell but band-level totals need to be summed.
  Mitigation: explicit unit test that band totals sum correctly across qualifying cells.
  **verification:** test fixture with 3 cells in each band, n=5 each → `nLow = 15, nHigh = 15`.

- **Cross-model t-based CI miscomputed when pairsMeasured = 1**: t-distribution undefined for df=0.
  Mitigation: explicit guard returning `{ ciLow: null, ciHigh: null }` when `pairsMeasured < 2`.
  **verification:** unit test: input array of length 1 returns null CIs.

- **Smoke test against prod fails post-deploy** (matching the post-v1-ship pattern).
  Mitigation: targeted query post-deploy via MCP `graphql_query`.
  **verification:** post-Railway-deploy, run `pressureSensitivity(domainId: "cmmqi1urq0000e4y3ot8sfm06", signature: "vnewtd")` and verify at least one model has `directionDeltaSummary.mean != null` and CI values are populated.

---

## Testing Strategy

### Aggregation module (`aggregation.test.ts` additions)
- `wilsonInterval(20, 25)` → matches textbook `p̂=0.80`, CI ≈ `[0.61, 0.92]`
- `wilsonInterval(0, 10)` → CI lower bound is 0, upper bound finite (boundary case)
- `wilsonInterval(10, 10)` → CI upper bound is 1, lower bound finite (boundary case)
- `diffProportionCI(0.30, 100, 0.70, 100)` → matches Newcombe 1998 worked example for symmetric diff
- `diffProportionCI(2/14, 14, 1/11, 11)` → matches Newcombe 1998 Table II reference values
- `diffProportionCI(p, 0, p, n)` → returns null (zero-trials guard)
- `tBasedMeanCI([0.3, 0.5, 0.4, 0.45])` → matches `mean ± t(0.025, df=3) × sd/√4` within 4 decimals
- `tBasedMeanCI([0.3])` → returns null CI (insufficient df)
- `tBasedMeanCI([])` → returns null CI

### Resolver tests (existing `pressure-sensitivity.test.ts`)
- Verify per-pair output now includes `ciLow` and `ciHigh` on each Δ object
- Verify per-model output includes `directionDeltaSummary` with correct shape
- Verify the new fields populate to `null` when band coverage fails or pairs are too few

### Frontend component tests
- `PressureSensitivitySummary.test.tsx` — renders 4 columns; sort by Δ descending by default; negative Δ rendered in red; ceiling badge appears when low pressure ≥ 0.9
- `PressureSensitivityDetail.test.tsx` — renders 5 columns; unmeasurable Δ shown as "—" with explainer; trials column matches data
- `HeaderTooltip.test.tsx` — keyboard focus surfaces tooltip; aria attributes correct

---

## Rollout

Standard PR + Railway deploy. No data migration. The deprecated GraphQL fields stay in place; the page just stops reading them. Page itself is in-place rewrite — no new route, no nav change.

Post-deploy smoke test required per the v1 closeout pattern.

---

## Open items deferred to tasks phase

1. Whether `HeaderTooltip` uses an existing tooltip primitive or is a fresh implementation — decided in Slice C based on what's in `cloud/apps/web/src/components/ui/`.
2. Whether the deprecated `convictionDelta`/`netScoreDelta`/`aggregateSensitivity` fields get formal `@deprecated` directives in the SDL, or just code comments — decided in Slice A.
3. Exact tooltip width and positioning behavior on overflow — decided in Slice C.

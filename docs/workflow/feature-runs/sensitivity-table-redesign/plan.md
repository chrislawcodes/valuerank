# Implementation Plan: Pressure Sensitivity Table Redesign

**Branch:** `claude/sensitivity-table-redesign` | **Date:** 2026-04-28
**Spec:** `docs/workflow/feature-runs/sensitivity-table-redesign/spec.md`

## Summary

Two table redesigns + supporting backend math:

- **Cross-Model Sensitivity** (`PressureSensitivitySummary.tsx`): replaced with a 4-column table under a "Win Rate" group header (Model, Low pressure, High pressure, Win rate Δ ± CI).
- **Per-Pair Sensitivity** (`PressureSensitivityDetail.tsx`): replaced with a 5-column table under a "Win Rate" group header (Pair, Low pressure, High pressure, Win rate Δ ± CI, Trials).
- **Backend** (`pressure-sensitivity.ts` resolver, `aggregation.ts` math): adds Wilson-propagated CI for per-pair Δ, t-based CI for cross-model summary mean Δ, and a new `winRateDeltaSummary` field per model.
- **Tooltips** on every column header via a small reusable `<HeaderTooltip>` component.

The legacy GraphQL fields `directionDelta`, `convictionDelta`, `netScoreDelta` (per-pair) and `aggregateSensitivity` (per-model) are **removed entirely** from both the SDL and the resolver per spec FR-014. Cell-level conviction is still computed inside `buildCellMetrics` because the 2D pressure grid drilldown reads it, but it is not surfaced as a per-pair or per-model rollup.

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: HIGH (transcript ceiling) ELEVATED to hard requirement via new FR-019. Resolver MUST log structured warning on cap hit and surface transcriptCapHit boolean to the frontend so coverage banner can render. Companion FR-020 covers the sourceRunId collision warning case.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: MEDIUM (transparency signals dropped) RESOLVED via new FR-008c explicitly preserving unscoredCount, definitionsMeasured, definitionsExcluded, insufficient list, excludedDefinitions, and excludedScenariosCount in the resolver and the existing coverage footer surfaces. Only Defs and Baseline columns are dropped from the per-pair table proper.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: HIGH (Inconsistent Win Rate Definition) DISMISSED. Reviewer claim is incorrect. The resolver code at aggregation.ts line 102 explicitly computes n equals ownPicked plus opponentPicked plus neutral, and line 108 computes winRate equals ownPicked divided by n. This matches the glossary definition of prioritized over prioritized plus deprioritized plus neutral exactly. Neutral is NOT excluded from the denominator; only unscored (refusals and unparseables) is excluded. The reviewer appears to have misread the outcome mapping. MEDIUM (Trials column with thin bands) RESOLVED via new FR-008b restricting Trials to qualifying-cell trials only. LOW (no badge on dash cell) RESOLVED via new FR-007a. LOW (hard-coded 0.02) RESOLVED via FR-006a now requiring import of FLAT_DELTA_THRESHOLD constant rather than literal.
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: MEDIUM (cross-model row estimator unspecified) RESOLVED. Decision 2 now contains an explicit Cross-model summary row estimator contract section locking Low pressure, High pressure, and Win rate Delta to be unweighted means over the same measured-pair set, with the FR-006b caveat that arithmetic Low minus High does NOT necessarily equal the Delta cell. MEDIUM (HeaderTooltip composition) RESOLVED. Decision 3 markup composition note explicitly verifies against the existing TableHead onClick markup at PressureSensitivitySummary.tsx 115 to 118 and confirms no button-in-button. MEDIUM (last-write-wins still possible) ACKNOWLEDGED in Residual Risks; deferred.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: MEDIUM (HeaderTooltip nested in sortable header) RESOLVED via Decision 3 markup composition note verified against existing code. MEDIUM (cross-model row mixed estimands) RESOLVED via Decision 2 estimator contract section.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: HIGH H-01 (untested mouse hover) RESOLVED. HeaderTooltip.test.tsx now includes pointerOver and pointerLeave assertions in plan and tasks. MEDIUM M-01 (CeilingFloorBadge regression) RESOLVED via new dedicated CeilingFloorBadge.test.tsx in plan and tasks Slice C2b. MEDIUM M-02 (grep scope) RESOLVED. Verification grep is now explicitly scoped to the whole cloud monorepo tree. MEDIUM M-03 (testing copy not comprehension) ACKNOWLEDGED. Substring assertion plus tooltip copy is the v1 mitigation; user-comprehension testing is out of scope but flagged in Residual Risks. LOW L-01 (generated paths exclusion list) ACKNOWLEDGED. Slice A diff checkpoint will manually verify the grep results before merge. RR-01 (silent truncation if banner fails to render) ACKNOWLEDGED in Residual Risks plus structured log warning so server-side observability is independent of frontend. RR-02 (last-write-wins non-determinism) ACKNOWLEDGED. RR-03 (production data edge cases) ACKNOWLEDGED via post-deploy smoke test.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: HIGH (Tooltip uses onMouseEnter Leave with 200ms delay) RESOLVED. C2 tests rewritten to use mouseEnter mouseLeave with vi.advanceTimersByTime 200 plus focus and blur (immediate path). MEDIUM (cross-value heat map cell title hardcodes netScore Δ) RESOLVED. C6 now does a full text sweep including the cell title at line 103, legend, color scale. MEDIUM (sanity panel labels) RESOLVED. C6 now does a full label rewrite including Directional sanity check, measurable Direction Δ, table header, and Below 70% positive direction copy.
- review: reviews/tasks.codex.dependency-order-adversarial.review.md | status: accepted | note: HIGH (Slice A grep impossible in dependency order) RESOLVED. Slice A grep is now scoped to backend only (apps/api, packages, workers, schema.graphql); the wide check covering apps/web/src and the generated codegen runs at the end of Slice C and as the final pre-PR gate. MEDIUM (Tooltip event mismatch) RESOLVED via C2 test rewrite to mouseEnter mouseLeave with timer plus focus blur.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: MEDIUM (Incomplete Backend Cleanup) RESOLVED. Task A4 now explicitly deletes applyBandReduction, computeBaselineWinRate, and the orphaned types DeltaTriplet, BaselineWinRate, AggregateSensitivity. MEDIUM (Incomplete GraphQL Type Definition Cleanup) RESOLVED. Task A4 also deletes the orphaned Pothos refs BandStatRef, BaselineWinRateRef, AggregateSensitivityRef. (Ambiguous pairsPositive Threshold) RESOLVED via boundary fixture in resolver tests at values 0.019, 0.021, 0.05 expecting count of 2.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: MEDIUM 1 (web client still wired to old shape) DEFERRED to Slice B which is the explicit dependency; Slice A backend grep is intentionally backend-only per tasks.md A6, frontend cleanup in Slice B/C. MEDIUM 2 (transcriptCapHit false-positive on exact-multiple page boundaries) RESOLVED by fetching TRANSCRIPT_PAGE_SIZE+1 rows and using page.length greater-than threshold to detect hasMore. Commit e83fdb36. MEDIUM 3 (model sort by signed mean) INTENTIONAL per spec FR-011 — cross-model sort default is Win rate Δ descending (signed). User can re-sort by clicking the column. Strongly negative model still appears in the table just lower in default order.
- review: reviews/diff.codex.regression-adversarial.review.md | status: accepted | note: MEDIUM (GraphQL contract breaking change) ACCEPTED. This is the deliberate breaking change per spec FR-014; monorepo with no external consumers, web operation/codegen update lands atomically in Slice B. MEDIUM (model sort signed) INTENTIONAL per FR-011. MEDIUM (pairsPositive only counts greater-than threshold) INTENTIONAL per spec FR-013 which explicitly defines pairsPositive as count where Δ greater-than 0.02; user-facing copy says moved up not positive per FR-006a. MEDIUM (helpers removed) VERIFIED clean. Backend grep ran zero matches; no other callers of applyBandReduction, computeBaselineWinRate, aggregateSensitivity exist.
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: HIGH 1 (sourceRunId collision non-determinism) PARTIALLY RESOLVED. Added orderBy id:asc on db.run.findMany so last-write-wins is reproducible (commit e83fdb36). The fundamental misattribution risk stays in Residual Risks; one-to-many mapping refactor is out of scope. MEDIUM 2 (transcript fetch limit bias toward oldest) ACKNOWLEDGED in Residual Risks. Random sampling refactor deferred; transcriptCapHit warning plus UI banner per Decision 8 is the v1 mitigation.

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
- `p_low` = **pooled binomial proportion** across qualifying low-band cells: `sum(ownPicked) / sum(n)` over cells with `ownLevel ≤ 2 AND n ≥ 3`. NOT the mean of per-cell `winRate` values.
- `p_high` = same pooled proportion for cells with `ownLevel ≥ 4 AND n ≥ 3`.
- `n_low` = `sum(n)` across the same qualifying low-band cells used to compute `p_low`. The successes count and trial count come from the same cell set.
- `n_high` = analogous.

This is the single estimand for the row. The Δ point estimate displayed in the table = `p_high − p_low` from these pooled rates, and Wilson/Newcombe CIs operate on the same `(p, n)` inputs. The previous v1 behavior — `applyBandReduction` returning `nullableMean` over per-cell win rates — is **replaced**; that quantity is not what the Wilson CI describes and using it would produce a statistically inconsistent (point estimate, CI) pair.

The cell-level `n` from `buildCellMetrics` is `ownPicked + opponentPicked + neutral`. The new `successes` exposed for pooling is just `ownPicked`. Both numbers must be carried into the band reducer; that requires extending the cell shape per spec FR-005a.

**Implementation pseudocode (Newcombe 1998, Method 10):**

```typescript
// For Δ = p1 − p2 with Wilson intervals (l1, u1) for p1 and (l2, u2) for p2:
//   L_Δ = Δ − sqrt((p1 − l1)² + (u2 − p2)²)
//   U_Δ = Δ + sqrt((u1 − p1)² + (p2 − l2)²)
// We pass p1 = pHigh, p2 = pLow.
function diffProportionCI(
  pLow: number, nLow: number,
  pHigh: number, nHigh: number,
  z = 1.96
): { ciLow: number; ciHigh: number } | null {
  if (!Number.isFinite(pLow) || !Number.isFinite(pHigh)) return null;
  if (nLow <= 0 || nHigh <= 0) return null;
  const lowWilson = wilsonInterval(pLow, nLow, z);    // { low: l2, high: u2 }
  const highWilson = wilsonInterval(pHigh, nHigh, z); // { low: l1, high: u1 }
  if (lowWilson === null || highWilson === null) return null;
  const delta = pHigh - pLow;
  const lowerHalf = Math.sqrt(
    (pHigh - highWilson.low) ** 2 +   // (p1 − l1)²
    (lowWilson.high - pLow) ** 2      // (u2 − p2)²
  );
  const upperHalf = Math.sqrt(
    (highWilson.high - pHigh) ** 2 +  // (u1 − p1)²
    (pLow - lowWilson.low) ** 2       // (p2 − l2)²
  );
  return { ciLow: delta - lowerHalf, ciHigh: delta + upperHalf };
}
```

**Verification:** The earlier draft of this pseudocode (round-1 plan) had the term pairings reversed, which is a real-world implementation pitfall flagged by round-2 Codex Architecture review. The Slice A unit test fixture pulled from Newcombe 1998 Table II MUST be the authoritative check — if the implementation deviates from the formula above, the test against the textbook value (`2/14 vs 1/11` → diff CI ≈ `[−0.16, 0.21]`) catches it.

**Rationale:**
- Newcombe Method-10 is the recommended interval for `p_high − p_low` when both proportions come from independent samples; it does not assume normality and behaves correctly near 0 and 1 (where naive normal-approx CIs fail).
- Survey-methodology readers will recognize the convention.
- The math is well-documented (Newcombe 1998), making the implementation auditable.

**Alternative considered:** Naive normal-approx (`±1.96 × √(p_low(1−p_low)/n_low + p_high(1−p_high)/n_high)`). Rejected because it gives nonsensical CIs near 0 and 1 (e.g., a CI extending past 100%).

### Decision 2: Cross-model summary CI uses t-based across-pairs interval (interpreted as spread)

**Chosen:** For each model's `winRateDeltaSummary`:
- Take per-pair `winRateDelta.value` for all measured pairs (defined Δ).
- Compute sample mean, sample sd, and t-based CI: `mean ± t(0.025, df = n − 1) × sd / √n`.
- When `n < 2`, CI is undefined; expose `null` for `ciLow`/`ciHigh` and let the frontend render "(thin)".

**Cross-model summary row estimator contract (locked):**

For each model, the summary row displays three numbers built from the SAME set of measured pairs (i.e. pairs where the per-pair `winRateDelta.value` is non-null):

- **Low pressure cell** = `mean(perPairLowBandRates)` — arithmetic mean of per-pair `winRateDelta.lowBandMean` over the measured pairs.
- **High pressure cell** = `mean(perPairHighBandRates)` — arithmetic mean of per-pair `winRateDelta.highBandMean` over the measured pairs.
- **Win rate Δ cell** = `mean(perPairWinRateDeltas)` — arithmetic mean of per-pair `winRateDelta.value`.

All three are unweighted across-pair means over the same pair set. The Δ cell carries a t-based CI describing the spread of per-pair Δs. The Low/High cells display NO CI in the table (by design, FR-003 / spec rule 6). They are surfaced separately so a user can see the endpoint values that produced the Δ.

**Important caveat (locked in spec FR-006b):** because all three numbers are independent unweighted means over the same pair set, `Low pressure − High pressure` does NOT necessarily equal `Win rate Δ` for the same row. They share the input pair set but each is its own statistic; the row is internally consistent only in the sense that all three describe the same population, not in the sense that arithmetic between them holds. The column header tooltip says this explicitly.

**Important interpretive framing (driven by round-3 plan reviews):**

This CI gives every measured pair equal weight regardless of trial count. A pair built from 3 trials and a pair built from 300 trials each contribute one observation. That means the interval is a **dispersion statistic** — "how varied is this model's pressure response across value pairs?" — NOT a precision-weighted estimate of an underlying population mean. We chose this on purpose because:

1. The number we want to communicate to the user is "if you average the model's per-pair sensitivities, here's the typical magnitude and how spread out the values are." Inverse-variance weighting would push the headline toward whichever pair happened to have the most trials, which is an artifact of which definitions exist in the corpus, not of the model.
2. Small samples per pair are already filtered by the `n ≥ 3` cell rule, so the worst-case "noisy 3-trial pair" still went through that gate.
3. The plain-language tooltip on the column header MUST therefore say "spread across this model's value pairs" not "uncertainty in the model's mean sensitivity." See tooltip copy update below.

**Alternative considered:** Random-effects meta-analysis (DerSimonian-Laird) with inverse-variance weighting. Rejected for v1 — adds machinery that's hard to defend in plain language and biases the headline toward corpus composition rather than model behavior. Could revisit for v2 if the dispersion framing causes user confusion.

### Decision 3: `<HeaderTooltip>` is a small new component, scoped to this redesign

**Chosen (revised after round-3-of-tasks review):** **Reuse the existing `Tooltip` primitive** at `cloud/apps/web/src/components/ui/Tooltip.tsx`, which already handles hover/focus, `role="tooltip"`, and `aria-describedby` correctly. Build a small `HeaderTooltipTrigger`-style wrapper specific to header cells — modeled on the existing `cloud/apps/web/src/components/runs/SortHeaderButton.tsx#HeaderTooltipTrigger` — that renders an ⓘ icon button next to the column label and surfaces the existing `<Tooltip>` on hover/focus. Do NOT introduce a second tooltip implementation.

The contract for the new wrapper (`HeaderTooltip` for the redesign's table headers, in `cloud/apps/web/src/components/ui/HeaderTooltip.tsx`):

- The trigger MUST be a `<button type="button">` (NOT a span/div) so it gets focus by default and works with assistive tech. The button contains the ⓘ icon and visually-hidden label text.
- The tooltip body MUST render with `role="tooltip"` and have a stable `id`.
- The button MUST set `aria-describedby={tooltipId}` so screen readers announce the tooltip text when the button is focused.
- The button MUST also expose an accessible name via `aria-label` (e.g. `aria-label="What does Win rate Δ mean? Show explanation."`).
- Tooltip visibility is driven by `:hover`, `:focus-visible` on the button, AND a `useState` toggle on `pointerover` / `focus` / `pointerleave` / `blur` so the tooltip is reachable both by mouse and by keyboard. CSS-only `:hover :focus` works for show/hide but the React state version is needed so the unit test can deterministically assert the tooltip text is in the DOM after `fireEvent.focus(button)`.
- Width-bounded to ~280px (Tailwind `max-w-[280px]`).

The same component is used for **column headers AND the group header** ("Win Rate"); the group header has the ⓘ icon next to the bold "Win Rate" label per spec FR-009. Slice C must wire it on both surfaces.

**Markup composition note (verified against existing code at `PressureSensitivitySummary.tsx:115-118`):** the existing sortable header uses `<TableHead onClick={...}>` (renders as `<th>` with a click handler). It is NOT a `<button>`. Therefore embedding a `<button>` for the ⓘ trigger inside a `<th>` is valid HTML — no button-in-button issue. The `event.stopPropagation()` on the tooltip button prevents the tooltip click from firing the parent's sort-toggle handler. (As a side improvement, we may also wrap the sort-clickable label text itself in a `<button>` for keyboard accessibility, but that is OUT OF SCOPE for this redesign — flagged for a future a11y pass.)

**Automated test (HeaderTooltip.test.tsx):** `fireEvent.focus(button)` → assert tooltip text is rendered AND assert `aria-describedby` matches the tooltip id. `fireEvent.blur(button)` → assert tooltip is hidden. This closes the round-3 review LOW finding that the keyboard contract was manual-only.

**Rationale:**
- Existing app uses `title` attributes in some places and a custom popover in others; no reusable header-tooltip primitive exists yet. A small focused component keeps this change clean.
- WCAG 2.1 SC 1.3.1 + 2.1.1: tooltips MUST be keyboard-reachable. A `<button>` trigger with `aria-describedby` is the documented pattern and what testing libraries can assert against.

**Alternative considered:** Reuse the existing popover component for major drilldowns. Rejected — too heavy for a header tooltip, and the popover requires explicit click-to-open, which is wrong for this UX (we want passive hover/focus).

### Decision 4: Remove old GraphQL fields entirely; conviction stays in the cell shape

**Chosen (revised after user feedback in conversation):** The redesign removes the per-pair `directionDelta`, `convictionDelta`, `netScoreDelta` fields and the per-model `aggregateSensitivity` field from the GraphQL output **entirely** — no deprecation overlap window. Implementation steps:

1. Backend SDL drops `directionDelta`, `convictionDelta`, `netScoreDelta`, `aggregateSensitivity`. Adds `winRateDelta` (per-pair) and `winRateDeltaSummary` (per-model) per spec FR-012, FR-013.
2. Resolver stops computing the dropped fields. `applyBandReduction` is replaced by a new pooled-binomial reducer that returns `{ value, ciLow, ciHigh, lowBandMean, highBandMean, reason }` matching the new `winRateDelta` shape.
3. Cell-level conviction is still computed inside `buildCellMetrics` — it's free, it's needed by the 2D pressure grid drilldown, and the cell shape is consumed inside the resolver before serialization. The output schema just doesn't surface conviction at the per-pair or per-model rollup level.
4. `PressureSensitivityCrossValueMap.tsx` switches `pair.netScoreDelta.value` → `pair.winRateDelta.value` per spec FR-017a.
5. `PressureSensitivitySanityCheck.tsx` switches its label rendering and field reads from `directionDelta` to `winRateDelta` per spec FR-017b.

**Verification (Slice A diff checkpoint):** `grep -RE "directionDelta|convictionDelta|netScoreDelta|aggregateSensitivity" cloud cloud/apps/web/schema.graphql` (full monorepo `cloud/` tree, including `schema.graphql`, `apps/`, `packages/`, `workers/`, and any `scripts/` directory) MUST return zero matches outside auto-generated codegen output (`cloud/apps/web/src/generated/graphql.ts` and any node_modules/dist directories). This is enforced as a checkpoint command in the diff phase. The wide scope addresses the round-2 plan review finding that a narrow grep could pass while consumers in other directories still reference the removed fields.

**Rationale:**
- Monorepo with no external GraphQL consumers — keeping deprecated fields just lets the old vocabulary leak back in (the user explicitly rejected the deprecation-window approach).
- The conviction math stays inside `buildCellMetrics` because the 2D pressure grid drilldown still uses cell-level conviction. We're removing the rollup, not the underlying math.
- A future "Model Voice" report can introduce its own field names (e.g. `firmnessDelta`) without resurrecting the legacy ones.

### Decision 5: Color + icon encoding for negative Δ (WCAG-compliant)

**Chosen:** Negative Win rate Δ values render with `text-red-700` (Tailwind class) AND a leading `▼` glyph prefix. Positive values render with default text color and no glyph (or a leading `▲` for symmetry — implementer's call in Slice C). The CI annotation (`± X pp`) inherits the same color as the value to keep the unit visually attached.

**Rationale:**
- Negative Δ is rare and noteworthy — should stand out without screaming.
- `text-red-700` is the same shade used elsewhere in the app for warning/error states; keeps the design consistent.
- WCAG 2.1 SC 1.4.1 (Use of Color) requires non-color signals for important information. Round-2 Gemini MEDIUM flagged that color alone is insufficient; the `▼` glyph ensures users with deuteranopia/protanopia or grayscale displays can still distinguish negative Δs.

### Decision 6: Ceiling/floor badge styling

**Chosen:** Inline `<span>` with `bg-amber-100 text-amber-800` background, content "ceiling" or "floor" — same component pattern as the existing `CeilingFloorBadge` in `PressureSensitivityDetail.tsx`. Move the component to a shared location (`cloud/apps/web/src/components/models/CeilingFloorBadge.tsx`) so both summary and detail can use it.

**Rationale:**
- Existing badge already has the right look; reuse it.
- Both tables now show the badge on the Low pressure cell, so a shared component avoids drift.

### Decision 7: Sort behavior (with deterministic tie-break)

**Chosen:**
- Cross-model summary default sort: primary = Win rate Δ descending; **secondary = model name ascending** for deterministic tie-break.
- Per-pair detail default sort: primary = |Win rate Δ| descending; **secondary = pair label ascending** (canonical pair label).
- Both sorts: rows with undefined Δ go to the bottom regardless of direction; among undefined-Δ rows, secondary sort still applies (alphabetical).
- Explicit click on a column header toggles asc/desc on that column. Tie-break by name remains.

**Rationale:**
- Without an explicit tie-breaker the rendered order depends on the upstream iteration order of the resolver, which is not stable across runs (round-3 Gemini HIGH finding). A deterministic secondary sort keeps the table consistent across reloads and makes sort tests reliable.
- Alphabetical by model/pair label is the user-recognizable fallback.

**Test (Slice C):** `PressureSensitivitySummary.test.tsx` MUST include a fixture where two models have identical Win rate Δ (e.g., both +5.0 pp) and assert that they render in alphabetical order. Same for per-pair detail with two pairs at identical |Δ|.

### Decision 8: Transcript cap warning surfaces in resolver logs AND in the GraphQL response (FR-019)

**Chosen:** When the resolver's transcript pagination loop exits because `scanned >= TRANSCRIPT_FETCH_LIMIT` AND the cursor still points to additional rows:

1. Log a structured warning via the existing `createLogger('pressure-sensitivity')` instance: `log.warn({ sourceRunIds, scanned, limit: TRANSCRIPT_FETCH_LIMIT, code: 'transcript_cap_hit' }, 'Transcript fetch hit cap; results may be biased')`.
2. Set a top-level `transcriptCapHit: boolean` field on the `pressureSensitivity` GraphQL response.
3. Frontend `PressureSensitivity.tsx` reads `data.pressureSensitivity.transcriptCapHit` and, when true, renders an amber banner above the report: "Coverage warning: this report scanned the maximum 500,000 transcripts and stopped before reaching the end of the data. Win rates and CIs may be biased toward earlier transcripts in the corpus."

**Rationale:** Silent truncation is the worst failure mode — numbers look precise but are biased. Logging alone is insufficient because a user reading the report won't see logs. A banner in the UI is necessary to make truncation user-visible.

### Decision 9: Source-run-to-definition collision logged but not corrected (FR-020)

**Chosen:** When the resolver's `sourceRunToDefId` Map.set encounters an existing key with a different value, log a structured warning: `log.warn({ sourceRunId, existingDefinitionId, newDefinitionId, code: 'source_run_collision' }, 'sourceRunId mapped to multiple definitions; last write wins')`. The behavior is unchanged from v1 (last-write-wins), so this PR does not introduce a regression. The warning is the diagnostic hook for the future fix.

**Rationale:** Fixing the collision (e.g., aggregating per `(sourceRunId, definitionId)` pair) is a substantial refactor of the resolver's data-source plumbing introduced in PR #772. Out of scope for this redesign. The warning surfaces collisions in production logs so we know whether the fix is actually needed or whether collisions never happen in practice.

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
> **What the CI means:**
> • **Cross-model row:** spread of per-pair Δs across this model's measured value pairs (each pair counts once, regardless of trial count). Wider band = the model behaves differently across pairs.
> • **Per-pair row:** trial-level uncertainty in this single pair's Δ (Wilson-propagated diff-of-proportions).
>
> The "moved up" count (e.g. `9/11 moved up`) is the number of pairs where Δ exceeded +2 pp — the same threshold used by the directional sanity check at the bottom of the page.

### Column: Trials (per-pair only)
> Total scored trials that contributed to this row's win rates. Counts only trials inside cells that met the coverage threshold (N ≥ 3) in the light or heavy pressure band. Refusals, unparseable responses, and trials in cells we skipped (low-data cells, level 3) are excluded.

---

## Implementation slices

### Slice A — Backend math + resolver + types + SDL [CHECKPOINT]

Estimated diff: ~350 lines (aggregation.ts additions + resolver rewrite of band reduction + SDL trim + transcript-cap and collision logging).

**Files:**
- `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts` — extend `Cell` shape with `successes` (= ownPicked); add `wilsonInterval`, `diffProportionCI`, `tBasedMeanCI`, `pooledBandReduction` helpers as pure functions; replace `applyBandReduction` for per-pair output (the new reducer returns `{ value, ciLow, ciHigh, lowBandMean, highBandMean, reason, qualifyingTrials }`)
- `cloud/apps/api/src/services/pressure-sensitivity/aggregation.test.ts` — textbook-example unit tests for each new function plus NaN/Infinity guards (round-3 LOW finding)
- `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts` — wire the new fields; remove `directionDelta`/`convictionDelta`/`netScoreDelta`/`aggregateSensitivity`; add per-model `winRateDeltaSummary`; add transcript-cap warning + GraphQL `transcriptCapHit` boolean (Decision 8); add source-run collision warning (Decision 9)
- `cloud/apps/api/src/graphql/types/pressure-sensitivity.ts` — extend Pothos types: drop the four old fields, add `winRateDelta`, `winRateDeltaSummary`, `qualifyingTrials`, `transcriptCapHit`
- `cloud/apps/web/schema.graphql` — regenerate via `emit-schema`

### Slice B — Web operation + types [CHECKPOINT]

Estimated diff: ~80 lines.

**Files:**
- `cloud/apps/web/src/api/operations/pressureSensitivity.graphql` — query the new fields; stop querying conviction/netScore/aggregate
- `cloud/apps/web/src/api/operations/pressureSensitivity.ts` — re-export new derived types; remove dead types
- `cloud/apps/web/src/generated/graphql.ts` — regenerated via `npm run codegen`

### Slice C — Web components: rewritten tables + HeaderTooltip [CHECKPOINT]

Estimated diff: ~320 lines.

**Files:**
- `cloud/apps/web/src/components/ui/HeaderTooltip.tsx` (NEW, ~70 lines) — ⓘ icon + tooltip primitive per Decision 3 contract (focusable button + role=tooltip + aria-describedby)
- `cloud/apps/web/src/components/ui/HeaderTooltip.test.tsx` (NEW, ~50 lines) — automated keyboard test (focus → tooltip text in DOM; blur → tooltip removed); aria-describedby assertion
- `cloud/apps/web/src/components/models/CeilingFloorBadge.tsx` (NEW, ~25 lines) — extracted from `PressureSensitivityDetail.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivitySummary.tsx` — rebuilt with 4 columns under "Win Rate" group header (group header gets its own HeaderTooltip), ⓘ on every column header, ceiling/floor badge on Low cell when value defined and ≥ 0.9 / ≤ 0.1, negative-Δ red styling, deterministic alphabetical tie-break sort, `(thin)` annotation on `pairsMeasured = 1` rows
- `cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx` — rebuilt with 5 columns under "Win Rate" group header, same conventions, Trials column reads `qualifyingTrials` per FR-008b, dash rendering for thin-band cells (FR-008a) and no badge attached (FR-007a), existing `PressureGrid` drilldown unchanged
- `cloud/apps/web/src/components/models/PressureSensitivityCrossValueMap.tsx` — one-line read change: `pair.netScoreDelta.value` → `pair.winRateDelta.value` per spec FR-017a
- `cloud/apps/web/src/components/models/PressureSensitivitySanityCheck.tsx` — label rename "Direction Δ" → "Win rate Δ"; field rename `directionDelta` → `winRateDelta` per spec FR-017b
- `cloud/apps/web/src/pages/PressureSensitivity.tsx` — render the transcript-cap banner above the report when `data.pressureSensitivity.transcriptCapHit === true` (Decision 8)
- `cloud/apps/web/src/components/models/PressureSensitivitySummary.test.tsx` — column-mapping assertions (4 columns, the right headers, no Provider/Aggregate/Pairs Measured/Spread); default sort = Win rate Δ desc with alphabetical tie-break; null Δ renders "(thin)"; negative Δ has red class
- `cloud/apps/web/src/components/models/PressureSensitivityDetail.test.tsx` — column-mapping (5 columns, no Defs/Baseline); default sort = |Δ| desc with alphabetical tie-break; thin-band cell shows dash and hover text per FR-008 reason map; no ceiling/floor badge when low cell shows dash

---

## Residual Risks

Every Residual Risk carries a `verification:` line.

- **CI math regression on real data**: Wilson-propagated diff CI could produce unexpected values at boundary conditions (e.g., one band at 100% win rate).
  Mitigation: explicit unit test for boundary cases; include reference values from Newcombe 1998 worked examples.
  **verification:** Slice A test fixture: `wilsonInterval(20, 25)` returns the textbook value `[0.61, 0.92]` for 95% CI on p̂=0.80; `diffProportionCI(0.30, 100, 0.70, 100)` produces a CI symmetric around +0.40. Both are unit-tested before merge.

- **Old GraphQL fields not fully removed (per FR-014)**: schema, resolver, types, and frontend reads must all drop in lockstep or build breaks.
  Mitigation: Slice A diff checkpoint runs `grep -RE "directionDelta|convictionDelta|netScoreDelta|aggregateSensitivity" cloud` (whole monorepo tree, including `schema.graphql`, `apps/`, `packages/`, `workers/`, and any `scripts/`) and asserts zero matches outside `cloud/apps/web/src/generated/graphql.ts` and dist/node_modules.
  **verification:** the grep is run as part of the Slice A diff checkpoint script and as a smoke command in Slice B (after web codegen regenerates).

- **Estimand inconsistency between point estimate and CI**: prior plan draft described win rates as "mean across qualifying cells" while CI math operated on pooled `(p, n)`. Round-3 reviewers flagged this as a HIGH risk. Current plan (Decision 1) commits to **pooled binomial proportion** as the single estimand for both point estimate and CI inputs, and `applyBandReduction`'s legacy mean-of-rates code is replaced.
  **verification:** Slice A unit test asserts that for a fixture with 3 cells (`ownPicked = [3, 4, 5]`, `n = [10, 10, 10]`), `pooledBandReduction` returns `lowBandMean = 12 / 30 = 0.40`, NOT the mean-of-rates value `(0.30 + 0.40 + 0.50) / 3 = 0.40` — these happen to match here, so add a second fixture where `n` varies (`ownPicked = [3, 4, 5]`, `n = [10, 20, 30]`) where pooled (12/60 = 0.20) differs from mean-of-rates ((0.30+0.20+0.167)/3 ≈ 0.222), and assert the pooled value.

- **Cross-model t-based CI misread as precision**: round-3 reviewers flagged that giving each pair equal weight makes the CI a dispersion statistic, not an uncertainty interval. Plan (Decision 2) commits to keeping t-based for v1 and reframes the column tooltip as "spread across pairs" so the framing is accurate.
  **verification:** review the rendered tooltip copy in Slice C against Decision 2 and the approved tooltip text section. The test for `HeaderTooltip` on the Win rate Δ column asserts the substring "spread of per-pair Δs" or equivalent appears in the tooltip body.

- **Stat helpers crash on NaN/Infinity input**: low-likelihood but possible if upstream bug feeds bad data.
  Mitigation: each helper guards `Number.isFinite(p)` etc. and returns `null` for invalid input rather than NaN-poisoning downstream.
  **verification:** Slice A unit tests for `wilsonInterval(NaN, 10)`, `diffProportionCI(0.5, 0, 0.5, 10)`, `tBasedMeanCI([])` — each returns `null` cleanly.

- **Tooltip not keyboard-reachable**: a CSS-only `:hover` tooltip fails accessibility.
  Mitigation: `HeaderTooltip` uses a `<button>` trigger with `aria-describedby` per Decision 3, AND has an automated test that asserts focus surfaces the tooltip text.
  **verification:** `HeaderTooltip.test.tsx` asserts `fireEvent.focus(button)` causes the tooltip element with `role="tooltip"` to appear in the DOM and that the button's `aria-describedby` resolves to that tooltip's `id`. This automated test closes the manual-only gap from round-3.

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
  **verification:** post-Railway-deploy, run `pressureSensitivity(domainId: "cmmqi1urq0000e4y3ot8sfm06", signature: "vnewtd")` and verify at least one model has `winRateDeltaSummary.mean != null` and CI values are populated.

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
- Verify per-pair output now includes `ciLow` and `ciHigh` on `winRateDelta`
- Verify per-model output includes `winRateDeltaSummary` with correct shape (mean, ciLow, ciHigh, lowBandMean, highBandMean, pairsMeasured, pairsPositive)
- Verify the new fields populate to `null` when band coverage fails or pairs are too few
- Verify `transcriptCapHit` boolean is emitted and is `false` for fixtures that fit under the cap, `true` for a fixture that simulates `scanned == TRANSCRIPT_FETCH_LIMIT` and a non-empty cursor (Decision 8)
- Verify the resolver logs `transcript_cap_hit` warning under that simulated condition (assert via spy on logger.warn)
- Verify the resolver logs `source_run_collision` warning when `sourceRunToDefId` is fed a fixture with the same sourceRunId mapped to two different definitionIds (Decision 9 — closes round-2 Gemini HIGH on untested diagnostic)
- Verify legacy `directionDelta`, `convictionDelta`, `netScoreDelta`, and `aggregateSensitivity` fields are **absent** from the GraphQL response (assertion against the resolved object's keys)

### Frontend component tests
- `PressureSensitivitySummary.test.tsx` — renders 4 columns under "Win Rate" group header; default sort = Δ desc with alphabetical tie-break (asserted via fixture with two identical-Δ models); negative Δ has both red text class AND a downward-arrow icon (▼) prefix (closes round-2 Gemini MEDIUM: color-only encoding fails WCAG 1.4.1; the icon adds a non-color signal); ceiling badge appears when low pressure ≥ 0.9; `(thin)` annotation when pairsMeasured = 1; tooltip body for Win rate Δ contains the substring "spread of per-pair Δs" (verifies Decision 2 dispersion framing reaches the user)
- `PressureSensitivityDetail.test.tsx` — renders 5 columns; default sort = |Δ| desc with alphabetical tie-break; unmeasurable Δ shown as "—" with the FR-008 reason hover text; thin-band Low/High cell shows "—" with same hover text and NO ceiling/floor badge (FR-007a); Trials column reads `qualifyingTrials` field (FR-008b), not legacy `pairN`
- `PressureSensitivityCrossValueMap.test.tsx` — cell color now driven by `winRateDelta.value`, not `netScoreDelta.value`
- `PressureSensitivitySanityCheck.test.tsx` — header label reads "Win rate Δ"; field reads come from `winRateDelta`
- `HeaderTooltip.test.tsx`:
  - `fireEvent.focus(button)` causes tooltip with `role="tooltip"` to appear; button's `aria-describedby` resolves to that tooltip's `id`; `fireEvent.blur(button)` removes the tooltip.
  - `fireEvent.pointerOver(button)` causes tooltip to appear; `fireEvent.pointerLeave(button)` removes it (round-3 Gemini HIGH: mouse-event coverage was missing).
  - Clicks on the ⓘ button do NOT bubble to the parent header element (assert via spy on parent `onClick`).
- `CeilingFloorBadge.test.tsx` (NEW): regression test asserting the extracted component renders the badge text "ceiling" / "floor" with the documented Tailwind classes (`bg-amber-100 text-amber-800`) given each input. Both detail and summary tables import this component, so a regression breaks both — a dedicated unit test catches it before component-tree tests do (round-3 Gemini MEDIUM).
- `PressureSensitivity.test.tsx` (page-level) — when `data.pressureSensitivity.transcriptCapHit === true`, the amber coverage banner renders above the report; when `false`, it does not

---

## Rollout

Standard PR + Railway deploy. No data migration. The legacy GraphQL fields (`directionDelta`, `convictionDelta`, `netScoreDelta`, `aggregateSensitivity`) are removed atomically with the new fields landing — backend, schema.graphql, and frontend codegen drop them in one PR per Decision 4. Page itself is in-place rewrite — no new route, no nav change.

Post-deploy smoke test required per the v1 closeout pattern: query `pressureSensitivity(domainId, signature)` via MCP and verify `winRateDeltaSummary` and `transcriptCapHit` are present and populated.

---

## Open items deferred to tasks phase

1. Whether `HeaderTooltip` uses an existing tooltip primitive or is a fresh implementation — decided in Slice C based on what's in `cloud/apps/web/src/components/ui/`.
2. Exact tooltip width and positioning behavior on overflow — decided in Slice C with manual visual check.

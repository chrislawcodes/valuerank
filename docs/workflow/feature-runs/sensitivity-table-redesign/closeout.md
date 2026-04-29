# Closeout: Pressure Sensitivity Table Redesign

**Slug:** sensitivity-table-redesign
**PR:** [#778](https://github.com/chrislawcodes/valuerank/pull/778)
**Squash commit:** `04a4932d3505564ef206bd69e48780ad9f943e97`
**Merged:** 2026-04-29 02:46:40 UTC
**Branch:** `claude/sensitivity-table-redesign` (deleted after merge)

---

## Outcome

Replaced the v1 Pressure Sensitivity report's headline tables with a focused win-rate-only design backed by honest statistical machinery (Wilson-propagated per-pair CIs, t-based across-pairs CIs). Removed the `directionDelta`, `convictionDelta`, `netScoreDelta`, `baselineWinRate`, and `aggregateSensitivity` fields from the GraphQL surface entirely; renamed every user-visible "Direction Δ" / "Directional sanity check" label to "Win rate Δ" / "Win rate sanity check".

Also added two new observability hooks: a structured `transcript_cap_hit` log warning + GraphQL `transcriptCapHit: Boolean!` flag that drives an amber UI banner when the 500k transcript cap fires, and a structured `source_run_collision` warning for the v1 sourceRunId collision risk we'd flagged in residual risks.

## What landed

| Surface | Change |
|---|---|
| GraphQL schema | `winRateDelta`, `winRateDeltaSummary`, `qualifyingTrials`, `transcriptCapHit` added; `directionDelta`, `convictionDelta`, `netScoreDelta`, `baselineWinRate`, `aggregateSensitivity` removed |
| Resolver | Pooled binomial Δ replaces mean-of-cell-rates as point estimate; resolver model order seeded by `winRateDeltaSummary.mean` desc; warning logs + `transcriptCapHit` set on every return path including `buildEmptyResult` |
| Aggregation math | New `wilsonInterval`, `diffProportionCI` (Newcombe Method-10), `tBasedMeanCI`, `pooledBandReduction`; legacy `applyBandReduction`, `computeBaselineWinRate`, `aggregateSensitivity` deleted |
| Cross-model summary table | 4 columns (Model, Low, High, Δ ± CI), `(thin)` annotation when pairsMeasured = 1, `N/M moved up` annotation, ceiling/floor badge on saturated low cells |
| Per-pair detail table | 5 columns (Pair, Low, High, Δ ± CI, Trials), Trials reads `qualifyingTrials`, `—` cells with reason hover when band coverage fails |
| HeaderTooltip | New wrapper around existing `<Tooltip>` primitive; ⓘ button on every column header and the "Win Rate" group header; click stopPropagation prevents accidental sort toggle |
| Cross-value heat map | Cell metric switched from `netScoreDelta` to `winRateDelta`; legend updated |
| Sanity panel | Full label sweep — "Direction Δ" → "Win rate Δ" everywhere user-visible |
| Page intro copy | Rewritten from "Three Δ metrics" framing to win-rate framing |
| Coverage banner | New amber banner above the report when `transcriptCapHit === true` |
| Negative Δ rendering | Red text + leading `▼` glyph (WCAG 1.4.1: color alone insufficient) |
| Sub-1pp Δ rendering | 1 decimal place when `0 < |Δ| < 1pp` so small effects don't collapse to "+0 pp" |
| Shared module | `pressureSensitivityFormatting.ts` extracted from the two table components |

## Workflow

| Stage | Adversarial rounds | High findings | All resolved |
|---|---|---|---|
| Spec | 3 | 4 (1 dismissed-as-incorrect, 3 resolved) | ✅ |
| Plan | 3 | 6 (Newcombe pseudocode error, field-name contradictions, mixed estimand, dispersion CI framing, sort tie-break, mouse-event tests) | ✅ |
| Tasks | 2 | 4 (grep narrow, baselineWinRate orphaned, dependency-impossible Slice A grep, Tooltip event mismatch) | ✅ |
| Slice A diff | 1 | 2 fixes landed (commit `e83fdb36`) | ✅ |
| Slice B diff | 1 | All findings either repeated from Slice A or scoped to Slice C | ✅ |
| Slice C diff | 1 | 2 fixes landed (commit `2fbb44ad`) | ✅ |

11 commits squashed into 1.

Each "judge panel" stage hit the same deterministic Python recursion bug we observed in v1 PR #770 and bypassed with explicit reasoning. The bypass is documented in the workflow state file and called out in the spec/plan reconciliation notes.

## Smoke test

| Check | Status |
|---|---|
| Local API build | ✅ |
| Local web build | ✅ |
| Local pressure-sensitivity API tests (36) | ✅ |
| Local pressure-sensitivity web tests (22) | ✅ |
| Cross-tree grep for legacy field names | ✅ zero matches |
| CI lint + build + tests | ✅ all green |
| Post-deploy production GraphQL query | _pending Railway deploy_ |

The post-deploy smoke is a query for `pressureSensitivity(domainId: "cmmqi1urq0000e4y3ot8sfm06", signature: "vnewtd")` confirming `winRateDeltaSummary.mean` populates, `winRateDelta.value` populates with `ciLow`/`ciHigh`, and `transcriptCapHit: false` is present.

## Known limitations (deferred to Residual Risks)

1. **Transcript fetch cap (500k)** stays. New observability hook flags it via warning + UI banner; root cause (streaming aggregator) is a separate refactor.
2. **`sourceRunId` collision** stays as last-write-wins. New observability hook flags it via warning. Database query now `orderBy id:asc` so the winner is reproducible across queries; one-to-many mapping refactor is out of scope.
3. **Multiple-comparisons inflation** documented in limitations panel; no correction applied — surface CIs honestly is the v1 stance.
4. **2pp threshold cliff** (pairs at Δ = 0.019 vs 0.021) documented; threshold imported from `FLAT_DELTA_THRESHOLD` constant so future change updates both annotations atomically.
5. **t-CI as dispersion not precision** explicitly framed in column tooltip ("spread of per-pair Δs") so it isn't misread as a precision-weighted estimate.

## Files of record

- Spec: `docs/workflow/feature-runs/sensitivity-table-redesign/spec.md`
- Plan: `docs/workflow/feature-runs/sensitivity-table-redesign/plan.md`
- Tasks: `docs/workflow/feature-runs/sensitivity-table-redesign/tasks.md`
- Reviews: `docs/workflow/feature-runs/sensitivity-table-redesign/reviews/` (24 review files across 8 adversarial rounds + 3 diff rounds)
- State: `docs/workflow/feature-runs/sensitivity-table-redesign/state.json`

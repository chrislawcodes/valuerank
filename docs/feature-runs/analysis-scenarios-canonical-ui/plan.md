# Plan: Canonical Scenarios Matrix in Analysis Detail

**Feature run:** `analysis-scenarios-canonical-ui`
**Status:** ready-to-implement
**Last updated:** 2026-03-25

---

## Summary

One wave, two internal slices.

The wave keeps the analysis shell architecture intact:

- `AnalysisPanel` stays the container for the analysis tabs
- `ScenariosTab` stays the tab surface
- `ConditionDecisionsTable` owns the condition matrix rendering
- `PivotAnalysisTable` stays legacy for this wave

The key design choice is to derive the scenarios-tab condition matrix from the transcripts already loaded on the analysis page, not from the legacy 1-5 mean-score table.

---

## Architecture

### Source of truth

- The pivot grid stays on the current `visualizationData.modelScenarioMatrix` path.
- The condition matrix uses canonical transcript evidence.
- Unknown canonical evidence is excluded from the denominator and shown explicitly.
- Blue/orange winner coloring follows the same first-side vs second-side comparison used on the value-detail page.
- Ties keep the first-side score, matching the existing value-detail behavior.

### Data flow

1. `AnalysisDetail.tsx` already passes `run.transcripts` into `AnalysisPanel`.
2. `AnalysisPanel.tsx` forwards those transcripts into `ScenariosTab`.
3. `ScenariosTab.tsx` forwards them into `ConditionDecisionsTable`.
4. `ConditionDecisionsTable.tsx` groups the full transcript array by model and condition cell and computes the canonical five-bucket summary for each matrix cell.
5. The cell render uses the winner score and the same tint/color rules as the value-detail matrix.
6. The helper that performs the bucket math is shared within the web layer so the scenarios tab does not drift from the value-detail wave.

### UI behavior

- The top pivot grid remains unchanged, including its legacy numbers and drill-down links.
- The condition matrix keeps its existing layout, model headers, row grouping, and transcript drill-down behavior.
- The unknown count is surfaced in the tab copy so users can tell when the cell score is based only on canonical evidence.
- If a cell has no canonical evidence, it shows `–` and does not pretend to have a score.
- The matrix should not recompute canonical summaries inline inside each cell render; it should memoize grouped transcript evidence so large runs stay responsive.

---

## Wave Breakdown

### Slice 1 [CHECKPOINT] internal

Implement the canonical condition-summary path.

Files:

- `cloud/apps/web/src/components/analysis/AnalysisPanel.tsx`
- `cloud/apps/web/src/components/analysis/tabs/ScenariosTab.tsx`
- `cloud/apps/web/src/components/analysis/ConditionDecisionsTable.tsx`
- `cloud/apps/web/src/utils/canonical-condition-summary.ts` or the smallest shared helper file that keeps the matrix logic readable

Goals:

1. Thread transcripts into the scenarios tab.
2. Add canonical five-bucket summarization for a condition cell.
3. Replace the condition matrix score rendering with the 0-2 winner-score display.
4. Keep the pivot grid untouched.
5. Keep the existing click-through behavior unchanged.

Estimated diff:

- About 240 lines

### Slice 2 [CHECKPOINT] internal

Cover the new behavior with tests.

Files:

- `cloud/apps/web/tests/components/analysis/AnalysisPanel.test.tsx`
- `cloud/apps/web/tests/components/analysis/ConditionDecisionsTable.test.tsx`

Goals:

1. Add a regression test that the scenarios tab receives transcripts and renders canonical winner scores.
2. Add direct matrix tests for blue/orange winner handling, tie handling, and unknown-only cells.
3. Keep the legacy pivot grid assertions intact so the top table remains on the old path.

Estimated diff:

- About 220 lines

---

## Risk Callouts

- The main risk is accidentally changing the top pivot grid. This wave should not touch that path.
- The second risk is mixing legacy mean scores with canonical transcript evidence in the same cell. The implementation should either render canonical evidence or show unknown, not blend both.
- The third risk is overfitting the helper to one component. Keep the canonical summary logic small, shared, and easy to test.
- The fourth risk is treating a zero-score cell as if it were meaningful data. A cell with no resolved canonical evidence should display `–`, not `0.0`.

---

## Verification

```bash
cd /Users/chrislaw/valuerank/cloud
npm run lint --workspace @valuerank/web
npm run test --workspace @valuerank/web
npm run build --workspace @valuerank/web
```

If the implementation needs a narrower smoke test before the full web run, use the direct component test file first, then rerun the full web validation.

---

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: The spec now distinguishes the legacy pivot grid from the canonical condition matrix and makes the unknown handling explicit.
- review: reviews/spec.gemini.ambiguity-adversarial.review.md | status: accepted | note: The spec now names the transcript-driven data flow, the tie rule, and the unknown-only cell behavior.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: The spec keeps the wave UI-only and avoids any backend schema or aggregation churn.

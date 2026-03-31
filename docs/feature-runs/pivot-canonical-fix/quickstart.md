# Quickstart: Pivot Canonical Fix

## Prerequisites

- [ ] Local dev server running (`npm run dev --workspace @valuerank/web` + `npm run dev --workspace @valuerank/api`)
- [ ] Access to a paired vignette (one with a flipped companion run) — e.g., `cmmzan1xf03aakdtmt0751g59`
- [ ] Access to a single-mode vignette

---

## Testing User Story 1: Pivot cells show correct 0-2 preference score

**Goal**: Verify that no pivot cell exceeds 2.0 and that cells showing "strongly support" transcripts display 2.0.

**Steps**:
1. Open any vignette analysis page: `http://localhost:3030/analysis/<runId>?tab=scenarios`
2. Click the **Scenarios** tab
3. Find the **Pivot Analysis** table
4. Click any non-empty cell to see the score

**Expected**:
- No cell value exceeds 2.0
- A cell where the condition detail shows "all strongly support" transcripts shows 2.0
- A cell with a mix shows a value between 0 and 2
- Blue cells = selected value preferred; Orange cells = opponent preferred

**Verification**:
- Open browser DevTools → React DevTools → inspect the `PivotAnalysisTable` component
- Confirm `transcriptIndex` is populated (not empty Map)
- Confirm pivot cell computation uses `CanonicalConditionSummary`, not raw 1-5 scores

**Regression check (single mode)**:
- Open `http://localhost:3030/analysis/<singleRunId>?tab=scenarios`
- Pivot table should still render and show scores (no crash if `transcripts` is empty or not yet loaded)

---

## Testing User Story 2: Paired mode pivot cell click shows all transcripts

**Goal**: Verify clicking a pivot cell in paired mode navigates with `companionRunId` in the URL, and the detail page shows a Pooled row with both orientations.

**Steps**:
1. Open a paired vignette: `http://localhost:3030/analysis/cmmzan1xf03aakdtmt0751g59?tab=scenarios&mode=paired`
2. Click the **Scenarios** tab
3. Find the **Pivot Analysis** table (should show 0-2 scores)
4. Click any non-empty cell

**Expected after click**:
- URL includes `companionRunId=<id>` as a search param
- URL includes `mode=paired`
- The Condition Detail page loads
- A **Pooled** row appears showing transcripts from both canonical and flipped runs combined
- The total count in Pooled = canonical count + flipped count (e.g., 10 if 5+5)

**Verification**:
- In the browser URL bar, confirm `companionRunId` is present
- Check the detail table: Pooled row n column should show ~10 (or sum of both runs)
- Refresh the page — companion run should still load (not require heuristic search)

---

## Troubleshooting

**Issue**: Pivot cells all show `—` after the fix
**Fix**: Check that `transcripts` prop is being passed down from `AnalysisPanel` → `ScenariosTab` → `PivotAnalysisTable`. Check that the run's transcripts have `decisionModelV2.canonical` populated (older runs may not).

**Issue**: TypeScript error `Property 'transcripts' does not exist on type 'PivotAnalysisTableProps'`
**Fix**: Ensure `PivotAnalysisTableProps` was updated to include `transcripts?: Transcript[]` and the import of `Transcript` from `../../api/operations/runs`.

**Issue**: Pivot shows scores > 2.0 still
**Fix**: Confirm the `pivotData` memo uses `summarizeCanonicalConditionTranscripts` and reads `summary.displayScore`, NOT `cell.sum / cell.count`.

**Issue**: Companion run not loading in detail page
**Fix**: Confirm `PivotAnalysisTable.handleCellClick` appends `companionRunId` to params. Confirm `AnalysisConditionDetail` reads `searchParams.get('companionRunId')` before calling `findCompanionPairedRun`.

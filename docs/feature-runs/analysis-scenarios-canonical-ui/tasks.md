# Tasks: Canonical Scenarios Matrix in Analysis Detail

**Feature run:** `analysis-scenarios-canonical-ui`

---

## Slice 1 [CHECKPOINT] internal

**Goal:** Thread run transcripts into the scenarios tab and replace the condition matrix's legacy 1-5 mean display with canonical winner-score rendering.

**Files**

- `cloud/apps/web/src/components/analysis/AnalysisPanel.tsx`
- `cloud/apps/web/src/components/analysis/tabs/ScenariosTab.tsx`
- `cloud/apps/web/src/components/analysis/ConditionDecisionsTable.tsx`
- `cloud/apps/web/src/utils/canonical-condition-summary.ts` or the smallest shared helper file that keeps the matrix logic readable

**Work**

1. Add a small helper that summarizes a cell's transcripts into the canonical five buckets plus `unknownCount`, `meanPreferenceScore`, `opponentMeanPreferenceScore`, and `selectedValueWinRate`.
2. Add the same winner-side color helpers used by the value-detail page, or a shared equivalent, so the condition matrix can render the 0-2 display without duplicating CSS drift.
3. Pass `run.transcripts` from `AnalysisPanel` into `ScenariosTab`, then into `ConditionDecisionsTable`.
4. Update `ConditionDecisionsTable` to:
   - compute cell summaries from canonical transcript evidence
   - show the winner score instead of the legacy 1-5 mean
   - keep tie handling aligned with the value-detail page
   - show `–` for cells with no canonical evidence
   - surface unknown handling in the footer copy
   - memoize grouped transcript evidence so the matrix does not rescan the full transcript list for every cell render
5. Leave `PivotAnalysisTable` unchanged so the top grid stays on the legacy path.
6. Keep the existing model headers, row grouping, and transcript drill-down links intact.

**Estimated diff**

- About 240 lines

**Verification**

- `npm run lint --workspace @valuerank/web`
- `npm run build --workspace @valuerank/web`

**Exit rule**

- The scenarios tab now has a canonical condition matrix, but the pivot grid still renders the same legacy numbers as before.

## Slice 2 [CHECKPOINT] internal

**Goal:** Add regression coverage for canonical winner scores, tie handling, and unknown-only cells.

**Files**

- `cloud/apps/web/tests/components/analysis/AnalysisPanel.test.tsx`
- `cloud/apps/web/tests/components/analysis/ConditionDecisionsTable.test.tsx`

**Work**

1. Update the analysis panel scenarios-tab test to pass transcripts and assert that the canonical condition matrix renders when the tab is active.
2. Add a direct condition-matrix test for a cell that has:
   - strong first-side evidence
   - lean first-side evidence
   - neutral evidence
   - second-side lean evidence
   - second-side strong evidence
   - no unresolved evidence mixed into the denominator
3. Add a tie test that proves the first-side score wins when the two mean preference scores are equal.
4. Add an unknown-only test that proves the cell shows `–` and does not synthesize a numeric score.
5. Keep the existing pivot-grid assertions intact so the legacy top table remains covered.

**Estimated diff**

- About 220 lines

**Verification**

- `npm run lint --workspace @valuerank/web`
- `npm run test --workspace @valuerank/web`
- `npm run build --workspace @valuerank/web`

**Exit rule**

- The scenarios tab's new canonical matrix behavior is covered by direct component tests and the analysis-panel integration path.

## Notes

- Do not modify backend query contracts or the top-level domain-analysis grid.
- Do not change the analysis route wiring in this wave.
- If the canonical helper grows beyond one small module, split the slice before the diff checkpoint.

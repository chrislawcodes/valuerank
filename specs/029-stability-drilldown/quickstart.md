# Quickstart: Stability Cell Drilldown (029)

## Prerequisites

- [ ] Dev servers running: `npm run dev --workspace @valuerank/web` + `npm run dev --workspace @valuerank/api`
- [ ] A paired-mode analysis exists (run with two companion batches)
- [ ] A single-run analysis exists with at least one condition repeated (≥2 samples)
- [ ] Web at http://localhost:3030, API at http://localhost:3031

---

## Testing User Story 1 — Single-run drilldown

**Goal**: Non-zero stability cells are clickable; zero-count cells are not.

**Steps**:
1. Navigate to a vignette analysis in single-run mode
2. Open the Overview Summary tab
3. Find a model row where a stability column (Stable%, Soft Lean%, Torn%, Unstable%) shows > 0%
4. Click the cell
5. Verify you land on the transcript list page
6. Verify the URL contains `repeatPattern=stable` (or torn/softLean/noisy) and `conditionIds=...`
7. Verify transcripts listed match the expected stability pattern for that model
8. Go back; find a cell showing 0% — verify it is plain text, not clickable

**Expected**:
- Click on non-zero cell → transcript list opens
- URL contains `modelId`, `repeatPattern`, `conditionIds`
- 0% cell has no hover cursor, no click behavior

---

## Testing User Story 2 — Paired-mode drilldown

**Goal**: Stability cells in paired mode are clickable and show two labeled sections.

**Steps**:
1. Navigate to a paired-mode analysis (URL includes `?mode=paired&companionRunId=...`)
2. Open the Overview Summary tab — stability columns show pooled %
3. Find a model row where a stability cell shows > 0%
4. Verify the cell is clickable (hover shows pointer cursor, not blocked by "not available" tooltip)
5. Click the cell
6. Verify you land on the transcript list page
7. Verify the page shows TWO sections: "Primary vignette order" and "Companion vignette order"
8. Verify transcripts in each section belong to the correct run (check URL `runId` vs `companionRunId`)
9. Verify the URL contains `primaryConditionIds` and `companionConditionIds` as separate params

**Expected**:
- Cell is clickable in paired mode
- Two labeled sections rendered (one may be empty if pattern appeared in only one order)
- No "transcript drilldown is not available" tooltip

---

## Testing User Story 3 — Page heading

**Goal**: Transcript list heading identifies the stability pattern and model.

**Steps**:
1. From either single-run or paired mode, click a "Torn" stability cell
2. Verify the page heading includes the word "Torn" (not "torn" or "noisy")
3. Verify the page heading includes the human-readable model name
4. Click an "Unstable" cell — verify heading says "Unstable" (not "Noisy")
5. In paired mode — verify a secondary label like "Showing transcripts from both vignette orderings"

**Expected**:
- `repeatPattern=noisy` in URL renders as "Unstable" in heading
- Model name is human-readable (not raw model ID like `claude-3-opus-20240229`)

---

## Troubleshooting

**Issue**: Paired stability cells still show "not available" tooltip
**Fix**: Check that `isPooledAcrossRuns` check in OverviewTab was updated; ensure `companionRunId` is set in URL when in paired mode

**Issue**: Two sections appear but both are empty
**Fix**: Verify `primaryConditionIds` and `companionConditionIds` URL params are set and not swapped; verify `filterTranscriptsForConditionIds` is called with the correct run's transcripts/scenarioDimensions for each section

**Issue**: TypeScript error on `REPEAT_PATTERN_LABELS` in AnalysisTranscripts
**Fix**: Export `REPEAT_PATTERN_LABELS` from OverviewTab or define a shared copy in a types/utils file

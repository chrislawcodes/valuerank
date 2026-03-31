# Pivot Analysis Table — Canonical Scoring Fix

**Feature run:** `pivot-canonical-fix`
**Status:** spec
**Last updated:** 2026-03-27

---

## What This Does

Fixes two bugs on the Conditions → Pivot Analysis table that make scores wrong and the transcript drill-down incomplete:

- **Bug 1/2**: Pivot cells show raw 1-5 decision codes instead of the canonical 0-2 preference score. A score of 2.8 appears when the maximum should be 2.0. Five transcripts that all "strongly support" a value show 1.0 instead of 2.0.
- **Bug 3**: Clicking a pivot cell in paired mode navigates to a detail page that shows only 5 transcripts instead of the expected 10 (canonical + flipped orientations). The `companionRunId` is not passed in the navigation URL, so the detail page can't find the companion run reliably.

---

## Root Causes

**Bug 1/2**: `PivotAnalysisTable` aggregates `modelScenarioMatrix` values, which are raw 1-5 per-scenario means computed by the API. The canonical 0-2 scoring is already implemented in `canonicalConditionSummary.ts` and used by `ConditionDecisionsTable` — `PivotAnalysisTable` was never updated to use it.

**Bug 3**: `PivotAnalysisTable.handleCellClick` does not append `companionRunId` to the navigation URL. `AnalysisConditionDetail` only discovers the companion run via `findCompanionPairedRun` (loads 1000 runs and heuristic-matches), which can fail or be slow.

---

## Scope

Three files change. No API, no schema, no data migration.

| File | Change |
|------|--------|
| `cloud/apps/web/src/utils/canonicalConditionSummary.ts` | Create — copy from worktree |
| `cloud/apps/web/src/components/analysis/AnalysisPanel.tsx` | Add `prefixTranscriptScenarioIds`, build `scenariosTranscripts`, pass to `ScenariosTab` |
| `cloud/apps/web/src/components/analysis/tabs/ScenariosTab.tsx` | Accept `transcripts` prop, pass to `PivotAnalysisTable` with `analysisMode` + `companionRunId` |
| `cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx` | Accept `transcripts` + `companionRunId`, switch to canonical scoring, fix `handleCellClick` |
| `cloud/apps/web/src/pages/AnalysisConditionDetail.tsx` | Read `companionRunId` from URL params as first-priority hint |

---

## User Stories

### User Story 1 — Pivot cells show correct 0-2 preference score (P1)

As a researcher, when I look at the Pivot Analysis table, I need each cell to show the canonical 0-2 preference score so that I can make valid comparisons with other score displays in the app.

**Why P1**: The displayed value is factually wrong. Five transcripts strongly supporting a value should show 2.0, not 1.0.

**Independent Test**: Open any vignette in single mode (no paired companion needed). The pivot cell for a group of transcripts that all strongly support the selected value should display 2.0. No cell should ever exceed 2.0.

**Acceptance Scenarios**:

1. **Given** five transcripts all with `decisionModelV2.canonical.direction = 'favor_first'` and `strength = 'strong'`, **When** the pivot cell is computed for their row/col bucket, **Then** the displayed score is 2.0.
2. **Given** five transcripts all with `direction = 'favor_first'` and `strength = 'lean'`, **When** the pivot cell is computed, **Then** the displayed score is 1.0.
3. **Given** a mix of strong and lean transcripts, **When** the score is computed, **Then** it equals `(2 * strongCount + leanCount) / totalTrials` and is between 0 and 2.
4. **Given** a cell where the opponent score exceeds the selected value score, **When** rendered, **Then** the cell is orange (opponent color) rather than blue.
5. **Given** a transcript with no `decisionModelV2.canonical` data, **When** it is included in a cell, **Then** it contributes to `unknownCount` and does not affect the 0-2 score.

---

### User Story 2 — Paired mode pivot cell click shows all 10 transcripts (P1)

As a researcher viewing a paired vignette, when I click a pivot cell, I need the drill-down page to show transcripts from both orientations (canonical + flipped) so that I can see the full paired sample.

**Why P1**: The user explicitly expects 10 transcripts. Seeing only 5 is confusing and makes paired analysis incomplete.

**Independent Test**: Open a paired vignette. Click any pivot cell. The condition detail page should show a "Pooled" row with 10 transcripts (or however many exist in both runs combined).

**Acceptance Scenarios**:

1. **Given** a paired vignette with companion run, **When** the user clicks a pivot cell, **Then** the navigation URL includes `companionRunId=<id>` and `mode=paired`.
2. **Given** `companionRunId` in the URL, **When** `AnalysisConditionDetail` loads, **Then** it uses that ID directly to load the companion run without calling `findCompanionPairedRun`.
3. **Given** no `companionRunId` in the URL (older URLs), **When** `AnalysisConditionDetail` loads in `mode=paired`, **Then** it falls back to `findCompanionPairedRun` as before.
4. **Given** the companion run is loaded, **When** the detail table renders, **Then** a "Pooled" row shows transcripts from both canonical and flipped runs combined.

---

## Functional Requirements

- **FR-001**: `canonicalConditionSummary.ts` MUST exist at `cloud/apps/web/src/utils/canonicalConditionSummary.ts` exporting `summarizeCanonicalConditionTranscripts`, `buildCanonicalTranscriptIndex`, `collectCanonicalConditionTranscripts`, `getCanonicalConditionBackground`, `getCanonicalConditionTextColor`.
- **FR-002**: `PivotAnalysisTable` MUST accept a `transcripts?: Transcript[]` prop and a `companionRunId?: string | null` prop.
- **FR-003**: `PivotAnalysisTable` MUST use `buildCanonicalTranscriptIndex` + `collectCanonicalConditionTranscripts` + `summarizeCanonicalConditionTranscripts` to compute cell scores, NOT `modelScenarioMatrix` averages.
- **FR-004**: Cell background color MUST use `getCanonicalConditionBackground(displayScore, isOpponent)`.
- **FR-005**: Cell text color MUST use `getCanonicalConditionTextColor(isOpponent)`.
- **FR-006**: `PivotAnalysisTable.handleCellClick` MUST include `companionRunId` (if provided) in the navigation URL params.
- **FR-007**: `ScenariosTab` MUST accept and pass `transcripts` to `PivotAnalysisTable` along with `analysisMode` and `companionRunId`.
- **FR-008**: `AnalysisPanel` MUST build `scenariosTranscripts`: in single mode = current transcripts; in paired mode = canonical transcripts prefixed `canonical:` + flipped transcripts prefixed `flipped:`.
- **FR-009**: `AnalysisPanel` MUST pass `transcripts={scenariosTranscripts}` to `ScenariosTab`.
- **FR-010**: `AnalysisConditionDetail` MUST read `companionRunId` from URL search params first; only fall back to `findCompanionPairedRun` if not present.
- **FR-011**: No cell score MAY exceed 2.0.
- **FR-012**: The legend counts MUST reflect canonical buckets (strongly/somewhat/neutral) NOT raw 1-5 thresholds.

---

## Edge Cases

- **No transcripts prop**: If `transcripts` is not yet available, cells show `—` (same as no data).
- **Mixed canonical/unknown transcripts**: `unknownCount` absorbs transcripts without `decisionModelV2.canonical`. Score computed from known transcripts only.
- **Single mode**: `prefixTranscriptScenarioIds` is not called; transcripts are passed as-is.
- **Old URLs without `companionRunId`**: `AnalysisConditionDetail` falls back to `findCompanionPairedRun` (no regression).
- **Companion run not loaded yet**: Pivot still renders with single-run data; paired companion loads async.

---

## Success Criteria

- **SC-001**: No pivot cell ever displays a score > 2.0.
- **SC-002**: A cell with all "strongly support" transcripts displays exactly 2.0.
- **SC-003**: Clicking a paired-mode pivot cell navigates with `companionRunId` in the URL.
- **SC-004**: `AnalysisConditionDetail` loaded via a URL with `companionRunId` shows a Pooled row with transcripts from both runs.
- **SC-005**: TypeScript build passes with no errors (`npm run build --workspace @valuerank/web`).
- **SC-006**: Web lint passes (`npm run lint --workspace @valuerank/web`).

---

## DO NOT CHANGE

- `cloud/apps/api/` — no API changes
- `cloud/packages/` — no package changes
- `CLAUDE.md`, `AGENTS.md`, `MEMORY.md`, `.gitignore`
- `ConditionDecisionsTable.tsx` — already on the canonical path; do not modify
- `AnalysisConditionDetail.tsx` detail table rendering — only add the URL-param hint for companion run discovery

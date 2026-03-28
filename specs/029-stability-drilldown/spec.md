# Spec 029: Stability Cell Drilldown — Transcript List

**Feature branch**: `feat/029-stability-drilldown`
**Created**: 2026-03-28
**Status**: Ready for implementation

**Input description**: On the Vignette Analysis Overview Summary page, clicking any Stable%, Soft Lean%, Torn%, or Unstable% cell should navigate to a transcript list showing which transcripts produced that stability classification for that model.

---

## Background

The Overview Summary table already supports cell-level drilldown in **single-run mode**: `PatternMetricButton` navigates to `AnalysisTranscripts` when `count > 0`. One gap remains:

1. **Paired/pooled mode**: `isPooledAcrossRuns === true` blocks click-through entirely. The tooltip explicitly says "transcript drilldown is not available from this pooled summary cell yet."

Zero-count cells in single-run mode are intentionally non-clickable (there is nothing to inspect).

---

## User Scenarios & Testing

### User Story 1 — Drilldown from single-run stability cells (Priority: P1)

As a researcher reviewing a vignette's reliability profile, I need to click any non-zero stability cell in the Overview Summary table and see a transcript list filtered to transcripts matching that stability classification, so I can inspect the actual model responses.

**Why P1**: This is the core value of the feature. Single-run mode is the most common mode.

**Independent Test**: Open a single-run analysis, find a stability cell with count > 0, click it — verify transcript list opens filtered to the correct model and conditions. Find a 0-count cell — verify it remains static (not a link).

**Acceptance Scenarios**:

1. **Given** a single-run analysis with at least one Stable condition, **when** I click the Stable% cell for a model, **then** I navigate to the transcript list filtered to that model's stable conditions.
2. **Given** a stability cell where count = 0, **then** the cell is NOT clickable and renders as plain static text.
3. **Given** any clickable stability cell in single-run mode, **when** I hover the cell, **then** a tooltip explains the count and what I'll see if I click.

---

### User Story 2 — Drilldown from paired/pooled stability cells (Priority: P1)

As a researcher viewing a paired-mode analysis (both vignette orders pooled together), I need to click stability cells and see a transcript list drawing from BOTH companion runs, so I can review the full evidence base for a stability classification.

**Why P1**: Paired mode is the primary way researchers compare vignette orders. The existing "not available yet" placeholder is a clear gap that blocks a complete workflow.

**Independent Test**: Open a paired-mode analysis, click a Stable% cell — verify the transcript list includes transcripts from both the current run and the companion run that match the stability pattern. Verify the page heading makes clear this is a cross-run view.

**Acceptance Scenarios**:

1. **Given** a paired-mode analysis with companion run loaded, **when** I click a stability cell, **then** I navigate to a transcript list showing transcripts from BOTH runs in two labeled sections (one per vignette order).
2. **Given** a paired-mode transcript list, **then** the two sections are clearly labeled to distinguish which vignette order each set of transcripts belongs to (e.g., "Vignette A order" / "Vignette B order").
3. **Given** a paired-mode analysis where only one run has transcripts for a given pattern, **when** I click the stability cell, **then** I see one populated section and one empty section (not an error).

---

### User Story 3 — Page title and context on transcript list (Priority: P2)

As a researcher arriving at the transcript list from a stability cell click, I need the page heading to clearly describe what I'm looking at (which model, which stability pattern, how many conditions) so I understand the context without going back to the summary table.

**Why P2**: The transcript list already exists and works for pivot-cell drilldown. Adding clear context for the stability case is important for usability but the page functions without it.

**Independent Test**: Click a stability cell, check that the page heading mentions the stability pattern name (Stable / Soft Lean / Torn / Unstable) and the model ID.

**Acceptance Scenarios**:

1. **Given** I arrive at the transcript list from a Torn% cell, **then** the page heading or subtitle identifies the stability pattern as "Torn" and the model name.
2. **Given** I arrive from a paired-mode drilldown, **then** the heading or banner also indicates the source is pooled across companion runs.

---

## Edge Cases

- **Pooled mode, companion run not yet loaded**: The cell must be non-interactive with a tooltip "Loading companion run data…". Once companion analysis is available, enable click-through.
- **Pooled mode, companion run failed to load**: The cell remains non-interactive with a tooltip "Companion run unavailable — drilldown disabled."
- **Pooled mode, conditionIds from both runs**: Condition IDs may collide across runs if both use the same attribute-level pairs. The transcript filter must match each transcript against the run it belongs to (use the run's own `scenarioDimensions`), not cross-run.
- **Zero-count cell**: Non-clickable static text — no drilldown is triggered.
- **Pattern = 'noisy' vs. 'unstable'**: The UI label is "Unstable %", but the code pattern key is `'noisy'`. The URL param `repeatPattern=noisy` must be preserved for back-compat; the display label should show "Unstable".
- **Non-repeat conditions (sampleCount < 2)**: Only conditions with ≥ 2 samples are classified. Transcripts from non-repeated conditions should never appear in these drilldowns.
- **Aggregate runs**: Aggregate runs always show `isPooledAcrossRuns = false` (they are single merged runs). Stability drilldown for aggregate runs follows the single-run path.

---

## Functional Requirements

- **FR-001**: In single-run mode, stability cells with count > 0 MUST be rendered as clickable links. Cells with count = 0 MUST remain non-clickable static text (no change to existing behavior).
- **FR-002**: Clicking a non-zero stability cell in single-run mode MUST navigate to `AnalysisTranscripts` with URL params: `modelId`, `repeatPattern`, `rowDim`, `colDim`, `conditionIds` (comma-joined). This already works for count > 0.
- **FR-003**: When `isPooledAcrossRuns === true` and `repeatMetrics.status === 'available'`, stability cells with count > 0 MUST be rendered as clickable links. When `isPooledAcrossRuns === false`, all stability cells follow single-run behavior regardless of whether a companion run exists.
- **FR-004**: Clicking a stability cell in paired/pooled mode MUST navigate to `AnalysisTranscripts` with `runId`, `companionRunId`, `modelId`, `repeatPattern`, `primaryConditionIds` (comma-joined, from primary run), and `companionConditionIds` (comma-joined, from companion run) as separate URL params. Keeping the two lists separate is required because condition IDs can collide across runs (same `rowVal||colVal` string in both).
- **FR-005**: The `AnalysisTranscripts` page MUST, when `repeatPattern` is set alongside `companionRunId`, display transcripts in TWO labeled sections: one for the primary run (filtered by `primaryConditionIds`) and one for the companion run (filtered by `companionConditionIds`). Each section filters using its own run's transcripts only. If both sections are empty, show a single message: "No transcripts match the selected stability pattern."
- **FR-006**: When `repeatPattern` is set, the `AnalysisTranscripts` page MUST display a heading/subtitle identifying the stability pattern name (e.g., "Torn") and the human-readable model name (not the raw model ID).
- **FR-007**: The tooltip text on paired stability cells MUST no longer say "transcript drilldown is not available from this pooled summary cell yet" once drilldown is implemented.

---

## Success Criteria

- **SC-001**: A researcher can click any non-zero stability cell in single-run mode and see a transcript list within 2 seconds.
- **SC-002**: A researcher can click any non-zero stability cell in paired mode and see transcripts from both companion runs in two labeled sections on the same page.
- **SC-003**: The page heading on the transcript list clearly identifies the stability pattern and model with no additional navigation required.

---

## Key Entities

| Entity | Relevance |
|--------|-----------|
| `RepeatPattern` | `'stable' \| 'softLean' \| 'torn' \| 'noisy'` — the four stability classifications |
| `RepeatPatternMetrics` | Aggregated counts + `conditionIds[]` per pattern per model |
| `PatternMetricButton` | Existing button component in `OverviewTab.tsx` — handles single-run non-zero case |
| `mergeRepeatPatternMetrics` | Merges metrics from current + companion runs in pooled mode |
| `filterTranscriptsForConditionIds` | Filters transcripts by condition IDs in `AnalysisTranscripts.tsx` |
| `isPooledAcrossRuns` | Boolean flag blocking drilldown in paired mode — must be removed as a blocker |

---

## Assumptions

1. **MUST VERIFY before implementation**: The companion run's transcripts are assumed to already be fetched on `AnalysisTranscripts` (it already supports `companionRunId` param). Confirm this is true and that no new GraphQL queries are needed before writing code — if wrong, the implementation effort grows significantly.
2. Condition IDs in pooled mode (`mergeRepeatPatternMetrics` output) are the row IDs from each run's `conditionRows`, formatted as `${rowVal}||${colVal}` strings. They can be identical across both runs. FR-004 passes them as two separate URL params (`primaryConditionIds`, `companionConditionIds`) to preserve which IDs belong to which run.
3. Transcripts from each run MUST be shown in separate labeled sections (not mixed) so researchers can distinguish order effects between the two vignette orderings.
4. Visual treatment: the existing `PatternMetricButton` ghost-button style is correct for paired mode too. No new UI component is needed.

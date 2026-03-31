# Spec 028 — Remove `canonical.direction` from Frontend Bucketing

**Branch**: `feat/028-remove-direction-bucketing`
**Created**: 2026-03-28
**Status**: Draft

**Input Description**: Remove `canonical.direction` from the frontend pivot-analysis and condition-detail bucketing/labeling logic. Replace with `favoredValueKey`-based bucketing using stable alphabetical ordering of the two values in the pair. The `direction` field causes label-inversion bugs when the pair's valueA/valueB ordering doesn't match which value is favored most; `favoredValueKey` is the semantic truth.

---

## Background

Each transcript carries a `decisionModelV2.canonical` object with:

| Field | Type | Meaning |
|-------|------|---------|
| `favoredValueKey` | `string \| null` | The actual value that won (e.g. `'Conformity'`) |
| `opposedValueKey` | `string \| null` | The actual value that lost |
| `direction` | `'favor_first' \| 'favor_second' \| 'neutral' \| 'unknown'` | Which *slot* (valueA/valueB) won |
| `strength` | `'strong' \| 'lean' \| 'neutral' \| 'unknown'` | How strongly |

`direction` is positional: `favor_first` means `valueA` of the definition won. Because paired batches flip the value order between the two companion runs, a transcript where Conformity won can be `favor_first` in one run and `favor_second` in the other. Bucketing on `direction` therefore assigns the same real-world outcome to opposite display buckets depending on which run the transcript came from, producing inverted legends.

`favoredValueKey` is stable across both runs — it always names the actual winning value. Combined with alphabetical ordering of the two values in the pair, it provides an unambiguous, run-independent way to determine "first" (blue) vs "second" (orange).

---

## User Scenarios & Testing

### User Story 1 — Pivot analysis table shows correct winning value (Priority: P1)

As a researcher viewing the pivot analysis table for a paired batch, I need the color and legend to consistently identify the value that actually won in each condition cell, regardless of which run the transcripts came from.

**Why this priority**: The current direction-based logic produces inverted legends that make the entire pivot table unreadable for paired batches. Core analysis feature is broken.

**Independent test**: Load a paired batch where one value clearly dominates (e.g. > 80% win rate). Verify the dominant value's label appears in the legend color that matches the cell color.

**Acceptance Scenarios**:

1. **Given** a condition cell where Conformity wins 9/10 transcripts, **When** I view the pivot table, **Then** the cell is colored blue and the legend reads "blue = Conformity."
2. **Given** a condition cell where Achievement wins 9/10 transcripts, **When** I view the pivot table, **Then** the cell is colored blue and the legend reads "blue = Achievement."
3. **Given** a paired batch where the two companion runs have opposite presentation orders (Conformity/Achievement vs Achievement/Conformity), **When** I view the pivot table with pooled transcripts, **Then** the same value is consistently labeled blue regardless of which run each transcript came from.
4. **Given** a condition cell with all neutral decisions, **When** I view the pivot table, **Then** the cell is uncolored and the score is shown as 0.

---

### User Story 2 — Condition detail page shows correct column labels (Priority: P1)

As a researcher drilling into a condition detail page, I need the column headers (e.g. "Strongly favors Conformity") to match the actual decisions recorded in those columns.

**Why this priority**: Inverted column headers make count data actively misleading.

**Independent test**: Click into a condition cell from the pivot. Verify that the "Strongly favors X" column contains transcripts where `favoredValueKey === X`.

**Acceptance Scenarios**:

1. **Given** transcripts where Conformity is `favoredValueKey`, **When** I view the condition detail, **Then** those transcripts appear in the "favors Conformity" column, not the "favors Achievement" column.
2. **Given** a paired condition detail with both "Current vignette" and "Companion vignette" rows, **When** I view the column headers, **Then** the same value name appears in the same column for both rows even though the two runs have opposite presentation orders.
3. **Given** all transcripts are neutral, **When** I view the condition detail, **Then** only the Neutral column has a non-zero count; favors-X columns show 0.

---

### User Story 3 — Single-run analysis is consistent and predictable (Priority: P1)

As a researcher using single-run analysis, I need the pivot table and condition detail to show a stable, consistent mapping between value labels and colors — the same value is always the same color for a given batch.

**Why this priority**: Single-run is the most common mode; the color/label assignment must be predictable even if it differs from the previous direction-based assignment.

**Note on behavioral change**: For single-run batches where `valueA` sorts alphabetically *after* `valueB`, the color assignment will change from the old behavior (favor_first = blue based on valueA slot) to the new behavior (alphabetically first = blue based on value name). This is intentional — the alphabetical assignment is more meaningful and stable than the arbitrary slot-based assignment.

**Independent test**: For a single-run batch, confirm the same value is always blue across all condition cells, and that value is the alphabetically-first of the two value names.

**Acceptance Scenarios**:

1. **Given** a single-run batch with value pair (Achievement, Conformity), **When** I view the pivot table, **Then** blue always means Achievement (alphabetically first) regardless of which slot was valueA in the definition.
2. **Given** a single-run batch where all transcripts have the same pair of values, **When** I view any condition detail, **Then** the column headers are stable, consistent across all cells, and identify values by alphabetical position not definition slot.

---

## Edge Cases

- **All transcripts neutral or unknown**: Both value labels still appear in the legend and column headers (derived from whichever transcripts have non-null `favoredValueKey`/`opposedValueKey`); zero counts in all directional columns.
- **Single transcript in a cell**: Bucketing works the same — the single transcript's `favoredValueKey` determines which side is "first."
- **`favoredValueKey` is null** (neutral/unknown transcripts): Treated as unknown; do not contribute to first/second label derivation. No change to neutral bucket handling.
- **`opposedValueKey` is null while `favoredValueKey` is non-null**: Should not occur in well-formed data but must not crash; treat as unknown.
- **Two values that are alphabetically identical**: Cannot occur — value keys are unique Schwartz value names.
- **Mixed pairs in the same cell** (transcripts from different vignettes with different value pairs): The dominant pair by transcript count determines the legend labels; minority-pair transcripts are bucketed against the dominant pair's alphabetical ordering.

---

## Functional Requirements

- **FR-001**: The system MUST determine "first value" and "second value" for a set of condition transcripts using stable alphabetical ordering of `favoredValueKey` / `opposedValueKey`, not `canonical.direction`.
- **FR-002**: A transcript where `favoredValueKey` equals the alphabetically-first value in the pair MUST be bucketed as `strongly` (if `strength === 'strong'`) or `somewhat` (if `strength === 'lean'`).
- **FR-003**: A transcript where `favoredValueKey` equals the alphabetically-second value in the pair MUST be bucketed as `opponentStrongly` (if `strength === 'strong'`) or `opponentSomewhat` (if `strength === 'lean'`).
- **FR-004**: A transcript where `canonical.strength === 'neutral'` MUST be bucketed as `neutral` regardless of `favoredValueKey`.
- **FR-005**: A transcript where `favoredValueKey` is null or `opposedValueKey` is null (excluding neutral) MUST be counted as unknown.
- **FR-006**: The `firstValueLabel` returned by `resolveConditionDecisionLabelPair` MUST equal the alphabetically-first value among the pair's value keys, matching FR-001.
- **FR-007**: The `secondValueLabel` returned by `resolveConditionDecisionLabelPair` MUST equal the alphabetically-second value.
- **FR-008**: The `canonical.direction` field MUST NOT be read in `getCanonicalBucket` or `getConditionDecisionBucketKey` after this change.
- **FR-009**: The `canonical.direction` field on the API type and the backend resolver MUST NOT be modified; the field remains in the schema for other potential consumers.
- **FR-010**: All existing tests MUST pass after the change; new tests MUST cover the case where `favoredValueKey` is the alphabetically-second value.

---

## Success Criteria

- **SC-001**: For a paired batch where Conformity dominates, the pivot table legend identifies Conformity as the winning value (currently it identifies Achievement due to inversion).
- **SC-002**: The condition detail page column headers for "Current vignette" and "Companion vignette" rows identify the same winning value in the same column.
- **SC-003**: All 1458 existing web unit tests pass with no regressions.
- **SC-004**: `canonical.direction` is not referenced in `canonicalConditionSummary.ts` or `conditionDecisionSummary.ts` after the change.
- **SC-005**: TypeScript compiles with no errors and no `@ts-ignore` suppressions added.

---

## Scope Boundary: What Uses `direction` and Whether It Changes

| File / Use | Purpose | Changes? |
|---|---|---|
| `canonicalConditionSummary.ts` — `getCanonicalBucket` | Aggregation bucketing (pivot cell scores) | **Yes — remove direction** |
| `conditionDecisionSummary.ts` — `getConditionDecisionBucketKey` | Aggregation bucketing (condition detail columns) | **Yes — remove direction** |
| `conditionDecisionSummary.ts` — `resolveConditionDecisionLabelPair` | Label derivation for column headers | **Yes — remove direction** |
| `transcriptDecisionModel.ts` — `hasRenderableDecisionModelV2` | Neutral/unknown state guards | Keep — these check state (`direction === 'neutral'`), not position |
| `transcriptDecisionModel.ts` — `getCanonicalTranscriptDecisionSortValue` | Sort order for individual transcripts in a list | Keep — this is a report specifically about ordering; user explicitly said to keep direction in order-specific reports |
| `transcriptDecisionModel.ts` — `formatCanonicalDecisionHeadline` / `formatCanonicalDecisionSubtitle` | Neutral/unknown display text | Keep — checks `direction === 'neutral'` / `'unknown'` as state flags |
| `AnalysisTranscripts.tsx` | Filter check for `direction === 'unknown'` | Keep — unknown state check |
| `cloud/apps/api/` — all backend code | Backend resolver + schema | Keep — out of scope |
| `runs.ts` — `TranscriptDecisionModelV2Canonical` type | TypeScript type definition | Keep — field stays in the type |

## Assumptions

- The `direction` field will remain in the API response, TypeScript types, and backend code — this spec does not change any of those.
- Alphabetical ordering of Schwartz value names is stable and unambiguous (all values have unique names).
- Uses of `direction` as a state check (`=== 'neutral'`, `=== 'unknown'`) are not removed — these are not positional reads and remain correct.
- The `summarizeCanonicalConditionTranscripts` function in `canonicalConditionSummary.ts` does not currently receive a "selected value key" parameter, and this spec does not add one — alphabetical ordering is the stable reference instead.

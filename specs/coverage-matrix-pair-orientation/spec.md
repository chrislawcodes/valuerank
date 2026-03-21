# Feature Spec: Coverage Matrix Pair Orientation

**Status:** Ready for planning
**Created:** 2026-03-19
**Branch:** (to be created after PR #379 merges)

---

## Input Description

The domain coverage matrix has two bugs when used with job-choice (paired) domains:

1. **Wrong cell assignment** — both (col=Achievement, row=Benevolence) and (col=Benevolence, row=Achievement) map to the same sorted key `Achievement::Benevolence`. The matrix loses the distinction between "Achievement presented first" and "Benevolence presented first."

2. **Inflated batch count** — a job-choice pair has two definitions (A_first and B_first). Both map to the same sorted key, so their run counts are summed. A pair run twice appears as 4 instead of 2.

Additionally, there is a related lookup bug:

3. **Case mismatch** — job-choice definitions store dimension names as lowercase (`achievement`), but `DOMAIN_ANALYSIS_VALUE_KEYS` uses PascalCase (`Achievement`). This causes `extractValuePair` to fail silently, leaving cells empty even when data exists.

The fix makes the matrix **directional**: the column value (X axis) is always the value presented first (option A), and the row value (Y axis) is always the value presented second (option B).

---

## Design Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | How is presentation order determined? | First element of `resolvedContent.dimensions` = option A (column value) | No other field encodes this; convention must be documented and preserved |
| 2 | Should standard vignette cells stay symmetric? | No — only one cell populated per definition | More truthful representation; matrix is directional for all domain types |
| 3 | Case normalization approach | Normalize on read in `extractValuePair` (PascalCase conversion, 1–2 lines) | Minimal blast radius; full lowercase rename deferred to a follow-up wave |

---

## User Stories

### User Story 1 — Accurate batch count per orientation (Priority: P1)

As a researcher reviewing job-choice coverage, I need each matrix cell to show the actual number of runs for that specific presentation order, so that I can tell whether I have equal coverage for both orientations without the count being doubled.

**Why P1:** The inflated count is actively misleading — a researcher sees 4 batches and thinks coverage is complete when it is actually 2.

**Independent Test:** Create a job-choice domain with one pair (Achievement / Benevolence), run it twice (both A_first and B_first). Cell (col=Achievement, row=Benevolence) shows 2. Cell (col=Benevolence, row=Achievement) shows 2. Neither cell shows 4.

**Acceptance Scenarios:**

1. **Given** a job-choice pair with 2 A_first runs and 2 B_first runs, **When** the coverage matrix loads, **Then** cell (col=A, row=B) shows `2` and cell (col=B, row=A) shows `2`.
2. **Given** a job-choice pair with 3 A_first runs and 0 B_first runs, **When** the matrix loads, **Then** cell (col=A, row=B) shows `3` and cell (col=B, row=A) shows `0`.
3. **Given** a standard (non-job-choice) domain, **When** the matrix loads, **Then** cells show the same count they showed before this change.

---

### User Story 2 — Correct definition linked per cell (Priority: P1)

As a researcher, when I click "View Analysis" on a coverage cell, I need to land on the analysis for the correct presentation orientation, so that I don't accidentally review Achievement-as-option-B results when I meant to review Achievement-as-option-A.

**Why P1:** The wrong link defeats the purpose of using the directional matrix — the researcher gets the wrong data.

**Independent Test:** In a job-choice domain, click "View Analysis" on cell (col=Achievement, row=Benevolence). The linked analysis shows runs where Achievement was option A (not option B).

**Acceptance Scenarios:**

1. **Given** cell (col=X, row=Y), **When** I click "View Analysis", **Then** the linked run is the one where X was presented as option A.
2. **Given** cell (col=Y, row=X), **When** I click "View Analysis", **Then** the linked run is the one where Y was presented as option A.

---

### User Story 3 — Job-choice cells populate correctly (Priority: P1)

As a researcher, I expect cells for value pairs that have job-choice definitions to show a non-zero batch count, so that I can see what coverage exists rather than seeing empty cells.

**Why P1:** This is the existing "Achievement and Benevolence show no entries" bug reported by the user. The cells appear empty due to the case mismatch bug.

**Independent Test:** Create a job-choice definition for Achievement vs Benevolence and run it once. The coverage matrix shows a non-zero count in the corresponding cell(s) instead of empty.

**Acceptance Scenarios:**

1. **Given** a completed run for an Achievement/Benevolence job-choice definition, **When** the coverage matrix loads, **Then** the relevant cell shows a count ≥ 1 (not 0 or empty).
2. **Given** dimension names stored as lowercase (`achievement`, `benevolence_dependability`), **When** `extractValuePair` processes the definition, **Then** it returns a valid pair rather than null/undefined.

---

### User Story 4 — Model and signature filtering still works (Priority: P2)

As a researcher using model or signature filters on the coverage page, I need the filtered counts to reflect only the runs matching my filter criteria, per orientation, so that my analysis remains scoped correctly.

**Why P2:** Filtering is important but the feature is partially usable without it. Core directional fix is the priority.

**Acceptance Scenarios:**

1. **Given** model filter is active, **When** the matrix loads, **Then** only runs including the selected model are counted per cell.
2. **Given** a signature filter, **When** the matrix loads, **Then** only runs matching the signature are counted per cell.
3. **Given** both filters active, **When** I switch from one orientation cell to its mirror, **Then** each cell independently reflects its own filtered count.

---

## Edge Cases

- **Only one orientation exists** — pair has A_first definition but no B_first: cell (col=A, row=B) shows count, mirror cell shows 0.
- **Unequal run counts** — A_first run 5 times, B_first run 2 times: cells show 5 and 2 respectively (not summed).
- **Standard vignette domain** — behavior depends on answer to Question 2 above; must not regress.
- **Definition with only one value matched** — `extractValuePair` returns null if either dimension doesn't resolve to a known key; cell stays empty (same as current behavior, but now with case normalization applied first).
- **Diagonal cells** — valueA === valueB; no change, still disabled/N/A.
- **Matrix with 0 definitions** — empty domain; all cells show 0; no errors.

---

## Functional Requirements

_(Marked `[TBD]` where dependent on design question answers above)_

- **FR-001**: `extractValuePair` MUST normalize dimension names to PascalCase before lookup (e.g. `achievement` → `Achievement`, `benevolence_dependability` → `Benevolence_Dependability`).
- **FR-002**: The backend MUST build pair keys using the natural presentation order of the definition (presented_first::presented_second), not alphabetical sort, for directional domains.
- **FR-003**: Each matrix cell MUST aggregate only runs from definitions whose presentation order matches that cell's orientation (col=presented_first, row=presented_second).
- **FR-004**: The frontend cell lookup MUST use `colValue::rowValue` (column first, no sort) to retrieve the correct cell from the backend response.
- **FR-005**: The `domainValueCoverage` resolver MUST emit distinct cells for (A,B) and (B,A) when they represent different definitions.
- **FR-006**: Standard vignette definitions MUST populate only the single cell matching their natural dimension order (no mirroring). Existing counts must not change.
- **FR-007**: Model and signature filters MUST continue to apply per-cell after the directional change.
- **FR-008**: The "View Analysis" link on cell (col=X, row=Y) MUST point to a run where X was option A.

---

## Success Criteria

- **SC-001**: A job-choice pair with N A_first runs and M B_first runs shows exactly N in the (col=A, row=B) cell and exactly M in the (col=B, row=A) cell.
- **SC-002**: Clicking "View Analysis" on any job-choice cell opens the correct orientation's run — verified by checking the linked run ID matches the expected definition.
- **SC-003**: All existing standard-vignette domain coverage pages show the same counts before and after this change.
- **SC-004**: Value pairs with job-choice definitions show non-zero counts (the "cells are empty" bug is resolved).

---

## Assumptions

- `DOMAIN_ANALYSIS_VALUE_KEYS` currently has 10 values; this fix does not change that set.
- The backend `extractValuePair` function reads `resolvedContent.dimensions` — this field is populated for all relevant definitions.
- The existing test suite (`DomainCoverage.test.tsx`) covers standard vignette behavior and will catch regressions there.
- PR #379 must merge before branching for this feature.

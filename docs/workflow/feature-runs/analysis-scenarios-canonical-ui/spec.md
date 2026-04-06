# Spec: Canonical Scenarios Matrix in Analysis Detail

**Feature run:** `analysis-scenarios-canonical-ui`
**Status:** spec
**Last updated:** 2026-03-25

---

## What This Does

Updates the `scenarios` tab on `AnalysisDetail` so the condition-scoring matrix uses the same canonical five-bucket logic and winner-score display that the value-detail page already ships.

The pivot grid at the top of the tab stays on the current legacy mean-score path for this wave.

This is a UI-only follow-up to the replace wave. It does not change analysis backend math, query contracts, or top-level domain analysis scoring.

---

## Canonical Display Model

The scenarios tab matrix should present each condition cell using the same five outcome buckets as the value-detail wave:

| Bucket | Meaning |
|---|---|
| `strongly` | First-side transcript evidence strongly favors the first side |
| `somewhat` | First-side transcript evidence leans to the first side |
| `neutral` | No preference |
| `opponentSomewhat` | Second-side transcript evidence leans to the second side |
| `opponentStrongly` | Second-side transcript evidence strongly favors the second side |

Plus:

- `unknownCount` for transcripts that cannot be resolved canonically
- `totalTrials` for the five resolved buckets only

### Derived display values

- `selectedValueWinRate = (strongly + somewhat) / totalTrials`
- `meanPreferenceScore = (2 × strongly + 1 × somewhat) / totalTrials`
- `opponentMeanPreferenceScore = (2 × opponentStrongly + 1 × opponentSomewhat) / totalTrials`
- `displayScore` is the winner's score for the cell
- `isOpponent = opponentMeanPreferenceScore > meanPreferenceScore`
- ties keep the first-side score, matching the value-detail page

### Unknown handling

- If a transcript cannot be resolved canonically, it counts toward `unknownCount`
- Unknown transcripts are excluded from the denominator
- Cells with no resolved canonical trials show `–`
- The tab should expose the unknown handling in a small footnote so users can see that the cell scores are not mixing in unresolved data

### Visual language

- Winner score display is `0.0` to `2.0`
- Blue tint means the first side wins
- Orange tint means the second side wins
- Tint opacity scales with the score, matching the value-detail matrix
- Text color uses the same blue/orange split as the value-detail matrix

---

## Problem

The current scenarios tab still renders its condition matrix from legacy averaged 1-5 scores. That keeps the pivot grid and the condition matrix on different semantics inside the same tab.

The user-facing result is inconsistent:

- one matrix in the analysis shell speaks legacy score language
- the value-detail page already speaks canonical winner-score language
- unknown canonical data is not surfaced in the scenarios tab the same way it is on the value-detail page

We need the scenarios tab to mirror the value-detail wave while leaving the top pivot grid untouched.

---

## What We Are Building

The implementation should:

1. Keep `PivotAnalysisTable` unchanged so the top grid stays legacy.
2. Pass the full `run.transcripts` array from `AnalysisPanel` into the scenarios tab.
3. Rebuild `ConditionDecisionsTable` cells from canonical transcript evidence instead of raw averaged score display.
4. Render the winner score with the same 0-2 blue/orange visual language used on the value-detail page.
5. Surface unknown handling clearly without changing the drill-down navigation path.
6. Keep row and column ordering, model headers, and click-through behavior exactly as they are today.

---

## Phase Boundary

This phase stops at the scenarios-tab UI surface.

### In scope

- `cloud/apps/web/src/components/analysis/AnalysisPanel.tsx`
- `cloud/apps/web/src/components/analysis/tabs/ScenariosTab.tsx`
- `cloud/apps/web/src/components/analysis/ConditionDecisionsTable.tsx`
- a small web helper for canonical condition-score summarization, if needed
- `cloud/apps/web/tests/components/analysis/AnalysisPanel.test.tsx`
- `cloud/apps/web/tests/components/analysis/ConditionDecisionsTable.test.tsx`

### Out of scope

- backend query or GraphQL schema changes
- domain-analysis value-detail behavior
- the top pivot grid in the scenarios tab
- analysis route URL/state wiring
- transcript viewer or transcript list presentation changes
- any new aggregation for the top-level domain analysis table

---

## Acceptance Criteria

- The scenarios tab still renders the pivot grid at the top, with the existing legacy numbers.
- The condition matrix below the pivot grid renders canonical 0-2 winner scores instead of raw 1-5 averages.
- Blue/orange tinting and score text follow the same winner-side rule as the value-detail page.
- `unknownCount` is excluded from the score denominator and surfaced in the UI.
- Cells with no canonical evidence show `–`.
- The row/column structure, tab navigation, and transcript drill-down behavior stay the same.
- The feature does not alter backend responses or the top-level domain analysis score surfaces.

---

## Notes

- The scenarios-tab matrix uses the full transcript array already loaded on the analysis shell. `ConditionDecisionsTable` is responsible for filtering that array down to the current model and condition cell.
- The canonical summary helper must be the single source of truth for the bucket math, tie rule, and color selection within this wave.
- If a cell has only unresolved transcript evidence, it should be treated as unknown rather than borrowing legacy numeric averages.
- If a cell has no resolved canonical evidence, `selectedValueWinRate`, `meanPreferenceScore`, and `opponentMeanPreferenceScore` should all be `null`, and the cell should render `–` with no tint.
- Keep the implementation small and local to the scenarios tab so the replace wave remains intact.

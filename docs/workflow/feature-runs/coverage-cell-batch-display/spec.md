# Spec: Fix Coverage Matrix Cell to Show Model-Set-Filtered Batch Count

**Slug:** coverage-cell-batch-display
**Created:** 2026-04-26
**Status:** draft

## Problem

The coverage matrix cells currently display `minTrialCount` — the minimum completed transcript count across all default models — when a domain has default models configured. This is wrong for two reasons:

1. **Wrong unit.** The canonical definition of a batch is "all selected models answered every scenario at every sample index." A batch is a complete run. Trial count is a different unit (raw transcript rows, not runs), and the color thresholds (red <3, yellow 3-9, green 10+) and legend text ("Batches per cell") are calibrated for batch counts, not trial counts.

2. **Wrong filter.** A simple revert to the existing `batchCount` is also wrong: `batchCount` counts every complete run regardless of which models were in it. A run from 6 months ago with 3 models still counts even if the domain now has 5 default models. The batch count shown should reflect whether the *current* default model set is covered.

## Goal

Show a **model-set-filtered batch count** in each cell: the number of complete runs where every effective default model ID was present in `config.models`. When no default models are configured, show all complete runs (current behavior).

Repurpose the ⚠ mismatch badge to signal a **direction imbalance** (A-first count ≠ B-first count) and show the breakdown in the tooltip and popover.

---

## User Stories

### US1 — Cell shows model-set-filtered batch count (P1)

A domain analyst viewing the coverage matrix sees batch counts in each cell that reflect whether the domain's current default models are covered. A cell with 10 complete runs, where only 4 included all default models, shows 4 — not 10.

**Acceptance scenarios:**

1. **Given** a domain with 3 default models and 10 complete runs, where 4 runs included all 3 models and 6 runs included only 2, **When** the matrix loads, **Then** the cell shows 4.
2. **Given** a domain with no default models configured, **When** the matrix loads, **Then** the cell shows the total complete batch count (unchanged from today).
3. **Given** a domain with 3 default models and 0 complete runs that included all 3, **When** the matrix loads, **Then** the cell shows 0 (red).

### US2 — Direction imbalance is surfaced with ⚠ badge (P1)

When A-first and B-first run counts differ, a ⚠ badge appears on the cell. Hovering or clicking reveals the individual direction counts so the analyst knows which direction to run next.

**Acceptance scenarios:**

1. **Given** a cell where A-first complete runs = 5 and B-first complete runs = 3, **When** the matrix loads, **Then** the cell shows a ⚠ badge.
2. **Given** a cell where A-first = B-first, **When** the matrix loads, **Then** no ⚠ badge appears.
3. **Given** a cell with a ⚠ badge, **When** the user opens the popover, **Then** they see the A-first and B-first counts individually.

### US3 — Per-model trial breakdown stays in click popover (P2)

The click popover retains the per-model trial count breakdown. The cell shows batches (summary); the popover shows per-model trial detail.

**Acceptance scenarios:**

1. **Given** a cell with model breakdown data, **When** the user clicks to open the popover, **Then** per-model trial counts are shown below the batch count.
2. **Given** a cell with a ⚠ direction imbalance badge, **When** the user opens the popover, **Then** both the direction breakdown and the per-model trial breakdown are visible.

---

## Functional Requirements

- **FR-001:** The API MUST compute `batchCount` for each cell as the count of complete non-aggregate runs where `config.models` is a superset of all effective default model IDs for the domain. When `effectiveModelIds` is empty, include all complete runs.
- **FR-002:** The same model-set filter MUST apply to the directional tracking that drives `pairedBatchCount`, `aFirstBatchCount`, and `bFirstBatchCount`.
- **FR-003:** The API MUST expose `aFirstBatchCount` and `bFirstBatchCount` as new integer fields on `DomainValueCoverageCell`, representing the filtered count of complete A-first and B-first runs respectively.
- **FR-004:** The frontend cell MUST display `pairedBatchCount` when > 0, otherwise `batchCount`.
- **FR-005:** The cell color threshold MUST use the displayed count (same as FR-004) against the existing thresholds: red < 3, yellow 3–9, green ≥ 10.
- **FR-006:** The frontend MUST remove all `minTrialCount`-based display logic from the cell label, color, and primary count.
- **FR-007:** The ⚠ mismatch badge MUST fire when `aFirstBatchCount !== bFirstBatchCount` (equivalently, `orphanedBatchCount > 0`). It MUST NOT fire when directional data is absent (both counts are 0) and MUST NOT fire for trial count differences.
- **FR-008:** When the ⚠ badge is present, the cell's tooltip (`title` attribute) MUST show the A-first and B-first counts.
- **FR-009:** When the ⚠ badge is present and the popover is open, the direction breakdown (A-first count, B-first count) MUST be visible in the popover.
- **FR-010:** The per-model trial breakdown (`modelBreakdown`) MUST remain in the click popover when data is available.
- **FR-011:** The `minTrialCount` / `maxTrialCount` fields MAY remain in the API response (for backward compat) but MUST NOT drive cell display or color.

---

## Edge Cases

- **No default models:** `effectiveModelIds` is empty **after global fallback resolution** (i.e., `resolveEffectiveDefaultModelIds` returns an empty array) → include all complete runs in batch count (existing behavior). Note: an empty per-domain `defaultModelIds` does not guarantee `effectiveModelIds` is empty; global defaults may still apply.
- **Model added mid-way:** Older runs without the new model don't pass the filter. They still exist in the DB but don't count. This is correct.
- **No directional data:** If no runs have a recognized direction token (`jobChoiceValueFirst`), `pairedBatchCount = 0` and `aFirstBatchCount = bFirstBatchCount = 0`. No ⚠ badge. Runs with missing or blank `jobChoiceValueFirst` are excluded from directional counts but still contribute to `batchCount`.
- **pairedBatchCount = 0, batchCount > 0:** Cell shows `batchCount`. ⚠ fires because `batchCount > pairedBatchCount`. Direction tooltip shows 0 for the missing direction.
- **All batches paired:** `aFirstBatchCount = bFirstBatchCount`. No ⚠ badge. Cell shows `pairedBatchCount`.

---

## Scope

**In scope:**
- `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts` — apply model-set filter to batch counting; add `valueA`/`valueB` parameters to `selectPrimaryDefinitionCounts` so it can return `aFirstBatchCount`/`bFirstBatchCount` by looking up `merged.get(valueA)` and `merged.get(valueB)` (the direction token is the value name stored in `jobChoiceValueFirst`)
- `cloud/apps/api/src/graphql/queries/domain-coverage-gql-types.ts` — add `aFirstBatchCount`/`bFirstBatchCount` fields to `DomainValueCoverageCell` type and GraphQL objectRef
- `cloud/apps/api/src/graphql/queries/domain-coverage.ts` — thread model-set filter through batch counting; populate new fields in cell construction
- `cloud/apps/web/src/api/operations/domainCoverage.ts` — add `aFirstBatchCount`/`bFirstBatchCount` to the GraphQL query fragment
- `cloud/apps/web/src/components/domains/CoverageCell.tsx` — remove `minTrialCount` display path; repurpose `hasMismatch`; add direction counts to tooltip/popover
- `cloud/apps/web/src/components/domains/CoverageMatrix.tsx` — pass `aFirstBatchCount`/`bFirstBatchCount` to `CoverageCell`

**Not in scope:**
- Changes to `pairedBatchCount` semantics (still `min(A-first, B-first)`)
- Changes to `incompleteBatchCount` or the amber dot indicator
- Removing `minTrialCount`/`maxTrialCount` from the API (kept for backward compat)
- UI changes to the signature selector or model filter controls

---

## Assumptions

1. When no default models are configured, show all complete batches unfiltered.
2. `pairedBatchCount` remains `min(A-first, B-first)` of the model-set-filtered runs.
3. Color thresholds (red <3, yellow 3–9, green ≥ 10) stay unchanged, now applied to `pairedBatchCount` or `batchCount`.
4. `modelBreakdown` data stays in the API response and is shown in the popover.

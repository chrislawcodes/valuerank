# Feature — Win Rate (Exc. Neutral) Toggle

**Created:** 2026-05-11
**Status:** Spec
**Slug:** win-rate-exc-neutral

## Summary

Add a persistent toggle to the `AnalysisContextBar` that switches between two win rate calculation modes across all reports on the win rate page (`/models/win-rate`) and model groups page (`/models`):

- **All responses** (current behavior): `wins / (wins + losses + neutrals)`
- **Exc. neutral**: `wins / (wins + losses)` — excludes trials where the model chose neither value

The toggle is always visible in the context bar. On the model groups page it is disabled when the data source is "Log Odds" or "Kappa Agreement" (since neither uses win rates). The backend adds exc-neutral fields to the domain analysis snapshot in a two-phase write: standard win rates are committed first, exc-neutral rates are added afterward so the cache is immediately useful if Phase 2 is interrupted.

---

## User Stories

### US-1 — Researcher switches to exc-neutral win rate on the win rate page (P1)

A researcher looking at the Value Priorities table notices that a model has many neutral responses. They want to see how it ranks when only decisive choices count. They click "Exc. neutral" in the context bar and all reports update.

**Acceptance scenarios:**

1. **Given** the win rate page is loaded with cached exc-neutral data, **when** the researcher clicks "Exc. neutral," **then** the Value Priorities table, Dominance graph, and Pairwise Win Rate Matrix all update to show exc-neutral rates.
2. **Given** the researcher selects "Exc. neutral" but the domain's cache has not yet populated exc-neutral data (field is null), **when** any report renders, **then** it falls back to displaying the standard win rate without an error.
3. **Given** the researcher selects "Exc. neutral," **when** they switch to a different domain, **then** the toggle state persists and the new domain's data renders in exc-neutral mode.

---

### US-2 — Researcher views exc-neutral win rate on the model groups page (P1)

On the model groups page with data source set to "Win Rate," the researcher switches to exc-neutral mode and the radar/dot/bar chart updates to show exc-neutral values.

**Acceptance scenarios:**

1. **Given** data source is "Win Rate" on the model groups page, **when** the researcher clicks "Exc. neutral," **then** the cluster visualizations update.
2. **Given** data source is "Log Odds" or "Kappa Agreement," **when** the researcher looks at the context bar, **then** the win rate mode toggle is visible but disabled (grayed out), and hovering shows a tooltip explaining it only applies to win rate mode.

---

### US-3 — Domain shifts report and model analysis show exc-neutral per domain (P2)

When exc-neutral mode is active on the win rate page, the Domain Shifts report updates each per-domain win rate cell to reflect the exc-neutral value.

**Acceptance scenarios:**

1. **Given** exc-neutral mode is active, **when** the Domain Shifts report renders, **then** each model × domain cell shows `winRateExcNeutral` instead of `winRate`.
2. **Given** a domain's snapshot does not yet have exc-neutral domain breakdown data (null), **when** the Domain Shifts report renders, **then** it falls back to the standard domain win rate for that cell.

---

### US-4 — Exc-neutral cache populates in background without blocking the page (P2)

When a domain analysis snapshot is rebuilt, standard win rates appear immediately. Exc-neutral rates appear once Phase 2 of the snapshot write completes. The page is never in an error state during this window.

**Acceptance scenarios:**

1. **Given** a fresh snapshot has just been written, **when** a user loads the page before Phase 2 completes, **then** the toggle is visible, "All responses" is the effective mode for any null exc-neutral field, and no error is shown.
2. **Given** Phase 2 completes, **when** the user reloads or the cache refreshes, **then** exc-neutral data is available and the toggle produces different numbers than "All responses."

---

## Edge Cases

- **All responses are neutral for a value**: `prioritized + deprioritized = 0` → exc-neutral win rate is `null`. Reports treat null the same as missing data (fall back or show "n/a" per existing null handling).
- **Old snapshots (pre-feature)**: `valueWinRatesExcNeutral` is absent from the snapshot JSON. The API returns `null` for exc-neutral fields. The UI falls back silently to standard win rate.
- **Pairwise matrix exc-neutral**: computed on-the-fly in the resolver from `pairwiseWins` / `pairwiseNeutrals` stored in the snapshot. Pre-v1.9.0 snapshots lack `pairwiseNeutrals`, so `neutralsIJ` defaults to `0` in the existing formula, which already produces `winsIJ / (winsIJ + winsJI)` — the exc-neutral formula. On these old snapshots, both toggle modes will show the same pairwise matrix. This is acceptable behavior.
- **Toggle state on page navigation**: toggle is local React state per page; it does not persist across navigation or in the URL.

---

## Non-Goals

- Win Rate Stability section — shows stability categories (Stable/Torn/etc.), not win rates. Not affected.
- `PairwiseCellDrawer` (the drill-down panel shown when clicking a cell in the pairwise matrix) — uses a separate `pair-detail` resolver that computes `selectedValueWinRate` independently. The matrix display switches modes; the drawer always shows standard win rates. This is a follow-up feature.
- Renaming or restructuring existing win rate schema fields.
- Persisting the toggle state to the URL or user preferences.
- Applying the exc-neutral calculation to log-odds scores or kappa agreement scores.

---

## Functional Requirements

- **FR-001**: The `AnalysisContextBar` MUST render a two-option toggle ("All responses" / "Exc. neutral") on every page that uses it.
- **FR-002**: On the model groups page, the toggle MUST be visually disabled when `dataSource` is "log-odds" or "kappa-agreement", and MUST be enabled when `dataSource` is "win-rate".
- **FR-003**: When "Exc. neutral" is selected on the win rate page, the Value Priorities table, Dominance graph, and Pairwise Win Rate Matrix MUST use exc-neutral rates.
- **FR-004**: When "Exc. neutral" is selected on the win rate page, the Domain Shifts report MUST use `winRateExcNeutral` per domain breakdown cell.
- **FR-005**: When "Exc. neutral" is selected on the model groups page with data source "win-rate," the cluster visualizations (radar/dot/bar) MUST use exc-neutral rates.
- **FR-006**: Any report where the exc-neutral field is `null` MUST fall back to the standard win rate. There are two distinct null cases that the UI MUST handle differently:
  - **Cache not built yet** (old snapshot, Phase 2 not yet complete): The UI MUST show a small indicator on the toggle (e.g., dimmed label or tooltip) saying "Exc. neutral data is not yet available for this domain — showing all responses."
  - **Zero decisive responses** (`prioritized + deprioritized = 0` for a specific value): The UI MUST show "n/a" or an equivalent marker for that specific cell/node, NOT the fallback standard win rate, since there is no meaningful exc-neutral rate to fall back to. The toggle indicator MUST NOT fire for this case.
  - A full error state MUST NOT be shown in either case.
- **FR-007**: The domain analysis snapshot builder MUST write standard win rate fields first (Phase 1), then update the snapshot with `valueWinRatesExcNeutral` (Phase 2). The Phase 2 DB update MUST be a conditional write that only succeeds when the target snapshot is still `CURRENT` (e.g., `WHERE id = $id AND status = 'CURRENT'`). If the row has been superseded, Phase 2 MUST be a no-op — it MUST NOT write to the superseded record or create a new one. A Phase 2 failure MUST NOT corrupt or invalidate the Phase 1 snapshot.
- **FR-008**: The `modelsAnalysis` GraphQL query MUST return `pooledWinRateExcNeutral: Float` (nullable) alongside the existing `pooledWinRate`. When aggregating across multiple domain snapshots, domains lacking `valueWinRatesExcNeutral` MUST be excluded from the exc-neutral pooled calculation. If no domains have exc-neutral data, `pooledWinRateExcNeutral` MUST be `null`.
- **FR-009**: The `modelsAnalysis` GraphQL query MUST return `winRateExcNeutral: Float` (nullable) on each domain breakdown entry. If the snapshot for that domain lacks exc-neutral data, the field MUST be `null`.
- **FR-010**: The `domainAnalysis` GraphQL query MUST return `winRateExcNeutral: Float` (nullable) on each model value score, computed from `counts.prioritized / (counts.prioritized + counts.deprioritized)`.
- **FR-011**: The pairwise win rate matrix type in `domainAnalysis` MUST expose `winRateExcNeutralMatrix: [[Float]]`, computed on-the-fly from stored `pairwiseWins` and `pairwiseNeutrals`.

---

## Success Criteria

- **SC-001**: Switching to "Exc. neutral" produces visibly different numbers than "All responses" on a domain with non-trivial neutral response rates.
- **SC-002**: No error states or broken renders appear when the toggle is switched on a domain whose snapshot was built before this feature shipped.
- **SC-003**: Phase 1 snapshot write completes and the page is usable before Phase 2 starts.
- **SC-004**: The toggle is visible on both pages; it is disabled (not hidden) when inapplicable on the model groups page.

---

## Key Files

### Backend — snapshot types and builder
- `cloud/apps/api/src/services/analysis/domain-analysis-cache-types.ts` — add `valueWinRatesExcNeutral?: Record<string, number>` to `DomainAnalysisSnapshotModel`
- `cloud/apps/api/src/services/analysis/domain-analysis-snapshot-builder.ts` — Phase 1 save (unchanged), then Phase 2 update with exc-neutral field
- `cloud/apps/api/src/services/analysis/value-win-rate-aggregation.ts` — add exc-neutral mode parameter (excludes neutrals from denominator)
- `cloud/apps/api/src/services/analysis/domain-analysis-cache.ts` — compute exc-neutral pairwise matrix on-the-fly in the resolver from stored `pairwiseWins`/`pairwiseNeutrals`

### Backend — GraphQL schema and resolvers
- `cloud/apps/api/src/graphql/queries/domain/` — extend `DomainAnalysisValueScore` with `winRateExcNeutral`; extend pairwise model type with `winRateExcNeutralMatrix`
- `cloud/apps/api/src/graphql/queries/models-analysis.ts` — compute and return `pooledWinRateExcNeutral`, `winRateExcNeutral` per domain breakdown

### Frontend — shared
- `cloud/apps/web/src/components/analysis/AnalysisContextBar.tsx` — add `winRateMode` prop and toggle UI
- `cloud/apps/web/src/api/operations/domainAnalysis.ts` — extend GraphQL operation types
- `cloud/apps/web/src/api/operations/modelsAnalysis.ts` — extend GraphQL operation types; run codegen

### Frontend — win rate page
- `cloud/apps/web/src/pages/DomainAnalysis.tsx` — manage `winRateMode` state; thread to all reports
- `cloud/apps/web/src/components/domains/ValuePrioritiesSection.tsx` + `ValuePrioritiesTable.tsx` — use exc-neutral rates when mode active
- `cloud/apps/web/src/components/domains/DominanceSection.tsx` — use exc-neutral rates
- `cloud/apps/web/src/components/domains/PairwiseWinRateMatrix.tsx` — use `winRateExcNeutralMatrix`
- `cloud/apps/web/src/components/models/DomainShiftsReportSection.tsx` — use `winRateExcNeutral` per domain

### Frontend — model groups page
- `cloud/apps/web/src/pages/ModelsGroups.tsx` — manage `winRateMode` state; thread to visualizations
- `cloud/apps/web/src/components/domains/ModelGroupsSection.tsx` + cluster charts — use exc-neutral rates when mode active

---

## Constraints

DO NOT MODIFY: `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `MEMORY.md`, `.gitignore`, `STATUS.md`.

Do not rename or remove the existing `pooledWinRate`, `winRate`, or `valueWinRates` fields — they must remain for backward compatibility with cached snapshots and any consumers not yet updated.

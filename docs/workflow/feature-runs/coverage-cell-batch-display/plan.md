# Plan: Fix Coverage Matrix Cell to Show Model-Set-Filtered Batch Count

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: No actionable findings — showing pairedBatchCount for directional cells is intentional design; badge fires on imbalance
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: Finding 1 HIGH: Fixed FR-007 — badge condition aFirstBatchCount !== bFirstBatchCount. Finding 2 HIGH: Fixed effectiveModelIds edge case. Findings 3-5: intentional or deferred. All addressed.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Finding 1 HIGH: Fixed FR-007 (badge uses aFirstBatchCount !== bFirstBatchCount). Finding 2 MEDIUM: orphanedBatchCount used as badge trigger; directional counts in tooltip. Finding 3 MEDIUM: direction token IS the value name — direct lookup via valueA/valueB params. Residuals accepted.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: rejected | note: All findings are false positives or intentional design — no code changes required; see Resolution section
- review: reviews/plan.gemini.testability-adversarial.review.md | status: rejected | note: All findings are false positives or intentional design — no code changes required; see Resolution section
- review: reviews/plan.codex.architecture-adversarial.review.md | status: rejected | note: All findings are false positives or intentional design — no code changes required; see Resolution section
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/diff.codex.regression-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted

## Architecture

### Core change: model-set filter on batch counting

In `domain-coverage.ts`, each completed run currently passes the `matchesModelFilter` gate if it contains at least one transcript for any of the explicit `filterModelIds` arg (which the frontend currently never sends). The new behavior replaces this for the `effectiveModelIds` case:

**When `effectiveModelIds.length > 0`**: a run must have all effective default model IDs present in its `config.models` array to count toward `batchCount` and the directional trackers. The check is `effectiveModelIds.every(id => models.includes(id))` where `models` is the run's `config.models`.

**When `effectiveModelIds.length === 0`**: all complete runs count (existing behavior).

This filter is applied before `batchCountByDefinitionId` and `directionalGroupsByDefinitionId` are updated — same location as the existing `matchesModelFilter` check.

### New fields: `aFirstBatchCount` and `bFirstBatchCount`

`selectPrimaryDefinitionCounts` in `domain-coverage-utils.ts` currently returns `{ primaryDefinitionId, batchCount, pairedBatchCount, orphanedBatchCount }`. It will gain two new parameters (`valueA: string`, `valueB: string`) and return two new fields.

The direction token stored in `jobChoiceValueFirst` is the value name (e.g., `"Benevolence"`). So for a cell with `valueA = "Benevolence"` and `valueB = "Power"`:
- `aFirstBatchCount = merged.get("Benevolence")?.size ?? 0`
- `bFirstBatchCount = merged.get("Power")?.size ?? 0`

If neither direction matches `valueA` or `valueB` (unknown token), both counts are 0 — same semantics as no direction data.

### Frontend: remove trial display, repurpose badge

`CoverageCell.tsx` removes the `hasPerModelData` / `minTrialCount` display branch entirely. The display logic becomes:
- `displayCount = pairedBatchCount > 0 ? pairedBatchCount : batchCount`
- `countForColor = displayCount`
- `hasMismatch = aFirstBatchCount !== bFirstBatchCount` — badge fires on direction imbalance only
- Tooltip: when `hasMismatch`, shows `A-first: {aFirstBatchCount}, B-first: {bFirstBatchCount}`
- Popover: direction breakdown row when `hasMismatch`; per-model trial breakdown retained below

`orphanedBatchCount` is already in the API response but currently unused on the frontend. It will be threaded through (`domainCoverage.ts` fragment → `CoverageMatrix.tsx` → `CoverageCell.tsx`) as a cross-check but the badge condition uses the individual counts.

---

## Implementation Slices

### Slice 1 — API: model-set filter + directional count fields

**Files:**
- `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts`
- `cloud/apps/api/src/graphql/queries/domain-coverage-gql-types.ts`
- `cloud/apps/api/src/graphql/queries/domain-coverage.ts`
- Tests: `cloud/apps/api/src/graphql/queries/` (existing coverage tests)

**Changes:**
1. `domain-coverage-utils.ts`: Add `valueA: string` and `valueB: string` to `selectPrimaryDefinitionCounts` signature. After computing `merged`, look up `merged.get(valueA)?.size ?? 0` and `merged.get(valueB)?.size ?? 0` for the new fields. Update return type to include `aFirstBatchCount` and `bFirstBatchCount`.
2. `domain-coverage-gql-types.ts`: Add `aFirstBatchCount: number` and `bFirstBatchCount: number` to `DomainValueCoverageCell` TypeScript type and expose them in the Pothos objectRef.
3. `domain-coverage.ts`: Apply model-set filter — when `effectiveModelIds.length > 0`, replace the `matchesModelFilter` check with `effectiveModelIds.every(id => models.includes(id))`. The filter gates ALL per-run counters symmetrically: `batchCountByDefinitionId`, `directionalGroupsByDefinitionId`, `incompleteBatchCountByDefinitionId`, and `nonAggregateRunsByDefinitionId` (move `nonAggregateRunsByDefinitionId` population to after the filter check, not before it). This preserves the "exactly one bucket" invariant and keeps popover trial counts consistent with the batch count cohort. Pass `valueA` and `valueB` to `selectPrimaryDefinitionCounts`. Populate `aFirstBatchCount` and `bFirstBatchCount` in both cell branches (zero-cell and real-cell).

**[CHECKPOINT]**

### Slice 2 — Frontend: cell display + badge repurpose

**Files:**
- `cloud/apps/web/src/api/operations/domainCoverage.ts`
- `cloud/apps/web/src/components/domains/CoverageCell.tsx`
- `cloud/apps/web/src/components/domains/CoverageMatrix.tsx`

**Changes:**
1. `domainCoverage.ts`: Add `aFirstBatchCount`, `bFirstBatchCount`, `orphanedBatchCount` to the GraphQL query fragment (both `DOMAIN_VALUE_COVERAGE_QUERY` and `DOMAIN_VALUE_COVERAGE_QUERY_LEGACY`).
2. `CoverageCell.tsx`:
   - Add props `aFirstBatchCount: number` and `bFirstBatchCount: number`; remove `minTrialCount` and `maxTrialCount` from display logic (props can remain for type compat but unused in display)
   - Replace `hasPerModelData` / `displayCount` / `countForColor` / `batchLabel` logic with batch-count-only path
   - Replace `hasMismatch` condition: `aFirstBatchCount !== bFirstBatchCount`
   - Replace tooltip with direction breakdown when mismatch
   - Add direction breakdown row in popover header when mismatch
3. `CoverageMatrix.tsx`: Pass `aFirstBatchCount`, `bFirstBatchCount`, `orphanedBatchCount` from cell data to `CoverageCell`.

**[CHECKPOINT]**

---

## Residual Risks

1. **Batch counts will visibly drop for domains with default models** when the filter is applied. Older runs predating the current model set will no longer count. This is correct behavior but may surprise users who see lower numbers after deploy.
   **verification:** Before merging, query prod via MCP `graphql_query` for one domain with known default models; compare `batchCount` returned by the new query against the current count; confirm the delta is explainable by runs whose `config.models` did not include all default models.

2. **`jobChoiceValueFirst` token may not exactly match COVERAGE_VALUE_KEYS spellings.** If casing or formatting differs, `merged.get(valueA)` returns 0 and directional data is silently lost.
   **verification:** Before merging, grep prod run configs via `DATABASE_PUBLIC_URL` with `SELECT DISTINCT config->>'jobChoiceValueFirst' FROM "Run" WHERE config->>'jobChoiceValueFirst' IS NOT NULL LIMIT 100` and compare results against COVERAGE_VALUE_KEYS in the codebase.

3. **Legacy query (`DOMAIN_VALUE_COVERAGE_QUERY_LEGACY`) does not take the `signature` arg.** The fragment change must be applied to both queries or the legacy path will miss the new fields.
   **verification:** TypeScript build will fail if the fragment shape diverges from the generated types — build output confirms this.

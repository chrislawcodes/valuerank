# Spec: Cell-Weighted Win Rates for Domain Analysis (Shared Aggregation)

## Problem

Domain Analysis currently computes `valueWinRates` (the win rate shown per value per model)
by pooling all trial observations within each source run, then averaging those pooled run-level
rates equally. The equal-weight-per-run fix (commit `61992664`) addressed the _between-runs_
imbalance, but within each run the win rate is still a pooled observation count across ALL 25
pressure cells (5 own-pressure levels × 5 opponent-pressure levels).

This violates the project's core equal-weight principle:

> **More trials in a cell give you more confidence about what is happening in that cell.
> Trials do NOT increase a cell's weight when computing the vignette's win rate.
> Each cell gets equal weight within a vignette.
> Each vignette gets equal weight within a domain.**

Pressure Sensitivity already implements this correctly — it queries raw transcripts and
computes per-cell win rates before collapsing to the 5×5 grid. Domain Analysis needs to do
the same, and both should use a **single shared accumulation component** so the methodology
is consistent across the system.

## Fix

**Two-part change:**

### Part 1: Extract a shared transcript-cell accumulator

Create `cloud/apps/api/src/services/analysis/transcript-cell-accumulator.ts` — a pure,
reusable function that takes raw transcripts and returns per-cell win/loss/neutral counts.
This function encodes the core methodology so both Domain Analysis and Pressure Sensitivity
(and any future consumer) use identical logic.

### Part 2: Plug Domain Analysis into the shared accumulator

Replace ALL metric computation in the Domain Analysis snapshot builder with transcript-based
aggregation. This includes `counts`, `pairwiseWins`, `valueWinRates`, and `vignetteCount`.
Using a single data source eliminates the dual-source inconsistency that would arise if some
fields came from `analysis_results` and others from transcripts.

The `aggregateAnalysisRows` function (which reads from `analysis_results`) is removed from
`buildSnapshotOutput`. The `analysis_results` table is no longer queried when building
the snapshot output (only when computing the input hash fingerprint, which is unchanged).

## Guiding Principle (must be preserved at every level of the call stack)

- **Trials → confidence within a cell** (more trials = narrower CI, not higher weight)
- **Cells → equal weight within a vignette**
- **Vignettes → equal weight within a domain**

Every new function introduced must respect these three rules. Do not pool raw counts across
cells anywhere in the new code.

## Architecture: the shared accumulator

**File:** `cloud/apps/api/src/services/analysis/transcript-cell-accumulator.ts`

```typescript
export type CellKey = {
  definitionId: string;
  modelId: string;
  valueKey: string;         // the value that "wins" was counted for
  ownLevel: number;         // 1–5
  opponentLevel: number;    // 1–5
};

export type CellCounts = {
  wins: number;
  losses: number;
  neutrals: number;
};

/**
 * Accumulates transcript outcomes into per-(definition, model, valueKey, ownLevel, opponentLevel)
 * cells. Returns a Map keyed by a canonical string from encodeCellKey().
 *
 * Pure function — no I/O, no database, no logging. Designed to be called from resolvers or
 * snapshot builders after transcripts have already been fetched.
 */
export function accumulateTranscriptCells(params: {
  transcripts: TranscriptRow[];
  scenarioById: Map<string, ScenarioRow>;
  filteredSourceRunDefinitionById: Map<string, string>;  // runId → definitionId
}): Map<string, CellCounts>   // key = encodeCellKey(CellKey)

export function encodeCellKey(key: CellKey): string
export function decodeCellKey(encoded: string): CellKey
```

The accumulator reuses the existing helpers from `pressure-sensitivity/value-pair.ts`:
- `assignOwnOpponent` — maps canonical direction to which value won
- `assignOwnOpponentLevels` — derives (ownLevel, opponentLevel) from scenario dimensions
- `canonicalOwnOpponent` — alphabetical canonical pair ordering

And from `graphql/queries/domain/decision-model.ts`:
- `resolveTranscriptDecisionModel` — normalizes the decision accounting for orientationFlipped

Exclusion rules (transcripts that do NOT contribute a cell):
- `runId` not in `filteredSourceRunDefinitionById`
- value pair not parseable from `definitionSnapshot`
- scenario is missing or deleted
- dimension/level assignment returns null
- canonical direction is `'unknown'` (refusal, parse failure)

### How each consumer uses the accumulator

**Domain Analysis** (this feature):
1. Call `accumulateTranscriptCells` → flat cell map (wins/losses/neutrals per cell)
2. From cells, compute `counts`: sum wins+losses+neutrals per (modelId, valueKey) across all
   cells → `{ prioritized, deprioritized, neutral }`. This is the raw trial tally.
3. From cells, compute `pairwiseWins`: sum wins per (modelId, valueA, valueB) pair across all
   cells → tournament-style dominance counts.
4. From cells, compute `valueWinRates`: equal-weight mean of cell win rates per
   (definitionId, modelId, valueKey) → vignette rate; equal-weight mean of vignette rates
   → domain rate. Store as `valueWinRates[valueKey] = domainRate * 100`.
5. All four fields (`counts`, `pairwiseWins`, `valueWinRates`, `vignetteCount`) come from
   the same transcript population — no dual-source inconsistency.

**Pressure Sensitivity** (future refactor — out of scope for this feature):
Currently reads transcripts and accumulates cells inline in the resolver. That inline logic
should eventually call `accumulateTranscriptCells` instead, but that refactor is out of scope
for this feature. We only need the new accumulator to be compatible with that future migration.

## Scope

### Files to create

| File | Purpose |
|------|---------|
| `cloud/apps/api/src/services/analysis/transcript-cell-accumulator.ts` | Shared pure accumulator |
| `cloud/apps/api/src/services/analysis/domain-analysis-cell-win-rates.ts` | Collapse: cells → vignette → domain win rates for Domain Analysis |

### Files to modify

| File | Change |
|------|--------|
| `cloud/apps/api/src/services/analysis/domain-analysis-cache-types.ts` | Bump `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` from `1.6.0` to `1.7.0` |
| `cloud/apps/api/src/services/analysis/domain-analysis-snapshot-aggregator.ts` | Remove `aggregateAnalysisRows` entirely (it is no longer called from the builder). Keep any helpers that are still used elsewhere; delete the rest. |
| `cloud/apps/api/src/services/analysis/domain-analysis-snapshot-builder.ts` | Replace `aggregateAnalysisRows` call + `analysis_results` query with transcript query + `computeCellWeightedWinRates`. The `analysis_results` query for fingerprinting (`fingerprintRows`) stays unchanged. |

### Files NOT to touch

`CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `MEMORY.md`, `.gitignore`,
`schema.graphql`, generated GraphQL types, `pressure-sensitivity/aggregation.ts`,
`pressure-sensitivity/value-pair.ts`, or any file not listed above.

## Data loading in buildSnapshotOutput

Replace the `aggregateAnalysisRows` call and the `analysis_results` output query with:

1. **Transcript query** — paginated per model to avoid Prisma buffer limits (same pattern
   as `cloud/apps/api/src/services/circumplex/aggregation.ts` lines 140–161).
   Query `transcript` where `runId IN filteredSourceRunIds` and `deletedAt IS NULL`.
   Select: `id`, `runId`, `modelId`, `decisionMetadata`, `definitionSnapshot`,
   `scenario { id, content, orientationFlipped, deletedAt }`.

2. **Flatten + filter** — collect all transcripts across model batches, skip deleted scenarios.

3. **Build scenarioById map** — `Map<scenarioId, ScenarioRow>` from the transcript rows.

4. **Call accumulateTranscriptCells** — returns the flat cell map keyed by encodeCellKey().

5. **Call computeCellWeightedWinRates** — collapses cells to produce:
   - `counts` per (modelId, valueKey)
   - `pairwiseWins` per (modelId, valueA, valueB)
   - `valueWinRates` per (modelId, valueKey)
   - `vignetteCount` per (modelId, valueKey)

6. **Build `models` array** from the above — one entry per modelId that has any transcript data.

The `fingerprintRows` query (used for `computeInputHash`) is NOT changed — it still reads
from `analysis_results`. The fingerprint just needs to detect when the underlying analysis
data has changed; it does not drive metric computation.

## Acceptance criteria

1. `valueWinRates` is the equal-weight mean of per-cell rates — cells equal, vignettes equal.
2. `counts`, `pairwiseWins`, `valueWinRates`, and `vignetteCount` all come from the same
   transcript population (no dual-source inconsistency).
3. Cells with zero trials are excluded from the win rate mean.
4. A vignette with no valid cells for a value key is excluded from the domain mean.
5. `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` is `1.7.0`, forcing a rebuild of all cached snapshots.
6. `transcript-cell-accumulator.ts` is a pure function — no database access, no I/O.
7. Existing tests in `models-analysis.test.ts` continue to pass.
8. New unit tests cover: equal-weight cell collapse, zero-trial cell exclusion, neutral picks
   in denominator, and vignette-to-domain equal-weight mean.
9. Production smoke test (pre-merge): query Domain Analysis for one known domain+model via
   the MCP `graphql_query` tool. Confirm `valueWinRates` are non-null and non-zero for at
   least one value key.

## Out of scope

- Refactoring Pressure Sensitivity to use `transcript-cell-accumulator.ts` — that is a
  follow-on task once the shared accumulator is validated.
- The Python analysis worker (`analyze_basic.py`) — not touched.
- GraphQL schema changes — `valueWinRates` and `vignetteCount` are already exposed fields.
- `analysis_results` fingerprinting logic — unchanged; still used to detect when to rebuild.

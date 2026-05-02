# Tasks: Cell-Weighted Win Rates for Domain Analysis

## Wave 1: Shared accumulator [CHECKPOINT]

### Task 1.1 — Create transcript-cell-accumulator.ts

**File:** `cloud/apps/api/src/services/analysis/transcript-cell-accumulator.ts`

Create a pure function `accumulateTranscriptCells` with this signature:

```typescript
import type { DomainAnalysisValueKey } from '../../graphql/queries/domain-analysis-values.js';

export type CellKey = {
  definitionId: string;
  modelId: string;
  valueKey: DomainAnalysisValueKey;
  ownLevel: number;
  opponentLevel: number;
};

export type CellCounts = {
  wins: number;
  losses: number;
  neutrals: number;
};

export function encodeCellKey(key: CellKey): string
export function decodeCellKey(encoded: string): CellKey

export function accumulateTranscriptCells(params: {
  transcripts: Array<{
    id: string;
    runId: string;
    modelId: string;
    decisionMetadata: unknown;
    definitionSnapshot: unknown;
    scenario: { id: string; content: unknown; orientationFlipped: boolean; deletedAt: Date | null } | null;
    deletedAt: Date | null;
  }>;
  filteredSourceRunDefinitionById: Map<string, string>;
}): Map<string, CellCounts>
```

**Implementation details:**
- For each transcript:
  1. Skip if `deletedAt != null` or `scenario == null` or `scenario.deletedAt != null`
  2. Look up `definitionId` from `filteredSourceRunDefinitionById.get(transcript.runId)` — skip if missing
  3. Parse value pair from `transcript.definitionSnapshot` using `extractValuePair` from `domain-analysis-values.ts`; skip if null
  4. Parse dimensions from `transcript.definitionSnapshot` using the same pattern as `buildPressureSensitivityDecisionSnapshot` in `pressure-sensitivity/decision-snapshot.ts`
  5. Build `ownLookup` and `opponentLookup` using `buildSafeLevelLookup` from `scenarios-utils.ts`
  6. Get canonical (firstValueToken, secondValueToken) via `canonicalOwnOpponent` from `value-pair.ts`
  7. Parse `scenario.content` for `dimensionValues` (same as pressure-sensitivity resolver)
  8. Call `assignOwnOpponentLevels` to get `(ownLevel, opponentLevel)`; skip if null
  9. Call `resolveTranscriptDecisionModel` (from `domain/decision-model.ts`) with `orientationFlipped`; skip if direction is `'unknown'`
  10. Map direction to wins/losses/neutrals using `assignOwnOpponent` from `value-pair.ts`
  11. For the winning value key: `encodeCellKey({ definitionId, modelId, valueKey: firstValueToken, ownLevel, opponentLevel })` → increment wins
  12. Also record from the losing value's perspective with `ownLevel` and `opponentLevel` swapped (the opponent's cell is mirrored)

**Note:** a win for `firstValue` is simultaneously a loss for `secondValue`. Record both perspectives.

### Task 1.2 — Tests for transcript-cell-accumulator.ts

**File:** `cloud/apps/api/tests/services/analysis/transcript-cell-accumulator.test.ts`

Cover:
- Happy path: two transcripts in different (ownLevel, opponentLevel) cells → two cell entries per value key, correct win/loss/neutral counts
- Neutral outcome: wins=0, losses=0, neutrals=1 on both value perspectives
- Unknown canonical direction (`'unknown'`) → transcript skipped entirely
- Deleted transcript (`deletedAt != null`) → skipped
- Missing scenario (`scenario == null`) → skipped
- Deleted scenario (`scenario.deletedAt != null`) → skipped
- Missing dimension metadata (no matching dimension for value token) → skipped
- `runId` not in `filteredSourceRunDefinitionById` → skipped
- Empty transcript array → returns empty map

[CHECKPOINT]

---

## Wave 2: Domain win rate collapse [CHECKPOINT]

### Task 2.1 — Create domain-analysis-cell-win-rates.ts

**File:** `cloud/apps/api/src/services/analysis/domain-analysis-cell-win-rates.ts`

```typescript
import type { DomainAnalysisValueCounts } from '../../graphql/queries/domain/shared.js';
import type { DomainAnalysisValueKey } from '../../graphql/queries/domain-analysis-values.js';
import type { CellCounts } from './transcript-cell-accumulator.js';
import { computePairwiseWinRate } from '../../utils/pairwise-math.js';

export type CellWeightedDomainModel = {
  model: string;
  counts: Record<string, DomainAnalysisValueCounts>;
  pairwiseWins: Record<string, Record<string, number>>;
  valueWinRates: Record<string, number>;
  vignetteCount: Record<string, number>;
};

export function computeCellWeightedDomainRates(params: {
  cellMap: Map<string, CellCounts>;
  filteredSourceRunDefinitionById: Map<string, string>;
  definitionValuePairById: Map<string, { valueA: DomainAnalysisValueKey; valueB: DomainAnalysisValueKey }>;
}): { models: CellWeightedDomainModel[]; analyzedDefinitionIds: Set<string> }
```

**Three-level collapse algorithm:**

Step 1 — Group cells by (definitionId, modelId, valueKey):
- Decode each key using `decodeCellKey`
- Look up definitionId from the cell key's definitionId
- Skip cells where `computePairwiseWinRate(wins, losses, neutrals)` is null (zero-trial cells)
- Accumulate: `cellRatesByVignette[modelId][definitionId][valueKey].push(cellRate)`

Step 2 — Vignette rate = equal-weight mean of cell rates:
- For each (modelId, definitionId, valueKey): `vignetteRate = sum(cellRates) / cellRates.length`
- Skip if `cellRates.length === 0` (excluded from domain mean)

Step 3 — Domain rate = equal-weight mean of vignette rates:
- For each (modelId, valueKey): `domainRate = sum(vignetteRates) / vignetteRates.length`
- Store as `valueWinRates[valueKey] = domainRate * 100` (scale 0–100)
- Store `vignetteCount[valueKey] = vignetteRates.length`

Step 4 — `counts` (raw trial tally per value key):
- Sum wins+losses+neutrals across ALL cells for that (modelId, valueKey)
- `counts[valueKey] = { prioritized: totalWins, deprioritized: totalLosses, neutral: totalNeutrals }`

Step 5 — `pairwiseWins` (per pair):
- For each cell where wins > 0: add wins to `pairwiseWins[modelId][valueKey][opponentValueKey]`
- Use the value pair from `definitionValuePairById` to know which value is the opponent

**Important:** if averaging an empty vignette rate set, return `undefined` — never return `0` or `NaN`.

### Task 2.2 — Tests for domain-analysis-cell-win-rates.ts

**File:** `cloud/apps/api/tests/services/analysis/domain-analysis-cell-win-rates.test.ts`

Cover:
- Equal-weight cell collapse: cell (1,1) has 100 trials, cell (2,2) has 10 trials → both count equally
- Zero-trial cell (wins=0, losses=0, neutrals=0) → excluded from vignette mean
- Single-cell vignette → vignette rate equals that one cell's rate
- Multiple vignettes → domain rate = arithmetic mean of vignette rates, not trial-weighted mean
- Vignette with all cells excluded (empty) → that vignette excluded from domain mean
- Empty cell map → returns empty models array
- `counts.prioritized` = raw sum of wins across all cells (not normalized)
- `pairwiseWins` entries correctly match pair wins from cell data
- NaN guard: empty vignette list → value key not present in `valueWinRates` (not `0` or `NaN`)

[CHECKPOINT]

---

## Wave 3: Wire into snapshot builder + cleanup [CHECKPOINT]

### Task 3.1 — Modify domain-analysis-snapshot-builder.ts

**File:** `cloud/apps/api/src/services/analysis/domain-analysis-snapshot-builder.ts`

In `buildSnapshotOutput`:
1. Remove the `analysisRows` database query (the one selecting `output` from `analysis_result`)
2. Remove the `aggregateAnalysisRows` import and call
3. Add per-model transcript query (parallel, following `circumplex/aggregation.ts` lines 140–161):
   ```typescript
   const transcriptBatches = await Promise.all(
     allModelIds.map(async (modelId) => db.transcript.findMany({
       where: {
         runId: { in: state.resolvedSignatureRuns.filteredSourceRunIds },
         modelId,
         deletedAt: null,
       },
       select: {
         id: true,
         runId: true,
         modelId: true,
         decisionMetadata: true,
         definitionSnapshot: true,
         deletedAt: true,
         scenario: {
           select: {
             id: true,
             content: true,
             orientationFlipped: true,
             deletedAt: true,
           },
         },
       },
     }))
   );
   const transcripts = transcriptBatches.flat();
   ```
   Where `allModelIds` is derived from the requested model list or a reasonable default.
   
   NOTE: since Domain Analysis doesn't filter by specific models, query ALL transcripts for
   the scoped runs. Do NOT filter by modelId — use a single query or paginate per run batch
   instead if needed. Follow the circumplex pattern.

4. Call `accumulateTranscriptCells({ transcripts, filteredSourceRunDefinitionById })`
5. Call `computeCellWeightedDomainRates({ cellMap, filteredSourceRunDefinitionById, definitionValuePairById: valuePairByDefinition })`
6. Build `models` array from the result
7. Pass `analyzedDefinitionIds` to the existing `missingDefinitions` logic (same role as before)

Keep `buildContributionAndExcludedSummary` call — it uses `analysisRows` but only for contribution
counts. If it breaks without `analysisRows`, adapt it to use transcript counts or remove it if
unused.

### Task 3.2 — Bump code version

**File:** `cloud/apps/api/src/services/analysis/domain-analysis-cache-types.ts`

Change `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` from `'1.6.0'` to `'1.7.0'`.

### Task 3.3 — Clean up domain-analysis-snapshot-aggregator.ts

**File:** `cloud/apps/api/src/services/analysis/domain-analysis-snapshot-aggregator.ts`

Remove `aggregateAnalysisRows` and all types/helpers that are only used by it.
Keep any exports that are still imported elsewhere (check with `grep`).
If the file is empty after cleanup, delete it entirely.

### Task 3.4 — Integration test for snapshot builder

**File:** `cloud/apps/api/tests/services/analysis/domain-analysis-snapshot-builder.test.ts`
(or add to existing test file if one exists)

Using the test database (`DATABASE_URL` + `JWT_SECRET` env vars), seed:
- One definition with a known value pair
- Source runs for that definition
- Transcripts with known outcomes at different pressure levels

Call `buildSnapshotOutput` and assert:
- `models[0].valueWinRates` contains non-null values for the value pair
- `models[0].counts` contains non-zero counts
- `valueWinRates` reflects equal-weight cell methodology (not observation-weighted)

### Task 3.5 — Production smoke test (pre-merge, manual)

Before creating the PR, run via MCP `graphql_query`:
```graphql
query {
  domainAnalysis(domainId: "<known-domain-id>", signature: "<known-signature>") {
    models {
      model
      valueWinRates { key value }
    }
  }
}
```
Confirm: non-null, non-zero `valueWinRates` for at least one model. Record response in PR description.

[CHECKPOINT]

---

## Verification checklist

- [ ] `npm run lint --workspace @valuerank/api` passes
- [ ] `npm run test --workspace @valuerank/api` passes
- [ ] `npm run build --workspace @valuerank/api` passes (catches dangling imports from aggregator removal)
- [ ] Production smoke test completed and documented in PR

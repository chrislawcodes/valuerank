$(cat ~/.claude/templates/codex-impl-preamble.txt 2>/dev/null || echo "You are a TypeScript engineer. Implement exactly what is specified. Do not refactor unrelated code. Do not add comments unless the WHY is non-obvious. Fix all TypeScript errors properly — no @ts-ignore, no eslint-disable, no cast to any.")

## TASK: Implement cell-weighted win rates for Domain Analysis

This feature replaces the Domain Analysis snapshot builder's use of `analysis_results.output`
with a transcript-based aggregation that gives equal weight to each pressure cell, each vignette,
and each domain. The guiding principle: **more trials in a cell give you more confidence, not
more weight.**

## REPO ROOT: /Users/chrislaw/valuerank/.claude/worktrees/quirky-fermi-47d94b

Run all build/lint/test commands from `cloud/` inside the repo root.

---

## WAVE 1: Create transcript-cell-accumulator.ts

### File to CREATE:
`cloud/apps/api/src/services/analysis/transcript-cell-accumulator.ts`

### What it does:
A pure function (no DB, no I/O) that takes an array of transcript rows and returns a flat map
of per-cell win/loss/neutral counts.

### Types and exports:

```typescript
import type { DomainAnalysisValueKey } from '../../graphql/queries/domain-analysis-values.js';

export type CellKey = {
  definitionId: string;
  modelId: string;
  valueKey: DomainAnalysisValueKey;   // always the "own" value (canonical first = alphabetically smaller)
  ownLevel: number;                    // 1–5
  opponentLevel: number;               // 1–5
};

export type CellCounts = {
  wins: number;
  losses: number;
  neutrals: number;
};

// Encode/decode for Map keying
export function encodeCellKey(key: CellKey): string {
  return `${key.definitionId}::${key.modelId}::${key.valueKey}::${key.ownLevel}::${key.opponentLevel}`;
}

export function decodeCellKey(encoded: string): CellKey {
  const [definitionId, modelId, valueKey, ownLevelStr, opponentLevelStr] = encoded.split('::');
  // ... parse and return CellKey
}

export type TranscriptForAccumulation = {
  id: string;
  runId: string;
  modelId: string;
  decisionMetadata: unknown;
  definitionSnapshot: unknown;
  deletedAt: Date | null;
  scenario: {
    id: string;
    content: unknown;
    orientationFlipped: boolean;
    deletedAt: Date | null;
  } | null;
};

export function accumulateTranscriptCells(params: {
  transcripts: TranscriptForAccumulation[];
  filteredSourceRunDefinitionById: Map<string, string>;
}): Map<string, CellCounts>
```

### Implementation (for each transcript):

1. Skip if `transcript.deletedAt != null`
2. Skip if `transcript.scenario == null || transcript.scenario.deletedAt != null`
3. Look up `definitionId = filteredSourceRunDefinitionById.get(transcript.runId)` — skip if undefined
4. Parse value pair from `transcript.definitionSnapshot`:
   - Cast to `{ components?: { value_first?: { token?: unknown }; value_second?: { token?: unknown } } }`
   - Extract `valueFirstToken` and `valueSecondToken` as strings
   - Use `canonicalOwnOpponent(valueFirstToken, valueSecondToken)` from
     `../../services/pressure-sensitivity/value-pair.js` to get `[firstValueToken, secondValueToken]`
     (alphabetically sorted)
   - Skip if either token is not a valid `DomainAnalysisValueKey` (use `DOMAIN_ANALYSIS_VALUE_KEYS`
     from `../../graphql/queries/domain-analysis-values.js`)
5. Parse dimensions from `transcript.definitionSnapshot`:
   - Cast to `{ dimensions?: unknown[] }`
   - Each dimension has shape `{ name?: unknown; levels?: unknown; values?: unknown }` (DefinitionDimension from scenarios-utils.ts)
   - Find the dimension matching `firstValueToken` (by `dim.name`)
   - Find the dimension matching `secondValueToken` (by `dim.name`)
6. Build level lookups using `buildSafeLevelLookup(dim)` from
   `../../graphql/queries/scenarios-utils.js`
   - If either lookup has `exclusionReason != null`, skip this transcript
7. Parse `scenario.content` for dimension values:
   - Cast to `{ dimensionValues?: Record<string, unknown> }`
   - Skip if `dimensionValues` is missing or not an object
8. Call `assignOwnOpponentLevels(dimensions, dimensionValues, ownLookup.lookup, opponentLookup.lookup, firstValueToken, secondValueToken)` from
   `../../services/pressure-sensitivity/value-pair.js`
   - Skip if returns null
9. Call `resolveTranscriptDecisionModel({ decisionMetadata, definitionSnapshot, orientationFlipped, pairOverride: { valueA: firstValueToken, valueB: secondValueToken } })` from
   `../../graphql/queries/domain/decision-model.js`
   - Skip if `resolved.canonical.direction === 'unknown'`
10. Determine outcome using `assignOwnOpponent(valueFirstToken, valueSecondToken, resolved.canonical.direction)` from `../../services/pressure-sensitivity/value-pair.js`
11. Record in cell map:
    - Key for `firstValueToken`'s perspective: `encodeCellKey({ definitionId, modelId, valueKey: firstValueToken as DomainAnalysisValueKey, ownLevel: levels.ownLevel, opponentLevel: levels.opponentLevel })`
    - Key for `secondValueToken`'s perspective: `encodeCellKey({ definitionId, modelId, valueKey: secondValueToken as DomainAnalysisValueKey, ownLevel: levels.opponentLevel, opponentLevel: levels.ownLevel })`
    - For `firstValueToken`'s cell: outcome `own_picked` → wins++, `opponent_picked` → losses++, `neutral` → neutrals++
    - For `secondValueToken`'s cell: the MIRROR — if first won, second lost; neutrals same

### Tests to create:
`cloud/apps/api/tests/services/analysis/transcript-cell-accumulator.test.ts`

Import from the new file. Use `vitest`. Create minimal mock transcript objects.

Test cases:
1. **Happy path**: transcript for definition "def1", model "m1", cell (ownLevel=1, opponentLevel=2), first value wins → `firstValueToken` cell has wins=1 losses=0 neutrals=0; `secondValueToken` cell has wins=0 losses=1 neutrals=0
2. **Neutral outcome**: both value cells get neutrals=1
3. **Unknown direction**: transcript skipped, map empty
4. **Deleted transcript** (`deletedAt != null`): skipped
5. **Missing scenario** (`scenario == null`): skipped
6. **Deleted scenario**: skipped
7. **runId not in map**: skipped
8. **Empty transcript array**: returns empty Map
9. **Invalid value token** (not a DomainAnalysisValueKey): skipped

---

## WAVE 2: Create domain-analysis-cell-win-rates.ts

### File to CREATE:
`cloud/apps/api/src/services/analysis/domain-analysis-cell-win-rates.ts`

### Imports:
- `decodeCellKey, CellCounts` from `./transcript-cell-accumulator.js`
- `computePairwiseWinRate` from `../../utils/pairwise-math.js`
- `DomainAnalysisValueKey, DOMAIN_ANALYSIS_VALUE_KEYS` from `../../graphql/queries/domain-analysis-values.js`
- `DomainAnalysisValueCounts` from `../../graphql/queries/domain/shared.js`

### Types:
```typescript
export type CellWeightedDomainModel = {
  model: string;
  counts: Record<string, DomainAnalysisValueCounts>;
  pairwiseWins: Record<string, Record<string, number>>;
  valueWinRates: Record<string, number>;   // 0–100
  vignetteCount: Record<string, number>;
};
```

### Function signature:
```typescript
export function computeCellWeightedDomainRates(params: {
  cellMap: Map<string, CellCounts>;
  filteredSourceRunDefinitionById: Map<string, string>;
  definitionValuePairById: Map<string, { valueA: DomainAnalysisValueKey; valueB: DomainAnalysisValueKey }>;
}): { models: CellWeightedDomainModel[]; analyzedDefinitionIds: Set<string> }
```

### Algorithm:

**Step 1 — decode all cells:**
For each key in `cellMap`:
- `decodeCellKey(key)` → `{ definitionId, modelId, valueKey, ownLevel, opponentLevel }`
- Compute `rate = computePairwiseWinRate(counts.wins, counts.losses, counts.neutrals)`
- If `rate === null`, skip (zero-trial cell)

**Step 2 — group by (modelId, definitionId, valueKey):**
Build: `Map<modelId, Map<definitionId, Map<valueKey, number[]>>>` — collecting all non-null cell rates.

**Step 3 — vignette rate (per definitionId+valueKey):**
For each (modelId, definitionId, valueKey): `vignetteRate = sum(rates) / rates.length`
If `rates.length === 0`, this vignette contributes nothing.

**Step 4 — domain rate (per modelId+valueKey):**
Collect vignette rates per (modelId, valueKey). `domainRate = sum(vignetteRates) / vignetteRates.length`.
If `vignetteRates.length === 0`, this (modelId, valueKey) has no entry in `valueWinRates`.
Store `valueWinRates[valueKey] = domainRate * 100`.
Store `vignetteCount[valueKey] = vignetteRates.length`.

**Step 5 — raw counts (for display):**
Sum `wins → prioritized`, `losses → deprioritized`, `neutrals → neutral` across ALL cells
for each (modelId, valueKey) regardless of zero-trial status.
`counts[valueKey] = { prioritized, deprioritized, neutral }`

**Step 6 — pairwiseWins:**
For each cell where `counts.wins > 0`:
- Look up the pair for `definitionId` from `definitionValuePairById`
- `pairwiseWins[modelId][valueKey][opponentValueKey] += counts.wins`
  where opponentValueKey is the other value in the pair

**Step 7 — analyzedDefinitionIds:**
A definition is "analyzed" if it contributed at least one non-excluded cell.

**Build models array:**
One entry per modelId that appears in any cell. Sort by `model` (alphabetical).
Return `{ models, analyzedDefinitionIds }`.

### Tests to create:
`cloud/apps/api/tests/services/analysis/domain-analysis-cell-win-rates.test.ts`

Test cases:
1. **Equal-weight**: cell (1,1) with 100 wins + cell (2,2) with 10 wins → vignette rate = (100/100 + 10/10)/2 = 1.0, not 110/110 = 1.0... use a more distinguishing example: cell A has 100 wins 0 losses, cell B has 10 wins 90 losses → mean of (1.0, 0.1) = 0.55, not (110/200) = 0.55. Try: cell A has 70 wins 30 losses 0 neutral = 0.7, cell B has 20 wins 80 losses 0 neutral = 0.2 → cell-weighted = 0.45, observation-weighted = 90/200 = 0.45. Try asymmetric: cell A has 8 wins 2 losses (0.8), cell B has 2 wins 8 losses (0.2), cell-weighted = 0.5; but if A has 10 trials and B has 1 trial (observation-weighted = 8+2)/11 ≠ 0.5). Use: cell A has 8 wins 2 losses 0 neutrals = rate 0.8; cell B has 1 win 0 losses 0 neutrals = rate 1.0 → cell-weighted = 0.9, but observation weighted = 9/11 ≈ 0.818.
2. **Zero-trial cell excluded**: cell with 0 wins 0 losses 0 neutrals → excluded from mean
3. **Single vignette, single cell**: domain rate = cell rate
4. **Multiple vignettes**: domain rate = arithmetic mean of vignette rates
5. **All cells excluded for vignette**: that vignette has no entry in valueWinRates
6. **Empty cell map**: returns `{ models: [], analyzedDefinitionIds: Set() }`
7. **NaN guard**: averaging zero vignettes → value key absent from `valueWinRates`, NOT `0` or `NaN`
8. **counts.prioritized** = total wins across ALL cells (including zero-trial cells — they count for `counts` even if excluded from win rate)
9. **pairwiseWins** correctly maps valueKey → opponentValueKey → win count

---

## WAVE 3: Wire into snapshot builder + cleanup

### 3A. Modify domain-analysis-snapshot-builder.ts

File: `cloud/apps/api/src/services/analysis/domain-analysis-snapshot-builder.ts`

In `buildSnapshotOutput`:

1. **Remove** the `analysisRows` database query — the one that selects `output` from `analysis_result` where `runId IN filteredSourceRunIds`. Keep only the fingerprint query (the one selecting just `runId, inputHash`).

2. **Remove** the `aggregateAnalysisRows` import and call.

3. **Add** a paginated per-model transcript query. Since Domain Analysis doesn't filter by specific models, query all transcripts for the scoped runs without a modelId filter. Follow the pattern in `circumplex/aggregation.ts` lines 99–161 BUT without the per-model split — just do one query for all runs:

```typescript
const transcripts = state.resolvedSignatureRuns.filteredSourceRunIds.length === 0
  ? []
  : await db.transcript.findMany({
      where: {
        runId: { in: state.resolvedSignatureRuns.filteredSourceRunIds },
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
    });
```

4. **Call** `accumulateTranscriptCells({ transcripts, filteredSourceRunDefinitionById: state.resolvedSignatureRuns.filteredSourceRunDefinitionById })`

5. **Call** `computeCellWeightedDomainRates({ cellMap, filteredSourceRunDefinitionById: state.resolvedSignatureRuns.filteredSourceRunDefinitionById, definitionValuePairById: valuePairByDefinition })`

6. **Build** `models` array from the `CellWeightedDomainModel[]` returned by `computeCellWeightedDomainRates`. The shape already matches `DomainAnalysisSnapshotModel` (check `domain-analysis-cache-types.ts` for the type).

7. **Keep** the `valuePairByDefinition` call (already exists at line ~131) — needed for `computeCellWeightedDomainRates`.

8. **Keep** `buildContributionAndExcludedSummary` if it still compiles without `analysisRows`. If it requires `analysisRows`, check whether it can be adapted to accept the new cell data or simply removed if unused in the snapshot output. Do NOT break the build.

9. **Use** `analyzedDefinitionIds` from `computeCellWeightedDomainRates` in the existing `missingDefinitions` logic.

### 3B. Bump code version

File: `cloud/apps/api/src/services/analysis/domain-analysis-cache-types.ts`

Change: `export const DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION = '1.6.0';`
To:     `export const DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION = '1.7.0';`

### 3C. Clean up domain-analysis-snapshot-aggregator.ts

File: `cloud/apps/api/src/services/analysis/domain-analysis-snapshot-aggregator.ts`

Remove `aggregateAnalysisRows` and any types/helpers that are only used by it and nothing else.
Check with grep before deleting each export. If the file becomes empty, delete it.

Keep:
- `toCountsRecord` if still imported elsewhere
- `toPairwiseRecord` if still imported elsewhere

---

## VERIFICATION (run from cloud/ directory)

After all waves:

```bash
npm run lint --workspace @valuerank/shared
npm run lint --workspace @valuerank/api
npm run build --workspace @valuerank/api
```

Fix all TypeScript errors properly. No `@ts-ignore`, no `any`, no `eslint-disable`.

---

## DO NOT MODIFY

`CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `MEMORY.md`, `.gitignore`,
`schema.graphql`, generated GraphQL types, `pressure-sensitivity/aggregation.ts`,
`pressure-sensitivity/value-pair.ts`, or any file not listed in the scope above.

If you discover a file that seems to need updating that is not listed, note it in your output
but do not write it.

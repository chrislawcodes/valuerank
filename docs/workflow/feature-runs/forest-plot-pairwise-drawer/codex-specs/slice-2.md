# Slice 2 — Backend Resolver + GraphQL Surface

## Context
Wave 1, Slice 2 of `forest-plot-pairwise-drawer`. Slice 1 added the math utilities (`wilsonCI95`, `computeISquared`). This slice wires those into a new GraphQL resolver `domainAnalysisPairDetail` that powers the upcoming drawer.

Read these for context before editing:
- `/Users/chrislaw/valuerank/.claude/worktrees/unruffled-thompson-930258/docs/workflow/feature-runs/forest-plot-pairwise-drawer/spec.md` — full spec; especially FR-012 through FR-016, FR-013 vignette fields, FR-014 pooled stats + PooledMeanDivergenceError, Key Entities section.
- `/Users/chrislaw/valuerank/.claude/worktrees/unruffled-thompson-930258/docs/workflow/feature-runs/forest-plot-pairwise-drawer/plan.md` — Slice 2 section.
- `cloud/apps/api/src/graphql/queries/domain/analysis/value-detail.ts` — the existing single-value resolver. Use this as the structural template; reuse its data-loading helpers where possible.
- `cloud/apps/api/src/graphql/queries/domain/analysis/value-detail-types.ts` — for the existing Pothos types pattern.
- `cloud/apps/api/src/services/circumplex/aggregation.ts` — the matrix cell-value source; the new resolver's `pooledMean` must match the value the matrix already computes for the same model+signature+pair.
- `cloud/apps/api/src/utils/pairwise-math.ts` — has `computePairwiseWinRate` (existing) and `computeISquared` (just added).
- `cloud/apps/api/src/utils/binomial-ci.ts` — has `wilsonCI95` (just added).
- `cloud/apps/api/src/graphql/queries/index.ts` — query registration index; new resolvers register as a side effect of being imported here.
- `cloud/apps/web/src/api/operations/domainAnalysis.ts` — existing web operations; you'll add a new query here.
- `cloud/apps/web/src/generated/graphql.ts` — generated; you'll regenerate it via `npm run codegen --workspace @valuerank/web`.

## What to build

### NEW: `cloud/apps/api/src/graphql/queries/domain/analysis/pair-detail-types.ts`

Define the Pothos object types for the pair-detail resolver. Mirror the pattern in `value-detail-types.ts`. Required types:

```ts
export type DomainAnalysisPairVignetteDetail = {
  definitionId: string;
  definitionName: string;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalTrials: number;
  selectedValueWinRate: number | null;
  winRateCI95Low: number | null;
  winRateCI95High: number | null;
  refusalRate: number | null;
  framingDirection: 'A_TO_B' | 'B_TO_A';
};

export type DomainAnalysisPairDetailResult = {
  rowValueKey: string;
  columnValueKey: string;
  modelId: string;
  modelLabel: string;
  domainId: string | null;
  domainName: string | null;
  vignettes: DomainAnalysisPairVignetteDetail[];
  pooledMin: number | null;
  pooledMean: number | null;
  pooledMax: number | null;
  iSquared: number | null;
  vignetteCount: number;
  validEstimateCount: number;
};
```

Build the corresponding Pothos types `DomainAnalysisPairVignetteDetailRef` and `DomainAnalysisPairDetailResultRef`. Expose all fields above. `framingDirection` is a string enum — declare it as a Pothos enumType (or an enum + nullable string with documentation; match the codebase's convention by reading what value-detail-types.ts does for similar enum-ish fields).

Add custom typed errors used by FR-012 / FR-014:

```ts
export class MultipleVignettesPerDirectionError extends Error {
  readonly code = 'MULTIPLE_VIGNETTES_PER_DIRECTION';
  constructor(public readonly pairKey: string, public readonly direction: 'A_TO_B' | 'B_TO_A', public readonly definitionIds: string[]) {
    super(
      `Multiple vignettes found for pair ${pairKey} direction ${direction}: ${definitionIds.join(', ')}. The data model assumes one vignette per (pair, direction); this is a hard invariant.`
    );
    this.name = 'MultipleVignettesPerDirectionError';
  }
}

export class PooledMeanDivergenceError extends Error {
  readonly code = 'POOLED_MEAN_DIVERGENCE';
  constructor(public readonly drawerMean: number, public readonly matrixMean: number, public readonly tolerance: number) {
    super(
      `Drawer pooledMean (${drawerMean}) diverges from matrix cell value (${matrixMean}) by more than ${tolerance}. This indicates a data-consistency bug between the new pair-detail resolver and the existing matrix aggregation.`
    );
    this.name = 'PooledMeanDivergenceError';
  }
}
```

### NEW: `cloud/apps/api/src/graphql/queries/domain/analysis/pair-detail.ts`

Register the query field `domainAnalysisPairDetail` (use the same builder pattern as `domainAnalysisValueDetail` in `value-detail.ts`).

Args:
- `valueA: String!`
- `valueB: String!`
- `modelId: String!`
- `domainId: ID` (nullable)
- `signature: String` (nullable)

Resolver algorithm:

1. **Load data** the same way `value-detail.ts` does: find definitions in scope (filtered by `domainId` when provided and `deletedAt: null`), select the latest definition per lineage, fetch the latest run per definition, fetch transcripts and scenarios. You may extract the shared scaffold into a helper if it's clean to do so, or keep the bodies parallel.

2. **Filter to the requested pair**. For each definition's `valuePairByDefinition` entry, the pair `(valueA_def, valueB_def)` matches the query when:
    - `valueA_def === valueA && valueB_def === valueB` → `framingDirection = 'A_TO_B'` (this vignette presents the pair in the direction the query asked for)
    - `valueA_def === valueB && valueB_def === valueA` → `framingDirection = 'B_TO_A'`
    - Otherwise → not part of this cell, skip

3. **Enforce Assumption 0 (FR-012)**: After filtering and grouping by `(pairKey, framingDirection)`, if any group has more than one definition, throw `MultipleVignettesPerDirectionError`. The pair key can be `[valueA, valueB].sort().join('|')`.

4. **Per-vignette stats**: For each surviving vignette compute:
    - prioritized, deprioritized, neutral (use the same canon-favored-value logic as in `value-detail.ts`; re-read its body to mirror exactly. Note: in the pair-detail resolver, "prioritized" means "rowValueKey was favored," which equals `valueA` per the query args).
    - totalTrials = prioritized + deprioritized + neutral
    - selectedValueWinRate = `computePairwiseWinRate(prioritized, deprioritized, neutral)`
    - winRateCI95Low / winRateCI95High = `wilsonCI95(prioritized, totalTrials)` destructured (or null when totalTrials===0)
    - refusalRate = `totalTrials === 0 ? null : neutral / totalTrials`
    - framingDirection from step 2

5. **Cell-level pooled stats** (FR-014): Filter vignettes where `totalTrials > 0 && selectedValueWinRate !== null`. Then:
    - validEstimateCount = filtered vignette count
    - pooledMin = min of survivors' selectedValueWinRate (null if validEstimateCount === 0)
    - pooledMax = max
    - pooledMean = unweighted arithmetic mean
    - iSquared = `computeISquared(survivors.map(v => ({ winRate: v.selectedValueWinRate, totalTrials: v.totalTrials })))`

6. **Verify equivalence with matrix** (FR-014 strictness):
    - Open `cloud/apps/api/src/services/circumplex/aggregation.ts` and find the function that computes the per-pair-per-model win rate that the existing `pairwiseWinRates` query returns (read the file in full first so you understand the call chain).
    - Compute the matrix-side pooledMean for this model+signature+pair using whatever helper / function is available there.
    - If `Math.abs(drawerMean - matrixMean) > 1e-9` (when both are non-null), throw `PooledMeanDivergenceError`.
    - If the existing matrix code path is structurally hard to invoke from this resolver (e.g., it operates on a different cache shape), prefer to refactor the shared aggregation into a small pure helper (e.g., into `pairwise-math.ts`) and call it from both places. Document the refactor briefly in the resolver's leading comment.

7. **Return**: a `DomainAnalysisPairDetailResult` with rowValueKey=valueA, columnValueKey=valueB, modelId, modelLabel (look it up), domainId, domainName (look it up if domainId is provided, else null), vignettes (sorted by definitionName for stability), pooledMin/Mean/Max, iSquared, vignetteCount=total found vignettes, validEstimateCount.

### EXTEND: `cloud/apps/api/src/graphql/queries/index.ts`

Add an import for the new file so its `builder.queryField` registration runs as a side effect:

```ts
import './domain/analysis/pair-detail.js';
```

(Or `.ts` — match whatever extension the existing imports in this file use.)

### EXTEND: `cloud/apps/web/src/api/operations/domainAnalysis.ts`

Add types and a query for the drawer:

```ts
export type DomainAnalysisPairVignetteDetail = {
  definitionId: string;
  definitionName: string;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalTrials: number;
  selectedValueWinRate: number | null;
  winRateCI95Low: number | null;
  winRateCI95High: number | null;
  refusalRate: number | null;
  framingDirection: 'A_TO_B' | 'B_TO_A';
};

export type DomainAnalysisPairDetailResult = {
  rowValueKey: string;
  columnValueKey: string;
  modelId: string;
  modelLabel: string;
  domainId: string | null;
  domainName: string | null;
  vignettes: DomainAnalysisPairVignetteDetail[];
  pooledMin: number | null;
  pooledMean: number | null;
  pooledMax: number | null;
  iSquared: number | null;
  vignetteCount: number;
  validEstimateCount: number;
};

export type DomainAnalysisPairDetailQueryResult = {
  domainAnalysisPairDetail: DomainAnalysisPairDetailResult;
};

export type DomainAnalysisPairDetailQueryVariables = {
  valueA: string;
  valueB: string;
  modelId: string;
  domainId?: string | null;
  signature?: string | null;
};

export const DOMAIN_ANALYSIS_PAIR_DETAIL_QUERY = gql`
  query DomainAnalysisPairDetail(
    $valueA: String!
    $valueB: String!
    $modelId: String!
    $domainId: ID
    $signature: String
  ) {
    domainAnalysisPairDetail(
      valueA: $valueA
      valueB: $valueB
      modelId: $modelId
      domainId: $domainId
      signature: $signature
    ) {
      rowValueKey
      columnValueKey
      modelId
      modelLabel
      domainId
      domainName
      vignettes {
        definitionId
        definitionName
        prioritized
        deprioritized
        neutral
        totalTrials
        selectedValueWinRate
        winRateCI95Low
        winRateCI95High
        refusalRate
        framingDirection
      }
      pooledMin
      pooledMean
      pooledMax
      iSquared
      vignetteCount
      validEstimateCount
    }
  }
`;
```

### REGENERATE: `cloud/apps/web/src/generated/graphql.ts`

After you've added the new query to `domainAnalysis.ts`, run from `cloud/`:

```bash
npm run codegen --workspace @valuerank/web
```

This will regenerate `cloud/apps/web/src/generated/graphql.ts`. The generated file will have new types backing the query.

## DO NOT MODIFY

- `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `cloud/agents.md`, `MEMORY.md`, `.gitignore`
- The Slice 1 files: `binomial-ci.ts`, `pairwise-math.ts` (only if you genuinely need to add a small shared helper for FR-014 verification, and only with a leading comment explaining why)
- Any frontend file other than `domainAnalysis.ts` operations and the regenerated `generated/graphql.ts`
- The existing `domainAnalysisValueDetail` resolver and types — leave them entirely alone
- If you think another file needs updating, note it in your output but do not write it.

## Verification

Run from `cloud/` and report results:

1. `npx turbo lint --filter=@valuerank/api`
2. `npx turbo build --filter=@valuerank/api`
3. `DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" JWT_SECRET="test-secret-that-is-at-least-32-characters-long" npm --workspace @valuerank/api exec -- vitest run` (run the existing api tests; the new resolver does not need a unit test in this slice — Slice 3 will add an integration test)
4. `npm run codegen --workspace @valuerank/web` (must complete cleanly with no errors)
5. `npx turbo build --filter=@valuerank/web` (typechecks the regenerated types)

All MUST pass. No `@ts-ignore` directives.

## Output

Print a short summary of the new files and the resolver structure. Confirm verification commands pass. Note any places you needed to refactor existing code (e.g., FR-014 verification helper) so Sonnet can review intentionally. Do not commit — Sonnet will commit after reviewing the diff.

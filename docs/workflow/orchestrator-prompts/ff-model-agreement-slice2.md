# Codex Prompt — Model Agreement on Tradeoffs · Slice 2: Math Library + Pothos Types

You are implementing **slice 2 of 5** in a Feature Factory feature. The full design is in:

- Spec: `docs/workflow/feature-runs/model-agreement-on-tradeoffs/spec.md`
- Plan: `docs/workflow/feature-runs/model-agreement-on-tradeoffs/plan.md`
- Tasks: `docs/workflow/feature-runs/model-agreement-on-tradeoffs/tasks.md`

**Read those three docs first.** This prompt is a focused task list for slice 2 only.

Slice 1 already shipped (see commit `2524e3c2`). The snapshot now carries `cellLevelOutcomes` and a reader function `readCellLevelOutcomesFromSnapshot` is available.

## Repo

- Working branch: `ff/model-agreement-on-tradeoffs`
- Working dir: repo root
- Do NOT push or open a PR.

## What this slice does

Pure math library + GraphQL types. No resolver wiring, no UI. Resolver consumes these in slice 3.

## Files to create (3 new + 1 test file, ~250 lines)

1. `cloud/apps/api/src/services/model-agreement/math.ts` — pure math functions
2. `cloud/apps/api/tests/services/model-agreement/math.test.ts` — unit tests
3. `cloud/apps/api/src/graphql/types/model-agreement-on-tradeoffs.ts` — Pothos type definitions

## Implementation details

### File 1 — `math.ts`

Exports:

```typescript
export const MIN_TRIALS_FOR_CONSISTENCY = 2;
export const KAPPA_TIE_EPSILON = 1e-9;

/** True when proportionA is within KAPPA_TIE_EPSILON of 0.5 (exact ties + floating-point drift). */
export function isTied(proportionA: number): boolean;

/**
 * Cohen's kappa from observed and chance agreement rates.
 * Returns null when chanceAgreement === 1 (degenerate — both raters always agreed by marginal chance).
 * Throws if inputs are outside [0, 1] (defensive — these come from internal computation).
 */
export function cohensKappa(observedAgreement: number, chanceAgreement: number): number | null;

/**
 * Maps a kappa value to a Landis-Koch interpretation label.
 * Returns null when kappa is null.
 */
export type KappaLabel = 'Poor (worse than chance)' | 'Slight' | 'Fair' | 'Moderate' | 'Substantial' | 'Near-perfect';
export function kappaInterpretation(kappa: number | null): KappaLabel | null;

/**
 * Percent agreement = matchedCells / totalCells. Returns null when totalCells === 0.
 */
export function percentAgreement(matchedCells: number, totalCells: number): number | null;

/**
 * Equal-weight aggregation: mean over vignettes of mean over cells within each vignette.
 * Outer array = vignettes; inner array = per-cell values within that vignette.
 * Returns null when every vignette is empty (or array is empty).
 */
export function equalWeightAggregate(perVignetteValues: ReadonlyArray<ReadonlyArray<number>>): number | null;
```

**Bucket boundaries for `kappaInterpretation`:**
- `< 0` → `'Poor (worse than chance)'`
- `[0, 0.2)` → `'Slight'`
- `[0.2, 0.4)` → `'Fair'`
- `[0.4, 0.6)` → `'Moderate'`
- `[0.6, 0.8)` → `'Substantial'`
- `[0.8, 1.0]` → `'Near-perfect'`

### File 2 — `math.test.ts`

Use the same vitest patterns as existing `cloud/apps/api/tests/` files. Cover at minimum:

| Test name | Assertion |
|-----------|-----------|
| cohensKappa perfect agreement, 50/50 chance | `cohensKappa(1.0, 0.5)` ≈ `1.0` |
| cohensKappa observed equals chance | `cohensKappa(0.5, 0.5)` === `0` |
| cohensKappa worst possible | `cohensKappa(0.0, 0.5)` === `-1` |
| cohensKappa degenerate chance=1 | `cohensKappa(0.0, 1.0)` === `null` |
| kappaInterpretation null in null out | `kappaInterpretation(null)` === `null` |
| kappaInterpretation 0.65 substantial | `kappaInterpretation(0.65)` === `'Substantial'` |
| kappaInterpretation 0.8 near-perfect | `kappaInterpretation(0.8)` === `'Near-perfect'` |
| kappaInterpretation -0.1 poor | `kappaInterpretation(-0.1)` === `'Poor (worse than chance)'` |
| kappaInterpretation 0 slight | `kappaInterpretation(0)` === `'Slight'` |
| percentAgreement 0/0 | `percentAgreement(0, 0)` === `null` |
| percentAgreement 5/10 | `percentAgreement(5, 10)` === `0.5` |
| equalWeightAggregate sparse vignette doesn't bias | `equalWeightAggregate([Array(25).fill(0.6), Array(5).fill(0.6)])` ≈ `0.6` |
| equalWeightAggregate 1-cell vs 25-cell equal weight | `equalWeightAggregate([[1.0], Array(25).fill(0.0)])` === `0.5` |
| equalWeightAggregate empty | `equalWeightAggregate([[]])` === `null` |
| equalWeightAggregate completely empty | `equalWeightAggregate([])` === `null` |
| isTied exact 0.5 | `isTied(0.5)` === `true` |
| isTied 1/2 | `isTied(1/2)` === `true` |
| isTied 2/4 | `isTied(2/4)` === `true` |
| isTied 3/6 | `isTied(3/6)` === `true` |
| isTied within epsilon | `isTied(0.5000000001)` === `true` |
| isTied 0.49 | `isTied(0.49)` === `false` |
| isTied 0.51 | `isTied(0.51)` === `false` |

### File 3 — `model-agreement-on-tradeoffs.ts` (Pothos types)

Mirror the structure of the existing `cloud/apps/api/src/graphql/types/model-grouping-significance.ts` (which you can read for reference but do NOT modify or import from it — that file is deleted in slice 5).

Define these types EXACTLY per spec § Output schema with the plan-revision additions:

```graphql
type ModelAgreementResult {
  pending: Boolean!
  models: [ModelInfo!]!
  unavailableModels: [UnavailableModelInfo!]!
  excludedNonBinaryCells: Int!
  excludedTiedCells: Int!
  pairwiseAgreementMatrix: [PairwiseAgreementRow!]!
  trialConsistency: [ModelTrialConsistency!]!
}

type PairwiseAgreementRow {
  modelAId: ID!
  modelALabel: String!
  modelBId: ID!
  modelBLabel: String!
  totalCells: Int!
  percentAgreement: Float       # nullable when totalCells == 0
  cohensKappa: Float            # nullable when totalCells == 0 OR P_chance == 1
  kappaInterpretation: String   # nullable whenever cohensKappa is null
  meanAbsoluteDivergence: Float # nullable when totalCells == 0
}

type ModelTrialConsistency {
  modelId: ID!
  modelLabel: String!
  cellsObserved: Int!
  meanTrialConsistency: Float   # nullable when cellsObserved == 0
  noisy: Boolean!
}

type ModelInfo {
  modelId: ID!
  label: String!
}

type UnavailableModelInfo {
  modelId: ID!
  label: String!
  reason: String!
}

type PairDivergenceBreakdown {
  pending: Boolean!
  modelAId: ID!
  modelALabel: String!
  modelBId: ID!
  modelBLabel: String!
  perValuePair: [ValuePairDivergence!]!
}

type ValuePairDivergence {
  valueA: String!
  valueB: String!
  cellsCompared: Int!
  meanAbsoluteDivergence: Float # nullable when cellsCompared == 0
  modelAProportionA: Float      # nullable when cellsCompared == 0
  modelBProportionA: Float      # nullable when cellsCompared == 0
}
```

Export `ModelAgreementResultRef` and `PairDivergenceBreakdownRef` (and any inner shape types needed by the resolver in slice 3) — match the export pattern of `ModelGroupingSignificanceResultRef`.

DO NOT register query fields here — that happens in slice 3 (`builder.queryField`).

## Verification

1. `cd /Users/chrislaw/valuerank/cloud && npm run build --workspace @valuerank/api` — must succeed.
2. `npm run lint --workspace @valuerank/api` — zero NEW warnings.
3. `npm run test --workspace @valuerank/api -- math.test` — all unit tests pass.

## Commit

ONE commit:

```
ff(model-agreement) slice 2: math library + Pothos types

- Adds cloud/apps/api/src/services/model-agreement/math.ts with cohensKappa,
  kappaInterpretation, percentAgreement, equalWeightAggregate, isTied
- Adds cloud/apps/api/tests/services/model-agreement/math.test.ts with full
  coverage of edge cases (degenerate kappa, 0/0, tied cells, sparse vignettes)
- Adds cloud/apps/api/src/graphql/types/model-agreement-on-tradeoffs.ts with
  Pothos type defs for both queries (matrix + drilldown)

Slice 2 of 5. See docs/workflow/feature-runs/model-agreement-on-tradeoffs/.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

## Constraints

- Files in this slice are PURE additions. Do not modify any existing file other than the new ones listed.
- No resolver registration — that's slice 3.
- DO NOT push, DO NOT open a PR.
- DO NOT MODIFY: `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `cloud/agents.md`, `MEMORY.md`, `.gitignore`, `docs/workflow/feature-runs/model-agreement-on-tradeoffs/spec.md`, `plan.md`, `tasks.md`. If you think another file needs updating, note it but do not write it.
- No `@ts-ignore`, no `eslint-disable`, no `any` casts.

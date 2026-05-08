# Codex Prompt — Model Agreement on Tradeoffs · Slice 4: Frontend Components

You are implementing **slice 4 of 5** in a Feature Factory feature. The full design is in:

- Spec: `docs/workflow/feature-runs/model-agreement-on-tradeoffs/spec.md`
- Plan: `docs/workflow/feature-runs/model-agreement-on-tradeoffs/plan.md`
- Tasks: `docs/workflow/feature-runs/model-agreement-on-tradeoffs/tasks.md`

**Read those three docs first.** This prompt is a focused task list for slice 4 only.

Slices 1-3 already shipped. The new GraphQL queries `modelAgreementOnTradeoffs` and `modelPairDivergenceBreakdown` are live on the API. You're building the frontend components that consume them.

## Repo

- Working branch: `ff/model-agreement-on-tradeoffs`
- Working dir: repo root
- Do NOT push or open a PR.

## What this slice does

Builds all new web UI components and the GraphQL operations file, runs codegen. NOT yet wired into `ModelsGroups.tsx` — that's slice 5.

## Files (8+ new + 1 git mv refactor, ~400 lines)

1. NEW: `cloud/apps/web/src/api/operations/modelAgreementOnTradeoffs.graphql` — both query operations
2. RENAMED: `cloud/apps/web/src/components/models/ModelGroupingSignificanceHeatmap.tsx` → `ModelAgreementHeatmap.tsx`. Use `git mv`. Then refactor (see below).
3. RENAMED: `cloud/apps/web/src/components/models/ModelGroupingSignificanceHeatmap.test.tsx` → `ModelAgreementHeatmap.test.tsx`. Use `git mv`. Update tests for the new shape.
4. NEW: `cloud/apps/web/src/components/models/ModelAgreementSection.tsx` — top-level container
5. NEW: `cloud/apps/web/src/components/models/PairwiseAgreementMatrixReport.tsx` + `.test.tsx`
6. NEW: `cloud/apps/web/src/components/models/ModelTrialConsistencyReport.tsx` + `.test.tsx`
7. NEW: `cloud/apps/web/src/components/models/PairwiseDivergenceDrilldownReport.tsx` + `.test.tsx`

## Implementation details

### File 1 — `modelAgreementOnTradeoffs.graphql`

Two operations:

```graphql
query ModelAgreementOnTradeoffs(
  $modelIds: [ID!]!
  $domainId: ID
  $scope: String!
  $signature: String!
) {
  modelAgreementOnTradeoffs(
    modelIds: $modelIds
    domainId: $domainId
    scope: $scope
    signature: $signature
  ) {
    pending
    excludedNonBinaryCells
    excludedTiedCells
    models { modelId label }
    unavailableModels { modelId label reason }
    pairwiseAgreementMatrix {
      modelAId
      modelALabel
      modelBId
      modelBLabel
      totalCells
      percentAgreement
      cohensKappa
      kappaInterpretation
      meanAbsoluteDivergence
    }
    trialConsistency {
      modelId
      modelLabel
      cellsObserved
      meanTrialConsistency
      noisy
    }
  }
}

query ModelPairDivergenceBreakdown(
  $modelAId: ID!
  $modelBId: ID!
  $domainId: ID
  $scope: String!
  $signature: String!
) {
  modelPairDivergenceBreakdown(
    modelAId: $modelAId
    modelBId: $modelBId
    domainId: $domainId
    scope: $scope
    signature: $signature
  ) {
    pending
    modelAId
    modelALabel
    modelBId
    modelBLabel
    perValuePair {
      valueA
      valueB
      cellsCompared
      meanAbsoluteDivergence
      modelAProportionA
      modelBProportionA
    }
  }
}
```

After creating this file: `cd /Users/chrislaw/valuerank/cloud && npm run codegen --workspace @valuerank/web`. This regenerates `cloud/apps/web/src/generated/graphql.ts`. Commit the regenerated file as part of slice 4.

### File 2-3 — Rename + refactor heatmap

```bash
cd /Users/chrislaw/valuerank/cloud/apps/web/src/components/models
git mv ModelGroupingSignificanceHeatmap.tsx ModelAgreementHeatmap.tsx
git mv ModelGroupingSignificanceHeatmap.test.tsx ModelAgreementHeatmap.test.tsx
```

Refactor `ModelAgreementHeatmap.tsx`:
- Rename component to `ModelAgreementHeatmap`.
- Change props: input is now `kappaMatrix: Array<{ modelAId, modelBId, modelALabel, modelBLabel, cohensKappa: number | null, totalCells, percentAgreement: number | null, kappaInterpretation: string | null }>` rather than the old p-value matrix.
- Color scale: red (kappa < 0) → white (kappa = 0) → green (kappa = 1). Symmetric diverging palette. If d3-scale-chromatic is not already a dep, hand-code three RGB stops and interpolate (no new deps).
- Cells with `cohensKappa === null` render as gray with a "—" label.
- Tooltip shows: model A label, model B label, kappa value (or "n/a"), interpretation, total cells, percent agreement.
- Update `ModelAgreementHeatmap.test.tsx` to match new shape — pass kappa-matrix data, assert color rendering and tooltips.

### File 4 — `ModelAgreementSection.tsx`

```tsx
type Props = {
  modelIds: string[];
  scope: 'DOMAIN' | 'ALL_DOMAINS';
  domainId: string | null;
  signature: string;
};

export function ModelAgreementSection(props: Props): JSX.Element {
  // Use the urql/Apollo pattern matching the existing ModelGroupingSignificanceSection
  // (read that file before deleting it for the pattern reference)
  // Fire useModelAgreementOnTradeoffsQuery with the props

  // Manage selectedPair state
  const [selectedPair, setSelectedPair] = useState<{ modelAId: string; modelBId: string } | null>(null);

  // On data load: pick default pair via highest-divergence-with-support rule.
  // Among rows with totalCells >= 10, the highest meanAbsoluteDivergence.
  // Fallback: row with the most totalCells. If matrix empty, no default.
  // useEffect to set selectedPair on data change.

  // If pending: render <SectionLoading />
  // If error: render <SectionError message={error.message} />
  // If unavailableModels.length > 0: render a small notice listing them
  // If excludedNonBinaryCells > 0 or excludedTiedCells > 0: small footnote near the matrix

  return (
    <section className="space-y-8">
      <h2 className="text-lg font-semibold text-gray-900">Model Agreement on Value Tradeoffs</h2>
      <PairwiseAgreementMatrixReport
        rows={data.pairwiseAgreementMatrix}
        onPairSelect={setSelectedPair}
        selectedPair={selectedPair}
      />
      <ModelTrialConsistencyReport rows={data.trialConsistency} />
      <PairwiseDivergenceDrilldownReport
        selectedPair={selectedPair}
        scope={props.scope}
        domainId={props.domainId}
        signature={props.signature}
      />
    </section>
  );
}
```

### File 5 — `PairwiseAgreementMatrixReport.tsx`

Renders the heatmap (using `ModelAgreementHeatmap`) and a companion table below. Table columns: Model A, Model B, Cells, Kappa, Interpretation, % Agreement, Mean Abs Divergence. Sortable by all numeric columns (start sorted by labels). Clicking a row calls `onPairSelect`. Rows with `totalCells === 0` render "no overlap" in metric cells. Empty/null metric values render as "—".

Test: ensure table renders all columns; clicking a row invokes the callback; empty matrix renders an empty-state message.

### File 6 — `ModelTrialConsistencyReport.tsx`

Per-row table: Model, Cells Observed, Trial Consistency (formatted as %), Noisy badge. Hard requirements:
- Info-icon next to "Trial Consistency" column header. On hover/focus, tooltip text: `"Measures the dominance of a model's modal choice across trials of the same scenario. 1.0 means the model gave the same answer every trial; 0.5 means it split 50/50. This conflates run-to-run variation with scenario-orientation flips and excludes single-trial cells."`
- Footnote below table with the same text.
- Test asserts both elements present (info-icon by aria-label or title attr, footnote by text content).

### File 7 — `PairwiseDivergenceDrilldownReport.tsx`

```tsx
type Props = {
  selectedPair: { modelAId: string; modelBId: string } | null;
  scope: 'DOMAIN' | 'ALL_DOMAINS';
  domainId: string | null;
  signature: string;
};
```

If `selectedPair === null`: render placeholder text "Select a model pair from the matrix above to see per-value-pair divergence."

Otherwise: fire `useModelPairDivergenceBreakdownQuery` with the four args. Render a header showing "Model A vs Model B" using the labels from the response. Table columns: Value Pair (e.g. "Achievement vs Tradition"), Cells Compared, Model A picks A, Model B picks A, Mean Abs Divergence. Sort by mean abs divergence descending.

Test: with a null selectedPair → renders placeholder. With a pair → renders the table; sort order verified by passing test data.

### Codegen (mandatory)

After creating the `.graphql` file:

```bash
cd /Users/chrislaw/valuerank/cloud
npm run codegen --workspace @valuerank/web
git diff cloud/apps/web/src/generated/graphql.ts | head -80
```

The diff should show new `ModelAgreementOnTradeoffsQuery` / `ModelPairDivergenceBreakdownQuery` types and hooks added. The OLD `ModelGroupingSignificance*` operations remain in `graphql.ts` until slice 5 deletes the old `.graphql` file. Don't manually edit `graphql.ts` — it's generated.

## Verification

1. `cd /Users/chrislaw/valuerank/cloud && npm run lint --workspace @valuerank/web` — zero new errors/warnings.
2. `npm run build --workspace @valuerank/web` — clean.
3. `npm run test --workspace @valuerank/web` — new tests pass; pre-existing tests still pass.

## Commit

ONE commit including the codegen output:

```
ff(model-agreement) slice 4: frontend components

- Renames ModelGroupingSignificanceHeatmap → ModelAgreementHeatmap (kappa color scale)
- Adds ModelAgreementSection (top-level container with default-pair selection)
- Adds PairwiseAgreementMatrixReport (heatmap + sortable table)
- Adds ModelTrialConsistencyReport (with mandatory info-icon + footnote)
- Adds PairwiseDivergenceDrilldownReport (separate query, fires only on pair selection)
- Adds modelAgreementOnTradeoffs.graphql with both query operations
- Regenerates graphql.ts (old operations remain until slice 5)
- Tests for all new components

Slice 4 of 5. See docs/workflow/feature-runs/model-agreement-on-tradeoffs/.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

## Constraints

- DO NOT modify `ModelsGroups.tsx`, `ModelGroupingSignificanceTable.tsx`, `ModelGroupingSignificanceSection.tsx`, `modelGroupingSignificance.ts`, or `modelGroupingSignificance.graphql`. They are deleted in slice 5.
- DO NOT push, DO NOT open a PR.
- DO NOT MODIFY: `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `cloud/agents.md`, `MEMORY.md`, `.gitignore`, FF spec/plan/tasks files.
- No `@ts-ignore`, no `eslint-disable`, no `any` casts.
- ALWAYS run codegen after editing `.graphql` files (per MEMORY.md — skipping codegen ships stale types).

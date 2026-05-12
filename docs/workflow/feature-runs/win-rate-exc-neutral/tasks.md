# Tasks — Win Rate (Exc. Neutral) Toggle

**Created:** 2026-05-11
**Status:** Tasks
**Slug:** win-rate-exc-neutral

## Implementation Notes from Review Reconciliation

- **Aggregation correctness (Codex MEDIUM):** `aggregateValueWinRates` weights by arithmetic mean of rates — neutrals are NOT in the weighting denominator. Parallel exc-neutral inputs through the same hierarchy is correct. Confirmed by reading `value-win-rate-aggregation.ts` (pure O(n) mean-of-means).
- **Test coverage (Gemini HIGH):** Slice 4 tests must cover all four report components, not just `PairwiseWinRateMatrix`. Explicit tests added below.
- **Call site audit:** `computeCellWeightedDomainRates` has one call site (`buildSnapshotOutput` line 255). `buildSnapshotOutput` has two call sites: `refreshDomainAnalysisSnapshot` (line 360) and the batching test file (line 90). Both updated here.

DO NOT MODIFY: `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `MEMORY.md`, `.gitignore`, `STATUS.md`.

---

## Slice 1 — Backend: aggregation + snapshot types + Phase 2 write [CHECKPOINT]

### Task 1.1 — Add `valueWinRatesExcNeutral` to snapshot model type

**File:** `cloud/apps/api/src/services/analysis/domain-analysis-cache-types.ts`

After line 42 (`valueWinRates?: Record<string, number>;`), add:
```ts
valueWinRatesExcNeutral?: Record<string, number>;
```

---

### Task 1.2 — Compute parallel exc-neutral rates in `computeCellWeightedDomainRates`

**File:** `cloud/apps/api/src/services/analysis/domain-analysis-cell-win-rates.ts`

The function signature at line 95 returns `{ models: CellWeightedDomainModel[]; analyzedDefinitionIds: Set<string> }`. Extend to also return `excNeutralValueWinRatesByModel: Map<string, Record<string, number>>`.

**Step A — New accumulation map.** After the declaration of `ratesByModelDefinitionValue` (line ~99), add:
```ts
const excNeutralRatesByModelDefinitionValue = new Map<string, Map<string, Map<DomainAnalysisValueKey, number[]>>>();
```

**Step B — Accumulate exc-neutral rates in cell loop.** In the cell loop, after the existing `rate` computation and null-guard (line ~118-119 — `if (rate === null) continue;`), add before `analyzedDefinitionIds.add`:
```ts
const excNeutralRate = computePairwiseWinRate(counts.wins, counts.losses, 0);
if (excNeutralRate !== null) {
  const excNeutralModelRates = excNeutralRatesByModelDefinitionValue.get(decoded.modelId)
    ?? new Map<string, Map<DomainAnalysisValueKey, number[]>>();
  if (!excNeutralRatesByModelDefinitionValue.has(decoded.modelId)) {
    excNeutralRatesByModelDefinitionValue.set(decoded.modelId, excNeutralModelRates);
  }
  const excNeutralValueRates = excNeutralModelRates.get(decoded.definitionId)
    ?? new Map<DomainAnalysisValueKey, number[]>();
  if (!excNeutralModelRates.has(decoded.definitionId)) {
    excNeutralModelRates.set(decoded.definitionId, excNeutralValueRates);
  }
  const excRates = excNeutralValueRates.get(decoded.valueKey) ?? [];
  excRates.push(excNeutralRate);
  excNeutralValueRates.set(decoded.valueKey, excRates);
}
```

**Step C — Build exc-neutral inputs and aggregate per model.** Before the models `return` statement, add:
```ts
const excNeutralValueWinRatesByModel = new Map<string, Record<string, number>>();
```

Inside the model build loop (line ~149), after `aggregateValueWinRates(inputs)` and building `valueWinRates`, add:
```ts
const excNeutralModelRates = excNeutralRatesByModelDefinitionValue.get(modelId)
  ?? new Map<string, Map<DomainAnalysisValueKey, number[]>>();
const excNeutralInputs: ValueRateInput[] = [];
for (const [definitionId, valueRatesByDefinition] of excNeutralModelRates.entries()) {
  const pair = params.definitionValuePairById.get(definitionId);
  if (pair == null) continue;
  const pairKey = `${pair.valueA}::${pair.valueB}`;
  const directionKey: DomainAnalysisValueKey = pair.valueFirst ?? pair.valueA;
  for (const [valueKey, rates] of valueRatesByDefinition.entries()) {
    if (rates.length === 0) continue;
    const vignetteRate = rates.reduce((sum, r) => sum + r, 0) / rates.length;
    excNeutralInputs.push({ domainId: SNAPSHOT_DOMAIN_ID, definitionId, valueKey, pairKey, directionKey, vignetteRate });
  }
}
const aggregatedExcNeutralRates = aggregateValueWinRates(excNeutralInputs);
const excNeutralValueWinRates: Record<string, number> = {};
for (const [valueKey, result] of aggregatedExcNeutralRates.entries()) {
  if (result.crossDomainRate == null) continue;
  excNeutralValueWinRates[valueKey] = result.crossDomainRate * 100;
}
excNeutralValueWinRatesByModel.set(modelId, excNeutralValueWinRates);
```

`ValueRateInput` is imported via the existing `import { aggregateValueWinRates } from './value-win-rate-aggregation.js'` — confirm the type is exported from that file (it is, at line 1).

**Step D — Return the new map.** Change final `return { models, analyzedDefinitionIds };` to:
```ts
return { models, analyzedDefinitionIds, excNeutralValueWinRatesByModel };
```

---

### Task 1.3 — Thread `excNeutralValueWinRatesByModel` through `buildSnapshotOutput`

**File:** `cloud/apps/api/src/services/analysis/domain-analysis-snapshot-builder.ts`

At line 255, change destructuring:
```ts
const { models, analyzedDefinitionIds, excNeutralValueWinRatesByModel } = computeCellWeightedDomainRates({ ... });
```

Change the return type of `buildSnapshotOutput` from `Promise<DomainAnalysisSnapshotOutput>` to:
```ts
Promise<{ output: DomainAnalysisSnapshotOutput; excNeutralValueWinRatesByModel: Map<string, Record<string, number>> }>
```

Rename the assembled return value to `output` and return both:
```ts
const output: DomainAnalysisSnapshotOutput = {
  domainId: state.domain.id,
  ...
};
return { output, excNeutralValueWinRatesByModel };
```

**Fix test call site:** `cloud/apps/api/tests/services/analysis/domain-analysis-snapshot-builder-batching.test.ts` line 90. Update to destructure `{ output }` and use `output` where the old return value was used.

---

### Task 1.4 — Add Phase 2 conditional write in `refreshDomainAnalysisSnapshot`

**File:** `cloud/apps/api/src/services/analysis/domain-analysis-cache.ts`

At line 360, change:
```ts
const output = await buildSnapshotOutput(state, { ... });
```
to:
```ts
const { output, excNeutralValueWinRatesByModel } = await buildSnapshotOutput(state, { ... });
```

After the Phase 1 write (after `const snapshot = await db.assumptionAnalysisSnapshot.update(...)` at ~line 373-378), add Phase 2:
```ts
// Phase 2: merge exc-neutral rates into the CURRENT snapshot (conditional on status).
const mergedModels = output.models.map((m) => {
  const excNeutralRates = excNeutralValueWinRatesByModel.get(m.model);
  if (excNeutralRates == null || Object.keys(excNeutralRates).length === 0) return m;
  return { ...m, valueWinRatesExcNeutral: excNeutralRates };
});
const mergedOutput = { ...output, models: mergedModels };
const phase2Result = await db.assumptionAnalysisSnapshot.updateMany({
  where: { id: progressSnapshot.id, status: 'CURRENT' },
  data: { output: mergedOutput },
});
if (phase2Result.count === 0) {
  log.info({ snapshotId: progressSnapshot.id }, 'Phase 2 exc-neutral write skipped — snapshot superseded');
}
```

Use the logger already available in the file (check existing `log` or `logger` variable).

---

### Task 1.5 — Tests for Slice 1

**File:** `cloud/apps/api/tests/services/analysis/domain-analysis-cell-win-rates.test.ts` (existing)

Add:
1. **Exc-neutral computed correctly.** Fixture: wins=3, losses=2, neutrals=5. Assert `excNeutralValueWinRatesByModel` returns 60 for that value key (3/5 × 100).
2. **All-neutral cell excluded.** Fixture: wins=0, losses=0, neutrals=5. Assert no exc-neutral entry for that value key.
3. **No-neutral cell: standard equals exc-neutral.** Fixture: wins=3, losses=2, neutrals=0. Assert both rates are equal.

**File:** `cloud/apps/api/tests/services/analysis/domain-analysis-snapshot-builder-batching.test.ts` (update)

Fix destructuring after the `buildSnapshotOutput` change. Assert `output` is defined.

**Phase 2 test:** In `cache.test.ts` or a new file, mock `db.assumptionAnalysisSnapshot.updateMany` and assert it is called with `{ where: { id: expect.any(String), status: 'CURRENT' } }` during `refreshDomainAnalysisSnapshot`.

---

## Slice 2 — Backend: GraphQL schema + resolvers [CHECKPOINT]

### Task 2.1 — Add `winRateExcNeutral` to `DomainAnalysisValueScore`

**File:** `cloud/apps/api/src/graphql/queries/domain/shared.ts`

Add to `DomainAnalysisValueScore` (line 68–75):
```ts
winRateExcNeutral: number | null;
```

**File:** `cloud/apps/api/src/services/analysis/domain-analysis-cache.ts`

In the model value build loop (lines ~186–198), where each value object is built, add:
```ts
const excNeutralDenom = wins + losses;
winRateExcNeutral: excNeutralDenom > 0 ? wins / excNeutralDenom : null,
```

**File:** `cloud/apps/api/src/graphql/queries/domain/types.ts`

In `builder.objectType(DomainAnalysisValueScoreRef)` (line ~243), add:
```ts
winRateExcNeutral: t.field({
  type: 'Float',
  nullable: true,
  resolve: (parent) => parent.winRateExcNeutral,
}),
```

---

### Task 2.2 — Add `winRateExcNeutralMatrix` to `PairwiseWinRateModel`

**File:** `cloud/apps/api/src/graphql/queries/domain/types.ts`

Add to `PairwiseWinRateModel` type (line ~52–56):
```ts
winRateExcNeutralMatrix: Array<Array<number | null>>;
```

In `builder.objectType(PairwiseWinRateModelRef)` (line ~254), add:
```ts
winRateExcNeutralMatrix: t.field({
  type: [t.listRef('Float', { nullable: true })],
  nullable: true,
  resolve: (parent) => parent.winRateExcNeutralMatrix,
}),
```

**File:** `cloud/apps/api/src/services/analysis/domain-analysis-cache.ts`

Modify `buildPairwiseWinRateModel` (line ~75) to compute and return `winRateExcNeutralMatrix`. Inside the inner loop (line ~86–102):
- Add `const excNeutralWinRateRow: Array<number | null> = [];` inside the outer loop.
- Compute `const excNeutralTotal = winsIJ + winsJI;` and push `excNeutralTotal > 0 ? winsIJ / excNeutralTotal : null`.
- Collect into `excNeutralWinRateMatrix` (initialized before outer loop).
- Return `{ valueOrder: order, winRateMatrix, winRateExcNeutralMatrix, trialCountMatrix }`.

---

### Task 2.3 — Add exc-neutral fields to `modelsAnalysis`

**File:** `cloud/apps/api/src/graphql/types/models-analysis.ts`

Add to `ModelsAnalysisDomainBreakdownShape`:
```ts
winRateExcNeutral: number | null;
```

Add to `ModelsAnalysisValueResultShape`:
```ts
pooledWinRateExcNeutral: number | null;
```

Register fields in `builder.objectType(ModelsAnalysisDomainBreakdownRef)`:
```ts
winRateExcNeutral: t.field({ type: 'Float', nullable: true, resolve: (d) => d.winRateExcNeutral }),
```

Register field in `builder.objectType(ModelsAnalysisValueResultRef)`:
```ts
pooledWinRateExcNeutral: t.field({ type: 'Float', nullable: true, resolve: (v) => v.pooledWinRateExcNeutral }),
```

**File:** `cloud/apps/api/src/graphql/queries/models-analysis.ts`

In the snapshot loop (~line 123–154), when pushing a contribution, add `winRateExcNeutral: model.valueWinRatesExcNeutral?.[valueKey] ?? null`.

Update `buildValueResult` to compute `pooledWinRateExcNeutral`:
```ts
const eligibleExcNeutral = eligibleDomains.filter((d) => d.winRateExcNeutral != null);
const pooledWinRateExcNeutral = eligibleExcNeutral.length > 0
  ? computePooledWinRate(
      eligibleExcNeutral.map((d) => ({ evidenceWeight: d.evidenceWeight!, winRate: d.winRateExcNeutral! }))
    )
  : null;
```

Update `buildEmptyValueResult` to include `pooledWinRateExcNeutral: null`.

---

### Task 2.4 — Tests for Slice 2

Add to `cloud/apps/api/tests/services/analysis/domain-analysis-cell-win-rates.test.ts` or a new file:
1. `winRateExcNeutral` = `prioritized / (prioritized + deprioritized)` when denominator > 0.
2. `winRateExcNeutral` = null when `prioritized + deprioritized = 0`.
3. `pooledWinRateExcNeutral` = null when no contributions have `winRateExcNeutral` non-null.
4. `pooledWinRateExcNeutral` uses only contributions with non-null `winRateExcNeutral`.

---

## Slice 3 — Frontend: AnalysisContextBar + page state + API types + codegen [CHECKPOINT]

### Task 3.1 — Add toggle to `AnalysisContextBar`

**File:** `cloud/apps/web/src/components/analysis/AnalysisContextBar.tsx`

Add optional prop to `AnalysisContextBarProps`:
```ts
winRateMode?: {
  value: 'all' | 'exc-neutral';
  onChange: (mode: 'all' | 'exc-neutral') => void;
  disabled?: boolean;
};
```

Add to the function destructuring. Render after the models picker:
```tsx
{winRateMode != null && (
  <ContextField label="Win rate">
    <div className="flex gap-1">
      {(['all', 'exc-neutral'] as const).map((mode) => (
        <button
          key={mode}
          onClick={() => { if (!winRateMode.disabled) winRateMode.onChange(mode); }}
          disabled={winRateMode.disabled}
          title={winRateMode.disabled ? 'Only applies when data source is Win Rate' : undefined}
          className={cn(
            'rounded px-2 py-0.5 text-sm',
            winRateMode.value === mode ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700',
            winRateMode.disabled === true && 'cursor-not-allowed opacity-50',
          )}
        >
          {mode === 'all' ? 'All responses' : 'Exc. neutral'}
        </button>
      ))}
    </div>
  </ContextField>
)}
```

Use the existing `ContextField` helper and `cn` import.

---

### Task 3.2 — Add `winRateMode` state to `DomainAnalysis.tsx`

**File:** `cloud/apps/web/src/pages/DomainAnalysis.tsx`

Add:
```ts
const [winRateMode, setWinRateMode] = useState<'all' | 'exc-neutral'>('all');
```

Pass to `AnalysisContextBar`:
```tsx
winRateMode={{ value: winRateMode, onChange: setWinRateMode }}
```

---

### Task 3.3 — Add `winRateMode` state to `ModelsGroups.tsx`

**File:** `cloud/apps/web/src/pages/ModelsGroups.tsx`

Add:
```ts
const [winRateMode, setWinRateMode] = useState<'all' | 'exc-neutral'>('all');
```

Pass to `AnalysisContextBar`:
```tsx
winRateMode={{
  value: winRateMode,
  onChange: setWinRateMode,
  disabled: dataSource !== 'win-rate',
}}
```

---

### Task 3.4 — Extend GraphQL operations

**File:** `cloud/apps/web/src/api/operations/domainAnalysis.graphql`

In the `DomainAnalysis` query, add to values fragment: `winRateExcNeutral`

Add to pairwise win rate model fragment: `winRateExcNeutralMatrix`

**File:** `cloud/apps/web/src/api/operations/modelsAnalysis.ts`

Update `ModelsAnalysisDomainBreakdown`: add `winRateExcNeutral: number | null;`

Update `ModelsAnalysisValueResult`: add `pooledWinRateExcNeutral: number | null;`

Update `MODELS_ANALYSIS_QUERY`: add `pooledWinRateExcNeutral` to values block, add `winRateExcNeutral` to domains block.

---

### Task 3.5 — Run codegen

```bash
npm run codegen --workspace @valuerank/web
```

from `cloud/`. Must exit 0. Commit generated files.

---

### Task 3.6 — Update manual type in `domainAnalysis.ts`

**File:** `cloud/apps/web/src/api/operations/domainAnalysis.ts`

Add `winRateExcNeutral: number | null;` to `DomainAnalysisValueScore` (line 31–38).

---

### Task 3.7 — Tests for Slice 3

Test file for `AnalysisContextBar` (find existing test or create one):
1. Renders both toggle buttons when `winRateMode` prop is provided.
2. Toggle not rendered when `winRateMode` is omitted.
3. Buttons disabled and titled when `disabled=true`.
4. Clicking "Exc. neutral" calls `onChange('exc-neutral')`.
5. Clicking "All responses" calls `onChange('all')`.

---

## Slice 4 — Frontend: wire reports [CHECKPOINT]

### Task 4.1 — Wire `winRateMode` through `ValuePrioritiesSection` and `ValuePrioritiesTable`

**File:** `cloud/apps/web/src/components/domains/ValuePrioritiesSection.tsx`
Add `winRateMode: 'all' | 'exc-neutral'` prop. Pass through to `ValuePrioritiesTable`.

**File:** `cloud/apps/web/src/components/domains/ValuePrioritiesTable.tsx`
Add `winRateMode: 'all' | 'exc-neutral'` prop.

Wherever per-value win rate is read (find the existing `winRate` read or score display), replace with:
```ts
const effectiveWinRate = winRateMode === 'exc-neutral' && value.winRateExcNeutral != null
  ? value.winRateExcNeutral
  : standardWinRate;
```

When `winRateMode === 'exc-neutral'` and `value.winRateExcNeutral === null && value.prioritized + value.deprioritized === 0`, show "n/a" for that cell.

Show indicator near section header when `winRateMode === 'exc-neutral'` and `pooledWinRateExcNeutral` is null across all visible models for this domain. Indicator text: "Exc. neutral data not yet available — showing all responses."

---

### Task 4.2 — Wire `winRateMode` through `DominanceSection`

**File:** `cloud/apps/web/src/components/domains/DominanceSection.tsx`
Add `winRateMode: 'all' | 'exc-neutral'` prop.

Where value scores are used for the dominance graph nodes, apply:
```ts
const effectiveScore = winRateMode === 'exc-neutral' && value.winRateExcNeutral != null
  ? value.winRateExcNeutral
  : value.score;
```

Fall back to standard score when exc-neutral is null.

---

### Task 4.3 — Wire `winRateMode` through `PairwiseWinRateMatrix`

**File:** `cloud/apps/web/src/components/domains/PairwiseWinRateMatrix.tsx`
Add `winRateMode: 'all' | 'exc-neutral'` prop.

Where `m.pairwiseWinRateModel.winRateMatrix` is accessed (line ~98), replace with:
```ts
const matrix = winRateMode === 'exc-neutral' && m.pairwiseWinRateModel.winRateExcNeutralMatrix != null
  ? m.pairwiseWinRateModel.winRateExcNeutralMatrix
  : m.pairwiseWinRateModel.winRateMatrix;
```

`trialCountMatrix` stays as-is.

---

### Task 4.4 — Wire `winRateMode` through `DomainShiftsReportSection`

Find the component that renders per-domain win rate cells across models (search for `DomainShifts` or `domainShifts` in `cloud/apps/web/src/`). Add `winRateMode: 'all' | 'exc-neutral'` prop.

Where per-domain `winRate` is read, replace with:
```ts
const cellRate = winRateMode === 'exc-neutral' && domain.winRateExcNeutral != null
  ? domain.winRateExcNeutral
  : domain.winRate;
```

---

### Task 4.5 — Wire `winRateMode` to model groups page

**File:** `cloud/apps/web/src/pages/ModelsGroups.tsx`

Where `ModelEntry.winRates` is built from `modelsAnalysis` data, change the value:
```ts
winRates: Object.fromEntries(
  DOMAIN_ANALYSIS_VALUE_KEYS.map((key) => {
    const valueResult = valueMap.get(key);
    const rate = winRateMode === 'exc-neutral' && dataSource === 'win-rate'
      ? (valueResult?.pooledWinRateExcNeutral ?? valueResult?.pooledWinRate ?? null)
      : (valueResult?.pooledWinRate ?? null);
    return [key, rate];
  }),
),
```

No changes needed inside `ModelGroupsSection` or cluster charts.

---

### Task 4.6 — Thread `winRateMode` from page to all reports

**File:** `cloud/apps/web/src/pages/DomainAnalysis.tsx`

Pass `winRateMode` to:
- `<ValuePrioritiesSection winRateMode={winRateMode} .../>`
- `<DominanceSection winRateMode={winRateMode} .../>`
- `<PairwiseWinRateMatrix winRateMode={winRateMode} .../>`
- `<DomainShiftsReportSection winRateMode={winRateMode} .../>`

---

### Task 4.7 — Tests for Slice 4

**File:** `cloud/apps/web/src/components/domains/PairwiseWinRateMatrix.test.tsx`
1. `winRateMode='exc-neutral'` with non-null `winRateExcNeutralMatrix` → uses exc-neutral matrix values.
2. `winRateMode='exc-neutral'` with null `winRateExcNeutralMatrix` → falls back to standard matrix.

**File:** `cloud/apps/web/src/components/domains/ValuePrioritiesSection.test.tsx`
1. `winRateMode='exc-neutral'` with non-null `winRateExcNeutral` → shows exc-neutral value.
2. `winRateMode='exc-neutral'` with null `winRateExcNeutral` and `prioritized + deprioritized === 0` → shows "n/a".
3. `winRateMode='exc-neutral'` with null `winRateExcNeutral` and non-zero decisive responses → falls back to standard.

**File:** `cloud/apps/web/src/components/domains/DominanceSection.tsx` (new test or `__tests__` folder)
1. `winRateMode='exc-neutral'` with non-null `winRateExcNeutral` → uses exc-neutral value.
2. Null `winRateExcNeutral` → falls back to standard score.

**DomainShifts component test:**
1. `winRateMode='exc-neutral'` with non-null `winRateExcNeutral` → shows exc-neutral rate.
2. Null → falls back to standard `winRate`.

---

## Preflight Before PR

Run from `cloud/`:
```bash
npm run lint --workspace @valuerank/api
npm run test --workspace @valuerank/api
npm run build --workspace @valuerank/api
npm run codegen --workspace @valuerank/web
npm run lint --workspace @valuerank/web
npm run test --workspace @valuerank/web
npm run build --workspace @valuerank/web
```

All must pass with zero type errors.

---

## Post-Slice Verifications

**After Slice 1:** Trigger snapshot refresh on a domain with neutral responses. Confirm `valueWinRatesExcNeutral` appears in the snapshot output JSON.

**After Slice 2:** Query `modelsAnalysis` via MCP `graphql_query`. Confirm `pooledWinRateExcNeutral` is null for pre-feature snapshots and a plausible non-null value after rebuild. Confirm `winRateExcNeutral` on `DomainAnalysisValueScore` matches `prioritized / (prioritized + deprioritized)`.

**After Slice 3:** Codegen exits 0. `npm run build --workspace @valuerank/web` exits 0.

**After Slice 4 (browser):**
- Toggle switches visibly change numbers on a domain with non-trivial neutral rates (SC-001).
- On a pre-feature snapshot, toggle shows "All responses" data without errors (SC-002).
- Toggle visible on both pages; disabled on model groups page when data source is not "Win Rate" (SC-004).

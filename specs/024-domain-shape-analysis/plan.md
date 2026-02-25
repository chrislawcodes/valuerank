# Implementation Plan: Domain Analysis — Ranking Shape Analysis

**Spec**: [spec.md](./spec.md) | **Date**: 2026-02-25 | **Feature**: #024

## Summary

Add per-model ranking shape classification (dominant leader / gradual slope / no clear leader / bimodal) and domain-level benchmarks to the domain analysis result. All computation happens in the GraphQL resolver. Frontend adds a Shape column to the value priorities table with a tooltip showing the actual gap vs. domain average.

---

## Technical Context

| Attribute | Value |
|-----------|-------|
| **Primary file** | `cloud/apps/api/src/graphql/queries/domain.ts` (currently ~1530 lines — over limit) |
| **Assembly location** | Inline resolver at line ~1348, result built at lines ~1517–1529 |
| **BT score function** | `computeFullBTScores()` at line ~656 |
| **Frontend component** | `cloud/apps/web/src/components/domains/ValuePrioritiesSection.tsx` |
| **No new DB queries** | All inputs are BT scores already in memory |

---

## Architecture Decisions

### Decision 1: Compute in the resolver, not a new service

The `DomainAnalysisResult` assembly lives entirely in the GraphQL resolver (~lines 1348–1529 of `domain.ts`). Shape metrics are a pure computation over in-memory BT scores — no DB access required. Adding them as helper functions called from the resolver is the lowest-risk path that avoids a large refactor.

**File size note**: `domain.ts` is already ~1530 lines. Shape analysis adds ~60–80 lines of computation logic. This should be extracted into a co-located helper module (`domain-shape.ts`) to keep the resolver file from growing further. The helper exports one function: `computeRankingShapes(models)`.

### Decision 2: Two-pass computation

Pass 1: compute `topGap`, `bottomGap`, `spread`, `steepness` per model.
Pass 2: compute domain benchmarks (`domainMeanTopGap`, `domainStdTopGap`, `medianSpread`), then assign `dominanceZScore` and `label` to each model.

Both passes operate entirely on the in-memory `Map<string, number>` of BT scores per model.

### Decision 3: Frontend tooltip reads benchmark fields from API

The tooltip text (`"#1→#2 gap: X (domain avg: Y)"`) reads `domainMeanTopGap` from the new `rankingShapeBenchmarks` field on `DomainAnalysisResult`. The frontend does not re-derive from z-score.

---

## New/Modified Files

```
cloud/apps/api/src/graphql/queries/
├── domain.ts                          MODIFY: add rankingShape fields to types + resolver
└── domain-shape.ts                    NEW: computeRankingShapes() helper

cloud/apps/web/src/components/domains/
└── ValuePrioritiesSection.tsx         MODIFY: add Shape column + tooltip

cloud/apps/api/tests/graphql/queries/
└── domain-shape.test.ts               NEW: unit tests for shape computation
                                              (pure helper — no DB/GraphQL setup needed;
                                               location matches existing test structure
                                               even though the module has no DB access)

cloud/apps/web/tests/components/domains/
└── ValuePrioritiesSection.test.tsx    MODIFY: add shape column rendering tests
```

---

## GraphQL Schema Additions

```typescript
// domain.ts — add to DomainAnalysisModelRef builder
builder.objectType(DomainAnalysisModelRef, {
  fields: (t) => ({
    // ... existing fields ...
    rankingShape: t.field({
      type: RankingShapeRef,
      resolve: (model) => model.rankingShape,
    }),
  }),
});

// New type
const RankingShapeRef = builder.objectRef<RankingShape>('RankingShape');
builder.objectType(RankingShapeRef, {
  fields: (t) => ({
    label: t.string({ resolve: (s) => s.label }),
    topGap: t.float({ resolve: (s) => s.topGap }),
    bottomGap: t.float({ resolve: (s) => s.bottomGap }),
    spread: t.float({ resolve: (s) => s.spread }),
    steepness: t.float({ resolve: (s) => s.steepness }),
    dominanceZScore: t.float({ nullable: true, resolve: (s) => s.dominanceZScore }),
  }),
});

// domain.ts — add to DomainAnalysisResultRef builder
builder.objectType(DomainAnalysisResultRef, {
  fields: (t) => ({
    // ... existing fields ...
    rankingShapeBenchmarks: t.field({
      type: RankingShapeBenchmarksRef,
      resolve: (result) => result.rankingShapeBenchmarks,
    }),
  }),
});
```

---

## Implementation Phases

### Phase 1: Backend computation helper

Create `domain-shape.ts` with:
- `computeRawShapeMetrics(scores: number[]): { topGap, bottomGap, spread, steepness }` — pure function, inputs are 10 scores sorted descending
- `computeDomainBenchmarks(rawMetrics: RawMetrics[]): RankingShapeBenchmarks`
- `classifyShape(raw, benchmarks): RankingShape` — precedence-ordered classification per spec
- Export `computeRankingShapes(models: { model: string; sortedScores: number[] }[]): { shapes: Map<string, RankingShape>; benchmarks: RankingShapeBenchmarks }`

All functions are pure (no DB, no side effects). Unit-testable in isolation.

### Phase 2: Wire into resolver

In `domain.ts` resolver (~line 1461 where `modelsWithData.map()` builds the model array):
1. Extract sorted BT scores per model from the existing `Map<DomainAnalysisValueKey, number>`
2. Call `computeRankingShapes(...)` after the BT score loop
3. Attach `rankingShape` to each `DomainAnalysisModel` entry
4. Attach `rankingShapeBenchmarks` to the final `DomainAnalysisResult`

### Phase 3: GraphQL type definitions

Add `RankingShape` and `RankingShapeBenchmarks` Pothos object types to `domain.ts`. Add `rankingShape` field to `DomainAnalysisModelRef`. Add `rankingShapeBenchmarks` field to `DomainAnalysisResultRef`.

### Phase 4: Frontend

In `ValuePrioritiesSection.tsx`:
- Update the GraphQL query in `DomainAnalysis.tsx` to request `rankingShape` and `rankingShapeBenchmarks` from the API (source of truth)
- Map the GraphQL result fields into the component props — do not patch `ModelEntry` in `domainAnalysisData.ts` directly, as that type is a UI projection and does not drive the API contract
- Add `rankingShape: RankingShape` to the component-level model type used inside this component, derived from the GraphQL result
- Add `rankingShapeBenchmarks` to the section props
- Add a **Shape** column header between model name and first value column
- Per-model row: render a colored chip (`dominant` / `flat` / `bimodal` / `—`) with tooltip text `"#1→#2 gap: {topGap.toFixed(2)} (domain avg: {domainMeanTopGap.toFixed(2)})"`
- Shape column is sortable: clicking sorts by `rankingShape.steepness` descending

### Phase 5: Tests

**Backend** (`domain-shape.test.ts`):
- `computeRawShapeMetrics`: verify topGap, bottomGap, spread, steepness on known input
- `classifyShape`: one test per label; verify precedence (bimodal checked before dominant)
- Edge cases: N=1 model (no z-score), all identical scores (stddev=0 → all gradual_slope)

**Frontend** (`ValuePrioritiesSection.test.tsx`):
- Shape column renders with correct label chip for each label type
- Tooltip content includes topGap and domainMeanTopGap
- Sort by steepness orders models correctly

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Thresholds produce wrong labels on real data | Mark thresholds as named constants in `domain-shape.ts` for easy adjustment post-launch |
| `domain.ts` grows further | Extract computation into `domain-shape.ts` before adding lines to the resolver |
| Frontend type diverges from API | Map `rankingShape` from the GraphQL result in `DomainAnalysis.tsx` and pass via component props — do not update `domainAnalysisData.ts` (UI projection, not API contract) |

---

## Helper Module Ownership Convention

All three domain analysis enhancement features (#024, #025, #026) follow the same pattern:

- **Location**: `cloud/apps/api/src/graphql/queries/domain-{feature}.ts` — co-located with the resolver that calls them, not under `services/`
- **Rationale**: These are pure computation helpers that have no DB access and no reuse outside the domain analysis resolver. Placing them under `services/` would imply broader ownership they don't have. Co-location keeps the dependency graph clear.
- **Tests**: `cloud/apps/api/tests/graphql/queries/domain-{feature}.test.ts` — matches the file location convention. Tests are pure unit tests (no DB setup, no GraphQL execution) despite the `graphql/queries/` path.
- **If this convention changes** (e.g., the helpers gain DB access or cross-feature reuse), move to `services/domain/` with an `index.ts` re-export.

---

## Calibration Step (Pre-Launch)

Before merging to main, run the shape computation against at least one real domain and verify:
- At least one model receives each label (or document why some labels don't appear)
- The `bimodal` guard (`spread > 0.3`) doesn't suppress real bimodal profiles
- The absolute fallback thresholds (N < 4) produce sensible labels

Document results in a comment block at the top of `domain-shape.ts`.

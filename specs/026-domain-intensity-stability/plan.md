# Implementation Plan: Domain Analysis — Intensity Stability

**Spec**: [spec.md](./spec.md) | **Date**: 2026-02-25 | **Feature**: #026

## Summary

Add per-stratum Bradley-Terry analysis to domain analysis: split transcripts by scenario intensity level (derived from `scenario.content.dimensions`), recompute BT scores per stratum, and flag values whose ranking changes materially between low and high intensity. Requires expanding the transcript query to include scenario dimension data — currently absent from the domain analysis query.

---

## Technical Context

| Attribute | Value |
|-----------|-------|
| **Primary file** | `cloud/apps/api/src/graphql/queries/domain.ts` (~1530 lines — over limit) |
| **Assembly location** | Inline resolver at ~line 1348, result built at ~lines 1517–1529 |
| **Current transcript query** | Lines ~1425–1436: selects only `runId`, `modelId`, `decisionCode` — **no scenario dimensions** |
| **BT score function** | `computeFullBTScores()` at ~line 656 — reused per stratum |
| **Value pairs function** | `resolveValuePairsInChunks()` at ~line 725 — maps transcript to which values competed |
| **Frontend component** | `cloud/apps/web/src/pages/DomainAnalysis.tsx` + new section component |

---

## Architecture Decisions

### Decision 1: Expand transcript query to include scenario dimensions

The transcript query currently selects `{ runId, modelId, decisionCode }`. To derive pair intensity, each transcript needs `scenario.content.dimensions`. Add:

```typescript
select: {
  runId: true,
  modelId: true,
  decisionCode: true,
  scenario: {
    select: { content: true },  // JsonB — includes dimensions: Record<string, number>
  },
},
```

This is a join over the transcripts already being fetched — no separate query. The `scenario.content` field is a JSON blob; extract `dimensions` in application code. Transcripts with null scenario or missing `dimensions` key are excluded from intensity stratification (still included in main BT).

**Note**: `scenario` relation may need to be added to the Prisma select if not already modeled — verify `transcript` schema has a `scenario` relation before implementing.

### Decision 2: Reuse `computeFullBTScores` per stratum

`computeFullBTScores(valueKeys, pairwiseWins)` is already a pure function. For each stratum, build a filtered `pairwiseWins` map from the stratum's transcripts, then call the existing function. No changes to the BT algorithm.

### Decision 3: Extract into a co-located helper module

`domain.ts` is already ~1530 lines. Intensity stability adds ~180–220 lines of non-trivial logic. Extract into `domain-intensity.ts`. Exports one function: `computeIntensityStability(models, transcriptsWithDimensions, valuePairsMap)`.

### Decision 4: Two-stratum default (low / high), medium as bonus

The medium stratum (intensity 2.5–3.4) may have insufficient data in many domains. The stability flag and `isUnstable` are derived from low vs. high only. Medium stratum data is computed and returned if sufficient, but not used in `isUnstable` or `sensitivityScore`. This gives the most reliable signal while exposing the medium data for future use.

### Decision 5: Two-phase skip evaluation

Skip conditions split into two phases based on what data is available:

**Pre-computation skips** (evaluated before any per-model BT work, using only transcript metadata):
1. `insufficient_dimension_coverage` — fewer than 30% of transcripts have `scenario.content.dimensions` populated → return early, skip entire section
2. `no_intensity_variation` — all dimension-bearing transcripts fall into the same stratum → return early, skip entire section

**Post-computation skip** (evaluated after per-model stratum BT runs):
3. `all_models_insufficient` — every model's low or high stratum is insufficient (count < 10 or disconnected graph) → skip section after computation, return `skipped: true`

`all_models_insufficient` cannot be evaluated pre-computation because it requires attempting the per-model stratum split first. The implementation reflects this: pre-check → compute → post-check.

---

## New/Modified Files

```
cloud/apps/api/src/graphql/queries/
├── domain.ts                          MODIFY: expand transcript query; add
│                                              intensityStability to types + resolver
└── domain-intensity.ts                NEW: computeIntensityStability() helper

cloud/apps/web/src/components/domains/
└── IntensityStabilitySection.tsx      NEW: section 4 UI component

cloud/apps/web/src/pages/
└── DomainAnalysis.tsx                 MODIFY: add section 4 to page layout

cloud/apps/api/tests/graphql/queries/
└── domain-intensity.test.ts           NEW: unit tests for intensity computation

cloud/apps/web/tests/components/domains/
└── IntensityStabilitySection.test.tsx NEW: section rendering tests
```

---

## GraphQL Schema Additions

```typescript
// New types
const StratumBTResultRef = builder.objectRef<StratumBTResult>('StratumBTResult');
const ValueStabilityResultRef = builder.objectRef<ValueStabilityResult>('ValueStabilityResult');
const ModelIntensityStabilityRef = builder.objectRef<ModelIntensityStability>('ModelIntensityStability');
const IntensityStabilityAnalysisRef = builder.objectRef<IntensityStabilityAnalysis>('IntensityStabilityAnalysis');

// Add to DomainAnalysisResultRef
intensityStability: t.field({
  type: IntensityStabilityAnalysisRef,
  resolve: (result) => result.intensityStability,
})
```

---

## Implementation Phases

### Phase 1: Verify and expand transcript query

1. Confirm `transcript` Prisma model has a `scenario` relation in `packages/db/prisma/schema.prisma`
2. Add `scenario: { select: { content: true } }` to the transcript `findMany` select in `domain.ts` (~line 1425)
3. Update the TypeScript type for the transcript result to include `scenario: { content: unknown } | null`
4. Write a helper `extractDimensions(scenarioContent: unknown): Record<string, number> | null` — returns null if content is missing or has no `dimensions` key

### Phase 2: Backend helper

Create `domain-intensity.ts` with:

1. `computePairIntensity(dims: Record<string, number>, valueA: string, valueB: string): number | null` — `(dims[A] + dims[B]) / 2`; null if either key missing
2. `stratifyTranscripts(transcripts, valuePairsMap): { low: Comparison[]; medium: Comparison[]; high: Comparison[] }` — buckets by average pair intensity using defined stratum boundaries
3. `isConnectedGraph(valueKeys: string[], comparisons: Comparison[]): boolean` — DFS connectivity check
4. `computeStratumBT(valueKeys, comparisons): StratumBTResult` — runs `computeFullBTScores` if count ≥ 10 and connected; returns `{ sufficient: false, insufficientReason: ... }` otherwise
5. `computeValueStability(lowResult, highResult): ValueStabilityResult[]` — rank delta, score delta, direction, isUnstable per value
6. `computeModelSensitivity(valueStability): { score: number | null; label: SensitivityLabel }` — uses `valuesWithSufficientData` as denominator
7. `evaluateDomainPreSkip(transcripts): { skipped: boolean; skipReason: SkipReason | null }` — checks pre-computation conditions only (`insufficient_dimension_coverage`, `no_intensity_variation`); called before per-model BT runs. The post-computation skip (`all_models_insufficient`) is evaluated in `computeIntensityStability` after per-model results are available.
8. Export: `computeIntensityStability(modelIds, transcriptsWithDimensions, valuePairsMap): IntensityStabilityAnalysis`

### Phase 3: Wire into resolver

In `domain.ts` resolver (~line 1461):
1. Pass the expanded transcript data (now including `scenario.content`) to the intensity computation
2. Call `computeIntensityStability(...)` after the main BT score loop
3. Attach `intensityStability` to `DomainAnalysisResult`

### Phase 4: GraphQL type definitions

Add all new Pothos object types to `domain.ts`. The `scores` field on `StratumBTResult` is a JSON scalar (dynamic keys). Add `intensityStability` field to `DomainAnalysisResultRef`.

### Phase 5: Frontend

Create `IntensityStabilitySection.tsx`:
- Props: `{ models: ModelIntensityStability[]; mostUnstableValues: string[]; skipped: boolean; skipReason: string | null }`
- If `skipped=true`: render appropriate skip message based on `skipReason`
- Domain-level callout at top: "X values are unstable in 2+ models" or "All rankings are stable"
- Per-model accordion rows: model name, sensitivity label chip, unstable value count
- Expanded row: 10-row table (Value | Low rank | High rank | Delta | Direction | Flag)
- Insufficient data rows: gray "Insufficient data" state; show `insufficientReason` on hover
- Amber highlight for `isUnstable = true` rows

In `DomainAnalysis.tsx`:
- Import and render `<IntensityStabilitySection>` as section 4
- Pass `intensityStability` from the GraphQL result

### Phase 6: Tests

**Backend** (`domain-intensity.test.ts`):
- `computePairIntensity`: known values, null when key missing
- `stratifyTranscripts`: correct bucket assignment at stratum boundaries
- `isConnectedGraph`: connected graph returns true; disconnected returns false
- `computeStratumBT`: < 10 comparisons → insufficient (low_count); disconnected → insufficient (disconnected_graph)
- `computeValueStability`: rank delta, score delta, direction derivation; null when stratum missing
- `computeModelSensitivity`: correct denominator with null scores; null sensitivityScore when no sufficient data
- `evaluateDomainSkip`: each skip condition triggers correct skipReason; correct precedence order
- `computeIntensityStability`: skipped=true when no dimensions; correct model output shape

**Frontend** (`IntensityStabilitySection.test.tsx`):
- Skip message renders for each `skipReason` value
- Domain callout shows correct unstable value count
- Accordion expands to show per-value table
- Amber highlight on unstable rows
- Gray state on insufficient data rows

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| `scenario` relation missing from transcript Prisma model | Verify schema in Phase 1 before any other work; if missing, add relation in a migration |
| Stratum query join significantly slows domain analysis | Measure query time before/after; if > 500ms regression, consider a separate lazy query triggered only when user opens section 4 |
| Medium stratum universally empty | Two-stratum default (Decision 4) ensures `isUnstable` is always based on low vs. high; medium shown as bonus only |
| `domain.ts` file size grows further | Mandatory extraction into `domain-intensity.ts` before adding to resolver |

---

## Helper Module Ownership Convention

See `specs/024-domain-shape-analysis/plan.md` — all three domain analysis enhancement features share the same co-location and test path convention. Helpers live under `graphql/queries/`, not `services/`, and tests are pure unit tests despite that path.

---

## Prerequisite Check (Before Phase 1)

1. Confirm `transcript` has a `scenario` relation in `packages/db/prisma/schema.prisma`
2. Run the existing domain analysis query on a real domain and log `transcript.scenario.content.dimensions` — verify dimensions are populated for > 30% of transcripts
3. If fewer than 30% have dimensions: this feature cannot be validated until vignette coverage improves; do not launch

Document results before proceeding.

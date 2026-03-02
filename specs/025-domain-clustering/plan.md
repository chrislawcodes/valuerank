# Implementation Plan: Domain Analysis — Cluster Analysis

**Spec**: [spec.md](./spec.md) | **Date**: 2026-02-25 | **Feature**: #025

## Summary

Add average-linkage hierarchical clustering over model value profiles to the domain analysis result. Produces named clusters, per-pair fault lines, and outlier detection. The existing client-side cosine similarity matrix is left untouched — the backend computes cosine distance internally for clustering purposes only and does not expose the matrix via the API.

---

## Technical Context

| Attribute | Value |
|-----------|-------|
| **Primary file** | `cloud/apps/api/src/graphql/queries/domain.ts` (~1530 lines — over limit) |
| **Assembly location** | Inline resolver at ~line 1348, result built at ~lines 1517–1529 |
| **BT score function** | `computeFullBTScores()` at ~line 656 |
| **Cosine similarity (current)** | **Client-side only** in React — not in the API. Must be added to backend. |
| **Frontend component** | `cloud/apps/web/src/components/domains/SimilaritySection.tsx` (or equivalent) |
| **No new DB queries** | All inputs are BT scores already in memory |

---

## Architecture Decisions

### Decision 1: Keep similarity matrix client-side; add clusterAnalysis to API only

Cosine similarity is currently computed client-side in React. The existing similarity matrix UI continues to work from client-side computation — no change. The API adds only `clusterAnalysis`, which is derived from the same BT score vectors that already reach the frontend.

The backend computes cosine distance internally within `domain-clustering.ts` (needed for UPGMA and silhouette scores), but does **not** return the raw similarity matrix via GraphQL. The frontend's existing matrix display is untouched. This avoids a breaking change to the similarity matrix contract and keeps this PR's scope contained to cluster analysis only.

### Decision 2: Extract clustering logic into a co-located helper module

`domain.ts` is already ~1530 lines. Clustering adds ~150–200 lines of non-trivial algorithm code. This must be extracted into `domain-clustering.ts` to avoid further inflating the resolver file. The helper exports one function: `computeClusterAnalysis(models)`.

### Decision 3: Pure TypeScript UPGMA implementation

Average-linkage hierarchical clustering at N ≤ 20 is O(N³) — trivially fast. No external library dependency. Implement inline in `domain-clustering.ts` with the following sub-functions:
- `computeCosineDistanceMatrix(models)` — builds the N×N distance matrix
- `upgma(distanceMatrix)` — returns dendrogram as merge steps with heights
- `cutDendrogram(mergeSteps)` — applies the largest-gap rule with 4-cluster cap
- `computeSilhouetteScores(assignments, distanceMatrix)` — per-model scores
- `nameCluster(centroid, domainMean)` — derives label with fallback

### Decision 4: faultLinesByPair covers all pairs

Fault lines are computed for every cluster pair and returned in `faultLinesByPair` keyed by `"${minId}:${maxId}"`. The UI default pair is `defaultPair` (most distant). The frontend renders a dropdown for other pairs.

---

## New/Modified Files

```
cloud/apps/api/src/graphql/queries/
├── domain.ts                          MODIFY: add clusterAnalysis to types + resolver
└── domain-clustering.ts               NEW: computeClusterAnalysis() helper

cloud/apps/web/src/components/domains/
└── SimilaritySection.tsx              MODIFY: add cluster map + fault lines panel;
                                              client-side cosine similarity unchanged

cloud/apps/api/tests/graphql/queries/
└── domain-clustering.test.ts          NEW: unit tests for clustering computation
                                              (pure helper — no DB/GraphQL setup needed)

cloud/apps/web/tests/components/domains/
└── SimilaritySection.test.tsx         MODIFY: add cluster rendering tests
```

---

## GraphQL Schema Additions

```typescript
// New types to add to domain.ts
const ClusterMemberRef = builder.objectRef<ClusterMember>('ClusterMember');
const DomainClusterRef = builder.objectRef<DomainCluster>('DomainCluster');
const ValueFaultLineRef = builder.objectRef<ValueFaultLine>('ValueFaultLine');
const ClusterPairFaultLinesRef = builder.objectRef<ClusterPairFaultLines>('ClusterPairFaultLines');
const ClusterAnalysisRef = builder.objectRef<ClusterAnalysis>('ClusterAnalysis');

// Add to DomainAnalysisResultRef
clusterAnalysis: t.field({
  type: ClusterAnalysisRef,
  resolve: (result) => result.clusterAnalysis,
})
```

---

## Implementation Phases

### Phase 1: Backend helper — cosine similarity + UPGMA

Create `domain-clustering.ts` with pure functions:

1. `cosineSimilarity(a: number[], b: number[]): number` — `dot(a,b) / (|a| * |b|)`
2. `cosineDistanceMatrix(vectors: number[][]): number[][]` — `(1 - sim) / 2` per pair
3. `upgma(distMatrix: number[][], labels: string[]): MergeStep[]` — standard UPGMA; returns list of `{ merged: [string, string], height: number }`
4. `cutAtLargestGap(mergeSteps: MergeStep[], maxClusters: 4): string[][]` — largest height-gap rule; returns cluster assignments; treats result as 1 cluster when no gap > 0.05
5. `computeSilhouettes(assignments: string[][], distMatrix: number[][]): Map<string, number>` — standard silhouette formula
6. `computeClusterName(centroid: Record<string, number>, domainMean: Record<string, number>): string` — with mixed fallback
7. `computeFaultLines(clusters: DomainCluster[]): Record<string, ClusterPairFaultLines>` — all pairs
8. Export: `computeClusterAnalysis(models: { model: string; label: string; scores: Record<string, number> }[]): ClusterAnalysis`

### Phase 2: Wire into resolver

In `domain.ts` resolver, after the BT score loop (~line 1461):
1. Build `models: { model, label, scores }[]` from the existing model data
2. Call `computeClusterAnalysis(models)`
3. Attach `clusterAnalysis` to `DomainAnalysisResult`

### Phase 3: GraphQL type definitions

Add all new Pothos object types to `domain.ts`. Add `clusterAnalysis` field to `DomainAnalysisResultRef`. The `faultLinesByPair` field is a JSON scalar (keyed object) to avoid defining a map type in GraphQL.

### Phase 4: Frontend

In the Similarity section component:
- **Do not remove** client-side cosine similarity — the existing matrix display continues to use it unchanged
- Read `clusterAnalysis` from the GraphQL result (new field only)
- Add **cluster map**: colored chips grouped by cluster; outlier models get dashed border
- Add **cluster detail** (expandable per cluster): name, members, defining value chips
- Add **fault lines panel**: default pair shown with mini bar chart; dropdown for other pairs when > 2 clusters
- Existing similarity matrix kept below, with cluster-color row/column headers
- If `clusterAnalysis.skipped = true`: show `skipReason` message and hide cluster UI

### Phase 5: Tests

**Backend** (`domain-clustering.test.ts`):
- `cosineDistanceMatrix`: verify symmetry, diagonal = 0, known vectors
- `upgma`: known 4-point example with expected merge order
- `cutAtLargestGap`: verify largest-gap selection; verify 4-cluster cap; verify single-cluster when no gap > 0.05
- `computeSilhouettes`: known example with expected scores; outlier threshold (< 0.2)
- `computeClusterName`: with and without values exceeding threshold (fallback label)
- `computeFaultLines`: verify all pairs computed, correct top-3 by absDelta
- `computeClusterAnalysis`: skipped=true when < 3 models

**Frontend**:
- Cluster chips render with correct colors
- Outlier model has dashed border
- Fault lines dropdown renders all pair options
- `skipped=true` shows skip reason, hides cluster UI

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| All models end up in one cluster (no gap > 0.05) | `skipped=true` with message "All models in this domain have similar value profiles" |
| 3-model domain produces trivial clusters | Minimum model count configurable constant; review against real data before launch |
| UPGMA produces different results than expected | Validate against known manually-computed 4-model example in tests |
| `domain.ts` file size continues growing | Extraction into `domain-clustering.ts` is mandatory before adding to resolver |

---

## Helper Module Ownership Convention

See `specs/024-domain-shape-analysis/plan.md` — all three domain analysis enhancement features share the same co-location and test path convention. Helpers live under `graphql/queries/`, not `services/`, and tests are pure unit tests despite that path.

---

## Calibration Step (Pre-Launch)

Run against a real domain with 6+ models and verify:
- Cluster count is sensible (2–4)
- Cluster names reflect actual value profiles
- Fault lines identify the values that visually differ between clusters in the existing matrix
- No model is incorrectly flagged as outlier

Document in a comment at top of `domain-clustering.ts`.

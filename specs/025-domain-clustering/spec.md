# Feature Specification: Domain Analysis — Cluster Analysis

> **Feature #025**
> **Created**: 2026-02-25
> **Status**: Draft
> **Dependencies**: Domain Analysis (existing) — Complete. Cosine similarity matrix already computed.

## Overview

The domain analysis page already shows a pairwise cosine similarity matrix and highlights the top 5 most similar and most different model pairs. This feature takes the next step: grouping models into named clusters, identifying which specific values drive the separation between groups, and flagging models that don't fit cleanly anywhere.

**Core question answered**: "Which models think alike, which ones are opposites, and what exactly makes them different?"

---

## User Stories

### User Story 1 — See models organized into named clusters (Priority: P1)

As a researcher, I need to see models grouped by similarity into named clusters with meaningful labels, so that I can understand the landscape of AI value profiles at a glance rather than parsing a matrix of numbers.

**Why this priority**: The similarity matrix already tells you the distances but requires mental effort to extract patterns. Clusters make the structure legible.

**Independent Test**: View the Similarity & Differences section of domain analysis for a domain with 6+ models. Verify that a cluster view is displayed. Verify that each cluster has a name derived from its shared value characteristics.

**Acceptance Scenarios**:

1. **Given** BT scores exist for 3 or more models in a domain, **When** I view the Similarity section, **Then** I see a cluster grouping showing which models belong together
2. **Given** clusters are displayed, **When** I read the cluster labels, **Then** each cluster has a name that reflects its shared value profile (e.g., "Benevolence-first", "Achievement/Power")
3. **Given** a cluster is shown, **When** I expand it, **Then** I see which specific values define that cluster's shared identity (the values where all members score similarly high or low)
4. **Given** fewer than 3 models are available, **When** I view the section, **Then** clustering is skipped and the existing pairwise matrix is shown without cluster annotations
5. **Given** cluster analysis is computed, **When** I view a cluster, **Then** I see the centroid value profile (average BT scores for the cluster)

---

### User Story 2 — Understand what drives separation between clusters (Priority: P1)

As a researcher, I need to know which values explain the differences between clusters, not just that the clusters exist, so that I can draw meaningful conclusions about how different AI families approach ethics.

**Why this priority**: "These two groups are different" is table stakes. "They diverge primarily on Hedonism and Achievement" is the actual insight.

**Independent Test**: View the cluster comparison for a domain with at least 2 clusters. Verify that the top diverging values are displayed for each cluster pair. Verify the displayed values match manual inspection of the mean BT score differences.

**Acceptance Scenarios**:

1. **Given** two or more clusters exist, **When** I view the cluster comparison, **Then** I see the top 2–3 values that most separate the clusters
2. **Given** a fault-line value is displayed, **When** I read its description, **Then** I see the direction of difference (e.g., "Cluster A scores Hedonism at +0.8; Cluster B scores it at −0.6")
3. **Given** I click a fault-line value, **When** the navigation occurs, **Then** I am taken to the value-detail page for that value scoped to the current domain and signature (single value view — multi-cluster filter is out of scope for this feature)
4. **Given** more than 2 clusters exist, **When** I view fault lines, **Then** the default display shows `defaultPair`; a dropdown allows selecting any other cluster pair from `faultLinesByPair`

---

### User Story 3 — Identify models that don't fit cleanly into any cluster (Priority: P2)

As a researcher, I need to see which models sit between clusters or are outliers, so that I don't over-interpret their cluster assignment.

**Why this priority**: A model forced into the nearest cluster when it doesn't really belong there can mislead interpretation. Flagging outliers prevents this.

**Independent Test**: In a domain where one model has a distinctive profile, verify it is flagged as a weak-fit cluster member or outlier.

**Acceptance Scenarios**:

1. **Given** a model has a low silhouette score (doesn't fit cleanly into its assigned cluster), **When** I view the cluster display, **Then** that model is visually marked as an outlier or "between clusters"
2. **Given** an outlier model is displayed, **When** I hover over its outlier badge, **Then** I see the two nearest cluster names and the cosine distance to each (sourced from `nearestClusterIds` and `distancesToNearestClusters`)
3. **Given** all models fit their clusters well, **When** I view the display, **Then** no outlier flags are shown

---

## Computations Required

### Algorithm: Average-Linkage Hierarchical Clustering (UPGMA)

**Input**: The existing `N × N` cosine distance matrix (already computed: `(1 - cosineSimilarity) / 2`, range [0, 1]).

**Why average linkage, not Ward**: Ward linkage minimizes within-cluster variance and assumes Euclidean geometry with raw vectors. It is not valid for arbitrary precomputed distance matrices like cosine distance. Average linkage (UPGMA) computes merge distances as the mean pairwise distance between all inter-cluster pairs, is valid for any symmetric distance matrix, and produces reasonably compact clusters at small N (≤ 20).

**Steps**:
1. Run average-linkage hierarchical clustering on the `N × N` cosine distance matrix.
2. Cut the dendrogram using the **largest merge-height gap rule**: identify the merge step with the largest jump in merge height (the "elbow"), and cut just below it. If no gap exceeds `0.05`, treat the entire set as one cluster and skip the cluster display. The resulting cluster count will be between 1 and N−1; clamp to a maximum of 4 clusters by re-cutting at the 4th-from-top merge level if needed.
3. Compute silhouette score per model using the same cosine distance matrix.
4. Models with silhouette score < 0.2 are flagged as outliers. Outlier models remain assigned to their nearest cluster.

**Implementation note**: This can be implemented in pure TypeScript at O(N³) — acceptable for N ≤ 20. No external library dependency required.

### Cluster Naming

For each cluster:
1. Compute the centroid: mean BT score per value across all members.
2. Compute the domain mean: mean BT score per value across all models in the domain.
3. Find values where `centroid[v] > domainMean[v] + 0.3`. If 2+ qualify, label: `"{Value1}/{Value2}"`. If exactly 1 qualifies, label: `"{Value1}-first"`.
4. **Fallback** (no values exceed threshold): use the top 2 values by centroid score regardless of threshold, and label: `"{Value1}/{Value2} (mixed)"`.

### Fault Line Identification

Computed for **every cluster pair**, not just the most distant one:

For each pair `(A, B)`:
1. `delta[v] = centroid_A[v] - centroid_B[v]` for each value v
2. Rank values by `|delta[v]|` descending
3. Top 3 values are the fault lines for this pair
4. Record direction: sign of `delta[v]` identifies which cluster scores higher

Stored as a map keyed by cluster pair (see Data Contract).

### Where Computed

In `cloud/apps/api/src/services/domain.ts`, in the same service function that assembles `DomainAnalysisResult`. The cosine similarity computation is already done there; clustering is added as the next step in the same function, consuming the same in-memory data. No new database queries required. No GraphQL resolver changes required for the computation itself — the resolver passes the service result through.

**Prerequisite**: Before implementing, confirm that `DomainAnalysisResult` assembly actually lives in the service layer and not in the GraphQL resolver. If the assembly is currently in the resolver, extract it into a service function first — clustering logic must not live in the resolver.

---

## Data Contract

### New Types

```typescript
type ClusterMember = {
  model: string;
  label: string;
  silhouetteScore: number;          // -1 to 1; < 0.2 = outlier
  isOutlier: boolean;
  // Populated only when isOutlier = true:
  nearestClusterIds: [string, string] | null;    // IDs of two closest clusters
  distancesToNearestClusters: [number, number] | null; // cosine distance to each
};

type ValueFaultLine = {
  valueKey: string;
  clusterAId: string;
  clusterBId: string;
  clusterAScore: number;            // centroid BT score for cluster A
  clusterBScore: number;            // centroid BT score for cluster B
  delta: number;                    // clusterAScore - clusterBScore (signed)
  absDelta: number;                 // |delta| (for sorting)
};

type ClusterPairFaultLines = {
  clusterAId: string;
  clusterBId: string;
  distance: number;                 // mean inter-cluster cosine distance
  faultLines: ValueFaultLine[];     // top 3, sorted by absDelta descending
};

type DomainCluster = {
  id: string;                       // e.g., "cluster-1"
  name: string;                     // e.g., "Benevolence-first" or "Benevolence/Security (mixed)"
  members: ClusterMember[];
  centroid: Record<string, number>; // mean BT score per value across members
  definingValues: string[];         // valueKeys that characterize this cluster (drove naming)
};

type ClusterAnalysis = {
  clusters: DomainCluster[];
  // Fault lines for all cluster pairs, keyed by sorted pair ID "{minId}:{maxId}"
  faultLinesByPair: Record<string, ClusterPairFaultLines>;
  // ID pair of the most distant clusters — used as the default displayed pair in UI
  defaultPair: [string, string] | null;
  skipped: boolean;                 // true if fewer than 3 models or no meaningful gap found
  skipReason: string | null;        // human-readable explanation when skipped = true
};

// Added to DomainAnalysisResult
type DomainAnalysisResult = {
  // ... existing fields ...
  clusterAnalysis: ClusterAnalysis;
};
```

---

## UI Design

### Similarity & Differences Section

Replace the current "Top 5 most similar / most different pairs" list with:

1. **Cluster map** (above the existing matrix): A visual grouping showing colored chips for each model, grouped by cluster. Models with outlier flags get a dashed border.

2. **Cluster details** (expandable): For each cluster, show:
   - Cluster name + color
   - Member model names
   - Top 2–3 defining values (displayed as chips)

3. **Fault lines panel**: Shows the top 3 values that separate the most distant clusters, with a mini bar chart comparing cluster means side by side.

4. **Existing similarity matrix**: Kept as-is below the cluster view, now with cluster-color row/column headers.

---

## Out of Scope

- Multi-model cluster filter on the value-detail page (navigating to value-detail shows the standard single-model view)
- Interactive dendrogram visualization
- User-adjustable cluster count
- Cluster persistence across sessions
- Comparison of clusters across domains or signatures
- Written LLM summary (separate feature)

---

## Open Questions

1. Should the minimum model count for clustering be raised from 3 to 5? With 3 models, clustering is trivial and the results could mislead. Worth reviewing against real domain model counts.
2. The largest-gap cut rule can in theory produce 1 cluster (no meaningful gap). Should the UI suppress the cluster section entirely in this case, or show a message like "All models in this domain have similar value profiles"?
3. The `0.05` minimum gap threshold before treating as one cluster — validate against real data before launch.

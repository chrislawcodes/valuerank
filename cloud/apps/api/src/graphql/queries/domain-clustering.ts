/**
 * domain-clustering.ts
 *
 * Pure computation helpers for cluster analysis (#025).
 * No database access. No external dependencies.
 *
 * Algorithm: Average-Linkage Hierarchical Clustering (UPGMA)
 * Valid for arbitrary symmetric distance matrices (cosine distance).
 * O(N³) — acceptable for N ≤ 20.
 *
 * Calibration constants — validate against real domain data before launch.
 * All threshold names match spec documentation for traceability.
 */

export type ClusterMember = {
  model: string;
  label: string;
  silhouetteScore: number;         // -1 to 1; < 0.2 = outlier
  isOutlier: boolean;
  nearestClusterIds: [string, string] | null;
  distancesToNearestClusters: [number, number] | null;
};

export type ValueFaultLine = {
  valueKey: string;
  clusterAId: string;
  clusterBId: string;
  clusterAScore: number;
  clusterBScore: number;
  delta: number;                   // clusterAScore - clusterBScore (signed)
  absDelta: number;                // |delta| (for sorting)
};

export type ClusterPairFaultLines = {
  clusterAId: string;
  clusterBId: string;
  distance: number;                // mean inter-cluster cosine distance
  faultLines: ValueFaultLine[];   // top 3, sorted by absDelta descending
};

export type DomainCluster = {
  id: string;                      // e.g., "cluster-1"
  name: string;                    // e.g., "Universalism_Nature / Benevolence_Dependability / Tradition"
  members: ClusterMember[];
  centroid: Record<string, number>;
  definingValues: string[];        // top 3 centroid valueKeys
};

export type ClusterAnalysis = {
  clusters: DomainCluster[];
  faultLinesByPair: Record<string, ClusterPairFaultLines>;
  defaultPair: [string, string] | null;
  skipped: boolean;
  skipReason: string | null;
};

export type ClusterModelInput = {
  model: string;
  label: string;
  scores: Record<string, number>;
};

// --- Calibration constants ---
const OUTLIER_SILHOUETTE_THRESHOLD = 0.2;
const MIN_CLUSTER_GAP = 0.015;
const MAX_CLUSTERS = 4;
const MIN_MODELS_FOR_CLUSTERING = 3;

/**
 * Compute cosine similarity between two numeric vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    aNorm += av * av;
    bNorm += bv * bv;
  }
  if (aNorm === 0 && bNorm === 0) return 1; // two zero vectors are identical
  if (aNorm === 0 || bNorm === 0) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

/**
 * Build N×N cosine distance matrix.
 * Distance = (1 - similarity) / 2, range [0, 1].
 * Diagonal is 0. Matrix is symmetric.
 */
export function cosineDistanceMatrix(vectors: number[][]): number[][] {
  const n = vectors.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = (1 - cosineSimilarity(vectors[i] ?? [], vectors[j] ?? [])) / 2;
      matrix[i]![j] = dist;
      matrix[j]![i] = dist;
    }
  }
  return matrix;
}

/**
 * Average linkage distance between two clusters (by model indices).
 */
function avgLinkageDist(
  clusterA: number[],
  clusterB: number[],
  distMatrix: number[][],
): number {
  let total = 0;
  for (const i of clusterA) {
    for (const j of clusterB) {
      total += distMatrix[i]![j] ?? 0;
    }
  }
  return total / (clusterA.length * clusterB.length);
}

export type MergeStep = {
  height: number;
};

export type UpgmaResult = {
  mergeHeights: number[];
  // snapshots[k] = cluster assignments after k merges (N-k clusters)
  snapshots: number[][][];
};

/**
 * Run UPGMA on an N×N distance matrix.
 * snapshots[0] = initial N singleton clusters.
 * snapshots[k] = state after k merges (N-k clusters).
 */
export function upgma(distMatrix: number[][], n: number): UpgmaResult {
  if (n === 0) return { mergeHeights: [], snapshots: [] };

  const clusters: number[][] = Array.from({ length: n }, (_, i) => [i]);
  const mergeHeights: number[] = [];
  const snapshots: number[][][] = [clusters.map((c) => [...c])];

  while (clusters.length > 1) {
    let minDist = Infinity;
    let minI = 0;
    let minJ = 1;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = avgLinkageDist(clusters[i]!, clusters[j]!, distMatrix);
        if (d < minDist) {
          minDist = d;
          minI = i;
          minJ = j;
        }
      }
    }

    // Merge clusters[minI] and clusters[minJ] (remove higher index first)
    const newCluster = [...clusters[minI]!, ...clusters[minJ]!];
    clusters.splice(minJ, 1);
    clusters.splice(minI, 1);
    clusters.push(newCluster);

    mergeHeights.push(minDist);
    snapshots.push(clusters.map((c) => [...c]));
  }

  return { mergeHeights, snapshots };
}

/**
 * Cut dendrogram to find the most clusters supported by the data.
 *
 * Strategy: find the EARLIEST significant gap in the valid range rather than
 * the largest. The largest gap is usually the outlier merge (e.g. one very
 * different model joining last), which produces only 2 clusters and hides
 * meaningful sub-structure in the rest. By taking the earliest significant gap
 * we surface as many real groups as possible, capped at MAX_CLUSTERS.
 *
 * Valid range: snapshot indices that produce between 2 and MAX_CLUSTERS clusters.
 * Returns single cluster when no meaningful structure exists.
 */
export function cutAtLargestGap(
  mergeHeights: number[],
  snapshots: number[][][],
  n: number,
): number[][] {
  const fallback = snapshots[snapshots.length - 1] ?? [Array.from({ length: n }, (_, i) => i)];

  if (mergeHeights.length < 2) return fallback;

  // snapshots[k] has N-k clusters.
  // Valid range: 2 ≤ (N-k) ≤ MAX_CLUSTERS  →  N-MAX_CLUSTERS ≤ k ≤ N-2
  const minCutIdx = Math.max(1, n - MAX_CLUSTERS);
  const maxCutIdx = n - 2;

  if (minCutIdx > maxCutIdx) return fallback;

  let hasAnySignificantGap = false;
  const validCuts: number[] = [];

  for (let j = 0; j < mergeHeights.length - 1; j++) {
    const gap = (mergeHeights[j + 1] ?? 0) - (mergeHeights[j] ?? 0);
    if (gap > MIN_CLUSTER_GAP) {
      hasAnySignificantGap = true;
      const cutIdx = j + 1;
      if (cutIdx >= minCutIdx && cutIdx <= maxCutIdx) {
        validCuts.push(cutIdx);
      }
    }
  }

  if (!hasAnySignificantGap) {
    // No meaningful structure — all models are similar
    return fallback;
  }

  if (validCuts.length === 0) {
    // Gaps exist but all produce too many clusters — cap at MAX_CLUSTERS
    return snapshots[minCutIdx] ?? fallback;
  }

  // Earliest valid cut = most clusters within the cap
  validCuts.sort((a, b) => a - b);
  return snapshots[validCuts[0]!] ?? fallback;
}

type SilhouetteEntry = {
  score: number;
  nearestOtherClusterIndices: [number, number] | null;
  nearestOtherDistances: [number, number] | null;
};

/**
 * Compute silhouette score for each model.
 * Keys are original model indices (0..N-1).
 */
export function computeSilhouettes(
  rawClusters: number[][],
  distMatrix: number[][],
): Map<number, SilhouetteEntry> {
  const result = new Map<number, SilhouetteEntry>();

  for (let ci = 0; ci < rawClusters.length; ci++) {
    const cluster = rawClusters[ci]!;

    for (const m of cluster) {
      // a(m) = mean distance to other members of same cluster
      let a = 0;
      if (cluster.length > 1) {
        let sum = 0;
        for (const other of cluster) {
          if (other !== m) sum += distMatrix[m]![other] ?? 0;
        }
        a = sum / (cluster.length - 1);
      }

      // Mean distance from m to each other cluster
      const otherMeans: Array<{ clusterIdx: number; mean: number }> = [];
      for (let cj = 0; cj < rawClusters.length; cj++) {
        if (cj === ci) continue;
        const other = rawClusters[cj]!;
        let sum = 0;
        for (const o of other) {
          sum += distMatrix[m]![o] ?? 0;
        }
        otherMeans.push({ clusterIdx: cj, mean: sum / other.length });
      }
      otherMeans.sort((x, y) => x.mean - y.mean);

      const b = otherMeans[0]?.mean ?? 0;
      const score = a === 0 && b === 0 ? 0 : (b - a) / Math.max(a, b);

      let nearestOtherClusterIndices: [number, number] | null = null;
      let nearestOtherDistances: [number, number] | null = null;
      if (otherMeans.length >= 2) {
        nearestOtherClusterIndices = [otherMeans[0]!.clusterIdx, otherMeans[1]!.clusterIdx];
        nearestOtherDistances = [otherMeans[0]!.mean, otherMeans[1]!.mean];
      }

      result.set(m, { score, nearestOtherClusterIndices, nearestOtherDistances });
    }
  }

  return result;
}

/**
 * Name cluster from the top 3 centroid values.
 */
export function nameCluster(
  centroid: Record<string, number>,
  valueKeys: string[],
): { name: string; definingValues: string[] } {
  const top3 = [...valueKeys]
    .sort((a, b) => (centroid[b] ?? 0) - (centroid[a] ?? 0))
    .slice(0, 3)
    .filter((v): v is string => v != null);

  return { name: top3.join(' / '), definingValues: top3 };
}

/**
 * Main entry point. Compute full cluster analysis from model score vectors.
 */
export function computeClusterAnalysis(models: ClusterModelInput[]): ClusterAnalysis {
  const n = models.length;

  if (n < MIN_MODELS_FOR_CLUSTERING) {
    return {
      clusters: [],
      faultLinesByPair: {},
      defaultPair: null,
      skipped: true,
      skipReason: `Clustering requires at least ${MIN_MODELS_FOR_CLUSTERING} models; ${n} available.`,
    };
  }

  // Build value key list and score vectors
  const valueKeys = Object.keys(models[0]!.scores);
  const vectors = models.map((m) => valueKeys.map((vk) => m.scores[vk] ?? 0));

  const distMatrix = cosineDistanceMatrix(vectors);
  const { mergeHeights, snapshots } = upgma(distMatrix, n);
  const rawClusters = cutAtLargestGap(mergeHeights, snapshots, n);

  if (rawClusters.length === 1) {
    return {
      clusters: [],
      faultLinesByPair: {},
      defaultPair: null,
      skipped: true,
      skipReason: 'All models in this domain have similar value profiles.',
    };
  }

  const silhouettes = computeSilhouettes(rawClusters, distMatrix);

  // Build DomainCluster objects
  const clusters: DomainCluster[] = rawClusters.map((memberIndices, ci) => {
    const id = `cluster-${ci + 1}`;

    const centroid: Record<string, number> = {};
    for (const vk of valueKeys) {
      centroid[vk] = memberIndices.reduce((acc, mi) => acc + (models[mi]!.scores[vk] ?? 0), 0) / memberIndices.length;
    }

    const { name, definingValues } = nameCluster(centroid, valueKeys);

    const members: ClusterMember[] = memberIndices.map((mi) => {
      const entry = silhouettes.get(mi);
      const silhouetteScore = entry?.score ?? 0;
      const isOutlier = silhouetteScore < OUTLIER_SILHOUETTE_THRESHOLD;

      let nearestClusterIds: [string, string] | null = null;
      let distancesToNearestClusters: [number, number] | null = null;

      if (isOutlier && entry?.nearestOtherClusterIndices != null) {
        const [nc1, nc2] = entry.nearestOtherClusterIndices;
        nearestClusterIds = [`cluster-${nc1 + 1}`, `cluster-${nc2 + 1}`];
        distancesToNearestClusters = entry.nearestOtherDistances ?? null;
      }

      return {
        model: models[mi]!.model,
        label: models[mi]!.label,
        silhouetteScore,
        isOutlier,
        nearestClusterIds,
        distancesToNearestClusters,
      };
    });

    return { id, name, members, centroid, definingValues };
  });

  // Compute fault lines for all cluster pairs + find default pair
  const faultLinesByPair: Record<string, ClusterPairFaultLines> = {};
  let defaultPair: [string, string] | null = null;
  let maxInterClusterDist = -Infinity;

  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const a = clusters[i]!;
      const b = clusters[j]!;
      const aMemberIndices = rawClusters[i]!;
      const bMemberIndices = rawClusters[j]!;

      // Mean inter-cluster cosine distance
      let distSum = 0;
      for (const ai of aMemberIndices) {
        for (const bi of bMemberIndices) {
          distSum += distMatrix[ai]![bi] ?? 0;
        }
      }
      const distance = distSum / (aMemberIndices.length * bMemberIndices.length);

      if (distance > maxInterClusterDist) {
        maxInterClusterDist = distance;
        defaultPair = [a.id, b.id];
      }

      const faultLines: ValueFaultLine[] = valueKeys.map((vk) => {
        const clusterAScore = a.centroid[vk] ?? 0;
        const clusterBScore = b.centroid[vk] ?? 0;
        const delta = clusterAScore - clusterBScore;
        return { valueKey: vk, clusterAId: a.id, clusterBId: b.id, clusterAScore, clusterBScore, delta, absDelta: Math.abs(delta) };
      });
      faultLines.sort((x, y) => y.absDelta - x.absDelta);

      faultLinesByPair[`${a.id}:${b.id}`] = {
        clusterAId: a.id,
        clusterBId: b.id,
        distance,
        faultLines: faultLines.slice(0, 3),
      };
    }
  }

  return { clusters, faultLinesByPair, defaultPair, skipped: false, skipReason: null };
}

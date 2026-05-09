import { cosineSimilarity } from '@valuerank/shared';

/**
 * domain-clustering.ts
 *
 * Pure computation helpers for cluster analysis.
 * No database access. No external dependencies.
 *
 * Algorithms: UPGMA and Ward's minimum-variance hierarchical clustering.
 * Supports 5 distance methods × 2 data sources × 2 linkages = 20 combinations.
 * O(N³) per combination — acceptable for N ≤ 20.
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
  distance: number;                // mean inter-cluster distance
  faultLines: ValueFaultLine[];   // top 3, sorted by absDelta descending
};

export type DomainCluster = {
  id: string;                      // e.g., "cluster-1"
  name: string;                    // e.g., "Universalism_Nature / Benevolence_Dependability / Tradition"
  members: ClusterMember[];
  centroid: Record<string, number>;
  definingValues: string[];        // top 3 centroid valueKeys
};

export type DendrogramMerge = {
  leftMemberIds: string[];   // model IDs in the left subtree (flat list)
  rightMemberIds: string[];  // model IDs in the right subtree (flat list)
  height: number;             // distance at which they merged
};

export type ClusterAnalysis = {
  clusters: DomainCluster[];
  faultLinesByPair: Record<string, ClusterPairFaultLines>;
  defaultPair: [string, string] | null;
  skipped: boolean;
  skipReason: string | null;
  dendrogram?: DendrogramMerge[];
  leafOrder?: string[];
  clusterIdByModelId?: Record<string, string>;
};

export type ClusterModelInput = {
  model: string;
  label: string;
  scores: Record<string, number>;        // log-odds scores
  winRates?: Record<string, number | null>; // domain-local win rates (0–1)
};

export type ClusteringMethod = 'upgma' | 'ward';
export type ClusterDistanceMethod = 'cosine' | 'euclidean' | 'absolute-value' | 'spearman' | 'kendall';
export type ClusterDataSource = 'log-odds' | 'win-rate' | 'kappa-agreement';

// --- Calibration constants ---
const OUTLIER_SILHOUETTE_THRESHOLD = 0.2;
const MIN_CLUSTER_GAP = 0.015;
const MAX_CLUSTERS = 4;
const MIN_MODELS_FOR_CLUSTERING = 3;

const CLUSTER_DISTANCE_METHODS: ClusterDistanceMethod[] = ['cosine', 'euclidean', 'absolute-value', 'spearman', 'kendall'];
const CLUSTER_DATA_SOURCES: ClusterDataSource[] = ['log-odds', 'win-rate'];
const CLUSTER_LINKAGE_METHODS: ClusteringMethod[] = ['upgma', 'ward'];

export { cosineSimilarity };

// ---------------------------------------------------------------------------
// Distance matrix builders
// ---------------------------------------------------------------------------

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

function euclideanDistanceMatrix(vectors: number[][]): number[][] {
  const n = vectors.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const v1 = vectors[i]!, v2 = vectors[j]!;
      let sum = 0;
      for (let k = 0; k < v1.length; k++) { const d = v1[k]! - v2[k]!; sum += d * d; }
      const dist = v1.length > 0 ? Math.sqrt(sum / v1.length) : 0;
      matrix[i]![j] = dist;
      matrix[j]![i] = dist;
    }
  }
  return matrix;
}

function absoluteValueDistanceMatrix(vectors: number[][]): number[][] {
  const n = vectors.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const v1 = vectors[i]!, v2 = vectors[j]!;
      let sum = 0;
      for (let k = 0; k < v1.length; k++) sum += Math.abs(v1[k]! - v2[k]!);
      const dist = v1.length > 0 ? sum / v1.length : 0;
      matrix[i]![j] = dist;
      matrix[j]![i] = dist;
    }
  }
  return matrix;
}

function rankVector(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => b.v - a.v);
  const ranks = new Array<number>(values.length).fill(0);
  let i = 0;
  while (i < indexed.length) {
    let end = i + 1;
    while (end < indexed.length && Math.abs(indexed[end]!.v - indexed[i]!.v) < 1e-9) end++;
    const avgRank = ((i + 1) + end) / 2;
    for (let j = i; j < end; j++) ranks[indexed[j]!.i] = avgRank;
    i = end;
  }
  return ranks;
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, denomX = 0, denomY = 0;
  for (let k = 0; k < n; k++) {
    const dx = xs[k]! - meanX, dy = ys[k]! - meanY;
    num += dx * dy; denomX += dx * dx; denomY += dy * dy;
  }
  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : num / denom;
}

function kendallTau(xs: number[], ys: number[]): number {
  const n = xs.length;
  let concordant = 0, discordant = 0, tieX = 0, tieY = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = xs[i]! - xs[j]!, dy = ys[i]! - ys[j]!;
      const tiedX = Math.abs(dx) < 1e-9, tiedY = Math.abs(dy) < 1e-9;
      if (tiedX) tieX++;
      if (tiedY) tieY++;
      if (!tiedX && !tiedY) {
        if (Math.sign(dx) === Math.sign(dy)) concordant++;
        else discordant++;
      }
    }
  }
  const n0 = n * (n - 1) / 2;
  const denom = Math.sqrt((n0 - tieX) * (n0 - tieY));
  return denom === 0 ? 0 : (concordant - discordant) / denom;
}

function spearmanDistanceMatrix(vectors: number[][]): number[][] {
  const n = vectors.length;
  const ranked = vectors.map(rankVector);
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = (1 - pearsonCorrelation(ranked[i]!, ranked[j]!)) / 2;
      matrix[i]![j] = dist;
      matrix[j]![i] = dist;
    }
  }
  return matrix;
}

function kendallDistanceMatrix(vectors: number[][]): number[][] {
  const n = vectors.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = (1 - kendallTau(vectors[i]!, vectors[j]!)) / 2;
      matrix[i]![j] = dist;
      matrix[j]![i] = dist;
    }
  }
  return matrix;
}

function buildDistanceMatrixForMethod(
  models: ClusterModelInput[],
  distanceMethod: ClusterDistanceMethod,
  dataSource: ClusterDataSource,
): number[][] {
  const valueKeys = Object.keys(models[0]!.scores);
  const rawVectors = models.map((m) => {
    if (dataSource === 'win-rate') {
      return valueKeys.map((vk) => { const wr = m.winRates?.[vk]; return wr != null ? wr : 0; });
    }
    return valueKeys.map((vk) => m.scores[vk] ?? 0);
  });

  if (distanceMethod === 'cosine') {
    // Mean-center before cosine to measure shape of profile rather than level
    const vectors = rawVectors.map((v) => { const mean = v.reduce((s, x) => s + x, 0) / v.length; return v.map((x) => x - mean); });
    return cosineDistanceMatrix(vectors);
  }
  if (distanceMethod === 'euclidean') return euclideanDistanceMatrix(rawVectors);
  if (distanceMethod === 'absolute-value') return absoluteValueDistanceMatrix(rawVectors);
  if (distanceMethod === 'spearman') return spearmanDistanceMatrix(rawVectors);
  return kendallDistanceMatrix(rawVectors);
}

// ---------------------------------------------------------------------------
// UPGMA
// ---------------------------------------------------------------------------

function avgLinkageDist(clusterA: number[], clusterB: number[], distMatrix: number[][]): number {
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
  snapshots: number[][][];
};

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
        if (d < minDist) { minDist = d; minI = i; minJ = j; }
      }
    }

    const newCluster = [...clusters[minI]!, ...clusters[minJ]!];
    clusters.splice(minJ, 1);
    clusters.splice(minI, 1);
    clusters.push(newCluster);

    mergeHeights.push(minDist);
    snapshots.push(clusters.map((c) => [...c]));
  }

  return { mergeHeights, snapshots };
}

// ---------------------------------------------------------------------------
// Ward (Lance-Williams update formula)
// ---------------------------------------------------------------------------

export function ward(distMatrix: number[][], n: number): UpgmaResult {
  if (n === 0) return { mergeHeights: [], snapshots: [] };

  const sizes: number[] = Array(n).fill(1) as number[];
  const members: number[][] = Array.from({ length: n }, (_, i) => [i]);
  const active: boolean[] = Array(n).fill(true) as boolean[];
  const d: number[][] = distMatrix.map((row) => [...row]);
  const mergeHeights: number[] = [];
  const snapshots: number[][][] = [members.map((c) => [...c])];

  for (let step = 0; step < n - 1; step++) {
    let minDist = Infinity;
    let minI = -1;
    let minJ = -1;

    for (let i = 0; i < n; i++) {
      if (!active[i]) continue;
      for (let j = i + 1; j < n; j++) {
        if (!active[j]) continue;
        if ((d[i]![j] ?? 0) < minDist) { minDist = d[i]![j] ?? 0; minI = i; minJ = j; }
      }
    }

    if (minI < 0) break;

    const nA = sizes[minI]!;
    const nB = sizes[minJ]!;
    const dAB = d[minI]![minJ] ?? 0;

    for (let k = 0; k < n; k++) {
      if (!active[k] || k === minI || k === minJ) continue;
      const nC = sizes[k]!;
      const dAC = d[minI]![k] ?? 0;
      const dBC = d[minJ]![k] ?? 0;
      const total = nA + nB + nC;
      const newD = ((nA + nC) * dAC + (nB + nC) * dBC - nC * dAB) / total;
      d[minI]![k] = Math.max(0, newD);
      d[k]![minI] = Math.max(0, newD);
    }

    members[minI] = [...members[minI]!, ...members[minJ]!];
    sizes[minI] = nA + nB;
    active[minJ] = false;

    mergeHeights.push(minDist);
    snapshots.push(members.filter((_, i) => active[i]).map((c) => [...c]));
  }

  return { mergeHeights, snapshots };
}

// ---------------------------------------------------------------------------
// Dendrogram cutting
// ---------------------------------------------------------------------------

export function cutAtLargestGap(mergeHeights: number[], snapshots: number[][][], n: number): number[][] {
  const fallback = snapshots[snapshots.length - 1] ?? [Array.from({ length: n }, (_, i) => i)];

  if (mergeHeights.length < 2) return fallback;

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
      if (cutIdx >= minCutIdx && cutIdx <= maxCutIdx) validCuts.push(cutIdx);
    }
  }

  if (!hasAnySignificantGap) return fallback;
  if (validCuts.length === 0) return snapshots[minCutIdx] ?? fallback;

  validCuts.sort((a, b) => a - b);
  return snapshots[validCuts[0]!] ?? fallback;
}

// ---------------------------------------------------------------------------
// Silhouettes
// ---------------------------------------------------------------------------

type SilhouetteEntry = {
  score: number;
  nearestOtherClusterIndices: [number, number] | null;
  nearestOtherDistances: [number, number] | null;
};

export function computeSilhouettes(rawClusters: number[][], distMatrix: number[][]): Map<number, SilhouetteEntry> {
  const result = new Map<number, SilhouetteEntry>();

  for (let ci = 0; ci < rawClusters.length; ci++) {
    const cluster = rawClusters[ci]!;

    for (const m of cluster) {
      let a = 0;
      if (cluster.length > 1) {
        let sum = 0;
        for (const other of cluster) {
          if (other !== m) sum += distMatrix[m]![other] ?? 0;
        }
        a = sum / (cluster.length - 1);
      }

      const otherMeans: Array<{ clusterIdx: number; mean: number }> = [];
      for (let cj = 0; cj < rawClusters.length; cj++) {
        if (cj === ci) continue;
        const other = rawClusters[cj]!;
        let sum = 0;
        for (const o of other) sum += distMatrix[m]![o] ?? 0;
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

// ---------------------------------------------------------------------------
// Cluster naming
// ---------------------------------------------------------------------------

export function nameCluster(centroid: Record<string, number>, valueKeys: string[]): { name: string; definingValues: string[] } {
  const top3 = [...valueKeys]
    .sort((a, b) => (centroid[b] ?? 0) - (centroid[a] ?? 0))
    .slice(0, 3)
    .filter((v): v is string => v != null);

  return { name: top3.join(' / '), definingValues: top3 };
}

// ---------------------------------------------------------------------------
// Core clustering from a pre-built distance matrix
// ---------------------------------------------------------------------------

function runClusteringFromDistMatrix(
  models: ClusterModelInput[],
  distMatrix: number[][],
  valueKeys: string[],
  linkage: ClusteringMethod,
  dataSource: ClusterDataSource = 'log-odds',
): ClusterAnalysis {
  const n = models.length;

  if (n < MIN_MODELS_FOR_CLUSTERING) {
    return { clusters: [], faultLinesByPair: {}, defaultPair: null, skipped: true,
      skipReason: `Clustering requires at least ${MIN_MODELS_FOR_CLUSTERING} models; ${n} available.` };
  }

  const { mergeHeights, snapshots } = linkage === 'ward' ? ward(distMatrix, n) : upgma(distMatrix, n);
  const rawClusters = cutAtLargestGap(mergeHeights, snapshots, n);

  if (rawClusters.length === 1) {
    return { clusters: [], faultLinesByPair: {}, defaultPair: null, skipped: true,
      skipReason: 'All models in this domain have similar value profiles.' };
  }

  const silhouettes = computeSilhouettes(rawClusters, distMatrix);

  const clusters: DomainCluster[] = rawClusters.map((memberIndices, ci) => {
    const id = `cluster-${ci + 1}`;
    const centroid: Record<string, number> = {};
    for (const vk of valueKeys) {
      centroid[vk] = memberIndices.reduce((acc, mi) => {
        if (dataSource === 'win-rate') {
          const wr = models[mi]!.winRates?.[vk];
          return acc + (wr != null ? wr : 0);
        }
        return acc + (models[mi]!.scores[vk] ?? 0);
      }, 0) / memberIndices.length;
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
      return { model: models[mi]!.model, label: models[mi]!.label, silhouetteScore, isOutlier, nearestClusterIds, distancesToNearestClusters };
    });
    return { id, name, members, centroid, definingValues };
  });

  const faultLinesByPair: Record<string, ClusterPairFaultLines> = {};
  let defaultPair: [string, string] | null = null;
  let maxInterClusterDist = -Infinity;

  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const a = clusters[i]!;
      const b = clusters[j]!;
      const aMemberIndices = rawClusters[i]!;
      const bMemberIndices = rawClusters[j]!;

      let distSum = 0;
      for (const ai of aMemberIndices) {
        for (const bi of bMemberIndices) {
          distSum += distMatrix[ai]![bi] ?? 0;
        }
      }
      const distance = distSum / (aMemberIndices.length * bMemberIndices.length);

      if (distance > maxInterClusterDist) { maxInterClusterDist = distance; defaultPair = [a.id, b.id]; }

      const faultLines: ValueFaultLine[] = valueKeys.map((vk) => {
        const clusterAScore = a.centroid[vk] ?? 0;
        const clusterBScore = b.centroid[vk] ?? 0;
        const delta = clusterAScore - clusterBScore;
        return { valueKey: vk, clusterAId: a.id, clusterBId: b.id, clusterAScore, clusterBScore, delta, absDelta: Math.abs(delta) };
      });
      faultLines.sort((x, y) => y.absDelta - x.absDelta);
      faultLinesByPair[`${a.id}:${b.id}`] = { clusterAId: a.id, clusterBId: b.id, distance, faultLines: faultLines.slice(0, 3) };
    }
  }

  return { clusters, faultLinesByPair, defaultPair, skipped: false, skipReason: null };
}

// ---------------------------------------------------------------------------
// Main entry points
// ---------------------------------------------------------------------------

/**
 * Pre-compute all 20 clustering combinations: 5 distance methods × 2 data sources × 2 linkages.
 * Keys are formatted as "${dataSource}-${distanceMethod}-${linkage}" (e.g., "log-odds-cosine-upgma").
 */
export function computeAllClusterAnalyses(models: ClusterModelInput[]): Record<string, ClusterAnalysis> {
  const result: Record<string, ClusterAnalysis> = {};
  if (models.length === 0) return result;
  const valueKeys = Object.keys(models[0]!.scores);

  for (const dataSource of CLUSTER_DATA_SOURCES) {
    for (const distanceMethod of CLUSTER_DISTANCE_METHODS) {
      const distMatrix = buildDistanceMatrixForMethod(models, distanceMethod, dataSource);
      for (const linkage of CLUSTER_LINKAGE_METHODS) {
        const key = `${dataSource}-${distanceMethod}-${linkage}`;
        result[key] = runClusteringFromDistMatrix(models, distMatrix, valueKeys, linkage, dataSource);
      }
    }
  }

  return result;
}

/**
 * Compute cluster analysis using log-odds scores with cosine distance.
 * Kept for backward compatibility; prefer computeAllClusterAnalyses for new code.
 */
export function computeClusterAnalysis(models: ClusterModelInput[], method: ClusteringMethod = 'upgma'): ClusterAnalysis {
  if (models.length === 0) {
    return { clusters: [], faultLinesByPair: {}, defaultPair: null, skipped: true,
      skipReason: 'No models provided.' };
  }
  const valueKeys = Object.keys(models[0]!.scores);
  const rawVectors = models.map((m) => valueKeys.map((vk) => m.scores[vk] ?? 0));
  const vectors = rawVectors.map((v) => {
    const mean = v.reduce((s, x) => s + x, 0) / v.length;
    return v.map((x) => x - mean);
  });
  return runClusteringFromDistMatrix(models, cosineDistanceMatrix(vectors), valueKeys, method);
}

// ---------------------------------------------------------------------------
// Dendrogram helpers
// ---------------------------------------------------------------------------

/**
 * Derive the merge tree from UPGMA/Ward snapshots and merge heights.
 *
 * At step k, snapshot[k] → snapshot[k+1] identifies which two clusters
 * merged. The merged cluster is the one in snapshot[k+1] that is a
 * superset of two distinct clusters from snapshot[k].
 */
export function deriveDendrogram(
  snapshots: number[][][],
  mergeHeights: number[],
  models: ClusterModelInput[],
): DendrogramMerge[] {
  const merges: DendrogramMerge[] = [];
  for (let step = 0; step < mergeHeights.length; step++) {
    const before = snapshots[step]!;
    const after = snapshots[step + 1]!;
    const height = mergeHeights[step]!;

    // Find the cluster in `after` that grew (its size > any single cluster in `before`)
    for (const newCluster of after) {
      // How many clusters from `before` are subsets of newCluster?
      const parentClusters = before.filter((oldCluster) =>
        oldCluster.every((idx) => newCluster.includes(idx)),
      );
      if (parentClusters.length < 2) continue;

      // The two largest parent clusters that combined to form newCluster
      // In practice there will be exactly 2 at each step
      const sorted = [...parentClusters].sort((a, b) => b.length - a.length);
      const left = sorted[0]!;
      const right = sorted[1]!;

      merges.push({
        leftMemberIds: left.map((idx) => models[idx]!.model),
        rightMemberIds: right.map((idx) => models[idx]!.model),
        height,
      });
      break;
    }
  }
  return merges;
}

/**
 * Derive leaf order from the merge tree by doing a depth-first left-to-right
 * traversal of the binary merge tree.
 */
export function deriveLeafOrder(merges: DendrogramMerge[], allModelIds: string[]): string[] {
  if (merges.length === 0) return [...allModelIds];

  // Build a lookup: set of model IDs → the merge that produced them
  // We represent sets as sorted joined strings for lookup
  const mergeByKey = new Map<string, DendrogramMerge>();
  for (const merge of merges) {
    const combined = [...merge.leftMemberIds, ...merge.rightMemberIds].sort().join('|');
    mergeByKey.set(combined, merge);
  }

  function walkSubtree(memberIds: string[]): string[] {
    if (memberIds.length === 1) return [memberIds[0]!];
    const key = [...memberIds].sort().join('|');
    const merge = mergeByKey.get(key);
    if (merge == null) return memberIds; // fallback
    return [...walkSubtree(merge.leftMemberIds), ...walkSubtree(merge.rightMemberIds)];
  }

  // The root merge is the last merge (merges are in ascending height order)
  const root = merges[merges.length - 1]!;
  const rootMembers = [...root.leftMemberIds, ...root.rightMemberIds];
  return walkSubtree(rootMembers);
}

/**
 * Build a hierarchical-clustering distance matrix from a kappa matrix.
 *
 * Maps Cohen's kappa from [-1, 1] directly to a distance in [0, 2]:
 *   kappa =  1   →  distance = 0   (perfect agreement, identical players)
 *   kappa =  0   →  distance = 1   (chance agreement, no signal)
 *   kappa = -1   →  distance = 2   (worse than chance, opposite players)
 *
 * Reading: distance = 1 - kappa, so subtracting any merge's distance from 1
 * recovers the kappa value directly. Hierarchical clustering is scale-
 * invariant for the merge structure, so keeping the un-normalized form
 * doesn't change which clusters form — only the dendrogram axis labels.
 *
 * Null kappa entries (no overlap or degenerate marginals) are mapped to
 * distance = 1 — the same as "no signal" (kappa = 0) — which avoids
 * breaking the distance matrix while not pretending we know more than we do.
 */
export function kappaDistanceMatrix(kappaMatrix: ReadonlyArray<ReadonlyArray<number | null>>): number[][] {
  const n = kappaMatrix.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const k = kappaMatrix[i]?.[j];
      const dist = k == null ? 1 : Math.max(0, Math.min(2, 1 - k));
      matrix[i]![j] = dist;
      matrix[j]![i] = dist;
    }
  }
  return matrix;
}

/**
 * Cluster models by behavioral agreement (Cohen's kappa) rather than by
 * value-score similarity. The grouping is driven by which models make the
 * same choices on the same scenarios; the per-cluster centroids are still
 * computed from the models' log-odds scores so the resulting centroids and
 * fault lines describe what each behaviorally-similar group tends to value.
 *
 * Also exposes dendrogram, leafOrder, and clusterIdByModelId for the
 * dual-chart frontend visualization.
 */
export function computeKappaClusterAnalysis(
  models: ClusterModelInput[],
  kappaMatrix: ReadonlyArray<ReadonlyArray<number | null>>,
  method: ClusteringMethod = 'upgma',
): ClusterAnalysis {
  if (models.length === 0) {
    return { clusters: [], faultLinesByPair: {}, defaultPair: null, skipped: true,
      skipReason: 'No models provided.' };
  }
  const valueKeys = Object.keys(models[0]!.scores);
  const distMatrix = kappaDistanceMatrix(kappaMatrix);
  const n = models.length;
  const { mergeHeights, snapshots } = method === 'ward' ? ward(distMatrix, n) : upgma(distMatrix, n);

  const analysis = runClusteringFromDistMatrix(models, distMatrix, valueKeys, method, 'log-odds');

  // Derive dendrogram, leaf order, and per-model cluster ID mapping
  const dendrogram = deriveDendrogram(snapshots, mergeHeights, models);
  const allModelIds = models.map((m) => m.model);
  const leafOrder = deriveLeafOrder(dendrogram, allModelIds);

  const clusterIdByModelId: Record<string, string> = {};
  for (const cluster of analysis.clusters) {
    for (const member of cluster.members) {
      clusterIdByModelId[member.model] = cluster.id;
    }
  }

  return {
    ...analysis,
    dendrogram,
    leafOrder,
    clusterIdByModelId,
  };
}

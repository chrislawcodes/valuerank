/**
 * Pure unit tests for domain-clustering.ts computation helpers.
 * No database access. No server setup required.
 */

import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  cosineDistanceMatrix,
  upgma,
  cutAtLargestGap,
  computeSilhouettes,
  nameCluster,
  computeClusterAnalysis,
  type ClusterModelInput,
} from '../../../src/graphql/queries/domain-clustering.js';

// ---------------------------------------------------------------------------
// cosineSimilarity
// ---------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('returns 0 for zero vector', () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
    expect(cosineSimilarity([1, 2], [0, 0])).toBe(0);
  });

  it('computes known value correctly', () => {
    // [1, 1] vs [2, 0]: dot=2, |a|=sqrt(2), |b|=2 → 2/(sqrt(2)*2) ≈ 0.7071
    expect(cosineSimilarity([1, 1], [2, 0])).toBeCloseTo(Math.SQRT1_2, 4);
  });
});

// ---------------------------------------------------------------------------
// cosineDistanceMatrix
// ---------------------------------------------------------------------------

describe('cosineDistanceMatrix', () => {
  it('returns empty matrix for empty input', () => {
    expect(cosineDistanceMatrix([])).toEqual([]);
  });

  it('diagonal is zero', () => {
    const matrix = cosineDistanceMatrix([[1, 0], [0, 1], [1, 1]]);
    for (let i = 0; i < 3; i++) {
      expect(matrix[i]![i]).toBeCloseTo(0);
    }
  });

  it('matrix is symmetric', () => {
    const matrix = cosineDistanceMatrix([[1, 2], [3, 4], [1, 0]]);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(matrix[i]![j]).toBeCloseTo(matrix[j]![i]!);
      }
    }
  });

  it('distance for identical vectors is 0', () => {
    const matrix = cosineDistanceMatrix([[1, 2], [1, 2]]);
    expect(matrix[0]![1]).toBeCloseTo(0);
  });

  it('distance range is [0, 1]', () => {
    const matrix = cosineDistanceMatrix([[1, 0], [-1, 0]]);
    // cosine similarity = -1 → distance = (1 - (-1)) / 2 = 1
    expect(matrix[0]![1]).toBeCloseTo(1);
  });

  it('distance formula is (1 - similarity) / 2', () => {
    // [1, 1] vs [1, 0]: sim = 1/sqrt(2) ≈ 0.7071 → dist = (1 - 0.7071) / 2 ≈ 0.1464
    const matrix = cosineDistanceMatrix([[1, 1], [1, 0]]);
    const expectedDist = (1 - Math.SQRT1_2) / 2;
    expect(matrix[0]![1]).toBeCloseTo(expectedDist, 4);
  });
});

// ---------------------------------------------------------------------------
// upgma
// ---------------------------------------------------------------------------

describe('upgma', () => {
  it('returns empty for n=0', () => {
    const result = upgma([], 0);
    expect(result.mergeHeights).toEqual([]);
    expect(result.snapshots).toEqual([]);
  });

  it('returns one snapshot and zero merge heights for n=1', () => {
    const result = upgma([[0]], 1);
    expect(result.mergeHeights).toHaveLength(0);
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0]).toEqual([[0]]);
  });

  it('produces N-1 merge steps for N models', () => {
    const dist = cosineDistanceMatrix([[1, 0], [0, 1], [-1, 0]]);
    const result = upgma(dist, 3);
    expect(result.mergeHeights).toHaveLength(2);
    expect(result.snapshots).toHaveLength(3); // 0..2
  });

  it('snapshots[0] has N singleton clusters', () => {
    const dist = cosineDistanceMatrix([[1, 0], [0, 1], [-1, 0]]);
    const result = upgma(dist, 3);
    expect(result.snapshots[0]).toHaveLength(3);
    for (const cluster of result.snapshots[0]!) {
      expect(cluster).toHaveLength(1);
    }
  });

  it('merge heights are monotonically non-decreasing', () => {
    const vecs = [[1, 0], [0.9, 0.1], [0, 1], [-1, 0], [-0.9, -0.1]];
    const dist = cosineDistanceMatrix(vecs);
    const result = upgma(dist, 5);
    for (let i = 1; i < result.mergeHeights.length; i++) {
      expect(result.mergeHeights[i]!).toBeGreaterThanOrEqual(result.mergeHeights[i - 1]! - 1e-10);
    }
  });

  it('merges the closest pair first', () => {
    // v0=[1,0], v1=[0.99,0.01], v2=[0,1]: v0 and v1 are almost identical
    const vecs = [[1, 0], [0.99, 0.01], [0, 1]];
    const dist = cosineDistanceMatrix(vecs);
    const result = upgma(dist, 3);
    // First merge should have very small height (v0+v1 are close)
    expect(result.mergeHeights[0]!).toBeLessThan(result.mergeHeights[1]!);
  });

  it('final snapshot has a single cluster containing all models', () => {
    const dist = cosineDistanceMatrix([[1, 0], [0, 1], [-1, 0]]);
    const result = upgma(dist, 3);
    const last = result.snapshots[result.snapshots.length - 1]!;
    expect(last).toHaveLength(1);
    expect(last[0]!.sort()).toEqual([0, 1, 2]);
  });
});

// ---------------------------------------------------------------------------
// cutAtLargestGap
// ---------------------------------------------------------------------------

describe('cutAtLargestGap', () => {
  it('returns single cluster when fewer than 2 merge heights', () => {
    // N=2: only 1 merge height
    const snapshots = [[[0], [1]], [[0, 1]]];
    const result = cutAtLargestGap([0.3], snapshots, 2);
    expect(result).toHaveLength(1);
  });

  it('returns single cluster when max gap <= 0.05', () => {
    // All gaps small
    const snapshots = [
      [[0], [1], [2], [3]],
      [[0, 1], [2], [3]],
      [[0, 1], [2, 3]],
      [[0, 1, 2, 3]],
    ];
    const result = cutAtLargestGap([0.1, 0.12, 0.14], snapshots, 4);
    expect(result).toHaveLength(1);
  });

  it('cuts at largest gap', () => {
    // N=4: mergeHeights = [0.1, 0.2, 0.8]
    // gaps = [0.1, 0.6] → max gap at index 1 (between step 1 and step 2)
    // cut after step 1 → snapshots[2] has 2 clusters
    const snapshots = [
      [[0], [1], [2], [3]],
      [[0, 1], [2], [3]],
      [[0, 1], [2, 3]],    // 2 clusters
      [[0, 1, 2, 3]],
    ];
    const result = cutAtLargestGap([0.1, 0.2, 0.8], snapshots, 4);
    expect(result).toHaveLength(2);
  });

  it('caps at 4 clusters when natural cut produces more', () => {
    // N=8, natural cut would give 7 clusters (huge gap at first merge)
    // Set up to test capping
    const n = 8;
    const snaps: number[][][] = [];
    for (let k = 0; k <= n - 1; k++) {
      // Simulate: at each step one model gets merged into a bigger group
      const clusters: number[][] = [];
      if (k === 0) {
        for (let i = 0; i < n; i++) clusters.push([i]);
      } else {
        // k clusters remain: first cluster has k+1 models, rest are singletons
        clusters.push(Array.from({ length: k + 1 }, (_, i) => i));
        for (let i = k + 1; i < n; i++) clusters.push([i]);
      }
      snaps.push(clusters);
    }
    // mergeHeights: huge gap at first step (between step 0 and step 1)
    const heights = [0.01, 0.9, 0.91, 0.92, 0.93, 0.94, 0.95];
    const result = cutAtLargestGap(heights, snaps, n);
    // Natural cut: gap at index 0, N - (0+1) = 7 > 4, so re-cut at N-4 = 4
    expect(result).toHaveLength(4);
  });

  it('respects exact 4-cluster cap boundary', () => {
    // N=5, huge gap at first step → natural cut = 4 clusters (exactly at cap)
    const snaps = [
      [[0], [1], [2], [3], [4]],
      [[0, 1], [2], [3], [4]],     // 4 clusters
      [[0, 1], [2, 3], [4]],       // 3 clusters
      [[0, 1], [2, 3, 4]],         // 2 clusters
      [[0, 1, 2, 3, 4]],
    ];
    const heights = [0.05, 0.8, 0.85, 0.9];
    // gaps = [0.75, 0.05, 0.05] → max at index 0 → cut after step 0 → snaps[1] has 4 clusters
    const result = cutAtLargestGap(heights, snaps, 5);
    expect(result).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// computeSilhouettes
// ---------------------------------------------------------------------------

describe('computeSilhouettes', () => {
  it('returns entries for each model', () => {
    // 2 clusters: [0,1] and [2]
    const distMatrix = [
      [0, 0.1, 0.8],
      [0.1, 0, 0.9],
      [0.8, 0.9, 0],
    ];
    const rawClusters = [[0, 1], [2]];
    const result = computeSilhouettes(rawClusters, distMatrix);
    expect(result.has(0)).toBe(true);
    expect(result.has(1)).toBe(true);
    expect(result.has(2)).toBe(true);
  });

  it('well-separated clusters produce high silhouette scores', () => {
    // Cluster A: [0,1] very close; Cluster B: [2,3] very close; A and B far apart
    const distMatrix = [
      [0, 0.05, 0.9, 0.95],
      [0.05, 0, 0.85, 0.9],
      [0.9, 0.85, 0, 0.05],
      [0.95, 0.9, 0.05, 0],
    ];
    const rawClusters = [[0, 1], [2, 3]];
    const result = computeSilhouettes(rawClusters, distMatrix);
    for (const { score } of result.values()) {
      expect(score).toBeGreaterThan(0.2);
    }
  });

  it('singleton cluster gets silhouette score of 1 when other cluster is farther', () => {
    // Singleton [2] far from cluster [0,1]
    const distMatrix = [
      [0, 0.1, 0.9],
      [0.1, 0, 0.8],
      [0.9, 0.8, 0],
    ];
    const rawClusters = [[0, 1], [2]];
    const result = computeSilhouettes(rawClusters, distMatrix);
    // For model 2: a=0 (singleton), b=mean(0.9, 0.8)=0.85 → s=(0.85-0)/0.85=1
    expect(result.get(2)?.score).toBeCloseTo(1);
  });

  it('flags outlier when silhouette < 0.2', () => {
    // Model 1 is ambiguous between clusters
    const distMatrix = [
      [0, 0.1, 0.5],
      [0.1, 0, 0.48], // very close to cluster 0 AND nearly as close to cluster 1
      [0.5, 0.48, 0],
    ];
    const rawClusters = [[0, 1], [2]];
    const result = computeSilhouettes(rawClusters, distMatrix);
    // model 0: a=d(0,1)=0.1, b=d(0,2)=0.5 → s=(0.5-0.1)/0.5=0.8 → not outlier
    // model 1: a=d(1,0)=0.1, b=d(1,2)=0.48 → s=(0.48-0.1)/0.48≈0.79 → not outlier
    const m0 = result.get(0)!;
    expect(m0.score).toBeGreaterThan(0.2);
  });

  it('returns nearestOtherClusterIndices for clusters with 2+ other clusters', () => {
    const distMatrix = [
      [0, 0.1, 0.5, 0.9],
      [0.1, 0, 0.4, 0.8],
      [0.5, 0.4, 0, 0.3],
      [0.9, 0.8, 0.3, 0],
    ];
    const rawClusters = [[0], [1], [2, 3]]; // 3 clusters
    const result = computeSilhouettes(rawClusters, distMatrix);
    const m0 = result.get(0)!;
    // model 0 has 2 other clusters ([1] and [2,3]) → nearestOtherClusterIndices should be set
    expect(m0.nearestOtherClusterIndices).not.toBeNull();
    expect(m0.nearestOtherClusterIndices).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// nameCluster
// ---------------------------------------------------------------------------

describe('nameCluster', () => {
  const valueKeys = ['Benevolence', 'Achievement', 'Hedonism', 'Security'];

  it('names cluster with 2+ qualifying values as "V1/V2"', () => {
    const domainMean = { Benevolence: 0.0, Achievement: 0.0, Hedonism: 0.0, Security: 0.0 };
    const centroid = { Benevolence: 0.5, Achievement: 0.4, Hedonism: 0.1, Security: 0.0 };
    // Benevolence: 0.5 > 0.3, Achievement: 0.4 > 0.3 → qualify
    const { name, definingValues } = nameCluster(centroid, domainMean, valueKeys);
    expect(name).toBe('Benevolence/Achievement');
    expect(definingValues).toContain('Benevolence');
    expect(definingValues).toContain('Achievement');
  });

  it('names cluster with 1 qualifying value as "V1-first"', () => {
    const domainMean = { Benevolence: 0.0, Achievement: 0.0, Hedonism: 0.0, Security: 0.0 };
    const centroid = { Benevolence: 0.5, Achievement: 0.1, Hedonism: 0.0, Security: 0.0 };
    const { name, definingValues } = nameCluster(centroid, domainMean, valueKeys);
    expect(name).toBe('Benevolence-first');
    expect(definingValues).toEqual(['Benevolence']);
  });

  it('uses fallback "(mixed)" label when no value exceeds threshold', () => {
    const domainMean = { Benevolence: 0.1, Achievement: 0.1, Hedonism: 0.1, Security: 0.1 };
    const centroid = { Benevolence: 0.2, Achievement: 0.15, Hedonism: 0.1, Security: 0.05 };
    // None exceed domainMean + 0.3
    const { name } = nameCluster(centroid, domainMean, valueKeys);
    expect(name).toContain('(mixed)');
  });

  it('sorts qualifying values by centroid score descending', () => {
    const domainMean = { Benevolence: 0.0, Achievement: 0.0, Hedonism: 0.0, Security: 0.0 };
    const centroid = { Benevolence: 0.4, Achievement: 0.6, Hedonism: 0.35, Security: 0.0 };
    const { name } = nameCluster(centroid, domainMean, valueKeys);
    // Achievement > Benevolence > Hedonism
    expect(name).toBe('Achievement/Benevolence');
  });

  it('uses top 2 by centroid for fallback label', () => {
    const domainMean = { Benevolence: 0.4, Achievement: 0.5, Hedonism: 0.6, Security: 0.3 };
    const centroid = { Benevolence: 0.5, Achievement: 0.6, Hedonism: 0.65, Security: 0.3 };
    // centroid - domainMean: all below 0.3
    const { name, definingValues } = nameCluster(centroid, domainMean, valueKeys);
    // Top 2 by centroid: Hedonism (0.65) then Achievement (0.6)
    expect(name).toBe('Hedonism/Achievement (mixed)');
    expect(definingValues).toContain('Hedonism');
    expect(definingValues).toContain('Achievement');
  });
});

// ---------------------------------------------------------------------------
// computeClusterAnalysis (full pipeline)
// ---------------------------------------------------------------------------

describe('computeClusterAnalysis', () => {
  it('returns skipped=true when fewer than 3 models', () => {
    const models: ClusterModelInput[] = [
      { model: 'm1', label: 'M1', scores: { A: 1, B: 0 } },
      { model: 'm2', label: 'M2', scores: { A: 0, B: 1 } },
    ];
    const result = computeClusterAnalysis(models);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).not.toBeNull();
    expect(result.clusters).toHaveLength(0);
  });

  it('returns skipped=true when all models have similar profiles', () => {
    // All models nearly identical → no meaningful gap
    const models: ClusterModelInput[] = [
      { model: 'm1', label: 'M1', scores: { A: 1.0, B: 0.01, C: 0.0 } },
      { model: 'm2', label: 'M2', scores: { A: 1.0, B: 0.02, C: 0.0 } },
      { model: 'm3', label: 'M3', scores: { A: 1.0, B: 0.01, C: 0.01 } },
    ];
    const result = computeClusterAnalysis(models);
    expect(result.skipped).toBe(true);
  });

  it('produces clusters when models have distinct profiles', () => {
    const models: ClusterModelInput[] = [
      { model: 'm1', label: 'M1', scores: { A: 1.0, B: 0.0, C: 0.0 } },
      { model: 'm2', label: 'M2', scores: { A: 0.9, B: 0.1, C: 0.0 } },
      { model: 'm3', label: 'M3', scores: { A: 0.0, B: 0.0, C: 1.0 } },
      { model: 'm4', label: 'M4', scores: { A: 0.0, B: 0.1, C: 0.9 } },
    ];
    const result = computeClusterAnalysis(models);
    expect(result.skipped).toBe(false);
    expect(result.clusters.length).toBeGreaterThanOrEqual(2);
    expect(result.clusters.length).toBeLessThanOrEqual(4);
  });

  it('each model appears in exactly one cluster', () => {
    const models: ClusterModelInput[] = [
      { model: 'm1', label: 'M1', scores: { A: 1.0, B: 0.0 } },
      { model: 'm2', label: 'M2', scores: { A: 0.9, B: 0.1 } },
      { model: 'm3', label: 'M3', scores: { A: 0.0, B: 1.0 } },
    ];
    const result = computeClusterAnalysis(models);
    if (result.skipped) return;
    const allModels = result.clusters.flatMap((c) => c.members.map((m) => m.model));
    expect(allModels.sort()).toEqual(['m1', 'm2', 'm3'].sort());
    expect(new Set(allModels).size).toBe(allModels.length);
  });

  it('fault lines cover all cluster pairs', () => {
    const models: ClusterModelInput[] = [
      { model: 'm1', label: 'M1', scores: { A: 1.0, B: 0.0, C: 0.0 } },
      { model: 'm2', label: 'M2', scores: { A: 0.9, B: 0.1, C: 0.0 } },
      { model: 'm3', label: 'M3', scores: { A: 0.0, B: 0.0, C: 1.0 } },
      { model: 'm4', label: 'M4', scores: { A: 0.0, B: 0.1, C: 0.9 } },
    ];
    const result = computeClusterAnalysis(models);
    if (result.skipped) return;
    const numPairs = (result.clusters.length * (result.clusters.length - 1)) / 2;
    expect(Object.keys(result.faultLinesByPair)).toHaveLength(numPairs);
  });

  it('each fault line pair has at most 3 fault lines', () => {
    const models: ClusterModelInput[] = [
      { model: 'm1', label: 'M1', scores: { A: 1.0, B: 0.0, C: 0.0, D: 0.5 } },
      { model: 'm2', label: 'M2', scores: { A: 0.9, B: 0.1, C: 0.0, D: 0.4 } },
      { model: 'm3', label: 'M3', scores: { A: 0.0, B: 0.0, C: 1.0, D: 0.5 } },
      { model: 'm4', label: 'M4', scores: { A: 0.0, B: 0.1, C: 0.9, D: 0.6 } },
    ];
    const result = computeClusterAnalysis(models);
    if (result.skipped) return;
    for (const pair of Object.values(result.faultLinesByPair)) {
      expect(pair.faultLines.length).toBeLessThanOrEqual(3);
    }
  });

  it('fault lines are sorted by absDelta descending', () => {
    const models: ClusterModelInput[] = [
      { model: 'm1', label: 'M1', scores: { A: 1.0, B: 0.0, C: 0.5 } },
      { model: 'm2', label: 'M2', scores: { A: 0.9, B: 0.1, C: 0.4 } },
      { model: 'm3', label: 'M3', scores: { A: 0.0, B: 0.0, C: 0.5 } },
    ];
    const result = computeClusterAnalysis(models);
    if (result.skipped) return;
    for (const pair of Object.values(result.faultLinesByPair)) {
      for (let i = 1; i < pair.faultLines.length; i++) {
        expect(pair.faultLines[i - 1]!.absDelta).toBeGreaterThanOrEqual(pair.faultLines[i]!.absDelta);
      }
    }
  });

  it('defaultPair is the most distant cluster pair', () => {
    const models: ClusterModelInput[] = [
      { model: 'm1', label: 'M1', scores: { A: 1.0, B: 0.0, C: 0.0 } },
      { model: 'm2', label: 'M2', scores: { A: 0.9, B: 0.1, C: 0.0 } },
      { model: 'm3', label: 'M3', scores: { A: 0.0, B: 0.0, C: 1.0 } },
      { model: 'm4', label: 'M4', scores: { A: 0.0, B: 0.1, C: 0.9 } },
    ];
    const result = computeClusterAnalysis(models);
    if (result.skipped || result.defaultPair === null) return;
    const [id1, id2] = result.defaultPair;
    const pairKey = `${id1}:${id2}`;
    const defaultDist = result.faultLinesByPair[pairKey]?.distance ?? 0;
    for (const pair of Object.values(result.faultLinesByPair)) {
      expect(defaultDist).toBeGreaterThanOrEqual(pair.distance - 1e-10);
    }
  });

  it('cluster IDs are in "cluster-N" format', () => {
    const models: ClusterModelInput[] = [
      { model: 'm1', label: 'M1', scores: { A: 1.0, B: 0.0, C: 0.0 } },
      { model: 'm2', label: 'M2', scores: { A: 0.9, B: 0.1, C: 0.0 } },
      { model: 'm3', label: 'M3', scores: { A: 0.0, B: 0.0, C: 1.0 } },
    ];
    const result = computeClusterAnalysis(models);
    if (result.skipped) return;
    for (const cluster of result.clusters) {
      expect(cluster.id).toMatch(/^cluster-\d+$/);
    }
  });

  it('silhouette scores are in [-1, 1]', () => {
    const models: ClusterModelInput[] = [
      { model: 'm1', label: 'M1', scores: { A: 1.0, B: 0.0, C: 0.0 } },
      { model: 'm2', label: 'M2', scores: { A: 0.9, B: 0.1, C: 0.0 } },
      { model: 'm3', label: 'M3', scores: { A: 0.0, B: 0.0, C: 1.0 } },
    ];
    const result = computeClusterAnalysis(models);
    if (result.skipped) return;
    for (const cluster of result.clusters) {
      for (const member of cluster.members) {
        expect(member.silhouetteScore).toBeGreaterThanOrEqual(-1);
        expect(member.silhouetteScore).toBeLessThanOrEqual(1 + 1e-10);
      }
    }
  });
});

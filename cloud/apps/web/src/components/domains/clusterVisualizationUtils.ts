import { type DomainCluster } from '../../api/operations/domainAnalysis';
import { VALUE_LABELS, VALUES, type ValueKey } from '../../data/domainAnalysisData';

export const CLUSTER_SCORE_MIN = -3.25;
export const CLUSTER_SCORE_MAX = 3.25;
export const CLUSTER_SCORE_RANGE = CLUSTER_SCORE_MAX - CLUSTER_SCORE_MIN;

const VALUE_INDEX = new Map(VALUES.map((valueKey, index) => [valueKey, index] as const));

function averageScore(clusters: DomainCluster[], valueKey: ValueKey): number {
  if (clusters.length === 0) return 0;
  return clusters.reduce((sum, cluster) => sum + (cluster.centroid[valueKey] ?? 0), 0) / clusters.length;
}

export function getClusterValueOrder(clusters: DomainCluster[]): ValueKey[] {
  const averages = new Map<ValueKey, number>();
  for (const valueKey of VALUES) {
    averages.set(valueKey, averageScore(clusters, valueKey));
  }

  return [...VALUES].sort((left, right) => {
    const avgDiff = (averages.get(right) ?? 0) - (averages.get(left) ?? 0);
    if (Math.abs(avgDiff) > 1e-9) return avgDiff;

    const labelDiff = (VALUE_LABELS[left] ?? left).localeCompare(VALUE_LABELS[right] ?? right);
    if (labelDiff !== 0) return labelDiff;

    return (VALUE_INDEX.get(left) ?? 0) - (VALUE_INDEX.get(right) ?? 0);
  });
}

export function clampClusterScore(score: number): number {
  return Math.max(CLUSTER_SCORE_MIN, Math.min(CLUSTER_SCORE_MAX, score));
}

export function getClusterScorePosition(score: number): number {
  const clamped = clampClusterScore(score);
  return ((clamped - CLUSTER_SCORE_MIN) / CLUSTER_SCORE_RANGE) * 100;
}

export function getClusterHeatmapScale(score: number): number {
  const clamped = clampClusterScore(score);
  return ((clamped - CLUSTER_SCORE_MIN) / CLUSTER_SCORE_RANGE) * 2 - 1;
}

export function isClusterScoreClipped(score: number): boolean {
  return score < CLUSTER_SCORE_MIN || score > CLUSTER_SCORE_MAX;
}

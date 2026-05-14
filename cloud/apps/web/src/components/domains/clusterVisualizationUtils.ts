import { type DomainCluster } from '../../api/operations/domainAnalysis';
import { VALUE_LABELS, VALUES, type ModelEntry, type ValueKey } from '../../data/domainAnalysisData';
import { type PairwiseKappaEntry } from '../models/ModelSimilarityMetrics';

export const CLUSTER_SCORE_MIN = -3.25;
export const CLUSTER_SCORE_MAX = 3.25;
export const CLUSTER_SCORE_RANGE = CLUSTER_SCORE_MAX - CLUSTER_SCORE_MIN;

export const DOT_BAR_CLUSTER_SCORE_MIN = -2.5;
export const DOT_BAR_CLUSTER_SCORE_MAX = 2.5;
export const DOT_BAR_CLUSTER_SCORE_RANGE = DOT_BAR_CLUSTER_SCORE_MAX - DOT_BAR_CLUSTER_SCORE_MIN;

export const DOT_BAR_WIN_RATE_MIN = 0;
export const DOT_BAR_WIN_RATE_MAX = 1;
export const WIN_RATE_MIDPOINT = 0.5;

export type AgreementStatus = 'loading' | 'needs-more-models' | 'unavailable' | 'ready';

export type InternalKappaNotComputableReason =
  | 'singleton'
  | 'members-outside-selection'
  | 'no-shared-scenarios';

export type InternalKappaResult =
  | { kind: 'value'; mean: number }
  | { kind: 'not-computable'; reason: InternalKappaNotComputableReason };

export type PairwiseKappaMap = Map<string, Map<string, number | PairwiseKappaEntry>>;

export const CLUSTER_VISUAL_COLORS = [
  '#2563eb',
  '#d97706',
  '#059669',
  '#e11d48',
  '#7c3aed',
  '#0ea5e9',
  '#ea580c',
  '#65a30d',
  '#d946ef',
  '#4f46e5',
  '#14b8a6',
  '#ca8a04',
] as const;

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

export function getClusterMemberLabels(cluster: DomainCluster): string[] {
  return cluster.members.map((member) => member.label);
}

export function getClusterMemberLabelText(cluster: DomainCluster): string {
  return getClusterMemberLabels(cluster).join(', ');
}

export function buildIndividualClusters(models: ModelEntry[]): DomainCluster[] {
  return models.map((model) => ({
    id: model.model,
    name: model.label,
    definingValues: [],
    centroid: model.values,
    members: [
      {
        model: model.model,
        label: model.label,
        silhouetteScore: 1,
        isOutlier: false,
        nearestClusterIds: null,
        distancesToNearestClusters: null,
      },
    ],
  }));
}

export function getClusterVisualColor(index: number): string {
  return CLUSTER_VISUAL_COLORS[index % CLUSTER_VISUAL_COLORS.length]!;
}

export function formatClusterScoreLabel(score: number): string {
  return score > 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
}

export function formatWinRateLabel(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function clampClusterScore(score: number, min = CLUSTER_SCORE_MIN, max = CLUSTER_SCORE_MAX): number {
  return Math.max(min, Math.min(max, score));
}

export function getClusterScorePosition(
  score: number,
  min = CLUSTER_SCORE_MIN,
  max = CLUSTER_SCORE_MAX,
): number {
  const clamped = clampClusterScore(score, min, max);
  const range = max - min;
  return ((clamped - min) / range) * 100;
}

export function getClusterHeatmapScale(
  score: number,
  min = CLUSTER_SCORE_MIN,
  max = CLUSTER_SCORE_MAX,
): number {
  const clamped = clampClusterScore(score, min, max);
  const range = max - min;
  return ((clamped - min) / range) * 2 - 1;
}

export function isClusterScoreClipped(
  score: number,
  min = CLUSTER_SCORE_MIN,
  max = CLUSTER_SCORE_MAX,
): boolean {
  return score < min || score > max;
}

function getPairwiseKappaValue(entry: number | PairwiseKappaEntry): number {
  return typeof entry === 'number' ? entry : entry.kappa;
}

function lookupPairwiseKappa(
  pairwiseKappaMap: PairwiseKappaMap,
  leftModelId: string,
  rightModelId: string,
): number | null {
  const forward = pairwiseKappaMap.get(leftModelId)?.get(rightModelId);
  if (forward != null) return getPairwiseKappaValue(forward);
  const reverse = pairwiseKappaMap.get(rightModelId)?.get(leftModelId);
  if (reverse != null) return getPairwiseKappaValue(reverse);
  return null;
}

export function meanInternalKappa(
  memberModelIds: readonly string[],
  visibleModelIdSet: ReadonlySet<string>,
  pairwiseKappaMap: PairwiseKappaMap,
): InternalKappaResult {
  if (memberModelIds.length <= 1) {
    return { kind: 'not-computable', reason: 'singleton' };
  }

  for (const memberModelId of memberModelIds) {
    if (!visibleModelIdSet.has(memberModelId)) {
      return { kind: 'not-computable', reason: 'members-outside-selection' };
    }
  }

  const pairwiseValues: number[] = [];
  for (let leftIndex = 0; leftIndex < memberModelIds.length - 1; leftIndex += 1) {
    const leftModelId = memberModelIds[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < memberModelIds.length; rightIndex += 1) {
      const rightModelId = memberModelIds[rightIndex]!;
      const pairwiseKappa = lookupPairwiseKappa(pairwiseKappaMap, leftModelId, rightModelId);
      if (pairwiseKappa == null) {
        return { kind: 'not-computable', reason: 'no-shared-scenarios' };
      }
      pairwiseValues.push(pairwiseKappa);
    }
  }

  if (pairwiseValues.length === 0) {
    return { kind: 'not-computable', reason: 'no-shared-scenarios' };
  }

  const mean = pairwiseValues.reduce((sum, value) => sum + value, 0) / pairwiseValues.length;
  return { kind: 'value', mean };
}

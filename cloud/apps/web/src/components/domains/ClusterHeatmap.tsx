import { useMemo } from 'react';
import { type DomainCluster } from '../../api/operations/domainAnalysis';
import { VALUE_LABELS } from '../../data/domainAnalysisData';
import { getPriorityColor } from './domainAnalysisColors';
import {
  CLUSTER_SCORE_MAX,
  CLUSTER_SCORE_MIN,
  getClusterMemberLabelText,
  getClusterValueOrder,
} from './clusterVisualizationUtils';

type ClusterHeatmapProps = {
  clusters: DomainCluster[];
};

const CLUSTER_PALETTE = [
  { accent: 'border-blue-500 bg-blue-50', dot: 'bg-blue-500' },
  { accent: 'border-amber-500 bg-amber-50', dot: 'bg-amber-500' },
  { accent: 'border-emerald-500 bg-emerald-50', dot: 'bg-emerald-500' },
  { accent: 'border-rose-500 bg-rose-50', dot: 'bg-rose-500' },
] as const;

function formatScore(score: number): string {
  const prefix = score > 0 ? '+' : '';
  return `${prefix}${score.toFixed(1)}`;
}

export function ClusterHeatmap({ clusters }: ClusterHeatmapProps) {
  const orderedValues = useMemo(() => getClusterValueOrder(clusters), [clusters]);
  const hasClippedScores = useMemo(
    () => clusters.some((cluster) => orderedValues.some((valueKey) => {
      const score = cluster.centroid[valueKey] ?? 0;
      return score < CLUSTER_SCORE_MIN || score > CLUSTER_SCORE_MAX;
    })),
    [clusters, orderedValues],
  );

  if (clusters.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-100 bg-white p-2">
        <table className="min-w-[860px] border-separate border-spacing-0 text-xs">
          <caption className="sr-only">Cluster heatmap</caption>
          <thead>
            <tr>
              <th className="sticky left-0 z-20 border-b border-gray-200 bg-white px-3 py-2 text-left font-medium text-gray-600">
                Cluster
              </th>
              {orderedValues.map((valueKey) => (
                <th key={valueKey} className="border-b border-gray-200 bg-white px-2 py-2 text-center font-medium text-gray-600">
                  {VALUE_LABELS[valueKey]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
          {clusters.map((cluster, index) => {
            const palette = CLUSTER_PALETTE[index % CLUSTER_PALETTE.length]!;
            const memberLabels = getClusterMemberLabelText(cluster);
            const clusterName = cluster.name.length > 0 ? cluster.name : memberLabels;
            return (
              <tr key={cluster.id}>
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 border-b border-gray-100 px-3 py-2 text-left align-top ${palette.accent}`}
                    title={memberLabels}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${palette.dot}`} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-900">Models: {memberLabels}</div>
                        <div className="truncate text-[11px] text-gray-500">Cluster: {clusterName}</div>
                      </div>
                    </div>
                  </th>
                  {orderedValues.map((valueKey) => {
                    const score = cluster.centroid[valueKey] ?? 0;
                    const background = getPriorityColor(score, CLUSTER_SCORE_MIN, CLUSTER_SCORE_MAX);
                    return (
                      <td key={valueKey} className="border-b border-gray-100 px-1 py-1">
                        <div
                          className="flex h-10 min-w-[64px] items-center justify-center rounded-md border border-white/60 text-[11px] font-semibold text-gray-900"
                          style={{ background }}
                          title={`${clusterName} · ${VALUE_LABELS[valueKey]}: ${score.toFixed(2)}`}
                        >
                          {formatScore(score)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
        <span>Columns are ordered by the values the clusters favor most on average.</span>
        <span>Color scale runs from {CLUSTER_SCORE_MIN.toFixed(1)} to {CLUSTER_SCORE_MAX.toFixed(1)}.</span>
      </div>

      {hasClippedScores && (
        <p className="text-[11px] text-amber-700">
          Some scores fall outside the fixed range and are shown at the edge of the color scale.
        </p>
      )}
    </div>
  );
}

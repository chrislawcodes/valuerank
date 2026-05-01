import { useMemo } from 'react';
import { type DomainCluster } from '../../api/operations/domainAnalysis';
import { VALUE_LABELS } from '../../data/domainAnalysisData';
import {
  DOT_BAR_CLUSTER_SCORE_MAX,
  DOT_BAR_CLUSTER_SCORE_MIN,
  formatClusterScoreLabel,
  getClusterMemberLabelText,
  getClusterScorePosition,
  getClusterValueOrder,
  isClusterScoreClipped,
} from './clusterVisualizationUtils';

type ClusterDotPlotProps = {
  clusters: DomainCluster[];
};

export function ClusterDotPlot({ clusters }: ClusterDotPlotProps) {
  const sortedValues = useMemo(() => getClusterValueOrder(clusters), [clusters]);

  if (clusters.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-gray-100 bg-white p-2">
        <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-gray-500">
          <span>Values ordered by average favorability across the shown clusters.</span>
          <span>
            Fixed axis: {formatClusterScoreLabel(DOT_BAR_CLUSTER_SCORE_MIN)} to {formatClusterScoreLabel(DOT_BAR_CLUSTER_SCORE_MAX)} with 0 at the midpoint.
          </span>
        </div>

        <div className="space-y-1.5 overflow-x-auto">
          <div className="flex items-center gap-2">
            <div className="w-32 shrink-0" />
            <div className="relative h-6 flex-1">
              <div className="absolute left-0 top-0 text-xs text-gray-400">← avoided</div>
              <div className="absolute right-0 top-0 text-xs text-gray-400">favored →</div>
              <div
                className="absolute top-0 text-xs font-semibold text-gray-500"
                style={{
                  left: '50%',
                  transform: 'translateX(-50%)',
                }}
              >
                50/50
              </div>
            </div>
          </div>

          {sortedValues.map((valueKey) => {
            const label = VALUE_LABELS[valueKey];

            return (
              <div key={valueKey} className="flex items-center gap-2">
                <div className="w-32 shrink-0 pr-2 text-right text-xs text-gray-700">{label}</div>
                <div className="relative h-5 flex-1 rounded-md bg-gray-50">
                  <div className="absolute bottom-0 top-0 w-px bg-gray-300" style={{ left: '50%' }} />
                  <div className="absolute bottom-1 top-1 w-px border-l border-dashed border-gray-200" style={{ left: '25%' }} />
                  <div className="absolute bottom-1 top-1 w-px border-l border-dashed border-gray-200" style={{ left: '75%' }} />
                  {clusters.map((cluster, index) => {
                    const score = cluster.centroid[valueKey] ?? 0;
                    const xPct = getClusterScorePosition(score, DOT_BAR_CLUSTER_SCORE_MIN, DOT_BAR_CLUSTER_SCORE_MAX);
                    const color = ['#3b82f6', '#f59e0b', '#10b981', '#f43f5e'][index % 4];
                    const memberLabels = cluster.members.map((member) => member.label).join(', ');
                    const clipped = isClusterScoreClipped(score, DOT_BAR_CLUSTER_SCORE_MIN, DOT_BAR_CLUSTER_SCORE_MAX);

                    return (
                      <div
                        key={cluster.id}
                        title={`${memberLabels}: ${score.toFixed(2)}`}
                        className="absolute"
                        style={{
                          left: `${xPct}%`,
                          top: '50%',
                          transform: 'translate(-50%, -50%)',
                          backgroundColor: color,
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          border: clipped ? '2px solid rgba(15, 23, 42, 0.45)' : '2px solid white',
                          boxShadow: clipped ? '0 0 0 1px rgba(15, 23, 42, 0.12)' : undefined,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="flex items-center gap-2">
            <div className="w-32 shrink-0" />
            <div className="relative h-5 flex-1">
              <div className="absolute left-0 top-0 text-xs text-gray-400">{formatClusterScoreLabel(DOT_BAR_CLUSTER_SCORE_MIN)}</div>
              <div
                className="absolute top-0 text-xs font-semibold text-gray-500"
                style={{
                  left: '50%',
                  transform: 'translateX(-50%)',
                }}
              >
                0
              </div>
              <div className="absolute right-0 top-0 text-xs text-gray-400">{formatClusterScoreLabel(DOT_BAR_CLUSTER_SCORE_MAX)}</div>
            </div>
          </div>

          {clusters.some((cluster) => sortedValues.some((valueKey) => isClusterScoreClipped(cluster.centroid[valueKey] ?? 0, DOT_BAR_CLUSTER_SCORE_MIN, DOT_BAR_CLUSTER_SCORE_MAX))) && (
            <p className="px-2 pb-1 text-[11px] text-amber-700">
              Scores outside the fixed range are pinned to the edge.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {clusters.map((cluster, index) => {
          const color = ['#3b82f6', '#f59e0b', '#10b981', '#f43f5e'][index % 4];
          const memberList = getClusterMemberLabelText(cluster);

          return (
            <div key={cluster.id} className="flex items-center gap-1 text-xs text-gray-600" title={memberList}>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span>Models: {memberList}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

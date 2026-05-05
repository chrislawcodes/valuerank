import { useMemo } from 'react';
import { type DomainCluster } from '../../api/operations/domainAnalysis';
import { VALUE_LABELS } from '../../data/domainAnalysisData';
import {
  DOT_BAR_CLUSTER_SCORE_MAX,
  DOT_BAR_CLUSTER_SCORE_MIN,
  formatClusterScoreLabel,
  getClusterScorePosition,
  getClusterValueOrder,
  getClusterVisualColor,
  isClusterScoreClipped,
} from './clusterVisualizationUtils';

type ClusterDotPlotProps = {
  clusters: DomainCluster[];
  activeGroupIds?: string[];
};

export function ClusterDotPlot({ clusters, activeGroupIds = [] }: ClusterDotPlotProps) {
  const sortedValues = useMemo(() => getClusterValueOrder(clusters), [clusters]);
  const activeGroupSet = useMemo(() => new Set(activeGroupIds), [activeGroupIds]);
  const hasActiveSelection = activeGroupIds.length > 0;

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
                    const color = getClusterVisualColor(index);
                    const memberLabels = cluster.members.map((member) => member.label).join(', ');
                    const clipped = isClusterScoreClipped(score, DOT_BAR_CLUSTER_SCORE_MIN, DOT_BAR_CLUSTER_SCORE_MAX);
                    const isActive = !hasActiveSelection || activeGroupSet.has(cluster.id);
                    const faded = hasActiveSelection && !isActive;

                    return (
                      <div
                        key={cluster.id}
                        title={`${memberLabels}: ${score.toFixed(2)}`}
                        data-cluster-id={cluster.id}
                        data-value-key={valueKey}
                        className="absolute"
                        style={{
                          left: `${xPct}%`,
                          top: '50%',
                          transform: `translate(-50%, -50%) scale(${isActive && hasActiveSelection ? 1.25 : 1})`,
                          backgroundColor: color,
                          opacity: faded ? 0.2 : hasActiveSelection ? 1 : 0.78,
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          border: clipped ? '2px solid rgba(15, 23, 42, 0.45)' : '2px solid white',
                          boxShadow: clipped ? '0 0 0 1px rgba(15, 23, 42, 0.12)' : undefined,
                          filter: isActive && hasActiveSelection ? `drop-shadow(0 0 8px rgba(255,255,255,0.35)) drop-shadow(0 0 12px ${color}aa)` : undefined,
                          zIndex: index + 1,
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
    </div>
  );
}

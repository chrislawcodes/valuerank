import { useMemo } from 'react';
import { type DomainCluster } from '../../api/operations/domainAnalysis';
import { VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';
import { Tooltip } from '../ui/Tooltip';
import {
  DOT_BAR_CLUSTER_SCORE_MAX,
  DOT_BAR_CLUSTER_SCORE_MIN,
  formatClusterScoreLabel,
  getClusterScorePosition,
  getClusterValueOrder,
  isClusterScoreClipped,
} from './clusterVisualizationUtils';

type ClusterBarPlotProps = {
  clusters: DomainCluster[];
  activeGroupId?: string | null;
};

const CLUSTER_PALETTE = ['#3b82f6', '#f59e0b', '#10b981', '#f43f5e'] as const;

function ClusterValueTooltip({
  clusters,
  valueKey,
  rankedClusters,
}: {
  clusters: DomainCluster[];
  valueKey: ValueKey;
  rankedClusters: DomainCluster[];
}) {
  return (
    <div className="min-w-[220px] max-w-[280px] whitespace-normal">
      <div className="mb-2 text-xs font-semibold text-gray-900">{VALUE_LABELS[valueKey]}</div>
      <div className="mb-1 grid grid-cols-[auto_1fr] gap-x-3 text-[10px] font-medium uppercase tracking-wide text-gray-500">
        <span>Color</span>
        <span>Logit</span>
      </div>
      <div className="space-y-1.5">
        {rankedClusters.map((cluster) => {
          const score = cluster.centroid[valueKey] ?? 0;
          const clusterIndex = clusters.findIndex((candidate) => candidate.id === cluster.id);
          const safeClusterIndex = clusterIndex >= 0 ? clusterIndex : 0;
          const color = CLUSTER_PALETTE[safeClusterIndex % CLUSTER_PALETTE.length]!;

          return (
            <div key={cluster.id} className="grid grid-cols-[auto_1fr] items-center gap-x-3">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="font-mono text-xs text-gray-900">{formatClusterScoreLabel(score)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getClusterBarOrder(clusters: DomainCluster[], valueKey: ValueKey): DomainCluster[] {
  return [...clusters].sort((left, right) => {
    const leftScore = Math.abs(left.centroid[valueKey] ?? 0);
    const rightScore = Math.abs(right.centroid[valueKey] ?? 0);
    const lengthDiff = rightScore - leftScore;
    if (Math.abs(lengthDiff) > 1e-9) return lengthDiff;
    return left.id.localeCompare(right.id);
  });
}

export function ClusterBarPlot({ clusters, activeGroupId = null }: ClusterBarPlotProps) {
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
            const midpoint = getClusterScorePosition(0, DOT_BAR_CLUSTER_SCORE_MIN, DOT_BAR_CLUSTER_SCORE_MAX);
            const rankedClusters = getClusterBarOrder(clusters, valueKey);

            return (
              <div key={valueKey} className="flex items-center gap-2">
                <div className="w-32 shrink-0 pr-2 text-right text-xs text-gray-700">{label}</div>
                <div className="relative h-6 flex-1 rounded-md bg-gray-50">
                  <div className="absolute bottom-0 top-0 w-px bg-gray-300" style={{ left: '50%' }} />
                  <div className="absolute bottom-1 top-1 w-px border-l border-dashed border-gray-200" style={{ left: '25%' }} />
                  <div className="absolute bottom-1 top-1 w-px border-l border-dashed border-gray-200" style={{ left: '75%' }} />

                  {rankedClusters.map((cluster, index) => {
                    const score = cluster.centroid[valueKey] ?? 0;
                    const endPosition = getClusterScorePosition(score, DOT_BAR_CLUSTER_SCORE_MIN, DOT_BAR_CLUSTER_SCORE_MAX);
                    const left = Math.min(midpoint, endPosition);
                    const width = Math.max(Math.abs(endPosition - midpoint), 1);
                    const clusterIndex = clusters.findIndex((candidate) => candidate.id === cluster.id);
                    const safeClusterIndex = clusterIndex >= 0 ? clusterIndex : 0;
                    const color = CLUSTER_PALETTE[safeClusterIndex % CLUSTER_PALETTE.length]!;
                    const clipped = isClusterScoreClipped(score, DOT_BAR_CLUSTER_SCORE_MIN, DOT_BAR_CLUSTER_SCORE_MAX);
                    const isActive = activeGroupId == null || activeGroupId === cluster.id;
                    const faded = activeGroupId != null && !isActive;

                    return (
                      <Tooltip
                        key={cluster.id}
                        content={<ClusterValueTooltip clusters={clusters} valueKey={valueKey} rankedClusters={rankedClusters} />}
                        position="top"
                        variant="light"
                        className="max-w-[300px] whitespace-normal"
                        triggerClassName="absolute top-1/2"
                        triggerStyle={{
                          left: `${left}%`,
                          width: `${width}%`,
                          transform: 'translateY(-50%)',
                          height: '10px',
                          zIndex: isActive ? rankedClusters.length + 20 - index : index + 1,
                          opacity: faded ? 0.18 : activeGroupId != null ? 1 : 0.78,
                          filter: isActive && activeGroupId != null ? `drop-shadow(0 0 8px rgba(255,255,255,0.35)) drop-shadow(0 0 12px ${color}99)` : undefined,
                        }}
                      >
                        <div
                          data-cluster-id={cluster.id}
                          data-value-key={valueKey}
                          className="h-full w-full rounded-full"
                          style={{
                            backgroundColor: color,
                            boxShadow: isActive && activeGroupId != null ? `0 0 0 1px rgba(255,255,255,0.7), 0 0 10px ${color}80` : undefined,
                            border: clipped ? '1px solid rgba(15, 23, 42, 0.4)' : '1px solid rgba(255, 255, 255, 0.8)',
                          }}
                        />
                      </Tooltip>
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

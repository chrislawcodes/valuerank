import { useMemo } from 'react';
import { type DomainCluster } from '../../api/operations/domainAnalysis';
import { VALUE_LABELS, VALUES, type ValueKey } from '../../data/domainAnalysisData';

type ClusterDotPlotProps = {
  clusters: DomainCluster[];
};

const DOT_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#f43f5e'];

function getSpreadForValue(clusters: DomainCluster[], valueKey: ValueKey) {
  const scores = clusters.map((cluster) => cluster.centroid[valueKey] ?? 0);
  return Math.max(...scores) - Math.min(...scores);
}

export function ClusterDotPlot({ clusters }: ClusterDotPlotProps) {
  const { sortedValues, axisMin, axisMax, zeroPct } = useMemo(() => {
    const allScores = clusters.flatMap((cluster) => VALUES.map((valueKey) => cluster.centroid[valueKey] ?? 0));
    if (allScores.length === 0) {
      return {
        sortedValues: [...VALUES],
        axisMin: -1,
        axisMax: 1,
        zeroPct: 50,
      };
    }

    let computedAxisMin = Math.min(...allScores);
    const axisMax = Math.max(...allScores);
    if (computedAxisMin === axisMax) {
      computedAxisMin = axisMax - 1;
    }

    const axisRange = axisMax - computedAxisMin;
    const zeroPos = ((0 - computedAxisMin) / axisRange) * 100;
    const zeroPct = Math.max(0, Math.min(100, zeroPos));

    const sortedValues = [...VALUES].sort((a, b) => {
      const spreadA = getSpreadForValue(clusters, a);
      const spreadB = getSpreadForValue(clusters, b);
      return spreadB - spreadA;
    });

    return {
      sortedValues,
      axisMin: computedAxisMin,
      axisMax,
      zeroPct,
    };
  }, [clusters]);

  if (clusters.length < 2) {
    return null;
  }

  return (
    <div className="mb-4 space-y-1">
      <div className="flex items-center gap-2">
        <div className="w-32 shrink-0" />
        <div className="relative h-5 flex-1">
          <div className="absolute left-0 top-0 text-xs text-gray-400">← avoided</div>
          <div className="absolute right-0 top-0 text-xs text-gray-400">favored →</div>
          <div
            className="absolute top-0 text-xs text-gray-400"
            style={{
              left: `${zeroPct}%`,
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
            <div className="relative h-5 flex-1">
              <div className="absolute bottom-0 top-0 w-px bg-gray-300" style={{ left: `${zeroPct}%` }} />
              {clusters.map((cluster, index) => {
                const score = cluster.centroid[valueKey] ?? 0;
                const axisRange = axisMax - axisMin;
                const xPct = ((score - axisMin) / axisRange) * 100;
                const color = DOT_COLORS[index % DOT_COLORS.length];
                const memberLabels = cluster.members.map((member) => member.label).join(', ');

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
                      border: '2px solid white',
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
        <div className="relative h-4 flex-1">
          <div className="absolute left-0 top-0 text-xs text-gray-400">{axisMin.toFixed(1)}</div>
          <div
            className="absolute top-0 text-xs text-gray-400"
            style={{
              left: `${zeroPct}%`,
              transform: 'translateX(-50%)',
            }}
          >
            0
          </div>
          <div className="absolute right-0 top-0 text-xs text-gray-400">{axisMax.toFixed(1)}</div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-3">
        {clusters.map((cluster, index) => {
          const color = DOT_COLORS[index % DOT_COLORS.length];
          const memberList = cluster.members.map((member) => member.label).join(', ');
          const legendLabel = cluster.name.length > 0 ? cluster.name : memberList;

          return (
            <div key={cluster.id} className="flex items-center gap-1 text-xs text-gray-600" title={memberList}>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span>{legendLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

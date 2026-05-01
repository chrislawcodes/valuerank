import { useMemo } from 'react';
import { type DomainCluster } from '../../api/operations/domainAnalysis';
import { VALUE_LABELS } from '../../data/domainAnalysisData';
import {
  CLUSTER_SCORE_MAX,
  CLUSTER_SCORE_MIN,
  CLUSTER_SCORE_RANGE,
  getClusterMemberLabelText,
  getClusterValueOrder,
} from './clusterVisualizationUtils';

type ClusterRadarChartProps = {
  clusters: DomainCluster[];
};

const CHART_SIZE = 640;
const VIEW_BOX_HEIGHT = 560;
const CENTER_X = 286;
const CENTER_Y = 276;
const OUTER_RADIUS = 184;

const CLUSTER_PALETTE = [
  { stroke: '#2563eb', fill: 'rgba(37, 99, 235, 0.14)' },
  { stroke: '#d97706', fill: 'rgba(217, 119, 6, 0.14)' },
  { stroke: '#059669', fill: 'rgba(5, 150, 105, 0.14)' },
  { stroke: '#e11d48', fill: 'rgba(225, 29, 72, 0.14)' },
] as const;

function getPoint(angle: number, radius: number) {
  return {
    x: CENTER_X + Math.cos(angle) * radius,
    y: CENTER_Y + Math.sin(angle) * radius,
  };
}

function scoreToRadius(score: number): number {
  const clamped = Math.max(CLUSTER_SCORE_MIN, Math.min(CLUSTER_SCORE_MAX, score));
  return ((clamped - CLUSTER_SCORE_MIN) / CLUSTER_SCORE_RANGE) * OUTER_RADIUS;
}

export function ClusterRadarChart({ clusters }: ClusterRadarChartProps) {
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

  const angleStep = (Math.PI * 2) / orderedValues.length;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-100 bg-white p-2">
        <svg
          viewBox={`0 0 ${CHART_SIZE} ${VIEW_BOX_HEIGHT}`}
          className="h-auto min-w-[640px] w-full"
          role="img"
          aria-label="Cluster radar chart"
        >
          <text x={24} y={28} className="fill-gray-500 text-[11px] uppercase tracking-wide">
            Radar chart
          </text>
          <text x={24} y={44} className="fill-gray-400 text-[10px]">
            Scale = -3.25 to +3.25
          </text>

          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const radius = OUTER_RADIUS * fraction;
            const value = CLUSTER_SCORE_MIN + CLUSTER_SCORE_RANGE * fraction;
            return (
              <g key={fraction}>
                <circle cx={CENTER_X} cy={CENTER_Y} r={radius} fill="none" stroke="#e5e7eb" strokeWidth="1" />
                <line
                  x1={CENTER_X - radius}
                  y1={CENTER_Y}
                  x2={CENTER_X + radius}
                  y2={CENTER_Y}
                  stroke={fraction === 0.5 ? '#94a3b8' : '#f3f4f6'}
                  strokeDasharray={fraction === 0.5 ? '4 4' : '1 0'}
                  strokeWidth={fraction === 0.5 ? '1.25' : '1'}
                />
                <text
                  x={CENTER_X + radius + 8}
                  y={CENTER_Y + 4}
                  className="fill-gray-400 text-[10px]"
                >
                  {value.toFixed(1)}
                </text>
              </g>
            );
          })}

          {orderedValues.map((valueKey, index) => {
            const angle = -Math.PI / 2 + angleStep * index;
            const outer = getPoint(angle, OUTER_RADIUS);
            const labelPoint = getPoint(angle, OUTER_RADIUS + 24);
            const label = VALUE_LABELS[valueKey];
            const anchor = labelPoint.x < CENTER_X - 8 ? 'end' : labelPoint.x > CENTER_X + 8 ? 'start' : 'middle';

            return (
              <g key={valueKey}>
                <line x1={CENTER_X} y1={CENTER_Y} x2={outer.x} y2={outer.y} stroke="#e5e7eb" strokeWidth="1" />
                <text
                  x={labelPoint.x}
                  y={labelPoint.y}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  className="fill-gray-700 text-[10px] font-medium"
                >
                  {label}
                </text>
              </g>
            );
          })}

          <circle cx={CENTER_X} cy={CENTER_Y} r="2.75" fill="#94a3b8" />

          {clusters.map((cluster, index) => {
            const palette = CLUSTER_PALETTE[index % CLUSTER_PALETTE.length]!;
            const points = orderedValues.map((valueKey, valueIndex) => {
              const angle = -Math.PI / 2 + angleStep * valueIndex;
              const score = cluster.centroid[valueKey] ?? 0;
              return getPoint(angle, scoreToRadius(score));
            });

            const path = points
              .map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
              .join(' ');

            return (
              <g key={cluster.id}>
                <path d={`${path} Z`} fill={palette.fill} stroke={palette.stroke} strokeWidth="2" />
                {points.map((point, pointIndex) => {
                  const valueKey = orderedValues[pointIndex]!;
                  const score = cluster.centroid[valueKey] ?? 0;
                  return (
                    <g key={`${cluster.id}-${valueKey}`}>
                      <title>{`${VALUE_LABELS[valueKey]}: ${score.toFixed(2)}`}</title>
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r="3.2"
                        fill={palette.stroke}
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}

          <g>
            <line x1={24} y1={512} x2={132} y2={512} stroke="#d1d5db" strokeWidth="1.5" />
            <line x1={78} y1={502} x2={78} y2={522} stroke="#d1d5db" strokeWidth="1.5" />
            <text x={24} y={500} className="fill-gray-400 text-[10px]">
              -3.25
            </text>
            <text x={71} y={500} className="fill-gray-500 text-[10px] font-semibold">
              0
            </text>
            <text x={116} y={500} className="fill-gray-400 text-[10px]">
              +3.25
            </text>
          </g>

          <text x={24} y={534} className="fill-gray-500 text-[10px]">
            Mid-ring = neutral, outer ring = strongest favoring.
          </text>
        </svg>
      </div>

      {hasClippedScores && (
        <p className="text-[11px] text-amber-700">
          Some scores fall outside the fixed range and are shown at the edge of the chart.
        </p>
      )}

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {clusters.map((cluster, index) => {
          const palette = CLUSTER_PALETTE[index % CLUSTER_PALETTE.length]!;
          const memberLabels = getClusterMemberLabelText(cluster);
          const title = cluster.name.length > 0 ? cluster.name : memberLabels;
          return (
            <div key={cluster.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-start gap-2">
                <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: palette.stroke }} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">Models: {memberLabels}</p>
                  <p className="text-xs text-gray-500">Cluster: {title}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

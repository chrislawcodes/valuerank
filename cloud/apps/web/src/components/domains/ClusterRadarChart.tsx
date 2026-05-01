import { useMemo } from 'react';
import { type DomainCluster } from '../../api/operations/domainAnalysis';
import { VALUE_LABELS } from '../../data/domainAnalysisData';
import {
  DISPLAY_VALUES,
  QUADRANT_ARCS,
  buildValueAngles,
} from './useDominanceGraph';
import { getClusterVisualColor } from './clusterVisualizationUtils';

type ClusterRadarChartProps = {
  clusters: DomainCluster[];
  activeGroupIds?: string[];
};

const CHART_SIZE = 640;
const VIEW_BOX_HEIGHT = 560;
const CENTER_X = 286;
const CENTER_Y = 276;
const OUTER_RADIUS = 228;
const CATEGORY_RING_RADIUS = OUTER_RADIUS + 26;
const CATEGORY_LABEL_RADIUS = OUTER_RADIUS + 82;
const RADAR_SCORE_MIN = -2.5;
const RADAR_SCORE_MAX = 2.5;
const RADAR_SCORE_RANGE = RADAR_SCORE_MAX - RADAR_SCORE_MIN;

function withAlpha(hexColor: string, alpha: number): string {
  const hex = hexColor.replace('#', '');
  const fullHex = hex.length === 3
    ? hex.split('').map((char) => `${char}${char}`).join('')
    : hex;
  const value = Number.parseInt(fullHex, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getPoint(angle: number, radius: number) {
  return {
    x: CENTER_X + Math.cos(angle) * radius,
    y: CENTER_Y + Math.sin(angle) * radius,
  };
}

function scoreToRadius(score: number): number {
  const clamped = Math.max(RADAR_SCORE_MIN, Math.min(RADAR_SCORE_MAX, score));
  return ((clamped - RADAR_SCORE_MIN) / RADAR_SCORE_RANGE) * OUTER_RADIUS;
}

export function ClusterRadarChart({ clusters, activeGroupIds = [] }: ClusterRadarChartProps) {
  const valueAngles = useMemo(() => buildValueAngles(), []);
  const activeGroupSet = useMemo(() => new Set(activeGroupIds), [activeGroupIds]);
  const hasActiveSelection = activeGroupIds.length > 0;
  const clusterColorIndexById = useMemo(
    () => new Map(clusters.map((cluster, index) => [cluster.id, index] as const)),
    [clusters],
  );
  const renderedClusters = useMemo(
    () => [...clusters].sort((left, right) => {
      const leftActive = hasActiveSelection && activeGroupSet.has(left.id) ? 1 : 0;
      const rightActive = hasActiveSelection && activeGroupSet.has(right.id) ? 1 : 0;
      return leftActive - rightActive;
    }),
    [activeGroupSet, clusters, hasActiveSelection],
  );
  const hasClippedScores = useMemo(
    () => clusters.some((cluster) => DISPLAY_VALUES.some((valueKey) => {
      const score = cluster.centroid[valueKey] ?? 0;
      return score < RADAR_SCORE_MIN || score > RADAR_SCORE_MAX;
    })),
    [clusters],
  );

  if (clusters.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-100 bg-white p-2">
        <svg
          viewBox={`0 0 ${CHART_SIZE} ${VIEW_BOX_HEIGHT}`}
          className="h-auto min-w-[640px] w-full"
          role="img"
          aria-label="Cluster radar chart ordered by favorability with Schwartz category ring"
        >
          <text x={24} y={28} className="fill-gray-500 text-[11px] uppercase tracking-wide">
            Radar chart
          </text>

          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const radius = OUTER_RADIUS * fraction;
            const value = RADAR_SCORE_MIN + RADAR_SCORE_RANGE * fraction;
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

          {QUADRANT_ARCS.map((quadrant) => {
            const midAngle = (quadrant.startAngle + quadrant.endAngle) / 2;
            const start = getPoint(quadrant.startAngle, CATEGORY_RING_RADIUS);
            const end = getPoint(quadrant.endAngle, CATEGORY_RING_RADIUS);
            const largeArcFlag = quadrant.endAngle - quadrant.startAngle > Math.PI ? 1 : 0;
            const fillStart = getPoint(quadrant.startAngle, CATEGORY_RING_RADIUS);
            const fillEnd = getPoint(quadrant.endAngle, CATEGORY_RING_RADIUS);

            return (
              <g key={quadrant.label}>
                <path
                  d={`M ${CENTER_X} ${CENTER_Y} L ${fillStart.x.toFixed(2)} ${fillStart.y.toFixed(2)} A ${CATEGORY_RING_RADIUS} ${CATEGORY_RING_RADIUS} 0 ${largeArcFlag} 1 ${fillEnd.x.toFixed(2)} ${fillEnd.y.toFixed(2)} Z`}
                  fill={quadrant.fill}
                />
                <path
                  d={`M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${CATEGORY_RING_RADIUS} ${CATEGORY_RING_RADIUS} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`}
                  fill="none"
                  stroke={quadrant.ring}
                  strokeWidth="18"
                  opacity="0.72"
                />
                <text
                  x={getPoint(midAngle, CATEGORY_LABEL_RADIUS).x}
                  y={getPoint(midAngle, CATEGORY_LABEL_RADIUS).y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-gray-700 text-[10px] font-semibold"
                >
                  {quadrant.label}
                </text>
              </g>
            );
          })}

          {DISPLAY_VALUES.map((valueKey) => {
            const angle = valueAngles.get(valueKey) ?? -Math.PI / 2;
            const outer = getPoint(angle, OUTER_RADIUS);
            const labelPoint = getPoint(angle, OUTER_RADIUS + 18);
            const label = VALUE_LABELS[valueKey];
            const anchor =
              labelPoint.x < CENTER_X - 8
                ? 'end'
                : labelPoint.x > CENTER_X + 8
                  ? 'start'
                  : 'middle';

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

          {renderedClusters.map((cluster, index) => {
            const clusterColorIndex = clusterColorIndexById.get(cluster.id) ?? index;
            const stroke = getClusterVisualColor(clusterColorIndex);
            const fill = withAlpha(stroke, 0.14);
            const orderedValues = DISPLAY_VALUES;
            const isActive = !hasActiveSelection || activeGroupSet.has(cluster.id);
            const faded = hasActiveSelection && !isActive;
            const points = orderedValues.map((valueKey) => {
              const angle = valueAngles.get(valueKey) ?? -Math.PI / 2;
              const score = cluster.centroid[valueKey] ?? 0;
              return getPoint(angle, scoreToRadius(score));
            });

            const path = points
              .map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
              .join(' ');

            return (
              <g key={cluster.id}>
                <path
                  d={`${path} Z`}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isActive && hasActiveSelection ? '3' : '2'}
                  opacity={faded ? 0.16 : hasActiveSelection ? 1 : 0.78}
                  style={isActive && hasActiveSelection ? { filter: `drop-shadow(0 0 8px rgba(255,255,255,0.35)) drop-shadow(0 0 14px ${stroke}aa)` } : undefined}
                />
                {points.map((point, pointIndex) => {
                  const valueKey = orderedValues[pointIndex]!;
                  const score = cluster.centroid[valueKey] ?? 0;
                  return (
                    <g key={`${cluster.id}-${valueKey}`}>
                      <title>{`${VALUE_LABELS[valueKey]}: ${score.toFixed(2)}`}</title>
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={isActive && hasActiveSelection ? 4 : 3.2}
                        fill={stroke}
                        stroke="#ffffff"
                        strokeWidth="1.5"
                        opacity={faded ? 0.2 : hasActiveSelection ? 1 : 0.85}
                        style={isActive && hasActiveSelection ? { filter: `drop-shadow(0 0 6px rgba(255,255,255,0.35)) drop-shadow(0 0 12px ${stroke}aa)` } : undefined}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}

        </svg>
      </div>

      {hasClippedScores && (
        <p className="text-[11px] text-amber-700">
          Some scores fall outside the fixed range and are shown at the edge of the chart.
        </p>
      )}
    </div>
  );
}

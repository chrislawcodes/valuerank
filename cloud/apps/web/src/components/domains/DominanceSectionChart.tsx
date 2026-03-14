import { VALUE_LABELS, type ModelEntry, type ValueKey } from '../../data/domainAnalysisData';
import { getPriorityColor } from './domainAnalysisColors';
import {
  CHART_CENTER_X,
  CHART_CENTER_Y,
  CHART_HEIGHT,
  CHART_WIDTH,
  CLOSE_EDGE_MEDIUM_WIDTH,
  CLOSE_WINRATE_DELTA,
  NODE_ANIMATION_BASE_DURATION_MS,
  NODE_ANIMATION_PER_NODE_SLOWDOWN_MS,
  NODE_RADIUS,
  type NodePosition,
  QUADRANT_ARCS,
  QUADRANT_LABEL_RADIUS,
  QUADRANT_RING_RADIUS,
  QUADRANT_SECTOR_RADIUS,
} from './useDominanceGraph';

type DominanceEdge = {
  from: ValueKey;
  to: ValueKey;
  gap: number;
};

export type DominanceSectionThemeColors = {
  arrowColor: string;
  outgoingFocusedColor: string;
  incomingFocusedColor: string;
  neutralColor: string;
  closeWinColor: string;
  nodeLabelColor: string;
  nodeSubLabelColor: string;
  panelText: string;
  panelMutedText: string;
  panelBorder: string;
  panelBg: string;
  cardBg: string;
  cardBorder: string;
  selectedRingColor: string;
  idleRingColor: string;
};

type DominanceSectionChartProps = {
  animationPhase: 'idle' | 'collapse' | 'expand';
  edgeClockwiseOrder: Map<number, number>;
  edges: DominanceEdge[];
  focusedValue: ValueKey | null;
  hoveredValue: ValueKey | null;
  nodePositions: NodePosition[];
  onFocusToggle: (value: ValueKey) => void;
  onHoverChange: (value: ValueKey | null) => void;
  positionByValue: Map<ValueKey, NodePosition>;
  prefersReducedMotion: boolean;
  priorityValueRange: { min: number; max: number };
  selectedModel: ModelEntry | undefined;
  themeColors: DominanceSectionThemeColors;
};

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angle: number,
): { x: number; y: number } {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

function describeSectorPath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArcFlag = endAngle - startAngle <= Math.PI ? 0 : 1;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
}

function describeArcPath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArcFlag = endAngle - startAngle <= Math.PI ? 0 : 1;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function describeNodeHalfArc(cx: number, cy: number, radius: number, topHalf: boolean): string {
  const startX = cx - radius;
  const endX = cx + radius;
  const sweepFlag = topHalf ? 1 : 0;
  return `M ${startX} ${cy} A ${radius} ${radius} 0 0 ${sweepFlag} ${endX} ${cy}`;
}

function getEdgeColor(params: {
  focusedValue: ValueKey | null;
  isFocusedEdge: boolean;
  isCloseWinRate: boolean;
  isOutgoingFromFocused: boolean;
  isIncomingToFocused: boolean;
  neutralColor: string;
  closeWinColor: string;
  outgoingFocusedColor: string;
  incomingFocusedColor: string;
  arrowColor: string;
}): string {
  const {
    focusedValue,
    isFocusedEdge,
    isCloseWinRate,
    isOutgoingFromFocused,
    isIncomingToFocused,
    neutralColor,
    closeWinColor,
    outgoingFocusedColor,
    incomingFocusedColor,
    arrowColor,
  } = params;

  if (focusedValue == null) return neutralColor;
  if (!isFocusedEdge) return neutralColor;
  if (isCloseWinRate) return closeWinColor;
  if (isOutgoingFromFocused) return outgoingFocusedColor;
  if (isIncomingToFocused) return incomingFocusedColor;
  return arrowColor;
}

export function DominanceSectionChart({
  animationPhase,
  edgeClockwiseOrder,
  edges,
  focusedValue,
  hoveredValue,
  nodePositions,
  onFocusToggle,
  onHoverChange,
  positionByValue,
  prefersReducedMotion,
  priorityValueRange,
  selectedModel,
  themeColors,
}: DominanceSectionChartProps) {
  const edgeTransition =
    'stroke-opacity 280ms ease, stroke 280ms ease, stroke-width 280ms ease, filter 280ms ease';
  const fillTransition = 'fill-opacity 280ms ease, fill 280ms ease, filter 280ms ease';
  const edgesVisible = animationPhase === 'idle';
  const svgStyle = { height: 'calc(100vh - 140px)', minHeight: '900px' };

  return (
    <>
      <style>{`
        @keyframes neonPulseStroke {
          0%, 100% { filter: drop-shadow(0 0 2px currentColor) drop-shadow(0 0 5px currentColor); }
          50% { filter: drop-shadow(0 0 4px currentColor) drop-shadow(0 0 10px currentColor); }
        }
        @keyframes neonPulseCircle {
          0%, 100% { filter: drop-shadow(0 0 3px rgba(59,130,246,0.45)) drop-shadow(0 0 9px rgba(59,130,246,0.35)); }
          50% { filter: drop-shadow(0 0 6px rgba(59,130,246,0.65)) drop-shadow(0 0 14px rgba(59,130,246,0.55)); }
        }
      `}</style>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full min-w-[1120px]"
        style={svgStyle}
        role="img"
        aria-label="Value dominance graph"
      >
        {QUADRANT_ARCS.map((quadrant) => {
          const midAngle = (quadrant.startAngle + quadrant.endAngle) / 2;
          const labelPoint = polarToCartesian(
            CHART_CENTER_X,
            CHART_CENTER_Y,
            QUADRANT_LABEL_RADIUS,
            midAngle,
          );
          return (
            <g key={quadrant.label}>
              <path
                d={describeSectorPath(
                  CHART_CENTER_X,
                  CHART_CENTER_Y,
                  QUADRANT_SECTOR_RADIUS,
                  quadrant.startAngle,
                  quadrant.endAngle,
                )}
                fill={quadrant.fill}
              />
              <path
                d={describeArcPath(
                  CHART_CENTER_X,
                  CHART_CENTER_Y,
                  QUADRANT_RING_RADIUS,
                  quadrant.startAngle,
                  quadrant.endAngle,
                )}
                fill="none"
                stroke={quadrant.ring}
                strokeWidth={18}
                opacity={0.75}
              />
              <text
                x={labelPoint.x}
                y={labelPoint.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="select-none"
                style={{ fontSize: '26px', fontWeight: 600, fill: '#374151' }}
              >
                {quadrant.label}
              </text>
            </g>
          );
        })}

        {edges.map((edge, edgeIndex) => {
          const source = positionByValue.get(edge.from);
          const target = positionByValue.get(edge.to);
          if (!source || !target) return null;
          const isFocusedEdge =
            focusedValue == null || edge.from === focusedValue || edge.to === focusedValue;
          const isOutgoingFromFocused = focusedValue != null && edge.from === focusedValue;
          const isIncomingToFocused = focusedValue != null && edge.to === focusedValue;
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const length = Math.hypot(dx, dy) || 1;
          const ux = dx / length;
          const uy = dy / length;
          const winRate = 1 / (1 + Math.exp(-edge.gap));
          const normalized = Math.max(0, Math.min(1, (winRate - 0.5) / 0.5));
          const widthFactor = normalized ** 1.6;
          const isCloseWinRate = Math.abs(winRate - 0.5) <= CLOSE_WINRATE_DELTA;
          const regularStrokeWidth = 0.3 + widthFactor * 7.2;
          const emphasizedStrokeWidth = 0.3 + widthFactor * 14.4;
          const rawStrokeOpacity =
            isOutgoingFromFocused || isIncomingToFocused ? 0.9 : isFocusedEdge ? 0.78 : 0.72;
          const rawStrokeWidth = isCloseWinRate
            ? CLOSE_EDGE_MEDIUM_WIDTH
            : focusedValue != null && isOutgoingFromFocused
              ? emphasizedStrokeWidth
              : regularStrokeWidth;
          const losingAdjustedWidth = isIncomingToFocused
            ? rawStrokeWidth * 2.25
            : rawStrokeWidth;
          const sourceIsSelected = focusedValue != null && edge.from === focusedValue;
          const isFromUnselectedCircle = focusedValue == null || !sourceIsSelected;
          const strokeWidth = isFromUnselectedCircle
            ? losingAdjustedWidth * 0.64
            : losingAdjustedWidth;
          const strokeOpacity = isFromUnselectedCircle
            ? rawStrokeOpacity * 0.42
            : rawStrokeOpacity;
          const edgeColor = getEdgeColor({
            focusedValue,
            isFocusedEdge,
            isCloseWinRate,
            isOutgoingFromFocused,
            isIncomingToFocused,
            neutralColor: themeColors.neutralColor,
            closeWinColor: themeColors.closeWinColor,
            outgoingFocusedColor: themeColors.outgoingFocusedColor,
            incomingFocusedColor: themeColors.incomingFocusedColor,
            arrowColor: themeColors.arrowColor,
          });
          const sourceGap = NODE_RADIUS + Math.min(8, strokeWidth * 0.6 + 2);
          const startX = source.x + ux * sourceGap;
          const startY = source.y + uy * sourceGap;
          const endX = target.x - ux * NODE_RADIUS;
          const endY = target.y - uy * NODE_RADIUS;
          const headLength = 1.8 + strokeWidth * 1.9;
          const headHalfWidth = 0.8 + strokeWidth * 0.95;
          const sourceBaseX = startX + ux * headLength;
          const sourceBaseY = startY + uy * headLength;
          const baseX = endX - ux * headLength;
          const baseY = endY - uy * headLength;
          const lineStartX = isCloseWinRate ? sourceBaseX : startX;
          const lineStartY = isCloseWinRate ? sourceBaseY : startY;
          const px = -uy;
          const py = ux;
          const leftX = baseX + px * headHalfWidth;
          const leftY = baseY + py * headHalfWidth;
          const rightX = baseX - px * headHalfWidth;
          const rightY = baseY - py * headHalfWidth;
          const sourceLeftX = sourceBaseX + px * headHalfWidth;
          const sourceLeftY = sourceBaseY + py * headHalfWidth;
          const sourceRightX = sourceBaseX - px * headHalfWidth;
          const sourceRightY = sourceBaseY - py * headHalfWidth;
          const clockwiseRank = edgeClockwiseOrder.get(edgeIndex) ?? edgeIndex;
          const edgeDelay =
            !prefersReducedMotion && edgesVisible ? `${clockwiseRank * 12}ms` : '0ms';
          return (
            <g key={`${edge.from}-${edge.to}`}>
              <line
                x1={lineStartX}
                y1={lineStartY}
                x2={baseX}
                y2={baseY}
                stroke={edgeColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                style={
                  focusedValue != null && isFocusedEdge
                    ? {
                        color: edgeColor,
                        strokeOpacity: edgesVisible ? strokeOpacity : 0,
                        animation: prefersReducedMotion
                          ? undefined
                          : 'neonPulseStroke 1.7s ease-in-out infinite',
                        transition: edgeTransition,
                        transitionDelay: edgeDelay,
                      }
                    : {
                        strokeOpacity: edgesVisible ? strokeOpacity : 0,
                        transition: edgeTransition,
                        transitionDelay: edgeDelay,
                      }
                }
              />
              <polygon
                points={`${endX},${endY} ${leftX},${leftY} ${rightX},${rightY}`}
                fill={edgeColor}
                style={
                  focusedValue != null && isFocusedEdge
                    ? {
                        color: edgeColor,
                        fillOpacity: edgesVisible ? strokeOpacity : 0,
                        animation: prefersReducedMotion
                          ? undefined
                          : 'neonPulseStroke 1.9s ease-in-out infinite',
                        transition: fillTransition,
                        transitionDelay: edgeDelay,
                      }
                    : {
                        fillOpacity: edgesVisible ? strokeOpacity : 0,
                        transition: fillTransition,
                        transitionDelay: edgeDelay,
                      }
                }
              />
              {isCloseWinRate && (
                <polygon
                  points={`${startX},${startY} ${sourceLeftX},${sourceLeftY} ${sourceRightX},${sourceRightY}`}
                  fill={edgeColor}
                  style={
                    focusedValue != null && isFocusedEdge
                      ? {
                          color: edgeColor,
                          fillOpacity: edgesVisible ? strokeOpacity : 0,
                          transition: fillTransition,
                          transitionDelay: edgeDelay,
                        }
                      : {
                          fillOpacity: edgesVisible ? strokeOpacity : 0,
                          transition: fillTransition,
                          transitionDelay: edgeDelay,
                        }
                  }
                />
              )}
            </g>
          );
        })}

        {nodePositions.map((node, nodeIndex) => {
          const isHedonismNode = node.value === 'Hedonism';
          const isSelectedNode = focusedValue != null && node.value === focusedValue;
          const isHovered = hoveredValue === node.value;
          const isConnectedToFocused =
            focusedValue != null &&
            edges.some(
              (edge) =>
                (edge.from === focusedValue && edge.to === node.value) ||
                (edge.to === focusedValue && edge.from === node.value),
            );
          const nodeOpacity =
            focusedValue == null ? 1 : isSelectedNode ? 1 : isConnectedToFocused ? 0.72 : 0.35;
          const nodeStroke = isSelectedNode ? '#111827' : isHovered ? '#3b82f6' : '#94a3b8';
          const nodeStrokeWidth = isSelectedNode ? 4 : isHovered ? 3.5 : 2.2;
          const nodeMainStroke = isSelectedNode ? 'transparent' : nodeStroke;
          const nodeMainStrokeWidth = isSelectedNode ? 0 : nodeStrokeWidth;
          const labelParts = VALUE_LABELS[node.value].split(' ');
          const labelLineOne = labelParts[0] ?? '';
          const labelLineTwo = labelParts.slice(1).join(' ');

          const nodeDuration =
            NODE_ANIMATION_BASE_DURATION_MS +
            nodeIndex * NODE_ANIMATION_PER_NODE_SLOWDOWN_MS;
          let nodeTranslate = 'translate(0, 0)';
          let nodeTransition = 'transform 280ms ease';
          if (animationPhase === 'collapse') {
            const tx = CHART_CENTER_X - node.x;
            const ty = CHART_CENTER_Y - node.y;
            nodeTranslate = `translate(${tx}px, ${ty}px)`;
            nodeTransition = `transform ${nodeDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
          } else if (animationPhase === 'expand') {
            nodeTransition = `transform ${nodeDuration}ms cubic-bezier(0.0, 0, 0.2, 1)`;
          }

          let circleAnimation: string | undefined;
          let circleFilter: string | undefined;
          if (isSelectedNode && !prefersReducedMotion) {
            circleAnimation = 'neonPulseCircle 1.8s ease-in-out infinite';
          } else if (isHovered && !isSelectedNode) {
            circleFilter =
              'drop-shadow(0 0 6px rgba(59,130,246,0.5)) drop-shadow(0 0 12px rgba(59,130,246,0.3))';
          }

          return (
            <g
              key={node.value}
              onClick={() => onFocusToggle(node.value)}
              onMouseEnter={() => onHoverChange(node.value)}
              onMouseLeave={() => onHoverChange(null)}
              style={{
                cursor: 'pointer',
                transform: nodeTranslate,
                transition: nodeTransition,
                willChange: animationPhase === 'idle' ? undefined : 'transform',
              }}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r={NODE_RADIUS}
                fill={getPriorityColor(
                  selectedModel?.values[node.value] ?? 0,
                  priorityValueRange.min,
                  priorityValueRange.max,
                )}
                stroke={nodeMainStroke}
                strokeWidth={nodeMainStrokeWidth}
                style={{
                  opacity: nodeOpacity,
                  filter: circleFilter,
                  animation: circleAnimation,
                  transition:
                    'opacity 280ms ease, stroke 280ms ease, stroke-width 280ms ease, filter 280ms ease',
                }}
              />
              {isHedonismNode && (
                <>
                  <path
                    d={describeNodeHalfArc(node.x, node.y, 75, false)}
                    fill="none"
                    stroke="#f97316"
                    strokeWidth={isSelectedNode ? 5.5 : 3.2}
                    style={{
                      opacity: nodeOpacity * 0.9,
                      transition: 'opacity 280ms ease, stroke-width 280ms ease',
                    }}
                  />
                  <path
                    d={describeNodeHalfArc(node.x, node.y, 75, true)}
                    fill="none"
                    stroke="#f472b6"
                    strokeWidth={isSelectedNode ? 5.5 : 3.2}
                    style={{
                      opacity: nodeOpacity * 0.9,
                      transition: 'opacity 280ms ease, stroke-width 280ms ease',
                    }}
                  />
                </>
              )}
              <circle
                cx={node.x}
                cy={node.y}
                r={isSelectedNode ? 69 : 74}
                fill="none"
                stroke={isSelectedNode ? themeColors.selectedRingColor : themeColors.idleRingColor}
                strokeWidth={isSelectedNode ? 7 : 1.4}
                style={{
                  opacity: nodeOpacity * (isSelectedNode ? 0.98 : 0.46),
                  filter: isSelectedNode ? 'drop-shadow(0 0 8px rgba(34,211,238,0.7))' : undefined,
                  transition:
                    'opacity 280ms ease, stroke 280ms ease, stroke-width 280ms ease, filter 280ms ease',
                }}
              />
              <text
                x={node.x}
                y={node.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="font-medium select-none"
                fill={themeColors.nodeLabelColor}
                style={{ fontSize: '16px', opacity: nodeOpacity, transition: 'opacity 280ms ease' }}
              >
                <tspan x={node.x} dy={labelLineTwo.length > 0 ? '-0.35em' : '0'}>
                  {labelLineOne}
                </tspan>
                {labelLineTwo.length > 0 && (
                  <tspan
                    x={node.x}
                    dy="1.2em"
                    fill={themeColors.nodeSubLabelColor}
                    style={{ fontSize: '14px' }}
                  >
                    {labelLineTwo}
                  </tspan>
                )}
              </text>
            </g>
          );
        })}
      </svg>
    </>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  VALUE_LABELS,
  type DomainAnalysisModelAvailability,
  type ModelEntry,
  type ValueKey,
} from '../../data/domainAnalysisData';
import { getPriorityColor } from './domainAnalysisColors';
import { CopyVisualButton } from '../ui/CopyVisualButton';

const CLOSE_WINRATE_DELTA = 0.08;
const CLOSE_EDGE_MEDIUM_WIDTH = 3.2;
const DISPLAY_VALUES: ValueKey[] = [
  'Universalism_Nature',
  'Benevolence_Dependability',
  'Conformity_Interpersonal',
  'Tradition',
  'Security_Personal',
  'Power_Dominance',
  'Achievement',
  'Hedonism',
  'Stimulation',
  'Self_Direction_Action',
];

const QUADRANT_ARCS = [
  { label: 'Self-Transcendence', startAngle: -Math.PI / 2, endAngle: 0, fill: 'rgba(245, 158, 11, 0.15)', ring: '#f59e0b' },
  { label: 'Conservation', startAngle: 0, endAngle: Math.PI / 2, fill: 'rgba(132, 204, 22, 0.16)', ring: '#84cc16' },
  { label: 'Self-Enhancement', startAngle: Math.PI / 2, endAngle: Math.PI, fill: 'rgba(249, 115, 22, 0.15)', ring: '#f97316' },
  { label: 'Openness to Change', startAngle: Math.PI, endAngle: Math.PI * 1.5, fill: 'rgba(244, 114, 182, 0.15)', ring: '#f472b6' },
] as const;

const SELF_ENHANCEMENT_VALUES: ReadonlyArray<ValueKey> = ['Power_Dominance', 'Achievement'];
const OPENNESS_NON_STRADDLE_VALUES: ReadonlyArray<ValueKey> = ['Stimulation', 'Self_Direction_Action'];

function polarToCartesian(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

function describeSectorPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArcFlag = endAngle - startAngle <= Math.PI ? 0 : 1;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
}

function describeArcPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
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

type DominanceSectionProps = {
  models: ModelEntry[];
  unavailableModels: DomainAnalysisModelAvailability[];
};

export function DominanceSection({ models, unavailableModels }: DominanceSectionProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const contestableRef = useRef<HTMLDivElement>(null);
  const [selectedModelId, setSelectedModelId] = useState(models[0]?.model ?? '');
  const [focusedValue, setFocusedValue] = useState<ValueKey | null>(null);
  const [hoveredValue, setHoveredValue] = useState<ValueKey | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<'idle' | 'collapse' | 'expand'>('idle');
  const prevModelId = useRef(selectedModelId);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  // Staggered speeds: all start together, top circle fastest, each subsequent one noticeably slower
  const baseDurationMs = 360; // fastest node (top)
  const perNodeSlowdown = 120; // each clockwise node takes this much longer
  const slowestDuration = baseDurationMs + (DISPLAY_VALUES.length - 1) * perNodeSlowdown;

  // Model-switch collapse/expand animation
  useEffect(() => {
    if (selectedModelId === prevModelId.current) return;
    prevModelId.current = selectedModelId;
    if (prefersReducedMotion) return;

    setAnimationPhase('collapse');
    // Wait for the slowest node to finish collapsing, then expand
    const expandTimer = setTimeout(() => setAnimationPhase('expand'), slowestDuration);
    // Wait for the slowest node to finish expanding, then go idle
    const idleTimer = setTimeout(() => setAnimationPhase('idle'), 2 * slowestDuration);
    return () => {
      clearTimeout(expandTimer);
      clearTimeout(idleTimer);
    };
  }, [selectedModelId, prefersReducedMotion, slowestDuration]);

  // Guard against selecting an unavailable model
  useEffect(() => {
    if (!models.some((model) => model.model === selectedModelId)) {
      setSelectedModelId(models[0]?.model ?? '');
    }
  }, [models, selectedModelId]);

  const modelById = useMemo(
    () => new Map(models.map((model) => [model.model, model])),
    [models],
  );
  const selectedModel = modelById.get(selectedModelId);
  const themeColors = {
    arrowColor: '#0f766e',
    outgoingFocusedColor: '#16a34a',
    incomingFocusedColor: '#dc2626',
    neutralColor: '#94a3b8',
    closeWinColor: '#eab308',
    nodeLabelColor: '#111827',
    nodeSubLabelColor: '#6b7280',
    panelText: 'text-gray-900',
    panelMutedText: 'text-gray-600',
    panelBorder: 'border-gray-200',
    panelBg: 'bg-white',
    cardBg: 'bg-gray-50',
    cardBorder: 'border-gray-200',
    selectedRingColor: '#22d3ee',
    idleRingColor: '#38bdf8',
  };

  const edges = useMemo(() => {
    if (!selectedModel) return [];
    const allEdges: Array<{ from: ValueKey; to: ValueKey; gap: number }> = [];
    for (let i = 0; i < DISPLAY_VALUES.length; i += 1) {
      for (let j = i + 1; j < DISPLAY_VALUES.length; j += 1) {
        const a = DISPLAY_VALUES[i];
        const b = DISPLAY_VALUES[j];
        if (!a || !b) continue;
        const av = selectedModel.values[a];
        const bv = selectedModel.values[b];
        if (av === bv) continue;
        if (av > bv) allEdges.push({ from: a, to: b, gap: av - bv });
        if (bv > av) allEdges.push({ from: b, to: a, gap: bv - av });
      }
    }
    return allEdges.sort((left, right) => right.gap - left.gap);
  }, [selectedModel]);

  const contestedPairs = useMemo(() => {
    if (!selectedModel) return [];
    const pairs: Array<{ a: ValueKey; b: ValueKey; gap: number; winner: ValueKey }> = [];
    for (let i = 0; i < DISPLAY_VALUES.length; i += 1) {
      for (let j = i + 1; j < DISPLAY_VALUES.length; j += 1) {
        const a = DISPLAY_VALUES[i];
        const b = DISPLAY_VALUES[j];
        if (!a || !b) continue;
        const aScore = selectedModel.values[a];
        const bScore = selectedModel.values[b];
        if (aScore === bScore) continue;
        if (aScore > bScore) {
          pairs.push({ a, b, gap: aScore - bScore, winner: a });
        } else {
          pairs.push({ a, b, gap: bScore - aScore, winner: b });
        }
      }
    }
    return pairs.sort((left, right) => left.gap - right.gap).slice(0, 6);
  }, [selectedModel]);

  const priorityValueRange = useMemo(() => {
    const all = models.flatMap((model) => DISPLAY_VALUES.map((value) => model.values[value]));
    if (all.length === 0) return { min: -1, max: 1 };
    return { min: Math.min(...all), max: Math.max(...all) };
  }, [models]);

  const valueAngleById = useMemo(() => {
    const result = new Map<ValueKey, number>();
    const selfTranscendence = QUADRANT_ARCS[0];
    ['Universalism_Nature', 'Benevolence_Dependability'].forEach((value, index) => {
      const t = (index + 0.5) / 2;
      result.set(value as ValueKey, selfTranscendence.startAngle + t * (selfTranscendence.endAngle - selfTranscendence.startAngle));
    });

    const conservation = QUADRANT_ARCS[1];
    ['Conformity_Interpersonal', 'Tradition', 'Security_Personal'].forEach((value, index) => {
      const t = (index + 0.5) / 3;
      result.set(value as ValueKey, conservation.startAngle + t * (conservation.endAngle - conservation.startAngle));
    });

    const selfEnhancement = QUADRANT_ARCS[2];
    SELF_ENHANCEMENT_VALUES.forEach((value, index) => {
      const t = (index + 1) / (SELF_ENHANCEMENT_VALUES.length + 1);
      result.set(value, selfEnhancement.startAngle + t * (selfEnhancement.endAngle - selfEnhancement.startAngle));
    });

    // Hedonism straddles Self-Enhancement and Openness to Change exactly at the shared boundary.
    result.set('Hedonism', Math.PI);

    const openness = QUADRANT_ARCS[3];
    OPENNESS_NON_STRADDLE_VALUES.forEach((value, index) => {
      const t = (index + 1) / (OPENNESS_NON_STRADDLE_VALUES.length + 1);
      result.set(value, openness.startAngle + t * (openness.endAngle - openness.startAngle));
    });
    return result;
  }, []);

  const nodePositions = useMemo(() => {
    const width = 1280;
    const height = 1120;
    const cx = width / 2;
    const cy = height / 2;
    const radius = 450;
    return DISPLAY_VALUES.map((value) => {
      const theta = valueAngleById.get(value) ?? -Math.PI / 2;
      return {
        value,
        x: cx + radius * Math.cos(theta),
        y: cy + radius * Math.sin(theta),
      };
    });
  }, [valueAngleById]);

  const positionByValue = useMemo(
    () => new Map(nodePositions.map((node) => [node.value, node])),
    [nodePositions],
  );

  // Map each value to its clockwise index (0 = top)
  const valueIndexMap = useMemo(() => new Map(DISPLAY_VALUES.map((v, i) => [v, i])), []);

  // Compute clockwise appearance order for edges, relative to focused circle
  const edgeClockwiseOrder = useMemo(() => {
    const focusedIdx = focusedValue != null ? (valueIndexMap.get(focusedValue) ?? 0) : 0;
    const n = DISPLAY_VALUES.length;
    const indexed = edges.map((edge, i) => {
      const fromIdx = valueIndexMap.get(edge.from) ?? 0;
      const toIdx = valueIndexMap.get(edge.to) ?? 0;
      // For focused edges, order by how far the OTHER node is clockwise from the focused one
      const otherIdx = fromIdx === focusedIdx ? toIdx : toIdx === focusedIdx ? fromIdx : Math.min(fromIdx, toIdx);
      const clockwiseDist = (otherIdx - focusedIdx + n) % n;
      return { originalIndex: i, sortKey: clockwiseDist };
    });
    indexed.sort((a, b) => a.sortKey - b.sortKey);
    const orderMap = new Map<number, number>();
    indexed.forEach((item, rank) => orderMap.set(item.originalIndex, rank));
    return orderMap;
  }, [edges, valueIndexMap, focusedValue]);

  // Shared transition strings
  const edgeTransition = 'stroke-opacity 280ms ease, stroke 280ms ease, stroke-width 280ms ease, filter 280ms ease';
  const fillTransition = 'fill-opacity 280ms ease, fill 280ms ease, filter 280ms ease';

  // Center of viewBox (where nodes converge during animation)
  const viewCenterX = 640;
  const viewCenterY = 560;

  // Edges fade out during animation phases
  const edgesVisible = animationPhase === 'idle';
  const svgStyle = { height: 'calc(100vh - 140px)', minHeight: '900px' };

  return (
    <section className={`rounded-lg border p-4 ${themeColors.panelBorder} ${themeColors.panelBg}`}>
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
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className={`text-base font-medium ${themeColors.panelText}`}>2. Ranking and Cycles</h2>
          <p className={`text-sm ${themeColors.panelMutedText}`}>
            Directed value graph for one selected AI: arrows point from stronger value to weaker value.
          </p>
        </div>
        <CopyVisualButton targetRef={chartRef} label="ranking and cycles chart" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`text-xs font-medium ${themeColors.panelMutedText}`}>Select AI:</span>
        <select
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800"
          value={selectedModelId}
          onChange={(event) => setSelectedModelId(event.target.value)}
        >
          {models.map((model) => (
            <option key={model.model} value={model.model}>
              {model.label}
            </option>
          ))}
          {unavailableModels.length > 0 && (
            <option disabled value="">
              ----------
            </option>
          )}
          {unavailableModels.map((model) => (
            <option key={model.model} value={model.model} disabled>
              {model.label} (Unavailable)
            </option>
          ))}
        </select>
      </div>

      {models.length === 0 && (
        <p className={`mb-3 text-xs ${themeColors.panelMutedText}`}>
          No analyzed model data is available for this domain yet.
        </p>
      )}

      <p className={`mb-3 text-xs ${themeColors.panelMutedText}`}>
        Click a value circle to focus it and fade unrelated arrows. Click it again to clear focus.
      </p>

      <div
        ref={chartRef}
        className="mb-4 overflow-x-auto rounded border border-gray-100 bg-gray-50 p-2"
      >
        <svg
          viewBox="0 0 1280 1120"
          className="w-full min-w-[1120px]"
          style={svgStyle}
          role="img"
          aria-label="Value dominance graph"
        >
          {QUADRANT_ARCS.map((quadrant) => (
            <g key={quadrant.label}>
              <path
                d={describeSectorPath(640, 560, 520, quadrant.startAngle, quadrant.endAngle)}
                fill={quadrant.fill}
              />
              <path
                d={describeArcPath(640, 560, 536, quadrant.startAngle, quadrant.endAngle)}
                fill="none"
                stroke={quadrant.ring}
                strokeWidth={18}
                opacity={0.75}
              />
              {(() => {
                const mid = (quadrant.startAngle + quadrant.endAngle) / 2;
                const labelPoint = polarToCartesian(640, 560, 640, mid);
                return (
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
                );
              })()}
            </g>
          ))}
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
            const nodeRadius = 68;
            const winRate = 1 / (1 + Math.exp(-edge.gap));
            const normalized = Math.max(0, Math.min(1, (winRate - 0.5) / 0.5));
            const widthFactor = normalized ** 1.6;
            const isCloseWinRate = Math.abs(winRate - 0.5) <= CLOSE_WINRATE_DELTA;
            const regularStrokeWidth = 0.3 + widthFactor * 7.2;
            const emphasizedStrokeWidth = 0.3 + widthFactor * 14.4;
            // Keep brightness independent of win rate; width alone encodes win-rate strength.
            const rawStrokeOpacity = (isOutgoingFromFocused || isIncomingToFocused)
              ? 0.9
              : isFocusedEdge
                ? 0.78
                : 0.72;
            const rawStrokeWidth = isCloseWinRate
              ? CLOSE_EDGE_MEDIUM_WIDTH
              : focusedValue != null && isOutgoingFromFocused
                ? emphasizedStrokeWidth
                : regularStrokeWidth;
            const losingAdjustedWidth = isIncomingToFocused ? rawStrokeWidth * 2.25 : rawStrokeWidth;
            const sourceIsSelected = focusedValue != null && edge.from === focusedValue;
            const isFromUnselectedCircle = focusedValue == null || !sourceIsSelected;
            const strokeWidth = isFromUnselectedCircle ? losingAdjustedWidth * 0.64 : losingAdjustedWidth;
            const strokeOpacity = isFromUnselectedCircle ? rawStrokeOpacity * 0.42 : rawStrokeOpacity;
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
            // Extra source-side gap for thicker strokes so they don't intrude into the origin circle.
            const sourceGap = nodeRadius + Math.min(8, strokeWidth * 0.6 + 2);
            const startX = source.x + ux * sourceGap;
            const startY = source.y + uy * sourceGap;
            const endX = target.x - ux * nodeRadius;
            const endY = target.y - uy * nodeRadius;
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
            // Stagger edge appearance clockwise for a visible "light-up" wave.
            const clockwiseRank = edgeClockwiseOrder.get(edgeIndex) ?? edgeIndex;
            const edgeDelay = (!prefersReducedMotion && edgesVisible) ? `${clockwiseRank * 12}ms` : '0ms';
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
                        animation: prefersReducedMotion ? undefined : 'neonPulseStroke 1.7s ease-in-out infinite',
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
                        animation: prefersReducedMotion ? undefined : 'neonPulseStroke 1.9s ease-in-out infinite',
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

            // All nodes start at the same time; top is fastest, each clockwise node is slower
            const nodeDuration = baseDurationMs + nodeIndex * perNodeSlowdown;
            let nodeTranslate = 'translate(0, 0)';
            let nodeTransition = 'transform 280ms ease';
            if (animationPhase === 'collapse') {
              const tx = viewCenterX - node.x;
              const ty = viewCenterY - node.y;
              nodeTranslate = `translate(${tx}px, ${ty}px)`;
              nodeTransition = `transform ${nodeDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
            } else if (animationPhase === 'expand') {
              nodeTranslate = 'translate(0, 0)';
              nodeTransition = `transform ${nodeDuration}ms cubic-bezier(0.0, 0, 0.2, 1)`;
            }

            // Hover glow + selected glow
            let circleAnimation: string | undefined;
            let circleFilter: string | undefined;
            if (isSelectedNode && !prefersReducedMotion) {
              circleAnimation = 'neonPulseCircle 1.8s ease-in-out infinite';
            } else if (isHovered && !isSelectedNode) {
              circleFilter = 'drop-shadow(0 0 6px rgba(59,130,246,0.5)) drop-shadow(0 0 12px rgba(59,130,246,0.3))';
            }

            return (
              <g
                key={node.value}
                onClick={() => setFocusedValue((current) => (current === node.value ? null : node.value))}
                onMouseEnter={() => setHoveredValue(node.value)}
                onMouseLeave={() => setHoveredValue(null)}
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
                  r={68}
                  fill={
                    getPriorityColor(selectedModel?.values[node.value] ?? 0, priorityValueRange.min, priorityValueRange.max)
                  }
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
                    <tspan x={node.x} dy="1.2em" fill={themeColors.nodeSubLabelColor} style={{ fontSize: '14px' }}>
                      {labelLineTwo}
                    </tspan>
                  )}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div ref={contestableRef} className={`rounded border p-3 ${themeColors.cardBorder} ${themeColors.cardBg}`}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className={`text-sm font-medium ${themeColors.panelText}`}>Arrow Meaning</h3>
          <CopyVisualButton targetRef={contestableRef} label="ranking and cycles notes" />
        </div>
        <ul className={`mt-2 list-disc space-y-1 pl-5 text-sm ${themeColors.panelMutedText}`}>
          <li>Arrow direction: winner value points to loser value.</li>
          <li>Focused view: green arrows go out from the clicked value, red arrows come in.</li>
          <li>Arrow thickness: higher pairwise win rate for that value over the other in this AI.</li>
          <li>Yellow double-headed arrows: near-even win rates (values are highly contestable).</li>
        </ul>
        <h4 className={`mt-3 text-sm font-medium ${themeColors.panelText}`}>Most Contestable Value Pairs</h4>
        <p className={`mt-2 text-xs ${themeColors.panelMutedText}`}>
          For this selected AI. Smaller BT score gap means two values are more closely matched.
        </p>
        <ol className={`mt-2 space-y-1 text-sm ${themeColors.panelMutedText}`}>
          {contestedPairs.map((item, index) => (
            <li key={`${item.a}-${item.b}`}>
              {index + 1}. {VALUE_LABELS[item.a]} vs {VALUE_LABELS[item.b]} ({item.gap.toFixed(3)} gap,{' '}
              {VALUE_LABELS[item.winner]} wins)
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

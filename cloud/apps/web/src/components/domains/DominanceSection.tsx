import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DOMAIN_ANALYSIS_AVAILABLE_MODELS,
  DOMAIN_ANALYSIS_UNAVAILABLE_MODELS,
  VALUES,
  VALUE_LABELS,
  type ValueKey,
} from '../../data/domainAnalysisData';
import { getPriorityColor } from './domainAnalysisColors';

export function DominanceSection() {
  const CLOSE_WINRATE_DELTA = 0.08;
  const CLOSE_EDGE_MEDIUM_WIDTH = 3.2;
  const [selectedModelId, setSelectedModelId] = useState(DOMAIN_ANALYSIS_AVAILABLE_MODELS[0]?.model ?? '');
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
  const slowestDuration = baseDurationMs + (VALUES.length - 1) * perNodeSlowdown;

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
    if (!DOMAIN_ANALYSIS_AVAILABLE_MODELS.some((model) => model.model === selectedModelId)) {
      setSelectedModelId(DOMAIN_ANALYSIS_AVAILABLE_MODELS[0]?.model ?? '');
    }
  }, [selectedModelId]);

  const modelById = useMemo(
    () => new Map(DOMAIN_ANALYSIS_AVAILABLE_MODELS.map((model) => [model.model, model])),
    [],
  );
  const selectedModel = modelById.get(selectedModelId);
  const arrowColor = '#0f766e';
  const outgoingFocusedColor = '#16a34a';
  const incomingFocusedColor = '#dc2626';

  const edges = useMemo(() => {
    if (!selectedModel) return [];
    const allEdges: Array<{ from: ValueKey; to: ValueKey; gap: number }> = [];
    for (let i = 0; i < VALUES.length; i += 1) {
      for (let j = i + 1; j < VALUES.length; j += 1) {
        const a = VALUES[i];
        const b = VALUES[j];
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
    for (let i = 0; i < VALUES.length; i += 1) {
      for (let j = i + 1; j < VALUES.length; j += 1) {
        const a = VALUES[i];
        const b = VALUES[j];
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
    const all = DOMAIN_ANALYSIS_AVAILABLE_MODELS.flatMap((model) => VALUES.map((value) => model.values[value]));
    return { min: Math.min(...all), max: Math.max(...all) };
  }, []);

  const nodePositions = useMemo(() => {
    const width = 1280;
    const height = 1120;
    const cx = width / 2;
    const cy = height / 2;
    const radius = 450;
    return VALUES.map((value, index) => {
      const theta = (Math.PI * 2 * index) / VALUES.length - Math.PI / 2;
      return {
        value,
        x: cx + radius * Math.cos(theta),
        y: cy + radius * Math.sin(theta),
      };
    });
  }, []);

  const positionByValue = useMemo(
    () => new Map(nodePositions.map((node) => [node.value, node])),
    [nodePositions],
  );

  // Map each value to its clockwise index (0 = top)
  const valueIndexMap = useMemo(
    () => new Map(VALUES.map((v, i) => [v, i])),
    [],
  );

  // Compute clockwise appearance order for edges, relative to focused circle
  const edgeClockwiseOrder = useMemo(() => {
    const focusedIdx = focusedValue != null ? (valueIndexMap.get(focusedValue) ?? 0) : 0;
    const n = VALUES.length;
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

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
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
      <div className="mb-3">
        <h2 className="text-base font-medium text-gray-900">2. Ranking and Cycles</h2>
        <p className="text-sm text-gray-600">
          Directed value graph for one selected AI: arrows point from stronger value to weaker value.
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-600">Select AI:</span>
        <select
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800"
          value={selectedModelId}
          onChange={(event) => setSelectedModelId(event.target.value)}
        >
          {DOMAIN_ANALYSIS_AVAILABLE_MODELS.map((model) => (
            <option key={model.model} value={model.model}>
              {model.label}
            </option>
          ))}
          {DOMAIN_ANALYSIS_UNAVAILABLE_MODELS.length > 0 && (
            <option disabled value="">
              ----------
            </option>
          )}
          {DOMAIN_ANALYSIS_UNAVAILABLE_MODELS.map((model) => (
            <option key={model.model} value={model.model} disabled>
              {model.label} (Unavailable)
            </option>
          ))}
        </select>
      </div>

      <p className="mb-3 text-xs text-gray-600">
        Click a value circle to focus it and fade unrelated arrows. Click it again to clear focus.
      </p>

      <div className="mb-4 overflow-x-auto rounded border border-gray-100 bg-gray-50 p-2">
        <svg
          viewBox="0 0 1280 1120"
          className="w-full min-w-[1120px]"
          style={{ height: 'calc(100vh - 140px)', minHeight: '900px' }}
          role="img"
          aria-label="Value dominance graph"
        >
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
            const edgeColor = focusedValue == null
              ? '#94a3b8'
              : isCloseWinRate
                ? '#eab308'
                : isOutgoingFromFocused
                  ? outgoingFocusedColor
                  : isIncomingToFocused
                    ? incomingFocusedColor
                    : arrowColor;
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
                )}
              </g>
            );
          })}

          {nodePositions.map((node, nodeIndex) => {
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
                  fill={getPriorityColor(selectedModel?.values[node.value] ?? 0, priorityValueRange.min, priorityValueRange.max)}
                  stroke={nodeStroke}
                  strokeWidth={nodeStrokeWidth}
                  style={{
                    opacity: nodeOpacity,
                    filter: circleFilter,
                    animation: circleAnimation,
                    transition:
                      'opacity 280ms ease, stroke 280ms ease, stroke-width 280ms ease, filter 280ms ease',
                  }}
                />
                <text
                  x={node.x}
                  y={node.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-gray-900 font-medium select-none"
                  style={{ fontSize: '16px', opacity: nodeOpacity, transition: 'opacity 280ms ease' }}
                >
                  <tspan x={node.x} dy={labelLineTwo.length > 0 ? '-0.35em' : '0'}>
                    {labelLineOne}
                  </tspan>
                  {labelLineTwo.length > 0 && (
                    <tspan x={node.x} dy="1.2em" className="fill-gray-500" style={{ fontSize: '14px' }}>
                      {labelLineTwo}
                    </tspan>
                  )}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <h3 className="text-sm font-medium text-gray-900">Arrow Meaning</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
            <li>Arrow direction: winner value points to loser value.</li>
            <li>Focused view: green arrows go out from the clicked value, red arrows come in.</li>
            <li>Arrow thickness: higher pairwise win rate for that value over the other in this AI.</li>
            <li>Yellow double-headed arrows: near-even win rates (values are highly contestable).</li>
          </ul>
          <h4 className="mt-3 text-sm font-medium text-gray-900">Most Contestable Value Pairs</h4>
          <p className="mt-2 text-xs text-gray-600">
            For this selected AI. Smaller BT score gap means two values are more closely matched.
          </p>
          <ol className="mt-2 space-y-1 text-sm text-gray-700">
            {contestedPairs.map((item, index) => (
              <li key={`${item.a}-${item.b}`}>
                {index + 1}. {VALUE_LABELS[item.a]} vs {VALUE_LABELS[item.b]} ({item.gap.toFixed(3)} gap,{' '}
                {VALUE_LABELS[item.winner]} wins)
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <h3 className="text-sm font-medium text-gray-900">Value Cycle Check</h3>
          <p className="mt-2 text-sm text-gray-700">
            Majority-cycle detection is disabled in single-AI mode. Cycles require multi-model comparisons where
            value orderings can conflict across models.
          </p>
        </div>
      </div>
    </section>
  );
}

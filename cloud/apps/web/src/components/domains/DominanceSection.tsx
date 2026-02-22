import { useMemo, useState } from 'react';
import { DOMAIN_ANALYSIS_MODELS, VALUES, VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';
import { getPriorityColor } from './domainAnalysisColors';

export function DominanceSection() {
  const [selectedModelId, setSelectedModelId] = useState(DOMAIN_ANALYSIS_MODELS[0]?.model ?? '');
  const [focusedValue, setFocusedValue] = useState<ValueKey | null>(null);

  const modelById = useMemo(
    () => new Map(DOMAIN_ANALYSIS_MODELS.map((model) => [model.model, model])),
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
    const all = DOMAIN_ANALYSIS_MODELS.flatMap((model) => VALUES.map((value) => model.values[value]));
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
          {DOMAIN_ANALYSIS_MODELS.map((model) => (
            <option key={model.model} value={model.model}>
              {model.label}
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
          {edges.map((edge) => {
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
            const strokeWidth = 0.1 + widthFactor * 5.4;
            const baseOpacity = 0.15 + widthFactor * 0.75;
            const strokeOpacity = isOutgoingFromFocused
              ? Math.max(0.9, baseOpacity)
              : isIncomingToFocused
                ? Math.max(0.9, baseOpacity)
                : isFocusedEdge
                  ? Math.max(0.48, baseOpacity * 0.72)
                  : Math.max(0.18, baseOpacity * 0.32);
            const edgeColor = isOutgoingFromFocused
              ? outgoingFocusedColor
              : isIncomingToFocused
                ? incomingFocusedColor
                : arrowColor;
            const startX = source.x + ux * nodeRadius;
            const startY = source.y + uy * nodeRadius;
            const endX = target.x - ux * nodeRadius;
            const endY = target.y - uy * nodeRadius;
            const headLength = 1.8 + strokeWidth * 1.9;
            const headHalfWidth = 0.8 + strokeWidth * 0.95;
            const baseX = endX - ux * headLength;
            const baseY = endY - uy * headLength;
            const px = -uy;
            const py = ux;
            const leftX = baseX + px * headHalfWidth;
            const leftY = baseY + py * headHalfWidth;
            const rightX = baseX - px * headHalfWidth;
            const rightY = baseY - py * headHalfWidth;
            return (
              <g key={`${edge.from}-${edge.to}`}>
                <line
                  x1={startX}
                  y1={startY}
                  x2={baseX}
                  y2={baseY}
                  stroke={edgeColor}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  style={
                    focusedValue != null && isFocusedEdge
                      ? {
                          color: edgeColor,
                          strokeOpacity,
                          animation: 'neonPulseStroke 1.7s ease-in-out infinite',
                          transition:
                            'stroke-opacity 280ms ease, stroke 280ms ease, stroke-width 280ms ease, filter 280ms ease',
                        }
                      : {
                          strokeOpacity,
                          animation: 'neonPulseStroke 2.6s ease-in-out infinite',
                          transition:
                            'stroke-opacity 280ms ease, stroke 280ms ease, stroke-width 280ms ease, filter 280ms ease',
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
                          fillOpacity: strokeOpacity,
                          animation: 'neonPulseStroke 1.9s ease-in-out infinite',
                          transition: 'fill-opacity 280ms ease, fill 280ms ease, filter 280ms ease',
                        }
                      : {
                          fillOpacity: strokeOpacity,
                          transition: 'fill-opacity 280ms ease, fill 280ms ease, filter 280ms ease',
                        }
                  }
                />
              </g>
            );
          })}

          {nodePositions.map((node) => {
            const isSelectedNode = focusedValue != null && node.value === focusedValue;
            const isConnectedToFocused =
              focusedValue != null &&
              edges.some(
                (edge) =>
                  (edge.from === focusedValue && edge.to === node.value) ||
                  (edge.to === focusedValue && edge.from === node.value),
              );
            const nodeOpacity =
              focusedValue == null ? 1 : isSelectedNode ? 1 : isConnectedToFocused ? 0.72 : 0.35;
            const nodeStroke = isSelectedNode ? '#111827' : '#94a3b8';
            const nodeStrokeWidth = isSelectedNode ? 4 : 2.2;
            const labelParts = VALUE_LABELS[node.value].split(' ');
            const labelLineOne = labelParts[0] ?? '';
            const labelLineTwo = labelParts.slice(1).join(' ');

            return (
            <g
              key={node.value}
              onClick={() => setFocusedValue((current) => (current === node.value ? null : node.value))}
              style={{ cursor: 'pointer' }}
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
                  animation: isSelectedNode ? 'neonPulseCircle 1.8s ease-in-out infinite' : undefined,
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

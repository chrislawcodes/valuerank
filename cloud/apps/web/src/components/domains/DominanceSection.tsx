import { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { DOMAIN_ANALYSIS_MODELS, VALUES, VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';
import { getPriorityColor } from './domainAnalysisColors';

export function DominanceSection() {
  const [edgeLimit, setEdgeLimit] = useState(10);
  const [showAllArrows, setShowAllArrows] = useState(true);
  const [selectedModelId, setSelectedModelId] = useState(DOMAIN_ANALYSIS_MODELS[0]?.model ?? '');

  const modelById = useMemo(
    () => new Map(DOMAIN_ANALYSIS_MODELS.map((model) => [model.model, model])),
    [],
  );
  const selectedModel = modelById.get(selectedModelId);
  const arrowColor = '#0f766e';

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
    const sorted = allEdges.sort((left, right) => right.gap - left.gap);
    return showAllArrows ? sorted : sorted.slice(0, edgeLimit);
  }, [selectedModel, edgeLimit, showAllArrows]);

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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-600">Arrows shown:</span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-auto min-h-0 px-2 py-1 text-xs"
          onClick={() => setShowAllArrows((current) => !current)}
        >
          {showAllArrows ? 'Showing all arrows' : 'Show all arrows'}
        </Button>
        {!showAllArrows && (
          <>
            <input
              type="range"
              min={4}
              max={20}
              value={edgeLimit}
              onChange={(event) => setEdgeLimit(Number(event.target.value))}
              className="w-44"
              aria-label="Number of value dominance arrows"
            />
            <span className="text-xs text-gray-700">{edgeLimit}</span>
          </>
        )}
      </div>

      {selectedModel && (
        <div className="mb-3 flex items-center gap-1.5 text-xs text-gray-700">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: arrowColor }} />
          <span>{selectedModel.label}</span>
        </div>
      )}

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
            const strokeOpacity = 0.15 + widthFactor * 0.75;
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
                  stroke={arrowColor}
                  strokeOpacity={strokeOpacity}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                />
                <polygon
                  points={`${endX},${endY} ${leftX},${leftY} ${rightX},${rightY}`}
                  fill={arrowColor}
                  fillOpacity={strokeOpacity}
                />
              </g>
            );
          })}

          {nodePositions.map((node) => (
            <g key={node.value}>
              <circle
                cx={node.x}
                cy={node.y}
                r={68}
                fill={getPriorityColor(selectedModel?.values[node.value] ?? 0, priorityValueRange.min, priorityValueRange.max)}
                stroke="#94a3b8"
                strokeWidth="2.2"
              />
              <text
                x={node.x}
                y={node.y - 10}
                textAnchor="middle"
                className="fill-gray-900 font-medium"
                style={{ fontSize: '16px' }}
              >
                {VALUE_LABELS[node.value].split(' ')[0]}
              </text>
              <text
                x={node.x}
                y={node.y + 18}
                textAnchor="middle"
                className="fill-gray-500"
                style={{ fontSize: '14px' }}
              >
                {VALUE_LABELS[node.value].split(' ').slice(1).join(' ')}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <h3 className="text-sm font-medium text-gray-900">Arrow Meaning</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
            <li>Arrow direction: winner value points to loser value.</li>
            <li>Arrow color: selected AI.</li>
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

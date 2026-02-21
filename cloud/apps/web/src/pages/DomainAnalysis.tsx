import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../components/ui/Button';
import {
  DOMAIN_ANALYSIS_MODELS,
  VALUES,
  VALUE_LABELS,
  type ModelEntry,
  type ValueKey,
} from '../components/domains/domainAnalysisData';

type SortState = {
  key: 'model' | ValueKey;
  direction: 'asc' | 'desc';
};

const MODEL_COLOR_PALETTE = ['#0f766e', '#2563eb', '#c2410c', '#7c3aed', '#be123c'] as const;

function getTopBottomValues(model: ModelEntry): { top: ValueKey[]; bottom: ValueKey[] } {
  const sorted = [...VALUES].sort((a, b) => model.values[b] - model.values[a]);
  return {
    top: sorted.slice(0, 3),
    bottom: sorted.slice(-3).reverse(),
  };
}

function getSimilarityColor(value: number): string {
  const clamped = Math.max(-1, Math.min(1, value));
  if (clamped === 1) return 'rgba(255, 255, 255, 0.35)';
  const stops = [
    { at: -1, rgb: [153, 27, 27] },
    { at: -0.6, rgb: [239, 68, 68] },
    { at: -0.2, rgb: [254, 202, 202] },
    { at: 0, rgb: [250, 204, 21] },
    { at: 0.44, rgb: [134, 239, 172] },
    { at: 0.76, rgb: [22, 163, 74] },
    { at: 1, rgb: [21, 128, 61] },
  ] as const;

  const rightIndex = stops.findIndex((stop) => clamped <= stop.at);
  if (rightIndex <= 0) {
    const [r, g, b] = stops[0].rgb;
    return `rgba(${r}, ${g}, ${b}, 0.35)`;
  }

  const left = stops[rightIndex - 1]!;
  const right = stops[rightIndex]!;
  const localT = (clamped - left.at) / (right.at - left.at);
  const r = Math.round(left.rgb[0] + (right.rgb[0] - left.rgb[0]) * localT);
  const g = Math.round(left.rgb[1] + (right.rgb[1] - left.rgb[1]) * localT);
  const b = Math.round(left.rgb[2] + (right.rgb[2] - left.rgb[2]) * localT);
  return `rgba(${r}, ${g}, ${b}, 0.35)`;
}

function getPriorityColor(value: number, min: number, max: number): string {
  if (max <= min) return getSimilarityColor(0);
  const normalized = (value - min) / (max - min);
  const similarityScale = Math.min(0.99, normalized * 2 - 1);
  return getSimilarityColor(similarityScale);
}

function ValuePrioritiesSection() {
  const [sortState, setSortState] = useState<SortState>({ key: 'model', direction: 'asc' });

  const updateSort = (key: 'model' | ValueKey) => {
    setSortState((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: key === 'model' ? 'asc' : 'desc' };
    });
  };

  const ordered = useMemo(() => {
    const models = [...DOMAIN_ANALYSIS_MODELS];
    const key = sortState.key;
    if (key === 'model') {
      models.sort((a, b) => a.label.localeCompare(b.label));
    } else {
      models.sort((a, b) => b.values[key] - a.values[key]);
    }
    if (sortState.direction === 'asc') {
      models.reverse();
    }
    return models;
  }, [sortState]);

  const valueRange = useMemo(() => {
    const all = DOMAIN_ANALYSIS_MODELS.flatMap((model) => VALUES.map((value) => model.values[value]));
    return { min: Math.min(...all), max: Math.max(...all) };
  }, []);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-medium text-gray-900">1. Value Priorities by AI</h2>
          <p className="text-sm text-gray-600">Which values each model favors most and least.</p>
        </div>
        <p className="text-xs text-gray-500">Click a column heading to sort.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-gray-600">
              <th className="px-2 py-2 text-left font-medium">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto min-h-0 !p-0 text-xs font-medium text-gray-600 hover:text-gray-900"
                  onClick={() => updateSort('model')}
                >
                  Model {sortState.key === 'model' ? (sortState.direction === 'asc' ? '↑' : '↓') : ''}
                </Button>
              </th>
              {VALUES.map((value) => (
                <th key={value} className="px-2 py-2 text-right font-medium">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto min-h-0 !p-0 text-xs font-medium text-gray-600 hover:text-gray-900"
                    onClick={() => updateSort(value)}
                  >
                    {VALUE_LABELS[value]} {sortState.key === value ? (sortState.direction === 'asc' ? '↑' : '↓') : ''}
                  </Button>
                </th>
              ))}
              <th className="px-2 py-2 text-left font-medium">Top 3</th>
              <th className="px-2 py-2 text-left font-medium">Bottom 3</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((model) => {
              const summary = getTopBottomValues(model);
              return (
                <tr key={model.model} className="border-b border-gray-100">
                  <td className="px-2 py-2 font-medium text-gray-900">{model.label}</td>
                  {VALUES.map((value) => (
                    <td
                      key={value}
                      className="px-2 py-2 text-right text-gray-800"
                      style={{ background: getPriorityColor(model.values[value], valueRange.min, valueRange.max) }}
                    >
                      {model.values[value] > 0 ? '+' : ''}
                      {model.values[value].toFixed(2)}
                    </td>
                  ))}
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      {summary.top.map((value) => (
                        <span key={value} className="rounded bg-teal-100 px-1.5 py-0.5 text-[11px] text-teal-800">
                          {VALUE_LABELS[value]}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      {summary.bottom.map((value) => (
                        <span key={value} className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] text-rose-800">
                          {VALUE_LABELS[value]}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DominanceSection() {
  const [edgeLimit, setEdgeLimit] = useState(10);
  const [showAllArrows, setShowAllArrows] = useState(true);
  const [selectedModelId, setSelectedModelId] = useState(DOMAIN_ANALYSIS_MODELS[0]?.model ?? '');

  const modelById = useMemo(
    () => new Map(DOMAIN_ANALYSIS_MODELS.map((model) => [model.model, model])),
    [],
  );

  const selectedModelEntries = useMemo(() => {
    const model = modelById.get(selectedModelId);
    return model ? [model] : [];
  }, [selectedModelId, modelById]);

  const modelColorById = useMemo(() => {
    const map = new Map<string, string>();
    selectedModelEntries.forEach((model, index) => {
      map.set(model.model, MODEL_COLOR_PALETTE[index % MODEL_COLOR_PALETTE.length] ?? '#334155');
    });
    return map;
  }, [selectedModelEntries]);

  const perModelEdges = useMemo(() => {
    return selectedModelEntries.map((model) => {
      const edges: Array<{ from: ValueKey; to: ValueKey; gap: number }> = [];
      for (let i = 0; i < VALUES.length; i += 1) {
        for (let j = i + 1; j < VALUES.length; j += 1) {
          const a = VALUES[i];
          const b = VALUES[j];
          if (!a || !b) continue;
          const av = model.values[a];
          const bv = model.values[b];
          if (av === bv) continue;
          if (av > bv) edges.push({ from: a, to: b, gap: av - bv });
          if (bv > av) edges.push({ from: b, to: a, gap: bv - av });
        }
      }
      const sorted = edges.sort((left, right) => right.gap - left.gap);
      const strongest = showAllArrows ? sorted : sorted.slice(0, edgeLimit);
      return { model, edges: strongest };
    });
  }, [selectedModelEntries, edgeLimit, showAllArrows]);

  const priorityValueRange = useMemo(() => {
    const all = DOMAIN_ANALYSIS_MODELS.flatMap((model) => VALUES.map((value) => model.values[value]));
    return { min: Math.min(...all), max: Math.max(...all) };
  }, []);

  const valueTournament = useMemo(() => {
    const winsByValue = new Map<ValueKey, Map<ValueKey, number>>();
    for (const left of VALUES) {
      const row = new Map<ValueKey, number>();
      for (const right of VALUES) {
        if (left === right) {
          row.set(right, 0);
          continue;
        }
        let wins = 0;
        for (const currentModel of selectedModelEntries) {
          if (currentModel.values[left] > currentModel.values[right]) wins += 1;
        }
        row.set(right, wins);
      }
      winsByValue.set(left, row);
    }

    const contestedPairs: Array<{ a: ValueKey; b: ValueKey; swing: number; aWins: number; bWins: number }> = [];
    for (let i = 0; i < VALUES.length; i += 1) {
      for (let j = i + 1; j < VALUES.length; j += 1) {
        const a = VALUES[i];
        const b = VALUES[j];
        if (!a || !b) continue;
        const aWins = winsByValue.get(a)?.get(b) ?? 0;
        const bWins = winsByValue.get(b)?.get(a) ?? 0;
        contestedPairs.push({ a, b, swing: Math.abs(aWins - bWins), aWins, bWins });
      }
    }

    const cycles: string[] = [];
    for (let i = 0; i < VALUES.length; i += 1) {
      for (let j = i + 1; j < VALUES.length; j += 1) {
        for (let k = j + 1; k < VALUES.length; k += 1) {
          const a = VALUES[i];
          const b = VALUES[j];
          const c = VALUES[k];
          if (!a || !b || !c) continue;
          const ab = (winsByValue.get(a)?.get(b) ?? 0) > (winsByValue.get(b)?.get(a) ?? 0);
          const bc = (winsByValue.get(b)?.get(c) ?? 0) > (winsByValue.get(c)?.get(b) ?? 0);
          const ca = (winsByValue.get(c)?.get(a) ?? 0) > (winsByValue.get(a)?.get(c) ?? 0);
          const ac = (winsByValue.get(a)?.get(c) ?? 0) > (winsByValue.get(c)?.get(a) ?? 0);
          const cb = (winsByValue.get(c)?.get(b) ?? 0) > (winsByValue.get(b)?.get(c) ?? 0);
          const ba = (winsByValue.get(b)?.get(a) ?? 0) > (winsByValue.get(a)?.get(b) ?? 0);
          if ((ab && bc && ca) || (ac && cb && ba)) {
            cycles.push(`${VALUE_LABELS[a]} -> ${VALUE_LABELS[b]} -> ${VALUE_LABELS[c]} -> ${VALUE_LABELS[a]}`);
          }
        }
      }
    }

    const sortedContested = contestedPairs.sort((a, b) => a.swing - b.swing).slice(0, 6);
    return { sortedContested, cycles };
  }, [selectedModelEntries]);

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
        <span className="text-xs font-medium text-gray-600">Arrows per AI:</span>
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

      <div className="mb-3 flex flex-wrap items-center gap-3">
        {selectedModelEntries.map((model) => {
          const color = modelColorById.get(model.model) ?? '#334155';
          return (
            <div key={model.model} className="flex items-center gap-1.5 text-xs text-gray-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span>{model.label}</span>
            </div>
          );
        })}
      </div>

      <div className="mb-4 overflow-x-auto rounded border border-gray-100 bg-gray-50 p-2">
        <svg
          viewBox="0 0 1280 1120"
          className="w-full min-w-[1120px]"
          style={{ height: 'calc(100vh - 140px)', minHeight: '900px' }}
          role="img"
          aria-label="Value dominance graph"
        >
          <defs>
            {selectedModelEntries.map((model) => {
              const color = modelColorById.get(model.model) ?? '#334155';
              const markerId = `dominance-arrow-${model.model}`;
              return (
                <marker
                  key={markerId}
                  id={markerId}
                  markerWidth="1.6"
                  markerHeight="1.6"
                  refX="1.6"
                  refY="0.8"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M-0.1,0 L1.6,0.8 L-0.1,1.6 z" fill={color} />
                </marker>
              );
            })}
          </defs>

          {perModelEdges.flatMap(({ model, edges }) => {
            const color = modelColorById.get(model.model) ?? '#334155';
            return edges.map((edge) => {
              const source = positionByValue.get(edge.from);
              const target = positionByValue.get(edge.to);
              if (!source || !target) return null;
              const dx = target.x - source.x;
              const dy = target.y - source.y;
              const length = Math.hypot(dx, dy) || 1;
              const ux = dx / length;
              const uy = dy / length;
              const nodeRadius = 68;
              // Convert BT log-strength gap into implied pairwise win probability for this model.
              const winRate = 1 / (1 + Math.exp(-edge.gap));
              const normalized = Math.max(0, Math.min(1, (winRate - 0.5) / 0.5));
              const widthFactor = normalized ** 1.6;
              const strokeWidth = 0.1 + widthFactor * 5.4;
              const strokeOpacity = 0.15 + widthFactor * 0.75;
              const startX = source.x + ux * nodeRadius;
              const startY = source.y + uy * nodeRadius;
              // Place marker tip exactly on the target circle boundary.
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
                <g key={`${model.model}-${edge.from}-${edge.to}`}>
                  <line
                    x1={startX}
                    y1={startY}
                    x2={baseX}
                    y2={baseY}
                    stroke={color}
                    strokeOpacity={strokeOpacity}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                  />
                  <polygon
                    points={`${endX},${endY} ${leftX},${leftY} ${rightX},${rightY}`}
                    fill={color}
                    fillOpacity={strokeOpacity}
                  />
                </g>
              );
            });
          })}

          {nodePositions.map((node) => (
            <g key={node.value}>
              <circle
                cx={node.x}
                cy={node.y}
                r={68}
                fill={getPriorityColor(
                  selectedModelEntries[0]?.values[node.value] ?? 0,
                  priorityValueRange.min,
                  priorityValueRange.max,
                )}
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
            For this selected AI. Low swing means two values are closely matched.
          </p>
          <ol className="mt-2 space-y-1 text-sm text-gray-700">
            {valueTournament.sortedContested.map((item, index) => (
              <li key={`${item.a}-${item.b}`}>
                {index + 1}. {VALUE_LABELS[item.a]} vs {VALUE_LABELS[item.b]} ({item.aWins}-{item.bWins})
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <h3 className="text-sm font-medium text-gray-900">Value Cycle Check</h3>
          <p className="mt-2 text-sm text-gray-700">
            {valueTournament.cycles.length > 0
              ? `Found ${valueTournament.cycles.length} value triads with cyclical majority outcomes.`
              : 'No value-level majority cycles detected in this snapshot.'}
          </p>
          {valueTournament.cycles.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-gray-700">
              {valueTournament.cycles.slice(0, 4).map((cycle) => (
                <li key={cycle}>{cycle}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function SectionPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-base font-medium text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-600">{description}</p>
      <p className="mt-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
        Implemented in a follow-up table-specific PR.
      </p>
    </section>
  );
}

export function DomainAnalysis() {
  const [showInterpretation, setShowInterpretation] = useState(true);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Domain Analysis</h1>
          <p className="mt-1 text-sm text-gray-600">
            Structured model-value analysis across priorities, ranking behavior, and similarity.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0"
          onClick={() => setShowInterpretation((current) => !current)}
          aria-expanded={showInterpretation}
          aria-controls="domain-analysis-interpretation"
        >
          {showInterpretation ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
          {showInterpretation ? 'Hide interpretation guide' : 'Show interpretation guide'}
        </Button>
      </div>

      {showInterpretation && (
        <section id="domain-analysis-interpretation" className="rounded-lg border border-blue-100 bg-blue-50 p-4">
          <h2 className="text-sm font-semibold text-blue-900">How to read this page</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-blue-900">
            <li>Section 1 shows what each model prioritizes by value strengths.</li>
            <li>Section 2 ranks values and surfaces cyclical value relationships.</li>
            <li>Section 3 compares model profiles to find nearest neighbors and outliers.</li>
            <li>All charts currently use a curated snapshot and will be wired to live per-domain data.</li>
          </ul>
        </section>
      )}

      <ValuePrioritiesSection />
      <DominanceSection />
      <SectionPlaceholder
        title="3. Similarity and Differences"
        description="Pairwise model similarity matrix and nearest/farthest pairs."
      />
    </div>
  );
}

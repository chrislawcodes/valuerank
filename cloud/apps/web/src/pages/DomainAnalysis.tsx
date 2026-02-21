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

function getTopBottomValues(model: ModelEntry): { top: ValueKey[]; bottom: ValueKey[] } {
  const sorted = [...VALUES].sort((a, b) => model.values[b] - model.values[a]);
  return {
    top: sorted.slice(0, 3),
    bottom: sorted.slice(-3),
  };
}

function getHeatmapColor(value: number): string {
  const clamped = Math.max(-1, Math.min(1, value));
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
  if (max <= min) return getHeatmapColor(0);
  const normalized = (value - min) / (max - min);
  const heatmapScale = normalized * 2 - 1;
  return getHeatmapColor(heatmapScale);
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
      models.sort((a, b) =>
        sortState.direction === 'asc' ? a.label.localeCompare(b.label) : b.label.localeCompare(a.label),
      );
    } else {
      models.sort((a, b) =>
        sortState.direction === 'asc' ? a.values[key] - b.values[key] : b.values[key] - a.values[key],
      );
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
              <th
                className="px-2 py-2 text-left font-medium"
                aria-sort={
                  sortState.key === 'model'
                    ? sortState.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
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
                <th
                  key={value}
                  className="px-2 py-2 text-right font-medium"
                  aria-sort={
                    sortState.key === value
                      ? sortState.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
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
      <SectionPlaceholder
        title="2. Ranking and Cycles"
        description="Directed value graph for head-to-head dominance behavior."
      />
      <SectionPlaceholder
        title="3. Similarity and Differences"
        description="Pairwise model similarity matrix and nearest/farthest pairs."
      />
    </div>
  );
}

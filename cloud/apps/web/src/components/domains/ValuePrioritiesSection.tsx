import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import {
  VALUES,
  VALUE_LABELS,
  type ModelEntry,
  type ValueKey,
} from '../../data/domainAnalysisData';
import { getPriorityColor } from './domainAnalysisColors';

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

type ValuePrioritiesSectionProps = {
  models: ModelEntry[];
  selectedDomainId: string;
  selectedSignature: string | null;
};

export function ValuePrioritiesSection({
  models,
  selectedDomainId,
  selectedSignature,
}: ValuePrioritiesSectionProps) {
  const navigate = useNavigate();
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
    const nextModels = [...models];
    const key = sortState.key;
    if (key === 'model') {
      nextModels.sort((a, b) =>
        sortState.direction === 'asc' ? a.label.localeCompare(b.label) : b.label.localeCompare(a.label),
      );
    } else {
      nextModels.sort((a, b) =>
        sortState.direction === 'asc' ? a.values[key] - b.values[key] : b.values[key] - a.values[key],
      );
    }
    return nextModels;
  }, [models, sortState]);

  const valueRange = useMemo(() => {
    const all = models.flatMap((model) => VALUES.map((value) => model.values[value]));
    if (all.length === 0) return { min: -1, max: 1 };
    return { min: Math.min(...all), max: Math.max(...all) };
  }, [models]);

  const handleValueCellClick = (modelId: string, valueKey: ValueKey) => {
    if (selectedDomainId === '') return;
    const params = new URLSearchParams({
      domainId: selectedDomainId,
      modelId,
      valueKey,
      scoreMethod: 'FULL_BT',
    });
    if (selectedSignature !== null) {
      params.set('signature', selectedSignature);
    }
    navigate(`/domains/analysis/value-detail?${params.toString()}`);
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-medium text-gray-900">1. Value Priorities by AI</h2>
          <p className="text-sm text-gray-600">Which values each model favors most and least.</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-500">Click a column heading to sort.</p>
          <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">Scoring: Full BT</span>
        </div>
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
                      className="p-0 text-right text-gray-800 transition-all hover:brightness-105"
                      style={{ background: getPriorityColor(model.values[value], valueRange.min, valueRange.max) }}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="block h-full min-h-[34px] w-full rounded-none border border-transparent px-2 py-2 text-right text-xs text-gray-800 hover:border-sky-300 hover:bg-white/25 hover:underline focus-visible:!ring-1 focus-visible:!ring-sky-400"
                        onClick={() => handleValueCellClick(model.model, value)}
                        disabled={selectedDomainId === ''}
                        title={`View score calculation and vignette condition details for ${model.label} · ${VALUE_LABELS[value]}`}
                      >
                        {model.values[value] > 0 ? '+' : ''}
                        {model.values[value].toFixed(2)}
                      </Button>
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

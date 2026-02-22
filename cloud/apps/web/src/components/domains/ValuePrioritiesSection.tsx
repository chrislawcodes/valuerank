import { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import {
  DOMAIN_ANALYSIS_AVAILABLE_MODELS,
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

export function ValuePrioritiesSection() {
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
    const models = [...DOMAIN_ANALYSIS_AVAILABLE_MODELS];
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
    const all = DOMAIN_ANALYSIS_AVAILABLE_MODELS.flatMap((model) => VALUES.map((value) => model.values[value]));
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

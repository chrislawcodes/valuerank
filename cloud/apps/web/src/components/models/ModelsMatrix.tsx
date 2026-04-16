import { useMemo, useState } from 'react';
import { type ModelsAnalysisModelResult, type ModelsAnalysisValueResult } from '../../api/operations/modelsAnalysis';
import { VALUE_LABELS, VALUES, type ValueKey } from '../../data/domainAnalysisData';
import { ModelsMatrixCell } from './ModelsMatrixCell';
import { Button } from '../ui/Button';

export type ModelsMatrixSortKey = 'model' | ValueKey;

type ModelsMatrixProps = {
  models: ModelsAnalysisModelResult[];
  selectedModelIds: string[];
  singleDomainActive: boolean;
  selectedCellKey: string | null;
  onCellClick: (modelId: string, valueKey: string) => void;
};

function getSortableCell(
  model: ModelsAnalysisModelResult,
  sortKey: ModelsMatrixSortKey,
): ModelsAnalysisValueResult | null {
  if (sortKey === 'model') return null;
  const value = model.values.find((entry) => entry.valueKey === sortKey) ?? null;
  if (value == null || value.pooledWinRate == null) return null;
  return value;
}

function getEmptyStateMessage(params: {
  selectedModelCount: number;
  visibleCellCount: number;
  singleDomainActive: boolean;
}): string {
  if (params.selectedModelCount === 0) {
    return 'No models are selected. Re-enable one or more models in the Model set filter.';
  }

  if (params.visibleCellCount === 0) {
    if (params.singleDomainActive) {
      return 'The selected domain has no scored comparisons for the current model set. Try All domains or a broader domain filter.';
    }
    return 'No scored comparisons are available for the current model set. Widen the domain filter or include more models.';
  }

  return '';
}

function sortModels(
  models: ModelsAnalysisModelResult[],
  sortKey: ModelsMatrixSortKey,
  sortDirection: 'asc' | 'desc',
): ModelsAnalysisModelResult[] {
  const next = [...models];
  next.sort((left, right) => {
    if (sortKey === 'model') {
      const cmp = left.label.localeCompare(right.label);
      return sortDirection === 'asc' ? cmp : -cmp;
    }

    const leftCell = getSortableCell(left, sortKey);
    const rightCell = getSortableCell(right, sortKey);

    const leftRate = leftCell?.pooledWinRate ?? null;
    const rightRate = rightCell?.pooledWinRate ?? null;

    if (leftRate == null && rightRate == null) return left.label.localeCompare(right.label);
    if (leftRate == null) return 1;
    if (rightRate == null) return -1;

    const diff = sortDirection === 'desc' ? rightRate - leftRate : leftRate - rightRate;
    if (diff !== 0) return diff;

    return left.label.localeCompare(right.label);
  });
  return next;
}

export function ModelsMatrix({
  models,
  selectedModelIds,
  singleDomainActive,
  selectedCellKey,
  onCellClick,
}: ModelsMatrixProps) {
  const [sortKey, setSortKey] = useState<ModelsMatrixSortKey>('model');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const updateSort = (key: ModelsMatrixSortKey) => {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'model' ? 'asc' : 'desc');
    }
  };

  const visibleModels = useMemo(() => {
    const selected = new Set(selectedModelIds);
    const filtered = models.filter((model) => selected.has(model.modelId));
    return sortModels(filtered, sortKey, sortDirection);
  }, [models, selectedModelIds, sortKey, sortDirection]);

  const visibleCellCount = useMemo(() => {
    let count = 0;
    for (const model of visibleModels) {
      for (const value of model.values) {
        if (value.pooledWinRate != null) {
          count += 1;
        }
      }
    }
    return count;
  }, [visibleModels]);

  const emptyStateMessage = getEmptyStateMessage({
    selectedModelCount: selectedModelIds.length,
    visibleCellCount,
    singleDomainActive,
  });

  if (models.length === 0) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-600">No active models are available.</p>
      </section>
    );
  }

  if (emptyStateMessage !== '' || visibleModels.length === 0) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-600">{emptyStateMessage !== '' ? emptyStateMessage : 'No active models are available.'}</p>
      </section>
    );
  }

  const headers = VALUES.map((valueKey) => ({
    valueKey,
    label: VALUE_LABELS[valueKey],
  }));

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="overflow-x-auto">
        <table className="min-w-[1200px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th
                className="sticky left-0 top-0 z-20 border-b border-gray-200 bg-white px-3 py-3 text-left"
                aria-sort={sortKey === 'model' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto min-h-0 !p-0 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-900"
                  onClick={() => updateSort('model')}
                >
                  Model {sortKey === 'model' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </Button>
              </th>
              {headers.map((value) => (
                <th
                  key={value.valueKey}
                  className="sticky top-0 z-10 border-b border-gray-200 bg-white px-2 py-3 text-center"
                  aria-sort={sortKey === value.valueKey ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto min-h-0 !p-0 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-900"
                    onClick={() => updateSort(value.valueKey)}
                  >
                    {value.label} {sortKey === value.valueKey ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                  </Button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleModels.map((model) => {
              const selectedModelKey = selectedCellKey != null ? selectedCellKey.split(':')[0] : null;
              const selectedRow = selectedModelKey === model.modelId;
              return (
                <tr key={model.modelId}>
                  <th
                    className={`sticky left-0 z-10 border-b border-gray-100 px-3 py-2 text-left align-middle ${
                      selectedRow ? 'bg-teal-50' : 'bg-white'
                    }`}
                    title={model.label}
                  >
                    <div className="max-w-[180px] truncate font-medium text-gray-900">{model.label}</div>
                    <div className="text-xs text-gray-500">{model.modelId}</div>
                  </th>
                  {headers.map((value) => {
                    const cell = model.values.find((entry) => entry.valueKey === value.valueKey) ?? null;
                    if (cell == null) {
                      return (
                        <td key={value.valueKey} className="border-b border-gray-100 px-1 py-1 text-center">
                          <span className="text-sm text-gray-400">n/a</span>
                        </td>
                      );
                    }

                    const selected = selectedCellKey === `${model.modelId}:${value.valueKey}`;

                    return (
                      <td key={value.valueKey} className="border-b border-gray-100 px-1 py-1 align-middle">
                        <ModelsMatrixCell
                          modelLabel={model.label}
                          valueLabel={value.label}
                          pooledWinRate={cell.pooledWinRate}
                          stabilityScore={cell.stabilityScore}
                          eligibleDomainCount={cell.eligibleDomainCount}
                          domains={cell.domains}
                          singleDomainActive={singleDomainActive}
                          selected={selected}
                          onClick={() => onCellClick(model.modelId, value.valueKey)}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-xs text-gray-500">
        Click a column heading to sort.
      </div>
    </section>
  );
}

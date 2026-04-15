import { useMemo } from 'react';
import { type ModelsAnalysisModelResult, type ModelsAnalysisValueResult } from '../../api/operations/modelsAnalysis';
import { VALUE_LABELS, VALUES, type ValueKey } from '../../data/domainAnalysisData';
import { ModelsMatrixCell } from './ModelsMatrixCell';

export type ModelsMatrixSortKey = 'model' | ValueKey;
export type StabilityVisibility = 'all' | 'stable' | 'low';

export const VALUE_SHORT_LABELS: Record<ValueKey, string> = {
  Self_Direction_Action: 'Self-Dir',
  Universalism_Nature: 'Univ',
  Benevolence_Dependability: 'Bene',
  Security_Personal: 'Security',
  Power_Dominance: 'Power',
  Achievement: 'Achieve',
  Tradition: 'Tradition',
  Stimulation: 'Stimulate',
  Hedonism: 'Hedone',
  Conformity_Interpersonal: 'Conform',
};

type ModelsMatrixProps = {
  models: ModelsAnalysisModelResult[];
  selectedModelIds: string[];
  sortBy: ModelsMatrixSortKey;
  stabilityVisibility: StabilityVisibility;
  singleDomainActive: boolean;
  selectedCellKey: string | null;
  onCellClick: (modelId: string, valueKey: string) => void;
};

function getVisibleCell(
  value: ModelsAnalysisValueResult,
  stabilityVisibility: StabilityVisibility,
  singleDomainActive: boolean,
): { hiddenByFilter: boolean } {
  if (singleDomainActive || stabilityVisibility === 'all') {
    return { hiddenByFilter: false };
  }

  if (value.stabilityScore == null) {
    return { hiddenByFilter: true };
  }

  if (stabilityVisibility === 'stable') {
    return { hiddenByFilter: value.stabilityScore < 75 };
  }

  return { hiddenByFilter: value.stabilityScore >= 50 };
}

function getSortableCell(
  model: ModelsAnalysisModelResult,
  sortBy: ModelsMatrixSortKey,
  stabilityVisibility: StabilityVisibility,
  singleDomainActive: boolean,
): ModelsAnalysisValueResult | null {
  if (sortBy === 'model') return null;
  const value = model.values.find((entry) => entry.valueKey === sortBy) ?? null;
  if (value == null) return null;
  const visible = getVisibleCell(value, stabilityVisibility, singleDomainActive);
  if (visible.hiddenByFilter) return null;
  if (value.pooledWinRate == null) return null;
  return value;
}

function compareNullableDescending(left: number | null, right: number | null): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (left === right) return 0;
  return right - left;
}

function getEmptyStateMessage(params: {
  selectedModelCount: number;
  visibleCellCount: number;
  stabilityVisibility: StabilityVisibility;
  singleDomainActive: boolean;
}): string {
  if (params.selectedModelCount === 0) {
    return 'No models are selected. Re-enable one or more models in the Model set filter.';
  }

  if (params.visibleCellCount === 0 && params.stabilityVisibility !== 'all') {
    if (params.stabilityVisibility === 'stable') {
      return 'No cells meet the Stable only filter. Switch Stability visibility back to All or Low stability only.';
    }
    return 'No cells meet the Low stability only filter. Switch Stability visibility back to All or Stable only.';
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
  sortBy: ModelsMatrixSortKey,
  stabilityVisibility: StabilityVisibility,
  singleDomainActive: boolean,
): ModelsAnalysisModelResult[] {
  const next = [...models];
  next.sort((left, right) => {
    if (sortBy === 'model') {
      return left.label.localeCompare(right.label);
    }

    const leftCell = getSortableCell(left, sortBy, stabilityVisibility, singleDomainActive);
    const rightCell = getSortableCell(right, sortBy, stabilityVisibility, singleDomainActive);

    const pooledCompare = compareNullableDescending(leftCell?.pooledWinRate ?? null, rightCell?.pooledWinRate ?? null);
    if (pooledCompare !== 0) return pooledCompare;

    const stabilityCompare = compareNullableDescending(leftCell?.stabilityScore ?? null, rightCell?.stabilityScore ?? null);
    if (stabilityCompare !== 0) return stabilityCompare;

    return left.label.localeCompare(right.label);
  });
  return next;
}

export function ModelsMatrix({
  models,
  selectedModelIds,
  sortBy,
  stabilityVisibility,
  singleDomainActive,
  selectedCellKey,
  onCellClick,
}: ModelsMatrixProps) {
  const visibleModels = useMemo(() => {
    const selected = new Set(selectedModelIds);
    const filtered = models.filter((model) => selected.has(model.modelId));
    return sortModels(filtered, sortBy, stabilityVisibility, singleDomainActive);
  }, [models, selectedModelIds, sortBy, stabilityVisibility, singleDomainActive]);

  const visibleCellCount = useMemo(() => {
    let count = 0;
    for (const model of visibleModels) {
      for (const value of model.values) {
        const visible = getVisibleCell(value, stabilityVisibility, singleDomainActive);
        if (!visible.hiddenByFilter && value.pooledWinRate != null) {
          count += 1;
        }
      }
    }
    return count;
  }, [visibleModels, stabilityVisibility, singleDomainActive]);

  const emptyStateMessage = getEmptyStateMessage({
    selectedModelCount: selectedModelIds.length,
    visibleCellCount,
    stabilityVisibility,
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
    shortLabel: VALUE_SHORT_LABELS[valueKey],
    fullLabel: VALUE_LABELS[valueKey],
  }));

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="overflow-x-auto">
        <table className="min-w-[980px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 border-b border-gray-200 bg-white px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Model
              </th>
              {headers.map((value) => (
                <th
                  key={value.valueKey}
                  className="sticky top-0 z-10 border-b border-gray-200 bg-white px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500"
                  title={value.fullLabel}
                >
                  {value.shortLabel}
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

                    const visible = getVisibleCell(cell, stabilityVisibility, singleDomainActive);
                    const selected = selectedCellKey === `${model.modelId}:${value.valueKey}`;

                    return (
                      <td key={value.valueKey} className="border-b border-gray-100 px-1 py-1 align-middle">
                        <ModelsMatrixCell
                          modelLabel={model.label}
                          valueLabel={value.fullLabel}
                          pooledWinRate={cell.pooledWinRate}
                          stabilityScore={cell.stabilityScore}
                          eligibleDomainCount={cell.eligibleDomainCount}
                          domains={cell.domains}
                          hiddenByFilter={visible.hiddenByFilter}
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
        Rows sort by model name or by the selected value column. Stable only means stability score is at least 75. Low stability only means the score is below 50.
      </div>
    </section>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useClient } from 'urql';
import gql from 'graphql-tag';
import { Button } from '../ui/Button';
import { ScreenshotButton } from '../ui/ScreenshotButton';
import { cn } from '../../lib/utils';
import {
  formatPercent,
  formatPointShift,
  getCellTone,
  getWinRateTone,
  type DomainShiftDisplayMode,
} from '../../pages/domainValueShiftHeatmapUtils';
import { DisplayModeToggle } from './ConfidenceDomainBreakout';
import {
  type ModelsConfidenceQueryResult,
  type ModelsConfidenceModelResult,
} from '../../api/operations/modelsConfidence';

type DomainOption = {
  id: string;
  name: string;
};

export interface ConfidenceModelDomainBreakoutProps {
  domains: DomainOption[];
  signature: string;
  selectedModelIds: string[] | null;
  defaultModelIds: string[];
  selectedDomainId: string | null;
}

type DomainQueryState =
  | {
      status: 'loading';
      models: ModelsConfidenceModelResult[];
      error: null;
    }
  | {
      status: 'ready';
      models: ModelsConfidenceModelResult[];
      error: null;
    }
  | {
      status: 'error';
      models: ModelsConfidenceModelResult[];
      error: string;
    };

type ModelBreakoutSortKey = 'model' | 'average' | `domain:${string}`;
type ModelBreakoutSortDirection = 'asc' | 'desc';

type ModelBreakoutSort = {
  key: ModelBreakoutSortKey;
  direction: ModelBreakoutSortDirection;
};

type ModelCellData = {
  strongCount: number;
  leanCount: number;
  strongPct: number | null;
  shift: number | null;
  status: 'ready' | 'loading' | 'error';
};

type ModelRowData = {
  modelId: string;
  modelLabel: string;
  averageStrongPct: number | null;
  cells: Map<string, ModelCellData>;
};

const DEFAULT_MODEL_SORT: ModelBreakoutSort = {
  key: 'model',
  direction: 'asc',
};

const MODELS_CONFIDENCE_BY_DOMAIN_QUERY = gql`
  query ConfidenceModelBreakoutModelsConfidence($signature: String, $domainId: ID!) {
    modelsConfidence(signature: $signature, domainId: $domainId) {
      models {
        modelId
        label
        overallConfidence
        overallStrongCount
        overallLeanCount
        values {
          valueKey
          confidence
          strongCount
          leanCount
        }
      }
    }
  }
`;

type ConfidenceModelBreakoutModelsConfidenceQueryVariables = {
  signature?: string | null;
  domainId: string;
};

function getSortDirectionLabel(direction: ModelBreakoutSortDirection): 'ascending' | 'descending' {
  return direction === 'asc' ? 'ascending' : 'descending';
}

function getNextSort(sort: ModelBreakoutSort, key: ModelBreakoutSortKey): ModelBreakoutSort {
  if (sort.key === key) {
    return {
      key,
      direction: sort.direction === 'asc' ? 'desc' : 'asc',
    };
  }

  return {
    key,
    direction: key === 'model' ? 'asc' : 'desc',
  };
}

function sortRows(rows: ModelRowData[], sort: ModelBreakoutSort, displayMode: DomainShiftDisplayMode): ModelRowData[] {
  return [...rows]
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const getSortValue = (row: ModelRowData): string | number | null => {
        if (sort.key === 'model') return row.modelLabel;
        if (sort.key === 'average') return row.averageStrongPct;

        const domainId = sort.key.slice('domain:'.length);
        const cell = row.cells.get(domainId);
        if (cell == null) return null;
        return displayMode === 'shift' ? cell.shift : cell.strongPct;
      };

      const leftValue = getSortValue(left.row);
      const rightValue = getSortValue(right.row);

      if (leftValue == null && rightValue == null) return left.index - right.index;
      if (leftValue == null) return 1;
      if (rightValue == null) return -1;

      const direction = sort.direction === 'asc' ? 1 : -1;
      if (typeof leftValue === 'string' && typeof rightValue === 'string') {
        const comparison = leftValue.localeCompare(rightValue);
        return comparison === 0 ? left.index - right.index : comparison * direction;
      }

      const comparison = Number(leftValue) - Number(rightValue);
      return comparison === 0 ? left.index - right.index : comparison * direction;
    })
    .map(({ row }) => row);
}

function buildModelRows(
  domains: DomainOption[],
  domainStates: Record<string, DomainQueryState>,
  effectiveModelIds: readonly string[],
): ModelRowData[] {
  const modelLabels = new Map<string, string>();

  for (const domain of domains) {
    const state = domainStates[domain.id];
    if (state == null || state.status !== 'ready') continue;

    for (const model of state.models) {
      if (!modelLabels.has(model.modelId)) {
        modelLabels.set(model.modelId, model.label);
      }
    }
  }

  return effectiveModelIds.map((modelId) => {
    let pooledStrong = 0;
    let pooledLean = 0;
    const cells = new Map<string, ModelCellData>();

    for (const domain of domains) {
      const state = domainStates[domain.id];
      if (state == null || state.status === 'loading') {
        cells.set(domain.id, {
          strongCount: 0,
          leanCount: 0,
          strongPct: null,
          shift: null,
          status: 'loading',
        });
        continue;
      }

      if (state.status === 'error') {
        cells.set(domain.id, {
          strongCount: 0,
          leanCount: 0,
          strongPct: null,
          shift: null,
          status: 'error',
        });
        continue;
      }

      const model = state.models.find((entry) => entry.modelId === modelId) ?? null;
      if (model == null) {
        cells.set(domain.id, {
          strongCount: 0,
          leanCount: 0,
          strongPct: null,
          shift: null,
          status: 'ready',
        });
        continue;
      }

      const total = model.overallStrongCount + model.overallLeanCount;
      const strongPct = total > 0 ? (model.overallStrongCount / total) * 100 : null;
      pooledStrong += model.overallStrongCount;
      pooledLean += model.overallLeanCount;
      cells.set(domain.id, {
        strongCount: model.overallStrongCount,
        leanCount: model.overallLeanCount,
        strongPct,
        shift: null,
        status: 'ready',
      });
    }

    const total = pooledStrong + pooledLean;
    const averageStrongPct = total > 0 ? (pooledStrong / total) * 100 : null;

    for (const [domainId, cell] of cells.entries()) {
      if (cell.status !== 'ready' || cell.strongPct == null) continue;
      cells.set(domainId, {
        ...cell,
        shift: averageStrongPct == null ? null : cell.strongPct - averageStrongPct,
      });
    }

    return {
      modelId,
      modelLabel: modelLabels.get(modelId) ?? modelId,
      averageStrongPct,
      cells,
    };
  });
}

function getCellValue(cell: ModelCellData, displayMode: DomainShiftDisplayMode): string {
  if (cell.status === 'loading') return '…';
  if (cell.status === 'error' || cell.strongPct == null) return '—';
  if (displayMode === 'shift') return cell.shift == null ? '—' : formatPointShift(cell.shift);
  return formatPercent(cell.strongPct);
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = 'center',
  className,
}: {
  label: string;
  sortKey: ModelBreakoutSortKey;
  sort: ModelBreakoutSort;
  onSort: (sort: ModelBreakoutSort) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
}) {
  const isActive = sort.key === sortKey;
  const nextSort = getNextSort(sort, sortKey);
  const isHighlighted = className?.includes('font-bold') ?? false;
  const isTealHeader = className?.includes('text-teal-700') ?? false;

  return (
    <th
      scope="col"
      aria-sort={isActive ? getSortDirectionLabel(sort.direction) : 'none'}
      className={cn(
        'border-b border-gray-200 bg-white px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500',
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onSort(nextSort)}
        className={cn(
          'w-full gap-1 rounded-none bg-transparent px-0 py-0 min-h-0 text-[11px] font-semibold text-gray-500 shadow-none transition-colors hover:bg-transparent hover:text-gray-900 focus:ring-0 focus:ring-offset-0',
          align === 'left' && 'justify-start text-left',
          align === 'center' && 'justify-center text-center',
          align === 'right' && 'justify-end text-right',
          isHighlighted && 'font-bold',
          isTealHeader && 'text-teal-700',
          isActive && 'text-teal-700',
        )}
        aria-label={`Sort by ${label} ${nextSort.direction === 'asc' ? 'ascending' : 'descending'}`}
      >
        <span className="whitespace-nowrap">{label}</span>
        <span aria-hidden="true" className="text-[11px] leading-none text-gray-400">
          {isActive ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </Button>
    </th>
  );
}

export function ConfidenceModelDomainBreakout({
  domains,
  signature,
  selectedModelIds,
  defaultModelIds,
  selectedDomainId,
}: ConfidenceModelDomainBreakoutProps) {
  const client = useClient();
  const [displayMode, setDisplayMode] = useState<DomainShiftDisplayMode>('winRate');
  const [sort, setSort] = useState<ModelBreakoutSort>(DEFAULT_MODEL_SORT);
  const [domainStates, setDomainStates] = useState<Record<string, DomainQueryState>>({});
  const sectionRef = useRef<HTMLElement>(null);
  const effectiveModelIds = selectedModelIds ?? defaultModelIds;
  const visibleDomains = useMemo(
    () =>
      selectedDomainId != null
        ? domains.filter((domain) => domain.id === selectedDomainId)
        : domains,
    [domains, selectedDomainId],
  );
  const noModelsSelected = effectiveModelIds.length === 0;

  useEffect(() => {
    let cancelled = false;

    if (visibleDomains.length === 0) {
      setDomainStates({});
      return () => {
        cancelled = true;
      };
    }

    setDomainStates(() => {
      const next: Record<string, DomainQueryState> = {};
      for (const domain of visibleDomains) {
        next[domain.id] = { status: 'loading', models: [], error: null };
      }
      return next;
    });

    void Promise.allSettled(
      visibleDomains.map(async (domain) => {
        try {
          const result = await client
            .query<ModelsConfidenceQueryResult, ConfidenceModelBreakoutModelsConfidenceQueryVariables>(
              MODELS_CONFIDENCE_BY_DOMAIN_QUERY,
              { signature, domainId: domain.id },
            )
            .toPromise();

          if (cancelled) return;

          if (result.error != null) {
            setDomainStates((current) => ({
              ...current,
              [domain.id]: {
                status: 'error',
                models: [],
                error: result.error?.message ?? 'Failed to load domain data',
              },
            }));
            return;
          }

          setDomainStates((current) => ({
            ...current,
            [domain.id]: {
              status: 'ready',
              models: result.data?.modelsConfidence.models ?? [],
              error: null,
            },
          }));
        } catch (error) {
          if (cancelled) return;
          setDomainStates((current) => ({
            ...current,
            [domain.id]: {
              status: 'error',
              models: [],
              error: error instanceof Error ? error.message : 'Failed to load domain data',
            },
          }));
        }
      }),
    );

    return () => {
      cancelled = true;
    };
  }, [client, signature, visibleDomains]);

  const rows = useMemo(
    () => buildModelRows(domains, domainStates, effectiveModelIds),
    [domains, domainStates, effectiveModelIds],
  );

  const sortedRows = useMemo(
    () => sortRows(rows, sort, displayMode),
    [displayMode, rows, sort],
  );

  if (visibleDomains.length === 0) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-600">No domains are available for the selected filters.</p>
      </section>
    );
  }

  if (noModelsSelected) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-600">No models selected.</p>
      </section>
    );
  }

  return (
    <section ref={sectionRef} className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">Confidence by Model &amp; Domain</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DisplayModeToggle displayMode={displayMode} onChange={setDisplayMode} />
          <ScreenshotButton targetRef={sectionRef} label="confidence by model and domain report" />
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-gray-100 bg-white p-2">
        <table className="w-full table-auto border-collapse text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-gray-600">
              <SortableHeader
                label="Model"
                sortKey="model"
                sort={sort}
                onSort={setSort}
                align="left"
                className="border-r-2 border-gray-300"
              />
              <SortableHeader
                label="Avg"
                sortKey="average"
                sort={sort}
                onSort={setSort}
                align="right"
                className="border-r-2 border-gray-300"
              />
              {visibleDomains.map((domain) => {
                const isSelected = selectedDomainId === domain.id;
                const domainSortKey: ModelBreakoutSortKey = `domain:${domain.id}`;
                return (
                  <SortableHeader
                    key={domain.id}
                    label={domain.name}
                    sortKey={domainSortKey}
                    sort={sort}
                    onSort={setSort}
                    className={cn(isSelected && 'font-bold text-teal-700')}
                  />
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              return (
                <tr key={row.modelId} className="border-b border-gray-100">
                  <th scope="row" className="border-b border-r-2 border-gray-300 bg-white px-2 py-2 whitespace-nowrap text-left font-medium text-gray-900">
                    {row.modelLabel}
                  </th>
                  <td className="border-b border-r-2 border-gray-300 bg-white px-2 py-2 whitespace-nowrap text-right font-mono text-gray-700">
                    {formatPercent(row.averageStrongPct)}
                  </td>
                  {visibleDomains.map((domain) => {
                    const cell = row.cells.get(domain.id);
                    const isSelected = selectedDomainId === domain.id;
                    const isLoading = cell == null || cell.status === 'loading';
                    const isError = cell?.status === 'error';
                    const tdClassName = cn(
                      'border-b border-gray-100 px-2 py-2 text-center align-middle transition-colors',
                      isSelected && 'ring-1 ring-inset ring-teal-200 bg-teal-50/30',
                      isLoading
                        ? 'bg-gray-50 text-gray-400'
                        : isError || cell?.strongPct == null
                          ? 'border-gray-100 bg-gray-50 text-gray-400'
                          : displayMode === 'shift'
                            ? getCellTone(cell.shift ?? 0)
                            : getWinRateTone(cell.strongPct),
                    );

                    return (
                      <td key={domain.id} className={tdClassName}>
                        <span className="inline-flex min-w-[64px] justify-center tabular-nums">
                          {cell == null ? '…' : getCellValue(cell, displayMode)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

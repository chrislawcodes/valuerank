import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useClient } from 'urql';
import gql from 'graphql-tag';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { VALUES, VALUE_LABELS } from '../../data/domainAnalysisData';
import { formatFullSchwartzValueName } from '../../utils/schwartz';
import {
  formatPercent,
  formatPointShift,
  getCellTone,
  getWinRateTone,
  type DomainShiftDisplayMode,
} from '../../pages/domainValueShiftHeatmapUtils';
import {
  type ModelsConfidenceQueryResult,
  type ModelsConfidenceModelResult,
} from '../../api/operations/modelsConfidence';

type DomainOption = {
  id: string;
  name: string;
};

type ConfidenceDomainBreakoutProps = {
  domains: DomainOption[];
  signature: string;
  selectedModelIds: string[] | null;
  defaultModelIds: string[];
  selectedDomainId: string | null;
};

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

type BreakoutSortKey = 'value' | 'average' | `domain:${string}`;
type BreakoutSortDirection = 'asc' | 'desc';

type BreakoutSort = {
  key: BreakoutSortKey;
  direction: BreakoutSortDirection;
};

type CellData = {
  strongCount: number;
  leanCount: number;
  strongPct: number | null;
  shift: number | null;
  status: 'ready' | 'loading' | 'error';
  error: string | null;
};

type RowData = {
  valueKey: string;
  valueLabel: string;
  averageStrongPct: number | null;
  cells: Map<string, CellData>;
};

const DEFAULT_SORT: BreakoutSort = {
  key: 'value',
  direction: 'asc',
};

const MODELS_CONFIDENCE_BY_DOMAIN_QUERY = gql`
  query ConfidenceDomainBreakoutModelsConfidence($signature: String, $domainId: ID!) {
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

type ConfidenceDomainBreakoutModelsConfidenceQueryVariables = {
  signature?: string | null;
  domainId: string;
};

function getSortDirectionLabel(direction: BreakoutSortDirection): 'ascending' | 'descending' {
  return direction === 'asc' ? 'ascending' : 'descending';
}

function getNextSort(sort: BreakoutSort, key: BreakoutSortKey): BreakoutSort {
  if (sort.key === key) {
    return {
      key,
      direction: sort.direction === 'asc' ? 'desc' : 'asc',
    };
  }

  return {
    key,
    direction: key === 'value' ? 'asc' : 'desc',
  };
}

function sortRows(rows: RowData[], sort: BreakoutSort, displayMode: DomainShiftDisplayMode): RowData[] {
  return [...rows]
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const getSortValue = (row: RowData): string | number | null => {
        if (sort.key === 'value') return row.valueLabel;
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
        const labelComparison = leftValue.localeCompare(rightValue);
        return labelComparison === 0 ? left.index - right.index : labelComparison * direction;
      }

      const numericComparison = Number(leftValue) - Number(rightValue);
      return numericComparison === 0 ? left.index - right.index : numericComparison * direction;
    })
    .map(({ row }) => row);
}

function getDomainCellTone(cell: CellData, displayMode: DomainShiftDisplayMode): string {
  if (cell.status === 'loading') {
    return 'bg-gray-50 text-gray-400 border-gray-100';
  }
  if (cell.status === 'error' || cell.strongPct == null || (displayMode === 'shift' && cell.shift == null)) {
    return 'bg-gray-50 text-gray-400 border-gray-100';
  }
  return displayMode === 'shift' ? getCellTone(cell.shift ?? 0) : getWinRateTone(cell.strongPct);
}

function formatDomainCellValue(cell: CellData, displayMode: DomainShiftDisplayMode): string {
  if (cell.status === 'loading') return ' ';
  if (cell.status === 'error') return '—';
  if (cell.strongPct == null) return '—';
  if (displayMode === 'shift') return cell.shift == null ? '—' : formatPointShift(cell.shift);
  return formatPercent(cell.strongPct);
}

function buildCell(models: ModelsConfidenceModelResult[], selectedModelIds: ReadonlySet<string>, valueKey: string): CellData {
  let strongCount = 0;
  let leanCount = 0;

  for (const model of models) {
    if (!selectedModelIds.has(model.modelId)) continue;
    const value = model.values.find((entry) => entry.valueKey === valueKey) ?? null;
    if (value == null) continue;
    strongCount += value.strongCount;
    leanCount += value.leanCount;
  }

  const total = strongCount + leanCount;
  if (total === 0) {
    return {
      strongCount,
      leanCount,
      strongPct: null,
      shift: null,
      status: 'ready',
      error: null,
    };
  }

  return {
    strongCount,
    leanCount,
    strongPct: (strongCount / total) * 100,
    shift: null,
    status: 'ready',
    error: null,
  };
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
  sortKey: BreakoutSortKey;
  sort: BreakoutSort;
  onSort: (sort: BreakoutSort) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
}) {
  const isActive = sort.key === sortKey;
  const nextSort = getNextSort(sort, sortKey);

  return (
    <th
      aria-sort={isActive ? getSortDirectionLabel(sort.direction) : 'none'}
      className={cn(
        'border-b border-gray-200 bg-white px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500',
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onSort(nextSort)}
        className={cn(
          'inline-flex w-full items-center gap-1 rounded px-1 py-1 hover:bg-gray-100 hover:text-gray-900',
          align === 'left' && 'justify-start text-left',
          align === 'center' && 'justify-center text-center',
          align === 'right' && 'justify-end text-right',
        )}
        aria-label={`Sort by ${label} ${nextSort.direction === 'asc' ? 'ascending' : 'descending'}`}
      >
        <span>{label}</span>
        <span aria-hidden="true" className={cn('text-gray-400', isActive && 'text-teal-700')}>
          {isActive ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </Button>
    </th>
  );
}

function DisplayModeToggle({
  displayMode,
  onChange,
}: {
  displayMode: DomainShiftDisplayMode;
  onChange: (displayMode: DomainShiftDisplayMode) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="block text-sm font-medium text-gray-700">Cell metric</legend>
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
        {([
          ['winRate', 'Strong%'],
          ['shift', 'Shift vs avg'],
        ] as const).map(([mode, label]) => (
          <Button
            key={mode}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={displayMode === mode}
            onClick={() => onChange(mode)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              displayMode === mode
                ? 'bg-white text-teal-800 shadow-sm ring-1 ring-teal-200'
                : 'text-gray-600 hover:text-gray-900',
            )}
          >
            {label}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

function LoadingCell() {
  return (
    <div className="flex items-center justify-center py-1">
      <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
    </div>
  );
}

function DomainHeader({
  domain,
  state,
  selected,
  sort,
  onSort,
}: {
  domain: DomainOption;
  state: DomainQueryState | undefined;
  selected: boolean;
  sort: BreakoutSort;
  onSort: (sort: BreakoutSort) => void;
}) {
  const sortKey: BreakoutSortKey = `domain:${domain.id}`;
  const active = sort.key === sortKey;
  const nextSort = getNextSort(sort, sortKey);
  const isLoading = state == null || state.status === 'loading';
  const isError = state?.status === 'error';

  return (
    <th
      aria-sort={active ? getSortDirectionLabel(sort.direction) : 'none'}
      className={cn(
        'border-b border-gray-200 px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide',
        selected ? 'bg-teal-50 text-teal-900' : 'bg-white text-gray-500',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          'inline-flex w-full items-center justify-center gap-1 rounded px-1 py-1 hover:bg-gray-100 hover:text-gray-900',
          selected && 'bg-teal-50 text-teal-900 hover:bg-teal-100',
          isError && 'bg-rose-50 text-rose-900 hover:bg-rose-100',
        )}
        onClick={() => onSort(nextSort)}
        aria-label={`Sort by ${domain.name} ${nextSort.direction === 'asc' ? 'ascending' : 'descending'}`}
        title={isError ? state?.error ?? 'Failed to load domain data' : domain.name}
      >
        <span className={cn('truncate', selected && 'font-semibold', isError && 'font-semibold')}>{domain.name}</span>
        {isError ? (
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" />
        ) : isLoading ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-teal-500" />
        ) : (
          <span aria-hidden="true" className={cn('text-gray-400', active && 'text-teal-700')}>
            {active ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}
          </span>
        )}
      </Button>
      {selected && (
        <div className="mt-1 text-[11px] font-medium text-teal-700">
          Highlighted
        </div>
      )}
      {isError && (
        <div className="mt-1 text-[11px] font-medium text-rose-600">
          Error
        </div>
      )}
      {isLoading && !isError && (
        <div className="mt-1 text-[11px] font-medium text-gray-400">
          Loading
        </div>
      )}
    </th>
  );
}

export function ConfidenceDomainBreakout({
  domains,
  signature,
  selectedModelIds,
  defaultModelIds,
  selectedDomainId,
}: ConfidenceDomainBreakoutProps) {
  const client = useClient();
  const [displayMode, setDisplayMode] = useState<DomainShiftDisplayMode>('winRate');
  const [sort, setSort] = useState<BreakoutSort>(DEFAULT_SORT);
  const [domainStates, setDomainStates] = useState<Record<string, DomainQueryState>>({});
  const effectiveModelIds = selectedModelIds ?? defaultModelIds;
  const selectedModelSet = useMemo(() => new Set(effectiveModelIds), [effectiveModelIds]);
  const noModelsSelected = effectiveModelIds.length === 0;

  useEffect(() => {
    let cancelled = false;

    if (domains.length === 0) {
      setDomainStates({});
      return () => {
        cancelled = true;
      };
    }

    setDomainStates(() => {
      const next: Record<string, DomainQueryState> = {};
      for (const domain of domains) {
        next[domain.id] = { status: 'loading', models: [], error: null };
      }
      return next;
    });

    void Promise.allSettled(
      domains.map(async (domain) => {
        try {
          const result = await client
            .query<ModelsConfidenceQueryResult, ConfidenceDomainBreakoutModelsConfidenceQueryVariables>(
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
  }, [client, domains, signature]);

  const rows = useMemo<RowData[]>(() => {
    return VALUES.map((valueKey) => {
      let pooledStrong = 0;
      let pooledLean = 0;
      const cells = new Map<string, CellData>();

      for (const domain of domains) {
        const state = domainStates[domain.id];
        if (state == null || state.status === 'loading') {
          cells.set(domain.id, {
            strongCount: 0,
            leanCount: 0,
            strongPct: null,
            shift: null,
            status: 'loading',
            error: null,
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
            error: state.error,
          });
          continue;
        }

        const cell = buildCell(state.models, selectedModelSet, valueKey);
        pooledStrong += cell.strongCount;
        pooledLean += cell.leanCount;
        cells.set(domain.id, cell);
      }

      const total = pooledStrong + pooledLean;
      const averageStrongPct = total > 0 ? (pooledStrong / total) * 100 : null;

      for (const [domainId, cell] of cells.entries()) {
        if (cell.status !== 'ready') continue;
        cells.set(domainId, {
          ...cell,
          shift: cell.strongPct != null && averageStrongPct != null ? cell.strongPct - averageStrongPct : null,
        });
      }

      return {
        valueKey,
        valueLabel: VALUE_LABELS[valueKey as keyof typeof VALUE_LABELS] ?? formatFullSchwartzValueName(valueKey as Parameters<typeof formatFullSchwartzValueName>[0]),
        averageStrongPct,
        cells,
      };
    });
  }, [domains, domainStates, selectedModelSet]);

  const sortedRows = useMemo(
    () => sortRows(rows, sort, displayMode),
    [displayMode, rows, sort],
  );

  const hasLoadingDomain = domains.some((domain) => domainStates[domain.id]?.status === 'loading' || domainStates[domain.id] == null);
  const hasErrorDomain = domains.some((domain) => domainStates[domain.id]?.status === 'error');
  const selectedDomainLabel = selectedDomainId == null || selectedDomainId === ''
    ? 'All domains'
    : domains.find((domain) => domain.id === selectedDomainId)?.name ?? selectedDomainId;

  if (domains.length === 0) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-600">No domains are available yet.</p>
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
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-gray-900">Confidence by domain</h2>
          <p className="max-w-3xl text-sm text-gray-600">
            Strong% is count-weighted across the selected models. Use the toggle to switch between raw Strong%
            and domain shift versus each value&apos;s cross-domain average.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <span className="font-semibold text-gray-800">Signature:</span> {signature}
          {hasErrorDomain && (
            <>
              {' '}
              <span className="font-semibold text-rose-700">Some domains failed</span>
            </>
          )}
          {hasLoadingDomain && !hasErrorDomain && (
            <>
              {' '}
              <span className="font-semibold text-gray-700">Loading domains</span>
            </>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <DisplayModeToggle displayMode={displayMode} onChange={setDisplayMode} />
        <div className="text-xs text-gray-500">
          Selected domain: {selectedDomainLabel}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[980px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <SortableHeader
                label="Value"
                sortKey="value"
                sort={sort}
                onSort={setSort}
                align="left"
                className="sticky left-0 top-0 z-30 w-[240px] min-w-[240px] bg-white text-left"
              />
              <SortableHeader
                label="Avg"
                sortKey="average"
                sort={sort}
                onSort={setSort}
                align="right"
                className="sticky top-0 z-20 w-[96px] min-w-[96px] border-l border-gray-200 bg-white"
              />
              {domains.map((domain) => (
                <DomainHeader
                  key={domain.id}
                  domain={domain}
                  state={domainStates[domain.id]}
                  selected={selectedDomainId === domain.id}
                  sort={sort}
                  onSort={setSort}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const averageTone = row.averageStrongPct == null ? 'bg-gray-50 text-gray-400 border-gray-100' : getWinRateTone(row.averageStrongPct);
              return (
                <tr key={row.valueKey} className="hover:bg-gray-50/40">
                  <th
                    className="sticky left-0 z-20 border-b border-gray-100 bg-white px-3 py-2 text-left align-middle font-medium text-gray-800"
                    title={formatFullSchwartzValueName(row.valueKey as Parameters<typeof formatFullSchwartzValueName>[0])}
                  >
                    <div className="max-w-[220px] truncate">{row.valueLabel}</div>
                  </th>
                  <td
                    className={cn(
                      'sticky left-[240px] z-10 border-b border-gray-100 px-2 py-2 text-center tabular-nums',
                      averageTone,
                    )}
                    title={`Average strong% for ${row.valueLabel}`}
                  >
                    {formatPercent(row.averageStrongPct)}
                  </td>
                  {domains.map((domain) => {
                    const cell = row.cells.get(domain.id);
                    const selected = selectedDomainId === domain.id;
                    const isLoading = cell == null || cell.status === 'loading';
                    const isError = cell?.status === 'error';
                    return (
                      <td
                        key={domain.id}
                        className={cn(
                          'border-b border-gray-100 px-2 py-2 text-center tabular-nums',
                          selected ? 'bg-teal-50/70 border-teal-100' : 'bg-white',
                          isLoading && 'bg-gray-50',
                        )}
                      >
                        {isLoading ? (
                          <LoadingCell />
                        ) : isError || cell == null ? (
                          <span className="inline-flex min-w-[64px] justify-center rounded-md border border-gray-100 bg-gray-50 px-2 py-1 text-sm text-gray-400">
                            —
                          </span>
                        ) : (
                          <span
                            className={cn(
                              'inline-flex min-w-[64px] justify-center rounded-md border px-2 py-1 text-sm font-semibold',
                              getDomainCellTone(cell, displayMode),
                              selected && 'ring-1 ring-inset ring-teal-200',
                            )}
                            title={
                              displayMode === 'shift'
                                ? `${row.valueLabel} in ${domain.name}: ${cell.shift == null ? '—' : formatPointShift(cell.shift)} vs avg`
                                : `${row.valueLabel} in ${domain.name}: ${formatPercent(cell.strongPct)} Strong%`
                            }
                          >
                            {formatDomainCellValue(cell, displayMode)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasErrorDomain && (
        <p className="mt-3 text-xs text-rose-600">
          One or more domain columns failed to load. Those cells are shown as em dashes.
        </p>
      )}
    </section>
  );
}

import { useMemo, useRef, useState } from 'react';
import type { ModelsAnalysisModelResult } from '../../api/operations/modelsAnalysis';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Loading } from '../ui/Loading';
import {
  buildDomainShiftHeatmap,
  DEFAULT_DOMAIN_SHIFT_SORT,
  formatEvidenceWeight,
  formatPercent,
  formatPointShift,
  getNextDomainShiftSort,
  type DomainShiftCell,
  type DomainShiftDisplayMode,
  type DomainShiftSort,
  type DomainShiftSortKey,
  sortHeatmapRows,
} from '../../pages/domainValueShiftHeatmapUtils';

type DomainShiftsReportSectionProps = {
  models: ModelsAnalysisModelResult[];
  selectedModelIds: string[];
  defaultModelIds: string[];
  fetching?: boolean;
  errorMessage?: string | null;
};

function getCellToneClass(shift: number): string {
  const clamped = Math.max(-25, Math.min(25, shift));
  const intensity = Math.abs(clamped) / 25;
  if (Math.abs(shift) < 0.5) {
    return 'border-gray-200 bg-gray-50 text-gray-700';
  }
  if (shift > 0) {
    return intensity > 0.66
      ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
      : intensity > 0.33
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-emerald-100 bg-emerald-50/60 text-emerald-700';
  }
  return intensity > 0.66
    ? 'border-rose-300 bg-rose-100 text-rose-900'
    : intensity > 0.33
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : 'border-rose-100 bg-rose-50/60 text-rose-700';
}

function getWinRateToneClass(winRate: number): string {
  if (winRate >= 75) return 'border-sky-300 bg-sky-100 text-sky-950';
  if (winRate >= 50) return 'border-sky-200 bg-sky-50 text-sky-900';
  if (winRate >= 25) return 'border-gray-200 bg-gray-50 text-gray-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function getSortDirectionLabel(direction: DomainShiftSort['direction']): 'ascending' | 'descending' {
  return direction === 'asc' ? 'ascending' : 'descending';
}

function getNextSortDirectionLabel(sort: DomainShiftSort, key: DomainShiftSortKey): 'ascending' | 'descending' {
  if (sort.key !== key) return key === 'value' ? 'ascending' : 'descending';
  return sort.direction === 'asc' ? 'descending' : 'ascending';
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
  sortKey: DomainShiftSortKey;
  sort: DomainShiftSort;
  onSort: (sort: DomainShiftSort) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
}) {
  const isActive = sort.key === sortKey;
  const nextDirection = getNextSortDirectionLabel(sort, sortKey);

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
        onClick={() => onSort(getNextDomainShiftSort(sort, sortKey))}
        className={cn(
          'w-full gap-1 rounded-none bg-transparent px-0 py-0 min-h-0 text-[11px] font-semibold uppercase tracking-wide text-gray-500 shadow-none transition-colors hover:bg-transparent hover:text-gray-900 focus:ring-0 focus:ring-offset-0',
          align === 'left' && 'justify-start text-left',
          align === 'center' && 'justify-center text-center',
          align === 'right' && 'justify-end text-right',
          isActive && 'text-teal-700',
        )}
        aria-label={`Sort by ${label} ${nextDirection}`}
      >
        <span className="whitespace-nowrap">{label}</span>
        {isActive && (
          <span aria-hidden="true" className="text-[11px] leading-none text-gray-400">
            {sort.direction === 'desc' ? '↑' : '↓'}
          </span>
        )}
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
          ['shift', 'Shift vs avg'],
          ['winRate', 'Raw win rate'],
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

function Cell({
  cell,
  valueLabel,
  displayMode,
  evidenceLabel,
}: {
  cell: DomainShiftCell | null;
  valueLabel: string;
  displayMode: DomainShiftDisplayMode;
  evidenceLabel: string;
}) {
  if (cell == null) {
    return <span className="inline-flex w-full justify-center text-xs font-semibold text-gray-400">n/a</span>;
  }

  const detail = `${valueLabel} in ${cell.domainName}: raw win rate ${formatPercent(cell.winRate)}; shift ${formatPointShift(cell.shift)} versus this value's equal-domain average; average ${formatPercent(cell.averageWinRate)}; ${evidenceLabel} ${formatEvidenceWeight(cell.evidenceWeight)}.`;
  const visibleValue = displayMode === 'shift' ? formatPointShift(cell.shift) : formatPercent(cell.winRate);

  return (
    <span className="inline-flex w-full justify-center text-xs font-semibold" title={detail} aria-label={detail}>
      {visibleValue}
    </span>
  );
}

export function DomainShiftsReportSection({
  models,
  selectedModelIds,
  defaultModelIds,
  fetching = false,
  errorMessage = null,
}: DomainShiftsReportSectionProps) {
  const [displayMode, setDisplayMode] = useState<DomainShiftDisplayMode>('shift');
  const [sort, setSort] = useState<DomainShiftSort>(DEFAULT_DOMAIN_SHIFT_SORT);
  const tableRef = useRef<HTMLDivElement>(null);

  const selectedModelIdSet = useMemo(() => new Set(selectedModelIds), [selectedModelIds]);
  const defaultModelIdSet = useMemo(() => new Set(defaultModelIds), [defaultModelIds]);
  const selectedModels = useMemo(
    () => (selectedModelIds.length === 0 ? [] : models.filter((model) => selectedModelIdSet.has(model.modelId))),
    [models, selectedModelIds.length, selectedModelIdSet],
  );
  const isDefaultSelection = useMemo(() => (
    selectedModels.length > 0
    && selectedModels.length === defaultModelIds.length
    && selectedModels.every((model) => defaultModelIdSet.has(model.modelId))
  ), [defaultModelIdSet, defaultModelIds.length, selectedModels]);

  const heatmap = useMemo(
    () => buildDomainShiftHeatmap(selectedModels),
    [selectedModels],
  );
  const sortedRows = useMemo(
    () => sortHeatmapRows(heatmap.rows, sort, displayMode),
    [displayMode, heatmap.rows, sort],
  );
  const selectedModelsLabel = useMemo(() => {
    if (selectedModels.length === 0) return 'No models selected';
    if (selectedModels.length === 1) return selectedModels[0]?.label ?? 'Selected model';
    return isDefaultSelection ? 'Default models' : `${selectedModels.length} selected models`;
  }, [isDefaultSelection, selectedModels]);

  if (errorMessage != null) {
    return <ErrorMessage message={`Failed to load domain shifts: ${errorMessage}`} />;
  }

  if (fetching && models.length === 0) {
    return <Loading size="lg" text="Loading domain shifts..." />;
  }

  if (models.length === 0) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-base font-semibold text-amber-950">No active models are available yet</h2>
        <p className="mt-2 text-sm text-amber-900">
          Create or activate models first, then reopen this report.
        </p>
      </section>
    );
  }

  if (selectedModels.length === 0) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-base font-semibold text-amber-950">Pick at least one model</h2>
        <p className="mt-2 text-sm text-amber-900">
          Use the Models picker above to choose the default set or your own subset.
        </p>
      </section>
    );
  }

  if (heatmap.eligibleDomainCount < 2) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-base font-semibold text-amber-950">More domain coverage needed</h2>
        <p className="mt-2 text-sm text-amber-900">
          Domain-shift analysis needs at least one value with eligible win-rate data in two or more domains for the
          selected model set. With only one domain for a value, the shift would be 0.0 pts by definition and would not
          be meaningful.
        </p>
      </section>
    );
  }

  const domainColumnWidth = heatmap.columns.length > 0 ? `${100 / heatmap.columns.length}%` : '100%';

  return (
    <section className="space-y-6 rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Models</p>
        <h2 className="text-2xl font-serif font-medium text-[#1A1A1A]">Domain Shifts</h2>
        <p className="max-w-3xl text-sm text-gray-600">
          Exploratory heatmap for domain-associated value shifts, using the current Win Rate filters above.
        </p>
      </div>

      <div ref={tableRef} className="space-y-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{selectedModelsLabel}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DisplayModeToggle displayMode={displayMode} onChange={setDisplayMode} />
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <span className="font-semibold text-gray-800">Metric:</span>{' '}
              {displayMode === 'shift' ? 'percentage-point shift, not percent change' : 'raw domain win rate'}
            </div>
            <CopyVisualButton targetRef={tableRef} label="domain shifts table" />
          </div>
        </div>

        <div className="overflow-x-auto rounded border border-gray-100 bg-white p-2">
          <table className="w-full table-auto border-collapse text-xs">
            <colgroup>
              <col className="w-max" />
              <col className="w-max" />
              {heatmap.columns.map((domain) => (
                <col key={domain.domainId} style={{ width: domainColumnWidth }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <SortableHeader
                  label="Value"
                  sortKey="value"
                  sort={sort}
                  onSort={setSort}
                  align="left"
                  className="border-r-2 border-gray-300"
                />
                <SortableHeader
                  label="Avg Win Rate"
                  sortKey="average"
                  sort={sort}
                  onSort={setSort}
                  align="right"
                  className="border-r-2 border-gray-300"
                />
                {heatmap.columns.map((domain) => {
                  const domainSortKey: DomainShiftSortKey = `domain:${domain.domainId}`;
                  return (
                    <SortableHeader
                      key={domain.domainId}
                      label={domain.domainName}
                      sortKey={domainSortKey}
                      sort={sort}
                      onSort={setSort}
                    />
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.valueKey} className="border-b border-gray-100">
                  <th
                    scope="row"
                    className="border-b border-r-2 border-gray-300 bg-white px-2 py-2 whitespace-nowrap text-left font-medium text-gray-900"
                  >
                    {row.valueLabel}
                  </th>
                  <td className="border-b border-r-2 border-gray-300 bg-white px-2 py-2 whitespace-nowrap text-right font-mono text-gray-700">
                    {formatPercent(row.averageWinRate)}
                    {row.averageMatchesPooled === false && (
                      <span
                        className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-sans text-amber-800"
                        title="Computed average differs from the API pooled win rate by more than the allowed tolerance."
                      >
                        check
                      </span>
                    )}
                  </td>
                  {heatmap.columns.map((domain) => {
                    const cell = row.cells.get(domain.domainId) ?? null;
                    const tdClassName = cn(
                      'border-b border-gray-100 px-2 py-2 text-center align-middle transition-colors',
                      cell == null
                        ? 'border-gray-100 bg-gray-50 text-gray-400'
                        : displayMode === 'shift'
                          ? getCellToneClass(cell.shift)
                          : getWinRateToneClass(cell.winRate),
                    );

                    return (
                      <td key={domain.domainId} className={tdClassName}>
                        <Cell
                          cell={cell}
                          valueLabel={row.valueLabel}
                          displayMode={displayMode}
                          evidenceLabel={isDefaultSelection ? 'average evidence vignettes' : 'evidence vignettes'}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

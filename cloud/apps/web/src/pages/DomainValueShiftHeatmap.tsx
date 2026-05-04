import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from 'urql';
import { MODELS_ANALYSIS_QUERY, type ModelsAnalysisQueryResult } from '../api/operations/modelsAnalysis';
import { AVAILABLE_SIGNATURES_QUERY, type AvailableSignaturesQueryResult } from '../api/operations/available-signatures';
import { LLM_MODELS_QUERY, type LlmModelsQueryResult } from '../api/operations/llm';
import { Button } from '../components/ui/Button';
import { CopyVisualButton } from '../components/ui/CopyVisualButton';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { Select } from '../components/ui/Select';
import { cn } from '../lib/utils';
import {
  ALL_MODELS_OPTION_VALUE,
  DEFAULT_DOMAIN_SHIFT_SORT,
  DEFAULT_DOMAIN_SHIFT_SIGNATURE,
  buildDomainShiftHeatmap,
  buildDomainShiftModelOptions,
  buildDomainShiftSignatureOptions,
  formatEvidenceWeight,
  formatPercent,
  formatPointShift,
  getDefaultDomainShiftSignature,
  getDefaultModelId,
  getNextDomainShiftSort,
  sortHeatmapRows,
  type DomainShiftCell,
  type DomainShiftDisplayMode,
  type DomainShiftSort,
  type DomainShiftSortKey,
} from './domainValueShiftHeatmapUtils';

const MAX_COLOR_SHIFT = 25;

export {
  ALL_MODELS_OPTION_VALUE,
  buildDomainShiftHeatmap,
  buildDomainShiftModelOptions,
  formatEvidenceWeight,
  formatPercent,
  formatPointShift,
  getDefaultDomainShiftSignature,
  getDefaultModelId,
  sortHeatmapRows,
} from './domainValueShiftHeatmapUtils';

function getCellToneClass(shift: number): string {
  const clamped = Math.max(-MAX_COLOR_SHIFT, Math.min(MAX_COLOR_SHIFT, shift));
  const intensity = Math.abs(clamped) / MAX_COLOR_SHIFT;
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

export function DomainValueShiftHeatmap() {
  const [{ data: signatureData, fetching: fetchingSignatures, error: signatureError }] = useQuery<AvailableSignaturesQueryResult>({
    query: AVAILABLE_SIGNATURES_QUERY,
    variables: {},
    requestPolicy: 'cache-and-network',
  });
  const [selectedSignature, setSelectedSignature] = useState<string>(DEFAULT_DOMAIN_SHIFT_SIGNATURE);
  const [{ data: llmModelsData }] = useQuery<LlmModelsQueryResult>({
    query: LLM_MODELS_QUERY,
    variables: { status: 'ACTIVE' },
    requestPolicy: 'cache-and-network',
  });
  const [{ data, fetching, error }] = useQuery<ModelsAnalysisQueryResult>({
    query: MODELS_ANALYSIS_QUERY,
    variables: { signature: selectedSignature },
    requestPolicy: 'cache-and-network',
  });
  const availableSignatures = useMemo(
    () => signatureData?.availableSignatures.map((entry) => entry.signature) ?? [],
    [signatureData],
  );
  const signatureOptions = useMemo(
    () => buildDomainShiftSignatureOptions(availableSignatures),
    [availableSignatures],
  );
  const models = useMemo(() => data?.modelsAnalysis.models ?? [], [data]);
  const defaultModelIds = useMemo(
    () => new Set((llmModelsData?.llmModels ?? []).filter((model) => model.isDefault).map((model) => model.modelId)),
    [llmModelsData],
  );
  const [selectedModelId, setSelectedModelId] = useState<string>(ALL_MODELS_OPTION_VALUE);
  const [displayMode, setDisplayMode] = useState<DomainShiftDisplayMode>('shift');
  const [sort, setSort] = useState<DomainShiftSort>(DEFAULT_DOMAIN_SHIFT_SORT);

  useEffect(() => {
    const nextSignature = getDefaultDomainShiftSignature(availableSignatures, selectedSignature);
    if (nextSignature !== selectedSignature) {
      setSelectedSignature(nextSignature);
    }
  }, [availableSignatures, selectedSignature]);

  useEffect(() => {
    const nextModelId = getDefaultModelId(models, selectedModelId);
    if (nextModelId !== selectedModelId) {
      setSelectedModelId(nextModelId);
    }
  }, [models, selectedModelId]);

  const defaultModels = useMemo(
    () => models.filter((model) => defaultModelIds.has(model.modelId)),
    [models, defaultModelIds],
  );
  const selectedModel = selectedModelId === ALL_MODELS_OPTION_VALUE
    ? null
    : models.find((model) => model.modelId === selectedModelId) ?? null;
  const heatmap = useMemo(
    () => buildDomainShiftHeatmap(selectedModelId === ALL_MODELS_OPTION_VALUE ? defaultModels : selectedModel),
    [defaultModels, selectedModel, selectedModelId],
  );
  const sortedRows = useMemo(
    () => sortHeatmapRows(heatmap.rows, sort, displayMode),
    [heatmap.rows, sort, displayMode],
  );
  const modelOptions = useMemo(
    () => buildDomainShiftModelOptions(models, defaultModelIds),
    [defaultModelIds, models],
  );
  const domainColumnWidth = heatmap.columns.length > 0 ? `${100 / heatmap.columns.length}%` : '100%';
  const isAllModels = selectedModelId === ALL_MODELS_OPTION_VALUE;
  const loading = fetching && data == null;
  const tableRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Models</p>
        <p className="max-w-3xl text-sm text-gray-600">
          Exploratory heatmap for domain-associated value shifts. Toggle between percentage-point shifts and
          straight domain win rates, then click any column header to sort.
        </p>
      </div>

      {error != null && (
        <ErrorMessage message={`Failed to load domain shifts: ${error.message}`} />
      )}
      {signatureError != null && (
        <ErrorMessage message={`Failed to load signature options: ${signatureError.message}`} />
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
        <div className="flex flex-wrap items-end gap-5">
          <div className="min-w-[260px] max-w-sm flex-1">
            <Select
              label="Model"
              options={modelOptions}
              value={selectedModelId}
              onChange={setSelectedModelId}
              placeholder={loading ? 'Loading models...' : 'Select a model'}
              disabled={loading || models.length === 0}
            />
          </div>
          <div className="min-w-[240px] max-w-xs flex-1">
            <Select
              label="Signature"
              options={signatureOptions}
              value={selectedSignature}
              onChange={setSelectedSignature}
              placeholder={fetchingSignatures && signatureData == null ? 'Loading signatures...' : 'Select a signature'}
              disabled={fetchingSignatures && signatureData == null}
            />
          </div>
          <DisplayModeToggle displayMode={displayMode} onChange={setDisplayMode} />
        </div>
      </section>

      {loading && <Loading size="lg" text="Loading domain shifts..." />}

      {!loading && models.length === 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-600">No models with analysis data are available yet.</p>
        </section>
      )}

      {!loading && models.length > 0 && heatmap.eligibleDomainCount < 2 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-base font-semibold text-amber-950">More domain coverage needed</h2>
          <p className="mt-2 text-sm text-amber-900">
            Domain-shift analysis needs at least one value with eligible win-rate data in two or more domains for
            the selected model set. With only one domain for a value, the shift would be 0.0 pts by definition and would
            not be meaningful.
          </p>
        </section>
      )}

      {!loading && models.length > 0 && heatmap.eligibleDomainCount >= 2 && (
        <section ref={tableRef} className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{isAllModels ? 'Default models' : selectedModel?.label ?? 'Default models'}</h2>
            </div>
            <div className="flex items-center gap-2">
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
                    <th scope="row" className="border-b border-r-2 border-gray-300 bg-white px-2 py-2 whitespace-nowrap text-left font-medium text-gray-900">
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
                            evidenceLabel={isAllModels ? 'average evidence vignettes' : 'evidence vignettes'}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

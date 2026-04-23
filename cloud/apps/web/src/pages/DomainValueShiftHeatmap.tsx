import { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'urql';
import {
  MODELS_ANALYSIS_QUERY,
  type ModelsAnalysisDomainBreakdown,
  type ModelsAnalysisModelResult,
  type ModelsAnalysisQueryResult,
  type ModelsAnalysisValueResult,
} from '../api/operations/modelsAnalysis';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { Select } from '../components/ui/Select';
import { VALUE_LABELS, VALUES, type ValueKey } from '../data/domainAnalysisData';

const AVERAGE_PARITY_TOLERANCE = 0.05;
const MAX_COLOR_SHIFT = 25;

export type DomainShiftColumn = {
  domainId: string;
  domainName: string;
};

export type DomainShiftCell = {
  domainId: string;
  domainName: string;
  winRate: number;
  averageWinRate: number;
  shift: number;
  evidenceWeight: number | null;
};

export type DomainShiftRow = {
  valueKey: string;
  valueLabel: string;
  pooledWinRate: number | null;
  averageWinRate: number | null;
  averageMatchesPooled: boolean | null;
  comparableDomainCount: number;
  cells: Map<string, DomainShiftCell>;
};

export type DomainShiftHeatmap = {
  columns: DomainShiftColumn[];
  rows: DomainShiftRow[];
  eligibleDomainCount: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValueKey(value: string): value is ValueKey {
  return (VALUES as string[]).includes(value);
}

function formatValueLabel(valueKey: string): string {
  return isValueKey(valueKey) ? VALUE_LABELS[valueKey] : valueKey;
}

export function formatPointShift(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  const rounded = Math.round(value);
  if (rounded === 0) return '0 pts';
  return `${rounded > 0 ? '+' : ''}${rounded} pts`;
}

export function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  return `${Math.round(value)}%`;
}

export function formatEvidenceWeight(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—';
  return `${Math.round(value)}`;
}

export function getDefaultModelId(models: ModelsAnalysisModelResult[], currentModelId: string | null): string | null {
  const sorted = [...models].sort((left, right) => left.label.localeCompare(right.label));
  if (currentModelId != null && sorted.some((model) => model.modelId === currentModelId)) {
    return currentModelId;
  }
  return sorted[0]?.modelId ?? null;
}

function sortValueKeys(valueKeys: Set<string>): string[] {
  const canonical = VALUES.filter((valueKey) => valueKeys.has(valueKey));
  const unknown = [...valueKeys]
    .filter((valueKey) => !isValueKey(valueKey))
    .sort((left, right) => left.localeCompare(right));
  return [...canonical, ...unknown];
}

function eligibleDomainsForValue(value: ModelsAnalysisValueResult): ModelsAnalysisDomainBreakdown[] {
  return value.domains.filter((domain) => isFiniteNumber(domain.winRate));
}

function computeAverage(domains: ModelsAnalysisDomainBreakdown[]): number | null {
  if (domains.length === 0) return null;
  const total = domains.reduce((sum, domain) => sum + domain.winRate, 0);
  return total / domains.length;
}

export function buildDomainShiftHeatmap(model: ModelsAnalysisModelResult | null): DomainShiftHeatmap {
  if (model == null) {
    return { columns: [], rows: [], eligibleDomainCount: 0 };
  }

  const valueKeys = new Set<string>(VALUES);

  for (const value of model.values) {
    valueKeys.add(value.valueKey);
  }

  const rowsByValue = new Map(model.values.map((value) => [value.valueKey, value]));
  const domainById = new Map<string, DomainShiftColumn>();
  const rows = sortValueKeys(valueKeys).map((valueKey) => {
    const value = rowsByValue.get(valueKey);
    const eligibleDomains = value == null ? [] : eligibleDomainsForValue(value);
    const comparableDomainCount = eligibleDomains.length;
    const averageWinRate = comparableDomainCount >= 2 ? computeAverage(eligibleDomains) : null;
    const cells = new Map<string, DomainShiftCell>();

    if (value != null && averageWinRate != null) {
      for (const domain of eligibleDomains) {
        domainById.set(domain.domainId, {
          domainId: domain.domainId,
          domainName: domain.domainName,
        });
        cells.set(domain.domainId, {
          domainId: domain.domainId,
          domainName: domain.domainName,
          winRate: domain.winRate,
          averageWinRate,
          shift: domain.winRate - averageWinRate,
          evidenceWeight: isFiniteNumber(domain.evidenceWeight) ? domain.evidenceWeight : null,
        });
      }
    }

    return {
      valueKey,
      valueLabel: formatValueLabel(valueKey),
      pooledWinRate: value?.pooledWinRate ?? null,
      averageWinRate,
      averageMatchesPooled: averageWinRate == null || value?.pooledWinRate == null
        ? null
        : Math.abs(averageWinRate - value.pooledWinRate) <= AVERAGE_PARITY_TOLERANCE,
      comparableDomainCount,
      cells,
    };
  });
  const columns = [...domainById.values()].sort((left, right) => left.domainName.localeCompare(right.domainName));

  return {
    columns,
    rows,
    eligibleDomainCount: columns.length,
  };
}

function getCellTone(shift: number): string {
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

function Cell({ cell, valueLabel }: { cell: DomainShiftCell | null; valueLabel: string }) {
  if (cell == null) {
    return (
      <span className="inline-flex min-w-[82px] justify-center rounded-md border border-gray-100 bg-gray-50 px-2 py-1 text-sm text-gray-400">
        n/a
      </span>
    );
  }

  const detail = `${valueLabel} in ${cell.domainName}: ${formatPointShift(cell.shift)} versus this value's equal-domain average. Domain win rate ${formatPercent(cell.winRate)}; average ${formatPercent(cell.averageWinRate)}; evidence vignettes ${formatEvidenceWeight(cell.evidenceWeight)}.`;

  return (
    <span
      className={`inline-flex min-w-[82px] justify-center rounded-md border px-2 py-1 text-sm font-semibold ${getCellTone(cell.shift)}`}
      title={detail}
      aria-label={detail}
    >
      {formatPointShift(cell.shift)}
    </span>
  );
}

export function DomainValueShiftHeatmap() {
  const [{ data, fetching, error }] = useQuery<ModelsAnalysisQueryResult>({
    query: MODELS_ANALYSIS_QUERY,
    variables: {},
    requestPolicy: 'cache-and-network',
  });
  const models = useMemo(
    () => [...(data?.modelsAnalysis.models ?? [])].sort((left, right) => left.label.localeCompare(right.label)),
    [data],
  );
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  useEffect(() => {
    const nextModelId = getDefaultModelId(models, selectedModelId);
    if (nextModelId !== selectedModelId) {
      setSelectedModelId(nextModelId);
    }
  }, [models, selectedModelId]);

  const selectedModel = selectedModelId == null
    ? null
    : models.find((model) => model.modelId === selectedModelId) ?? null;
  const heatmap = useMemo(() => buildDomainShiftHeatmap(selectedModel), [selectedModel]);
  const modelOptions = models.map((model) => ({ value: model.modelId, label: model.label }));
  const loading = fetching && data == null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Models</p>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Domain Shifts by Value</h1>
        <p className="max-w-3xl text-sm text-gray-600">
          Exploratory heatmap for domain-associated value shifts. Each cell shows a percentage-point shift
          versus the selected model&apos;s equal-domain average for that value.
        </p>
      </div>

      {error != null && (
        <ErrorMessage message={`Failed to load domain shifts: ${error.message}`} />
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
        <div className="max-w-sm">
          <Select
            label="Model"
            options={modelOptions}
            value={selectedModelId ?? undefined}
            onChange={setSelectedModelId}
            placeholder={loading ? 'Loading models...' : 'Select a model'}
            disabled={loading || modelOptions.length === 0}
          />
        </div>
      </section>

      {loading && <Loading size="lg" text="Loading domain shifts..." />}

      {!loading && models.length === 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-600">No models with analysis data are available yet.</p>
        </section>
      )}

      {!loading && models.length > 0 && selectedModel != null && heatmap.eligibleDomainCount < 2 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-base font-semibold text-amber-950">More domain coverage needed</h2>
          <p className="mt-2 text-sm text-amber-900">
            Domain-shift analysis needs at least one value with eligible win-rate data in two or more domains for
            the selected model. With only one domain for a value, the shift would be 0 pts by definition and would
            not be meaningful.
          </p>
        </section>
      )}

      {!loading && selectedModel != null && heatmap.eligibleDomainCount >= 2 && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{selectedModel.label}</h2>
              <p className="text-sm text-gray-600">
                Values are rows. Domains are columns. Green means above this model&apos;s usual win rate for that value;
                red means below. Evidence counts are shown in each cell detail.
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <span className="font-semibold text-gray-800">Metric:</span> percentage-point shift, not percent change
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[900px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 border-b border-gray-200 bg-white px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Value
                  </th>
                  {heatmap.columns.map((domain) => (
                    <th
                      key={domain.domainId}
                      className="border-b border-gray-200 bg-white px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      {domain.domainName}
                    </th>
                  ))}
                  <th className="border-b border-gray-200 bg-white px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Avg
                  </th>
                </tr>
              </thead>
              <tbody>
                {heatmap.rows.map((row) => (
                  <tr key={row.valueKey}>
                    <th className="sticky left-0 z-10 border-b border-gray-100 bg-white px-3 py-3 text-left font-medium text-gray-900">
                      {row.valueLabel}
                    </th>
                    {heatmap.columns.map((domain) => (
                      <td key={domain.domainId} className="border-b border-gray-100 px-2 py-2 text-center">
                        <Cell cell={row.cells.get(domain.domainId) ?? null} valueLabel={row.valueLabel} />
                      </td>
                    ))}
                    <td className="border-b border-gray-100 px-3 py-3 text-right font-mono text-gray-700">
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

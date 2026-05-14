import { useMemo, useState } from 'react';
import type { ModelsStabilityModelResult, ModelsStabilitySkippedVignette } from '../../api/operations/modelsStability';
import { Button } from '../ui/Button';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Loading } from '../ui/Loading';

type SortKey =
  | 'label'
  | 'qualifyingVignetteCount'
  | 'avgDirectionalAgreement'
  | 'avgExactAgreement';
type SortDir = 'asc' | 'desc';
type Sort = { key: SortKey; dir: SortDir };

const DEFAULT_SORT: Sort = { key: 'avgDirectionalAgreement', dir: 'desc' };

type WinRateStabilitySectionProps = {
  models: ModelsStabilityModelResult[];
  skippedVignettes: ModelsStabilitySkippedVignette[];
  fetching: boolean;
  errorMessage: string | null;
  winRateMode?: 'all' | 'exc-neutral';
};

function pct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function getSortValue(model: ModelsStabilityModelResult, key: SortKey): string | number | null {
  switch (key) {
    case 'label': return model.label;
    case 'qualifyingVignetteCount': return model.qualifyingVignetteCount;
    case 'avgDirectionalAgreement': return model.avgDirectionalAgreement ?? null;
    case 'avgExactAgreement': return model.avgExactAgreement ?? null;
  }
}

function sortModels(models: ModelsStabilityModelResult[], sort: Sort): ModelsStabilityModelResult[] {
  return [...models].sort((a, b) => {
    const va = getSortValue(a, sort.key);
    const vb = getSortValue(b, sort.key);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'string' && typeof vb === 'string') {
      return sort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    const diff = (va as number) - (vb as number);
    return sort.dir === 'asc' ? diff : -diff;
  });
}

function ColHeader({
  label,
  tooltip,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  tooltip: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (sort: Sort) => void;
}) {
  const isActive = sort.key === sortKey;
  const nextDir: SortDir = isActive && sort.dir === 'desc' ? 'asc' : 'desc';
  return (
    <th scope="col" className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        title={tooltip}
        onClick={() => onSort({ key: sortKey, dir: nextDir })}
        className={`flex w-full items-center justify-end gap-0.5 rounded-none bg-transparent px-0 py-0 min-h-0 text-[11px] font-semibold uppercase tracking-wide shadow-none hover:bg-transparent focus:ring-0 focus:ring-offset-0 ${
          isActive ? 'text-teal-700' : 'text-gray-500 hover:text-gray-900'
        }`}
        aria-label={`Sort by ${label} ${nextDir === 'desc' ? 'descending' : 'ascending'}`}
      >
        <span className="whitespace-nowrap">{label}</span>
        {isActive && (
          <span aria-hidden="true" className="text-[11px] leading-none text-gray-400">
            {sort.dir === 'desc' ? '↑' : '↓'}
          </span>
        )}
      </Button>
    </th>
  );
}

export function WinRateStabilitySection({
  models,
  skippedVignettes,
  fetching,
  errorMessage,
  winRateMode,
}: WinRateStabilitySectionProps) {
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const sorted = useMemo(() => sortModels(models, sort), [models, sort]);

  if (errorMessage != null) {
    return <ErrorMessage message={`Failed to load response consistency: ${errorMessage}`} />;
  }

  if (fetching && models.length === 0) {
    return <Loading size="lg" text="Loading response consistency..." />;
  }

  if (models.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-gray-900">Response Consistency by Model</h2>
        {winRateMode === 'exc-neutral' && (
          <p className="text-sm text-amber-700">
            Consistency metrics include neutral outcomes and are not affected by the Exc. neutral mode.
          </p>
        )}
      </div>

      {skippedVignettes.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <p className="font-medium">
            {skippedVignettes.length} vignette{skippedVignettes.length === 1 ? '' : 's'} skipped
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {skippedVignettes.map((v) => (
              <li key={`${v.definitionId}::${v.reason}`}>
                {v.vignetteName} — {v.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded border border-gray-100">
        <table className="w-full table-auto border-collapse text-xs">
          <caption className="sr-only">Response consistency by model</caption>
          <thead>
            <tr className="border-b border-gray-200">
              <th
                scope="col"
                className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500"
              >
                Model
              </th>
              <ColHeader
                label="Direction Agree"
                tooltip="Share of responses choosing the same side (A or B) across repeated runs"
                sortKey="avgDirectionalAgreement"
                sort={sort}
                onSort={setSort}
              />
              <ColHeader
                label="Exact Agree"
                tooltip="Share of responses matching on both direction and strength (strongly vs. somewhat)"
                sortKey="avgExactAgreement"
                sort={sort}
                onSort={setSort}
              />
              <ColHeader
                label="Vignettes (N)"
                tooltip="Number of qualifying vignettes with sufficient repeat data"
                sortKey="qualifyingVignetteCount"
                sort={sort}
                onSort={setSort}
              />
            </tr>
          </thead>
          <tbody>
            {sorted.map((model) => {
              const hasData = model.qualifyingVignetteCount > 0;
              const isLowN = hasData && model.qualifyingVignetteCount < 5;
              return (
                <tr key={model.modelId} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="whitespace-nowrap px-2 py-2 font-medium text-gray-900">{model.label}</td>
                  <td className="px-2 py-2 text-right font-mono text-gray-700">
                    {pct(model.avgDirectionalAgreement)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-gray-700">
                    {pct(model.avgExactAgreement)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-gray-700">
                    {model.qualifyingVignetteCount}
                    {isLowN && (
                      <span
                        className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-sans text-amber-800"
                        title="Low vignette count — results may be unreliable"
                      >
                        Low N
                      </span>
                    )}
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

import { useMemo, useState } from 'react';
import type { DomainAnalysisModel } from '../../api/operations/domainAnalysis';
import { Button } from '../ui/Button';

type SortKey = 'label' | 'neutralRate' | 'neutralTrials' | 'totalTrials';
type SortDir = 'asc' | 'desc';
type Sort = { key: SortKey; dir: SortDir };

const DEFAULT_SORT: Sort = { key: 'neutralRate', dir: 'desc' };

type NeutralRateRow = {
  model: string;
  label: string;
  neutralTrials: number;
  totalTrials: number;
  neutralRate: number | null;
};

type NeutralRateSectionProps = {
  models: DomainAnalysisModel[];
};

const countFormatter = new Intl.NumberFormat('en-US');

function pct(value: number | null): string {
  if (value == null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function count(value: number): string {
  return countFormatter.format(value);
}

// `neutralRate` is the condition-weighted rate computed by the API (per-condition
// neutral share, averaged per vignette, then across vignettes) — consistent with
// how every other rate on the Win Rate page is aggregated. The trial counts are
// derived from the per-value `neutral` / `totalComparisons` sums: each transcript
// is counted once per value in its pair, so both sums are double-counted and
// halving them recovers the unique trial totals.
function buildRow(model: DomainAnalysisModel): NeutralRateRow {
  let neutralSum = 0;
  let totalSum = 0;
  for (const value of model.values) {
    neutralSum += value.neutral;
    totalSum += value.totalComparisons;
  }
  return {
    model: model.model,
    label: model.label,
    neutralTrials: neutralSum / 2,
    totalTrials: totalSum / 2,
    neutralRate: model.neutralRate ?? null,
  };
}

function getSortValue(row: NeutralRateRow, key: SortKey): string | number | null {
  switch (key) {
    case 'label': return row.label;
    case 'neutralRate': return row.neutralRate;
    case 'neutralTrials': return row.neutralTrials;
    case 'totalTrials': return row.totalTrials;
  }
}

function sortRows(rows: NeutralRateRow[], sort: Sort): NeutralRateRow[] {
  return [...rows].sort((a, b) => {
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
  className,
}: {
  label: string;
  tooltip: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (sort: Sort) => void;
  className?: string;
}) {
  const isActive = sort.key === sortKey;
  const nextDir: SortDir = isActive && sort.dir === 'desc' ? 'asc' : 'desc';
  return (
    <th
      className={`px-2 py-2 text-right font-medium ${className ?? ''}`}
      aria-sort={isActive ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        title={tooltip}
        aria-label={`Sort by ${label} ${nextDir === 'desc' ? 'descending' : 'ascending'}`}
        className="h-auto min-h-0 !p-0 text-xs font-medium text-gray-600 hover:text-gray-900"
        onClick={() => onSort({ key: sortKey, dir: nextDir })}
      >
        {label} {isActive ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
      </Button>
    </th>
  );
}

export function NeutralRateSection({ models }: NeutralRateSectionProps) {
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);

  const rows = useMemo(() => models.map(buildRow), [models]);
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);

  const overall = useMemo(() => {
    const neutralTrials = rows.reduce((sum, row) => sum + row.neutralTrials, 0);
    const totalTrials = rows.reduce((sum, row) => sum + row.totalTrials, 0);
    // Equal-weight mean of the per-model rates — each model already
    // condition-weighted — rather than re-pooling trial counts.
    const modelRates = rows
      .map((row) => row.neutralRate)
      .filter((rate): rate is number => rate !== null);
    return {
      neutralTrials,
      totalTrials,
      neutralRate: modelRates.length > 0
        ? modelRates.reduce((sum, rate) => sum + rate, 0) / modelRates.length
        : null,
    };
  }, [rows]);

  if (models.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3">
        <h2 className="text-base font-medium text-gray-900">Neutral / Unsure Rate by Model</h2>
        <p className="text-sm text-gray-600">
          How often the model declined to favor either value and answered Neutral / Unsure. Each
          condition is weighted equally, like every other rate on this page.
        </p>
      </div>

      <div className="rounded border border-gray-100 bg-white p-2">
        <div className="overflow-x-auto">
          <table className="w-full table-auto text-xs">
            <caption className="sr-only">Neutral / Unsure rate by model</caption>
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th
                  className="border-r-2 border-gray-300 px-2 py-2 text-left font-medium"
                  aria-sort={
                    sort.key === 'label' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                  }
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto min-h-0 !p-0 text-xs font-medium text-gray-600 hover:text-gray-900"
                    onClick={() =>
                      setSort((prev) =>
                        prev.key === 'label'
                          ? { key: 'label', dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                          : { key: 'label', dir: 'asc' },
                      )
                    }
                  >
                    Model {sort.key === 'label' ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
                  </Button>
                </th>
                <ColHeader
                  label="Neutral Rate"
                  tooltip="Share of scored trials answered Neutral / Unsure instead of favoring either value"
                  sortKey="neutralRate"
                  sort={sort}
                  onSort={setSort}
                />
                <ColHeader
                  label="Neutral (N)"
                  tooltip="Number of trials answered Neutral / Unsure"
                  sortKey="neutralTrials"
                  sort={sort}
                  onSort={setSort}
                />
                <ColHeader
                  label="Trials (N)"
                  tooltip="Total scored trials analyzed for this model"
                  sortKey="totalTrials"
                  sort={sort}
                  onSort={setSort}
                  className="border-l-2 border-gray-300"
                />
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.model} className="border-b border-gray-100">
                  <td className="border-r-2 border-gray-300 px-2 py-2">
                    <div className="font-medium text-gray-900">{row.label}</div>
                  </td>
                  <td className="px-2 py-2 text-right text-xs text-gray-800 tabular-nums">
                    {pct(row.neutralRate)}
                  </td>
                  <td className="px-2 py-2 text-right text-xs text-gray-800 tabular-nums">
                    {count(row.neutralTrials)}
                  </td>
                  <td className="border-l-2 border-gray-300 px-2 py-2 text-right text-xs text-gray-800 tabular-nums">
                    {count(row.totalTrials)}
                  </td>
                </tr>
              ))}
              {models.length > 1 && (
                <tr className="border-t-2 border-gray-300">
                  <td className="border-r-2 border-gray-300 px-2 py-2">
                    <div className="text-xs font-medium italic text-gray-500">All models (avg)</div>
                  </td>
                  <td className="px-2 py-2 text-right text-xs text-gray-700 tabular-nums">
                    {pct(overall.neutralRate)}
                  </td>
                  <td className="px-2 py-2 text-right text-xs text-gray-700 tabular-nums">
                    {count(overall.neutralTrials)}
                  </td>
                  <td className="border-l-2 border-gray-300 px-2 py-2 text-right text-xs text-gray-700 tabular-nums">
                    {count(overall.totalTrials)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

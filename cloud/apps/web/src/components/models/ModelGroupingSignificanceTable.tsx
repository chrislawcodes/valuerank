import { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';
import { cn } from '../../lib/utils';
import type { ModelGroupingSignificanceRow } from '../../api/operations/modelGroupingSignificance';

type SortKey =
  | 'modelA'
  | 'modelB'
  | 'agreementRate'
  | 'discordantAtoB'
  | 'discordantBtoA'
  | 'rawPValue'
  | 'holmCorrectedPValue'
  | 'oddsRatio'
  | 'effectLabel'
  | 'confidenceInterval';

type SortDirection = 'asc' | 'desc';

type SortState = {
  key: SortKey;
  direction: SortDirection;
};

const DEFAULT_SORT: SortState = {
  key: 'modelA',
  direction: 'asc',
};

function formatPValue(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value < 0.001) return '<0.001';
  return value.toFixed(3);
}

function formatAgreementRate(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatOddsRatio(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `×${value.toFixed(2)}`;
}

function formatOddsRatioInterval(low: number | null, high: number | null): string {
  if (low == null || high == null || !Number.isFinite(low) || !Number.isFinite(high)) return '—';
  return `[×${low.toFixed(2)}, ×${high.toFixed(2)}]`;
}

function getVerdictClass(verdict: ModelGroupingSignificanceRow['verdict']): string {
  switch (verdict) {
    case 'Significant':
      return 'border-teal-200 bg-teal-50 text-teal-800';
    case 'Weak':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    default:
      return 'border-gray-200 bg-gray-50 text-gray-600';
  }
}

function getSortDirectionLabel(direction: SortDirection): 'ascending' | 'descending' {
  return direction === 'asc' ? 'ascending' : 'descending';
}

function getNextSort(sort: SortState, key: SortKey): SortState {
  if (sort.key === key) {
    return { key, direction: sort.direction === 'asc' ? 'desc' : 'asc' };
  }
  if (key === 'modelA' || key === 'modelB' || key === 'effectLabel') {
    return { key, direction: 'asc' };
  }
  return { key, direction: 'desc' };
}

function sortRows(rows: ModelGroupingSignificanceRow[], sort: SortState): ModelGroupingSignificanceRow[] {
  return [...rows].sort((left, right) => {
    const direction = sort.direction === 'asc' ? 1 : -1;
    const leftLabel = `${left.modelALabel}::${left.modelBLabel}`;
    const rightLabel = `${right.modelALabel}::${right.modelBLabel}`;

    const getValue = (row: ModelGroupingSignificanceRow): string | number | null => {
      switch (sort.key) {
        case 'modelA':
          return row.modelALabel;
        case 'modelB':
          return row.modelBLabel;
        case 'agreementRate':
          return row.agreementRate;
        case 'discordantAtoB':
          return row.discordantAtoB;
        case 'discordantBtoA':
          return row.discordantBtoA;
        case 'rawPValue':
          return row.rawPValue ?? null;
        case 'holmCorrectedPValue':
          return row.holmCorrectedPValue ?? null;
        case 'oddsRatio':
          return row.oddsRatio ?? null;
        case 'effectLabel':
          return row.effectLabel;
        case 'confidenceInterval':
          return row.oddsRatio ?? ((row.confidenceIntervalLow != null && row.confidenceIntervalHigh != null)
            ? ((row.confidenceIntervalLow + row.confidenceIntervalHigh) / 2)
            : null);
      }
    };

    const leftValue = getValue(left);
    const rightValue = getValue(right);

    if (leftValue == null && rightValue == null) return leftLabel.localeCompare(rightLabel);
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;

    if (typeof leftValue === 'string' && typeof rightValue === 'string') {
      const comparison = leftValue.localeCompare(rightValue);
      return comparison === 0 ? leftLabel.localeCompare(rightLabel) : comparison * direction;
    }

    const comparison = Number(leftValue) - Number(rightValue);
    return comparison === 0 ? leftLabel.localeCompare(rightLabel) : comparison * direction;
  });
}

function SortableHeader({
  label,
  sortKey,
  sortState,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey: SortKey;
  sortState: SortState;
  onSort: (sortKey: SortKey) => void;
  align?: 'left' | 'center' | 'right';
}) {
  const isActive = sortState.key === sortKey;
  const nextDirection = getSortDirectionLabel(isActive ? (sortState.direction === 'asc' ? 'desc' : 'asc') : getNextSort(sortState, sortKey).direction);

  return (
    <TableHead
      scope="col"
      aria-sort={isActive ? getSortDirectionLabel(sortState.direction) : 'none'}
      className="bg-gray-50 px-2 py-2 text-xs uppercase tracking-wide text-gray-500"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onSort(sortKey)}
        className={cn(
          'w-full gap-1 rounded-none bg-transparent px-0 py-0 min-h-0 text-xs font-semibold uppercase tracking-wide text-gray-500 shadow-none transition-colors hover:bg-transparent hover:text-gray-900 focus:ring-0 focus:ring-offset-0',
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
            {sortState.direction === 'desc' ? '↑' : '↓'}
          </span>
        )}
      </Button>
    </TableHead>
  );
}

export function ModelGroupingSignificanceTable({ rows }: { rows: ModelGroupingSignificanceRow[] }) {
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort]);

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <Table variant="bordered" className="min-w-full">
        <TableHeader variant="bordered">
          <TableRow>
            <SortableHeader label="Model A" sortKey="modelA" sortState={sort} onSort={(key) => setSort((current) => getNextSort(current, key))} />
            <SortableHeader label="Model B" sortKey="modelB" sortState={sort} onSort={(key) => setSort((current) => getNextSort(current, key))} />
            <SortableHeader label="agreement rate" sortKey="agreementRate" sortState={sort} onSort={(key) => setSort((current) => getNextSort(current, key))} align="right" />
            <SortableHeader label="discordant A→B" sortKey="discordantAtoB" sortState={sort} onSort={(key) => setSort((current) => getNextSort(current, key))} align="right" />
            <SortableHeader label="discordant B→A" sortKey="discordantBtoA" sortState={sort} onSort={(key) => setSort((current) => getNextSort(current, key))} align="right" />
            <SortableHeader label="raw p-value" sortKey="rawPValue" sortState={sort} onSort={(key) => setSort((current) => getNextSort(current, key))} align="right" />
            <SortableHeader label="Holm-corrected p-value" sortKey="holmCorrectedPValue" sortState={sort} onSort={(key) => setSort((current) => getNextSort(current, key))} align="right" />
            <SortableHeader label="odds ratio" sortKey="oddsRatio" sortState={sort} onSort={(key) => setSort((current) => getNextSort(current, key))} align="right" />
            <SortableHeader label="effect label" sortKey="effectLabel" sortState={sort} onSort={(key) => setSort((current) => getNextSort(current, key))} />
            <SortableHeader label="confidence interval" sortKey="confidenceInterval" sortState={sort} onSort={(key) => setSort((current) => getNextSort(current, key))} align="right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((row) => (
            <TableRow key={`${row.modelAId}::${row.modelBId}`} hoverable>
              <TableCell className="font-medium text-gray-900">{row.modelALabel}</TableCell>
              <TableCell className="font-medium text-gray-900">{row.modelBLabel}</TableCell>
              <TableCell className="text-right font-mono tabular-nums text-gray-800">
                {formatAgreementRate(row.agreementRate)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-gray-800">
                {row.discordantAtoB.toString()}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-gray-800">
                {row.discordantBtoA.toString()}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-gray-800">
                {formatPValue(row.rawPValue ?? null)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-gray-800">
                {formatPValue(row.holmCorrectedPValue ?? null)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-gray-800">
                {formatOddsRatio(row.oddsRatio ?? null)}
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <div className="font-medium text-gray-900">{row.effectLabel}</div>
                  <div className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${getVerdictClass(row.verdict)}`}>
                    {row.verdict}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-gray-800">
                {formatOddsRatioInterval(row.confidenceIntervalLow ?? null, row.confidenceIntervalHigh ?? null)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

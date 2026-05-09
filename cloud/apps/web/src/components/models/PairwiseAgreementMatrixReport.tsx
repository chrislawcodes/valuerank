import { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';
import { cn } from '../../lib/utils';
import type { ModelAgreementOnTradeoffsQuery } from '../../generated/graphql';

type PairwiseAgreementRow = ModelAgreementOnTradeoffsQuery['modelAgreementOnTradeoffs']['pairwiseAgreementMatrix'][number];

type SelectedPair = {
  modelAId: string;
  modelBId: string;
};

type SortKey = 'modelA' | 'modelB' | 'cells' | 'kappa' | 'interpretation' | 'agreement' | 'divergence';
type SortDirection = 'asc' | 'desc';

type SortState = {
  key: SortKey;
  direction: SortDirection;
};

const DEFAULT_SORT: SortState = {
  key: 'modelA',
  direction: 'asc',
};

function formatKappa(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return `${(value * 100).toFixed(1)}%`;
}

function compareNullableNumbers(left: number | null, right: number | null, direction: SortDirection): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  const delta = left - right;
  return direction === 'asc' ? delta : -delta;
}

function compareNullableStrings(left: string | null, right: string | null, direction: SortDirection): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  const delta = left.localeCompare(right);
  return direction === 'asc' ? delta : -delta;
}

function sortRows(rows: PairwiseAgreementRow[], sort: SortState): PairwiseAgreementRow[] {
  return [...rows].sort((left, right) => {
    const leftLabel = `${left.modelALabel}::${left.modelBLabel}`;
    const rightLabel = `${right.modelALabel}::${right.modelBLabel}`;
    const direction = sort.direction;

    const value =
      sort.key === 'modelA'
        ? compareNullableStrings(left.modelALabel, right.modelALabel, direction)
        : sort.key === 'modelB'
          ? compareNullableStrings(left.modelBLabel, right.modelBLabel, direction)
          : sort.key === 'cells'
            ? compareNullableNumbers(left.totalCells, right.totalCells, direction)
            : sort.key === 'kappa'
              ? compareNullableNumbers(left.cohensKappa ?? null, right.cohensKappa ?? null, direction)
              : sort.key === 'interpretation'
                ? compareNullableStrings(left.kappaInterpretation ?? null, right.kappaInterpretation ?? null, direction)
                : sort.key === 'agreement'
                  ? compareNullableNumbers(left.percentAgreement ?? null, right.percentAgreement ?? null, direction)
                  : compareNullableNumbers(left.meanAbsoluteDivergence ?? null, right.meanAbsoluteDivergence ?? null, direction);

    return value === 0 ? leftLabel.localeCompare(rightLabel) : value;
  });
}

function getNextSort(sort: SortState, key: SortKey): SortState {
  if (sort.key === key) {
    return { key, direction: sort.direction === 'asc' ? 'desc' : 'asc' };
  }

  return {
    key,
    direction: key === 'modelA' || key === 'modelB' || key === 'interpretation' ? 'asc' : 'desc',
  };
}

function getSortDirectionLabel(direction: SortDirection): 'ascending' | 'descending' {
  return direction === 'asc' ? 'ascending' : 'descending';
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

function getMetricText(row: PairwiseAgreementRow, field: 'kappa' | 'agreement' | 'divergence'): string {
  if (row.totalCells === 0) {
    return 'no overlap';
  }

  switch (field) {
    case 'kappa':
      return formatKappa(row.cohensKappa ?? null);
    case 'agreement':
      return formatPercent(row.percentAgreement ?? null);
    case 'divergence':
      return formatPercent(row.meanAbsoluteDivergence ?? null);
    default:
      return '—';
  }
}

function getSelectedRowClass(isSelected: boolean): string {
  return isSelected ? 'bg-teal-50' : '';
}

export type PairwiseAgreementMatrixReportProps = {
  rows: PairwiseAgreementRow[];
  selectedPair: SelectedPair | null;
  onPairSelect: (pair: SelectedPair) => void;
};

export function PairwiseAgreementMatrixReport({ rows, selectedPair, onPairSelect }: PairwiseAgreementMatrixReportProps) {
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort]);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
        No pairwise agreement data available for the current selection.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <Table variant="bordered" className="min-w-full">
          <TableHeader variant="bordered">
            <TableRow>
              <SortableHeader label="Model A" sortKey="modelA" sortState={sort} onSort={(key) => setSort((current) => getNextSort(current, key))} />
              <SortableHeader label="Model B" sortKey="modelB" sortState={sort} onSort={(key) => setSort((current) => getNextSort(current, key))} />
              <SortableHeader label="Cells" sortKey="cells" sortState={sort} onSort={(key) => setSort((current) => getNextSort(current, key))} align="right" />
              <SortableHeader label="Kappa" sortKey="kappa" sortState={sort} onSort={(key) => setSort((current) => getNextSort(current, key))} align="right" />
              <SortableHeader label="Interpretation" sortKey="interpretation" sortState={sort} onSort={(key) => setSort((current) => getNextSort(current, key))} />
              <SortableHeader label="% Agreement" sortKey="agreement" sortState={sort} onSort={(key) => setSort((current) => getNextSort(current, key))} align="right" />
              <SortableHeader label="Mean Abs Divergence" sortKey="divergence" sortState={sort} onSort={(key) => setSort((current) => getNextSort(current, key))} align="right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row) => {
              const selected = selectedPair != null && row.modelAId === selectedPair.modelAId && row.modelBId === selectedPair.modelBId;
              return (
                <TableRow
                  key={`${row.modelAId}::${row.modelBId}`}
                  hoverable
                  className={cn('cursor-pointer', getSelectedRowClass(selected))}
                  onClick={() => onPairSelect({ modelAId: row.modelAId, modelBId: row.modelBId })}
                >
                  <TableCell className="font-medium text-gray-900">{row.modelALabel}</TableCell>
                  <TableCell className="font-medium text-gray-900">{row.modelBLabel}</TableCell>
                  <TableCell align="right" className="font-mono tabular-nums text-gray-800">
                    {row.totalCells.toLocaleString()}
                  </TableCell>
                  <TableCell align="right" className="font-mono tabular-nums text-gray-800">
                    {getMetricText(row, 'kappa')}
                  </TableCell>
                  <TableCell className="text-gray-700">
                    {row.totalCells === 0 ? 'no overlap' : row.kappaInterpretation ?? '—'}
                  </TableCell>
                  <TableCell align="right" className="font-mono tabular-nums text-gray-800">
                    {getMetricText(row, 'agreement')}
                  </TableCell>
                  <TableCell align="right" className="font-mono tabular-nums text-gray-800">
                    {getMetricText(row, 'divergence')}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

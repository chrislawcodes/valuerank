import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import { TooltipIcon } from '../ui/TooltipIcon';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';
import type { PressureSensitivityModel } from '../../api/operations/pressureSensitivity';
import { formatPercent, formatSignedPoints } from './pressureSensitivityFormatting';
import { averageValueRatesAcrossModels } from './pressureResponseAggregation';

type Props = {
  models: PressureSensitivityModel[];
};

type SortDirection = 'asc' | 'desc';
type SortKey =
  | 'value'
  | 'averageWinRate'
  | 'balancedWinRate'
  | 'highPressureOnThisValue'
  | 'highPressureOnOpposingValue'
  | 'highPressureOnValueEffect'
  | 'highPressureOnOpposingValueEffect';

type CountGridPattern =
  | 'average'
  | 'balanced'
  | 'highPressureOnValue'
  | 'highPressureOnOpposingValue';

type ValueRow = {
  valueLabel: string;
  averageWinRate: number | null;
  balancedWinRate: number | null;
  highPressureOnThisValue: number | null;
  highPressureOnOpposingValue: number | null;
  highPressureOnValueEffect: number | null;
  highPressureOnOpposingValueEffect: number | null;
};

const GRID_LABELS = [1, 2, 3, 4, 5];

function isCountedCell(pattern: CountGridPattern, rowIndex: number, colIndex: number): boolean {
  switch (pattern) {
    case 'average':
      return true;
    case 'balanced':
      return rowIndex === colIndex;
    case 'highPressureOnValue':
      return rowIndex <= 2 && colIndex >= 3;
    case 'highPressureOnOpposingValue':
      return rowIndex >= 3 && colIndex <= 2;
  }
}

function CountGrid({ pattern }: { pattern: CountGridPattern }) {
  return (
    <div className="space-y-0.5" aria-hidden="true">
      <div className="flex items-center gap-0.5">
        <div className="w-3" />
        {GRID_LABELS.map((label) => (
          <div key={label} className="flex h-3.5 w-3.5 items-center justify-center text-[8px] leading-none text-gray-400">
            {label}
          </div>
        ))}
      </div>
      {GRID_LABELS.map((rowLabel, rowIndex) => (
        <div key={rowLabel} className="flex items-center gap-0.5">
          <div className="flex h-3.5 w-3 items-center justify-end pr-0.5 text-[8px] leading-none text-gray-400">
            {rowLabel}
          </div>
          {GRID_LABELS.map((_, colIndex) => {
            const filled = isCountedCell(pattern, rowIndex, colIndex);
            return (
              <div
                key={colIndex}
                className={`h-3.5 w-3.5 rounded-[2px] border ${
                  filled ? 'border-blue-500 bg-blue-500' : 'border-blue-100 bg-blue-50'
                }`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function TooltipGridBlock({
  title,
  description,
  pattern,
}: {
  title: string;
  description: string;
  pattern: CountGridPattern;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <p className="font-semibold text-gray-900">{title}</p>
        <p className="text-[11px] leading-4 text-gray-600">{description}</p>
      </div>
      <div className="rounded-md border border-gray-200 bg-white p-2">
        <CountGrid pattern={pattern} />
      </div>
    </div>
  );
}

function formatRate(value: number | null): ReactNode {
  if (value == null) {
    return <span className="font-mono text-gray-500">—</span>;
  }

  return <span className="font-mono text-gray-900">{formatPercent(value)}</span>;
}

function defaultDirectionForKey(key: SortKey): SortDirection {
  return key === 'value' ? 'asc' : 'desc';
}

function compareNullableNumbers(a: number | null, b: number | null, direction: SortDirection): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return direction === 'asc' ? a - b : b - a;
}

function sortRows(rows: ValueRow[], sortKey: SortKey, direction: SortDirection): ValueRow[] {
  return [...rows].sort((a, b) => {
    if (sortKey === 'value') {
      return direction === 'asc'
        ? a.valueLabel.localeCompare(b.valueLabel)
        : b.valueLabel.localeCompare(a.valueLabel);
    }

    const aValue = a[sortKey];
    const bValue = b[sortKey];
    const numericComparison = compareNullableNumbers(
      typeof aValue === 'number' ? aValue : null,
      typeof bValue === 'number' ? bValue : null,
      direction,
    );
    if (numericComparison !== 0) {
      return numericComparison;
    }

    return a.valueLabel.localeCompare(b.valueLabel);
  });
}

function SortHeaderContent({
  label,
  ariaLabel,
  sortKey,
  activeSortKey,
  direction,
  onSort,
  tooltip,
  numeric,
}: {
  label: string;
  ariaLabel: string;
  sortKey: SortKey;
  activeSortKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  tooltip?: ReactNode;
  numeric?: boolean;
}) {
  const active = activeSortKey === sortKey;
  const sortDirection = active ? direction : 'desc';

  return (
    <div className={`flex w-full items-center gap-1 ${numeric ? 'justify-end' : 'justify-start'}`}>
      {/* eslint-disable-next-line react/forbid-elements -- Sortable table headers need a semantic inline button control */}
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 text-left transition-colors ${
          active ? 'text-gray-900' : 'text-gray-700 hover:text-gray-900'
        }`}
        aria-label={`Sort by ${ariaLabel}${active ? ` (${sortDirection === 'asc' ? 'ascending' : 'descending'})` : ''}`}
      >
        <span>{label}</span>
        {active ? (
          <span aria-hidden="true" className="text-[11px] leading-none text-gray-900">
            {direction === 'asc' ? '↑' : '↓'}
          </span>
        ) : null}
      </button>
      {tooltip ? <TooltipIcon ariaLabel={`Help: ${ariaLabel}`} content={tooltip} /> : null}
    </div>
  );
}

function SortHeaderCell(props: {
  label: string;
  ariaLabel: string;
  sortKey: SortKey;
  activeSortKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  tooltip?: ReactNode;
  numeric?: boolean;
}) {
  const { numeric } = props;

  return (
    <TableHead
      className={`${numeric ? 'text-right' : 'text-left'} text-xs uppercase tracking-wide text-gray-700`}
      aria-sort={props.activeSortKey === props.sortKey ? (props.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <SortHeaderContent {...props} />
    </TableHead>
  );
}

function RateCell({ value }: { value: number | null }) {
  return <TableCell className="text-right text-sm">{formatRate(value)}</TableCell>;
}

function EffectCell({ value }: { value: number | null }) {
  if (value == null) {
    return (
      <TableCell className="text-right text-sm">
        <span className="font-mono text-gray-500">—</span>
      </TableCell>
    );
  }
  const colorClass = value > 0 ? 'text-emerald-700' : value < 0 ? 'text-red-700' : 'text-gray-700';
  return (
    <TableCell className="text-right text-sm">
      <span className={`font-mono ${colorClass}`}>{formatSignedPoints(value)}</span>
    </TableCell>
  );
}

export function PressureResponseByValueTable({ models }: Props) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [sortKey, setSortKey] = useState<SortKey>('highPressureOnValueEffect');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const valueRates = useMemo(() => averageValueRatesAcrossModels(models), [models]);

  const rows = useMemo(
    () =>
      valueRates.map((vr) => ({
        valueLabel: vr.valueLabel,
        averageWinRate: vr.averageWinRate ?? null,
        balancedWinRate: vr.balancedWinRate ?? null,
        highPressureOnThisValue: vr.highPressureOnThisValueWinRate ?? null,
        highPressureOnOpposingValue: vr.highPressureOnOpposingValueWinRate ?? null,
        highPressureOnValueEffect:
          vr.highPressureOnThisValueWinRate != null && vr.balancedWinRate != null
            ? vr.highPressureOnThisValueWinRate - vr.balancedWinRate
            : null,
        highPressureOnOpposingValueEffect:
          vr.highPressureOnOpposingValueWinRate != null && vr.balancedWinRate != null
            ? vr.highPressureOnOpposingValueWinRate - vr.balancedWinRate
            : null,
      })),
    [valueRates],
  );

  const sortedRows = useMemo(
    () => sortRows(rows, sortKey, sortDirection),
    [rows, sortDirection, sortKey],
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(key);
    setSortDirection(defaultDirectionForKey(key));
  };

  if (models.length === 0) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-gray-900">Win Rate by Pressure Conditions by Value</h2>
          <p className="text-sm text-gray-600">No by-value data is available for the selected models.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-gray-900">Win Rate by Pressure Conditions by Value</h2>
          <p className="text-sm text-gray-600">
            Averaged across {models.length} selected model{models.length === 1 ? '' : 's'} in the page filter.
          </p>
          <p className="text-sm text-gray-600">
            Each row is one value. The columns show how often the selected model set picks that value across
            its 9 pairings, broken down by what the prompt was doing.
          </p>
          <p className="text-xs text-gray-500">
            Each pressure cell is pooled from its vignette-level observations, then counted once in the row summary.
            The pair rows are averaged equally across the 9 pairs containing this value.
          </p>
        </div>
        <CopyVisualButton targetRef={tableRef} label="Win Rate by Pressure Conditions by Value" />
      </div>

      <div ref={tableRef}>
        <Table variant="bordered">
          <TableHeader variant="bordered">
            <TableRow>
              <TableHead
                rowSpan={2}
                className="align-middle text-left text-xs uppercase tracking-wide text-gray-700"
                aria-sort={sortKey === 'value' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <SortHeaderContent
                  label="Value"
                  ariaLabel="Value"
                  sortKey="value"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead colSpan={6} className="text-center text-xs uppercase tracking-wide text-gray-700">
                Win rate
              </TableHead>
            </TableRow>
            <TableRow>
              <SortHeaderCell
                label="Average"
                ariaLabel="Average win rate"
                sortKey="averageWinRate"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={handleSort}
                tooltip={
                  <TooltipGridBlock
                    title="Average win rate"
                    description="All pooled condition cells are counted equally when pooling this rate."
                    pattern="average"
                  />
                }
                numeric
              />
              <SortHeaderCell
                label="Balanced"
                ariaLabel="Balanced win rate"
                sortKey="balancedWinRate"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={handleSort}
                tooltip={
                  <TooltipGridBlock
                    title="Balanced win rate"
                    description="Only the diagonal condition cells are counted."
                    pattern="balanced"
                  />
                }
                numeric
              />
              <SortHeaderCell
                label="High pressure on value"
                ariaLabel="High pressure on value win rate"
                sortKey="highPressureOnThisValue"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={handleSort}
                tooltip={
                  <TooltipGridBlock
                    title="High pressure on value win rate"
                    description="The prompt pushes toward this value: high pressure on this value and low to moderate pressure on the opposing value."
                    pattern="highPressureOnValue"
                  />
                }
                numeric
              />
              <SortHeaderCell
                label="High pressure on value effect"
                ariaLabel="High pressure on value effect"
                sortKey="highPressureOnValueEffect"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={handleSort}
                numeric
              />
              <SortHeaderCell
                label="High pressure on opposing value"
                ariaLabel="High pressure on opposing value win rate"
                sortKey="highPressureOnOpposingValue"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={handleSort}
                tooltip={
                  <TooltipGridBlock
                    title="High pressure on opposing value win rate"
                    description="The prompt pushes toward the other value: high pressure on the opposing value and low to moderate pressure on this value."
                    pattern="highPressureOnOpposingValue"
                  />
                }
                numeric
              />
              <SortHeaderCell
                label="High pressure on opposing value effect"
                ariaLabel="High pressure on opposing value effect"
                sortKey="highPressureOnOpposingValueEffect"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={handleSort}
                numeric
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row) => (
              <TableRow key={row.valueLabel}>
                <TableCell className="font-medium text-gray-900">{row.valueLabel}</TableCell>
                <RateCell value={row.averageWinRate} />
                <RateCell value={row.balancedWinRate} />
                <RateCell value={row.highPressureOnThisValue} />
                <EffectCell value={row.highPressureOnValueEffect} />
                <RateCell value={row.highPressureOnOpposingValue} />
                <EffectCell value={row.highPressureOnOpposingValueEffect} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 space-y-3 text-sm text-gray-600">
        <h3 className="text-sm font-semibold text-gray-900">Reading this table</h3>
        <p>
          Each row is one value. The columns show how often the selected model set picks that value across its
          9 pairings, broken down by what the prompt was doing.
        </p>
        <p>
          The two push columns are most informative when compared against the balanced rate. If &quot;high pressure on
          value&quot; is well above balanced, the prompt successfully pushes the model toward this value. If
          &quot;high pressure on opposing value&quot; is well below balanced, the prompt successfully pushes the model
          away from this value.
        </p>
        <div>
          <p className="font-semibold text-gray-900">Patterns to look for:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <strong>Moral attractor.</strong> Both push columns are higher than balanced. The selected models lean
              toward this value regardless of which way the prompt steers. Unusual - most values move in opposite
              directions under push and pull pressure.
            </li>
            <li>
              <strong>Push-resistant.</strong> &quot;High pressure on value&quot; is at or below balanced.
              Pressure to make the selected models pick this value does not work; sometimes it actively backfires.
            </li>
            <li>
              <strong>Inert.</strong> All four columns are within a few points of each other. The selected models&apos;
              choices on pairs involving this value do not shift much based on prompt pressure.
            </li>
          </ul>
        </div>
        <p>
          This summary aggregates across 9 different value pairs per row. The patterns it surfaces are real, but the
          per-pair detail below tells you which specific pairings drive each value&apos;s profile. Drill in to see the
          variation.
        </p>
      </div>
    </section>
  );
}

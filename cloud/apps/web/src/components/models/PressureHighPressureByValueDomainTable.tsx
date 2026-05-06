import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import { Button } from '../ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';
import type { PressureSensitivityModel } from '../../api/operations/pressureSensitivity';
import { formatPercent, formatSignedPoints } from './pressureSensitivityFormatting';
import { averageValueRatesAcrossModels } from './pressureResponseAggregation';

type Props = {
  models: PressureSensitivityModel[];
};

type DisplayMode = 'winRate' | 'shift';

type DomainColumn = {
  domainId: string;
  domainName: string;
};

type DomainCell = {
  domainId: string;
  domainName: string;
  rate: number | null;
  shift: number | null;
};

type ValueRow = {
  valueLabel: string;
  averageHighPressureRate: number | null;
  cells: Map<string, DomainCell>;
};

function formatRate(value: number | null, displayMode: DisplayMode): ReactNode {
  if (value == null) {
    return <span className="font-mono text-gray-500">—</span>;
  }

  const className = displayMode === 'shift'
    ? value > 0
      ? 'text-emerald-700'
      : value < 0
        ? 'text-red-700'
        : 'text-gray-700'
    : 'text-gray-900';

  return (
    <span className={`font-mono ${className}`}>
      {displayMode === 'shift' ? formatSignedPoints(value) : formatPercent(value)}
    </span>
  );
}

function DisplayModeToggle({
  displayMode,
  onChange,
}: {
  displayMode: DisplayMode;
  onChange: (value: DisplayMode) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
      {([
        ['winRate', 'High pressure win rate'],
        ['shift', 'Shift vs high pressure'],
      ] as const).map(([mode, label]) => (
        <Button
          key={mode}
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={displayMode === mode}
          onClick={() => onChange(mode)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            displayMode === mode
              ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

export function PressureHighPressureByValueDomainTable({ models }: Props) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('winRate');
  const valueRates = useMemo(() => averageValueRatesAcrossModels(models), [models]);

  const columns = useMemo<DomainColumn[]>(() => {
    const columnsById = new Map<string, DomainColumn>();

    for (const valueRate of valueRates) {
      for (const domainRate of valueRate.highPressureOnThisValueDomainRates) {
        if (columnsById.has(domainRate.domainId)) {
          continue;
        }
        columnsById.set(domainRate.domainId, {
          domainId: domainRate.domainId,
          domainName: domainRate.domainName,
        });
      }
    }

    return [...columnsById.values()].sort(
      (left, right) => left.domainName.localeCompare(right.domainName) || left.domainId.localeCompare(right.domainId),
    );
  }, [valueRates]);

  const rows = useMemo<ValueRow[]>(
    () =>
      valueRates
        .map((valueRate) => {
          const cells = new Map<string, DomainCell>();

          for (const domainRate of valueRate.highPressureOnThisValueDomainRates) {
            cells.set(domainRate.domainId, {
              domainId: domainRate.domainId,
              domainName: domainRate.domainName,
              rate: domainRate.rate ?? null,
              shift:
                domainRate.rate != null && valueRate.highPressureOnThisValueWinRate != null
                  ? domainRate.rate - valueRate.highPressureOnThisValueWinRate
                  : null,
            });
          }

          return {
            valueLabel: valueRate.valueLabel,
            averageHighPressureRate: valueRate.highPressureOnThisValueWinRate ?? null,
            cells,
          };
        })
        .sort((left, right) => left.valueLabel.localeCompare(right.valueLabel)),
    [valueRates],
  );

  if (models.length === 0) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
        <h2 className="text-lg font-semibold text-gray-900">High Pressure on Value Win Rate by Domain by Value</h2>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-gray-900">High Pressure on Value Win Rate by Domain by Value</h2>
          <p className="max-w-3xl text-sm text-gray-600">
            Each row shows a value&apos;s high-pressure win rate averaged across the selected models.
            Use the toggle to switch the domain cells between raw win rates and shifts versus that value&apos;s own
            cross-domain high-pressure average.
          </p>
        </div>
        <CopyVisualButton targetRef={tableRef} label="High Pressure on Value Win Rate by Domain by Value" />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-gray-600">
          Raw percentages show the selected models&apos; high-pressure win rate in each domain.
        </div>
        <DisplayModeToggle displayMode={displayMode} onChange={setDisplayMode} />
      </div>

      <div ref={tableRef} className="overflow-x-auto">
        <Table variant="bordered">
          <TableHeader variant="bordered">
            <TableRow>
              <TableHead className="text-left text-xs uppercase tracking-wide text-gray-700">Value</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide text-gray-700">
                Avg High Pressure Win Rate
              </TableHead>
              {columns.map((column) => (
                <TableHead
                  key={column.domainId}
                  className="text-right text-xs uppercase tracking-wide text-gray-700"
                >
                  {column.domainName}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.valueLabel}>
                <TableCell className="font-medium text-gray-900">{row.valueLabel}</TableCell>
                <TableCell className="text-right text-sm">
                  {formatRate(row.averageHighPressureRate, 'winRate')}
                </TableCell>
                {columns.map((column) => {
                  const cell = row.cells.get(column.domainId) ?? null;
                  const value = displayMode === 'shift' ? cell?.shift ?? null : cell?.rate ?? null;
                  return (
                    <TableCell key={column.domainId} className="text-right text-sm">
                      {formatRate(value, displayMode)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

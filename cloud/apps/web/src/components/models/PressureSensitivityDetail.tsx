import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';
import { HeaderTooltip } from '../ui/HeaderTooltip';
import { Tooltip } from '../ui/Tooltip';
import { PressureGrid } from './PressureGrid';
import type { PressureSensitivityModel, PressureSensitivityValuePair } from '../../api/operations/pressureSensitivity';
import {
  BALANCED_TOOLTIP,
  PUSH_TOWARD_FIRST_TOOLTIP,
  PUSH_TOWARD_OTHER_TOOLTIP,
  PAIR_PRESSURE_RESPONSE_TOOLTIP,
  TRIALS_TOOLTIP,
  formatPercent,
  formatSignedPoints,
  reasonHoverText,
} from './pressureSensitivityFormatting';

type Props = {
  model: PressureSensitivityModel;
};

type SortDirection = 'asc' | 'desc';

const VALUE_PAIR_TOOLTIP = 'The value pair shown in this row.';

function pairLabel(pair: PressureSensitivityValuePair): string {
  return `${pair.firstValueLabel} ↔ ${pair.secondValueLabel}`;
}

function renderRateCell(value: number | null | undefined): ReactNode {
  if (value == null) return <span className="font-mono text-gray-500">—</span>;
  return <span className="font-mono text-gray-900">{formatPercent(value)}</span>;
}

function renderResponseCell(pair: PressureSensitivityValuePair): ReactNode {
  const { value, ciLow, ciHigh, reason } = pair.pressureResponse;
  if (value == null) {
    const tip = reasonHoverText(reason) || 'Pressure response could not be computed.';
    return (
      <Tooltip
        content={<div className="max-w-[280px] whitespace-normal text-xs leading-5">{tip}</div>}
        position="top"
        variant="light"
      >
        <span className="font-mono text-gray-500">—</span>
      </Tooltip>
    );
  }

  const textClass = value < 0 ? 'text-red-700' : 'text-gray-900';
  const signed = formatSignedPoints(value);

  if (ciLow == null || ciHigh == null) {
    return <span className={`font-mono ${textClass}`}>{signed}</span>;
  }

  const halfWidth = Math.abs((ciHigh - ciLow) * 50);
  return (
    <span className={`font-mono ${textClass}`}>
      {signed} ± {halfWidth.toFixed(1)}
    </span>
  );
}

function renderTrialsCell(pair: PressureSensitivityValuePair): ReactNode {
  const { qualifyingTrials } = pair.pressureResponse;
  if (qualifyingTrials !== pair.n) {
    return (
      <Tooltip
        content={
          <div className="max-w-[280px] whitespace-normal text-xs leading-5">
            {qualifyingTrials} of {pair.n} scored observations used
          </div>
        }
        position="top"
        variant="light"
      >
        <span className="cursor-help font-mono text-gray-700 underline decoration-dotted">
          {qualifyingTrials}
        </span>
      </Tooltip>
    );
  }
  return <span className="font-mono text-gray-700">{qualifyingTrials}</span>;
}

export function PressureSensitivityDetail({ model }: Props) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedPairKey, setSelectedPairKey] = useState<string | null>(null);

  const sortedPairs = useMemo(() => {
    return [...model.valuePairs].sort((a, b) => {
      const aValue = a.pressureResponse.value;
      const bValue = b.pressureResponse.value;
      const aAbs = aValue == null ? null : Math.abs(aValue);
      const bAbs = bValue == null ? null : Math.abs(bValue);
      if (aAbs == null && bAbs == null) return pairLabel(a).localeCompare(pairLabel(b));
      if (aAbs == null) return 1;
      if (bAbs == null) return -1;
      if (aAbs !== bAbs) {
        return sortDirection === 'asc' ? aAbs - bAbs : bAbs - aAbs;
      }
      return pairLabel(a).localeCompare(pairLabel(b));
    });
  }, [model.valuePairs, sortDirection]);

  const selectedPair = useMemo(() => {
    if (selectedPairKey != null) {
      return sortedPairs.find((pair) => pair.pairKey === selectedPairKey) ?? sortedPairs[0] ?? null;
    }
    return sortedPairs[0] ?? null;
  }, [selectedPairKey, sortedPairs]);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-gray-900">Pressure Response by Value Pair</h2>
          <p className="text-sm text-gray-600">
            This table shows the balanced win rate and push rates for each value pair. The Pressure response column is
            the signed difference between push directions, and the Trials column counts the scored observations used
            to pool those rates.
          </p>
          <p className="text-xs text-gray-500">Selected model: {model.label}</p>
        </div>
        <CopyVisualButton targetRef={tableRef} label="Pressure Response by Value Pair" />
      </div>

      <div ref={tableRef}>
        <Table variant="bordered">
          <TableHeader variant="bordered">
            <TableRow>
              <TableHead className="text-xs uppercase tracking-wide text-gray-700">
                <HeaderTooltip label="Value Pair" content={VALUE_PAIR_TOOLTIP} />
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-gray-700">
                <HeaderTooltip label="Balanced" content={BALANCED_TOOLTIP} />
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-gray-700">
                <HeaderTooltip label="Push toward first" content={PUSH_TOWARD_FIRST_TOOLTIP} />
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-gray-700">
                <HeaderTooltip label="Push toward other" content={PUSH_TOWARD_OTHER_TOOLTIP} />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-xs uppercase tracking-wide text-gray-700"
                onClick={() => setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
                aria-sort={sortDirection === 'asc' ? 'ascending' : 'descending'}
              >
                <div className="inline-flex items-center gap-1">
                  <HeaderTooltip label="Pressure response" content={PAIR_PRESSURE_RESPONSE_TOOLTIP} />
                  <span aria-hidden="true" className="text-[11px] leading-none">
                    {sortDirection === 'asc' ? '▲' : '▼'}
                  </span>
                </div>
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-gray-700">
                <HeaderTooltip label="Trials" content={TRIALS_TOOLTIP} />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedPairs.map((pair) => {
              const isSelected = selectedPair?.pairKey === pair.pairKey;
              const { baselineRate, pushTowardFirstRate, pushTowardSecondRate } = pair.pressureResponse;

              return (
                <TableRow
                  key={pair.pairKey}
                  className={`cursor-pointer ${isSelected ? 'bg-blue-50' : ''}`}
                  onClick={() => setSelectedPairKey(pair.pairKey)}
                >
                  <TableCell className="font-medium text-gray-900">{pairLabel(pair)}</TableCell>
                  <TableCell className="text-sm text-gray-700">{renderRateCell(baselineRate)}</TableCell>
                  <TableCell className="text-sm text-gray-700">{renderRateCell(pushTowardFirstRate)}</TableCell>
                  <TableCell className="text-sm text-gray-700">{renderRateCell(pushTowardSecondRate)}</TableCell>
                  <TableCell className="text-sm text-gray-900">{renderResponseCell(pair)}</TableCell>
                  <TableCell className="text-sm text-gray-700">{renderTrialsCell(pair)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {selectedPair != null && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold text-gray-900">
            {pairLabel(selectedPair)} — pressure grid
          </h3>
          <PressureGrid pair={selectedPair} />
        </div>
      )}
    </section>
  );
}

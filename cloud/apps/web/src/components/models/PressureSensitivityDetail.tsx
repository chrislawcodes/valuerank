import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';
import { HeaderTooltip } from '../ui/HeaderTooltip';
import { Tooltip } from '../ui/Tooltip';
import { CeilingFloorBadge } from './CeilingFloorBadge';
import { PressureGrid } from './PressureGrid';
import type { PressureSensitivityModel, PressureSensitivityValuePair } from '../../api/operations/pressureSensitivity';
import {
  GROUP_TOOLTIP,
  LOW_TOOLTIP as LOW_TOOLTIP_BASE,
  HIGH_TOOLTIP as HIGH_TOOLTIP_BASE,
  PAIR_DELTA_TOOLTIP as DELTA_TOOLTIP,
  formatPercent,
  formatPoints,
  getBadgeFlag,
  reasonHoverText,
} from './pressureSensitivityFormatting';

type Props = {
  model: PressureSensitivityModel;
};

type SortDirection = 'asc' | 'desc';

const VALUE_PAIR_TOOLTIP = 'The value pair shown in this row.';
const TRIALS_TOOLTIP =
  'Total scored trials that contributed to this row\'s win rates. Counts only trials inside cells that met the coverage threshold (N ≥ 3) in the light or heavy pressure band. Refusals, unparseable responses, and trials in cells we skipped (low-data cells, level 3) are excluded.';
const LOW_TOOLTIP = `${LOW_TOOLTIP_BASE} Per-pair: for this pair specifically.`;
const HIGH_TOOLTIP = `${HIGH_TOOLTIP_BASE} Per-pair: for this pair specifically.`;

function pairLabel(pair: PressureSensitivityValuePair): string {
  return `${pair.ownToken} ↔ ${pair.opponentToken}`;
}

function bandTooltip(kind: 'low' | 'high', value: number | null | undefined, reason: string | null | undefined): string {
  if (value == null) {
    const explainer = reasonHoverText(reason);
    return explainer !== '' ? explainer : 'No pooled win rate is available.';
  }
  return kind === 'low' ? LOW_TOOLTIP : HIGH_TOOLTIP;
}

function renderBandCell(kind: 'low' | 'high', value: number | null | undefined, reason: string | null | undefined) {
  if (value == null) {
    return (
      <Tooltip content={<div className="max-w-[280px] whitespace-normal text-xs leading-5">{bandTooltip(kind, value, reason)}</div>} position="top" variant="light">
        <span className="font-mono text-gray-500">—</span>
      </Tooltip>
    );
  }

  const badgeFlag = kind === 'low' ? getBadgeFlag(value) ?? null : null;
  return (
    <Tooltip content={<div className="max-w-[280px] whitespace-normal text-xs leading-5">{bandTooltip(kind, value, reason)}</div>} position="top" variant="light">
      <div className="inline-flex items-center gap-1">
        <span className="font-mono text-gray-900">{formatPercent(value)}</span>
        <CeilingFloorBadge flag={badgeFlag} />
      </div>
    </Tooltip>
  );
}

function renderDeltaCell(pair: PressureSensitivityValuePair): ReactNode {
  const { value, ciLow, ciHigh, reason } = pair.winRateDelta;
  if (value == null) {
    return (
      <Tooltip content={<div className="max-w-[280px] whitespace-normal text-xs leading-5">{bandTooltip('low', value, reason)}</div>} position="top" variant="light">
        <span className="font-mono text-gray-500">—</span>
      </Tooltip>
    );
  }

  const textClass = value < 0 ? 'text-red-700' : 'text-gray-900';
  const glyph = value < 0 ? '▼' : '▲';
  const signed = `${value < 0 ? '−' : '+'}${formatPoints(value)}`;

  if (ciLow == null || ciHigh == null) {
    return <span className={`font-mono ${textClass}`}>{glyph} {signed}</span>;
  }

  const halfWidth = Math.abs((ciHigh - ciLow) * 50);
  return <span className={`font-mono ${textClass}`}>{glyph} {signed} ± {halfWidth.toFixed(0)} pp</span>;
}

export function PressureSensitivityDetail({ model }: Props) {
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedPairKey, setSelectedPairKey] = useState<string | null>(null);

  const sortedPairs = useMemo(() => {
    return [...model.valuePairs].sort((a, b) => {
      const aValue = a.winRateDelta.value;
      const bValue = b.winRateDelta.value;
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
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-gray-900">{model.label} — per-pair win rate sensitivity</h2>
        <p className="text-sm text-gray-600">
          This table shows how light and heavy pressure change the selected model&apos;s win rate for each value pair. The Δ column is the change in percentage points, and the Trials column counts only the scored trials that met the coverage rule.
        </p>
      </div>

      <Table variant="bordered">
        <TableHeader variant="bordered">
          <TableRow>
            <TableHead rowSpan={2} className="align-middle text-xs uppercase tracking-wide text-gray-500">
              <HeaderTooltip label="Value Pair" content={VALUE_PAIR_TOOLTIP} />
            </TableHead>
            <TableHead colSpan={3} className="text-center text-xs uppercase tracking-wide text-gray-500">
              <HeaderTooltip label="Win Rate" content={GROUP_TOOLTIP} />
            </TableHead>
            <TableHead rowSpan={2} className="align-middle text-xs uppercase tracking-wide text-gray-500">
              <HeaderTooltip label="Trials" content={TRIALS_TOOLTIP} />
            </TableHead>
          </TableRow>
          <TableRow>
            <TableHead className="text-xs uppercase tracking-wide text-gray-500">
              <HeaderTooltip label="Low pressure" content={LOW_TOOLTIP} />
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-gray-500">
              <HeaderTooltip label="High pressure" content={HIGH_TOOLTIP} />
            </TableHead>
            <TableHead
              className="cursor-pointer select-none text-xs uppercase tracking-wide text-gray-500"
              onClick={() => setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
              aria-sort={sortDirection === 'asc' ? 'ascending' : 'descending'}
            >
              <div className="inline-flex items-center gap-1">
                <HeaderTooltip label="Win rate Δ ± CI" content={DELTA_TOOLTIP} />
                <span aria-hidden="true" className="text-[11px] leading-none">
                  {sortDirection === 'asc' ? '▲' : '▼'}
                </span>
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedPairs.map((pair) => {
            const isSelected = selectedPair?.pairKey === pair.pairKey;
            const { lowBandMean, highBandMean, reason } = pair.winRateDelta;

            return (
              <TableRow
                key={pair.pairKey}
                className={`cursor-pointer ${isSelected ? 'bg-blue-50' : ''}`}
                onClick={() => setSelectedPairKey(pair.pairKey)}
              >
                <TableCell className="font-medium text-gray-900">{pairLabel(pair)}</TableCell>
                <TableCell className="text-sm text-gray-700">{renderBandCell('low', lowBandMean, reason)}</TableCell>
                <TableCell className="text-sm text-gray-700">{renderBandCell('high', highBandMean, reason)}</TableCell>
                <TableCell className="text-sm text-gray-900">{renderDeltaCell(pair)}</TableCell>
                <TableCell className="text-sm text-gray-700">{pair.qualifyingTrials}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

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

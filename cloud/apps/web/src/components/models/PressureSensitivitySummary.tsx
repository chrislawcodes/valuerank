import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';
import { HeaderTooltip } from '../ui/HeaderTooltip';
import { Tooltip } from '../ui/Tooltip';
import { CeilingFloorBadge } from './CeilingFloorBadge';
import type { PressureSensitivityModel, PressureSensitivityWinRateDeltaSummary } from '../../api/operations/pressureSensitivity';
import {
  GROUP_TOOLTIP,
  LOW_TOOLTIP as LOW_TOOLTIP_BASE,
  HIGH_TOOLTIP as HIGH_TOOLTIP_BASE,
  SUMMARY_DELTA_TOOLTIP as DELTA_TOOLTIP,
  formatPercent,
  formatPoints,
  getBadgeFlag,
} from './pressureSensitivityFormatting';

type Props = {
  models: PressureSensitivityModel[];
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void;
};

type SortDirection = 'asc' | 'desc';

const MODEL_TOOLTIP = 'The model in this row.';
const LOW_TOOLTIP = `${LOW_TOOLTIP_BASE} Averaged across this model's measured value pairs.`;
const HIGH_TOOLTIP = `${HIGH_TOOLTIP_BASE} Averaged across this model's measured value pairs.`;

function renderBandCell(value: number | null | undefined, tooltip: ReactNode, badgeFlag: 'ceiling' | 'floor' | null) {
  if (value == null) {
    return <span className="font-mono text-gray-500">—</span>;
  }

  return (
    <Tooltip content={<div className="max-w-[280px] whitespace-normal text-xs leading-5">{tooltip}</div>} position="top" variant="light">
      <div className="inline-flex items-center gap-1">
        <span className="font-mono text-gray-900">{formatPercent(value)}</span>
        <CeilingFloorBadge flag={badgeFlag} />
      </div>
    </Tooltip>
  );
}

function renderDeltaCell(summary: PressureSensitivityWinRateDeltaSummary): ReactNode {
  const { mean, ciLow, ciHigh, pairsMeasured, pairsPositive } = summary;
  if (mean == null) {
    return <span className="font-mono text-gray-500">—</span>;
  }

  const textClass = mean < 0 ? 'text-red-700' : 'text-gray-900';
  const glyph = mean < 0 ? '▼' : '▲';
  const signed = `${mean < 0 ? '−' : '+'}${formatPoints(mean)}`;

  if (pairsMeasured < 2 || ciLow == null || ciHigh == null) {
    return (
      <span className={`font-mono ${textClass}`}>
        {glyph} {signed} <span className="text-xs text-gray-500">(thin)</span>
      </span>
    );
  }

  const halfWidth = Math.abs((ciHigh - ciLow) * 50);
  return (
    <span className={`font-mono ${textClass}`}>
      {glyph} {signed} ± {halfWidth.toFixed(0)} pp <span className="text-xs text-gray-500">· {pairsPositive}/{pairsMeasured} moved up</span>
    </span>
  );
}

export function PressureSensitivitySummary({ models, selectedModelId, onSelectModel }: Props) {
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const sortedModels = useMemo(() => {
    return [...models].sort((a, b) => {
      const aMean = a.winRateDeltaSummary.mean;
      const bMean = b.winRateDeltaSummary.mean;
      if (aMean == null && bMean == null) return a.label.localeCompare(b.label);
      if (aMean == null) return 1;
      if (bMean == null) return -1;
      if (aMean !== bMean) {
        return sortDirection === 'asc' ? aMean - bMean : bMean - aMean;
      }
      return a.label.localeCompare(b.label);
    });
  }, [models, sortDirection]);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Cross-model win rate sensitivity</h2>
          <p className="text-sm text-gray-600">
            This table ranks models by how much pressure moves their win rate, with light and heavy pressure shown beside the Win rate Δ.
          </p>
        </div>
      </div>

      <Table variant="bordered">
        <TableHeader variant="bordered">
          <TableRow>
            <TableHead rowSpan={2} className="align-middle text-xs uppercase tracking-wide text-gray-500">
              <HeaderTooltip label="Model" content={MODEL_TOOLTIP} />
            </TableHead>
            <TableHead colSpan={3} className="text-center text-xs uppercase tracking-wide text-gray-500">
              <HeaderTooltip label="Win Rate" content={GROUP_TOOLTIP} />
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
          {sortedModels.map((model) => {
            const summary = model.winRateDeltaSummary;
            const isSelected = model.modelId === selectedModelId;
            const lowBadge = summary.lowBandMean == null ? null : getBadgeFlag(summary.lowBandMean);
            const lowTooltip = summary.lowBandMean == null ? 'No pooled low-pressure win rate is available.' : LOW_TOOLTIP;
            const highTooltip = summary.highBandMean == null ? 'No pooled high-pressure win rate is available.' : HIGH_TOOLTIP;

            return (
              <TableRow
                key={model.modelId}
                className={`cursor-pointer ${isSelected ? 'bg-blue-50' : ''}`}
                onClick={() => onSelectModel(model.modelId)}
              >
                <TableCell className="font-medium text-gray-900">{model.label}</TableCell>
                <TableCell className="text-sm text-gray-700">
                  {renderBandCell(summary.lowBandMean, lowTooltip, lowBadge)}
                </TableCell>
                <TableCell className="text-sm text-gray-700">
                  {renderBandCell(summary.highBandMean, highTooltip, null)}
                </TableCell>
                <TableCell className="text-sm text-gray-900">{renderDeltaCell(summary)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}

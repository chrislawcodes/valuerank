import { VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';

export type ForestPlotRow = {
  pairKey: string;
  label: string;
  framingDirection: 'A_TO_B' | 'B_TO_A' | 'AVERAGED';
  pointEstimate: number;
  ciLow: number | null;
  ciHigh: number | null;
  bracketLow: number | null;
  bracketHigh: number | null;
  totalTrials: number;
  prioritized: number;
  refusalRate: number;
  definitionIds: string[];
  directionGap: number | null;
  pairWarn: boolean;
  directionEstimates?: {
    aToB: number | null;
    bToA: number | null;
  };
};

export type ForestPlotProps = {
  rows: ForestPlotRow[];
  pooledMin: number | null;
  pooledMean: number | null;
  pooledMax: number | null;
  pooledStdDev: number | null;
  splitByDirection: boolean;
  onToggleSplit: () => void;
  onRowClick: (row: ForestPlotRow) => void;
  onRowExpandPair: (pairKey: string) => void;
  expandedPairKeys: Set<string>;
  validEstimateCount?: number;
};

const LABEL_WIDTH = 220;
const SVG_WIDTH = 760;
const PLOT_START_X = LABEL_WIDTH + 20;
const PLOT_END_X = SVG_WIDTH - 36;
const PLOT_WIDTH = PLOT_END_X - PLOT_START_X;
const ROW_HEIGHT = 28;
const SUMMARY_HEIGHT = 36;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatDirection(direction: ForestPlotRow['framingDirection']): string {
  if (direction === 'AVERAGED') return 'Averaged across both directions';
  return direction === 'A_TO_B' ? 'A→B' : 'B→A';
}

function truncateLabel(label: string, maxChars = 30): string {
  if (label.length <= maxChars) return label;
  return `${label.slice(0, Math.max(0, maxChars - 1))}…`;
}

function estimateSquareSize(totalTrials: number): number {
  return clamp(Math.sqrt(totalTrials), 4, 12);
}

function toPlotX(value: number): number {
  return PLOT_START_X + value * PLOT_WIDTH;
}

function buildTooltip(row: ForestPlotRow): string {
  const parts = [
    row.label,
    `Definitions: ${row.definitionIds.join(', ')}`,
    `Direction: ${formatDirection(row.framingDirection)}`,
    `Prioritized / total: ${row.prioritized} / ${row.totalTrials}`,
    `Refusal rate: ${formatPercent(row.refusalRate)}`,
  ];

  if (row.ciLow != null && row.ciHigh != null) {
    parts.push(`95% CI: ${row.ciLow.toFixed(3)} – ${row.ciHigh.toFixed(3)}`);
  }

  if (
    row.framingDirection === 'AVERAGED' &&
    row.definitionIds.length === 2 &&
    row.directionEstimates != null &&
    row.directionEstimates.aToB != null &&
    row.directionEstimates.bToA != null
  ) {
    parts.push(
      `A→B: ${formatPercent(row.directionEstimates.aToB)} · B→A: ${formatPercent(row.directionEstimates.bToA)}`,
    );
  }

  return parts.join('\n');
}

function renderMarker(row: ForestPlotRow, y: number) {
  const squareSize = estimateSquareSize(row.totalTrials);
  const centerX = toPlotX(row.pointEstimate);
  const stroke = row.framingDirection === 'AVERAGED' ? '#6B7280' : '#0F766E';
  const fill =
    row.framingDirection === 'AVERAGED'
      ? '#9CA3AF'
      : row.framingDirection === 'A_TO_B'
        ? '#0F766E'
        : '#FFFFFF';

  return (
    <rect
      x={centerX - squareSize / 2}
      y={y - squareSize / 2}
      width={squareSize}
      height={squareSize}
      fill={fill}
      stroke={stroke}
      strokeWidth={1.5}
      rx={1}
    />
  );
}

function renderInterval(row: ForestPlotRow, y: number) {
  if (row.ciLow != null && row.ciHigh != null) {
    return (
      <line
        x1={toPlotX(row.ciLow)}
        y1={y}
        x2={toPlotX(row.ciHigh)}
        y2={y}
        stroke="#374151"
        strokeWidth={2}
        strokeLinecap="round"
      />
    );
  }

  if (row.bracketLow != null && row.bracketHigh != null) {
    const leftX = toPlotX(row.bracketLow);
    const rightX = toPlotX(row.bracketHigh);

    return (
      <>
        <line
          x1={leftX}
          y1={y}
          x2={rightX}
          y2={y}
          stroke="#6B7280"
          strokeWidth={2}
          strokeDasharray="4 3"
          strokeLinecap="round"
        />
        <rect
          x={leftX - 3}
          y={y - 3}
          width={6}
          height={6}
          fill="#FFFFFF"
          stroke="#6B7280"
          strokeWidth={1.5}
        />
        <rect
          x={rightX - 3}
          y={y - 3}
          width={6}
          height={6}
          fill="#FFFFFF"
          stroke="#6B7280"
          strokeWidth={1.5}
        />
      </>
    );
  }

  return null;
}

export function ForestPlot({
  rows,
  pooledMin,
  pooledMean,
  pooledMax,
  pooledStdDev,
  splitByDirection,
  onToggleSplit,
  onRowClick,
  onRowExpandPair,
  validEstimateCount,
}: ForestPlotProps) {
  const summaryVisible =
    (validEstimateCount ?? rows.length) >= 2 &&
    pooledMin != null &&
    pooledMean != null &&
    pooledMax != null;
  const rowsTop = 32;
  const rowsHeight = rows.length * ROW_HEIGHT;
  const summaryTop = rowsTop + rowsHeight + 10;
  const axisY = summaryTop + (summaryVisible ? SUMMARY_HEIGHT : 6);
  const svgHeight = axisY + (pooledStdDev != null ? 42 : 26);
  const referenceLineBottom = summaryVisible ? summaryTop + 12 : rowsTop + rowsHeight - 4;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-end">
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={splitByDirection}
            onChange={onToggleSplit}
            className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          <span>Split by direction</span>
        </label>
      </div>

      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Forest plot with ${rows.length} row${rows.length === 1 ? '' : 's'}`}
      >
        <line
          x1={toPlotX(0.5)}
          y1={rowsTop - 14}
          x2={toPlotX(0.5)}
          y2={referenceLineBottom}
          stroke="rgba(0,0,0,0.25)"
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />

        {rows.map((row, index) => {
          const rowTop = rowsTop + index * ROW_HEIGHT;
          const centerY = rowTop + 14;
          const labelY = row.refusalRate > 0.05 ? centerY - 3 : centerY + 4;

          const activateRow = () => {
            if (row.framingDirection === 'AVERAGED' && row.definitionIds.length === 2) {
              onRowExpandPair(row.pairKey);
              return;
            }

            onRowClick(row);
          };

          return (
            <g
              key={`${row.pairKey}:${row.label}:${index}`}
              onClick={activateRow}
              style={{ cursor: 'pointer' }}
            >
              <title>{buildTooltip(row)}</title>
              <rect x={0} y={rowTop} width={SVG_WIDTH} height={ROW_HEIGHT} fill="transparent" />
              <text
                x={LABEL_WIDTH - 12}
                y={labelY}
                textAnchor="end"
                className="fill-gray-900 text-[12px]"
              >
                {truncateLabel(row.label)}
              </text>
              {row.pairWarn && (
                <text x={LABEL_WIDTH - 2} y={labelY} className="fill-amber-600 text-[12px]">
                  <title>
                    {`Large direction gap: ${row.directionGap?.toFixed(1) ?? '0.0'} percentage points`}
                  </title>
                  ⚠
                </text>
              )}
              {row.refusalRate > 0.05 && (
                <text
                  x={LABEL_WIDTH - 12}
                  y={centerY + 11}
                  textAnchor="end"
                  className="fill-gray-500 text-[10px]"
                >
                  {`refusal: ${Math.round(row.refusalRate * 100)}%`}
                </text>
              )}

              {renderInterval(row, centerY)}
              {renderMarker(row, centerY)}
            </g>
          );
        })}

        {summaryVisible && pooledMin != null && pooledMean != null && pooledMax != null && (
          <g>
            <text
              x={LABEL_WIDTH - 12}
              y={summaryTop + 16}
              textAnchor="end"
              className="fill-gray-700 text-[12px] font-medium"
            >
              Summary
            </text>
            <line
              x1={toPlotX(pooledMin)}
              y1={summaryTop + 14}
              x2={toPlotX(pooledMax)}
              y2={summaryTop + 14}
              stroke="#111827"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <polygon
              points={`${toPlotX(pooledMean)},${summaryTop + 6} ${toPlotX(pooledMean) - 6},${summaryTop + 18} ${toPlotX(pooledMean) + 6},${summaryTop + 18}`}
              fill="#111827"
            />
            <text x={PLOT_END_X} y={summaryTop + 16} textAnchor="end" className="fill-gray-700 text-[12px]">
              {`Mean ${formatPercent(pooledMean)}`}
            </text>
          </g>
        )}

        {pooledStdDev != null && (
          <text
            x={PLOT_START_X}
            y={summaryTop + (summaryVisible ? 34 : 18)}
            className="fill-gray-600 text-[11px]"
          >
            {`SD = ${(pooledStdDev * 100).toFixed(1)} pp`}
          </text>
        )}

        <text x={toPlotX(0)} y={axisY + 16} textAnchor="middle" className="fill-gray-500 text-[11px]">
          0%
        </text>
        <text x={toPlotX(0.5)} y={axisY + 16} textAnchor="middle" className="fill-gray-500 text-[11px]">
          50%
        </text>
        <text x={toPlotX(1)} y={axisY + 16} textAnchor="middle" className="fill-gray-500 text-[11px]">
          100%
        </text>
      </svg>
    </section>
  );
}

export function getPairLabel(rowValueKey: ValueKey, columnValueKey: ValueKey): string {
  const rowLabel = VALUE_LABELS[rowValueKey] ?? rowValueKey;
  const columnLabel = VALUE_LABELS[columnValueKey] ?? columnValueKey;
  return `${rowLabel} vs ${columnLabel}`;
}

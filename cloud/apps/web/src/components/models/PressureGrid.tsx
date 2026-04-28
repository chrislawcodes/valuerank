import { useState } from 'react';
import { Button } from '../ui/Button';
import type {
  PressureSensitivityCell,
  PressureSensitivityValuePair,
} from '../../api/operations/pressureSensitivity';

type Metric = 'netScore' | 'winRate' | 'conviction';

type Props = {
  pair: PressureSensitivityValuePair;
};

const LEVELS = [1, 2, 3, 4, 5] as const;

function colorForNetScore(value: number | null | undefined): string {
  if (value == null) return '#f3f4f6';
  // -2..2 range → divergent palette: red (negative) to grey (0) to blue (positive)
  const clamped = Math.max(-2, Math.min(2, value));
  const intensity = Math.abs(clamped) / 2;
  if (clamped > 0) {
    const lightness = 100 - intensity * 35;
    return `hsl(218, 70%, ${lightness}%)`;
  }
  if (clamped < 0) {
    const lightness = 100 - intensity * 35;
    return `hsl(0, 70%, ${lightness}%)`;
  }
  return '#f3f4f6';
}

function colorForWinRate(value: number | null | undefined): string {
  if (value == null) return '#f3f4f6';
  // 0..1 range → divergent palette around 0.5
  const offset = (value - 0.5) * 2; // -1..1
  const intensity = Math.abs(offset);
  if (offset > 0) {
    return `hsl(218, 70%, ${100 - intensity * 35}%)`;
  }
  if (offset < 0) {
    return `hsl(0, 70%, ${100 - intensity * 35}%)`;
  }
  return '#f3f4f6';
}

function colorForConviction(value: number | null | undefined): string {
  if (value == null) return '#f3f4f6';
  // 1..2 range — single-direction blue ramp
  const intensity = Math.max(0, Math.min(1, value - 1));
  return `hsl(218, 70%, ${100 - intensity * 30}%)`;
}

function colorFor(metric: Metric, cell: PressureSensitivityCell): string {
  if (cell.lowData) return '#f3f4f6';
  switch (metric) {
    case 'netScore':
      return colorForNetScore(cell.netScore);
    case 'winRate':
      return colorForWinRate(cell.winRate);
    case 'conviction':
      return colorForConviction(cell.conviction);
  }
}

function formatCellLabel(metric: Metric, cell: PressureSensitivityCell): string {
  if (cell.lowData) return '—';
  const value = metric === 'netScore' ? cell.netScore : metric === 'winRate' ? cell.winRate : cell.conviction;
  if (value == null) return '—';
  return value.toFixed(2);
}

export function PressureGrid({ pair }: Props) {
  const [metric, setMetric] = useState<Metric>('netScore');
  const [hoveredCell, setHoveredCell] = useState<PressureSensitivityCell | null>(null);

  const cellLookup = new Map<string, PressureSensitivityCell>();
  for (const cell of pair.grid) {
    cellLookup.set(`${cell.ownLevel}::${cell.opponentLevel}`, cell);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Rows: <span className="font-medium">{pair.ownToken}</span> pressure (1=minimal,
          5=full). Columns: <span className="font-medium">{pair.opponentToken}</span> pressure.
          Cell color shows {metric} per-cell.
        </p>
        <div className="flex gap-1 text-xs">
          {(['netScore', 'winRate', 'conviction'] as Metric[]).map((m) => (
            <Button
              key={m}
              variant={metric === m ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setMetric(m)}
              className="!min-h-0 !py-1 !px-2 !text-xs"
            >
              {m}
            </Button>
          ))}
        </div>
      </div>

      <div className="inline-block rounded-md border border-gray-200 bg-white p-2">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="px-2 py-1 text-[11px] text-gray-500" />
              {LEVELS.map((opp) => (
                <th key={opp} scope="col" className="px-3 py-1 text-[11px] text-gray-500">
                  Opp {opp}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LEVELS.map((own) => (
              <tr key={own}>
                <th scope="row" className="px-2 py-1 text-[11px] text-gray-500">Own {own}</th>
                {LEVELS.map((opp) => {
                  const cell = cellLookup.get(`${own}::${opp}`);
                  if (cell == null) {
                    return (
                      <td
                        key={opp}
                        className="h-10 w-12 border border-gray-100 text-center text-[10px] text-gray-300"
                      >
                        ·
                      </td>
                    );
                  }
                  return (
                    <td
                      key={opp}
                      className="h-10 w-12 cursor-help border border-white text-center text-[11px] font-mono text-gray-900"
                      style={{ backgroundColor: colorFor(metric, cell) }}
                      onMouseEnter={() => setHoveredCell(cell)}
                      onMouseLeave={() => setHoveredCell((cur) => (cur === cell ? null : cur))}
                    >
                      {formatCellLabel(metric, cell)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hoveredCell && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
          <span className="font-mono">
            Own {hoveredCell.ownLevel} × Opp {hoveredCell.opponentLevel}
          </span>
          {' — '}
          N={hoveredCell.n}
          {hoveredCell.unscoredCount > 0 ? `, ${hoveredCell.unscoredCount} unscored` : ''}
          {' · '}
          win {hoveredCell.winRate != null ? `${(hoveredCell.winRate * 100).toFixed(0)}%` : '—'}
          {' · '}
          conviction {hoveredCell.conviction?.toFixed(2) ?? '—'}
          {' · '}
          netScore {hoveredCell.netScore?.toFixed(2) ?? '—'}
          {hoveredCell.lowData ? <span className="ml-2 text-amber-700">(low data)</span> : null}
        </div>
      )}
    </div>
  );
}

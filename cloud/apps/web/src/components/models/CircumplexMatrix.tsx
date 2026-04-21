import { VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';
import { formatFullSchwartzValueName } from '../../utils/schwartz';

type Props = {
  matrix: Array<Array<number | null> | null>;
  pairTrialCounts: number[][];
  valueOrder: ValueKey[];
  excludedValues: Set<ValueKey>;
};

const CELL_SIZE = 34;
const LABEL_SIZE = 128;
const MARGIN = 10;

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function colorForCorrelation(value: number | null): string {
  if (value == null) return '#e5e7eb';
  const t = (clamp(value) + 1) / 2;
  if (t < 0.5) {
    const ratio = t / 0.5;
    const r = 239 + Math.round((255 - 239) * ratio);
    const g = 68 + Math.round((255 - 68) * ratio);
    const b = 68 + Math.round((255 - 68) * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  }
  const ratio = (t - 0.5) / 0.5;
  const r = 255 - Math.round((255 - 34) * ratio);
  const g = 255 - Math.round((255 - 197) * ratio);
  const b = 255 - Math.round((255 - 94) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

export function CircumplexMatrix({ matrix, pairTrialCounts, valueOrder, excludedValues }: Props) {
  const width = LABEL_SIZE + (valueOrder.length * CELL_SIZE) + MARGIN * 2;
  const height = LABEL_SIZE + (valueOrder.length * CELL_SIZE) + MARGIN * 2;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Value-profile correlation matrix</h2>
        <p className="text-sm text-gray-600">Short labels use the shipped ValueRank label map; the tooltip spells out the full Schwartz names.</p>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="block min-w-[640px]">
          <defs>
            <pattern id="circumplex-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="rgba(255,255,255,0.22)" />
              <path d="M 0 0 L 0 6" stroke="rgba(0,0,0,0.25)" strokeWidth="2" />
            </pattern>
          </defs>

          {valueOrder.map((valueKey, index) => {
            const x = LABEL_SIZE + MARGIN + index * CELL_SIZE;
            const y = LABEL_SIZE + MARGIN + index * CELL_SIZE;
            return (
              <g key={valueKey}>
                <text x={x + CELL_SIZE / 2} y={LABEL_SIZE - 4} textAnchor="middle" className="fill-gray-700 text-[10px] font-medium">
                  {VALUE_LABELS[valueKey]}
                </text>
                <text x={LABEL_SIZE - 8} y={y + CELL_SIZE / 2 + 3} textAnchor="end" className="fill-gray-700 text-[10px] font-medium">
                  {VALUE_LABELS[valueKey]}
                </text>
              </g>
            );
          })}

          {valueOrder.map((rowValue, rowIndex) => (
            valueOrder.map((colValue, colIndex) => {
              const cell = matrix[rowIndex]?.[colIndex] ?? null;
              const trials = pairTrialCounts[rowIndex]?.[colIndex] ?? 0;
              const x = LABEL_SIZE + MARGIN + colIndex * CELL_SIZE;
              const y = LABEL_SIZE + MARGIN + rowIndex * CELL_SIZE;
              const lowCount = trials > 0 && trials < 20;
              const fullName = `${formatFullSchwartzValueName(rowValue)} vs ${formatFullSchwartzValueName(colValue)}`;

              return (
                <g key={`${rowValue}:${colValue}`}>
                  <rect
                    x={x}
                    y={y}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    rx="3"
                    fill={colorForCorrelation(cell)}
                    stroke={excludedValues.has(rowValue) || excludedValues.has(colValue) ? '#cbd5e1' : '#d1d5db'}
                    strokeWidth="1"
                  >
                    <title>
                      {`${fullName} · ρ ${cell == null ? '—' : cell.toFixed(2)} · n=${trials}`}
                    </title>
                  </rect>
                  {lowCount && cell != null && (
                    <rect
                      x={x}
                      y={y}
                      width={CELL_SIZE}
                      height={CELL_SIZE}
                      rx="3"
                      fill="url(#circumplex-hatch)"
                      pointerEvents="none"
                    />
                  )}
                  {cell == null ? (
                    <text x={x + CELL_SIZE / 2} y={y + CELL_SIZE / 2 + 4} textAnchor="middle" className="fill-gray-500 text-[11px]">
                      —
                    </text>
                  ) : lowCount ? (
                    <text x={x + CELL_SIZE / 2} y={y + CELL_SIZE / 2 + 4} textAnchor="middle" className="fill-gray-700 text-[9px] font-medium">
                      n={trials}
                    </text>
                  ) : null}
                </g>
              );
            })
          ))}
        </svg>
      </div>
      {excludedValues.size > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          Excluded from profile correlation: {Array.from(excludedValues).map((valueKey) => VALUE_LABELS[valueKey]).join(', ')}
        </p>
      )}
    </section>
  );
}

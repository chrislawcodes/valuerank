import { VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';
import { formatFullSchwartzValueName } from '../../utils/schwartz';
import type { CircumplexMdsCoord } from '../../api/operations/circumplex';

type Props = {
  mds: CircumplexMdsCoord[];
  excludedValues: ValueKey[];
  mdsWarning: string | null;
  mdsStress: number;
};

const SIZE = 360;
const CENTER = SIZE / 2;
const RADIUS = 120;

function format(value: number): string {
  return value.toFixed(2);
}

export function CircumplexMdsScatter({ mds, excludedValues, mdsWarning, mdsStress }: Props) {
  if (mdsWarning != null) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 md:p-5">
        <h2 className="text-lg font-semibold text-amber-950">2D embedding warning</h2>
        <p className="mt-2 text-sm text-amber-900">{mdsWarning}</p>
        <p className="mt-2 text-xs text-amber-800">Stress: {format(mdsStress)}</p>
      </section>
    );
  }

  const maxAbs = Math.max(
    1,
    ...mds.flatMap((point) => [Math.abs(point.x), Math.abs(point.y)]),
  );
  const scale = RADIUS / maxAbs;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Classical MDS</h2>
        <p className="text-sm text-gray-600">The dotted circle shows the theoretical order. Stress: {format(mdsStress)}.</p>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="block min-w-[320px]">
          <defs>
            <marker id="circumplex-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="#94a3b8" />
            </marker>
          </defs>

          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="#cbd5e1" strokeDasharray="4 4" />
          <line x1={CENTER - RADIUS - 20} y1={CENTER} x2={CENTER + RADIUS + 20} y2={CENTER} stroke="#e2e8f0" />
          <line x1={CENTER} y1={CENTER - RADIUS - 20} x2={CENTER} y2={CENTER + RADIUS + 20} stroke="#e2e8f0" />

          {mds.map((point) => {
            const x = CENTER + point.x * scale;
            const y = CENTER - point.y * scale;
            const radius = Math.hypot(point.x, point.y);
            const offAxis = Math.abs(radius - 1);
            return (
              <g key={point.valueKey}>
            <circle cx={x} cy={y} r="6" fill="#0f766e" stroke="#083344" strokeWidth="1.5">
              <title>
                    {`${formatFullSchwartzValueName(point.valueKey as ValueKey)} · theoretical angle ${point.theoreticalAngleDeg.toFixed(0)}° · empirical (${point.x.toFixed(2)}, ${point.y.toFixed(2)}) · off-axis ${offAxis.toFixed(2)}`}
              </title>
            </circle>
                <text x={x + 8} y={y - 8} className="fill-gray-700 text-[10px] font-medium">
                  {VALUE_LABELS[point.valueKey as ValueKey]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {excludedValues.length > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          Excluded from the scatter: {excludedValues.map((valueKey) => VALUE_LABELS[valueKey]).join(', ')}.
        </p>
      )}
    </section>
  );
}

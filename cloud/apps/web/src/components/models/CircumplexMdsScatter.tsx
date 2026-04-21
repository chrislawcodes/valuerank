import type { CircumplexResult } from '../../api/operations/circumplex';
import { VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';
import { formatFullSchwartzValueName } from '../../utils/schwartz';

type Props = {
  results: CircumplexResult[];
};

const VIEW_BOX_WIDTH = 960;
const VIEW_BOX_HEIGHT = 640;
const CENTER_X = 360;
const CENTER_Y = 310;
const RADIUS = 180;
const LABEL_RADIUS = 236;

const SERIES_COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#c2410c', '#db2777', '#059669'];

function format(value: number): string {
  return value.toFixed(2);
}

function polarToCartesian(angleRadians: number, radius: number): { x: number; y: number } {
  return {
    x: CENTER_X + Math.cos(angleRadians) * radius,
    y: CENTER_Y - Math.sin(angleRadians) * radius,
  };
}

function labelAnchor(angleRadians: number): 'start' | 'middle' | 'end' {
  const cosine = Math.cos(angleRadians);
  if (cosine > 0.25) return 'start';
  if (cosine < -0.25) return 'end';
  return 'middle';
}

function buildPath(points: Array<{ x: number; y: number }>, closePath: boolean): string {
  if (points.length === 0) return '';
  const segments = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
  if (closePath && points.length > 2) {
    segments.push('Z');
  }
  return segments.join(' ');
}

export function CircumplexMdsScatter({ results }: Props) {
  if (results.length === 0) {
    return null;
  }

  const valueOrder = (results[0]?.valueOrder ?? []) as ValueKey[];
  const canonicalValues = valueOrder ?? [];
  const maxAbs = Math.max(
    1,
    ...results.flatMap((result) => (result.mds2d ?? []).flatMap((point) => [Math.abs(point.x), Math.abs(point.y)])),
  );
  const scale = RADIUS / maxAbs;
  const warnings = results.filter((result) => result.mdsWarning != null);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Classical MDS overlay</h2>
          <p className="text-sm text-gray-600">
            The dotted ring is the theoretical circumplex. Colored paths show the selected models, all aligned to the same value order.
          </p>
        </div>
        <p className="text-xs text-gray-500">Select more models below to layer them on the same circle.</p>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${VIEW_BOX_WIDTH} ${VIEW_BOX_HEIGHT}`}
          className="block h-auto w-full"
          data-testid="circumplex-overlay-chart"
          role="img"
          aria-label="Circumplex classical MDS overlay chart"
        >
          <circle cx={CENTER_X} cy={CENTER_Y} r={RADIUS} fill="none" stroke="#cbd5e1" strokeDasharray="5 5" />
          <line x1={CENTER_X - RADIUS - 24} y1={CENTER_Y} x2={CENTER_X + RADIUS + 24} y2={CENTER_Y} stroke="#e2e8f0" />
          <line x1={CENTER_X} y1={CENTER_Y - RADIUS - 24} x2={CENTER_X} y2={CENTER_Y + RADIUS + 24} stroke="#e2e8f0" />

          {canonicalValues.map((valueKey, index) => {
            const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / canonicalValues.length);
            const labelPoint = polarToCartesian(angle, LABEL_RADIUS);
            const guidePoint = polarToCartesian(angle, RADIUS);
            return (
              <g key={valueKey}>
                <circle cx={guidePoint.x} cy={guidePoint.y} r="4.5" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5">
                  <title>{formatFullSchwartzValueName(valueKey)}</title>
                </circle>
                <text
                  x={labelPoint.x}
                  y={labelPoint.y + 3}
                  textAnchor={labelAnchor(angle)}
                  className="fill-gray-700 text-[10px] font-medium"
                >
                  {VALUE_LABELS[valueKey]}
                </text>
              </g>
            );
          })}

          {results.map((result, seriesIndex) => {
            const color = SERIES_COLORS[seriesIndex % SERIES_COLORS.length]!;
            const pointCoords = (result.mds2d ?? []).map((point) => {
              const x = CENTER_X + point.x * scale;
              const y = CENTER_Y - point.y * scale;
              return { x, y, point };
            });
            const pathData = buildPath(pointCoords.map((entry) => ({ x: entry.x, y: entry.y })), true);
            const stressLabel = `stress ${format(result.mdsStress ?? 0)}`;

            return (
              <g key={result.modelId}>
                {pathData !== '' && (
                  <path
                    d={pathData}
                    fill="none"
                    stroke={color}
                    strokeWidth="2.5"
                    strokeOpacity="0.55"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}

                {pointCoords.map(({ x, y, point }) => (
                  <circle key={`${result.modelId}:${point.valueKey}`} cx={x} cy={y} r="5.5" fill={color} stroke="#ffffff" strokeWidth="1.5">
                    <title>
                      {`${result.modelLabel} · ${formatFullSchwartzValueName(point.valueKey as ValueKey)} · empirical (${point.x.toFixed(2)}, ${point.y.toFixed(2)}) · ${stressLabel}`}
                    </title>
                  </circle>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {results.map((result, index) => {
          const color = SERIES_COLORS[index % SERIES_COLORS.length]!;
          return (
            <div
              key={result.modelId}
              className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="font-medium">{result.modelLabel}</span>
              <span className="text-gray-500">{result.providerName}</span>
              <span className="text-gray-400">ρ {result.spearmanRho == null ? '—' : result.spearmanRho.toFixed(2)}</span>
              <span className="text-gray-400">stress {format(result.mdsStress ?? 0)}</span>
            </div>
          );
        })}
      </div>

      {warnings.length > 0 && (
        <p className="mt-3 text-xs text-amber-700">
          2D embedding warning for {warnings.map((result) => result.modelLabel).join(', ')}.
        </p>
      )}
    </section>
  );
}

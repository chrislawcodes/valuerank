import { useState } from 'react';
import { Button } from '../ui/Button';
import type { DirectionalSanityCheck } from '../../api/operations/pressureSensitivity';

type Props = {
  data: DirectionalSanityCheck;
};

const POSITIVE_THRESHOLD = 70;

export function PressureSensitivitySanityCheck({ data }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (data.measuredCount === 0) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5 text-sm text-gray-600">
        <h3 className="text-base font-semibold text-gray-900">Directional sanity check</h3>
        <p className="mt-1">
          No (model, value pair) combinations have a measurable Direction Δ yet. The sanity check
          requires at least one pair with both pressure bands populated to N ≥ 3.
        </p>
        {data.unmeasurableCount > 0 ? (
          <p className="mt-1 text-xs text-gray-500">
            {data.unmeasurableCount} pair{data.unmeasurableCount === 1 ? '' : 's'} unmeasurable due to insufficient band coverage.
          </p>
        ) : null}
      </section>
    );
  }

  const flagWarning = data.positivePct < POSITIVE_THRESHOLD;

  return (
    <section
      className={`rounded-xl border p-4 md:p-5 ${
        flagWarning ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-semibold text-gray-900">Directional sanity check</h3>
        <span className="text-xs text-gray-500">
          {data.measuredCount} measured · {data.unmeasurableCount} unmeasurable
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        Of (model, value pair) combinations with measurable Direction Δ, what share went in the
        expected direction (higher own pressure → higher own win rate)?
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-md border border-gray-200 bg-white p-2 text-center">
          <div className="text-xs uppercase tracking-wide text-gray-500">Positive</div>
          <div className="text-lg font-semibold text-emerald-700">{data.positivePct.toFixed(0)}%</div>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-2 text-center">
          <div className="text-xs uppercase tracking-wide text-gray-500">Flat</div>
          <div className="text-lg font-semibold text-gray-700">{data.flatPct.toFixed(0)}%</div>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-2 text-center">
          <div className="text-xs uppercase tracking-wide text-gray-500">Negative</div>
          <div className="text-lg font-semibold text-rose-700">{data.negativePct.toFixed(0)}%</div>
        </div>
      </div>

      {flagWarning && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-100 p-2 text-xs text-amber-900">
          Below 70% positive direction — interpret the rest of this report cautiously. Pressure
          may not be moving the model as the vignette design intended for many pairs.
        </p>
      )}

      <div className="mt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          className="!min-h-0 !px-1 !py-0 !text-xs"
        >
          {expanded ? 'Hide breakdown' : 'Show breakdown'}
        </Button>
        {expanded && data.breakdown.length > 0 && (
          <div className="mt-2 max-h-72 overflow-auto rounded-md border border-gray-200 bg-white p-2 text-xs">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-1">Model</th>
                  <th className="px-2 py-1">Pair</th>
                  <th className="px-2 py-1">Direction Δ</th>
                  <th className="px-2 py-1">Class</th>
                </tr>
              </thead>
              <tbody>
                {[...data.breakdown]
                  .sort((a, b) => Math.abs(b.directionDelta) - Math.abs(a.directionDelta))
                  .map((entry) => (
                    <tr key={`${entry.modelId}::${entry.pairKey}`} className="border-t border-gray-100">
                      <td className="px-2 py-1 font-mono">{entry.modelId}</td>
                      <td className="px-2 py-1 font-mono">{entry.pairKey}</td>
                      <td className="px-2 py-1 font-mono">
                        {entry.directionDelta > 0 ? '+' : ''}
                        {entry.directionDelta.toFixed(3)}
                      </td>
                      <td
                        className={`px-2 py-1 ${
                          entry.classification === 'positive'
                            ? 'text-emerald-700'
                            : entry.classification === 'negative'
                              ? 'text-rose-700'
                              : 'text-gray-600'
                        }`}
                      >
                        {entry.classification}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

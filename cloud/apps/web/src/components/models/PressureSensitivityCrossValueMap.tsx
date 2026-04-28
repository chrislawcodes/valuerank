import { useMemo } from 'react';
import type { PressureSensitivityModel } from '../../api/operations/pressureSensitivity';

type Props = {
  models: PressureSensitivityModel[];
};

function colorFor(value: number | null | undefined): string {
  if (value == null) return '#f3f4f6';
  // |netScoreDelta| ranges 0..2; saturate at 1.0 for visual range
  const intensity = Math.max(0, Math.min(1, Math.abs(value)));
  return `hsl(218, 70%, ${100 - intensity * 35}%)`;
}

export function PressureSensitivityCrossValueMap({ models }: Props) {
  // Collect all distinct pair keys across models
  const { pairKeys, cellByModelAndPair } = useMemo(() => {
    const keys = new Set<string>();
    const byModel = new Map<string, Map<string, { value: number | null; lowData: boolean }>>();
    for (const model of models) {
      const inner = new Map<string, { value: number | null; lowData: boolean }>();
      for (const pair of model.valuePairs) {
        keys.add(pair.pairKey);
        const value = pair.netScoreDelta.value ?? null;
        const lowData = value == null;
        inner.set(pair.pairKey, { value: value != null ? Math.abs(value) : null, lowData });
      }
      byModel.set(model.modelId, inner);
    }
    return {
      pairKeys: [...keys].sort(),
      cellByModelAndPair: byModel,
    };
  }, [models]);

  if (models.length === 0 || pairKeys.length === 0) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5 text-sm text-gray-600">
        Cross-value heat map needs at least one model with measured pairs.
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Sensitivity by value pair</h2>
        <p className="text-sm text-gray-600">
          Is sensitivity a model trait or value-specific? A row that is uniformly dark or light
          reads as a trait; a row that varies wildly reads as value-specific.
        </p>
      </div>

      <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <strong>Heads up:</strong> pressure levels are not calibrated across vignettes — direct
        comparison of |Δ| across pair columns is suspect. Use this view to spot patterns within
        a model row, not to rank pairs against each other.
      </div>

      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white px-3 py-1 text-left text-[11px] font-medium uppercase tracking-wide text-gray-500">
                Model
              </th>
              {pairKeys.map((key) => (
                <th
                  key={key}
                  className="px-2 py-1 text-[10px] font-mono text-gray-500"
                  title={key}
                >
                  {key.replace('::', ' ↔ ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((model) => {
              const inner = cellByModelAndPair.get(model.modelId) ?? new Map();
              return (
                <tr key={model.modelId}>
                  <th className="sticky left-0 bg-white px-3 py-1 text-left text-xs font-medium text-gray-900">
                    {model.label}
                  </th>
                  {pairKeys.map((key) => {
                    const entry = inner.get(key);
                    if (entry == null || entry.lowData) {
                      return (
                        <td
                          key={key}
                          className="h-9 w-14 border border-gray-100 bg-gray-50 text-center text-[10px] text-gray-300"
                          title={`${model.label} ${key}: low data`}
                        >
                          ·
                        </td>
                      );
                    }
                    return (
                      <td
                        key={key}
                        className="h-9 w-14 border border-white text-center text-[11px] font-mono text-gray-900"
                        style={{ backgroundColor: colorFor(entry.value) }}
                        title={`${model.label} ${key}: |netScore Δ| = ${entry.value?.toFixed(3)}`}
                      >
                        {entry.value != null ? entry.value.toFixed(2) : '—'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

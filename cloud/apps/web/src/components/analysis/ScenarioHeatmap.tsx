/**
 * ScenarioHeatmap Component
 *
 * Heatmap showing how models behave across different scenarios.
 * Green = low decisions (1-2), Yellow = neutral (3), Red = high (4-5).
 */

import { useMemo } from 'react';
import type { VisualizationData } from '../../api/operations/analysis';

type ScenarioHeatmapProps = {
  visualizationData: VisualizationData;
};

/**
 * Calculate color for heatmap cell based on decision value.
 */
function getColor(value: number): string {
  if (value === 0) return '#f3f4f6';
  // Green (1) to Red (5) gradient
  const ratio = (value - 1) / 4;
  const r = Math.round(34 + (239 - 34) * ratio);
  const g = Math.round(197 - (197 - 68) * ratio);
  const b = Math.round(94 - (94 - 68) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

export function ScenarioHeatmap({ visualizationData }: ScenarioHeatmapProps) {
  const { modelScenarioMatrix } = visualizationData;

  // Extract models and scenarios
  const models = useMemo(
    () => Object.keys(modelScenarioMatrix || {}),
    [modelScenarioMatrix]
  );

  const scenarios = useMemo(() => {
    const scenarioSet = new Set<string>();
    Object.values(modelScenarioMatrix || {}).forEach((scenarios) => {
      Object.keys(scenarios).forEach((s) => scenarioSet.add(s));
    });
    return Array.from(scenarioSet).sort().slice(0, 20); // Limit to first 20
  }, [modelScenarioMatrix]);

  // Calculate scenario insights
  const scenarioInsights = useMemo(() => {
    const scenarioVariances = scenarios.map((scenario) => {
      const values = models
        .map((m) => modelScenarioMatrix[m]?.[scenario] || 0)
        .filter((v) => v > 0);

      if (values.length < 2) return { scenario, variance: Infinity };

      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
      return { scenario, variance };
    });

    const sorted = scenarioVariances.filter((s) => s.variance !== Infinity);
    const highestAgreement = sorted.sort((a, b) => a.variance - b.variance)[0];
    const highestDisagreement = sorted.sort((a, b) => b.variance - a.variance)[0];

    return { highestAgreement, highestDisagreement };
  }, [scenarios, models, modelScenarioMatrix]);

  if (!modelScenarioMatrix || models.length === 0 || scenarios.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No scenario data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-700">Model Behavior by Scenario</h3>
        <p className="text-xs text-gray-500 mt-1">
          Heatmap showing average decision per model (rows) across scenarios (columns).
          Green = lower (1-2), Yellow = neutral (3), Red = higher (4-5).
        </p>
      </div>

      <div className="overflow-auto max-h-[400px]">
        <div className="min-w-max">
          {/* Header row */}
          <div className="flex">
            <div className="w-36 flex-shrink-0" /> {/* Empty corner */}
            {scenarios.map((scenario) => (
              <div
                key={scenario}
                className="w-12 h-20 flex items-end justify-center pb-2"
              >
                <span
                  className="text-[10px] text-gray-500 transform -rotate-45 origin-bottom-left whitespace-nowrap"
                  title={scenario}
                >
                  {scenario.length > 8 ? scenario.slice(0, 6) + '..' : scenario}
                </span>
              </div>
            ))}
          </div>

          {/* Data rows */}
          {models.map((model) => (
            <div key={model} className="flex items-center">
              <div
                className="w-36 flex-shrink-0 pr-2 text-xs text-right truncate"
                title={model}
              >
                {model.length > 20 ? model.slice(0, 18) + '...' : model}
              </div>
              {scenarios.map((scenario) => {
                const value = modelScenarioMatrix[model]?.[scenario] || 0;
                return (
                  <div
                    key={`${model}-${scenario}`}
                    className="w-12 h-8 flex items-center justify-center border border-gray-100"
                    style={{ backgroundColor: getColor(value) }}
                    title={`${model} on ${scenario}: ${value.toFixed(2)}`}
                  >
                    <span className="text-[10px] font-medium text-gray-700">
                      {value > 0 ? value.toFixed(1) : '-'}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Color legend */}
      <div className="flex items-center justify-center gap-4">
        <span className="text-xs text-gray-500">Low (1)</span>
        <div className="flex">
          {[1, 2, 3, 4, 5].map((v) => (
            <div
              key={v}
              className="w-8 h-4"
              style={{ backgroundColor: getColor(v) }}
            />
          ))}
        </div>
        <span className="text-xs text-gray-500">High (5)</span>
      </div>

      {/* Insights */}
      {(scenarioInsights.highestAgreement || scenarioInsights.highestDisagreement) && (
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Highest agreement:</p>
            <p className="font-medium text-sm text-green-700 truncate" title={scenarioInsights.highestAgreement?.scenario}>
              {scenarioInsights.highestAgreement?.scenario || 'N/A'}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Highest disagreement:</p>
            <p className="font-medium text-sm text-amber-700 truncate" title={scenarioInsights.highestDisagreement?.scenario}>
              {scenarioInsights.highestDisagreement?.scenario || 'N/A'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

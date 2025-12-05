import type { AggregateData } from '../../lib/api';

// Scenario Heatmap - Shows how models behave across different scenarios
export function ScenarioHeatmap({ data }: { data: AggregateData }) {
  const scenarios = data.scenarios.slice(0, 20); // Limit to first 20 scenarios for visibility
  const models = data.models;

  // Calculate color for heatmap cell
  const getColor = (value: number) => {
    if (value === 0) return '#f3f4f6';
    // Green (1) to Red (5) gradient
    const ratio = (value - 1) / 4;
    const r = Math.round(34 + (239 - 34) * ratio);
    const g = Math.round(197 - (197 - 68) * ratio);
    const b = Math.round(94 - (94 - 68) * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold mb-2">Model Behavior by Scenario</h3>
      <p className="text-sm text-gray-500 mb-6">
        Heatmap showing average decision per model (rows) across scenarios (columns).
        Green = lower decisions (1-2), Yellow = neutral (3), Red = higher decisions (4-5).
      </p>

      <div className="overflow-auto">
        <div className="min-w-max">
          {/* Header row */}
          <div className="flex">
            <div className="w-40 flex-shrink-0" /> {/* Empty corner */}
            {scenarios.map((scenario) => (
              <div
                key={scenario}
                className="w-12 h-24 flex items-end justify-center pb-2"
              >
                <span
                  className="text-xs text-gray-500 transform -rotate-45 origin-bottom-left whitespace-nowrap"
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
                className="w-40 flex-shrink-0 pr-3 text-sm text-right truncate"
                title={model}
              >
                {model.length > 20 ? model.slice(0, 18) + '...' : model}
              </div>
              {scenarios.map((scenario) => {
                const value = data.modelScenarioMatrix[model]?.[scenario] || 0;
                return (
                  <div
                    key={`${model}-${scenario}`}
                    className="w-12 h-10 flex items-center justify-center border border-gray-100"
                    style={{ backgroundColor: getColor(value) }}
                    title={`${model} on ${scenario}: ${value.toFixed(2)}`}
                  >
                    <span className="text-xs font-medium text-gray-700">
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
      <div className="mt-6 flex items-center justify-center gap-4">
        <span className="text-sm text-gray-500">Low (1)</span>
        <div className="flex">
          {[1, 2, 3, 4, 5].map((v) => (
            <div
              key={v}
              className="w-8 h-4"
              style={{ backgroundColor: getColor(v) }}
            />
          ))}
        </div>
        <span className="text-sm text-gray-500">High (5)</span>
      </div>

      {/* Scenario insights */}
      {scenarios.length > 0 && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-3">Scenario Insights</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 mb-1">Highest model agreement:</p>
              {(() => {
                // Find scenario with lowest variance across models
                const scenarioVariances = scenarios.map((scenario) => {
                  const values = models
                    .map((m) => data.modelScenarioMatrix[m]?.[scenario] || 0)
                    .filter((v) => v > 0);
                  if (values.length < 2) return { scenario, variance: Infinity };
                  const avg = values.reduce((a, b) => a + b, 0) / values.length;
                  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
                  return { scenario, variance };
                });
                const best = scenarioVariances.sort((a, b) => a.variance - b.variance)[0];
                return best ? (
                  <p className="font-medium text-green-700">{best.scenario}</p>
                ) : (
                  <p className="text-gray-400">N/A</p>
                );
              })()}
            </div>
            <div>
              <p className="text-gray-500 mb-1">Highest model disagreement:</p>
              {(() => {
                const scenarioVariances = scenarios.map((scenario) => {
                  const values = models
                    .map((m) => data.modelScenarioMatrix[m]?.[scenario] || 0)
                    .filter((v) => v > 0);
                  if (values.length < 2) return { scenario, variance: -1 };
                  const avg = values.reduce((a, b) => a + b, 0) / values.length;
                  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
                  return { scenario, variance };
                });
                const worst = scenarioVariances.sort((a, b) => b.variance - a.variance)[0];
                return worst && worst.variance > 0 ? (
                  <p className="font-medium text-amber-700">{worst.scenario}</p>
                ) : (
                  <p className="text-gray-400">N/A</p>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

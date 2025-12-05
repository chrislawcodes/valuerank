import { useState, useMemo } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  ScatterChart,
  Scatter,
  ZAxis,
  Line,
} from 'recharts';
import type { ExtendedAggregateData } from './types';
import { MODEL_COLORS } from './constants';

// Dimension Analysis - Shows how dimensions correlate with model decisions
export function DimensionAnalysis({ data }: { data: ExtendedAggregateData }) {
  const [selectedDimension, setSelectedDimension] = useState<string>(
    data.dimensionColumns[0] || ''
  );
  const [showCorrelationMatrix, setShowCorrelationMatrix] = useState(false);

  const rows = data.rawRows || [];
  const models = data.models;
  const dimensions = data.dimensionColumns;

  // Calculate data for the selected dimension impact chart
  const dimensionImpactData = useMemo(() => {
    if (!selectedDimension || rows.length === 0) return [];

    // Get unique dimension values
    const dimValues = [...new Set(rows.map(r => r[selectedDimension]).filter(Boolean))]
      .map(v => parseInt(v))
      .filter(v => !isNaN(v))
      .sort((a, b) => a - b);

    // For each dimension value, calculate average decision per model
    return dimValues.map(dimVal => {
      const point: Record<string, number | string> = { dimensionValue: dimVal };

      // Calculate average for each model
      const modelDecisions: number[] = [];
      for (const model of models) {
        const modelRows = rows.filter(
          r => r['AI Model Name'] === model && parseInt(r[selectedDimension]) === dimVal
        );
        const decisions = modelRows
          .map(r => parseInt(r['Decision Code']))
          .filter(d => !isNaN(d));

        if (decisions.length > 0) {
          const avg = decisions.reduce((a, b) => a + b, 0) / decisions.length;
          point[model] = avg;
          modelDecisions.push(avg);
        }
      }

      // Calculate model divergence (std dev across models at this dimension value)
      if (modelDecisions.length > 1) {
        const avgAcrossModels = modelDecisions.reduce((a, b) => a + b, 0) / modelDecisions.length;
        const variance = modelDecisions.reduce((sum, d) => sum + Math.pow(d - avgAcrossModels, 2), 0) / modelDecisions.length;
        point.divergence = Math.sqrt(variance);
      } else {
        point.divergence = 0;
      }

      return point;
    });
  }, [selectedDimension, rows, models]);

  // Calculate correlation matrix (dimension x model)
  const correlationMatrix = useMemo(() => {
    if (rows.length === 0) return { dimensions: [], models: [], matrix: {} as Record<string, Record<string, number>> };

    const matrix: Record<string, Record<string, number>> = {};

    for (const dim of dimensions) {
      matrix[dim] = {};
      for (const model of models) {
        // Get all rows for this model with valid dimension and decision values
        const modelRows = rows.filter(r => r['AI Model Name'] === model);
        const pairs = modelRows
          .map(r => ({
            dimVal: parseInt(r[dim]),
            decision: parseInt(r['Decision Code']),
          }))
          .filter(p => !isNaN(p.dimVal) && !isNaN(p.decision));

        if (pairs.length < 2) {
          matrix[dim][model] = 0;
          continue;
        }

        // Calculate Pearson correlation
        const n = pairs.length;
        const sumX = pairs.reduce((s, p) => s + p.dimVal, 0);
        const sumY = pairs.reduce((s, p) => s + p.decision, 0);
        const sumXY = pairs.reduce((s, p) => s + p.dimVal * p.decision, 0);
        const sumX2 = pairs.reduce((s, p) => s + p.dimVal * p.dimVal, 0);
        const sumY2 = pairs.reduce((s, p) => s + p.decision * p.decision, 0);

        const numerator = n * sumXY - sumX * sumY;
        const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

        matrix[dim][model] = denominator === 0 ? 0 : numerator / denominator;
      }
    }

    return { dimensions, models, matrix };
  }, [rows, dimensions, models]);

  // Find strongest correlations
  const strongestCorrelations = useMemo(() => {
    const allCorrelations: { dim: string; model: string; corr: number }[] = [];
    for (const dim of dimensions) {
      for (const model of models) {
        const corr = correlationMatrix.matrix[dim]?.[model] || 0;
        allCorrelations.push({ dim, model, corr });
      }
    }
    return allCorrelations.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr)).slice(0, 5);
  }, [correlationMatrix, dimensions, models]);

  // Find most divisive dimensions (highest variance in correlations across models)
  const divisiveDimensions = useMemo(() => {
    return dimensions.map(dim => {
      const correlations = models.map(m => correlationMatrix.matrix[dim]?.[m] || 0);
      const avg = correlations.reduce((a, b) => a + b, 0) / correlations.length;
      const variance = correlations.reduce((s, c) => s + Math.pow(c - avg, 2), 0) / correlations.length;
      return { dim, variance: Math.sqrt(variance), avgCorr: avg };
    }).sort((a, b) => b.variance - a.variance);
  }, [correlationMatrix, dimensions, models]);

  // Color for correlation values (-1 to 1)
  const getCorrelationColor = (value: number) => {
    if (value === 0) return '#f3f4f6';
    // Blue (negative) to White (0) to Red (positive)
    const absVal = Math.abs(value);
    if (value < 0) {
      // Blue gradient
      const intensity = Math.round(255 * (1 - absVal));
      return `rgb(${intensity}, ${intensity}, 255)`;
    } else {
      // Red gradient
      const intensity = Math.round(255 * (1 - absVal));
      return `rgb(255, ${intensity}, ${intensity})`;
    }
  };

  if (dimensions.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <p className="text-gray-500 text-center">
          No dimension columns found in the data. Ensure your CSV has dimension columns beyond the standard fields.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dimension Impact Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Dimension Impact on Decisions</h3>
            <p className="text-sm text-gray-500 mt-1">
              How model decisions change as the selected dimension value increases
            </p>
          </div>
          <select
            value={selectedDimension}
            onChange={(e) => setSelectedDimension(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {dimensions.map(dim => (
              <option key={dim} value={dim}>{dim}</option>
            ))}
          </select>
        </div>

        {dimensionImpactData.length > 0 ? (
          <>
            <div style={{ height: 400 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dimensionImpactData} margin={{ left: 20, right: 30, top: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="dimensionValue"
                    label={{ value: selectedDimension, position: 'bottom', offset: -5 }}
                  />
                  <YAxis
                    domain={[1, 5]}
                    ticks={[1, 2, 3, 4, 5]}
                    label={{ value: 'Decision', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-w-sm">
                          <p className="font-semibold mb-2">{selectedDimension} = {label}</p>
                          <div className="space-y-1 text-sm">
                            {payload
                              .filter(p => p.name !== 'divergence')
                              .map((p, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded" style={{ backgroundColor: p.color }} />
                                  <span className="truncate flex-1">{p.name}:</span>
                                  <span className="font-medium">{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: 20 }} />
                  {models.map((model, idx) => (
                    <Line
                      key={model}
                      type="monotone"
                      dataKey={model}
                      stroke={MODEL_COLORS[idx % MODEL_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      connectNulls
                      name={model.length > 25 ? model.slice(0, 23) + '...' : model}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Divergence bar below the chart */}
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-2">Model Divergence (higher = more disagreement)</p>
              <div className="flex items-end gap-1 h-12">
                {dimensionImpactData.map((d, i) => {
                  const divergence = d.divergence as number;
                  const maxDiv = Math.max(...dimensionImpactData.map(x => x.divergence as number));
                  const height = maxDiv > 0 ? (divergence / maxDiv) * 100 : 0;
                  return (
                    <div
                      key={i}
                      className="flex-1 flex flex-col items-center"
                      title={`${selectedDimension}=${d.dimensionValue}: divergence=${divergence.toFixed(2)}`}
                    >
                      <div
                        className="w-full bg-amber-400 rounded-t"
                        style={{ height: `${height}%`, minHeight: height > 0 ? 4 : 0 }}
                      />
                      <span className="text-xs text-gray-500 mt-1">{d.dimensionValue}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <p className="text-gray-400 text-center py-8">No data available for this dimension</p>
        )}
      </div>

      {/* Correlation Matrix Toggle */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Dimension-Model Correlations</h3>
            <p className="text-sm text-gray-500 mt-1">
              How strongly each dimension correlates with each model's decisions
            </p>
          </div>
          <button
            onClick={() => setShowCorrelationMatrix(!showCorrelationMatrix)}
            className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            {showCorrelationMatrix ? 'Hide Matrix' : 'Show Full Matrix'}
          </button>
        </div>

        {/* Key insights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="font-medium text-blue-800 mb-2">Strongest Correlations</h4>
            <div className="space-y-2">
              {strongestCorrelations.map((c, i) => (
                <div key={i} className="text-sm flex items-center justify-between">
                  <span className="text-blue-700">
                    {c.dim} → {c.model.length > 20 ? c.model.slice(0, 18) + '...' : c.model}
                  </span>
                  <span className={`font-mono font-medium ${c.corr >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
                    {c.corr >= 0 ? '+' : ''}{c.corr.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-purple-50 rounded-lg p-4">
            <h4 className="font-medium text-purple-800 mb-2">Most Divisive Dimensions</h4>
            <p className="text-xs text-purple-600 mb-2">Models disagree most about these dimensions</p>
            <div className="space-y-2">
              {divisiveDimensions.slice(0, 3).map((d, i) => (
                <div key={i} className="text-sm flex items-center justify-between">
                  <span className="text-purple-700">{d.dim}</span>
                  <span className="font-mono text-purple-600">
                    spread: {d.variance.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Full correlation matrix */}
        {showCorrelationMatrix && (
          <div className="overflow-auto">
            <div className="min-w-max">
              {/* Header row */}
              <div className="flex">
                <div className="w-40 flex-shrink-0" />
                {models.map(model => (
                  <div
                    key={model}
                    className="w-20 h-24 flex items-end justify-center pb-2"
                  >
                    <span
                      className="text-xs text-gray-500 transform -rotate-45 origin-bottom-left whitespace-nowrap truncate"
                      style={{ maxWidth: 100 }}
                      title={model}
                    >
                      {model.length > 12 ? model.slice(0, 10) + '..' : model}
                    </span>
                  </div>
                ))}
              </div>

              {/* Data rows */}
              {dimensions.map(dim => (
                <div key={dim} className="flex items-center">
                  <div
                    className="w-40 flex-shrink-0 pr-3 text-sm text-right truncate"
                    title={dim}
                  >
                    {dim}
                  </div>
                  {models.map(model => {
                    const corr = correlationMatrix.matrix[dim]?.[model] || 0;
                    return (
                      <div
                        key={`${dim}-${model}`}
                        className="w-20 h-10 flex items-center justify-center border border-gray-100"
                        style={{ backgroundColor: getCorrelationColor(corr) }}
                        title={`${dim} × ${model}: r=${corr.toFixed(3)}`}
                      >
                        <span className="text-xs font-medium text-gray-700">
                          {corr.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="mt-4 flex items-center justify-center gap-4">
              <span className="text-sm text-gray-500">Negative (-1)</span>
              <div className="flex">
                {[-1, -0.5, 0, 0.5, 1].map(v => (
                  <div
                    key={v}
                    className="w-10 h-4"
                    style={{ backgroundColor: getCorrelationColor(v) }}
                  />
                ))}
              </div>
              <span className="text-sm text-gray-500">Positive (+1)</span>
            </div>
            <p className="text-xs text-gray-400 text-center mt-2">
              Positive correlation: higher dimension value → higher decision value
            </p>
          </div>
        )}
      </div>

      {/* Scatter plot for detailed exploration */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-2">Decision Scatter by Dimension</h3>
        <p className="text-sm text-gray-500 mb-4">
          Individual decisions plotted against {selectedDimension} values, colored by model
        </p>

        <div style={{ height: 350 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ left: 20, right: 30, top: 20, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="x"
                name={selectedDimension}
                domain={['dataMin', 'dataMax']}
                label={{ value: selectedDimension, position: 'bottom', offset: 0 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Decision"
                domain={[1, 5]}
                ticks={[1, 2, 3, 4, 5]}
                label={{ value: 'Decision', angle: -90, position: 'insideLeft' }}
              />
              <ZAxis type="number" dataKey="z" range={[50, 200]} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload;
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 text-sm">
                      <p className="font-medium">{p.model}</p>
                      <p>{selectedDimension}: {p.x}</p>
                      <p>Decision: {p.y}</p>
                      <p className="text-gray-500">({p.z} occurrences)</p>
                    </div>
                  );
                }}
              />
              <Legend />
              {models.map((model, idx) => {
                // Aggregate data points to avoid too many dots
                const modelRows = rows.filter(r => r['AI Model Name'] === model);
                const aggregated: Record<string, { x: number; y: number; count: number }> = {};

                modelRows.forEach(r => {
                  const x = parseInt(r[selectedDimension]);
                  const y = parseInt(r['Decision Code']);
                  if (!isNaN(x) && !isNaN(y)) {
                    const key = `${x}-${y}`;
                    if (!aggregated[key]) {
                      aggregated[key] = { x, y, count: 0 };
                    }
                    aggregated[key].count++;
                  }
                });

                const scatterData = Object.values(aggregated).map(p => ({
                  x: p.x,
                  y: p.y,
                  z: p.count,
                  model,
                }));

                return (
                  <Scatter
                    key={model}
                    name={model.length > 20 ? model.slice(0, 18) + '...' : model}
                    data={scatterData}
                    fill={MODEL_COLORS[idx % MODEL_COLORS.length]}
                    fillOpacity={0.7}
                  />
                );
              })}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

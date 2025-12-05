import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ComposedChart,
  Line,
} from 'recharts';
import { analysis, type AggregateData, type AnalysisRun } from '../lib/api';
import { FolderOpen, BarChart3, TrendingUp, Grid3X3, RefreshCw } from 'lucide-react';

type VisualizationType = 'decision-dist' | 'model-variance' | 'scenario-heatmap';

const MODEL_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
];

export function Analyze() {
  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<string>('');
  const [data, setData] = useState<AggregateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeViz, setActiveViz] = useState<VisualizationType>('decision-dist');

  // Load available runs
  useEffect(() => {
    loadRuns();
  }, []);

  // Load data when run is selected
  useEffect(() => {
    if (selectedRun) {
      loadData(selectedRun);
    }
  }, [selectedRun]);

  const loadRuns = async () => {
    try {
      const result = await analysis.getRuns();
      setRuns(result.runs);
      if (result.runs.length > 0 && !selectedRun) {
        setSelectedRun(result.runs[0].name);
      }
    } catch (err) {
      setError('Failed to load runs: ' + String(err));
    }
  };

  const loadData = async (runPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await analysis.getAggregate(runPath);
      setData(result);
    } catch (err) {
      setError('Failed to load data: ' + String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const vizOptions: { id: VisualizationType; label: string; icon: React.ReactNode }[] = [
    { id: 'decision-dist', label: 'Decision Distribution', icon: <BarChart3 size={16} /> },
    { id: 'model-variance', label: 'Model Consistency', icon: <TrendingUp size={16} /> },
    { id: 'scenario-heatmap', label: 'Scenario Comparison', icon: <Grid3X3 size={16} /> },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-900">Analysis</h2>

            {/* Run Selector */}
            <div className="flex items-center gap-2">
              <FolderOpen size={16} className="text-gray-400" />
              <select
                value={selectedRun}
                onChange={(e) => setSelectedRun(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {runs.length === 0 && <option value="">No runs available</option>}
                {runs.map((run) => (
                  <option key={run.name} value={run.name}>
                    {run.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => loadRuns()}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                title="Refresh runs"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          {/* Data Summary */}
          {data && (
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span>{data.models.length} models</span>
              <span>{data.scenarios.length} scenarios</span>
              <span>{data.totalRows.toLocaleString()} data points</span>
            </div>
          )}
        </div>

        {/* Visualization Type Tabs */}
        <div className="flex gap-1 mt-4">
          {vizOptions.map((viz) => (
            <button
              key={viz.id}
              onClick={() => setActiveViz(viz.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                activeViz === viz.id
                  ? 'bg-gray-100 text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {viz.icon}
              {viz.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-4">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-3 text-gray-500">
              <RefreshCw size={20} className="animate-spin" />
              Loading data...
            </div>
          </div>
        )}

        {!loading && !data && !error && (
          <div className="flex items-center justify-center h-64 text-gray-400">
            <div className="text-center">
              <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
              <p>Select a run to analyze</p>
            </div>
          </div>
        )}

        {!loading && data && (
          <>
            {activeViz === 'decision-dist' && <DecisionDistribution data={data} />}
            {activeViz === 'model-variance' && <ModelVariance data={data} />}
            {activeViz === 'scenario-heatmap' && <ScenarioHeatmap data={data} />}
          </>
        )}
      </div>
    </div>
  );
}

// Decision Distribution Chart - Shows how each model distributes across decision codes
function DecisionDistribution({ data }: { data: AggregateData }) {
  // Transform data for stacked bar chart
  const chartData = data.models.map((model, idx) => {
    const dist = data.modelDecisionDist[model] || {};
    return {
      model: model.length > 20 ? model.slice(0, 18) + '...' : model,
      fullName: model,
      '1': dist['1'] || 0,
      '2': dist['2'] || 0,
      '3': dist['3'] || 0,
      '4': dist['4'] || 0,
      '5': dist['5'] || 0,
      color: MODEL_COLORS[idx % MODEL_COLORS.length],
    };
  });

  const decisionColors = {
    '1': '#22c55e', // green - strong agree
    '2': '#86efac', // light green
    '3': '#fbbf24', // yellow - neutral
    '4': '#fb923c', // light red
    '5': '#ef4444', // red - strong disagree
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold mb-2">Decision Distribution by Model</h3>
      <p className="text-sm text-gray-500 mb-6">
        Shows how each model distributes its decisions across the 1-5 scale
      </p>

      <div style={{ height: Math.max(400, data.models.length * 50) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 120, right: 30, top: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
            <XAxis type="number" />
            <YAxis type="category" dataKey="model" width={110} tick={{ fontSize: 12 }} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const item = payload[0].payload;
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                    <p className="font-semibold mb-2">{item.fullName}</p>
                    <div className="space-y-1 text-sm">
                      {['1', '2', '3', '4', '5'].map((d) => (
                        <div key={d} className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: decisionColors[d as keyof typeof decisionColors] }}
                          />
                          <span>Decision {d}:</span>
                          <span className="font-medium">{item[d]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }}
            />
            <Legend />
            {['1', '2', '3', '4', '5'].map((d) => (
              <Bar
                key={d}
                dataKey={d}
                stackId="a"
                fill={decisionColors[d as keyof typeof decisionColors]}
                name={`Decision ${d}`}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Model Variance Chart - Shows average decision with variance for clustering analysis
function ModelVariance({ data }: { data: AggregateData }) {
  const chartData = data.models.map((model, idx) => ({
    model: model.length > 15 ? model.slice(0, 13) + '...' : model,
    fullName: model,
    avg: data.modelAvgDecision[model] || 0,
    variance: data.modelVariance[model] || 0,
    color: MODEL_COLORS[idx % MODEL_COLORS.length],
    x: idx,
  }));

  // Sort by average decision
  chartData.sort((a, b) => a.avg - b.avg);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold mb-2">Model Decision Consistency</h3>
      <p className="text-sm text-gray-500 mb-6">
        Average decision (bar) and standard deviation (error bar) for each model. Lower variance = more consistent behavior.
      </p>

      <div style={{ height: 400 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ left: 20, right: 30, top: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="model"
              angle={-45}
              textAnchor="end"
              height={80}
              tick={{ fontSize: 11 }}
            />
            <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const item = payload[0].payload;
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                    <p className="font-semibold mb-2">{item.fullName}</p>
                    <div className="space-y-1 text-sm">
                      <p>Average: <span className="font-medium">{item.avg.toFixed(2)}</span></p>
                      <p>Std Dev: <span className="font-medium">{item.variance.toFixed(2)}</span></p>
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="avg" name="Average Decision">
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
            <Line
              type="monotone"
              dataKey="variance"
              stroke="#6b7280"
              strokeWidth={2}
              dot={{ r: 4, fill: '#6b7280' }}
              name="Std Deviation"
              yAxisId={0}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Clustering insights */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="bg-green-50 rounded-lg p-4">
          <h4 className="font-medium text-green-800 mb-2">Most Consistent</h4>
          <div className="space-y-1">
            {[...chartData]
              .sort((a, b) => a.variance - b.variance)
              .slice(0, 3)
              .map((m) => (
                <div key={m.fullName} className="text-sm text-green-700 flex justify-between">
                  <span>{m.fullName}</span>
                  <span className="font-mono">{m.variance.toFixed(2)}</span>
                </div>
              ))}
          </div>
        </div>
        <div className="bg-amber-50 rounded-lg p-4">
          <h4 className="font-medium text-amber-800 mb-2">Most Variable</h4>
          <div className="space-y-1">
            {[...chartData]
              .sort((a, b) => b.variance - a.variance)
              .slice(0, 3)
              .map((m) => (
                <div key={m.fullName} className="text-sm text-amber-700 flex justify-between">
                  <span>{m.fullName}</span>
                  <span className="font-mono">{m.variance.toFixed(2)}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Scenario Heatmap - Shows how models behave across different scenarios
function ScenarioHeatmap({ data }: { data: AggregateData }) {
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

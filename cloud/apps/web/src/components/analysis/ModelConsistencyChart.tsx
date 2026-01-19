/**
 * ModelConsistencyChart Component
 *
 * Shows average decision and standard deviation for each model.
 * Helps identify which models are most consistent vs variable.
 *
 * For multi-sample runs, displays error bars representing within-scenario variance.
 */

import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ComposedChart,
  Line,
  ErrorBar,
} from 'recharts';
import type { PerModelStats, VarianceAnalysis } from '../../api/operations/analysis';

type ModelConsistencyChartProps = {
  perModel: Record<string, PerModelStats>;
  varianceAnalysis?: VarianceAnalysis | null;
};

type ChartDataPoint = {
  model: string;
  fullName: string;
  avg: number;
  variance: number;
  color: string;
  // Multi-sample variance data (when available)
  multiSampleVariance?: number;
  consistencyScore?: number;
  errorBarValue?: number;
};

// Color palette for different models
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

/**
 * Custom tooltip component.
 */
function CustomTooltip({ active, payload, isMultiSample }: {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
  isMultiSample?: boolean;
}) {
  if (!active || !payload?.[0]) return null;

  const data = payload[0].payload;

  return (
    <div className="bg-white p-3 shadow-lg rounded-lg border border-gray-200">
      <p className="font-medium text-gray-900 mb-2">{data.fullName}</p>
      <div className="space-y-1 text-sm text-gray-600">
        <p>Average: <span className="font-medium">{data.avg.toFixed(2)}</span></p>
        <p>Std Dev (across scenarios): <span className="font-medium">{data.variance.toFixed(2)}</span></p>
        {isMultiSample && data.multiSampleVariance !== undefined && (
          <>
            <div className="border-t border-gray-200 my-2 pt-2">
              <p className="text-xs font-medium text-purple-700 mb-1">Multi-Sample Variance</p>
              <p>Within-scenario StdDev: <span className="font-medium">{data.multiSampleVariance.toFixed(3)}</span></p>
              {data.consistencyScore !== undefined && (
                <p>Consistency Score: <span className="font-medium">{(data.consistencyScore * 100).toFixed(1)}%</span></p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ModelConsistencyChart({ perModel, varianceAnalysis }: ModelConsistencyChartProps) {
  if (!perModel || Object.keys(perModel).length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No model data available
      </div>
    );
  }

  const isMultiSample = varianceAnalysis?.isMultiSample ?? false;

  // Transform data for chart
  const chartData: ChartDataPoint[] = Object.entries(perModel).map(([model, stats], idx) => {
    const multiSampleData = varianceAnalysis?.perModel?.[model];
    // Convert variance to stdDev for error bars
    const withinScenarioStdDev = multiSampleData?.avgWithinScenarioVariance !== undefined
      ? Math.sqrt(multiSampleData.avgWithinScenarioVariance)
      : undefined;
    return {
      model: model.length > 15 ? model.slice(0, 13) + '...' : model,
      fullName: model,
      avg: stats.overall.mean,
      variance: stats.overall.stdDev,
      color: MODEL_COLORS[idx % MODEL_COLORS.length] ?? '#6b7280',
      // Add multi-sample variance data when available
      multiSampleVariance: withinScenarioStdDev,
      consistencyScore: multiSampleData?.consistencyScore,
      // Error bar shows +/- stdDev from the multi-sample analysis
      errorBarValue: withinScenarioStdDev,
    };
  });

  // Sort by average decision
  chartData.sort((a, b) => a.avg - b.avg);

  // Find most/least consistent models (use multi-sample variance if available, otherwise cross-scenario variance)
  const sortedByVariance = [...chartData].sort((a, b) => {
    const aVariance = a.multiSampleVariance ?? a.variance;
    const bVariance = b.multiSampleVariance ?? b.variance;
    return aVariance - bVariance;
  });
  const mostConsistent = sortedByVariance.slice(0, 3);
  const mostVariable = sortedByVariance.slice(-3).reverse();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-700">Model Decision Consistency</h3>
        <p className="text-xs text-gray-500 mt-1">
          {isMultiSample ? (
            <>Average decision (bar) with error bars showing ±1 std dev from {varianceAnalysis?.samplesPerScenario} samples per scenario.</>
          ) : (
            <>Average decision (bar) and standard deviation across scenarios (line). Lower variance = more consistent.</>
          )}
        </p>
        {isMultiSample && (
          <div className="mt-2 inline-flex items-center px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Multi-sample run: {varianceAnalysis?.samplesPerScenario} samples per scenario
          </div>
        )}
      </div>

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
            <Tooltip content={<CustomTooltip isMultiSample={isMultiSample} />} />
            <Bar dataKey="avg" name="Average Decision">
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
              {isMultiSample && (
                <ErrorBar dataKey="errorBarValue" stroke="#9333ea" strokeWidth={2} />
              )}
            </Bar>
            {!isMultiSample && (
              <Line
                type="monotone"
                dataKey="variance"
                stroke="#6b7280"
                strokeWidth={2}
                dot={{ r: 4, fill: '#6b7280' }}
                name="Std Deviation"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Insights */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-green-50 rounded-lg p-3">
          <h4 className="font-medium text-green-800 text-sm mb-2">Most Consistent</h4>
          <div className="space-y-1">
            {mostConsistent.map((m) => (
              <div key={m.fullName} className="text-xs text-green-700 flex justify-between">
                <span className="truncate" title={m.fullName}>{m.fullName}</span>
                <span className="font-mono ml-2">
                  {isMultiSample && m.consistencyScore !== undefined
                    ? `${(m.consistencyScore * 100).toFixed(0)}%`
                    : (m.multiSampleVariance ?? m.variance).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-amber-50 rounded-lg p-3">
          <h4 className="font-medium text-amber-800 text-sm mb-2">Most Variable</h4>
          <div className="space-y-1">
            {mostVariable.map((m) => (
              <div key={m.fullName} className="text-xs text-amber-700 flex justify-between">
                <span className="truncate" title={m.fullName}>{m.fullName}</span>
                <span className="font-mono ml-2">
                  {isMultiSample && m.consistencyScore !== undefined
                    ? `${(m.consistencyScore * 100).toFixed(0)}%`
                    : (m.multiSampleVariance ?? m.variance).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Multi-sample specific insights */}
      {isMultiSample && varianceAnalysis && (
        <div className="bg-purple-50 rounded-lg p-4 mt-4">
          <h4 className="font-medium text-purple-800 text-sm mb-3">Multi-Sample Variance Analysis</h4>
          <div className="grid grid-cols-2 gap-4 text-xs">
            {varianceAnalysis.mostVariableScenarios && varianceAnalysis.mostVariableScenarios.length > 0 && (
              <div>
                <p className="font-medium text-purple-700 mb-2">Most Variable Scenarios</p>
                <div className="space-y-1">
                  {varianceAnalysis.mostVariableScenarios.slice(0, 3).map((s) => (
                    <div key={s.scenarioId} className="text-purple-600 flex justify-between">
                      <span className="truncate" title={s.scenarioName}>{s.scenarioName}</span>
                      <span className="font-mono ml-2">±{s.stdDev.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {varianceAnalysis.leastVariableScenarios && varianceAnalysis.leastVariableScenarios.length > 0 && (
              <div>
                <p className="font-medium text-purple-700 mb-2">Most Stable Scenarios</p>
                <div className="space-y-1">
                  {varianceAnalysis.leastVariableScenarios.slice(0, 3).map((s) => (
                    <div key={s.scenarioId} className="text-purple-600 flex justify-between">
                      <span className="truncate" title={s.scenarioName}>{s.scenarioName}</span>
                      <span className="font-mono ml-2">±{s.stdDev.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

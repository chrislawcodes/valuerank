/**
 * ModelConsistencyChart Component
 *
 * Shows average decision and standard deviation for each model.
 * Helps identify which models are most consistent vs variable.
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
} from 'recharts';
import type { PerModelStats } from '../../api/operations/analysis';

type ModelConsistencyChartProps = {
  perModel: Record<string, PerModelStats>;
};

type ChartDataPoint = {
  model: string;
  fullName: string;
  avg: number;
  variance: number;
  color: string;
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
function CustomTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
}) {
  if (!active || !payload?.[0]) return null;

  const data = payload[0].payload;

  return (
    <div className="bg-white p-3 shadow-lg rounded-lg border border-gray-200">
      <p className="font-medium text-gray-900 mb-2">{data.fullName}</p>
      <div className="space-y-1 text-sm text-gray-600">
        <p>Average: <span className="font-medium">{data.avg.toFixed(2)}</span></p>
        <p>Std Dev: <span className="font-medium">{data.variance.toFixed(2)}</span></p>
      </div>
    </div>
  );
}

export function ModelConsistencyChart({ perModel }: ModelConsistencyChartProps) {
  if (!perModel || Object.keys(perModel).length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No model data available
      </div>
    );
  }

  // Transform data for chart
  const chartData: ChartDataPoint[] = Object.entries(perModel).map(([model, stats], idx) => ({
    model: model.length > 15 ? model.slice(0, 13) + '...' : model,
    fullName: model,
    avg: stats.overall.mean,
    variance: stats.overall.stdDev,
    color: MODEL_COLORS[idx % MODEL_COLORS.length] ?? '#6b7280',
  }));

  // Sort by average decision
  chartData.sort((a, b) => a.avg - b.avg);

  // Find most/least consistent models
  const sortedByVariance = [...chartData].sort((a, b) => a.variance - b.variance);
  const mostConsistent = sortedByVariance.slice(0, 3);
  const mostVariable = sortedByVariance.slice(-3).reverse();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-700">Model Decision Consistency</h3>
        <p className="text-xs text-gray-500 mt-1">
          Average decision (bar) and standard deviation (line). Lower variance = more consistent.
        </p>
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
            <Tooltip content={<CustomTooltip />} />
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
            />
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
                <span className="font-mono ml-2">{m.variance.toFixed(2)}</span>
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
                <span className="font-mono ml-2">{m.variance.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

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
import type { AggregateData } from '../../lib/api';
import { MODEL_COLORS } from './constants';

// Model Variance Chart - Shows average decision with variance for clustering analysis
export function ModelVariance({ data }: { data: AggregateData }) {
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

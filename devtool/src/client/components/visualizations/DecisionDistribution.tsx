import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { AggregateData } from '../../lib/api';
import { MODEL_COLORS } from './constants';

// Decision Distribution Chart - Shows how each model distributes across decision codes
export function DecisionDistribution({ data }: { data: AggregateData }) {
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

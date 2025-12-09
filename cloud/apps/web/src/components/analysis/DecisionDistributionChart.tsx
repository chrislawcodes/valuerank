/**
 * DecisionDistributionChart Component
 *
 * Shows how each model distributes its decisions across the 1-5 scale.
 * Stacked horizontal bar chart with decision codes color-coded.
 */

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
import type { VisualizationData } from '../../api/operations/analysis';

type DecisionDistributionChartProps = {
  visualizationData: VisualizationData;
};

type ChartDataPoint = {
  model: string;
  fullName: string;
  '1': number;
  '2': number;
  '3': number;
  '4': number;
  '5': number;
};

// Decision code color scheme (green to red gradient)
const DECISION_COLORS = {
  '1': '#22c55e', // green - strong agree
  '2': '#86efac', // light green
  '3': '#fbbf24', // yellow - neutral
  '4': '#fb923c', // light red/orange
  '5': '#ef4444', // red - strong disagree
} as const;

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
      <div className="space-y-1 text-sm">
        {(['1', '2', '3', '4', '5'] as const).map((d) => (
          <div key={d} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: DECISION_COLORS[d] }}
            />
            <span>Decision {d}:</span>
            <span className="font-medium">{data[d]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DecisionDistributionChart({ visualizationData }: DecisionDistributionChartProps) {
  const { decisionDistribution } = visualizationData;

  if (!decisionDistribution || Object.keys(decisionDistribution).length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No decision distribution data available
      </div>
    );
  }

  // Transform data for stacked bar chart
  const chartData: ChartDataPoint[] = Object.entries(decisionDistribution).map(([model, dist]) => ({
    model: model.length > 20 ? model.slice(0, 18) + '...' : model,
    fullName: model,
    '1': dist['1'] || 0,
    '2': dist['2'] || 0,
    '3': dist['3'] || 0,
    '4': dist['4'] || 0,
    '5': dist['5'] || 0,
  }));

  // Sort by total count descending
  chartData.sort((a, b) => {
    const totalA = a['1'] + a['2'] + a['3'] + a['4'] + a['5'];
    const totalB = b['1'] + b['2'] + b['3'] + b['4'] + b['5'];
    return totalB - totalA;
  });

  const chartHeight = Math.max(300, chartData.length * 50);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-700">Decision Distribution by Model</h3>
        <p className="text-xs text-gray-500 mt-1">
          Shows how each model distributes its decisions across the 1-5 scale
        </p>
      </div>

      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 120, right: 30, top: 20, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
            <XAxis type="number" />
            <YAxis
              type="category"
              dataKey="model"
              width={110}
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {(['1', '2', '3', '4', '5'] as const).map((d) => (
              <Bar
                key={d}
                dataKey={d}
                stackId="a"
                fill={DECISION_COLORS[d]}
                name={`Decision ${d}`}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="text-xs text-gray-500 text-center">
        1 = strongly agree with option A, 5 = strongly agree with option B
      </div>
    </div>
  );
}

/**
 * ScoreDistributionChart Component
 *
 * Displays a histogram of win rates for a selected value across models.
 */

import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { PerModelStats, ValueStats } from '../../api/operations/analysis';

type ScoreDistributionChartProps = {
  perModel: Record<string, PerModelStats>;
  selectedValue?: string;
  onValueChange?: (value: string) => void;
};

type ChartDataPoint = {
  modelId: string;
  displayName: string;
  winRate: number;
  sampleSize: number;
  ciLower: number;
  ciUpper: number;
};

// Color palette for different models
const MODEL_COLORS = [
  '#0891b2', // cyan-600
  '#7c3aed', // violet-600
  '#db2777', // pink-600
  '#ea580c', // orange-600
  '#16a34a', // green-600
  '#2563eb', // blue-600
  '#dc2626', // red-600
  '#ca8a04', // yellow-600
];

/**
 * Get all unique values across all models.
 */
function getAllValues(perModel: Record<string, PerModelStats>): string[] {
  const valueSet = new Set<string>();
  Object.values(perModel).forEach((modelStats) => {
    Object.keys(modelStats.values).forEach((v) => valueSet.add(v));
  });
  return Array.from(valueSet).sort();
}

/**
 * Transform analysis data for the chart.
 */
function getChartData(
  perModel: Record<string, PerModelStats>,
  selectedValue: string
): ChartDataPoint[] {
  return Object.entries(perModel)
    .map(([modelId, modelStats]) => {
      const valueStats: ValueStats | undefined = modelStats.values[selectedValue];
      if (!valueStats) {
        return null;
      }

      // Truncate model name for display
      const displayName = modelId.length > 20
        ? `${modelId.slice(0, 17)}...`
        : modelId;

      return {
        modelId,
        displayName,
        winRate: valueStats.winRate,
        sampleSize: valueStats.count.prioritized + valueStats.count.deprioritized,
        ciLower: valueStats.confidenceInterval.lower,
        ciUpper: valueStats.confidenceInterval.upper,
      };
    })
    .filter((d): d is ChartDataPoint => d !== null)
    .sort((a, b) => b.winRate - a.winRate);
}

/**
 * Format percentage for tooltip.
 */
function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

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
      <p className="font-medium text-gray-900">{data.modelId}</p>
      <div className="text-sm text-gray-600 mt-1 space-y-1">
        <p>Win Rate: <span className="font-medium">{formatPercent(data.winRate)}</span></p>
        <p>
          95% CI: [{formatPercent(data.ciLower)} - {formatPercent(data.ciUpper)}]
        </p>
        <p>Sample: n={data.sampleSize}</p>
      </div>
    </div>
  );
}

export function ScoreDistributionChart({
  perModel,
  selectedValue: controlledValue,
  onValueChange,
}: ScoreDistributionChartProps) {
  const allValues = useMemo(() => getAllValues(perModel), [perModel]);
  const [internalValue, setInternalValue] = useState(allValues[0] ?? '');

  const selectedValue = controlledValue ?? internalValue;

  const handleValueChange = (value: string) => {
    if (onValueChange) {
      onValueChange(value);
    } else {
      setInternalValue(value);
    }
  };

  const chartData = useMemo(
    () => getChartData(perModel, selectedValue),
    [perModel, selectedValue]
  );

  if (allValues.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No value data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Value selector */}
      <div className="flex items-center gap-3">
        <label htmlFor="value-select" className="text-sm font-medium text-gray-700">
          Select Value:
        </label>
        <select
          id="value-select"
          value={selectedValue}
          onChange={(e) => handleValueChange(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        >
          {allValues.map((value) => (
            <option key={value} value={value}>
              {value.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      {/* Chart */}
      {chartData.length > 0 ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                type="number"
                domain={[0, 1]}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                stroke="#6b7280"
                fontSize={12}
              />
              <YAxis
                type="category"
                dataKey="displayName"
                stroke="#6b7280"
                fontSize={12}
                width={95}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="winRate"
                radius={[0, 4, 4, 0]}
                maxBarSize={40}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={entry.modelId}
                    fill={MODEL_COLORS[index % MODEL_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          No data for selected value
        </div>
      )}

      {/* Legend */}
      <div className="text-xs text-gray-500 text-center">
        Win rate = prioritized / (prioritized + deprioritized)
      </div>
    </div>
  );
}

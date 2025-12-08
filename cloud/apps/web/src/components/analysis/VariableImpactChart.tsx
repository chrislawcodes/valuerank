/**
 * VariableImpactChart Component
 *
 * Displays a bar chart of dimension effect sizes, showing which variables drive variance.
 */

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import { AlertCircle } from 'lucide-react';
import type { DimensionAnalysis, DimensionStats } from '../../api/operations/analysis';

type VariableImpactChartProps = {
  dimensionAnalysis: DimensionAnalysis | null;
};

type ChartDataPoint = {
  dimension: string;
  displayName: string;
  effectSize: number;
  rank: number;
  pValue: number;
  significant: boolean;
};

// Color based on significance and effect size
function getBarColor(data: ChartDataPoint): string {
  if (!data.significant) {
    return '#9ca3af'; // gray-400 for non-significant
  }
  // Gradient from light to dark teal based on effect size
  const intensity = Math.min(1, Math.abs(data.effectSize));
  if (intensity > 0.8) return '#0f766e'; // teal-700
  if (intensity > 0.5) return '#0d9488'; // teal-600
  if (intensity > 0.2) return '#14b8a6'; // teal-500
  return '#2dd4bf'; // teal-400
}

/**
 * Transform dimension analysis data for the chart.
 */
function getChartData(dimensionAnalysis: DimensionAnalysis): ChartDataPoint[] {
  return Object.entries(dimensionAnalysis.dimensions)
    .map(([dimension, stats]: [string, DimensionStats]) => {
      // Format display name
      const displayName = dimension
        .replace(/_/g, ' ')
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      return {
        dimension,
        displayName: displayName.length > 15 ? `${displayName.slice(0, 12)}...` : displayName,
        effectSize: stats.effectSize,
        rank: stats.rank,
        pValue: stats.pValue,
        significant: stats.significant,
      };
    })
    .sort((a, b) => a.rank - b.rank);
}

/**
 * Format effect size for display.
 */
function formatEffectSize(value: number): string {
  return value.toFixed(3);
}

/**
 * Format p-value for display.
 */
function formatPValue(pValue: number): string {
  if (pValue < 0.001) return 'p < 0.001';
  if (pValue < 0.01) return `p = ${pValue.toFixed(3)}`;
  return `p = ${pValue.toFixed(2)}`;
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
      <p className="font-medium text-gray-900">{data.dimension.replace(/_/g, ' ')}</p>
      <div className="text-sm text-gray-600 mt-1 space-y-1">
        <p>Effect Size: <span className="font-medium">{formatEffectSize(data.effectSize)}</span></p>
        <p>{formatPValue(data.pValue)}</p>
        <p>Rank: #{data.rank}</p>
        <p className={data.significant ? 'text-green-600' : 'text-gray-400'}>
          {data.significant ? 'Statistically significant' : 'Not significant'}
        </p>
      </div>
    </div>
  );
}

export function VariableImpactChart({ dimensionAnalysis }: VariableImpactChartProps) {
  const chartData = useMemo(
    () => dimensionAnalysis ? getChartData(dimensionAnalysis) : [],
    [dimensionAnalysis]
  );

  // Handle no dimension analysis
  if (!dimensionAnalysis) {
    return (
      <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
        <AlertCircle className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-gray-700">Dimension Analysis Unavailable</p>
          <p className="text-xs text-gray-500 mt-1">
            This analysis requires a definition with multiple dimensions.
            Create a definition with varying dimension levels to see which variables have the most impact.
          </p>
        </div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No dimension data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Chart */}
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
              stroke="#6b7280"
              fontSize={12}
              tickFormatter={formatEffectSize}
            />
            <YAxis
              type="category"
              dataKey="displayName"
              stroke="#6b7280"
              fontSize={12}
              width={95}
            />
            <ReferenceLine x={0} stroke="#9ca3af" />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="effectSize"
              radius={[0, 4, 4, 0]}
              maxBarSize={40}
            >
              {chartData.map((entry) => (
                <Cell
                  key={entry.dimension}
                  fill={getBarColor(entry)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Variance explained */}
      <div className="flex items-center justify-between text-sm">
        <div className="text-gray-600">
          <span className="font-medium">Variance Explained:</span>{' '}
          {(dimensionAnalysis.varianceExplained * 100).toFixed(1)}%
        </div>
        <div className="text-gray-500">
          Method: {dimensionAnalysis.method.replace(/_/g, ' ')}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-teal-500" />
          <span>Significant</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-gray-400" />
          <span>Not significant</span>
        </div>
      </div>
    </div>
  );
}

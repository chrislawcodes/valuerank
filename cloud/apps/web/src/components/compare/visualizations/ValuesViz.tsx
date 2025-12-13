/**
 * Value Win Rate Comparison Visualization
 *
 * Compares value prioritization patterns across runs:
 * - Grouped bar chart showing win rates for each value
 * - Highlight significant changes (>10% difference)
 * - Confidence intervals on hover
 * - Model filter integration
 */

import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ErrorBar,
} from 'recharts';
import { AlertTriangle, TrendingUp, TrendingDown, Info } from 'lucide-react';
import type { ComparisonVisualizationProps, RunWithAnalysis, ValueComparison } from '../types';
import type { ValueStats, ConfidenceInterval } from '../../../api/operations/analysis';
import { ComparisonFilters } from '../ComparisonFilters';
import { formatRunNameShort } from '../../../lib/format';

// Color palette for runs (teal variations + complementary colors)
const RUN_COLORS = [
  '#14b8a6', // teal-500
  '#f97316', // orange-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#22c55e', // green-500
  '#3b82f6', // blue-500
  '#eab308', // yellow-500
  '#ef4444', // red-500
  '#06b6d4', // cyan-500
  '#a855f7', // purple-500
];

// Threshold for significant change
const SIGNIFICANT_CHANGE_THRESHOLD = 0.10; // 10%

type RunValueData = {
  runId: string;
  runName: string;
  values: Map<string, ValueStats>;
};

type ChartDataPoint = {
  valueName: string;
  formattedName: string;
  [runId: string]: number | string | { lower: number; upper: number } | undefined;
};

/**
 * Extract value win rates from a run's analysis
 */
function getRunValueData(run: RunWithAnalysis, modelFilter?: string): RunValueData | null {
  const perModel = run.analysis?.perModel;
  if (!perModel) return null;

  // Aggregate values across models (or filter to specific model)
  const aggregatedValues = new Map<string, { sum: number; count: number; ci: ConfidenceInterval | null }>();

  for (const [modelId, modelData] of Object.entries(perModel)) {
    if (modelFilter && modelId !== modelFilter) continue;

    if (modelData.values) {
      for (const [valueName, valueStats] of Object.entries(modelData.values)) {
        const existing = aggregatedValues.get(valueName);
        if (existing) {
          existing.sum += valueStats.winRate;
          existing.count += 1;
          // Keep the CI from first model (simplified approach)
        } else {
          aggregatedValues.set(valueName, {
            sum: valueStats.winRate,
            count: 1,
            ci: valueStats.confidenceInterval,
          });
        }
      }
    }
  }

  if (aggregatedValues.size === 0) return null;

  // Convert to ValueStats map with averaged win rates
  const values = new Map<string, ValueStats>();
  for (const [valueName, data] of aggregatedValues.entries()) {
    values.set(valueName, {
      winRate: data.sum / data.count,
      confidenceInterval: data.ci ?? { lower: 0, upper: 1, level: 0.95, method: 'wilson' },
      count: { prioritized: 0, deprioritized: 0, neutral: 0 },
    });
  }

  return {
    runId: run.id,
    runName: formatRunNameShort(run),
    values,
  };
}

/**
 * Build chart data from run value data
 */
function buildChartData(runData: RunValueData[]): ChartDataPoint[] {
  // Collect all unique values
  const allValues = new Set<string>();
  for (const data of runData) {
    for (const valueName of data.values.keys()) {
      allValues.add(valueName);
    }
  }

  // Build data points
  const chartData: ChartDataPoint[] = [];
  for (const valueName of Array.from(allValues).sort()) {
    const point: ChartDataPoint = {
      valueName,
      formattedName: formatValueName(valueName),
    };

    for (const data of runData) {
      const valueStats = data.values.get(valueName);
      if (valueStats) {
        point[data.runId] = valueStats.winRate;
        point[`${data.runId}_ci`] = {
          lower: valueStats.confidenceInterval.lower,
          upper: valueStats.confidenceInterval.upper,
        };
      }
    }

    chartData.push(point);
  }

  return chartData;
}

/**
 * Calculate value comparisons between runs
 */
function calculateValueComparisons(runData: RunValueData[]): ValueComparison[] {
  if (runData.length < 2) return [];

  // Collect all unique values
  const allValues = new Set<string>();
  for (const data of runData) {
    for (const valueName of data.values.keys()) {
      allValues.add(valueName);
    }
  }

  const comparisons: ValueComparison[] = [];

  for (const valueName of allValues) {
    const runWinRates: ValueComparison['runWinRates'] = [];
    let maxRate = 0;
    let minRate = 1;

    for (const data of runData) {
      const valueStats = data.values.get(valueName);
      if (valueStats) {
        runWinRates.push({
          runId: data.runId,
          winRate: valueStats.winRate,
          confidenceInterval: {
            lower: valueStats.confidenceInterval.lower,
            upper: valueStats.confidenceInterval.upper,
          },
          sampleSize: valueStats.count.prioritized + valueStats.count.deprioritized + valueStats.count.neutral,
        });
        maxRate = Math.max(maxRate, valueStats.winRate);
        minRate = Math.min(minRate, valueStats.winRate);
      }
    }

    const maxDifference = maxRate - minRate;
    comparisons.push({
      valueName,
      runWinRates,
      hasSignificantChange: maxDifference >= SIGNIFICANT_CHANGE_THRESHOLD,
      maxDifference,
    });
  }

  return comparisons.sort((a, b) => b.maxDifference - a.maxDifference);
}

/**
 * Format value name for display
 */
function formatValueName(value: string): string {
  return value.replace(/_/g, ' ');
}

/**
 * Custom tooltip for the bar chart
 */
function ValueTooltip({
  active,
  payload,
  label,
  runNames,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{
    dataKey: string;
    value: number;
    color: string;
    payload?: ChartDataPoint;
  }>;
  label?: string | number;
  runNames: Map<string, string>;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-white p-3 shadow-lg rounded-lg border border-gray-200">
      <p className="font-medium text-gray-900 mb-2">{label}</p>
      <div className="space-y-2 text-sm">
        {payload.map((entry) => {
          const runId = entry.dataKey;
          const runName = runNames.get(runId) || runId;
          const ci = entry.payload?.[`${runId}_ci`] as { lower: number; upper: number } | undefined;

          return (
            <div key={entry.dataKey} className="flex flex-col">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-gray-600">{runName}:</span>
                <span className="font-medium text-gray-900">
                  {(entry.value * 100).toFixed(1)}%
                </span>
              </div>
              {ci && (
                <div className="text-xs text-gray-500 ml-5">
                  CI: [{(ci.lower * 100).toFixed(1)}%, {(ci.upper * 100).toFixed(1)}%]
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Significant changes summary
 */
function SignificantChanges({ comparisons, runData }: { comparisons: ValueComparison[]; runData: RunValueData[] }) {
  const significant = comparisons.filter((c) => c.hasSignificantChange);

  if (significant.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex items-center gap-2 text-gray-600">
          <Info className="w-4 h-4" />
          <span className="text-sm">No significant differences (≥10%) found between runs</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <h4 className="text-sm font-medium text-gray-600 mb-3 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-yellow-600" />
        Significant Changes (≥10% difference)
      </h4>
      <div className="space-y-2">
        {significant.slice(0, 5).map((comparison) => {
          // Find runs with highest and lowest win rates
          const sorted = [...comparison.runWinRates].sort((a, b) => b.winRate - a.winRate);
          const highest = sorted[0];
          const lowest = sorted[sorted.length - 1];

          const highestName = runData.find((r) => r.runId === highest?.runId)?.runName ?? highest?.runId ?? '';
          const lowestName = runData.find((r) => r.runId === lowest?.runId)?.runName ?? lowest?.runId ?? '';

          return (
            <div key={comparison.valueName} className="flex items-center justify-between text-sm">
              <span className="text-gray-900 font-medium">
                {formatValueName(comparison.valueName)}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-xs">
                  {highestName}
                </span>
                <TrendingUp className="w-3 h-3 text-green-600" />
                <span className="text-green-600 font-mono">
                  {highest ? (highest.winRate * 100).toFixed(0) : 0}%
                </span>
                <span className="text-gray-400">vs</span>
                <span className="text-red-600 font-mono">
                  {lowest ? (lowest.winRate * 100).toFixed(0) : 0}%
                </span>
                <TrendingDown className="w-3 h-3 text-red-600" />
                <span className="text-gray-500 text-xs">
                  {lowestName}
                </span>
              </div>
            </div>
          );
        })}
        {significant.length > 5 && (
          <p className="text-xs text-gray-500">
            +{significant.length - 5} more significant changes
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Main ValuesViz component
 */
export function ValuesViz({ runs, filters, onFilterChange }: ComparisonVisualizationProps) {
  const [showConfidenceIntervals, setShowConfidenceIntervals] = useState(false);

  // Extract value data from runs
  const runData = useMemo(() => {
    return runs
      .map((run) => getRunValueData(run, filters.model))
      .filter((d): d is RunValueData => d !== null);
  }, [runs, filters.model]);

  // Build chart data
  const chartData = useMemo(() => buildChartData(runData), [runData]);

  // Calculate comparisons
  const comparisons = useMemo(() => calculateValueComparisons(runData), [runData]);

  // Assign colors to runs
  const runColors = useMemo(() => {
    const colors = new Map<string, string>();
    runData.forEach((data, i) => {
      colors.set(data.runId, RUN_COLORS[i % RUN_COLORS.length] ?? '#14b8a6');
    });
    return colors;
  }, [runData]);

  // Run name lookup
  const runNames = useMemo(() => {
    return new Map(runData.map((d) => [d.runId, d.runName]));
  }, [runData]);

  // Handle empty state
  if (runData.length === 0 || chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <TrendingUp className="w-6 h-6 text-gray-400" />
        </div>
        <p className="text-gray-600">No value data available</p>
        <p className="text-gray-500 text-sm mt-1">
          {filters.model
            ? `No data for model: ${filters.model}`
            : 'Selected runs have no value analysis data'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between">
        <ComparisonFilters
          filters={filters}
          onFilterChange={onFilterChange}
          runs={runs}
          showDisplayMode={false}
          showValueFilter={false}
        />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showConfidenceIntervals}
            onChange={(e) => setShowConfidenceIntervals(e.target.checked)}
            className="rounded border-gray-300 bg-white text-teal-500 focus:ring-teal-500"
          />
          Show confidence intervals
        </label>
      </div>

      {/* Chart */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Value Win Rate Comparison</h3>
        <div style={{ height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ left: 20, right: 20, top: 20, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="formattedName"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={80}
                interval={0}
              />
              <YAxis
                tick={{ fill: '#6b7280' }}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                domain={[0, 1]}
              />
              <Tooltip content={(props) => <ValueTooltip {...props} runNames={runNames} />} />
              <Legend
                formatter={(value) => runNames.get(value) || value}
                wrapperStyle={{ paddingTop: 20 }}
              />
              {runData.map((data) => (
                <Bar
                  key={data.runId}
                  dataKey={data.runId}
                  fill={runColors.get(data.runId)}
                  name={data.runId}
                >
                  {showConfidenceIntervals && (
                    <ErrorBar
                      dataKey={`${data.runId}_ci`}
                      width={4}
                      strokeWidth={1}
                      stroke={runColors.get(data.runId)}
                    />
                  )}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Significant Changes */}
      <SignificantChanges comparisons={comparisons} runData={runData} />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {runData.map((data) => {
          const avgWinRate =
            Array.from(data.values.values()).reduce((sum, v) => sum + v.winRate, 0) /
            data.values.size;

          return (
            <div key={data.runId} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="text-xs text-gray-500 truncate" title={data.runName}>
                {data.runName}
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-bold text-gray-900">
                  {(avgWinRate * 100).toFixed(1)}%
                </span>
                <span className="text-xs text-gray-500">avg win rate</span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {data.values.size} values tracked
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

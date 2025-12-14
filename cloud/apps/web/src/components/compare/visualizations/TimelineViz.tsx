/**
 * Timeline Visualization for Model Behavioral Drift
 *
 * Shows how model behavior changes across runs over time.
 * - Line chart with run dates on X-axis
 * - Mean decision or other metrics on Y-axis
 * - Multiple lines for different models (common across runs)
 * - Useful for detecting drift in model versions
 */

import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, AlertCircle } from 'lucide-react';
import type { ComparisonVisualizationProps, RunWithAnalysis, TimelineMetric } from '../types';
import { ComparisonFilters } from '../ComparisonFilters';
import { formatRunNameShort } from '../../../lib/format';
import {
  TimelineTooltip,
  MetricSelector,
  TimelineSummary,
  RunLegend,
  type TimelineDataPoint,
} from '../charts';

// Color palette for models
const MODEL_COLORS = [
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

/**
 * Extract timeline data from runs
 */
function buildTimelineData(
  runs: RunWithAnalysis[],
  metric: TimelineMetric,
  modelFilter?: string
): { data: TimelineDataPoint[]; models: string[] } {
  const modelsSet = new Set<string>();
  const dataPoints: TimelineDataPoint[] = [];

  // Sort runs by date
  const sortedRuns = [...runs].sort((a, b) => {
    const dateA = new Date(a.completedAt || a.createdAt).getTime();
    const dateB = new Date(b.completedAt || b.createdAt).getTime();
    return dateA - dateB;
  });

  for (const run of sortedRuns) {
    const perModel = run.analysis?.perModel;
    if (!perModel) continue;

    const date = new Date(run.completedAt || run.createdAt);
    const point: TimelineDataPoint = {
      date: date.getTime(),
      dateStr: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      runId: run.id,
      runName: formatRunNameShort(run),
    };

    for (const [modelId, modelData] of Object.entries(perModel)) {
      // Apply model filter
      if (modelFilter && modelId !== modelFilter) continue;

      modelsSet.add(modelId);

      // Get metric value
      let value: number | undefined;
      if (metric === 'mean') {
        value = modelData.overall?.mean;
      } else if (metric === 'stdDev') {
        value = modelData.overall?.stdDev;
      }

      if (value !== undefined) {
        point[modelId] = value;
      }
    }

    // Only add point if it has model data
    const hasData = Object.keys(point).some(
      (k) => !['date', 'dateStr', 'runId', 'runName'].includes(k)
    );
    if (hasData) {
      dataPoints.push(point);
    }
  }

  return {
    data: dataPoints,
    models: Array.from(modelsSet).sort(),
  };
}

/**
 * Get the display name for a model (strip provider prefix)
 */
function getModelDisplayName(modelId: string): string {
  const parts = modelId.split(':');
  return parts[parts.length - 1] || modelId;
}

/**
 * Main TimelineViz component
 */
export function TimelineViz({ runs, filters, onFilterChange }: ComparisonVisualizationProps) {
  const [metric, setMetric] = useState<TimelineMetric>('mean');

  // Build timeline data
  const { data, models } = useMemo(
    () => buildTimelineData(runs, metric, filters.model),
    [runs, metric, filters.model]
  );

  // Assign colors to models
  const modelColors = useMemo(() => {
    const colors = new Map<string, string>();
    models.forEach((model, i) => {
      colors.set(model, MODEL_COLORS[i % MODEL_COLORS.length] ?? '#14b8a6');
    });
    return colors;
  }, [models]);

  // Handle empty state
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <TrendingUp className="w-6 h-6 text-gray-400" />
        </div>
        <p className="text-gray-600">No timeline data available</p>
        <p className="text-gray-500 text-sm mt-1">
          {filters.model
            ? `No data for model: ${filters.model}`
            : 'Selected runs have no comparable dates'}
        </p>
      </div>
    );
  }

  // Warning for single data point
  const showWarning = data.length === 1;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ComparisonFilters
          filters={filters}
          onFilterChange={onFilterChange}
          runs={runs}
          showDisplayMode={false}
          showValueFilter={false}
        />
        <MetricSelector selected={metric} onChange={setMetric} />
      </div>

      {/* Warning for insufficient data */}
      {showWarning && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
          <p className="text-sm text-yellow-800">
            Only one run has data. Select more runs to see trends over time.
          </p>
        </div>
      )}

      {/* Chart */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {metric === 'mean' ? 'Mean Decision' : 'Standard Deviation'} Over Time
        </h3>

        <div style={{ height: 350 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 20, right: 20, top: 20, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="dateStr"
                tick={{ fill: '#6b7280' }}
                tickLine={{ stroke: '#d1d5db' }}
              />
              <YAxis
                tick={{ fill: '#6b7280' }}
                tickLine={{ stroke: '#d1d5db' }}
                domain={metric === 'mean' ? [1, 5] : ['auto', 'auto']}
              />
              <Tooltip content={<TimelineTooltip />} />
              <Legend
                formatter={(value: string) => getModelDisplayName(value)}
                wrapperStyle={{ paddingTop: 10 }}
              />

              {/* Reference line for neutral decision (3) */}
              {metric === 'mean' && (
                <ReferenceLine
                  y={3}
                  stroke="#d1d5db"
                  strokeDasharray="5 5"
                  label={{
                    value: 'Neutral',
                    position: 'right',
                    fill: '#9ca3af',
                    fontSize: 10,
                  }}
                />
              )}

              {/* Lines for each model */}
              {models.map((modelId) => (
                <Line
                  key={modelId}
                  type="monotone"
                  dataKey={modelId}
                  stroke={modelColors.get(modelId)}
                  strokeWidth={2}
                  dot={{ fill: modelColors.get(modelId), r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary Statistics */}
      <TimelineSummary data={data} models={models} metric={metric} />

      {/* Run Legend */}
      <RunLegend data={data} />
    </div>
  );
}

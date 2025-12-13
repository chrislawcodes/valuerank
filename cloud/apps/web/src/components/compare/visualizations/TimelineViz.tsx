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
import { TrendingUp, AlertCircle, Calendar } from 'lucide-react';
import type { ComparisonVisualizationProps, RunWithAnalysis, TimelineMetric } from '../types';
import { ComparisonFilters } from '../ComparisonFilters';
import { formatRunNameShort } from '../../../lib/format';

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

type TimelineDataPoint = {
  date: number; // timestamp for sorting
  dateStr: string; // formatted date for display
  runId: string;
  runName: string;
  [modelId: string]: number | string; // model values
};

type MetricOption = {
  id: TimelineMetric;
  label: string;
  description: string;
};

const METRIC_OPTIONS: MetricOption[] = [
  { id: 'mean', label: 'Mean Decision', description: 'Average decision value (1-5)' },
  { id: 'stdDev', label: 'Std Deviation', description: 'Decision variance within run' },
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
 * Custom tooltip component
 */
function TimelineTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly unknown[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const typedPayload = payload as ReadonlyArray<{
    name: string;
    value: number;
    color: string;
    payload: TimelineDataPoint;
  }>;
  const point = typedPayload[0]?.payload;

  return (
    <div className="bg-white p-3 shadow-lg rounded-lg border border-gray-200 max-w-xs">
      <div className="flex items-center gap-2 mb-2">
        <Calendar className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-sm text-gray-600">{label}</span>
      </div>
      <p className="text-sm font-medium text-gray-900 mb-2 truncate" title={point?.runName}>
        {point?.runName}
      </p>
      <div className="space-y-1 text-sm">
        {typedPayload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-gray-600 truncate" title={entry.name}>
                {getModelDisplayName(entry.name)}
              </span>
            </div>
            <span className="font-mono text-gray-900">{entry.value.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Metric selector component
 */
function MetricSelector({
  selected,
  onChange,
}: {
  selected: TimelineMetric;
  onChange: (metric: TimelineMetric) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600">Metric:</span>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value as TimelineMetric)}
        className="bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
      >
        {METRIC_OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Summary statistics panel
 */
function TimelineSummary({
  data,
  models,
  metric,
}: {
  data: TimelineDataPoint[];
  models: string[];
  metric: TimelineMetric;
}) {
  if (data.length < 2 || models.length === 0) return null;

  // Calculate trend for each model
  const trends = models.map((modelId) => {
    const values = data
      .map((d) => ({ date: d.date, value: d[modelId] as number | undefined }))
      .filter((v): v is { date: number; value: number } => v.value !== undefined);

    if (values.length < 2) return null;

    const firstValue = values[0]!.value;
    const lastValue = values[values.length - 1]!.value;
    const change = lastValue - firstValue;
    const changePercent = firstValue !== 0 ? (change / firstValue) * 100 : 0;

    return {
      modelId,
      firstValue,
      lastValue,
      change,
      changePercent,
      direction: change > 0.05 ? 'up' : change < -0.05 ? 'down' : 'stable',
    };
  }).filter(Boolean);

  if (trends.length === 0) return null;

  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <h4 className="text-sm font-medium text-gray-600 mb-3 flex items-center gap-2">
        <TrendingUp className="w-4 h-4" />
        Trend Analysis ({metric === 'mean' ? 'Mean Decision' : 'Std Deviation'})
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {trends.map((trend) => (
          <div key={trend!.modelId} className="bg-white rounded p-2 border border-gray-200">
            <div
              className="text-xs text-gray-500 truncate mb-1"
              title={trend!.modelId}
            >
              {getModelDisplayName(trend!.modelId)}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-gray-900">
                {trend!.lastValue.toFixed(2)}
              </span>
              <span
                className={`text-sm font-medium ${
                  trend!.direction === 'up'
                    ? 'text-green-600'
                    : trend!.direction === 'down'
                      ? 'text-red-600'
                      : 'text-gray-500'
                }`}
              >
                {trend!.change > 0 ? '+' : ''}
                {trend!.change.toFixed(2)}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              {trend!.firstValue.toFixed(2)} → {trend!.lastValue.toFixed(2)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <h4 className="text-sm font-medium text-gray-600 mb-3">Runs in Timeline</h4>
        <div className="flex flex-wrap gap-2">
          {data.map((point) => (
            <div
              key={point.runId}
              className="bg-white rounded px-2 py-1 text-xs border border-gray-200"
            >
              <span className="text-gray-500">{point.dateStr}:</span>{' '}
              <span className="text-gray-900" title={point.runName}>
                {point.runName.length > 20
                  ? point.runName.slice(0, 20) + '...'
                  : point.runName}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

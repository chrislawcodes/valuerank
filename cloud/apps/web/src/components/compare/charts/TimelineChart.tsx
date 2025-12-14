/**
 * Timeline Chart Components
 *
 * Extracted from TimelineViz for reusability and file size reduction.
 * Contains the timeline tooltip, metric selector, and summary components.
 */

import { TrendingUp, Calendar } from 'lucide-react';
import type { TimelineMetric } from '../types';

export type TimelineDataPoint = {
  date: number;
  dateStr: string;
  runId: string;
  runName: string;
  [modelId: string]: number | string;
};

type MetricOption = {
  id: TimelineMetric;
  label: string;
  description: string;
};

export const METRIC_OPTIONS: MetricOption[] = [
  { id: 'mean', label: 'Mean Decision', description: 'Average decision value (1-5)' },
  { id: 'stdDev', label: 'Std Deviation', description: 'Decision variance within run' },
];

/**
 * Get the display name for a model (strip provider prefix)
 */
export function getModelDisplayName(modelId: string): string {
  const parts = modelId.split(':');
  return parts[parts.length - 1] || modelId;
}

type TimelineTooltipProps = {
  active?: boolean;
  payload?: readonly unknown[];
  label?: string;
};

/**
 * Custom tooltip component for timeline chart
 */
export function TimelineTooltip({ active, payload, label }: TimelineTooltipProps) {
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

type MetricSelectorProps = {
  selected: TimelineMetric;
  onChange: (metric: TimelineMetric) => void;
};

/**
 * Metric selector dropdown
 */
export function MetricSelector({ selected, onChange }: MetricSelectorProps) {
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

type TimelineSummaryProps = {
  data: TimelineDataPoint[];
  models: string[];
  metric: TimelineMetric;
};

/**
 * Summary statistics panel showing trends for each model
 */
export function TimelineSummary({ data, models, metric }: TimelineSummaryProps) {
  if (data.length < 2 || models.length === 0) return null;

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

type RunLegendProps = {
  data: TimelineDataPoint[];
};

/**
 * Run legend showing all runs in the timeline
 */
export function RunLegend({ data }: RunLegendProps) {
  return (
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
  );
}

/**
 * Value Bar Chart Components
 *
 * Extracted from ValuesViz for reusability and file size reduction.
 * Contains the value tooltip and significant changes summary.
 */

import { TrendingUp, TrendingDown, Info } from 'lucide-react';
import type { ValueComparison } from '../types';

export type ChartDataPoint = {
  valueName: string;
  formattedName: string;
  [runId: string]: number | string | { lower: number; upper: number } | undefined;
};

export type RunValueData = {
  runId: string;
  runName: string;
  values: Map<string, { winRate: number; confidenceInterval: { lower: number; upper: number } }>;
};

type ValueTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<{
    dataKey: string;
    value: number;
    color: string;
    payload?: ChartDataPoint;
  }>;
  label?: string | number;
  runNames: Map<string, string>;
};

/**
 * Custom tooltip for the value bar chart
 */
export function ValueTooltip({ active, payload, label, runNames }: ValueTooltipProps) {
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
 * Format value name for display
 */
export function formatValueName(value: string): string {
  return value.replace(/_/g, ' ');
}

type SignificantChangesProps = {
  comparisons: ValueComparison[];
  runData: RunValueData[];
};

/**
 * Significant changes summary component
 */
export function SignificantChanges({ comparisons, runData }: SignificantChangesProps) {
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
        <TrendingUp className="w-4 h-4 text-yellow-600" />
        Significant Changes (≥10% difference)
      </h4>
      <div className="space-y-2">
        {significant.slice(0, 5).map((comparison) => {
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

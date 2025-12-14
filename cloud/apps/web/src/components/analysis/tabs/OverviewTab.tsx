/**
 * Overview Tab
 *
 * Displays per-model statistics with overall stats and top values.
 */

import type { PerModelStats } from './types';
import { formatPercent } from './types';

type OverviewTabProps = {
  perModel: Record<string, PerModelStats>;
};

/**
 * Model stats row component.
 */
function ModelStatsRow({ modelId, stats }: { modelId: string; stats: PerModelStats }) {
  // Get top 3 values by win rate
  const sortedValues = Object.entries(stats.values)
    .sort(([, a], [, b]) => b.winRate - a.winRate)
    .slice(0, 3);

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-gray-900 truncate" title={modelId}>
          {modelId}
        </h4>
        <span className="text-sm text-gray-500">n={stats.sampleSize}</span>
      </div>

      {/* Overall stats */}
      <div className="grid grid-cols-4 gap-2 mb-3 text-sm">
        <div>
          <span className="text-gray-500">Mean:</span>
          <span className="ml-1 font-medium">{stats.overall.mean.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-gray-500">StdDev:</span>
          <span className="ml-1 font-medium">{stats.overall.stdDev.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-gray-500">Min:</span>
          <span className="ml-1 font-medium">{stats.overall.min.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-gray-500">Max:</span>
          <span className="ml-1 font-medium">{stats.overall.max.toFixed(2)}</span>
        </div>
      </div>

      {/* Top values */}
      {sortedValues.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-500 mb-2">Top Values by Win Rate</p>
          <div className="flex flex-wrap gap-2">
            {sortedValues.map(([valueId, valueStats]) => (
              <span
                key={valueId}
                className="inline-flex items-center px-2 py-1 rounded-full bg-teal-50 text-teal-700 text-xs"
                title={`${formatPercent(valueStats.winRate)} (${valueStats.count.prioritized}/${valueStats.count.prioritized + valueStats.count.deprioritized})`}
              >
                {valueId}: {formatPercent(valueStats.winRate)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function OverviewTab({ perModel }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700">Per-Model Statistics</h3>
        {Object.entries(perModel).map(([modelId, stats]) => (
          <ModelStatsRow key={modelId} modelId={modelId} stats={stats} />
        ))}
      </div>
    </div>
  );
}

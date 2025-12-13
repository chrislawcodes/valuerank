/**
 * Decision Distribution Comparison Visualization
 *
 * Compares how decision distributions (1-5 scale) differ across runs.
 * - Overlay mode: Grouped bars with colors per run
 * - Side-by-side mode: Small multiples for each run
 * - KS statistic display for statistical comparison
 */

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { AlertCircle, BarChart2 } from 'lucide-react';
import type { ComparisonVisualizationProps, RunWithAnalysis } from '../types';
import { ComparisonFilters } from '../ComparisonFilters';
import { ksFromCounts, type KSResult } from '../../../lib/statistics/ks-test';
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

// Decision categories (1-5)
const DECISIONS = [1, 2, 3, 4, 5] as const;

type DecisionData = {
  decision: number;
  [runId: string]: number;
};

type RunDecisionDistribution = {
  runId: string;
  runName: string;
  counts: Record<number, number>;
  total: number;
  mean: number;
};

/**
 * Extract decision distribution from a run's analysis data
 */
function getRunDistribution(run: RunWithAnalysis, modelFilter?: string): RunDecisionDistribution | null {
  const vizData = run.analysis?.visualizationData;
  if (!vizData?.decisionDistribution) return null;

  // Aggregate counts across filtered models
  const aggregateCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalSamples = 0;
  let weightedSum = 0;

  for (const [modelId, modelDist] of Object.entries(vizData.decisionDistribution)) {
    // Apply model filter if specified
    if (modelFilter && modelId !== modelFilter) continue;

    // Get decision counts from visualization data
    if (modelDist) {
      for (const [decision, count] of Object.entries(modelDist)) {
        const d = Number(decision);
        const c = Number(count);
        if (d >= 1 && d <= 5 && !isNaN(c)) {
          aggregateCounts[d] = (aggregateCounts[d] ?? 0) + c;
          totalSamples += c;
          weightedSum += d * c;
        }
      }
    }
  }

  if (totalSamples === 0) return null;

  return {
    runId: run.id,
    runName: formatRunNameShort(run),
    counts: aggregateCounts,
    total: totalSamples,
    mean: weightedSum / totalSamples,
  };
}

/**
 * Calculate KS statistics between all run pairs
 */
function calculateKSStats(distributions: RunDecisionDistribution[]): Map<string, KSResult> {
  const results = new Map<string, KSResult>();

  for (let i = 0; i < distributions.length; i++) {
    for (let j = i + 1; j < distributions.length; j++) {
      const dist1 = distributions[i];
      const dist2 = distributions[j];
      if (dist1 && dist2) {
        const key = `${dist1.runId}-${dist2.runId}`;
        const ks = ksFromCounts(dist1.counts, dist2.counts);
        results.set(key, ks);
      }
    }
  }

  return results;
}

/**
 * Get color for KS interpretation
 */
function getKSColor(interpretation: string): string {
  switch (interpretation) {
    case 'identical':
      return 'text-gray-500';
    case 'similar':
      return 'text-blue-600';
    case 'different':
      return 'text-yellow-600';
    case 'very_different':
      return 'text-red-600';
    default:
      return 'text-gray-500';
  }
}

/**
 * Custom tooltip for overlay chart
 */
function OverlayTooltip({
  active,
  payload,
  label,
  runNames,
}: {
  active?: boolean;
  payload?: readonly unknown[];
  label?: string | number;
  runNames: Map<string, string>;
}) {
  if (!active || !payload || payload.length === 0) return null;

  // Type guard for payload entries
  const typedPayload = payload as ReadonlyArray<{ dataKey: string; value: number; color: string }>;

  return (
    <div className="bg-white p-3 shadow-lg rounded-lg border border-gray-200">
      <p className="font-medium text-gray-900 mb-2">Decision {label}</p>
      <div className="space-y-1 text-sm">
        {typedPayload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-600">{runNames.get(entry.dataKey) || entry.dataKey}:</span>
            <span className="font-medium text-gray-900">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Overlay mode chart - grouped bars for all runs
 */
function OverlayChart({
  distributions,
  chartData,
  runColors,
}: {
  distributions: RunDecisionDistribution[];
  chartData: DecisionData[];
  runColors: Map<string, string>;
}) {
  const runNames = new Map(distributions.map((d) => [d.runId, d.runName]));

  return (
    <div style={{ height: 350 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ left: 20, right: 20, top: 20, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="decision"
            tick={{ fill: '#6b7280' }}
            tickFormatter={(d) => `Decision ${d}`}
          />
          <YAxis tick={{ fill: '#6b7280' }} />
          <Tooltip content={(props) => <OverlayTooltip {...props} runNames={runNames} />} />
          <Legend
            formatter={(value) => runNames.get(value) || value}
            wrapperStyle={{ paddingTop: 10 }}
          />
          {distributions.map((dist) => (
            <Bar
              key={dist.runId}
              dataKey={dist.runId}
              fill={runColors.get(dist.runId)}
              name={dist.runId}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Side-by-side mode - small multiples for each run
 */
function SideBySideChart({
  distributions,
  runColors,
}: {
  distributions: RunDecisionDistribution[];
  runColors: Map<string, string>;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {distributions.map((dist) => {
        const data = DECISIONS.map((d) => ({
          decision: d,
          count: dist.counts[d] || 0,
        }));

        const color = runColors.get(dist.runId) || '#14b8a6';

        return (
          <div key={dist.runId} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="mb-2">
              <h4 className="text-sm font-medium text-gray-900 truncate" title={dist.runName}>
                {dist.runName}
              </h4>
              <p className="text-xs text-gray-500">
                n={dist.total}, mean={dist.mean.toFixed(2)}
              </p>
            </div>
            <div style={{ height: 150 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ left: 0, right: 0, top: 5, bottom: 20 }}>
                  <XAxis
                    dataKey="decision"
                    tick={{ fill: '#6b7280', fontSize: 10 }}
                    tickFormatter={(d) => String(d)}
                  />
                  <YAxis hide />
                  <Bar dataKey="count">
                    {data.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * KS Statistics Summary
 */
function KSStatsSummary({
  distributions,
  ksStats,
}: {
  distributions: RunDecisionDistribution[];
  ksStats: Map<string, KSResult>;
}) {
  if (distributions.length < 2) return null;

  const pairs = Array.from(ksStats.entries());
  if (pairs.length === 0) return null;

  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <h4 className="text-sm font-medium text-gray-600 mb-3 flex items-center gap-2">
        Distribution Similarity (KS Statistic)
        <button
          title="Kolmogorov-Smirnov statistic measures the maximum distance between cumulative distributions. Lower values indicate more similar distributions."
          className="text-gray-400 hover:text-gray-600"
        >
          <AlertCircle className="w-3.5 h-3.5" />
        </button>
      </h4>
      <div className="space-y-2">
        {pairs.map(([key, ks]) => {
          const [id1, id2] = key.split('-');
          const name1 = distributions.find((d) => d.runId === id1)?.runName || id1?.slice(0, 8);
          const name2 = distributions.find((d) => d.runId === id2)?.runName || id2?.slice(0, 8);

          return (
            <div key={key} className="flex items-center justify-between text-sm">
              <span className="text-gray-700">
                {name1} <span className="text-gray-400">vs</span> {name2}
              </span>
              <span className={`font-mono ${getKSColor(ks.interpretation)}`}>
                {ks.statistic.toFixed(3)}{' '}
                <span className="text-xs">({ks.interpretation.replace('_', ' ')})</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Main DecisionsViz component
 */
export function DecisionsViz({ runs, filters, onFilterChange }: ComparisonVisualizationProps) {
  // Extract distributions for each run (with model filter applied)
  const distributions = useMemo(() => {
    return runs
      .map((run) => getRunDistribution(run, filters.model))
      .filter((d): d is RunDecisionDistribution => d !== null);
  }, [runs, filters.model]);

  // Build chart data for overlay mode
  const chartData = useMemo((): DecisionData[] => {
    return DECISIONS.map((decision) => {
      const point: DecisionData = { decision };
      for (const dist of distributions) {
        point[dist.runId] = dist.counts[decision] || 0;
      }
      return point;
    });
  }, [distributions]);

  // Assign colors to runs
  const runColors = useMemo(() => {
    const colors = new Map<string, string>();
    distributions.forEach((dist, i) => {
      colors.set(dist.runId, RUN_COLORS[i % RUN_COLORS.length] ?? '#14b8a6');
    });
    return colors;
  }, [distributions]);

  // Calculate KS statistics
  const ksStats = useMemo(() => calculateKSStats(distributions), [distributions]);

  // Handle case where no distributions available
  if (distributions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <BarChart2 className="w-6 h-6 text-gray-400" />
        </div>
        <p className="text-gray-600">No decision data available</p>
        <p className="text-gray-500 text-sm mt-1">
          {filters.model
            ? `No data for model: ${filters.model}`
            : 'Selected runs have no analysis data'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <ComparisonFilters
        filters={filters}
        onFilterChange={onFilterChange}
        runs={runs}
        showDisplayMode={true}
        showValueFilter={false}
      />

      {/* Chart */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Decision Distribution Comparison</h3>

        {filters.displayMode === 'overlay' ? (
          <OverlayChart
            distributions={distributions}
            chartData={chartData}
            runColors={runColors}
          />
        ) : (
          <SideBySideChart distributions={distributions} runColors={runColors} />
        )}
      </div>

      {/* KS Statistics */}
      <KSStatsSummary distributions={distributions} ksStats={ksStats} />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {distributions.map((dist) => (
          <div key={dist.runId} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="text-xs text-gray-500 truncate" title={dist.runName}>
              {dist.runName}
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold text-gray-900">{dist.mean.toFixed(2)}</span>
              <span className="text-xs text-gray-500">mean</span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              n={dist.total.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

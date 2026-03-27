/**
 * Distribution Chart Components
 *
 * Extracted from DecisionsViz for reusability and file size reduction.
 * Contains OverlayChart (grouped bars) and SideBySideChart (small multiples).
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
  Cell,
} from 'recharts';
import {
  getDecisionDistributionChartAriaLabel,
  type DecisionDistributionBucket,
  DECISION_DISTRIBUTION_BUCKET_CODES,
} from '../../../utils/decisionDistributionDisplay';

export type DecisionData = {
  decision: number;
  [runId: string]: number;
};

export type RunDecisionDistribution = {
  runId: string;
  runName: string;
  counts: Record<number, number>;
  total: number;
  mean: number;
};

type OverlayTooltipProps = {
  active?: boolean;
  payload?: readonly unknown[];
  label?: string | number;
  runNames: Map<string, string>;
  buckets: DecisionDistributionBucket[];
};

/**
 * Custom tooltip for overlay chart
 */
export function OverlayTooltip({ active, payload, label, runNames, buckets }: OverlayTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const typedPayload = payload as ReadonlyArray<{ dataKey: string; value: number; color: string }>;
  const bucketLabel = buckets.find((bucket) => bucket.code === String(label))?.label ?? String(label);

  return (
    <div className="bg-white p-3 shadow-lg rounded-lg border border-gray-200">
      <p className="font-medium text-gray-900 mb-2">Decision bucket: {bucketLabel}</p>
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

type OverlayChartProps = {
  distributions: RunDecisionDistribution[];
  chartData: DecisionData[];
  runColors: Map<string, string>;
  buckets: DecisionDistributionBucket[];
};

/**
 * Overlay mode chart - grouped bars for all runs
 */
export function OverlayChart({ distributions, chartData, runColors, buckets }: OverlayChartProps) {
  const runNames = new Map(distributions.map((d) => [d.runId, d.runName]));
  const bucketLabelByCode = new Map<string, string>(buckets.map((bucket) => [bucket.code, bucket.label]));
  const chartAriaLabel = getDecisionDistributionChartAriaLabel(buckets);

  return (
    <div style={{ height: 350 }} aria-label={chartAriaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ left: 20, right: 20, top: 20, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="decision"
            tick={{ fill: '#6b7280' }}
            tickFormatter={(d) => bucketLabelByCode.get(String(d)) ?? String(d)}
          />
          <YAxis tick={{ fill: '#6b7280' }} />
          <Tooltip content={(props) => <OverlayTooltip {...props} runNames={runNames} buckets={buckets} />} />
          <Legend
            formatter={(value: string) => runNames.get(value) || value}
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

type SideBySideChartProps = {
  distributions: RunDecisionDistribution[];
  runColors: Map<string, string>;
  buckets: DecisionDistributionBucket[];
};

/**
 * Side-by-side mode - small multiples for each run
 */
export function SideBySideChart({ distributions, runColors, buckets }: SideBySideChartProps) {
  const chartAriaLabel = getDecisionDistributionChartAriaLabel(buckets);
  const bucketLabelByCode = new Map<string, string>(buckets.map((bucket) => [bucket.code, bucket.label]));

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label={chartAriaLabel}>
      {distributions.map((dist) => {
        const data = DECISION_DISTRIBUTION_BUCKET_CODES.map((code) => ({
          decision: Number(code),
          count: dist.counts[Number(code)] || 0,
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
                    tickFormatter={(d) => bucketLabelByCode.get(String(d)) ?? String(d)}
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

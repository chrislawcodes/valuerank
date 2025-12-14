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

// Decision categories (1-5)
const DECISIONS = [1, 2, 3, 4, 5] as const;

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
};

/**
 * Custom tooltip for overlay chart
 */
export function OverlayTooltip({ active, payload, label, runNames }: OverlayTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

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

type OverlayChartProps = {
  distributions: RunDecisionDistribution[];
  chartData: DecisionData[];
  runColors: Map<string, string>;
};

/**
 * Overlay mode chart - grouped bars for all runs
 */
export function OverlayChart({ distributions, chartData, runColors }: OverlayChartProps) {
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

type SideBySideChartProps = {
  distributions: RunDecisionDistribution[];
  runColors: Map<string, string>;
};

/**
 * Side-by-side mode - small multiples for each run
 */
export function SideBySideChart({ distributions, runColors }: SideBySideChartProps) {
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

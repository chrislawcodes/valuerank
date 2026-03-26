import { useRef } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { VisualizationData } from '../../api/operations/analysis';
import {
  buildDecisionDistributionBuckets,
  getDecisionDistributionChartAriaLabel,
  getDecisionDistributionEmptyState,
  getDecisionDistributionHelperText,
  normalizeDecisionDistributionCounts,
  type DecisionDistributionBucket,
  type DecisionDistributionCounts,
  DECISION_DISTRIBUTION_BUCKET_CODES,
} from '../../utils/decisionDistributionDisplay';
import { CopyVisualButton } from '../ui/CopyVisualButton';

type DecisionDistributionChartProps = {
  visualizationData: VisualizationData;
  dimensionLabels?: Record<string, string>;
};

type ChartDataPoint = {
  model: string;
  fullName: string;
  totalCount: number;
  rawCounts: DecisionDistributionCounts;
  '1': number;
  '2': number;
  '3': number;
  '4': number;
  '5': number;
};

// Decision code color scheme (green to red gradient)
const DECISION_COLORS = {
  '1': '#22c55e', // green - strong agree
  '2': '#86efac', // light green
  '3': '#fbbf24', // yellow - neutral
  '4': '#fb923c', // light red/orange
  '5': '#ef4444', // red - strong disagree
} as const;

function formatShare(value: number): string {
  return `${value.toFixed(0)}%`;
}

export function buildDecisionDistributionChartData(
  decisionDistribution: VisualizationData['decisionDistribution']
): ChartDataPoint[] {
  const chartData = Object.entries(decisionDistribution).map(([model, dist]) => {
    const rawCounts = normalizeDecisionDistributionCounts(dist);
    const totalCount = DECISION_DISTRIBUTION_BUCKET_CODES.reduce(
      (sum, code) => sum + rawCounts[code],
      0,
    );

    return {
      model: model.length > 20 ? model.slice(0, 18) + '...' : model,
      fullName: model,
      totalCount,
      rawCounts,
      '1': totalCount > 0 ? (rawCounts['1'] / totalCount) * 100 : 0,
      '2': totalCount > 0 ? (rawCounts['2'] / totalCount) * 100 : 0,
      '3': totalCount > 0 ? (rawCounts['3'] / totalCount) * 100 : 0,
      '4': totalCount > 0 ? (rawCounts['4'] / totalCount) * 100 : 0,
      '5': totalCount > 0 ? (rawCounts['5'] / totalCount) * 100 : 0,
    };
  });

  chartData.sort((a, b) => b.totalCount - a.totalCount);
  return chartData;
}

export function formatDecisionDistributionScopeNote(chartData: ChartDataPoint[]): string {
  if (chartData.length === 0) {
    return 'Total decisions in scope unavailable.';
  }

  const totals = chartData.map((entry) => entry.totalCount);
  const minTotal = Math.min(...totals);
  const maxTotal = Math.max(...totals);

  if (minTotal === maxTotal) {
    return `Total decisions in scope: n=${minTotal} per model. Hover bars for raw counts.`;
  }

  return `Total decisions in scope varies by model: n=${minTotal}-${maxTotal}. Hover bars for raw counts.`;
}

/**
 * Custom tooltip component.
 */
export function CustomTooltip({ active, payload, buckets }: {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
  buckets: DecisionDistributionBucket[];
}) {
  if (!active || !payload?.[0]) return null;

  const data = payload[0].payload;

  return (
    <div className="bg-white p-3 shadow-lg rounded-lg border border-gray-200">
      <p className="font-medium text-gray-900 mb-2">{data.fullName}</p>
      <p className="text-sm text-gray-600 mb-2">Total decisions: n={data.totalCount}</p>
      <div className="space-y-1 text-sm">
        {buckets.map((bucket) => (
          <div key={bucket.code} className="flex items-center gap-2" aria-label={bucket.ariaLabel}>
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: DECISION_COLORS[bucket.code] }}
            />
            <span>{bucket.label}:</span>
            <span className="font-medium">
              {formatShare(data[bucket.code])} ({data.rawCounts[bucket.code]})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
export function CustomLegend({ buckets }: { buckets: DecisionDistributionBucket[] }) {
  const renderItem = (bucket: DecisionDistributionBucket) => (
    <div key={bucket.code} className="flex items-center gap-2 text-sm" aria-label={bucket.ariaLabel}>
      <div
        className="w-3 h-3 rounded"
        style={{ backgroundColor: DECISION_COLORS[bucket.code] }}
      />
      <span className="text-gray-600">{bucket.label}</span>
    </div>
  );

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 md:grid-cols-5">
      {buckets.map((bucket) => renderItem(bucket))}
    </div>
  );
}
export function DecisionDistributionChart({ visualizationData, dimensionLabels }: DecisionDistributionChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const buckets = buildDecisionDistributionBuckets(dimensionLabels);
  const chartAriaLabel = getDecisionDistributionChartAriaLabel(buckets);
  const { decisionDistribution } = visualizationData;

  if (!decisionDistribution || Object.keys(decisionDistribution).length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {getDecisionDistributionEmptyState()}
      </div>
    );
  }

  const chartData = buildDecisionDistributionChartData(decisionDistribution);
  const chartHeight = Math.max(300, chartData.length * 50);
  return (
    <div ref={chartRef} className="space-y-4" aria-label={chartAriaLabel}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-gray-700">Decision Distribution by Model</h3>
          <p className="mt-1 text-xs text-gray-500">{getDecisionDistributionHelperText()}</p>
        </div>
        <CopyVisualButton targetRef={chartRef} label="decision distribution chart" />
      </div>
      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 120, right: 30, top: 20, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={formatShare}
              label={{ value: '% of decisions', position: 'insideBottom', offset: -10 }}
            />
            <YAxis
              type="category"
              dataKey="model"
              width={110}
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip buckets={buckets} />} />
            <Legend content={<CustomLegend buckets={buckets} />} />
            {DECISION_DISTRIBUTION_BUCKET_CODES.map((d) => (
              <Bar
                key={d}
                dataKey={d}
                stackId="a"
                fill={DECISION_COLORS[d]}
                name={buckets.find((bucket) => bucket.code === d)?.label ?? d}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

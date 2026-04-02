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
  rawCounts: DecisionDistributionCounts;
  totalCount: number;
  opponentStrongly: number;
  opponentSomewhat: number;
  neutral: number;
  somewhat: number;
  strongly: number;
};

// Decision code color scheme from opponent support to this-value support.
const DECISION_COLORS = {
  opponentStrongly: '#ef4444', // red - strong support for the other value
  opponentSomewhat: '#fb923c', // orange - somewhat support for the other value
  neutral: '#fbbf24', // yellow - neutral
  somewhat: '#86efac', // light green - somewhat support this value
  strongly: '#22c55e', // green - strong support this value
} as const;

function formatShare(value: number): string {
  return `${value.toFixed(0)}%`;
}

export function buildDecisionDistributionChartData(
  decisionDistribution: VisualizationData['decisionDistribution']
): ChartDataPoint[] {
  const chartData = Object.entries(decisionDistribution).map(([model, dist]) => {
    const rawCounts = normalizeDecisionDistributionCounts(dist);
    const total = DECISION_DISTRIBUTION_BUCKET_CODES.reduce(
      (sum, code) => sum + rawCounts[code],
      0,
    );

    return {
      model: model.length > 20 ? model.slice(0, 18) + '...' : model,
      fullName: model,
      rawCounts,
      totalCount: total,
      opponentStrongly: total > 0 ? (rawCounts.opponentStrongly / total) * 100 : 0,
      opponentSomewhat: total > 0 ? (rawCounts.opponentSomewhat / total) * 100 : 0,
      neutral: total > 0 ? (rawCounts.neutral / total) * 100 : 0,
      somewhat: total > 0 ? (rawCounts.somewhat / total) * 100 : 0,
      strongly: total > 0 ? (rawCounts.strongly / total) * 100 : 0,
    };
  });

  chartData.sort((a, b) => b.totalCount - a.totalCount || a.fullName.localeCompare(b.fullName));
  return chartData;
}

export function formatDecisionDistributionScopeNote(chartData: ChartDataPoint[]): string {
  if (chartData.length === 0) {
    return 'Decision share data unavailable.';
  }

  return 'Each bar shows the share of transcript decisions for that model.';
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
      <div className="space-y-1 text-sm">
        {buckets.map((bucket) => (
          <div key={bucket.code} className="flex items-center gap-2" aria-label={bucket.ariaLabel}>
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: DECISION_COLORS[bucket.code] }}
            />
            <span>{bucket.label}:</span>
            <span className="font-medium">{formatShare(data[bucket.code])}</span>
            <span className="font-medium text-gray-500">({data.rawCounts[bucket.code]})</span>
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

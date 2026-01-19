/**
 * ScenarioVarianceChart Component
 *
 * Visualizes per-scenario variance from multi-sample runs.
 * Shows a horizontal bar chart with scenarios sorted by variance (stdDev).
 */

import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Cell,
  ReferenceLine,
} from 'recharts';
import type { VarianceAnalysis, ScenarioVarianceStats } from '../../api/operations/analysis';

type ScenarioVarianceChartProps = {
  varianceAnalysis: VarianceAnalysis;
  maxScenarios?: number;
};

type ChartDataPoint = {
  scenario: string;
  fullName: string;
  stdDev: number;
  mean: number;
  variance: number;
  range: number;
  sampleCount: number;
  isHighVariance: boolean;
};

// Color scale from green (low variance) to red (high variance)
function getVarianceColor(stdDev: number, maxStdDev: number): string {
  if (maxStdDev === 0) return '#22c55e'; // All green if no variance
  const ratio = stdDev / maxStdDev;
  if (ratio < 0.25) return '#22c55e'; // green
  if (ratio < 0.5) return '#84cc16'; // lime
  if (ratio < 0.75) return '#f59e0b'; // amber
  return '#ef4444'; // red
}

/**
 * Custom tooltip component.
 */
function CustomTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
}) {
  if (!active || !payload?.[0]) return null;

  const data = payload[0].payload;

  return (
    <div className="bg-white p-3 shadow-lg rounded-lg border border-gray-200 max-w-xs">
      <p className="font-medium text-gray-900 mb-2 text-sm break-words">{data.fullName}</p>
      <div className="space-y-1 text-xs text-gray-600">
        <p>Std Dev: <span className="font-medium text-purple-700">±{data.stdDev.toFixed(3)}</span></p>
        <p>Mean: <span className="font-medium">{data.mean.toFixed(2)}</span></p>
        <p>Range: <span className="font-medium">{data.range.toFixed(2)}</span></p>
        <p>Samples: <span className="font-medium">{data.sampleCount}</span></p>
      </div>
    </div>
  );
}

export function ScenarioVarianceChart({ varianceAnalysis, maxScenarios = 15 }: ScenarioVarianceChartProps) {
  if (!varianceAnalysis.isMultiSample) {
    return null;
  }

  // Combine most variable and least variable scenarios
  const allScenarios: ScenarioVarianceStats[] = [
    ...varianceAnalysis.mostVariableScenarios,
    ...varianceAnalysis.leastVariableScenarios,
  ];

  // Deduplicate by scenarioId + modelId
  const seen = new Set<string>();
  const uniqueScenarios = allScenarios.filter((s) => {
    const key = `${s.scenarioId}-${s.modelId ?? 'all'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (uniqueScenarios.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No variance data available for scenarios
      </div>
    );
  }

  // Sort by stdDev descending and limit
  const sortedScenarios = [...uniqueScenarios]
    .sort((a, b) => b.stdDev - a.stdDev)
    .slice(0, maxScenarios);

  const maxStdDev = sortedScenarios.length > 0
    ? Math.max(...sortedScenarios.map((s) => s.stdDev))
    : 0;
  const avgStdDev = sortedScenarios.length > 0
    ? sortedScenarios.reduce((sum, s) => sum + s.stdDev, 0) / sortedScenarios.length
    : 0;

  // Transform for chart
  const chartData: ChartDataPoint[] = sortedScenarios.map((s) => ({
    scenario: s.scenarioName.length > 30 ? s.scenarioName.slice(0, 28) + '...' : s.scenarioName,
    fullName: s.scenarioName,
    stdDev: s.stdDev,
    mean: s.mean,
    variance: s.variance,
    range: s.range,
    sampleCount: s.sampleCount,
    isHighVariance: s.stdDev > avgStdDev,
  }));

  // Reverse for horizontal bar chart (so highest is at top)
  chartData.reverse();

  const chartHeight = Math.max(300, chartData.length * 35);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-700">Scenario Response Variance</h3>
        <p className="text-xs text-gray-500 mt-1">
          Standard deviation of responses across {varianceAnalysis.samplesPerScenario} samples per scenario.
          Higher bars indicate more variable (less consistent) responses.
        </p>
      </div>

      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 10, right: 30, top: 10, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
            <XAxis
              type="number"
              domain={[0, 'auto']}
              tick={{ fontSize: 11 }}
              label={{ value: 'Std Dev', position: 'bottom', offset: -5, fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="scenario"
              width={180}
              tick={{ fontSize: 10 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              x={avgStdDev}
              stroke="#9333ea"
              strokeDasharray="5 5"
              label={{ value: 'Avg', position: 'top', fontSize: 10, fill: '#9333ea' }}
            />
            <Bar dataKey="stdDev" name="Std Deviation" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getVarianceColor(entry.stdDev, maxStdDev)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#22c55e' }} />
          <span>Low variance (consistent)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#f59e0b' }} />
          <span>Medium variance</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#ef4444' }} />
          <span>High variance (inconsistent)</span>
        </div>
      </div>
    </div>
  );
}

import { useRef } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalysisSemanticsView } from '../analysis-v2/analysisSemantics';
import { CopyVisualButton } from '../ui/CopyVisualButton';

type ModelConsistencyChartProps = {
  reliability: AnalysisSemanticsView['reliability'];
  analysisMode?: 'single' | 'paired';
  isPooledAcrossCompanionRuns?: boolean;
};

type ChartDataPoint = {
  modelId: string;
  baselineReliability: number;
  baselineNoise: number | null;
  directionalAgreement: number | null;
  neutralShare: number | null;
  coverageCount: number;
  uniqueScenarios: number;
  repeatCoverageShare: number | null;
  contributingRunCount: number | null;
  hasLowCoverageWarning: boolean;
  hasHighDriftWarning: boolean;
  weightedOverallSignedCenterSd: number | null;
};

function formatPercent(value: number): string {
  const percentage = value * 100;
  const roundedToTenth = Math.round(percentage * 10) / 10;

  if (Number.isInteger(roundedToTenth)) {
    return `${roundedToTenth.toFixed(0)}%`;
  }

  return `${roundedToTenth.toFixed(1)}%`;
}

function formatNoise(value: number | null): string {
  return value === null ? '—' : value.toFixed(2);
}

function formatCoverage(
  count: number,
  total: number,
  contributingRunCount: number | null,
): string {
  if (contributingRunCount !== null) {
    return `${count} repeated cells across ${total} conditions`;
  }

  return `${count} / ${total} conditions`;
}

function WarningCallout({
  tone,
  title,
  message,
}: {
  tone: 'warning' | 'danger';
  title: string;
  message: string;
}) {
  const classes = tone === 'danger'
    ? 'border-red-200 bg-red-50 text-red-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';

  return (
    <div className={`rounded-md border p-4 text-sm ${classes}`}>
      <p className="font-medium">{title}</p>
      <p className="mt-1">{message}</p>
    </div>
  );
}

function UnavailableCallout({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
      {message}
    </div>
  );
}

function getUnavailableMessage(
  reliability: AnalysisSemanticsView['reliability'],
  unavailableModels: Array<AnalysisSemanticsView['reliability']['byModel'][string]>,
): string {
  if (reliability.rowAvailability.status === 'unavailable') {
    return reliability.rowAvailability.message;
  }

  const unavailableReasons = new Set(
    unavailableModels
      .filter((model) => model.availability.status === 'unavailable')
      .map((model) => (model.availability.status === 'unavailable' ? model.availability.message : null))
      .filter((message): message is string => message !== null),
  );

  if (unavailableReasons.size === 1) {
    return unavailableReasons.values().next().value as string;
  }

  return 'Baseline reliability is unavailable for this analysis.';
}

function ReliabilityTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
}) {
  if (!active || !payload?.[0]) {
    return null;
  }

  const data = payload[0].payload;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-lg">
      <p className="mb-2 font-medium text-gray-900">{data.modelId}</p>
      <div className="space-y-1 text-gray-600">
        <p>Baseline Reliability: <span className="font-medium">{formatPercent(data.baselineReliability)}</span></p>
        <p>Baseline Noise: <span className="font-medium">{formatNoise(data.baselineNoise)}</span></p>
        <p>Directional Agreement: <span className="font-medium">{data.directionalAgreement === null ? '—' : formatPercent(data.directionalAgreement)}</span></p>
        <p>Neutral Share: <span className="font-medium">{data.neutralShare === null ? '—' : formatPercent(data.neutralShare)}</span></p>
        <p>Repeat Coverage: <span className="font-medium">{formatCoverage(data.coverageCount, data.uniqueScenarios, data.contributingRunCount)}</span></p>
        {data.repeatCoverageShare !== null && (
          <p>Coverage Share: <span className="font-medium">{formatPercent(data.repeatCoverageShare)}</span></p>
        )}
        {data.contributingRunCount !== null && (
          <p>Source Runs: <span className="font-medium">{data.contributingRunCount}</span></p>
        )}
        {data.weightedOverallSignedCenterSd !== null && (
          <p>Run Drift: <span className="font-medium">{data.weightedOverallSignedCenterSd.toFixed(2)}</span></p>
        )}
      </div>
    </div>
  );
}

export function ModelConsistencyChart({
  reliability,
  analysisMode,
  isPooledAcrossCompanionRuns = false,
}: ModelConsistencyChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  const availableModels = Object.values(reliability.byModel)
    .filter((model) => model.availability.status === 'available' && model.baselineReliability !== null)
    .sort((left, right) => {
      if ((right.baselineReliability ?? 0) !== (left.baselineReliability ?? 0)) {
        return (right.baselineReliability ?? 0) - (left.baselineReliability ?? 0);
      }

      const leftNoise = left.baselineNoise ?? Number.POSITIVE_INFINITY;
      const rightNoise = right.baselineNoise ?? Number.POSITIVE_INFINITY;
      if (leftNoise !== rightNoise) {
        return leftNoise - rightNoise;
      }

      return left.modelId.localeCompare(right.modelId);
    });

  const unavailableModels = Object.values(reliability.byModel)
    .filter((model) => model.availability.status === 'unavailable')
    .sort((left, right) => left.modelId.localeCompare(right.modelId));

  if (reliability.rowAvailability.status === 'unavailable' || availableModels.length === 0) {
    return <UnavailableCallout message={getUnavailableMessage(reliability, unavailableModels)} />;
  }

  const chartData: ChartDataPoint[] = availableModels.map((model) => ({
    modelId: model.modelId,
    baselineReliability: model.baselineReliability ?? 0,
    baselineNoise: model.baselineNoise,
    directionalAgreement: model.directionalAgreement,
    neutralShare: model.neutralShare,
    coverageCount: model.coverageCount,
    uniqueScenarios: model.uniqueScenarios,
    repeatCoverageShare: model.repeatCoverageShare,
    contributingRunCount: model.contributingRunCount,
    hasLowCoverageWarning: model.hasLowCoverageWarning,
    hasHighDriftWarning: model.hasHighDriftWarning,
    weightedOverallSignedCenterSd: model.weightedOverallSignedCenterSd,
  }));

  const mostReliable = chartData.slice(0, 3);
  const leastReliable = [...chartData]
    .sort((left, right) => {
      if (left.baselineReliability !== right.baselineReliability) {
        return left.baselineReliability - right.baselineReliability;
      }

      const leftNoise = left.baselineNoise ?? Number.POSITIVE_INFINITY;
      const rightNoise = right.baselineNoise ?? Number.POSITIVE_INFINITY;
      if (leftNoise !== rightNoise) {
        return rightNoise - leftNoise;
      }

      return left.modelId.localeCompare(right.modelId);
    })
    .slice(0, 3);

  const chartHeight = Math.max(400, chartData.length * 32);
  const chartMinWidth = Math.max(600, chartData.length * 60);

  return (
    <div ref={chartRef} className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-gray-700">
            Baseline Reliability by Model
            {analysisMode === 'paired' ? ' (paired scope)' : ''}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Higher values mean more repeatable baseline decisions across repeated condition judgments.
            {analysisMode === 'paired'
              ? isPooledAcrossCompanionRuns
                ? ' Paired mode uses pooled companion reliability data when that data is available.'
                : ' Paired mode is selected. This summary updates once the companion run is available.'
              : ' Single mode keeps the current results scoped to one vignette at a time.'}
          </p>
        </div>
        <CopyVisualButton targetRef={chartRef} label="baseline reliability chart" />
      </div>

      {reliability.aggregateWarnings.lowCoverageModels.length > 0 && (
        <WarningCallout
          tone="warning"
          title="Low repeat coverage"
          message={`Reliability is shown, but ${reliability.aggregateWarnings.lowCoverageModels.join(', ')} only have 3 or 4 repeated conditions. This is useful, but not very strong yet.`}
        />
      )}

      {reliability.aggregateWarnings.highDriftModels.length > 0 && (
        <WarningCallout
          tone="danger"
          title="High drift between runs"
          message={`These runs still moved around a lot from run to run for ${reliability.aggregateWarnings.highDriftModels.join(', ')}. That is still a real finding, but read the reliability result carefully.`}
        />
      )}

      <div className="overflow-x-auto">
        <div
          role="img"
          aria-label="Baseline Reliability by Model bar chart"
          style={{ minWidth: `${chartMinWidth}px`, height: `${chartHeight}px` }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: 20, right: 30, top: 20, bottom: 70 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="modelId"
                angle={-45}
                textAnchor="end"
                height={80}
                interval={0}
                tick={{ fontSize: 11 }}
              />
              <YAxis domain={[0, 1]} tickFormatter={formatPercent} />
              <Tooltip content={<ReliabilityTooltip />} />
              <Bar
                dataKey="baselineReliability"
                fill="#0f766e"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="sr-only">Data also appears in the reliability ranking panels below.</p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-teal-50 p-3">
          <h4 className="mb-2 text-sm font-medium text-teal-800">Most Reliable</h4>
          <div className="space-y-1">
            {mostReliable.map((model) => (
              <div key={model.modelId} className="flex justify-between gap-3 text-xs text-teal-700">
                <span className="truncate" title={model.modelId}>{model.modelId}</span>
                <span className="font-mono">{formatPercent(model.baselineReliability)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg bg-amber-50 p-3">
          <h4 className="mb-2 text-sm font-medium text-amber-800">Least Reliable</h4>
          <div className="space-y-1">
            {leastReliable.map((model) => (
              <div key={model.modelId} className="flex justify-between gap-3 text-xs text-amber-700">
                <span className="truncate" title={model.modelId}>{model.modelId}</span>
                <span className="font-mono">{formatPercent(model.baselineReliability)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {reliability.hasMixedAvailability && (
        <p className="text-xs text-gray-500">
          Some models are excluded because baseline reliability is unavailable.
        </p>
      )}

      {unavailableModels.length > 0 && (
        <div className="rounded-lg border border-gray-200 p-4">
          <h4 className="mb-2 text-sm font-medium text-gray-700">Excluded From Reliability Chart</h4>
          <div className="space-y-2">
            {unavailableModels.map((model) => (
              <div key={model.modelId} className="flex flex-col gap-0.5 text-xs text-gray-600 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-medium text-gray-700">{model.modelId}</span>
                <span>{model.availability.status === 'unavailable' ? model.availability.message : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

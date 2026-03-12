/**
 * Overview Tab
 *
 * Displays a semantics-backed summary table above the existing V1 decision
 * frequency drilldowns.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { PerModelStats } from './types';
import type { VarianceAnalysis, VisualizationData } from '../../../api/operations/analysis';
import { Button } from '../../ui/Button';
import { CopyVisualButton } from '../../ui/CopyVisualButton';
import { Tooltip } from '../../ui/Tooltip';
import {
  getDecisionSideNames,
  mapDecisionSidesToScenarioAttributes,
  resolveScenarioAttributes,
} from '../../../utils/decisionLabels';
import {
  ANALYSIS_BASE_PATH,
  type AnalysisBasePath,
  buildAnalysisTranscriptsPath,
} from '../../../utils/analysisRouting';
import type {
  AnalysisSemanticsView,
  PreferenceViewModel,
  ReliabilityViewModel,
} from '../../analysis-v2/analysisSemantics';

type OverviewTabProps = {
  runId: string;
  analysisBasePath?: AnalysisBasePath;
  perModel: Record<string, PerModelStats>;
  visualizationData: VisualizationData | null | undefined;
  varianceAnalysis?: VarianceAnalysis | null;
  dimensionLabels?: Record<string, string>;
  expectedAttributes?: string[];
  semantics: AnalysisSemanticsView;
  completedBatches: number | '-';
  aggregateSourceRunCount: number | null;
  isAggregate: boolean;
};

type ConditionRow = {
  id: string;
  attributeALevel: string;
  attributeBLevel: string;
  scenarioIds: string[];
};

type ConditionStats = {
  mean: number;
};

type ConditionRepeatStats = {
  directionalAgreement: number | null;
  medianSignedDistance: number | null;
  neutralShare: number | null;
  totalCount: number;
  maxRange: number | null;
};

type RepeatPattern = 'stable' | 'softLean' | 'torn' | 'noisy';

const REPEAT_PATTERN_LABELS: Record<RepeatPattern, string> = {
  stable: 'Stable',
  softLean: 'Soft Lean',
  torn: 'Torn',
  noisy: 'Unstable',
};

const SUMMARY_COLUMN_TITLES = {
  model: 'AI model summarized in this row. Each row combines that model’s overall value preference and its repeat-pattern mix across repeated conditions in this analysis.',
  preferredValue: 'The value this model most often favors overall in this analysis slice. This is the top value on the model-level preference summary, not a count of individual transcript decisions.',
  preferenceStrength: 'How strong the model’s overall preference is, combining direction and distance from neutral. Stronger values mean the model leans more clearly toward one side overall.',
  valueAgreement: 'How often repeated judgments stay on the same value side. Higher means the model usually leans the same way when the same conflict is repeated, even if the exact score changes a little.',
  stable: 'Share of repeated conditions where the model shows a settled pattern. These are repeats where one clear pattern wins and the answers do not move around much.',
  softLean: 'Share of repeated conditions where the model shows a narrow but only slightly off-neutral lean. These are coherent repeats with a mild lean, but not strong enough to count as fully settled.',
  torn: 'Share of repeated conditions where the value conflict remains unresolved between the two sides. These are repeats that stay near the middle or split between sides without a clear winner.',
  unstable: 'Share of repeated conditions where the answers swing too widely to read as one coherent pattern. These are the broadest or messiest repeats in the set.',
} as const;

type RepeatPatternMetrics =
  | {
      status: 'available';
      counts: Record<RepeatPattern, number>;
      conditionIds: Record<RepeatPattern, string[]>;
      classifiedCount: number;
      repeatedCount: number;
      strongerConfidenceCount: number;
    }
  | {
      status: 'unavailable';
      reason: string;
      repeatedCount: number;
      strongerConfidenceCount: number;
    };

function buildConditionRows(
  scenarioDimensions: VisualizationData['scenarioDimensions'] | null | undefined,
  attributeA: string,
  attributeB: string,
): ConditionRow[] {
  if (!scenarioDimensions || !attributeA || !attributeB) {
    return [];
  }

  const grouped = new Map<string, ConditionRow>();
  Object.entries(scenarioDimensions).forEach(([scenarioId, dimensions]) => {
    const aLevel = String(dimensions[attributeA] ?? 'N/A');
    const bLevel = String(dimensions[attributeB] ?? 'N/A');
    const id = `${aLevel}||${bLevel}`;
    const current = grouped.get(id);
    if (current) {
      current.scenarioIds.push(scenarioId);
      return;
    }

    grouped.set(id, {
      id,
      attributeALevel: aLevel,
      attributeBLevel: bLevel,
      scenarioIds: [scenarioId],
    });
  });

  return [...grouped.values()].sort((left, right) => {
    if (left.attributeALevel === right.attributeALevel) {
      return left.attributeBLevel.localeCompare(right.attributeBLevel);
    }
    return left.attributeALevel.localeCompare(right.attributeALevel);
  });
}

function formatPercent(value: number): string {
  const percentage = value * 100;
  const roundedToTenth = Math.round(percentage * 10) / 10;

  if (Number.isInteger(roundedToTenth)) {
    return `${roundedToTenth.toFixed(0)}%`;
  }

  return `${roundedToTenth.toFixed(1)}%`;
}

function formatSignedCenter(value: number | null): string {
  if (value === null) {
    return '—';
  }

  const rounded = Math.round(value * 100) / 100;
  if (Object.is(rounded, -0) || rounded === 0) {
    return '0.00';
  }

  if (rounded > 0) {
    return `+${rounded.toFixed(2)}`;
  }

  return `−${Math.abs(rounded).toFixed(2)}`;
}

function getPreferenceStrengthLabel(preferenceStrength: number | null): string | null {
  if (preferenceStrength === null) {
    return null;
  }

  if (preferenceStrength >= 1.0) {
    return 'Strong';
  }
  if (preferenceStrength >= 0.5) {
    return 'Moderate';
  }
  return 'Weak';
}

function getPreferredValueName(model: PreferenceViewModel): string | null {
  return model.topPrioritizedValues[0]
    ?? model.neutralValues[0]
    ?? model.topDeprioritizedValues[0]
    ?? null;
}

function formatPreferenceStrength(model: PreferenceViewModel): string | null {
  if (model.availability.status === 'unavailable') {
    return null;
  }

  const strengthLabel = getPreferenceStrengthLabel(model.preferenceStrength);
  if (strengthLabel === null || model.overallSignedCenter === null) {
    return null;
  }

  return `${strengthLabel} (${formatSignedCenter(model.overallSignedCenter)})`;
}

function getPreferenceUnavailableReason(model: PreferenceViewModel): string {
  return model.availability.status === 'unavailable'
    ? model.availability.message
    : 'Preference summary is unavailable for this model.';
}

function getMetricUnavailableReason(model: ReliabilityViewModel): string {
  return model.availability.status === 'unavailable'
    ? model.availability.message
    : 'This metric is unavailable for this model.';
}

function InfoTooltipTrigger({
  label,
  title,
}: {
  label: string;
  title: string;
}) {
  return (
    <Tooltip
      content={<div className="max-w-xs whitespace-normal text-xs leading-5">{title}</div>}
      position="top"
      variant="light"
      className="max-w-xs whitespace-normal"
    >
      {/* eslint-disable-next-line react/forbid-elements -- Lightweight tooltip trigger requires custom icon-only control */}
      <button
        type="button"
        className="inline-flex cursor-help text-gray-400 transition-colors hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded-sm"
        aria-label={`${label}: ${title}`}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}

function SummaryHeader({
  label,
  title,
  align = 'left',
}: {
  label: string;
  title: string;
  align?: 'left' | 'center';
}) {
  return (
    <div className={`flex items-center gap-1 ${align === 'center' ? 'justify-center' : 'justify-start'}`}>
      <span>{label}</span>
      <InfoTooltipTrigger label={label} title={title} />
    </div>
  );
}

function classifyRepeatPattern(
  directionalAgreement: number | null | undefined,
  medianSignedDistance: number | null | undefined,
  neutralShare: number | null | undefined,
  range: number | null | undefined,
): RepeatPattern | null {
  if (
    directionalAgreement === null
    || directionalAgreement === undefined
    || medianSignedDistance === null
    || medianSignedDistance === undefined
    || neutralShare === null
    || neutralShare === undefined
    || range === null
    || range === undefined
  ) {
    return null;
  }

  const absoluteDistance = Math.abs(medianSignedDistance);
  if (directionalAgreement >= 0.80) {
    return 'stable';
  }
  if (absoluteDistance >= 0.50 && range <= 1 && directionalAgreement >= 0.55) {
    return 'softLean';
  }
  if (range >= 3) {
    return 'noisy';
  }
  if (neutralShare >= 0.60 || absoluteDistance < 0.35) {
    return 'torn';
  }
  return 'torn';
}

function getConditionRepeatStats(
  modelId: string,
  scenarioIds: string[],
  varianceAnalysis: VarianceAnalysis | null | undefined,
): ConditionRepeatStats | null {
  if (!varianceAnalysis) return null;

  const modelStats = varianceAnalysis.perModel[modelId];
  if (!modelStats?.perScenario) return null;

  const repeatedScenarioStats = scenarioIds
    .map((scenarioId) => modelStats.perScenario[scenarioId])
    .filter((stats): stats is NonNullable<typeof stats> => stats != null && stats.sampleCount >= 2);

  if (repeatedScenarioStats.length === 0) {
    return null;
  }

  const totalCount = repeatedScenarioStats.reduce((sum, stats) => sum + stats.sampleCount, 0);
  const weightedMean = <T extends keyof (typeof repeatedScenarioStats)[number]>(key: T): number | null => {
    const populated = repeatedScenarioStats.filter((stats) => typeof stats[key] === 'number');
    if (populated.length === 0) {
      return null;
    }

    const weightedValue = populated.reduce((sum, stats) => {
      return sum + (Number(stats[key]) * stats.sampleCount);
    }, 0);
    const weightedCount = populated.reduce((sum, stats) => sum + stats.sampleCount, 0);

    return weightedCount > 0 ? Number((weightedValue / weightedCount).toFixed(2)) : null;
  };

  return {
    directionalAgreement: weightedMean('directionalAgreement'),
    medianSignedDistance: weightedMean('medianSignedDistance'),
    neutralShare: weightedMean('neutralShare'),
    totalCount,
    maxRange: repeatedScenarioStats.reduce((max, stats) => Math.max(max, stats.range ?? 0), 0),
  };
}

function getRepeatPatternMetrics(
  modelId: string,
  varianceAnalysis: VarianceAnalysis | null | undefined,
  conditionRows: ConditionRow[],
): RepeatPatternMetrics {
  if (!varianceAnalysis?.perModel[modelId]?.perScenario) {
    return {
      status: 'unavailable',
      reason: 'No repeat data is available for this model.',
      repeatedCount: 0,
      strongerConfidenceCount: 0,
    };
  }

  if (conditionRows.length === 0) {
    return {
      status: 'unavailable',
      reason: 'Condition-level grouping is unavailable for this run.',
      repeatedCount: 0,
      strongerConfidenceCount: 0,
    };
  }

  const counts: Record<RepeatPattern, number> = {
    stable: 0,
    softLean: 0,
    torn: 0,
    noisy: 0,
  };
  const conditionIds: Record<RepeatPattern, string[]> = {
    stable: [],
    softLean: [],
    torn: [],
    noisy: [],
  };
  let strongerConfidenceCount = 0;
  let repeatedCount = 0;

  conditionRows.forEach((row) => {
    const conditionStats = getConditionRepeatStats(modelId, row.scenarioIds, varianceAnalysis);
    if (!conditionStats) {
      return;
    }

    repeatedCount += 1;
    if (conditionStats.totalCount >= 10) {
      strongerConfidenceCount += 1;
    }

    const pattern = classifyRepeatPattern(
      conditionStats.directionalAgreement,
      conditionStats.medianSignedDistance,
      conditionStats.neutralShare,
      conditionStats.maxRange,
    );
    if (!pattern) {
      return;
    }

    counts[pattern] += 1;
    conditionIds[pattern].push(row.id);
  });

  const classifiedCount = counts.stable + counts.softLean + counts.torn + counts.noisy;
  if (classifiedCount === 0) {
    return {
      status: 'unavailable',
      reason: 'Some repeat data is present, but not enough conditions produced a publishable stability classification.',
      repeatedCount,
      strongerConfidenceCount,
    };
  }

  return {
    status: 'available',
    counts,
    conditionIds,
    classifiedCount,
    repeatedCount,
    strongerConfidenceCount,
  };
}

function getHeatmapColor(value: number): string {
  if (value < 1 || value > 5) return 'rgba(243, 244, 246, 0.4)';
  if (value <= 2.5) {
    const intensity = Math.max(0.1, (3 - value) / 2);
    return `rgba(59, 130, 246, ${intensity * 0.3})`;
  }
  if (value >= 3.5) {
    const intensity = Math.max(0.1, (value - 3) / 2);
    return `rgba(249, 115, 22, ${intensity * 0.3})`;
  }
  return 'rgba(156, 163, 175, 0.15)';
}

function getScoreTextColor(value: number): string {
  if (value <= 2.5) return 'text-blue-700';
  if (value >= 3.5) return 'text-orange-700';
  return 'text-gray-700';
}

function calculateConditionStatsFromVariance(
  modelId: string,
  scenarioIds: string[],
  varianceAnalysis?: VarianceAnalysis | null
): ConditionStats | null {
  if (!varianceAnalysis) return null;

  const modelStats = varianceAnalysis.perModel[modelId];
  if (!modelStats?.perScenario) return null;

  let weightedMeanSum = 0;
  let totalCount = 0;

  scenarioIds.forEach((scenarioId) => {
    const scenarioStats = modelStats.perScenario[scenarioId];
    if (!scenarioStats || scenarioStats.sampleCount < 1) return;

    weightedMeanSum += scenarioStats.mean * scenarioStats.sampleCount;
    totalCount += scenarioStats.sampleCount;
  });

  if (totalCount === 0) return null;

  return { mean: weightedMeanSum / totalCount };
}

function SummaryCell({
  children,
  title,
  showInfoIcon = false,
  align = 'left',
}: {
  children: ReactNode;
  title?: string;
  showInfoIcon?: boolean;
  align?: 'left' | 'center';
}) {
  return (
    <div className={`flex items-center gap-1 truncate ${align === 'center' ? 'justify-center' : ''}`}>
      <div className="truncate" aria-label={title}>
        {children}
      </div>
      {showInfoIcon && title ? <InfoTooltipTrigger label="Cell details" title={title} /> : null}
    </div>
  );
}

function PatternMetricButton({
  runId,
  analysisBasePath,
  modelId,
  pattern,
  metrics,
  title,
  rowDim,
  colDim,
}: {
  runId: string;
  analysisBasePath: AnalysisBasePath;
  modelId: string;
  pattern: RepeatPattern;
  metrics: Extract<RepeatPatternMetrics, { status: 'available' }>;
  title: string;
  rowDim: string;
  colDim: string;
}) {
  const navigate = useNavigate();
  const count = metrics.counts[pattern];
  const value = metrics.classifiedCount === 0 ? 0 : count / metrics.classifiedCount;

  if (count === 0) {
    return <SummaryCell title={title} align="center">{formatPercent(value)}</SummaryCell>;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-auto min-h-0 px-0 py-0 text-sm font-medium text-gray-700 hover:bg-transparent hover:text-teal-700"
      title={title}
      aria-label={title}
      onClick={() => {
        const params = new URLSearchParams({
          modelId,
          repeatPattern: pattern,
          rowDim,
          colDim,
          conditionIds: metrics.conditionIds[pattern].join(','),
        });
        navigate(buildAnalysisTranscriptsPath(analysisBasePath, runId, params));
      }}
    >
      {formatPercent(value)}
    </Button>
  );
}

function OverviewSummaryTable({
  runId,
  analysisBasePath = ANALYSIS_BASE_PATH,
  semantics,
  varianceAnalysis,
  visualizationData,
  expectedAttributes = [],
  completedBatches,
  aggregateSourceRunCount,
  isAggregate,
}: {
  runId: string;
  analysisBasePath?: AnalysisBasePath;
  semantics: AnalysisSemanticsView;
  varianceAnalysis?: VarianceAnalysis | null;
  visualizationData: VisualizationData | null | undefined;
  expectedAttributes?: string[];
  completedBatches: number | '-';
  aggregateSourceRunCount: number | null;
  isAggregate: boolean;
}) {
  const models = useMemo(() => {
    return Object.keys(semantics.preference.byModel)
      .sort((left, right) => left.localeCompare(right))
      .map((modelId) => {
        const preference = semantics.preference.byModel[modelId];
        const reliability = semantics.reliability.byModel[modelId];
        if (!preference || !reliability) {
          return null;
        }

        return {
          modelId,
          preference,
          reliability,
        };
      })
      .filter((model): model is {
        modelId: string;
        preference: PreferenceViewModel;
        reliability: ReliabilityViewModel;
      } => model !== null);
  }, [semantics.preference.byModel, semantics.reliability.byModel]);
  const scenarioDimensions = visualizationData?.scenarioDimensions;
  const modelScenarioMatrix = visualizationData?.modelScenarioMatrix;
  const availableAttributes = useMemo(() => {
    return resolveScenarioAttributes(scenarioDimensions, expectedAttributes, modelScenarioMatrix);
  }, [expectedAttributes, modelScenarioMatrix, scenarioDimensions]);
  const attributeA = availableAttributes[0] ?? '';
  const attributeB = availableAttributes[1] ?? availableAttributes[0] ?? '';
  const conditionRows = useMemo(
    () => buildConditionRows(scenarioDimensions, attributeA, attributeB),
    [attributeA, attributeB, scenarioDimensions],
  );
  const summaryUnavailableMessage = semantics.preference.rowAvailability.status === 'unavailable'
    ? semantics.preference.rowAvailability.message
    : semantics.reliability.rowAvailability.status === 'unavailable'
      ? semantics.reliability.rowAvailability.message
      : null;

  const helperText = isAggregate
    ? aggregateSourceRunCount === null
      ? 'Run-level evidence: contributing source-run count unavailable'
      : `Run-level evidence: ${aggregateSourceRunCount} contributing source run${aggregateSourceRunCount === 1 ? '' : 's'}`
    : completedBatches === '-'
      ? 'Run-level evidence: completed batch count unavailable'
      : `Run-level evidence: ${completedBatches} completed batch${completedBatches === 1 ? '' : 'es'}`;

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 p-4">
      <div>
        <h3 className="text-sm font-medium text-gray-700">Overview Summary</h3>
        <p className="mt-1 text-xs text-gray-500">{helperText}</p>
      </div>

      {summaryUnavailableMessage ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          {summaryUnavailableMessage}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                <SummaryHeader label="Model" title={SUMMARY_COLUMN_TITLES.model} />
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                <SummaryHeader label="Preferred Value" title={SUMMARY_COLUMN_TITLES.preferredValue} />
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                <SummaryHeader label="Preference Strength" title={SUMMARY_COLUMN_TITLES.preferenceStrength} />
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold uppercase text-gray-600">
                <SummaryHeader label="Value Agreement" title={SUMMARY_COLUMN_TITLES.valueAgreement} align="center" />
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold uppercase text-gray-600">
                <SummaryHeader label="Stable %" title={SUMMARY_COLUMN_TITLES.stable} align="center" />
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold uppercase text-gray-600">
                <SummaryHeader label="Soft Lean %" title={SUMMARY_COLUMN_TITLES.softLean} align="center" />
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold uppercase text-gray-600">
                <SummaryHeader label="Torn %" title={SUMMARY_COLUMN_TITLES.torn} align="center" />
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold uppercase text-gray-600">
                <SummaryHeader label="Unstable %" title={SUMMARY_COLUMN_TITLES.unstable} align="center" />
              </th>
            </tr>
          </thead>
          <tbody>
            {models.map(({ modelId, preference, reliability }) => {
              const preferredValue = getPreferredValueName(preference);
              const preferenceStrengthText = formatPreferenceStrength(preference);
              const repeatMetrics = getRepeatPatternMetrics(modelId, varianceAnalysis, conditionRows);
              const repeatEvidenceDetail = repeatMetrics.status === 'available'
                ? `${repeatMetrics.classifiedCount} of ${repeatMetrics.repeatedCount} repeated conditions classified • ${repeatMetrics.strongerConfidenceCount} condition${repeatMetrics.strongerConfidenceCount === 1 ? '' : 's'} with 10+ repeats`
                : `${repeatMetrics.reason} • ${repeatMetrics.strongerConfidenceCount} condition${repeatMetrics.strongerConfidenceCount === 1 ? '' : 's'} with 10+ repeats`;

              return (
                <tr key={modelId}>
                  <td className="border border-gray-200 px-3 py-2 text-sm text-gray-700">
                    <div className="font-medium text-gray-900">{modelId}</div>
                  </td>
                  <td className="border border-gray-200 px-3 py-2 text-sm text-gray-700">
                    {preferredValue ? (
                      <SummaryCell title={preferredValue}>{preferredValue}</SummaryCell>
                    ) : (
                      <SummaryCell title={getPreferenceUnavailableReason(preference)} showInfoIcon>—</SummaryCell>
                    )}
                  </td>
                  <td className="border border-gray-200 px-3 py-2 text-sm text-gray-700">
                    {preferenceStrengthText ? (
                      <SummaryCell title={preferenceStrengthText}>{preferenceStrengthText}</SummaryCell>
                    ) : (
                      <SummaryCell title={getPreferenceUnavailableReason(preference)} showInfoIcon>—</SummaryCell>
                    )}
                  </td>
                  <td className="border border-gray-200 px-3 py-2 text-center text-sm text-gray-700">
                    {reliability.directionalAgreement !== null ? (
                      <SummaryCell title={`Directional agreement: ${formatPercent(reliability.directionalAgreement)}`}>
                        {formatPercent(reliability.directionalAgreement)}
                      </SummaryCell>
                    ) : (
                      <SummaryCell title={getMetricUnavailableReason(reliability)} showInfoIcon>—</SummaryCell>
                    )}
                  </td>
                  {(['stable', 'softLean', 'torn', 'noisy'] as const).map((pattern) => {
                    const label = REPEAT_PATTERN_LABELS[pattern];
                    const title = repeatMetrics.status === 'available'
                      ? `${label}: ${repeatMetrics.counts[pattern]} of ${repeatMetrics.classifiedCount} repeated conditions • ${repeatMetrics.strongerConfidenceCount} condition${repeatMetrics.strongerConfidenceCount === 1 ? '' : 's'} with 10+ repeats`
                      : repeatEvidenceDetail;

                    return (
                      <td key={pattern} className="border border-gray-200 px-3 py-2 text-center text-sm text-gray-700">
                        {repeatMetrics.status === 'available' ? (
                          <PatternMetricButton
                            runId={runId}
                            analysisBasePath={analysisBasePath}
                            modelId={modelId}
                            pattern={pattern}
                            metrics={repeatMetrics}
                            title={title}
                            rowDim={attributeA}
                            colDim={attributeB}
                          />
                        ) : (
                          <SummaryCell title={title} showInfoIcon>—</SummaryCell>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConditionDecisionMatrix({
  runId,
  analysisBasePath = ANALYSIS_BASE_PATH,
  perModel,
  visualizationData,
  varianceAnalysis,
  dimensionLabels,
  expectedAttributes = [],
}: {
  runId: string;
  analysisBasePath?: AnalysisBasePath;
  perModel: Record<string, PerModelStats>;
  visualizationData: VisualizationData | null | undefined;
  varianceAnalysis?: VarianceAnalysis | null;
  dimensionLabels?: Record<string, string>;
  expectedAttributes?: string[];
}) {
  const countsTableRef = useRef<HTMLDivElement>(null);
  const meanTableRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const scenarioDimensions = visualizationData?.scenarioDimensions;
  const modelScenarioMatrix = visualizationData?.modelScenarioMatrix;
  const models = useMemo(() => Object.keys(perModel).sort(), [perModel]);

  const availableAttributes = useMemo(() => {
    return resolveScenarioAttributes(scenarioDimensions, expectedAttributes, modelScenarioMatrix);
  }, [scenarioDimensions, expectedAttributes, modelScenarioMatrix]);

  const attributeA = availableAttributes[0] ?? '';
  const attributeB = availableAttributes[1] ?? availableAttributes[0] ?? '';
  const [selectedModels, setSelectedModels] = useState<string[]>(models);

  useEffect(() => {
    setSelectedModels((current) => {
      const next = current.filter((modelId) => models.includes(modelId));
      return next.length > 0 ? next : models;
    });
  }, [models]);

  const visibleModels = useMemo(
    () => models.filter((modelId) => selectedModels.includes(modelId)),
    [models, selectedModels]
  );

  const toggleModel = (modelId: string) => {
    setSelectedModels((current) => {
      if (current.includes(modelId)) {
        return current.filter((id) => id !== modelId);
      }
      return [...current, modelId];
    });
  };

  const conditionRows = useMemo<ConditionRow[]>(() => {
    if (!scenarioDimensions || !attributeA || !attributeB) return [];

    const grouped = new Map<string, ConditionRow>();
    Object.entries(scenarioDimensions).forEach(([scenarioId, dimensions]) => {
      const aLevel = String(dimensions[attributeA] ?? 'N/A');
      const bLevel = String(dimensions[attributeB] ?? 'N/A');
      const id = `${aLevel}||${bLevel}`;
      const current = grouped.get(id);
      if (current) {
        current.scenarioIds.push(scenarioId);
        return;
      }
      grouped.set(id, {
        id,
        attributeALevel: aLevel,
        attributeBLevel: bLevel,
        scenarioIds: [scenarioId],
      });
    });

    return [...grouped.values()].sort((left, right) => {
      if (left.attributeALevel === right.attributeALevel) {
        return left.attributeBLevel.localeCompare(right.attributeBLevel);
      }
      return left.attributeALevel.localeCompare(right.attributeALevel);
    });
  }, [scenarioDimensions, attributeA, attributeB]);

  const getMeanDecision = useCallback(
    (modelId: string, scenarioIds: string[]): ConditionStats | null => {
      const varianceStats = calculateConditionStatsFromVariance(modelId, scenarioIds, varianceAnalysis);
      if (varianceStats) return varianceStats;

      const byScenario = modelScenarioMatrix?.[modelId];
      if (!byScenario) return null;

      const values: number[] = [];
      scenarioIds.forEach((scenarioId) => {
        const score = byScenario[scenarioId];
        if (typeof score === 'number' && Number.isFinite(score)) {
          values.push(score);
        }
      });

      if (values.length === 0) return null;
      return { mean: values.reduce((sum, v) => sum + v, 0) / values.length };
    },
    [modelScenarioMatrix, varianceAnalysis]
  );

  const sideNames = useMemo(() => getDecisionSideNames(dimensionLabels), [dimensionLabels]);
  const sideAttributeMap = useMemo(
    () => mapDecisionSidesToScenarioAttributes(sideNames.aName, sideNames.bName, availableAttributes),
    [availableAttributes, sideNames.aName, sideNames.bName]
  );
  const lowSideAttribute = sideAttributeMap.lowAttribute;
  const highSideAttribute = sideAttributeMap.highAttribute;

  const getSensitivity = useCallback((modelId: string, attribute: string, side: 'low' | 'high'): number | null => {
    if (!scenarioDimensions || !modelScenarioMatrix) return null;
    const byScenario = modelScenarioMatrix[modelId];
    if (!byScenario) return null;

    const pairs: Array<{ x: number; y: number }> = [];
    Object.entries(scenarioDimensions).forEach(([scenarioId, dimensions]) => {
      const xRaw = dimensions[attribute];
      const yRaw = byScenario[scenarioId];
      const x = typeof xRaw === 'number' ? xRaw : Number.parseFloat(String(xRaw));
      if (!Number.isFinite(x) || typeof yRaw !== 'number' || !Number.isFinite(yRaw)) {
        return;
      }
      pairs.push({ x, y: yRaw });
    });

    if (pairs.length < 2) return null;
    const meanX = pairs.reduce((sum, pair) => sum + pair.x, 0) / pairs.length;
    const meanY = pairs.reduce((sum, pair) => sum + pair.y, 0) / pairs.length;
    let numerator = 0;
    let denominator = 0;
    pairs.forEach(({ x, y }) => {
      const centeredX = x - meanX;
      numerator += centeredX * (y - meanY);
      denominator += centeredX * centeredX;
    });
    if (denominator === 0) return null;
    const rawSlope = numerator / denominator;
    return side === 'low' ? -rawSlope : rawSlope;
  }, [modelScenarioMatrix, scenarioDimensions]);

  const countsByModel = useMemo(() => {
    const result: Record<string, {
      a: number;
      neutral: number;
      b: number;
      total: number;
      aSensitivity: number | null;
      bSensitivity: number | null;
    }> = {};
    if (!modelScenarioMatrix || conditionRows.length === 0) return result;

    visibleModels.forEach((modelId) => {
      let a = 0;
      let neutral = 0;
      let b = 0;
      let total = 0;

      conditionRows.forEach((row) => {
        const stats = getMeanDecision(modelId, row.scenarioIds);
        if (stats === null) return;
        const rounded = Math.round(stats.mean);
        if (rounded < 1 || rounded > 5) return;

        total += 1;
        if (rounded <= 2) a += 1;
        else if (rounded === 3) neutral += 1;
        else b += 1;
      });

      result[modelId] = {
        a,
        neutral,
        b,
        total,
        aSensitivity: getSensitivity(modelId, lowSideAttribute, 'low'),
        bSensitivity: getSensitivity(modelId, highSideAttribute, 'high'),
      };
    });

    return result;
  }, [
    conditionRows,
    getMeanDecision,
    getSensitivity,
    highSideAttribute,
    lowSideAttribute,
    modelScenarioMatrix,
    visibleModels,
  ]);

  const handleCellClick = (modelId: string, row: ConditionRow, options?: { decisionCode?: string }) => {
    const params = new URLSearchParams({
      rowDim: attributeA,
      colDim: attributeB,
      row: row.attributeALevel,
      col: row.attributeBLevel,
      model: modelId,
    });
    if (options?.decisionCode) {
      params.set('decisionCode', options.decisionCode);
    }
    navigate(buildAnalysisTranscriptsPath(analysisBasePath, runId, params));
  };

  const handleCountsCellClick = (modelId: string, decisionBucket: 'a' | 'neutral' | 'b') => {
    const params = new URLSearchParams({
      rowDim: attributeA,
      colDim: attributeB,
      model: modelId,
      decisionBucket,
    });
    navigate(buildAnalysisTranscriptsPath(analysisBasePath, runId, params));
  };

  if (!scenarioDimensions || !modelScenarioMatrix) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        Condition-level matrix data is unavailable. Recompute analysis to regenerate scenario dimensions.
      </div>
    );
  }

  if (availableAttributes.length < 2) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        Need at least two condition attributes to build an attribute A/B overview table.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-gray-500">AI Columns</label>
          <details className="relative">
            <summary className="min-w-52 cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm">
              {visibleModels.length === models.length
                ? 'All target AIs'
                : `${visibleModels.length} of ${models.length} selected`}
            </summary>
            <div className="absolute z-10 mt-2 w-64 rounded-md border border-gray-200 bg-white p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto min-h-0 px-0 py-0 text-xs font-medium text-teal-700 hover:text-teal-800"
                  onClick={() => setSelectedModels(models)}
                >
                  Select all
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto min-h-0 px-0 py-0 text-xs font-medium text-gray-600 hover:text-gray-800"
                  onClick={() => setSelectedModels([])}
                >
                  Clear
                </Button>
              </div>
              <div className="max-h-52 space-y-2 overflow-y-auto">
                {models.map((modelId) => (
                  <label key={modelId} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={selectedModels.includes(modelId)}
                      onChange={() => toggleModel(modelId)}
                      className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="truncate" title={modelId}>
                      {modelId}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </details>
        </div>
      </div>

      <div ref={countsTableRef} className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-xs font-semibold uppercase text-gray-500">Decision Frequency</h4>
          <CopyVisualButton targetRef={countsTableRef} label="condition bucket counts table" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr>
                <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                  AI
                </th>
                <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700">
                  {lowSideAttribute}
                </th>
                <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700">
                  Neutral
                </th>
                <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700">
                  {highSideAttribute}
                </th>
                <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700">
                  {lowSideAttribute} Sensitivity
                </th>
                <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700">
                  {highSideAttribute} Sensitivity
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleModels.map((modelId) => {
                const counts = countsByModel[modelId] ?? {
                  a: 0,
                  neutral: 0,
                  b: 0,
                  total: 0,
                  aSensitivity: null,
                  bSensitivity: null,
                };
                const maxCount = Math.max(counts.a, counts.neutral, counts.b);
                const highlightA = maxCount > 0 && counts.a === maxCount;
                const highlightNeutral = maxCount > 0 && counts.neutral === maxCount;
                const highlightB = maxCount > 0 && counts.b === maxCount;

                return (
                  <tr key={modelId}>
                    <td className="border border-gray-200 px-3 py-2 text-sm text-gray-700">
                      <span className="truncate" title={modelId}>
                        {modelId}
                      </span>
                      <span className="ml-2 text-xs text-gray-400">({counts.total})</span>
                    </td>
                    <td className={`border border-gray-200 px-3 py-2 text-center text-sm font-medium text-blue-700 ${highlightA ? 'bg-blue-50' : ''}`}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-full min-h-0 w-full rounded-sm bg-transparent px-0 py-0 text-inherit hover:bg-transparent hover:ring-1 hover:ring-teal-300 focus:ring-teal-400 focus:ring-offset-0"
                        title={`View transcripts for ${modelId} where condition mean rounds to ${lowSideAttribute}`}
                        onClick={() => handleCountsCellClick(modelId, 'a')}
                      >
                        {counts.a}
                      </Button>
                    </td>
                    <td className={`border border-gray-200 px-3 py-2 text-center text-sm font-medium text-gray-700 ${highlightNeutral ? 'bg-gray-100' : ''}`}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-full min-h-0 w-full rounded-sm bg-transparent px-0 py-0 text-inherit hover:bg-transparent hover:ring-1 hover:ring-teal-300 focus:ring-teal-400 focus:ring-offset-0"
                        title={`View neutral transcripts for ${modelId}`}
                        onClick={() => handleCountsCellClick(modelId, 'neutral')}
                      >
                        {counts.neutral}
                      </Button>
                    </td>
                    <td className={`border border-gray-200 px-3 py-2 text-center text-sm font-medium text-orange-700 ${highlightB ? 'bg-orange-50' : ''}`}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-full min-h-0 w-full rounded-sm bg-transparent px-0 py-0 text-inherit hover:bg-transparent hover:ring-1 hover:ring-teal-300 focus:ring-teal-400 focus:ring-offset-0"
                        title={`View transcripts for ${modelId} where condition mean rounds to ${highSideAttribute}`}
                        onClick={() => handleCountsCellClick(modelId, 'b')}
                      >
                        {counts.b}
                      </Button>
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-center text-sm text-gray-700">
                      {counts.aSensitivity == null ? '-' : counts.aSensitivity.toFixed(3)}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-center text-sm text-gray-700">
                      {counts.bSensitivity == null ? '-' : counts.bSensitivity.toFixed(3)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleModels.length === 0 && (
            <div className="mt-2 text-xs text-amber-700">Select at least one AI column to display data.</div>
          )}
        </div>
        <div className="text-xs text-gray-500">
          Counts are per condition cell, based on each cell&apos;s mean decision rounded to the nearest 1-5.
        </div>
        <div className="text-xs text-gray-500">
          Sensitivity: positive means decisions move toward that attribute&apos;s side; negative means away.
        </div>
      </div>

      <div ref={meanTableRef} className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-xs font-semibold uppercase text-gray-500">Condition Decisions</h4>
          <CopyVisualButton targetRef={meanTableRef} label="condition by AI mean decision table" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr>
                <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                  Condition
                </th>
                {visibleModels.map((modelId) => (
                  <th
                    key={modelId}
                    className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700"
                    title={modelId}
                  >
                    {modelId}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {conditionRows.map((row) => (
                <tr key={row.id}>
                  <td className="border border-gray-200 px-3 py-2 text-sm text-gray-700">
                    {attributeA}: {row.attributeALevel}, {attributeB}: {row.attributeBLevel}
                  </td>
                  {visibleModels.map((modelId) => {
                    const stats = getMeanDecision(modelId, row.scenarioIds);
                    const isOtherCell = stats === null;

                    return (
                      <td
                        key={`${row.id}-${modelId}`}
                        className="border border-gray-200 px-3 py-2 text-center text-sm transition-colors"
                        style={{ backgroundColor: stats === null ? undefined : getHeatmapColor(stats.mean) }}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-full min-h-0 w-full rounded-sm bg-transparent px-0 py-0 text-inherit hover:bg-transparent hover:ring-1 hover:ring-teal-300 focus:ring-teal-400 focus:ring-offset-0"
                          title={`View transcripts for ${modelId} | ${attributeA}: ${row.attributeALevel}, ${attributeB}: ${row.attributeBLevel}${isOtherCell ? ' | Decision: other' : ''}`}
                          onClick={() => handleCellClick(modelId, row, isOtherCell ? { decisionCode: 'other' } : undefined)}
                        >
                          {stats === null ? (
                            <span className="text-gray-500">-</span>
                          ) : (
                            <span className={`inline-flex flex-col items-center ${getScoreTextColor(stats.mean)}`}>
                              <span className="font-semibold">{stats.mean.toFixed(2)}</span>
                            </span>
                          )}
                        </Button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {visibleModels.length === 0 && (
            <div className="mt-2 text-xs text-amber-700">Select at least one AI column to display data.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function OverviewTab({
  runId,
  analysisBasePath = ANALYSIS_BASE_PATH,
  perModel,
  visualizationData,
  varianceAnalysis,
  dimensionLabels,
  expectedAttributes = [],
  semantics,
  completedBatches,
  aggregateSourceRunCount,
  isAggregate,
}: OverviewTabProps) {
  return (
    <div className="space-y-6">
      <OverviewSummaryTable
        runId={runId}
        analysisBasePath={analysisBasePath}
        semantics={semantics}
        varianceAnalysis={varianceAnalysis}
        visualizationData={visualizationData}
        expectedAttributes={expectedAttributes}
        completedBatches={completedBatches}
        aggregateSourceRunCount={aggregateSourceRunCount}
        isAggregate={isAggregate}
      />
      <ConditionDecisionMatrix
        runId={runId}
        analysisBasePath={analysisBasePath}
        perModel={perModel}
        visualizationData={visualizationData}
        varianceAnalysis={varianceAnalysis}
        dimensionLabels={dimensionLabels}
        expectedAttributes={expectedAttributes}
      />
    </div>
  );
}

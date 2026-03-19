/**
 * Overview Tab
 *
 * Displays a semantics-backed summary table above condition-level drilldowns.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { PerModelStats } from './types';
import type { AnalysisResult, VarianceAnalysis, VisualizationData } from '../../../api/operations/analysis';
import type { Run } from '../../../api/operations/runs';
import { Button } from '../../ui/Button';
import { CopyVisualButton } from '../../ui/CopyVisualButton';
import { Tooltip } from '../../ui/Tooltip';
import { PairedRunComparisonCard } from '../PairedRunComparisonCard';
import {
  resolveScenarioAttributes,
} from '../../../utils/decisionLabels';
import {
  ANALYSIS_BASE_PATH,
  type AnalysisBasePath,
  buildAnalysisTranscriptsPath,
} from '../../../utils/analysisRouting';
import {
  buildOrientedConditionRows,
  getOrientationBucketLabel,
  mergePairedVarianceAnalysis,
  mergePairedVisualizationData,
  type OrientationInspectionMode,
  type OrientedConditionRow,
} from '../../../utils/pairedScopeAdapter';
import { getPairedOrientationLabels } from '../../../utils/methodology';
import type {
  AnalysisSemanticsView,
  PreferenceViewModel,
  ReliabilityViewModel,
} from '../../analysis-v2/analysisSemantics';

type OverviewTabProps = {
  runId: string;
  analysisBasePath?: AnalysisBasePath;
  analysisSearchParams?: URLSearchParams | string;
  definitionContent?: unknown;
  perModel: Record<string, PerModelStats>;
  visualizationData: VisualizationData | null | undefined;
  varianceAnalysis?: VarianceAnalysis | null;
  expectedAttributes?: string[];
  semantics: AnalysisSemanticsView;
  completedBatches: number | '-';
  aggregateSourceRunCount: number | null;
  isAggregate: boolean;
  analysisMode?: 'single' | 'paired';
  companionAnalysis?: AnalysisResult | null;
  currentRun?: Run | null;
  currentAnalysis?: AnalysisResult | null;
  companionRun?: Run | null;
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

type RepeatPatternSource = {
  runId: string;
  varianceAnalysis: VarianceAnalysis | null | undefined;
  conditionRows: ConditionRow[];
};

type RepeatPattern = 'stable' | 'softLean' | 'torn' | 'noisy';
type JobChoicePresentationOrder = 'A_first' | 'B_first';

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
      sourceCount: number;
    }
  | {
      status: 'unavailable';
      reason: string;
      repeatedCount: number;
      strongerConfidenceCount: number;
      sourceCount: number;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getRunPresentationOrder(run: Run | null | undefined): JobChoicePresentationOrder | null {
  const fromConfig = run?.config?.jobChoicePresentationOrder;
  if (fromConfig === 'A_first' || fromConfig === 'B_first') {
    return fromConfig;
  }

  const content = run?.definition?.content;
  if (!isRecord(content) || !isRecord(content.methodology)) {
    return null;
  }

  const value = content.methodology.presentation_order;
  return value === 'A_first' || value === 'B_first' ? value : null;
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
      sourceCount: 1,
    };
  }

  if (conditionRows.length === 0) {
    return {
      status: 'unavailable',
      reason: 'Condition-level grouping is unavailable for this run.',
      repeatedCount: 0,
      strongerConfidenceCount: 0,
      sourceCount: 1,
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
      sourceCount: 1,
    };
  }

  return {
    status: 'available',
    counts,
    conditionIds,
    classifiedCount,
    repeatedCount,
    strongerConfidenceCount,
    sourceCount: 1,
  };
}

function mergeRepeatPatternMetrics(
  metricsList: RepeatPatternMetrics[],
): RepeatPatternMetrics {
  if (metricsList.length === 0) {
    return {
      status: 'unavailable',
      reason: 'No repeat data is available for this view.',
      repeatedCount: 0,
      strongerConfidenceCount: 0,
      sourceCount: 0,
    };
  }

  const availableMetrics = metricsList.filter(
    (metrics): metrics is Extract<RepeatPatternMetrics, { status: 'available' }> => metrics.status === 'available',
  );
  const repeatedCount = metricsList.reduce((sum, metrics) => sum + metrics.repeatedCount, 0);
  const strongerConfidenceCount = metricsList.reduce((sum, metrics) => sum + metrics.strongerConfidenceCount, 0);
  const sourceCount = metricsList.reduce((sum, metrics) => sum + metrics.sourceCount, 0);

  if (availableMetrics.length === 0) {
    const firstReason = metricsList.find(
      (metrics): metrics is Extract<RepeatPatternMetrics, { status: 'unavailable' }> => metrics.status === 'unavailable',
    )?.reason;
    return {
      status: 'unavailable',
      reason: firstReason ?? 'No repeat data is available for this view.',
      repeatedCount,
      strongerConfidenceCount,
      sourceCount,
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

  availableMetrics.forEach((metrics) => {
    (['stable', 'softLean', 'torn', 'noisy'] as const).forEach((pattern) => {
      counts[pattern] += metrics.counts[pattern];
      conditionIds[pattern].push(...metrics.conditionIds[pattern]);
    });
  });

  return {
    status: 'available',
    counts,
    conditionIds,
    classifiedCount: availableMetrics.reduce((sum, metrics) => sum + metrics.classifiedCount, 0),
    repeatedCount,
    strongerConfidenceCount,
    sourceCount,
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
  analysisSearchParams,
  modelId,
  pattern,
  metrics,
  title,
  rowDim,
  colDim,
}: {
  runId: string;
  analysisBasePath: AnalysisBasePath;
  analysisSearchParams?: URLSearchParams | string;
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
        navigate(buildAnalysisTranscriptsPath(analysisBasePath, runId, params, analysisSearchParams));
      }}
    >
      {formatPercent(value)}
    </Button>
  );
}

function OverviewSummaryTable({
  runId,
  analysisBasePath = ANALYSIS_BASE_PATH,
  analysisSearchParams,
  semantics,
  varianceAnalysis,
  visualizationData,
  companionAnalysis,
  expectedAttributes = [],
  completedBatches,
  aggregateSourceRunCount,
  isAggregate,
  analysisMode,
  currentRun,
  currentAnalysis,
  companionRun,
}: {
  runId: string;
  analysisBasePath?: AnalysisBasePath;
  analysisSearchParams?: URLSearchParams | string;
  semantics: AnalysisSemanticsView;
  varianceAnalysis?: VarianceAnalysis | null;
  visualizationData: VisualizationData | null | undefined;
  companionAnalysis?: AnalysisResult | null;
  expectedAttributes?: string[];
  completedBatches: number | '-';
  aggregateSourceRunCount: number | null;
  isAggregate: boolean;
  analysisMode?: 'single' | 'paired';
  currentRun?: Run | null;
  currentAnalysis?: AnalysisResult | null;
  companionRun?: Run | null;
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
  const companionConditionRows = useMemo(
    () => buildConditionRows(companionAnalysis?.visualizationData?.scenarioDimensions, attributeA, attributeB),
    [attributeA, attributeB, companionAnalysis?.visualizationData?.scenarioDimensions],
  );
  const repeatPatternSources = useMemo<RepeatPatternSource[]>(() => {
    const sources: RepeatPatternSource[] = [{
      runId,
      varianceAnalysis,
      conditionRows,
    }];

    if (analysisMode === 'paired' && companionAnalysis) {
      sources.push({
        runId: companionAnalysis.runId,
        varianceAnalysis: companionAnalysis.varianceAnalysis,
        conditionRows: companionConditionRows,
      });
    }

    return sources;
  }, [analysisMode, companionAnalysis, companionConditionRows, conditionRows, runId, varianceAnalysis]);
  const isPooledAcrossRuns = repeatPatternSources.length > 1;
  const summaryUnavailableMessage = semantics.preference.rowAvailability.status === 'unavailable'
    ? semantics.preference.rowAvailability.message
    : semantics.reliability.rowAvailability.status === 'unavailable'
      ? semantics.reliability.rowAvailability.message
      : null;

  const helperText = analysisMode === 'paired' && companionAnalysis
    ? `Run-level evidence: pooled across ${repeatPatternSources.length} companion runs`
    : isAggregate
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
              const repeatMetrics = mergeRepeatPatternMetrics(
                repeatPatternSources.map((source) => getRepeatPatternMetrics(modelId, source.varianceAnalysis, source.conditionRows)),
              );
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
                      ? isPooledAcrossRuns
                        ? `${label}: ${repeatMetrics.counts[pattern]} of ${repeatMetrics.classifiedCount} repeated conditions across both vignette orders • transcript drilldown is not available from this pooled summary cell yet`
                        : `${label}: ${repeatMetrics.counts[pattern]} of ${repeatMetrics.classifiedCount} repeated conditions • ${repeatMetrics.strongerConfidenceCount} condition${repeatMetrics.strongerConfidenceCount === 1 ? '' : 's'} with 10+ repeats`
                      : repeatEvidenceDetail;

                    return (
                      <td key={pattern} className="border border-gray-200 px-3 py-2 text-center text-sm text-gray-700">
                        {repeatMetrics.status === 'available' && !isPooledAcrossRuns ? (
                          <PatternMetricButton
                            runId={runId}
                            analysisBasePath={analysisBasePath}
                            analysisSearchParams={analysisSearchParams}
                            modelId={modelId}
                            pattern={pattern}
                            metrics={repeatMetrics}
                            title={title}
                            rowDim={attributeA}
                            colDim={attributeB}
                          />
                        ) : (
                          <SummaryCell title={title} showInfoIcon={repeatMetrics.status === 'unavailable'} align="center">
                            {repeatMetrics.status === 'available'
                              ? formatPercent(repeatMetrics.classifiedCount === 0 ? 0 : repeatMetrics.counts[pattern] / repeatMetrics.classifiedCount)
                              : '—'}
                          </SummaryCell>
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

      {analysisMode === 'paired' && currentRun && currentAnalysis && (
        <div className="border-t border-gray-200 pt-4">
          <PairedRunComparisonCard
            currentRun={currentRun}
            currentAnalysis={currentAnalysis}
            companionRun={companionRun ?? null}
            companionAnalysis={companionAnalysis ?? null}
            analysisBasePath={analysisBasePath}
            analysisSearch={typeof analysisSearchParams === 'string' ? analysisSearchParams : analysisSearchParams?.toString() ?? ''}
            embedded
          />
        </div>
      )}
    </div>
  );
}

function ConditionDecisionsTable({
  runId,
  analysisBasePath = ANALYSIS_BASE_PATH,
  analysisSearchParams,
  companionRunId,
  orientationLabels,
  analysisMode,
  perModel,
  visualizationData,
  varianceAnalysis,
  expectedAttributes = [],
}: {
  runId: string;
  analysisBasePath?: AnalysisBasePath;
  analysisSearchParams?: URLSearchParams | string;
  companionRunId?: string | null;
  orientationLabels: ReturnType<typeof getPairedOrientationLabels>;
  analysisMode?: 'single' | 'paired';
  perModel: Record<string, PerModelStats>;
  visualizationData: VisualizationData | null | undefined;
  varianceAnalysis?: VarianceAnalysis | null;
  expectedAttributes?: string[];
}) {
  const meanTableRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const scenarioDimensions = visualizationData?.scenarioDimensions;
  const modelScenarioMatrix = visualizationData?.modelScenarioMatrix;
  const models = useMemo(() => {
    const modelIds = new Set<string>(Object.keys(perModel));
    Object.keys(modelScenarioMatrix ?? {}).forEach((modelId) => modelIds.add(modelId));
    return [...modelIds].sort();
  }, [modelScenarioMatrix, perModel]);

  const availableAttributes = useMemo(() => {
    return resolveScenarioAttributes(scenarioDimensions, expectedAttributes, modelScenarioMatrix);
  }, [scenarioDimensions, expectedAttributes, modelScenarioMatrix]);

  const attributeA = availableAttributes[0] ?? '';
  const attributeB = availableAttributes[1] ?? availableAttributes[0] ?? '';
  const [selectedModels, setSelectedModels] = useState<string[]>(models);
  const canSplitOrientations = analysisMode === 'paired' && (varianceAnalysis?.orientationCorrectedCount ?? 0) > 0;
  const [inspectionMode, setInspectionMode] = useState<OrientationInspectionMode>('pooled');
  const canonicalOrientationLabel = orientationLabels.canonical;
  const flippedOrientationLabel = orientationLabels.flipped;

  useEffect(() => {
    setSelectedModels((current) => {
      const next = current.filter((modelId) => models.includes(modelId));
      return next.length > 0 ? next : models;
    });
  }, [models]);

  useEffect(() => {
    if (!canSplitOrientations && inspectionMode !== 'pooled') {
      setInspectionMode('pooled');
    }
  }, [canSplitOrientations, inspectionMode]);

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

  const conditionRows = useMemo<OrientedConditionRow[]>(() => {
    return buildOrientedConditionRows(
      scenarioDimensions,
      attributeA,
      attributeB,
      varianceAnalysis,
      canSplitOrientations && inspectionMode === 'split' ? 'split' : 'pooled',
    );
  }, [attributeA, attributeB, canSplitOrientations, inspectionMode, scenarioDimensions, varianceAnalysis]);

  const getMeanDecision = (modelId: string, scenarioIds: string[]): ConditionStats | null => {
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
  };

  const handleCellClick = (modelId: string, row: OrientedConditionRow, options?: { decisionCode?: string }) => {
    const params = new URLSearchParams({
      rowDim: attributeA,
      colDim: attributeB,
      row: row.attributeALevel,
      col: row.attributeBLevel,
      model: modelId,
    });
    if (analysisMode === 'paired' && companionRunId) {
      params.set('companionRunId', companionRunId);
      params.set('pairView', canSplitOrientations && inspectionMode === 'split' ? 'condition-split' : 'condition-blended');
    }
    if (canSplitOrientations && inspectionMode === 'split') {
      params.set('orientationBucket', row.orientationBucket);
    }
    if (options?.decisionCode) {
      params.set('decisionCode', options.decisionCode);
    }
    navigate(buildAnalysisTranscriptsPath(analysisBasePath, runId, params, analysisSearchParams));
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
      <div className="flex flex-wrap items-end justify-between gap-4">
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
        {canSplitOrientations && (
          <div className="ml-auto">
            <label className="mb-1 block text-xs font-medium uppercase text-gray-500">Inspection View</label>
            <div className="inline-flex rounded-md border border-gray-300 bg-white p-1 shadow-sm">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`min-h-0 rounded px-3 py-1.5 text-sm ${inspectionMode === 'pooled' ? 'bg-teal-600 text-white hover:bg-teal-700' : 'text-gray-700 hover:bg-gray-50'}`}
                aria-pressed={inspectionMode === 'pooled'}
                onClick={() => setInspectionMode('pooled')}
              >
                Pooled
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`min-h-0 rounded px-3 py-1.5 text-sm ${inspectionMode === 'split' ? 'bg-teal-600 text-white hover:bg-teal-700' : 'text-gray-700 hover:bg-gray-50'}`}
                aria-pressed={inspectionMode === 'split'}
                onClick={() => setInspectionMode('split')}
              >
                Split by order
              </Button>
            </div>
          </div>
        )}
      </div>
      {canSplitOrientations && inspectionMode === 'split' && (
        <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-800">
          Split inspection keeps the pooled paired summary above, but breaks these tables into
          separate <span className="font-medium">{canonicalOrientationLabel}</span> and <span className="font-medium">{flippedOrientationLabel}</span> buckets so you can verify the pair directly.
        </div>
      )}

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
                    <div className="flex flex-wrap items-center gap-2">
                      <span>
                        {attributeA}: {row.attributeALevel}, {attributeB}: {row.attributeBLevel}
                      </span>
                      {canSplitOrientations && inspectionMode === 'split' && (
                        <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">
                          {getOrientationBucketLabel(row.orientationBucket, orientationLabels)}
                        </span>
                      )}
                    </div>
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
                          title={`View transcripts for ${modelId} | ${attributeA}: ${row.attributeALevel}, ${attributeB}: ${row.attributeBLevel}${canSplitOrientations && inspectionMode === 'split' ? ` | ${getOrientationBucketLabel(row.orientationBucket, orientationLabels)}` : ''}${isOtherCell ? ' | Decision: other' : ''}`}
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
  analysisSearchParams,
  definitionContent,
  perModel,
  visualizationData,
  varianceAnalysis,
  expectedAttributes = [],
  semantics,
  completedBatches,
  aggregateSourceRunCount,
  isAggregate,
  analysisMode,
  companionAnalysis,
  currentRun,
  currentAnalysis,
  companionRun,
}: OverviewTabProps) {
  const orientationLabels = useMemo(
    () => getPairedOrientationLabels(definitionContent),
    [definitionContent],
  );
  const currentOrder = useMemo(
    () => getRunPresentationOrder(currentRun),
    [currentRun],
  );
  const companionOrder = useMemo(
    () => getRunPresentationOrder(companionRun),
    [companionRun],
  );
  const canonicalAnalysis = useMemo(() => {
    if (analysisMode !== 'paired' || !companionAnalysis) {
      return currentAnalysis ?? null;
    }
    if (currentOrder === 'A_first') return currentAnalysis ?? null;
    if (companionOrder === 'A_first') return companionAnalysis;
    return currentAnalysis ?? null;
  }, [analysisMode, companionAnalysis, companionOrder, currentAnalysis, currentOrder]);
  const flippedAnalysis = useMemo(() => {
    if (analysisMode !== 'paired' || !companionAnalysis) {
      return null;
    }
    if (currentOrder === 'B_first') return currentAnalysis ?? null;
    if (companionOrder === 'B_first') return companionAnalysis;
    return companionAnalysis;
  }, [analysisMode, companionAnalysis, companionOrder, currentAnalysis, currentOrder]);
  const pooledConditionVisualization = useMemo(() => {
    if (analysisMode !== 'paired' || !companionAnalysis) {
      return visualizationData;
    }
    return mergePairedVisualizationData(canonicalAnalysis, flippedAnalysis);
  }, [analysisMode, canonicalAnalysis, companionAnalysis, flippedAnalysis, visualizationData]);
  const pooledConditionVariance = useMemo(() => {
    if (analysisMode !== 'paired' || !companionAnalysis) {
      return varianceAnalysis;
    }
    return mergePairedVarianceAnalysis(canonicalAnalysis, flippedAnalysis);
  }, [analysisMode, canonicalAnalysis, companionAnalysis, flippedAnalysis, varianceAnalysis]);

  return (
    <div className="space-y-6">
      <OverviewSummaryTable
        runId={runId}
        analysisBasePath={analysisBasePath}
        analysisSearchParams={analysisSearchParams}
        semantics={semantics}
        varianceAnalysis={varianceAnalysis}
        visualizationData={visualizationData}
        companionAnalysis={companionAnalysis}
        expectedAttributes={expectedAttributes}
        completedBatches={completedBatches}
        aggregateSourceRunCount={aggregateSourceRunCount}
        isAggregate={isAggregate}
        analysisMode={analysisMode}
        currentRun={currentRun}
        currentAnalysis={currentAnalysis}
        companionRun={companionRun}
      />
      <ConditionDecisionsTable
        runId={runId}
        analysisBasePath={analysisBasePath}
        analysisSearchParams={analysisSearchParams}
        companionRunId={analysisMode === 'paired' ? companionRun?.id ?? null : null}
        orientationLabels={orientationLabels}
        analysisMode={analysisMode}
        perModel={perModel}
        visualizationData={pooledConditionVisualization}
        varianceAnalysis={pooledConditionVariance}
        expectedAttributes={expectedAttributes}
      />
    </div>
  );
}

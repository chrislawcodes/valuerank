/**
 * Pure helper functions for the Overview Tab.
 */

import type { VisualizationData, VarianceAnalysis } from '../../../api/operations/analysis';
import type { AnalysisSemanticsView, PreferenceViewModel, ReliabilityViewModel } from '../../analysis-v2/analysisSemantics';
import type {
  ConditionRow,
  ConditionRepeatStats,
  RepeatPattern,
  RepeatPatternMetrics,
} from './OverviewTabTypes';

export function buildConditionRows(
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

export function formatPercent(value: number): string {
  const percentage = value * 100;
  const roundedToTenth = Math.round(percentage * 10) / 10;

  if (Number.isInteger(roundedToTenth)) {
    return `${roundedToTenth.toFixed(0)}%`;
  }

  return `${roundedToTenth.toFixed(1)}%`;
}

export function getPreferredValueName(model: PreferenceViewModel): string | null {
  return model.topPrioritizedValues[0]?.name
    ?? model.neutralValues[0]?.name
    ?? model.topDeprioritizedValues[0]?.name
    ?? null;
}

export function getPreferenceUnavailableReason(model: PreferenceViewModel): string {
  return model.availability.status === 'unavailable'
    ? model.availability.message
    : 'Preference summary is unavailable for this model.';
}

export function getMetricUnavailableReason(model: ReliabilityViewModel): string {
  return model.availability.status === 'unavailable'
    ? model.availability.message
    : 'This metric is unavailable for this model.';
}

export function getOverviewUnavailableMessage(
  semantics: AnalysisSemanticsView,
): string | null {
  if (semantics.preference.rowAvailability.status === 'unavailable') {
    return semantics.preference.rowAvailability.message;
  }

  if (semantics.reliability.rowAvailability.status !== 'unavailable') {
    return null;
  }

  if (semantics.reliability.rowAvailability.reason === 'no-repeat-coverage') {
    return null;
  }

  return semantics.reliability.rowAvailability.message;
}

export function classifyRepeatPattern(
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

export function getConditionRepeatStats(
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

export function getRepeatPatternMetrics(
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

export function mergeRepeatPatternMetrics(
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

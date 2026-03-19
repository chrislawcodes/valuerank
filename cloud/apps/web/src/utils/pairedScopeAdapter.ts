import type { AnalysisResult, VarianceAnalysis, VisualizationData } from '../api/operations/analysis';
import type { PairedOrientationLabels } from './methodology';

export type PairedScopeContext = {
  orientationCorrectedCount: number;
  hasOrientationPairing: boolean;
};

export type OrientationBucket = 'canonical' | 'flipped';

export type OrientationInspectionMode = 'pooled' | 'split';

export type OrientedConditionRow = {
  id: string;
  attributeALevel: string;
  attributeBLevel: string;
  scenarioIds: string[];
  orientationBucket: OrientationBucket;
};

type PairedAnalysisEntry = {
  prefix: OrientationBucket;
  analysis: AnalysisResult | null | undefined;
  orientationCorrected: boolean;
};

function prefixScenarioId(prefix: OrientationBucket, scenarioId: string): string {
  return `${prefix}:${scenarioId}`;
}

function mergeVarianceScenarioList(
  entries: PairedAnalysisEntry[],
  key: 'mostVariableScenarios' | 'leastVariableScenarios',
): VarianceAnalysis['mostVariableScenarios'] {
  return entries.flatMap(({ prefix, analysis, orientationCorrected }) => (
    (analysis?.varianceAnalysis?.[key] ?? []).map((scenario) => ({
      ...scenario,
      scenarioId: prefixScenarioId(prefix, scenario.scenarioId),
      orientationCorrected,
    }))
  ));
}

/**
 * Build paired-vignette scope context from analysis mode and variance analysis.
 *
 * In single mode the context is inert. In paired mode, if orientation correction
 * was applied during analysis (orientationCorrectedCount > 0), the context flags
 * `hasOrientationPairing` so consumers can surface orientation-specific UI.
 */
export function buildPairedScopeContext(
  analysisMode: 'single' | 'paired' | undefined,
  varianceAnalysis: VarianceAnalysis | null | undefined,
): PairedScopeContext {
  const orientationCorrectedCount = varianceAnalysis?.orientationCorrectedCount ?? 0;
  const hasOrientationPairing = analysisMode === 'paired' && orientationCorrectedCount > 0;
  return { orientationCorrectedCount, hasOrientationPairing };
}

export function getOrientationCorrectedScenarioIds(
  varianceAnalysis: VarianceAnalysis | null | undefined,
): Set<string> {
  const correctedScenarioIds = new Set<string>();

  if (!varianceAnalysis) {
    return correctedScenarioIds;
  }

  Object.values(varianceAnalysis.perModel ?? {}).forEach((modelStats) => {
    Object.entries(modelStats.perScenario ?? {}).forEach(([scenarioId, stats]) => {
      if (stats.orientationCorrected === true) {
        correctedScenarioIds.add(scenarioId);
      }
    });
  });

  return correctedScenarioIds;
}

export function getScenarioOrientationBucket(
  scenarioId: string,
  varianceAnalysis: VarianceAnalysis | null | undefined,
): OrientationBucket {
  return getOrientationCorrectedScenarioIds(varianceAnalysis).has(scenarioId)
    ? 'flipped'
    : 'canonical';
}

export function getOrientationBucketLabel(
  bucket: OrientationBucket,
  labels?: Pick<PairedOrientationLabels, 'canonical' | 'flipped'> | null,
): string {
  if (labels) {
    return bucket === 'canonical' ? labels.canonical : labels.flipped;
  }
  return bucket === 'canonical' ? 'Canonical order' : 'Flipped order';
}

export function buildOrientedConditionRows(
  scenarioDimensions: VisualizationData['scenarioDimensions'] | null | undefined,
  attributeA: string,
  attributeB: string,
  varianceAnalysis: VarianceAnalysis | null | undefined,
  inspectionMode: OrientationInspectionMode,
): OrientedConditionRow[] {
  if (!scenarioDimensions || !attributeA || !attributeB) {
    return [];
  }

  const correctedScenarioIds = getOrientationCorrectedScenarioIds(varianceAnalysis);
  const grouped = new Map<string, OrientedConditionRow>();

  Object.entries(scenarioDimensions).forEach(([scenarioId, dimensions]) => {
    const attributeALevel = String(dimensions[attributeA] ?? 'N/A');
    const attributeBLevel = String(dimensions[attributeB] ?? 'N/A');
    const orientationBucket = correctedScenarioIds.has(scenarioId) ? 'flipped' : 'canonical';
    const id = inspectionMode === 'split'
      ? `${attributeALevel}||${attributeBLevel}||${orientationBucket}`
      : `${attributeALevel}||${attributeBLevel}`;
    const current = grouped.get(id);

    if (current) {
      current.scenarioIds.push(scenarioId);
      return;
    }

    grouped.set(id, {
      id,
      attributeALevel,
      attributeBLevel,
      scenarioIds: [scenarioId],
      orientationBucket,
    });
  });

  return [...grouped.values()].sort((left, right) => {
    if (left.attributeALevel === right.attributeALevel) {
      if (left.attributeBLevel === right.attributeBLevel) {
        return left.orientationBucket.localeCompare(right.orientationBucket);
      }
      return left.attributeBLevel.localeCompare(right.attributeBLevel);
    }
    return left.attributeALevel.localeCompare(right.attributeALevel);
  });
}

export function mergeDecisionDistributions(
  ...distributions: Array<VisualizationData['decisionDistribution'] | null | undefined>
): VisualizationData['decisionDistribution'] {
  const merged: VisualizationData['decisionDistribution'] = {};

  distributions.forEach((distribution) => {
    Object.entries(distribution ?? {}).forEach(([modelId, counts]) => {
      const currentCounts = merged[modelId] ?? {};
      Object.entries(counts ?? {}).forEach(([decisionCode, count]) => {
        currentCounts[decisionCode] = (currentCounts[decisionCode] ?? 0) + count;
      });
      merged[modelId] = currentCounts;
    });
  });

  return merged;
}

export function mergePairedVisualizationData(
  canonicalAnalysis: AnalysisResult | null | undefined,
  flippedAnalysis: AnalysisResult | null | undefined,
): VisualizationData | null {
  const entries: PairedAnalysisEntry[] = [
    { prefix: 'canonical' as const, analysis: canonicalAnalysis, orientationCorrected: false },
    { prefix: 'flipped' as const, analysis: flippedAnalysis, orientationCorrected: true },
  ].filter((entry) => entry.analysis?.visualizationData != null);

  if (entries.length === 0) {
    return null;
  }

  const scenarioDimensions: Record<string, Record<string, string | number>> = {};
  const modelScenarioMatrix: Record<string, Record<string, number>> = {};

  entries.forEach(({ prefix, analysis }) => {
    Object.entries(analysis?.visualizationData?.scenarioDimensions ?? {}).forEach(([scenarioId, dimensions]) => {
      scenarioDimensions[prefixScenarioId(prefix, scenarioId)] = dimensions;
    });

    Object.entries(analysis?.visualizationData?.modelScenarioMatrix ?? {}).forEach(([modelId, scores]) => {
      const currentScores = modelScenarioMatrix[modelId] ?? {};
      Object.entries(scores ?? {}).forEach(([scenarioId, score]) => {
        currentScores[prefixScenarioId(prefix, scenarioId)] = score;
      });
      modelScenarioMatrix[modelId] = currentScores;
    });
  });

  return {
    decisionDistribution: mergeDecisionDistributions(
      canonicalAnalysis?.visualizationData?.decisionDistribution,
      flippedAnalysis?.visualizationData?.decisionDistribution,
    ),
    scenarioDimensions,
    modelScenarioMatrix,
  };
}

export function mergePairedVarianceAnalysis(
  canonicalAnalysis: AnalysisResult | null | undefined,
  flippedAnalysis: AnalysisResult | null | undefined,
): VarianceAnalysis | null {
  const entries: PairedAnalysisEntry[] = [
    { prefix: 'canonical' as const, analysis: canonicalAnalysis, orientationCorrected: false },
    { prefix: 'flipped' as const, analysis: flippedAnalysis, orientationCorrected: true },
  ].filter((entry) => entry.analysis?.varianceAnalysis != null);

  if (entries.length === 0) {
    return null;
  }

  const modelIds = new Set<string>();
  entries.forEach(({ analysis }) => {
    Object.keys(analysis?.varianceAnalysis?.perModel ?? {}).forEach((modelId) => modelIds.add(modelId));
  });

  const perModel = [...modelIds].reduce<VarianceAnalysis['perModel']>((acc, modelId) => {
    const perScenario: NonNullable<VarianceAnalysis['perModel'][string]>['perScenario'] = {};
    let totalSamples = 0;
    let uniqueScenarios = 0;
    let samplesPerScenario = 1;
    let weightedVarianceSum = 0;
    let weightedConsistencySum = 0;
    let weight = 0;
    let maxWithinScenarioVariance = 0;

    entries.forEach(({ prefix, analysis, orientationCorrected }) => {
      const modelStats = analysis?.varianceAnalysis?.perModel?.[modelId];
      if (!modelStats) {
        return;
      }

      totalSamples += modelStats.totalSamples;
      uniqueScenarios += modelStats.uniqueScenarios;
      samplesPerScenario = Math.max(samplesPerScenario, modelStats.samplesPerScenario);
      weightedVarianceSum += modelStats.avgWithinScenarioVariance * Math.max(modelStats.uniqueScenarios, 1);
      weightedConsistencySum += modelStats.consistencyScore * Math.max(modelStats.uniqueScenarios, 1);
      weight += Math.max(modelStats.uniqueScenarios, 1);
      maxWithinScenarioVariance = Math.max(maxWithinScenarioVariance, modelStats.maxWithinScenarioVariance);

      Object.entries(modelStats.perScenario ?? {}).forEach(([scenarioId, stats]) => {
        perScenario[prefixScenarioId(prefix, scenarioId)] = {
          ...stats,
          orientationCorrected,
        };
      });
    });

    acc[modelId] = {
      totalSamples,
      uniqueScenarios,
      samplesPerScenario,
      avgWithinScenarioVariance: weight > 0 ? weightedVarianceSum / weight : 0,
      maxWithinScenarioVariance,
      consistencyScore: weight > 0 ? weightedConsistencySum / weight : 0,
      perScenario,
    };

    return acc;
  }, {});

  return {
    isMultiSample: entries.some(({ analysis }) => analysis?.varianceAnalysis?.isMultiSample === true),
    samplesPerScenario: Math.max(
      ...entries.map(({ analysis }) => analysis?.varianceAnalysis?.samplesPerScenario ?? 1),
    ),
    perModel,
    mostVariableScenarios: mergeVarianceScenarioList(entries, 'mostVariableScenarios'),
    leastVariableScenarios: mergeVarianceScenarioList(entries, 'leastVariableScenarios'),
    orientationCorrectedCount: Object.values(perModel).reduce(
      (sum, modelStats) => (
        sum + Object.values(modelStats.perScenario).filter((stats) => stats.orientationCorrected === true).length
      ),
      0,
    ),
  };
}

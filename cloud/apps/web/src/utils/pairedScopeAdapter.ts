import type { VarianceAnalysis, VisualizationData } from '../api/operations/analysis';
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

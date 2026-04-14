import type { RunExportData } from '../../services/export/xlsx/types.js';

/**
 * Parse analysis output JSON into typed structure for Excel export.
 * Transforms the database analysis format to the export format.
 * Returns undefined if parsing fails.
 */
export function parseAnalysisOutput(output: unknown): RunExportData['analysisResult'] | undefined {
  if (output === null || output === undefined || typeof output !== 'object') {
    return undefined;
  }

  const parsed = output as Record<string, unknown>;

  type AnalysisResult = NonNullable<RunExportData['analysisResult']>;

  // Transform modelAgreement from pairwise format to matrix format
  let modelAgreement: AnalysisResult['modelAgreement'];
  const rawModelAgreement = parsed.modelAgreement as {
    pairwise?: Record<string, { spearmanRho?: number }>;
  } | undefined;

  if (rawModelAgreement?.pairwise) {
    // Extract unique model names from pairwise keys (format: "model1:model2")
    const modelSet = new Set<string>();
    for (const key of Object.keys(rawModelAgreement.pairwise)) {
      const [model1, model2] = key.split(':');
      if (typeof model1 === 'string' && model1 !== '') modelSet.add(model1);
      if (typeof model2 === 'string' && model2 !== '') modelSet.add(model2);
    }
    const models = Array.from(modelSet).sort();

    // Build correlation matrix
    const correlationMatrix: number[][] = models.map((m1, i) =>
      models.map((m2, j) => {
        if (i === j) return 1; // Self-correlation is 1
        // Try both orderings of the model pair
        const key1 = `${m1}:${m2}`;
        const key2 = `${m2}:${m1}`;
        const pairData = rawModelAgreement.pairwise?.[key1] ?? rawModelAgreement.pairwise?.[key2];
        return pairData?.spearmanRho ?? 0;
      })
    );

    if (models.length >= 2) {
      modelAgreement = { models, correlationMatrix };
    }
  }

  // Transform mostContestedScenarios to contestedScenarios format
  let contestedScenarios: AnalysisResult['contestedScenarios'];
  const rawContested = parsed.mostContestedScenarios as Array<{
    scenarioId?: string;
    scenarioName?: string;
    variance?: number;
    modelScores?: Record<string, number>;
  }> | undefined;

  if (rawContested != null && Array.isArray(rawContested) && rawContested.length > 0) {
    contestedScenarios = rawContested.map((s) => ({
      scenarioId: s.scenarioId ?? '',
      scenarioName: s.scenarioName ?? '',
      variance: s.variance ?? 0,
      modelResponses: s.modelScores ?? {},
    }));
  }

  // Transform dimensionAnalysis to dimensionImpact format
  let dimensionImpact: AnalysisResult['dimensionImpact'];
  const rawDimensions = parsed.dimensionAnalysis as {
    dimensions?: Record<string, { effectSize?: number; pValue?: number }>;
  } | undefined;

  if (rawDimensions?.dimensions != null) {
    dimensionImpact = Object.entries(rawDimensions.dimensions).map(([name, data]) => ({
      dimensionName: name,
      effectSize: data.effectSize ?? 0,
      pValue: data.pValue ?? 1,
    }));
  }

  return {
    modelAgreement,
    contestedScenarios,
    dimensionImpact,
  };
}

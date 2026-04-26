import { describe, expect, it } from 'vitest';
import { aggregateAnalysesLogic } from '../../../src/services/analysis/aggregate/aggregate-logic.js';
import type { AnalysisOutput } from '../../../src/services/analysis/aggregate/contracts.js';

function buildAnalysis(modelId: string, valueStats: Record<string, { prioritized: number; deprioritized: number; neutral: number; winRate: number | null }>): AnalysisOutput {
  return {
    perModel: {
      [modelId]: {
        sampleSize: 1,
        values: Object.fromEntries(
          Object.entries(valueStats).map(([valueId, stats]) => [
            valueId,
            { count: { prioritized: stats.prioritized, deprioritized: stats.deprioritized, neutral: stats.neutral }, winRate: stats.winRate },
          ]),
        ),
        overall: { mean: 0.5, stdDev: 0, min: 0.5, max: 0.5 },
      },
    },
    modelAgreement: {},
    visualizationData: {
      decisionDistribution: {},
      modelScenarioMatrix: {},
      scenarioDimensions: {},
    },
    mostContestedScenarios: [],
  };
}

describe('aggregateAnalysesLogic — winRate no-data handling', () => {
  it('produces null winRate when a value has zero responses across all analyses', () => {
    const analysis = buildAnalysis('model-a', {
      Achievement: { prioritized: 0, deprioritized: 0, neutral: 0, winRate: null },
    });

    const result = aggregateAnalysesLogic([analysis], [], []);
    const values = result.perModel['model-a']?.values ?? {};
    expect(values['Achievement']?.winRate).toBeNull();
  });

  it('computes correct winRate when responses exist', () => {
    const analysis = buildAnalysis('model-a', {
      Achievement: { prioritized: 3, deprioritized: 1, neutral: 1, winRate: 0.6 },
    });

    const result = aggregateAnalysesLogic([analysis], [], []);
    const values = result.perModel['model-a']?.values ?? {};
    expect(values['Achievement']?.winRate).toBeCloseTo(3 / 5);
  });

  it('excludes null winRate values from the valueAggregateStats mean', () => {
    const analysis1 = buildAnalysis('model-a', {
      Achievement: { prioritized: 4, deprioritized: 1, neutral: 0, winRate: 0.8 },
    });
    const analysis2 = buildAnalysis('model-a', {
      Achievement: { prioritized: 0, deprioritized: 0, neutral: 0, winRate: null },
    });

    const result = aggregateAnalysesLogic([analysis1, analysis2], [], []);
    const valueStats = result.valueAggregateStats['model-a']?.values['Achievement'];
    expect(valueStats?.winRateMean).toBeCloseTo(0.8);
  });
});

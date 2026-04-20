import { describe, expect, it } from 'vitest';
import {
  zModelReliabilitySummary,
  zRunVarianceAnalysis,
} from '../../../../src/services/analysis/aggregate/contracts.js';

describe('aggregate analysis contracts', () => {
  it.each([
    [
      'accepts both perScenario and perPair',
      {
        baselineNoise: 0.5,
        baselineReliability: 0.8,
        directionalAgreement: 0.75,
        neutralShare: 0.1,
        coverageCount: 2,
        uniqueScenarios: 3,
        perScenario: {
          scenarioA: { matches: 3, trials: 6 },
        },
        perPair: {
          ValueA: {
            targetAnalysisRunId: 'run-1',
            targetCompanionRunId: 'run-2',
            primaryConditionIds: ['scenarioA'],
            companionConditionIds: ['scenarioA'],
            perCondition: [
              {
                scenarioId: 'scenarioA',
                netPressureRank: 1,
                winRate: 0.75,
                matches: 3,
                trials: 4,
              },
            ],
          },
        },
      },
    ],
    [
      'accepts perScenario only',
      {
        baselineNoise: 0.5,
        coverageCount: 1,
        uniqueScenarios: 1,
        perScenario: {
          scenarioA: { matches: 1, trials: 1 },
        },
      },
    ],
    [
      'accepts perPair only',
      {
        baselineNoise: 0.5,
        coverageCount: 1,
        uniqueScenarios: 1,
        perPair: {
          ValueA: {
            targetAnalysisRunId: 'run-1',
            targetCompanionRunId: null,
            primaryConditionIds: [],
            companionConditionIds: [],
            perCondition: [],
          },
        },
      },
    ],
    [
      'accepts historical rows without either field',
      {
        baselineNoise: 0.5,
        baselineReliability: 0.8,
        directionalAgreement: 0.75,
        neutralShare: 0.1,
        coverageCount: 2,
        uniqueScenarios: 3,
      },
    ],
  ])('%s', (_label, summary) => {
    expect(zModelReliabilitySummary.safeParse(summary).success).toBe(true);
  });

  it('continues to accept a minimal variance analysis payload', () => {
    expect(
      zRunVarianceAnalysis.safeParse({
        isMultiSample: true,
        samplesPerScenario: 2,
        perModel: {},
      }).success,
    ).toBe(true);
  });
});

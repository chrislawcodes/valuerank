import { describe, expect, it } from 'vitest';
import { normalizeAnalysisArtifacts } from '../../../src/services/analysis/normalize-analysis-output.js';

describe('normalizeAnalysisArtifacts', () => {
  const scenarios = [
    {
      id: 'scenario-1',
      name: 'Scenario One',
      content: {
        dimensions: {
          Achievement: 1,
          Hedonism: 2,
        },
      },
    },
    {
      id: 'scenario-2',
      name: 'Scenario Two',
      content: {
        dimensions: {
          Achievement: 2,
          Hedonism: 1,
        },
      },
    },
  ];

  it('maps legacy scenario-name keys to scenario IDs in matrix and variance structures', () => {
    const result = normalizeAnalysisArtifacts({
      visualizationData: {
        decisionDistribution: {
          'gemini-2.5-pro': { '1': 1, '2': 0, '3': 0, '4': 0, '5': 0 },
        },
        modelScenarioMatrix: {
          'gemini-2.5-pro': {
            'Scenario One': 3.5,
          },
        },
      },
      varianceAnalysis: {
        isMultiSample: true,
        samplesPerScenario: 3,
        perModel: {
          'gemini-2.5-pro': {
            perScenario: {
              'Scenario One': {
                sampleCount: 3,
                mean: 3.5,
                stdDev: 0.5,
                variance: 0.25,
                min: 3,
                max: 4,
                range: 1,
              },
            },
          },
        },
        mostVariableScenarios: [
          { scenarioId: 'Scenario One', scenarioName: 'Scenario One', variance: 0.25 },
        ],
        leastVariableScenarios: [
          { scenarioId: 'Scenario One', scenarioName: 'Scenario One', variance: 0.25 },
        ],
      },
      scenarios,
    });

    const matrix = result.visualizationData?.modelScenarioMatrix as Record<string, Record<string, number>>;
    expect(matrix['gemini-2.5-pro']).toEqual({ 'scenario-1': 3.5 });

    const dims = result.visualizationData?.scenarioDimensions as Record<string, Record<string, string | number>>;
    expect(Object.keys(dims).sort()).toEqual(['scenario-1', 'scenario-2']);

    const variance = result.varianceAnalysis as {
      perModel: Record<string, { perScenario: Record<string, unknown> }>;
      mostVariableScenarios: Array<{ scenarioId: string; scenarioName: string }>;
      leastVariableScenarios: Array<{ scenarioId: string; scenarioName: string }>;
    };
    expect(Object.keys(variance.perModel['gemini-2.5-pro'].perScenario)).toEqual(['scenario-1']);
    expect(variance.mostVariableScenarios[0]).toMatchObject({
      scenarioId: 'scenario-1',
      scenarioName: 'Scenario One',
    });
    expect(variance.leastVariableScenarios[0]).toMatchObject({
      scenarioId: 'scenario-1',
      scenarioName: 'Scenario One',
    });
  });

  it('preserves canonical ID keyed data', () => {
    const result = normalizeAnalysisArtifacts({
      visualizationData: {
        modelScenarioMatrix: {
          'gemini-2.5-pro': {
            'scenario-1': 4,
          },
        },
        scenarioDimensions: {
          'scenario-1': { Achievement: 1, Hedonism: 2 },
        },
      },
      varianceAnalysis: {
        perModel: {
          'gemini-2.5-pro': {
            perScenario: {
              'scenario-1': { sampleCount: 2 },
            },
          },
        },
      },
      scenarios,
    });

    const matrix = result.visualizationData?.modelScenarioMatrix as Record<string, Record<string, number>>;
    expect(matrix['gemini-2.5-pro']).toEqual({ 'scenario-1': 4 });

    const variance = result.varianceAnalysis as {
      perModel: Record<string, { perScenario: Record<string, unknown> }>;
    };
    expect(Object.keys(variance.perModel['gemini-2.5-pro'].perScenario)).toEqual(['scenario-1']);
  });
});


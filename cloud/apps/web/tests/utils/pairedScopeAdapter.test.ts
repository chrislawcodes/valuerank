import { describe, expect, it } from 'vitest';
import type { AnalysisResult } from '../../src/api/operations/analysis';
import {
  mergeDecisionDistributions,
  mergePairedVarianceAnalysis,
  mergePairedVisualizationData,
} from '../../src/utils/pairedScopeAdapter';

function createAnalysisResult(overrides: Partial<AnalysisResult>): AnalysisResult {
  return {
    id: 'analysis-1',
    runId: 'run-1',
    analysisType: 'basic',
    status: 'CURRENT',
    codeVersion: '1.1.1',
    inputHash: 'hash',
    createdAt: '2026-03-10T10:00:00Z',
    computedAt: '2026-03-10T10:01:00Z',
    durationMs: 1000,
    perModel: {},
    preferenceSummary: null,
    reliabilitySummary: null,
    aggregateMetadata: null,
    modelAgreement: {
      pairwise: {},
      outlierModels: [],
      overallAgreement: 0,
    },
    dimensionAnalysis: null,
    visualizationData: null,
    varianceAnalysis: null,
    mostContestedScenarios: [],
    methodsUsed: {
      winRateCI: 'wilson',
      modelComparison: 'spearman',
      pValueCorrection: 'holm',
      effectSize: 'cohens_d',
      dimensionTest: 'kruskal',
      alpha: 0.05,
      codeVersion: '1.1.1',
    },
    warnings: [],
    ...overrides,
  };
}

describe('pairedScopeAdapter', () => {
  it('merges decision distributions by summing matching model buckets', () => {
    expect(
      mergeDecisionDistributions(
        {
          model1: { '1': 2, '3': 1 },
          model2: { '5': 4 },
        },
        {
          model1: { '1': 3, '2': 5 },
          model3: { '4': 6 },
        },
      ),
    ).toEqual({
      model1: { '1': 5, '2': 5, '3': 1 },
      model2: { '5': 4 },
      model3: { '4': 6 },
    });
  });

  it('pools paired visualization data while keeping order-specific scenario ids distinct', () => {
    const canonicalAnalysis = createAnalysisResult({
      visualizationData: {
        decisionDistribution: {
          model1: { '1': 2, '5': 1 },
        },
        scenarioDimensions: {
          s1: { Freedom: 'high', Harmony: 'low' },
        },
        modelScenarioMatrix: {
          model1: { s1: 5 },
        },
      },
    });
    const flippedAnalysis = createAnalysisResult({
      runId: 'run-2',
      visualizationData: {
        decisionDistribution: {
          model1: { '1': 1, '3': 4 },
          model2: { '2': 3 },
        },
        scenarioDimensions: {
          s2: { Freedom: 'high', Harmony: 'low' },
        },
        modelScenarioMatrix: {
          model1: { s2: 1 },
          model2: { s2: 2 },
        },
      },
    });

    expect(mergePairedVisualizationData(canonicalAnalysis, flippedAnalysis)).toEqual({
      decisionDistribution: {
        model1: { '1': 3, '3': 4, '5': 1 },
        model2: { '2': 3 },
      },
      scenarioDimensions: {
        'canonical:s1': { Freedom: 'high', Harmony: 'low' },
        'flipped:s2': { Freedom: 'high', Harmony: 'low' },
      },
      modelScenarioMatrix: {
        model1: { 'canonical:s1': 5, 'flipped:s2': 1 },
        model2: { 'flipped:s2': 2 },
      },
    });
  });

  it('merges paired variance analysis with weighted per-model metrics and prefixed scenario ids', () => {
    const canonicalAnalysis = createAnalysisResult({
      varianceAnalysis: {
        isMultiSample: true,
        samplesPerScenario: 2,
        orientationCorrectedCount: 0,
        perModel: {
          model1: {
            totalSamples: 4,
            uniqueScenarios: 2,
            samplesPerScenario: 2,
            avgWithinScenarioVariance: 0.2,
            maxWithinScenarioVariance: 0.3,
            consistencyScore: 0.8,
            perScenario: {
              s1: {
                sampleCount: 2,
                mean: 4,
                stdDev: 0.2,
                variance: 0.04,
                min: 4,
                max: 4,
                range: 0,
              },
            },
          },
        },
        mostVariableScenarios: [{
          scenarioId: 's1',
          scenarioName: 'Canonical high variance',
          mean: 4,
          stdDev: 0.2,
          variance: 0.04,
          range: 0,
          sampleCount: 2,
        }],
        leastVariableScenarios: [],
      },
    });

    const flippedAnalysis = createAnalysisResult({
      runId: 'run-2',
      varianceAnalysis: {
        isMultiSample: true,
        samplesPerScenario: 3,
        orientationCorrectedCount: 1,
        perModel: {
          model1: {
            totalSamples: 3,
            uniqueScenarios: 1,
            samplesPerScenario: 3,
            avgWithinScenarioVariance: 0.6,
            maxWithinScenarioVariance: 0.8,
            consistencyScore: 0.5,
            perScenario: {
              s2: {
                sampleCount: 3,
                mean: 2,
                stdDev: 0.4,
                variance: 0.16,
                min: 1,
                max: 3,
                range: 2,
              },
            },
          },
          model2: {
            totalSamples: 3,
            uniqueScenarios: 1,
            samplesPerScenario: 3,
            avgWithinScenarioVariance: 0.1,
            maxWithinScenarioVariance: 0.1,
            consistencyScore: 0.9,
            perScenario: {
              s3: {
                sampleCount: 3,
                mean: 5,
                stdDev: 0.1,
                variance: 0.01,
                min: 5,
                max: 5,
                range: 0,
              },
            },
          },
        },
        mostVariableScenarios: [{
          scenarioId: 's2',
          scenarioName: 'Flipped high variance',
          mean: 2,
          stdDev: 0.4,
          variance: 0.16,
          range: 2,
          sampleCount: 3,
        }],
        leastVariableScenarios: [{
          scenarioId: 's3',
          scenarioName: 'Flipped low variance',
          mean: 5,
          stdDev: 0.1,
          variance: 0.01,
          range: 0,
          sampleCount: 3,
        }],
      },
    });

    expect(mergePairedVarianceAnalysis(canonicalAnalysis, flippedAnalysis)).toEqual({
      isMultiSample: true,
      samplesPerScenario: 3,
      perModel: {
        model1: {
          totalSamples: 7,
          uniqueScenarios: 3,
          samplesPerScenario: 3,
          avgWithinScenarioVariance: (0.2 * 2 + 0.6 * 1) / 3,
          maxWithinScenarioVariance: 0.8,
          consistencyScore: (0.8 * 2 + 0.5 * 1) / 3,
          perScenario: {
            'canonical:s1': {
              sampleCount: 2,
              mean: 4,
              stdDev: 0.2,
              variance: 0.04,
              min: 4,
              max: 4,
              range: 0,
              orientationCorrected: false,
            },
            'flipped:s2': {
              sampleCount: 3,
              mean: 2,
              stdDev: 0.4,
              variance: 0.16,
              min: 1,
              max: 3,
              range: 2,
              orientationCorrected: true,
            },
          },
        },
        model2: {
          totalSamples: 3,
          uniqueScenarios: 1,
          samplesPerScenario: 3,
          avgWithinScenarioVariance: 0.1,
          maxWithinScenarioVariance: 0.1,
          consistencyScore: 0.9,
          perScenario: {
            'flipped:s3': {
              sampleCount: 3,
              mean: 5,
              stdDev: 0.1,
              variance: 0.01,
              min: 5,
              max: 5,
              range: 0,
              orientationCorrected: true,
            },
          },
        },
      },
      mostVariableScenarios: [
        {
          scenarioId: 'canonical:s1',
          scenarioName: 'Canonical high variance',
          mean: 4,
          stdDev: 0.2,
          variance: 0.04,
          range: 0,
          sampleCount: 2,
          orientationCorrected: false,
        },
        {
          scenarioId: 'flipped:s2',
          scenarioName: 'Flipped high variance',
          mean: 2,
          stdDev: 0.4,
          variance: 0.16,
          range: 2,
          sampleCount: 3,
          orientationCorrected: true,
        },
      ],
      leastVariableScenarios: [
        {
          scenarioId: 'flipped:s3',
          scenarioName: 'Flipped low variance',
          mean: 5,
          stdDev: 0.1,
          variance: 0.01,
          range: 0,
          sampleCount: 3,
          orientationCorrected: true,
        },
      ],
      orientationCorrectedCount: 2,
    });
  });
});

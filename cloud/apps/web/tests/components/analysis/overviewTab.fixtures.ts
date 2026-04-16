import { vi } from 'vitest';
import type { AnalysisResult, VarianceAnalysis } from '../../../src/api/operations/analysis';
import type { AnalysisSemanticsView } from '../../../src/components/analysis-v2/analysisSemantics';

export const mockNavigate = vi.fn();

export function createSemantics(): AnalysisSemanticsView {
  return {
    preference: {
      rowAvailability: { status: 'available' },
      byModel: {
        model1: {
          modelId: 'model1',
          overallLean: 'A',
          topPrioritizedValues: [{ name: 'Fairness', winRate: 1 }],
          topDeprioritizedValues: [{ name: 'Loyalty', winRate: 0 }],
          neutralValues: [],
          availability: { status: 'available' },
        },
      },
    },
    reliability: {
      rowAvailability: { status: 'available' },
      byModel: {
        model1: {
          modelId: 'model1',
          baselineReliability: 0.92,
          baselineNoise: 0.18,
          directionalAgreement: 0.88,
          neutralShare: 0.1,
          coverageCount: 3,
          uniqueScenarios: 3,
          repeatCoverageShare: null,
          contributingRunCount: null,
          weightedOverallSignedCenterSd: null,
          hasLowCoverageWarning: false,
          hasHighDriftWarning: false,
          availability: { status: 'available' },
        },
      },
      hasAnyAvailableModel: true,
      hasMixedAvailability: false,
      aggregateWarnings: {
        isEligibleAggregate: false,
        lowCoverageModels: [],
        highDriftModels: [],
      },
    },
  };
}

export function createVarianceAnalysis(): VarianceAnalysis {
  return {
    isMultiSample: true,
    samplesPerScenario: 12,
    orientationCorrectedCount: 1,
    perModel: {
      model1: {
        totalSamples: 60,
        uniqueScenarios: 5,
        samplesPerScenario: 12,
        avgWithinScenarioVariance: 0.2,
        maxWithinScenarioVariance: 0.3,
        consistencyScore: 0.85,
        perScenario: {
          s1: {
            sampleCount: 12,
            mean: 4.6,
            stdDev: 0.1,
            variance: 0.01,
            min: 4,
            max: 5,
            range: 1,
            directionalAgreement: 0.9,
            medianSignedDistance: 1.1,
            neutralShare: 0,
          },
          s2: {
            sampleCount: 12,
            mean: 3.2,
            stdDev: 0.4,
            variance: 0.16,
            min: 3,
            max: 4,
            range: 1,
            directionalAgreement: 0.6,
            medianSignedDistance: 0.1,
            neutralShare: 0.7,
          },
          s3: {
            sampleCount: 12,
            mean: 1.9,
            stdDev: 0.8,
            variance: 0.64,
            min: 2,
            max: 5,
            range: 3,
            directionalAgreement: 0.5,
            medianSignedDistance: 0.5,
            neutralShare: 0.1,
          },
          s4: {
            sampleCount: 12,
            mean: 2.4,
            stdDev: 0.4,
            variance: 0.16,
            min: 2,
            max: 3,
            range: 1,
            directionalAgreement: 0.583333,
            medianSignedDistance: -1,
            neutralShare: 0.416667,
          },
          s5: {
            sampleCount: 12,
            mean: 4.4,
            stdDev: 0.2,
            variance: 0.04,
            min: 4,
            max: 5,
            range: 1,
            directionalAgreement: 0.85,
            medianSignedDistance: 1,
            neutralShare: 0,
            orientationCorrected: true,
          },
        },
      },
    },
    mostVariableScenarios: [],
    leastVariableScenarios: [],
  };
}

export function createCompanionAnalysis(): AnalysisResult {
  return {
    id: 'analysis-2',
    runId: 'run-2',
    analysisType: 'basic',
    status: 'CURRENT',
    codeVersion: '1.1.1',
    inputHash: 'hash-2',
    createdAt: '2026-03-10T10:00:00Z',
    computedAt: '2026-03-10T10:01:00Z',
    durationMs: 1000,
    perModel: {
      model1: {
        sampleSize: 4,
        values: {},
        overall: { mean: 3, stdDev: 0, min: 1, max: 5 },
      },
    },
    preferenceSummary: null,
    reliabilitySummary: null,
    aggregateMetadata: null,
    modelAgreement: {
      pairwise: {},
      outlierModels: [],
      overallAgreement: 0.8,
    },
    visualizationData: {
      decisionDistribution: {},
      scenarioDimensions: {
        c1: { Freedom: 'a1', Harmony: 'b1' },
        c2: { Freedom: 'a1', Harmony: 'b2' },
        c3: { Freedom: 'a2', Harmony: 'b2' },
        c4: { Freedom: 'a2', Harmony: 'b1' },
      },
      modelScenarioMatrix: {
        model1: { c1: 5, c2: 4, c3: 5, c4: 4 },
      },
    },
    varianceAnalysis: {
      isMultiSample: true,
      samplesPerScenario: 12,
      orientationCorrectedCount: 4,
      perModel: {
        model1: {
          totalSamples: 48,
          uniqueScenarios: 4,
          samplesPerScenario: 12,
          avgWithinScenarioVariance: 0.1,
          maxWithinScenarioVariance: 0.2,
          consistencyScore: 0.9,
          perScenario: {
            c1: {
              sampleCount: 12,
              mean: 4.6,
              stdDev: 0.1,
              variance: 0.01,
              min: 4,
              max: 5,
              range: 1,
              directionalAgreement: 0.9,
              medianSignedDistance: 1.0,
              neutralShare: 0,
              orientationCorrected: true,
            },
            c2: {
              sampleCount: 12,
              mean: 4.5,
              stdDev: 0.2,
              variance: 0.04,
              min: 4,
              max: 5,
              range: 1,
              directionalAgreement: 0.82,
              medianSignedDistance: 0.9,
              neutralShare: 0,
              orientationCorrected: true,
            },
            c3: {
              sampleCount: 12,
              mean: 4.4,
              stdDev: 0.2,
              variance: 0.04,
              min: 4,
              max: 5,
              range: 1,
              directionalAgreement: 0.85,
              medianSignedDistance: 0.8,
              neutralShare: 0,
              orientationCorrected: true,
            },
            c4: {
              sampleCount: 12,
              mean: 4.3,
              stdDev: 0.2,
              variance: 0.04,
              min: 4,
              max: 5,
              range: 1,
              directionalAgreement: 0.88,
              medianSignedDistance: 0.8,
              neutralShare: 0,
              orientationCorrected: true,
            },
          },
        },
      },
      mostVariableScenarios: [],
      leastVariableScenarios: [],
    },
    mostContestedScenarios: [],
    methodsUsed: {
      modelComparison: 'spearman',
      pValueCorrection: 'holm',
      effectSize: 'cohens_d',
      dimensionTest: 'kruskal',
      alpha: 0.05,
      codeVersion: '1.1.1',
    },
    warnings: [],
  };
}

export const pairedDefinitionContent = {
  methodology: {
    family: 'job-choice',
    presentation_order: 'A_first' as const,
  },
  components: {
    value_first: { token: 'freedom' },
    value_second: { token: 'harmony' },
  },
  dimensions: [{ name: 'Freedom' }, { name: 'Harmony' }],
};

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisResult, RawPreferenceSummary, RawReliabilitySummary } from '../../../src/api/operations/analysis';

const { warn } = vi.hoisted(() => ({
  warn: vi.fn(),
}));

vi.mock('@valuerank/shared', () => ({
  createLogger: () => ({ warn }),
}));

import { buildAnalysisSemanticsView } from '../../../src/components/analysis-v2/analysisSemantics';

function createPreferenceSummary(overrides?: Record<string, unknown>): RawPreferenceSummary {
  return {
    perModel: {
      'claude-3': {
        preferenceDirection: {
          byValue: {
            Compassion: { winRate: 0.7 },
            Discipline: { winRate: 0.2 },
            Balance: { winRate: 0.5 },
          },
          overallLean: 'A',
          overallSignedCenter: 0.45,
        },
        preferenceStrength: 1.2,
      },
      'gpt-4': {
        preferenceDirection: {
          byValue: {
            Compassion: { winRate: 0.8 },
            Discipline: { winRate: 0.1 },
          },
          overallLean: 'B',
          overallSignedCenter: -0.4,
        },
        preferenceStrength: 1.4,
      },
      ...overrides,
    },
  };
}

function createReliabilitySummary(overrides?: Record<string, unknown>): RawReliabilitySummary {
  return {
    perModel: {
      'claude-3': {
        baselineNoise: 0.23,
        baselineReliability: 0.81,
        directionalAgreement: 0.9,
        neutralShare: 0.1,
        coverageCount: 8,
        uniqueScenarios: 8,
      },
      'gpt-4': {
        baselineNoise: 0.17,
        baselineReliability: 0.92,
        directionalAgreement: 0.95,
        neutralShare: 0.05,
        coverageCount: 8,
        uniqueScenarios: 8,
      },
      ...overrides,
    },
  };
}

function createAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
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
    perModel: {
      'claude-3': {
        sampleSize: 8,
        values: {},
        overall: { mean: 3, stdDev: 0.4, min: 2, max: 4 },
      },
      'gpt-4': {
        sampleSize: 8,
        values: {},
        overall: { mean: 3, stdDev: 0.4, min: 2, max: 4 },
      },
    },
    preferenceSummary: createPreferenceSummary(),
    reliabilitySummary: createReliabilitySummary(),
    aggregateMetadata: null,
    modelAgreement: {
      pairwise: {},
      outlierModels: [],
      overallAgreement: 0.8,
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

describe('buildAnalysisSemanticsView', () => {
  beforeEach(() => {
    warn.mockClear();
  });

  it('builds available preference and reliability semantics from valid current summaries', () => {
    const semantics = buildAnalysisSemanticsView(createAnalysis(), false);

    expect(semantics.preference.rowAvailability).toEqual({ status: 'available' });
    expect(semantics.reliability.rowAvailability).toEqual({ status: 'available' });
    expect(Object.keys(semantics.preference.byModel)).toEqual(['claude-3', 'gpt-4']);
    expect(semantics.preference.byModel['claude-3']).toMatchObject({
      overallLean: 'A',
      topPrioritizedValues: ['Compassion'],
      topDeprioritizedValues: ['Discipline'],
      neutralValues: ['Balance'],
    });
    expect(semantics.reliability.byModel['gpt-4']).toMatchObject({
      baselineReliability: 0.92,
      baselineNoise: 0.17,
      coverageCount: 8,
      uniqueScenarios: 8,
    });
  });

  it('classifies aggregate rows from analysisType even when the tag-derived prop is false', () => {
    const semantics = buildAnalysisSemanticsView(
      createAnalysis({
        analysisType: 'AGGREGATE',
        codeVersion: '1.0.0',
        preferenceSummary: null,
        reliabilitySummary: null,
      }),
      false,
    );

    expect(semantics.preference.rowAvailability).toEqual({
      status: 'unavailable',
      reason: 'aggregate-analysis',
      message: 'This aggregate was made before the new pooled summaries existed. Use the old view for now, or wait until this aggregate is refreshed.',
    });
    expect(semantics.reliability.rowAvailability).toEqual({
      status: 'unavailable',
      reason: 'aggregate-analysis',
      message: 'This aggregate was made before the new pooled summaries existed. Use the old view for now, or wait until this aggregate is refreshed.',
    });
  });

  it('allows eligible aggregates through row gating and surfaces reliability warnings from aggregate metadata', () => {
    const semantics = buildAnalysisSemanticsView(
      createAnalysis({
        analysisType: 'AGGREGATE',
        aggregateMetadata: {
          aggregateEligibility: 'eligible_same_signature_baseline',
          aggregateIneligibilityReason: null,
          sourceRunCount: 2,
          sourceRunIds: ['run-a', 'run-b'],
          conditionCoverage: {
            plannedConditionCount: 5,
            observedConditionCount: 5,
            complete: true,
          },
          perModelRepeatCoverage: {
            'claude-3': {
              repeatCoverageCount: 4,
              repeatCoverageShare: 0.8,
              contributingRunCount: 2,
            },
            'gpt-4': {
              repeatCoverageCount: 5,
              repeatCoverageShare: 1,
              contributingRunCount: 2,
            },
          },
          perModelDrift: {
            'claude-3': {
              weightedOverallSignedCenterSd: 0.31,
              exceedsWarningThreshold: true,
            },
            'gpt-4': {
              weightedOverallSignedCenterSd: 0.1,
              exceedsWarningThreshold: false,
            },
          },
        },
      }),
      false,
    );

    expect(semantics.preference.rowAvailability).toEqual({ status: 'available' });
    expect(semantics.reliability.rowAvailability).toEqual({ status: 'available' });
    expect(semantics.reliability.aggregateWarnings).toEqual({
      isEligibleAggregate: true,
      lowCoverageModels: ['claude-3'],
      highDriftModels: ['claude-3'],
    });
    expect(semantics.reliability.byModel['claude-3']).toMatchObject({
      hasLowCoverageWarning: true,
      hasHighDriftWarning: true,
      repeatCoverageShare: 0.8,
      contributingRunCount: 2,
      weightedOverallSignedCenterSd: 0.31,
    });
  });

  it('uses aggregate ineligibility reasons from aggregate metadata', () => {
    const semantics = buildAnalysisSemanticsView(
      createAnalysis({
        analysisType: 'AGGREGATE',
        preferenceSummary: null,
        reliabilitySummary: null,
        aggregateMetadata: {
          aggregateEligibility: 'ineligible_partial_coverage',
          aggregateIneligibilityReason: 'This aggregate does not cover the full baseline condition set for this signature.',
          sourceRunCount: 2,
          sourceRunIds: ['run-a', 'run-b'],
          conditionCoverage: {
            plannedConditionCount: 5,
            observedConditionCount: 4,
            complete: false,
          },
          perModelRepeatCoverage: {},
          perModelDrift: {},
        },
      }),
      false,
    );

    expect(semantics.preference.rowAvailability).toEqual({
      status: 'unavailable',
      reason: 'aggregate-analysis',
      message: 'This aggregate does not cover the full baseline condition set for this signature.',
    });
  });

  it('classifies legacy rows before section parsing when both summaries are null', () => {
    const semantics = buildAnalysisSemanticsView(
      createAnalysis({
        codeVersion: '1.0.0',
        preferenceSummary: null,
        reliabilitySummary: null,
      }),
      false,
    );

    expect(semantics.preference.rowAvailability).toMatchObject({ reason: 'legacy-analysis' });
    expect(semantics.reliability.rowAvailability).toMatchObject({ reason: 'legacy-analysis' });
  });

  it('classifies suppressed current rows when both summaries are null on current versions', () => {
    const semantics = buildAnalysisSemanticsView(
      createAnalysis({
        preferenceSummary: null,
        reliabilitySummary: null,
      }),
      false,
    );

    expect(semantics.preference.rowAvailability).toMatchObject({ reason: 'suppressed-run-type' });
    expect(semantics.reliability.rowAvailability).toMatchObject({ reason: 'suppressed-run-type' });
  });

  it('fails closed when analysis.perModel is empty', () => {
    const semantics = buildAnalysisSemanticsView(
      createAnalysis({
        perModel: {},
      }),
      false,
    );

    expect(semantics.preference.rowAvailability).toMatchObject({ reason: 'invalid-summary-shape' });
    expect(semantics.reliability.rowAvailability).toMatchObject({ reason: 'invalid-summary-shape' });
    expect(semantics.preference.byModel).toEqual({});
    expect(semantics.reliability.byModel).toEqual({});
  });

  it('marks reliability unavailable for no-repeat coverage without treating it as legacy', () => {
    const semantics = buildAnalysisSemanticsView(
      createAnalysis({
        reliabilitySummary: createReliabilitySummary({
          'claude-3': {
            baselineNoise: null,
            baselineReliability: null,
            directionalAgreement: null,
            neutralShare: null,
            coverageCount: 0,
            uniqueScenarios: 8,
          },
          'gpt-4': {
            baselineNoise: null,
            baselineReliability: null,
            directionalAgreement: null,
            neutralShare: null,
            coverageCount: 0,
            uniqueScenarios: 8,
          },
        }),
      }),
      false,
    );

    expect(semantics.reliability.rowAvailability).toMatchObject({ reason: 'no-repeat-coverage' });
    expect(semantics.reliability.hasAnyAvailableModel).toBe(false);
    expect(semantics.reliability.byModel['claude-3']?.availability).toMatchObject({ reason: 'no-repeat-coverage' });
  });

  it('keeps mixed reliability rows available while listing unavailable models separately', () => {
    const semantics = buildAnalysisSemanticsView(
      createAnalysis({
        reliabilitySummary: createReliabilitySummary({
          'claude-3': {
            baselineNoise: null,
            baselineReliability: null,
            directionalAgreement: null,
            neutralShare: null,
            coverageCount: 0,
            uniqueScenarios: 8,
          },
        }),
      }),
      false,
    );

    expect(semantics.reliability.rowAvailability).toEqual({ status: 'available' });
    expect(semantics.reliability.hasAnyAvailableModel).toBe(true);
    expect(semantics.reliability.hasMixedAvailability).toBe(true);
    expect(semantics.reliability.byModel['claude-3']?.availability).toMatchObject({ reason: 'no-repeat-coverage' });
    expect(semantics.reliability.byModel['gpt-4']?.availability).toEqual({ status: 'available' });
  });

  it('marks malformed summary entries invalid without dropping the canonical model set', () => {
    const semantics = buildAnalysisSemanticsView(
      createAnalysis({
        preferenceSummary: createPreferenceSummary({
          'gpt-4': {
            preferenceDirection: {
              byValue: {
                Discipline: { winRate: 1.5 },
              },
              overallLean: 'B',
              overallSignedCenter: -0.5,
            },
            preferenceStrength: 1.2,
          },
        }),
      }),
      false,
    );

    expect(semantics.preference.rowAvailability).toEqual({ status: 'available' });
    expect(semantics.preference.byModel['gpt-4']?.availability).toMatchObject({ reason: 'invalid-summary-shape' });
    expect(semantics.preference.byModel['claude-3']?.availability).toEqual({ status: 'available' });
  });

  it('uses unknown-analysis-version when codeVersion is not parseable', () => {
    const semantics = buildAnalysisSemanticsView(
      createAnalysis({
        codeVersion: 'vNext',
        preferenceSummary: null,
        reliabilitySummary: null,
      }),
      false,
    );

    expect(semantics.preference.rowAvailability).toMatchObject({ reason: 'unknown-analysis-version' });
    expect(semantics.reliability.rowAvailability).toMatchObject({ reason: 'unknown-analysis-version' });
  });
});

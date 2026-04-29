import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@valuerank/db', () => ({
  db: {
    analysisResult: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@valuerank/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@valuerank/shared')>();
  return {
    ...actual,
    createLogger: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  };
});

vi.mock('../../src/services/analysis/aggregate.js', () => ({
  updateAggregateRun: vi.fn(),
}));

vi.mock('../../src/services/analysis/aggregate/aggregate-run-workflow.js', () => ({
  prepareAggregateRunSnapshot: vi.fn(),
}));

import { db } from '@valuerank/db';
import { updateAggregateRun } from '../../src/services/analysis/aggregate.js';
import { prepareAggregateRunSnapshot } from '../../src/services/analysis/aggregate/aggregate-run-workflow.js';
import { parseOptions, runBackfill } from '../../src/cli/backfill-condition-weighted.js';

function buildAnalysisOutput(overrides?: {
  withConditionCount?: boolean;
}): Record<string, unknown> & {
  perModel: Record<string, Record<string, unknown>>;
} {
  const withConditionCount = overrides?.withConditionCount ?? true;

  return {
    perModel: {
      'gpt-4': {
        sampleSize: 10,
        ...(withConditionCount ? { conditionCount: 4 } : {}),
        values: {
          Achievement: {
            winRate: 0.76,
            count: {
              prioritized: 3.8,
              deprioritized: 1.2,
              neutral: 0,
            },
          },
        },
        overall: {
          mean: 0.5,
          stdDev: 0.1,
          min: 0.4,
          max: 0.6,
        },
      },
      'claude-3': {
        sampleSize: 10,
        ...(withConditionCount ? { conditionCount: 4 } : {}),
        values: {
          Achievement: {
            winRate: 0.64,
            count: {
              prioritized: 2.56,
              deprioritized: 1.44,
              neutral: 0,
            },
          },
        },
        overall: {
          mean: 0.4,
          stdDev: 0.2,
          min: 0.1,
          max: 0.8,
        },
      },
    },
    preferenceSummary: {
      perModel: {
        'gpt-4': {
          preferenceDirection: {
            byValue: {
              Achievement: {
                winRate: 0.76,
                count: {
                  prioritized: 3.8,
                  deprioritized: 1.2,
                  neutral: 0,
                },
              },
            },
            overallLean: 'A',
            overallSignedCenter: 0.5,
          },
          preferenceStrength: 1.2,
        },
        'claude-3': {
          preferenceDirection: {
            byValue: {
              Achievement: {
                winRate: 0.64,
                count: {
                  prioritized: 2.56,
                  deprioritized: 1.44,
                  neutral: 0,
                },
              },
            },
            overallLean: 'B',
            overallSignedCenter: -0.4,
          },
          preferenceStrength: 0.9,
        },
      },
    },
    reliabilitySummary: {
      perModel: {
        'gpt-4': {
          baselineNoise: 0.2,
          baselineReliability: 0.9,
          directionalAgreement: 0.85,
          neutralShare: 0.1,
          coverageCount: 4,
          uniqueScenarios: 4,
        },
        'claude-3': {
          baselineNoise: 0.3,
          baselineReliability: 0.8,
          directionalAgreement: 0.75,
          neutralShare: 0.2,
          coverageCount: 4,
          uniqueScenarios: 4,
        },
      },
    },
    aggregateMetadata: null,
    modelAgreement: {
      pairwise: {},
      outlierModels: [],
      overallAgreement: 0.5,
    },
    visualizationData: {
      decisionDistribution: {
        'gpt-4': { opponentStrongly: 0, opponentSomewhat: 0, neutral: 0, somewhat: 0, strongly: 10 },
        'claude-3': { opponentStrongly: 0, opponentSomewhat: 0, neutral: 0, somewhat: 4, strongly: 6 },
      },
      modelScenarioMatrix: {
        'gpt-4': { 'condition-1': 0.5 },
        'claude-3': { 'condition-1': -0.4 },
      },
      scenarioDimensions: {
        'condition-1': { stakes: 1 },
      },
    },
    varianceAnalysis: null,
    mostContestedScenarios: [],
    methodsUsed: {
      modelComparison: 'spearman_rho',
      pValueCorrection: 'holm_bonferroni',
      effectSize: 'cohens_d',
      dimensionTest: 'kruskal_wallis',
      alpha: 0.05,
      codeVersion: '1.5.0',
    },
    warnings: [],
    computedAt: '2026-04-29T00:00:00.000Z',
    durationMs: 1,
  };
}

describe('backfill condition-weighted cli', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('parses dry-run and filter arguments', () => {
    expect(
      parseOptions(['--dry-run', '--definition-id', 'definition-1', '--domain-id=domain-2']),
    ).toEqual({
      dryRun: true,
      force: false,
      definitionId: 'definition-1',
      domainId: 'domain-2',
    });
  });

  it('skips rows that already have conditionCount on every model', async () => {
    vi.mocked(db.analysisResult.findMany)
      .mockResolvedValueOnce([
        {
          id: 'analysis-1',
          runId: 'run-1',
          output: buildAnalysisOutput({ withConditionCount: true }),
          run: {
            definitionId: 'definition-1',
            config: {
              definitionSnapshot: { _meta: { preambleVersionId: 'pre-1', definitionVersion: 1 } },
              temperature: 0.7,
            },
            definition: { domainId: 'domain-1' },
          },
        },
      ])
      .mockResolvedValueOnce([]);

    const summary = await runBackfill({
      dryRun: false,
      definitionId: null,
      domainId: null,
    });

    expect(summary).toEqual({
      inspected: 1,
      upgraded: 0,
      skipped: 1,
      failed: 0,
      failedRowIds: [],
      sampledChanges: [],
    });
    expect(updateAggregateRun).not.toHaveBeenCalled();
  });

  it('reruns rows when any model is still missing conditionCount and continues on failures', async () => {
    vi.mocked(db.analysisResult.findMany)
      .mockResolvedValueOnce([
        {
          id: 'analysis-1',
          runId: 'run-1',
          output: buildAnalysisOutput({ withConditionCount: false }),
          run: {
            definitionId: 'definition-1',
            config: {
              definitionSnapshot: { _meta: { preambleVersionId: 'pre-1', definitionVersion: 1 } },
              temperature: 0.7,
            },
            definition: { domainId: 'domain-1' },
          },
        },
        {
          id: 'analysis-2',
          runId: 'run-2',
          output: buildAnalysisOutput({ withConditionCount: false }),
          run: {
            definitionId: 'definition-2',
            config: {
              definitionSnapshot: { _meta: { preambleVersionId: 'pre-2', definitionVersion: 2 } },
              temperature: 0.5,
            },
            definition: { domainId: 'domain-2' },
          },
        },
      ])
      .mockResolvedValueOnce([]);

    vi.mocked(updateAggregateRun)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'));

    const summary = await runBackfill({
      dryRun: false,
      definitionId: null,
      domainId: null,
    });

    expect(updateAggregateRun).toHaveBeenCalledTimes(2);
    expect(updateAggregateRun).toHaveBeenNthCalledWith(1, 'definition-1', 'pre-1', 1, 0.7);
    expect(updateAggregateRun).toHaveBeenNthCalledWith(2, 'definition-2', 'pre-2', 2, 0.5);
    expect(summary).toEqual({
      inspected: 2,
      upgraded: 1,
      skipped: 0,
      failed: 1,
      failedRowIds: ['analysis-2'],
      sampledChanges: [],
    });
  });

  it('respects dry-run and selection filters', async () => {
    const preview = buildAnalysisOutput({ withConditionCount: true });
    const gpt4 = preview.perModel['gpt-4'];
    const gpt4Values = gpt4.values as Record<string, unknown>;
    const achievement = gpt4Values.Achievement as Record<string, unknown>;
    achievement.winRate = 0.71;

    vi.mocked(prepareAggregateRunSnapshot).mockResolvedValueOnce({
      aggregatedResult: preview,
    } as never);

    vi.mocked(db.analysisResult.findMany)
      .mockResolvedValueOnce([
        {
          id: 'analysis-3',
          runId: 'run-3',
          output: buildAnalysisOutput({ withConditionCount: false }),
          run: {
            definitionId: 'definition-3',
            config: {
              definitionSnapshot: { _meta: { preambleVersionId: 'pre-3', definitionVersion: 3 } },
              temperature: 0.6,
            },
            definition: { domainId: 'domain-3' },
          },
        },
      ])
      .mockResolvedValueOnce([]);

    const summary = await runBackfill({
      dryRun: true,
      definitionId: 'definition-3',
      domainId: 'domain-3',
    });

    expect(summary).toEqual({
      inspected: 1,
      upgraded: 1,
      skipped: 0,
      failed: 0,
      failedRowIds: [],
      sampledChanges: [
        {
          analysisId: 'analysis-3',
          runId: 'run-3',
          modelId: 'gpt-4',
          valueId: 'Achievement',
          before: 0.76,
          after: 0.71,
        },
      ],
    });
    expect(updateAggregateRun).not.toHaveBeenCalled();
    expect(prepareAggregateRunSnapshot).toHaveBeenCalledWith('definition-3', 'pre-3', 3, 0.6);

    expect(vi.mocked(db.analysisResult.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          analysisType: 'AGGREGATE',
          status: 'CURRENT',
          run: expect.objectContaining({
            definitionId: 'definition-3',
            definition: expect.objectContaining({
              domainId: 'domain-3',
            }),
          }),
        }),
      }),
    );
  });
});

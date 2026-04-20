import { describe, expect, it, vi, beforeEach } from 'vitest';

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

import { db } from '@valuerank/db';
import { updateAggregateRun } from '../../src/services/analysis/aggregate.js';
import { parseOptions, runBackfill } from '../../src/cli/backfill-aggregate-consistency.js';

describe('backfill aggregate consistency cli', () => {
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

  it('parses --force', () => {
    expect(parseOptions(['--force'])).toEqual({
      dryRun: false,
      force: true,
      definitionId: null,
      domainId: null,
    });
  });

  it('skips rows that already have perPair on every model', async () => {
    vi.mocked(db.analysisResult.findMany)
      .mockResolvedValueOnce([
        {
          id: 'analysis-1',
          runId: 'run-1',
          output: {
            reliabilitySummary: {
              perModel: {
                modelA: { perPair: { ValueA: { targetAnalysisRunId: 'run-1', targetCompanionRunId: null, primaryConditionIds: [], companionConditionIds: [], perCondition: [] } } },
                modelB: { perPair: { ValueA: { targetAnalysisRunId: 'run-1', targetCompanionRunId: null, primaryConditionIds: [], companionConditionIds: [], perCondition: [] } } },
              },
            },
          },
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
    });
    expect(updateAggregateRun).not.toHaveBeenCalled();
  });

  it('reruns rows when any model is still missing perPair and continues on failures', async () => {
    vi.mocked(db.analysisResult.findMany)
      .mockResolvedValueOnce([
        {
          id: 'analysis-1',
          runId: 'run-1',
          output: {
            reliabilitySummary: {
              perModel: {
                modelA: { perScenario: { s1: { trials: 1, matches: 1 } } },
                modelB: { perPair: { ValueA: { targetAnalysisRunId: 'run-1', targetCompanionRunId: null, primaryConditionIds: [], companionConditionIds: [], perCondition: [] } } },
              },
            },
          },
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
          output: {
            reliabilitySummary: {
              perModel: {
                modelA: { perPair: { ValueA: { targetAnalysisRunId: 'run-2', targetCompanionRunId: null, primaryConditionIds: [], companionConditionIds: [], perCondition: [] } } },
                modelB: { perScenario: { s1: { trials: 1, matches: 1 } } },
              },
            },
          },
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
    });
  });

  it('respects dry-run and selection filters', async () => {
    vi.mocked(db.analysisResult.findMany)
      .mockResolvedValueOnce([
        {
          id: 'analysis-3',
          runId: 'run-3',
          output: {
            reliabilitySummary: {
              perModel: {
                modelA: { perScenario: { s1: { trials: 1, matches: 1 } } },
              },
            },
          },
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
    });
    expect(updateAggregateRun).not.toHaveBeenCalled();

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

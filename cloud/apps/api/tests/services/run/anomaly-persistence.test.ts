import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRunFindUnique,
  mockRunUpdate,
  mockAnomalyUpsert,
  mockAnomalyUpdateMany,
  mockAnomalyFindMany,
} = vi.hoisted(() => ({
  mockRunFindUnique: vi.fn(),
  mockRunUpdate: vi.fn(),
  mockAnomalyUpsert: vi.fn(),
  mockAnomalyUpdateMany: vi.fn(),
  mockAnomalyFindMany: vi.fn(),
}));

vi.mock('@valuerank/db', () => ({
  db: {
    run: {
      findUnique: mockRunFindUnique,
      update: mockRunUpdate,
    },
    runAnomaly: {
      upsert: mockAnomalyUpsert,
      updateMany: mockAnomalyUpdateMany,
      findMany: mockAnomalyFindMany,
    },
  },
  Prisma: {},
}));

import {
  repairScheduledCount,
  resolveAnomaly,
  syncAnomalies,
  upsertAnomaly,
} from '../../../src/services/run/anomaly-persistence.js';

describe('run anomaly persistence helpers', () => {
  beforeEach(() => {
    mockRunFindUnique.mockReset();
    mockRunUpdate.mockReset();
    mockAnomalyUpsert.mockReset();
    mockAnomalyUpdateMany.mockReset();
    mockAnomalyFindMany.mockReset();
  });

  it('upserts anomaly rows with the current timestamps', async () => {
    mockAnomalyUpsert.mockResolvedValue(undefined);

    await upsertAnomaly('run_1', {
      type: 'STRANDED_TRANSCRIPT',
      subject: '',
      details: { transcriptIds: ['t1'] },
    }, 'default');

    expect(mockAnomalyUpsert).toHaveBeenCalledTimes(1);
    const args = mockAnomalyUpsert.mock.calls[0]?.[0];
    expect(args.where.runId_type_subject_source).toEqual({
      runId: 'run_1',
      type: 'STRANDED_TRANSCRIPT',
      subject: '',
      source: 'default',
    });
    expect(args.create.runId).toBe('run_1');
    expect(args.update.resolvedAt).toBeNull();
  });

  it('re-unresolves an anomaly when it is re-detected', async () => {
    mockAnomalyUpsert.mockResolvedValue(undefined);

    await upsertAnomaly('run_1', {
      type: 'SUMMARIZING_STALL',
      subject: 'group-1',
      details: { runId: 'run_1' },
    }, 'audit');

    expect(mockAnomalyUpsert.mock.calls[0]?.[0]).toMatchObject({
      where: {
        runId_type_subject_source: {
          runId: 'run_1',
          type: 'SUMMARIZING_STALL',
          subject: 'group-1',
          source: 'audit',
        },
      },
      update: {
        resolvedAt: null,
      },
    });
  });

  it('marks anomalies resolved when the condition clears', async () => {
    mockAnomalyUpdateMany.mockResolvedValue({ count: 1 });

    await resolveAnomaly({
      runId: 'run_1',
      type: 'SUMMARIZING_STALL',
      subject: 'group-1',
      source: 'audit',
    });

    expect(mockAnomalyUpdateMany).toHaveBeenCalledTimes(1);
    const args = mockAnomalyUpdateMany.mock.calls[0]?.[0];
    expect(args.where).toEqual({
      runId: 'run_1',
      type: 'SUMMARIZING_STALL',
      subject: 'group-1',
      source: 'audit',
      resolvedAt: null,
    });
    expect(args.data.resolvedAt).toBeInstanceOf(Date);
    expect(args.data.lastSeenAt).toBeUndefined();
  });

  it('syncs anomalies without touching other sources', async () => {
    mockAnomalyUpsert.mockResolvedValue(undefined);
    mockAnomalyFindMany.mockResolvedValue([{ subject: 'group-1', details: null }]);

    await syncAnomalies('run_1', 'SUMMARIZING_STALL', [], 'audit');

    expect(mockAnomalyFindMany).toHaveBeenCalledWith({
      where: {
        runId: 'run_1',
        type: 'SUMMARIZING_STALL',
        source: 'audit',
        resolvedAt: null,
      },
      select: { subject: true, details: true },
    });
    expect(mockAnomalyUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          runId: 'run_1',
          type: 'SUMMARIZING_STALL',
          subject: 'group-1',
          source: 'audit',
          resolvedAt: null,
        },
      })
    );
  });

  it('repairs scheduled total only when it changes', async () => {
    mockRunFindUnique.mockResolvedValue({
      progress: { total: 4, completed: 2, failed: 1 },
    });
    mockRunUpdate.mockResolvedValue(undefined);

    await expect(repairScheduledCount('run_1', 4)).resolves.toBe(false);
    await expect(repairScheduledCount('run_1', 6)).resolves.toBe(true);

    expect(mockRunUpdate).toHaveBeenCalledTimes(1);
    expect(mockRunUpdate.mock.calls[0]?.[0].data.progress).toEqual({
      total: 6,
      completed: 2,
      failed: 1,
    });
  });

  it('returns false when the run does not exist', async () => {
    mockRunFindUnique.mockResolvedValue(null);

    await expect(repairScheduledCount('missing-run', 6)).resolves.toBe(false);
    expect(mockRunUpdate).not.toHaveBeenCalled();
  });
});

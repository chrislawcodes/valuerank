import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunFindUnique = vi.fn();
const mockRunUpdate = vi.fn();
const mockAnomalyUpsert = vi.fn();
const mockAnomalyUpdateMany = vi.fn();

vi.mock('@valuerank/db', () => ({
  db: {
    run: {
      findUnique: mockRunFindUnique,
      update: mockRunUpdate,
    },
    runAnomaly: {
      upsert: mockAnomalyUpsert,
      updateMany: mockAnomalyUpdateMany,
    },
  },
  Prisma: {},
}));

import {
  repairScheduledCount,
  resolveAnomaly,
  upsertAnomaly,
} from '../../../src/services/run/anomaly-persistence.js';

describe('run anomaly persistence helpers', () => {
  beforeEach(() => {
    mockRunFindUnique.mockReset();
    mockRunUpdate.mockReset();
    mockAnomalyUpsert.mockReset();
    mockAnomalyUpdateMany.mockReset();
  });

  it('upserts anomaly rows with the current timestamps', async () => {
    mockAnomalyUpsert.mockResolvedValue(undefined);

    await upsertAnomaly('run_1', {
      type: 'STRANDED_TRANSCRIPT',
      subject: '',
      details: { transcriptIds: ['t1'] },
    });

    expect(mockAnomalyUpsert).toHaveBeenCalledTimes(1);
    const args = mockAnomalyUpsert.mock.calls[0]?.[0];
    expect(args.where.runId_type_subject).toEqual({
      runId: 'run_1',
      type: 'STRANDED_TRANSCRIPT',
      subject: '',
    });
    expect(args.create.runId).toBe('run_1');
    expect(args.update.resolvedAt).toBeNull();
  });

  it('marks anomalies resolved when the condition clears', async () => {
    mockAnomalyUpdateMany.mockResolvedValue({ count: 1 });

    await resolveAnomaly({
      runId: 'run_1',
      type: 'PAIR_ASYMMETRY',
      subject: 'group-1',
    });

    expect(mockAnomalyUpdateMany).toHaveBeenCalledTimes(1);
    const args = mockAnomalyUpdateMany.mock.calls[0]?.[0];
    expect(args.where).toEqual({
      runId: 'run_1',
      type: 'PAIR_ASYMMETRY',
      subject: 'group-1',
      resolvedAt: null,
    });
    expect(args.data.resolvedAt).toBeInstanceOf(Date);
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
});

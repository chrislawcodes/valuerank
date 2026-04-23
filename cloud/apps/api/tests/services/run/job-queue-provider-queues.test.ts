/**
 * Unit tests for probe queue normalization in job queue diagnostics.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const dbMock = vi.hoisted(() => ({
  run: {
    findUnique: vi.fn(),
  },
  $queryRaw: vi.fn(),
}));

vi.mock('@valuerank/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@valuerank/db')>();
  return {
    ...actual,
    db: dbMock,
  };
});

import { db } from '@valuerank/db';
import { getJobQueueStatus } from '../../../src/services/run/job-queue.js';

describe('job queue provider probe queues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.run.findUnique).mockResolvedValue({ id: 'run-1' } as never);
  });

  it('normalizes provider-specific probe queues into the legacy probe type', async () => {
    vi.mocked(db.$queryRaw).mockResolvedValueOnce([
      { name: 'probe_openai', state: 'created', count: BigInt(4) },
      { name: 'probe_mistral', state: 'active', count: BigInt(2) },
    ]);

    const status = await getJobQueueStatus('run-1');

    expect(status.byJobType.probe_scenario).toEqual({
      pending: 4,
      running: 2,
      completed: 0,
      failed: 0,
    });
    expect(status.totalPending).toBe(4);
    expect(status.totalRunning).toBe(2);
    expect(status.byJobType.probe_dead_letter).toBeUndefined();
  });

  it('normalizes provider-specific probe failures in recent failures', async () => {
    vi.mocked(db.$queryRaw)
      .mockResolvedValueOnce([
        { name: 'probe_openai', state: 'failed', count: BigInt(1) },
      ])
      .mockResolvedValueOnce([
        {
          id: 'job-1',
          name: 'probe_openai',
          data: { modelId: 'model-a' },
          output: { error: 'rate limited' },
          completed_on: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

    const status = await getJobQueueStatus('run-1', { includeRecentFailures: true });

    expect(status.totalFailed).toBe(1);
    expect(status.recentFailures).toEqual([
      {
        jobId: 'job-1',
        jobType: 'probe_scenario',
        error: 'rate limited',
        failedAt: '2026-01-01T00:00:00.000Z',
        transcriptId: undefined,
        scenarioId: undefined,
        modelId: 'model-a',
      },
    ]);
  });
});

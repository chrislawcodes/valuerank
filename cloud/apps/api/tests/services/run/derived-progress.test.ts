import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindUnique = vi.fn();
const mockGroupBy = vi.fn();
const mockTranscriptCount = vi.fn();

vi.mock('@valuerank/db', () => ({
  db: {
    run: {
      findUnique: mockFindUnique,
    },
    probeResult: {
      groupBy: mockGroupBy,
    },
    transcript: {
      count: mockTranscriptCount,
    },
  },
}));

import { computeRunProgress } from '../../../src/services/run/derived-progress.js';

describe('computeRunProgress', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockGroupBy.mockReset();
    mockTranscriptCount.mockReset();
  });

  it('derives probe and transcript counts from the authoritative tables', async () => {
    mockFindUnique.mockResolvedValue({ progress: { total: 10 } });
    mockGroupBy.mockResolvedValue([
      { status: 'SUCCESS', _count: { _all: 6 } },
      { status: 'FAILED', _count: { _all: 2 } },
    ]);
    mockTranscriptCount.mockImplementation(async (args: unknown) => {
      const { where } = args as {
        where: { summarizeFailedAt?: unknown; summarizedAt?: unknown };
      };

      if (where.summarizeFailedAt != null) {
        return 1;
      }

      if (where.summarizedAt != null) {
        return 3;
      }

      return 5;
    });

    const result = await computeRunProgress('run_123');

    expect(result).toEqual({
      total: 10,
      completed: 6,
      failed: 2,
      summarizeTotal: 5,
      summarizeCompleted: 3,
      summarizeFailed: 1,
    });
  });

  it('returns zero counts for an empty run', async () => {
    mockFindUnique.mockResolvedValue({ progress: { total: 0 } });
    mockGroupBy.mockResolvedValue([]);
    mockTranscriptCount.mockResolvedValue(0);

    await expect(computeRunProgress('run_empty')).resolves.toEqual({
      total: 0,
      completed: 0,
      failed: 0,
      summarizeTotal: 0,
      summarizeCompleted: 0,
      summarizeFailed: 0,
    });
  });
});

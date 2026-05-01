import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindUnique, mockGroupBy, mockTranscriptCount } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockGroupBy: vi.fn(),
  mockTranscriptCount: vi.fn(),
}));

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

describe('computeRunProgress', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFindUnique.mockReset();
    mockGroupBy.mockReset();
    mockTranscriptCount.mockReset();
  });

  it('derives probe and transcript counts from the authoritative tables', async () => {
    const { computeRunProgress } = await import('../../../src/services/run/derived-progress.js');
    mockFindUnique.mockResolvedValue({ progress: { total: 10 } });
    mockGroupBy.mockResolvedValue([
      { status: 'SUCCESS', _count: { _all: 6 } },
      { status: 'FAILED', _count: { _all: 2 } },
    ]);
    mockTranscriptCount
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);

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
    const { computeRunProgress } = await import('../../../src/services/run/derived-progress.js');
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

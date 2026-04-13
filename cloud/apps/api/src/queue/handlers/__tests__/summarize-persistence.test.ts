import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock @valuerank/db before importing the module under test
vi.mock('@valuerank/db', () => ({
  db: {
    transcript: {
      count: vi.fn(),
    },
  },
  Prisma: { DbNull: null },
}));

// Mock findMissingProbes from coverage-completeness
vi.mock('../../../services/run/coverage-completeness.js', () => ({
  findMissingProbes: vi.fn(),
}));

import { db } from '@valuerank/db';
import { findMissingProbes } from '../../../services/run/coverage-completeness.js';
import { checkAllSummarized } from '../summarize-persistence.js';

// eslint-disable-next-line @typescript-eslint/unbound-method
const mockCount = vi.mocked(db.transcript.count);
const mockFindMissingProbes = vi.mocked(findMissingProbes);

describe('checkAllSummarized', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when there are unsummarized transcripts', async () => {
    mockCount.mockResolvedValueOnce(2);
    // findMissingProbes should not be called since we short-circuit
    const result = await checkAllSummarized('run-1');
    expect(result).toBe(false);
    expect(mockFindMissingProbes).not.toHaveBeenCalled();
  });

  it('returns false when all transcripts are summarized but some probes are missing', async () => {
    mockCount.mockResolvedValueOnce(0);
    mockFindMissingProbes.mockResolvedValueOnce([
      { scenarioId: 'sc-1', modelId: 'model-a', sampleIndex: 0 },
    ]);
    const result = await checkAllSummarized('run-1');
    expect(result).toBe(false);
  });

  it('returns true when all transcripts are summarized and no probes are missing', async () => {
    mockCount.mockResolvedValueOnce(0);
    mockFindMissingProbes.mockResolvedValueOnce([]);
    const result = await checkAllSummarized('run-1');
    expect(result).toBe(true);
  });

  it('returns true when run has no expected probes (findMissingProbes returns [])', async () => {
    mockCount.mockResolvedValueOnce(0);
    mockFindMissingProbes.mockResolvedValueOnce([]);
    const result = await checkAllSummarized('run-no-config');
    expect(result).toBe(true);
  });

  it('propagates errors from findMissingProbes so the job can retry', async () => {
    mockCount.mockResolvedValueOnce(0);
    mockFindMissingProbes.mockRejectedValueOnce(new Error('DB connection lost'));
    await expect(checkAllSummarized('run-1')).rejects.toThrow('DB connection lost');
  });
});

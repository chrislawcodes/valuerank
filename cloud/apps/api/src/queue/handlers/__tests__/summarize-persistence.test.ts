import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest';

// Register mock factories — these are hoisted by Vitest and persist across resetModules()
vi.mock('@valuerank/db', () => ({
  db: {
    transcript: {
      count: vi.fn(),
    },
  },
  Prisma: { DbNull: null },
}));

vi.mock('../../../services/run/coverage-completeness.js', () => ({
  findMissingProbes: vi.fn(),
}));

// In single-fork mode, summarize-transcript.test.ts (integration test) may load
// summarize-persistence.ts before this file runs, giving it a live ESM binding to
// the REAL findMissingProbes. vi.resetModules() clears the module cache so our
// subsequent dynamic imports get a fresh summarize-persistence.ts that binds to
// the mock instead.
let checkAllSummarized: (runId: string) => Promise<boolean>;
let mockCount: ReturnType<typeof vi.fn>;
let mockFindMissingProbes: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  vi.resetModules();
  const dbModule = await import('@valuerank/db');
  const coverageModule = await import('../../../services/run/coverage-completeness.js');
  const persistenceModule = await import('../summarize-persistence.js');

  checkAllSummarized = persistenceModule.checkAllSummarized;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  mockCount = vi.mocked(dbModule.db.transcript.count);
  mockFindMissingProbes = vi.mocked(coverageModule.findMissingProbes);
});

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

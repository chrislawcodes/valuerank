import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { db as DbType } from '@valuerank/db';
import type { findMissingProbes as FindMissingProbesType } from '../../../services/run/coverage-completeness.js';
import type { checkAllSummarized as CheckAllSummarizedType } from '../summarize-persistence.js';

// These vi.mock() calls are hoisted above all imports by Vitest's transform.
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

/**
 * Why dynamic imports + vi.resetModules() in beforeEach?
 *
 * This suite runs in a singleFork process alongside integration tests (e.g.
 * summarize-transcript.test.ts) that load summarize-persistence.ts with real
 * @valuerank/db bindings. Without a module cache reset, Vitest may return that
 * cached instance, so vi.mock('@valuerank/db') misses the already-bound db
 * reference inside the module under test.
 *
 * vi.resetModules() clears the module cache (but NOT the mock factory registry),
 * so the subsequent dynamic imports load fresh instances that bind to our mocks.
 *
 * We reset in beforeEach (not beforeAll) because the singleFork worker can
 * repopulate the module cache between tests when other suites run concurrently.
 * Moving the reset to beforeEach ensures every test starts with a clean,
 * properly-mocked module — eliminating the intermittent failures seen when
 * beforeAll-based resets were skipped on the wrong test execution order.
 */

let checkAllSummarized: typeof CheckAllSummarizedType;
let mockCount: ReturnType<typeof vi.mocked<typeof DbType.transcript.count>>;
let mockFindMissingProbes: ReturnType<typeof vi.mocked<typeof FindMissingProbesType>>;

beforeEach(async () => {
  vi.resetModules();

  const dbModule = await import('@valuerank/db');
  const ccModule = await import('../../../services/run/coverage-completeness.js');
  const spModule = await import('../summarize-persistence.js');

  // eslint-disable-next-line @typescript-eslint/unbound-method
  mockCount = vi.mocked(dbModule.db.transcript.count);
  mockFindMissingProbes = vi.mocked(ccModule.findMissingProbes);
  checkAllSummarized = spModule.checkAllSummarized;
});

describe('checkAllSummarized', () => {
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

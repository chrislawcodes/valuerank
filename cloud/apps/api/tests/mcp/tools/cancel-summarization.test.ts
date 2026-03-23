/**
 * cancel_summarization MCP Tool Tests [T034]
 *
 * Tests for the MCP tool interface layer.
 * Service layer tests are in tests/services/run/summarization.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { db, mockRunState, mockTranscriptCount } = vi.hoisted(() => {
  const state: {
    run: null | {
      id: string;
      status: string;
      summarizeProgress: { total: number; completed: number; failed: number } | null;
      completedAt: Date | null;
    };
  } = {
    run: null,
  };

  const countState = { value: 0 };

  const run = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      if (!state.run || state.run.id !== where.id) return null;
      return {
        id: state.run.id,
        status: state.run.status,
        summarizeProgress: state.run.summarizeProgress,
      };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      if (!state.run || state.run.id !== where.id) {
        throw new Error('Run not found');
      }

      state.run = {
        ...state.run,
        status: typeof data.status === 'string' ? data.status : state.run.status,
        summarizeProgress: (data.summarizeProgress as {
          total: number;
          completed: number;
          failed: number;
        } | null) ?? state.run.summarizeProgress,
        completedAt: (data.completedAt as Date | null) ?? state.run.completedAt,
      };

      return {
        id: state.run.id,
        status: state.run.status,
        summarizeProgress: state.run.summarizeProgress,
      };
    }),
  };

  return {
    db: {
      run,
      transcript: {
        count: vi.fn(async () => countState.value),
      },
      $executeRaw: vi.fn(async () => 0),
    },
    mockRunState: state,
    mockTranscriptCount: countState,
  };
});

vi.mock('@valuerank/db', () => ({ db }));
vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => ({
    send: vi.fn().mockResolvedValue('mock-job-id'),
  })),
}));
vi.mock('../../../src/services/analysis/cache.js', () => ({
  invalidateCache: vi.fn().mockResolvedValue(0),
}));

import { cancelSummarization } from '../../../src/services/run/summarization.js';

describe('cancel_summarization MCP Tool [T034]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunState.run = null;
    mockTranscriptCount.value = 0;
  });

  function createTestRun(status: string) {
    const run = {
      id: `run-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      status,
      summarizeProgress: { total: 3, completed: 1, failed: 0 },
      completedAt: null as Date | null,
    };

    mockRunState.run = run;
    return run;
  }

  describe('input handling', () => {
    it('accepts valid run_id', async () => {
      const run = createTestRun('SUMMARIZING');

      const result = await cancelSummarization(run.id);

      expect(result.run.id).toBe(run.id);
    });
  });

  describe('success response format', () => {
    it('returns run with updated status', async () => {
      const run = createTestRun('SUMMARIZING');

      const result = await cancelSummarization(run.id);

      expect(result.run.status).toBe('COMPLETED');
    });

    it('returns cancelled count', async () => {
      const run = createTestRun('SUMMARIZING');

      const result = await cancelSummarization(run.id);

      expect(typeof result.cancelledCount).toBe('number');
      expect(result.cancelledCount).toBeGreaterThanOrEqual(0);
    });

    it('returns summarize progress', async () => {
      const run = createTestRun('SUMMARIZING');

      const result = await cancelSummarization(run.id);

      expect(result.run.summarizeProgress).toBeDefined();
      expect(typeof result.run.summarizeProgress?.total).toBe('number');
      expect(typeof result.run.summarizeProgress?.completed).toBe('number');
    });
  });

  describe('error handling', () => {
    it('throws NotFoundError for non-existent run', async () => {
      await expect(cancelSummarization('non-existent-cuid123456789')).rejects.toThrow(
        /Run.*not found/
      );
    });

    it('throws RunStateError when run is COMPLETED', async () => {
      const run = createTestRun('COMPLETED');

      await expect(cancelSummarization(run.id)).rejects.toThrow(/cannot.*cancel/i);
    });

    it('throws RunStateError when run is RUNNING', async () => {
      const run = createTestRun('RUNNING');

      await expect(cancelSummarization(run.id)).rejects.toThrow(/cannot.*cancel/i);
    });

    it('throws RunStateError when run is FAILED', async () => {
      const run = createTestRun('FAILED');

      await expect(cancelSummarization(run.id)).rejects.toThrow(/cannot.*cancel/i);
    });
  });

  describe('state transitions', () => {
    it('transitions SUMMARIZING to COMPLETED', async () => {
      const run = createTestRun('SUMMARIZING');

      await cancelSummarization(run.id);

      const updatedRun = await db.run.findUnique({ where: { id: run.id } });
      expect(updatedRun?.status).toBe('COMPLETED');
    });

    it('sets completedAt timestamp', async () => {
      const run = createTestRun('SUMMARIZING');

      await cancelSummarization(run.id);

      expect(mockRunState.run?.completedAt).not.toBeNull();
    });
  });
});

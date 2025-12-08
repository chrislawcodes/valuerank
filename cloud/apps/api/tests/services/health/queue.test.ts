/**
 * Queue Health Service Tests
 *
 * Tests for PgBoss job queue health checks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getQueueHealth, type QueueHealthStatus } from '../../../src/services/health/queue.js';

// Mock the queue status service
vi.mock('../../../src/services/queue/status.js', () => ({
  getQueueStatus: vi.fn(),
}));

// Mock shared logger
vi.mock('@valuerank/shared', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { getQueueStatus } from '../../../src/services/queue/status.js';

describe('Queue Health Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getQueueHealth', () => {
    it('returns healthy status when queue is running', async () => {
      vi.mocked(getQueueStatus).mockResolvedValue({
        isRunning: true,
        isPaused: false,
        jobTypes: [
          { type: 'probe_scenario', pending: 5, active: 2, completed: 100, failed: 3 },
          { type: 'expand_scenarios', pending: 0, active: 0, completed: 50, failed: 1 },
        ],
        totals: { pending: 5, active: 2, completed: 150, failed: 4 },
      });

      const result = await getQueueHealth();

      expect(result.isHealthy).toBe(true);
      expect(result.isRunning).toBe(true);
      expect(result.isPaused).toBe(false);
      expect(result.pendingJobs).toBe(5);
      expect(result.activeJobs).toBe(2);
      expect(result.completedLast24h).toBe(150);
      expect(result.failedLast24h).toBe(4);
      expect(result.jobTypes).toHaveLength(2);
      expect(result.checkedAt).toBeInstanceOf(Date);
    });

    it('calculates success rate correctly', async () => {
      vi.mocked(getQueueStatus).mockResolvedValue({
        isRunning: true,
        isPaused: false,
        jobTypes: [],
        totals: { pending: 0, active: 0, completed: 90, failed: 10 },
      });

      const result = await getQueueHealth();

      // 90 completed / (90 + 10) = 0.9 = 90%
      expect(result.successRate).toBe(0.9);
    });

    it('returns null success rate when no jobs processed', async () => {
      vi.mocked(getQueueStatus).mockResolvedValue({
        isRunning: true,
        isPaused: false,
        jobTypes: [],
        totals: { pending: 0, active: 0, completed: 0, failed: 0 },
      });

      const result = await getQueueHealth();

      expect(result.successRate).toBeNull();
    });

    it('returns unhealthy when queue is not running', async () => {
      vi.mocked(getQueueStatus).mockResolvedValue({
        isRunning: false,
        isPaused: false,
        jobTypes: [],
        totals: { pending: 0, active: 0, completed: 0, failed: 0 },
      });

      const result = await getQueueHealth();

      expect(result.isHealthy).toBe(false);
      expect(result.isRunning).toBe(false);
    });

    it('considers paused queue as healthy (intentional state)', async () => {
      vi.mocked(getQueueStatus).mockResolvedValue({
        isRunning: true, // Queue process is running, just paused
        isPaused: true,
        jobTypes: [],
        totals: { pending: 10, active: 0, completed: 50, failed: 2 },
      });

      const result = await getQueueHealth();

      expect(result.isHealthy).toBe(true);
      expect(result.isPaused).toBe(true);
    });

    it('handles errors and returns unhealthy status', async () => {
      vi.mocked(getQueueStatus).mockRejectedValue(new Error('Database connection failed'));

      const result = await getQueueHealth();

      expect(result.isHealthy).toBe(false);
      expect(result.isRunning).toBe(false);
      expect(result.error).toBe('Database connection failed');
      expect(result.pendingJobs).toBe(0);
      expect(result.activeJobs).toBe(0);
      expect(result.jobTypes).toEqual([]);
    });

    it('handles non-Error exceptions', async () => {
      vi.mocked(getQueueStatus).mockRejectedValue('Unknown error string');

      const result = await getQueueHealth();

      expect(result.isHealthy).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });
});

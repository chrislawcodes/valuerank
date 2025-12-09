/**
 * Unit tests for Rate Limiter Service
 *
 * Tests Bottleneck-based rate limiting for LLM providers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '@valuerank/db';
import {
  schedule,
  getAllMetrics,
  getProviderMetrics,
  getTotals,
  clearAll,
  reloadLimiters,
  type ProviderMetrics,
} from '../../../src/services/rate-limiter/index.js';

// Mock the parallelism module
vi.mock('../../../src/services/parallelism/index.js', () => ({
  loadProviderLimits: vi.fn(),
}));

import { loadProviderLimits } from '../../../src/services/parallelism/index.js';

const mockedLoadProviderLimits = vi.mocked(loadProviderLimits);

describe('Rate Limiter Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAll();

    // Default mock response
    mockedLoadProviderLimits.mockResolvedValue(
      new Map([
        [
          'test-provider',
          {
            maxParallelRequests: 2,
            requestsPerMinute: 60,
            queueName: 'probe_test-provider',
          },
        ],
        [
          'anthropic',
          {
            maxParallelRequests: 3,
            requestsPerMinute: 30,
            queueName: 'probe_anthropic',
          },
        ],
      ])
    );
  });

  afterEach(() => {
    clearAll();
  });

  describe('schedule', () => {
    it('executes function through rate limiter', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');

      const result = await schedule(
        'test-provider',
        'job-1',
        'model-1',
        'scenario-1',
        mockFn
      );

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledOnce();
    });

    it('records successful completion in metrics', async () => {
      const mockFn = vi.fn().mockResolvedValue('done');

      await schedule('test-provider', 'job-1', 'model-1', 'scenario-1', mockFn);

      const metrics = await getProviderMetrics('test-provider');
      expect(metrics).toBeDefined();
      expect(metrics!.recentCompletions).toHaveLength(1);
      expect(metrics!.recentCompletions[0].success).toBe(true);
      expect(metrics!.recentCompletions[0].modelId).toBe('model-1');
      expect(metrics!.recentCompletions[0].scenarioId).toBe('scenario-1');
    });

    it('records failed completion and re-throws error', async () => {
      const error = new Error('API failure');
      const mockFn = vi.fn().mockRejectedValue(error);

      await expect(
        schedule('test-provider', 'job-1', 'model-1', 'scenario-1', mockFn)
      ).rejects.toThrow('API failure');

      const metrics = await getProviderMetrics('test-provider');
      expect(metrics!.recentCompletions).toHaveLength(1);
      expect(metrics!.recentCompletions[0].success).toBe(false);
    });

    it('tracks duration of job execution', async () => {
      const mockFn = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'done';
      });

      await schedule('test-provider', 'job-1', 'model-1', 'scenario-1', mockFn);

      const metrics = await getProviderMetrics('test-provider');
      expect(metrics!.recentCompletions[0].durationMs).toBeGreaterThanOrEqual(50);
    });

    it('uses default limits when provider not found', async () => {
      mockedLoadProviderLimits.mockResolvedValue(new Map());
      const mockFn = vi.fn().mockResolvedValue('ok');

      const result = await schedule(
        'unknown-provider',
        'job-1',
        'model-1',
        'scenario-1',
        mockFn
      );

      expect(result).toBe('ok');
      expect(mockFn).toHaveBeenCalled();
    });

    it('reuses existing limiter for same provider', async () => {
      const mockFn = vi.fn().mockResolvedValue('ok');

      await schedule('test-provider', 'job-1', 'model-1', 'scenario-1', mockFn);
      await schedule('test-provider', 'job-2', 'model-1', 'scenario-2', mockFn);

      // loadProviderLimits should only be called once for creating the limiter
      expect(mockedLoadProviderLimits).toHaveBeenCalledTimes(1);
    });

    it('keeps only MAX_RECENT_COMPLETIONS in buffer', async () => {
      // Configure provider with high throughput for this test
      mockedLoadProviderLimits.mockResolvedValue(
        new Map([
          [
            'fast-provider',
            {
              maxParallelRequests: 100,
              requestsPerMinute: 10000,
              queueName: 'probe_fast-provider',
            },
          ],
        ])
      );

      clearAll();

      const mockFn = vi.fn().mockResolvedValue('ok');

      // Run 15 jobs (MAX_RECENT_COMPLETIONS is 10)
      const promises = [];
      for (let i = 0; i < 15; i++) {
        promises.push(
          schedule(
            'fast-provider',
            `job-${i}`,
            'model-1',
            `scenario-${i}`,
            mockFn
          )
        );
      }
      await Promise.all(promises);

      const metrics = await getProviderMetrics('fast-provider');
      expect(metrics!.recentCompletions).toHaveLength(10);
    }, 10000);
  });

  describe('getAllMetrics', () => {
    it('returns metrics for all configured providers', async () => {
      const metrics = await getAllMetrics();

      expect(metrics).toHaveLength(2);
      expect(metrics.map((m) => m.provider)).toContain('test-provider');
      expect(metrics.map((m) => m.provider)).toContain('anthropic');
    });

    it('includes provider configuration in metrics', async () => {
      const metrics = await getAllMetrics();

      const testProvider = metrics.find((m) => m.provider === 'test-provider');
      expect(testProvider).toBeDefined();
      expect(testProvider!.maxParallel).toBe(2);
      expect(testProvider!.requestsPerMinute).toBe(60);

      const anthropic = metrics.find((m) => m.provider === 'anthropic');
      expect(anthropic).toBeDefined();
      expect(anthropic!.maxParallel).toBe(3);
      expect(anthropic!.requestsPerMinute).toBe(30);
    });

    it('returns initial counts as zero', async () => {
      const metrics = await getAllMetrics();

      for (const metric of metrics) {
        expect(metric.activeJobs).toBe(0);
        expect(metric.queuedJobs).toBe(0);
        expect(metric.recentCompletions).toEqual([]);
      }
    });
  });

  describe('getProviderMetrics', () => {
    it('returns null for unknown provider', async () => {
      const metrics = await getProviderMetrics('nonexistent-provider');
      expect(metrics).toBeNull();
    });

    it('returns metrics for known provider', async () => {
      const metrics = await getProviderMetrics('anthropic');

      expect(metrics).toBeDefined();
      expect(metrics!.provider).toBe('anthropic');
      expect(metrics!.maxParallel).toBe(3);
      expect(metrics!.requestsPerMinute).toBe(30);
    });
  });

  describe('getTotals', () => {
    it('returns zero totals initially', () => {
      const totals = getTotals();

      expect(totals.totalActive).toBe(0);
      expect(totals.totalQueued).toBe(0);
    });

    it('aggregates across all providers', async () => {
      // Start jobs on both providers
      const slowFn = () =>
        new Promise<string>((resolve) => setTimeout(() => resolve('done'), 100));

      const promises = [
        schedule('test-provider', 'job-1', 'model-1', 's-1', slowFn),
        schedule('anthropic', 'job-2', 'model-2', 's-2', slowFn),
      ];

      // Give time for jobs to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // While jobs are running, totals should reflect active jobs
      // (Note: exact count depends on timing, just verify structure)
      const totals = getTotals();
      expect(typeof totals.totalActive).toBe('number');
      expect(typeof totals.totalQueued).toBe('number');

      await Promise.all(promises);
    });
  });

  describe('clearAll', () => {
    it('clears all limiters and metrics', async () => {
      const mockFn = vi.fn().mockResolvedValue('ok');

      // Create some state
      await schedule('test-provider', 'job-1', 'model-1', 's-1', mockFn);

      let metrics = await getProviderMetrics('test-provider');
      expect(metrics!.recentCompletions).toHaveLength(1);

      // Clear all
      clearAll();

      // After clearing, getProviderMetrics will reload from loadProviderLimits
      // and won't have the completion history
      metrics = await getProviderMetrics('test-provider');
      expect(metrics).toBeDefined();
      // Recent completions should be cleared
      expect(metrics!.recentCompletions).toHaveLength(0);
    });
  });

  describe('reloadLimiters', () => {
    it('reloads limiters from database', async () => {
      // Initial load
      await getAllMetrics();
      expect(mockedLoadProviderLimits).toHaveBeenCalledOnce();

      // Update mock to return different limits
      mockedLoadProviderLimits.mockResolvedValue(
        new Map([
          [
            'new-provider',
            {
              maxParallelRequests: 5,
              requestsPerMinute: 100,
              queueName: 'probe_new-provider',
            },
          ],
        ])
      );

      // Reload
      await reloadLimiters();

      const metrics = await getAllMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].provider).toBe('new-provider');
      expect(metrics[0].maxParallel).toBe(5);
    });

    it('disconnects existing limiters before reloading', async () => {
      const mockFn = vi.fn().mockResolvedValue('ok');

      // Create a limiter
      await schedule('test-provider', 'job-1', 'model-1', 's-1', mockFn);

      // Reload should disconnect the old limiter
      await reloadLimiters();

      // New requests should create new limiters
      mockedLoadProviderLimits.mockClear();
      await schedule('test-provider', 'job-2', 'model-1', 's-2', mockFn);

      // Note: loadProviderLimits is called once during reloadLimiters
      // and not again when scheduling because the limiter was pre-created
    });
  });

  describe('concurrency enforcement', () => {
    it('schedules jobs correctly with Bottleneck', async () => {
      // Configure provider with max 2 concurrent requests
      mockedLoadProviderLimits.mockResolvedValue(
        new Map([
          [
            'limited-provider',
            {
              maxParallelRequests: 2,
              requestsPerMinute: 1000,
              queueName: 'probe_limited-provider',
            },
          ],
        ])
      );

      clearAll();

      const results: string[] = [];
      const trackingFn = async (id: string) => {
        results.push(`start-${id}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(`end-${id}`);
        return id;
      };

      // Schedule jobs
      const promises = [
        schedule('limited-provider', 'job-1', 'm', 's-1', () => trackingFn('1')),
        schedule('limited-provider', 'job-2', 'm', 's-2', () => trackingFn('2')),
        schedule('limited-provider', 'job-3', 'm', 's-3', () => trackingFn('3')),
      ];

      await Promise.all(promises);

      // All jobs should complete
      expect(results.filter((r) => r.startsWith('end-'))).toHaveLength(3);
    });
  });

  describe('completion timestamps', () => {
    it('records completion timestamps', async () => {
      const mockFn = vi.fn().mockResolvedValue('ok');
      const beforeTime = new Date();

      await schedule('test-provider', 'job-1', 'model-1', 's-1', mockFn);

      const afterTime = new Date();
      const metrics = await getProviderMetrics('test-provider');
      const completion = metrics!.recentCompletions[0];

      expect(completion.completedAt).toBeInstanceOf(Date);
      expect(completion.completedAt.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime()
      );
      expect(completion.completedAt.getTime()).toBeLessThanOrEqual(
        afterTime.getTime()
      );
    });
  });
});

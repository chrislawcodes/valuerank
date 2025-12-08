/**
 * Worker Health Service Tests
 *
 * Tests for Python worker health checks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getWorkerHealth,
  clearWorkerHealthCache,
  type WorkerHealthStatus,
} from '../../../src/services/health/workers.js';

// Mock the spawn module
vi.mock('../../../src/queue/spawn.js', () => ({
  spawnPython: vi.fn(),
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

import { spawnPython } from '../../../src/queue/spawn.js';

describe('Worker Health Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearWorkerHealthCache();
  });

  describe('getWorkerHealth', () => {
    it('returns healthy status when Python worker is operational', async () => {
      vi.mocked(spawnPython).mockResolvedValue({
        success: true,
        data: {
          success: true,
          health: {
            pythonVersion: '3.11.5',
            packages: {
              requests: '2.31.0',
              pyyaml: '6.0.1',
            },
            apiKeys: {
              openai: true,
              anthropic: true,
              google: false,
            },
            warnings: [],
          },
        },
        stderr: '',
      });

      const result = await getWorkerHealth();

      expect(result.isHealthy).toBe(true);
      expect(result.pythonVersion).toBe('3.11.5');
      expect(result.packages).toEqual({
        requests: '2.31.0',
        pyyaml: '6.0.1',
      });
      expect(result.apiKeys.openai).toBe(true);
      expect(result.apiKeys.anthropic).toBe(true);
      expect(result.apiKeys.google).toBe(false);
      expect(result.warnings).toEqual([]);
      expect(result.checkedAt).toBeInstanceOf(Date);
    });

    it('returns warnings when present', async () => {
      vi.mocked(spawnPython).mockResolvedValue({
        success: true,
        data: {
          success: true,
          health: {
            pythonVersion: '3.10.0',
            packages: {},
            apiKeys: {},
            warnings: ['Python 3.11+ recommended', 'Missing optional package: pandas'],
          },
        },
        stderr: '',
      });

      const result = await getWorkerHealth();

      expect(result.isHealthy).toBe(true);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings).toContain('Python 3.11+ recommended');
    });

    it('handles spawn failure', async () => {
      vi.mocked(spawnPython).mockResolvedValue({
        success: false,
        error: 'Python not found in PATH',
        data: null,
        stderr: 'python3: command not found',
      });

      const result = await getWorkerHealth();

      expect(result.isHealthy).toBe(false);
      expect(result.pythonVersion).toBeNull();
      expect(result.error).toBe('Python not found in PATH');
    });

    it('handles health check script returning error', async () => {
      vi.mocked(spawnPython).mockResolvedValue({
        success: true,
        data: {
          success: false,
          error: {
            message: 'Missing required packages',
            code: 'MISSING_DEPS',
            retryable: true,
          },
        },
        stderr: '',
      });

      const result = await getWorkerHealth();

      expect(result.isHealthy).toBe(false);
      expect(result.error).toBe('Missing required packages');
    });

    it('handles missing health data in response', async () => {
      vi.mocked(spawnPython).mockResolvedValue({
        success: true,
        data: {
          success: true,
          // health field missing
        },
        stderr: '',
      });

      const result = await getWorkerHealth();

      expect(result.isHealthy).toBe(false);
      expect(result.error).toBe('No health data returned');
    });

    it('handles exception during health check', async () => {
      vi.mocked(spawnPython).mockRejectedValue(new Error('Timeout waiting for Python'));

      const result = await getWorkerHealth();

      expect(result.isHealthy).toBe(false);
      expect(result.error).toBe('Timeout waiting for Python');
    });

    it('handles non-Error exceptions', async () => {
      vi.mocked(spawnPython).mockRejectedValue('Unknown failure');

      const result = await getWorkerHealth();

      expect(result.isHealthy).toBe(false);
      expect(result.error).toBe('Unknown error');
    });

    it('caches results and returns cached data on subsequent calls', async () => {
      vi.mocked(spawnPython).mockResolvedValue({
        success: true,
        data: {
          success: true,
          health: {
            pythonVersion: '3.11.5',
            packages: {},
            apiKeys: {},
            warnings: [],
          },
        },
        stderr: '',
      });

      const result1 = await getWorkerHealth();
      const result2 = await getWorkerHealth();

      // Second call should use cache
      expect(spawnPython).toHaveBeenCalledTimes(1);
      expect(result1.checkedAt.getTime()).toBe(result2.checkedAt.getTime());
    });

    it('refreshes cache when forceRefresh is true', async () => {
      vi.mocked(spawnPython).mockResolvedValue({
        success: true,
        data: {
          success: true,
          health: {
            pythonVersion: '3.11.5',
            packages: {},
            apiKeys: {},
            warnings: [],
          },
        },
        stderr: '',
      });

      await getWorkerHealth();
      await new Promise((r) => setTimeout(r, 10));
      await getWorkerHealth(true);

      expect(spawnPython).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearWorkerHealthCache', () => {
    it('clears cache and forces new health check', async () => {
      vi.mocked(spawnPython).mockResolvedValue({
        success: true,
        data: {
          success: true,
          health: {
            pythonVersion: '3.11.5',
            packages: {},
            apiKeys: {},
            warnings: [],
          },
        },
        stderr: '',
      });

      await getWorkerHealth();
      clearWorkerHealthCache();
      await getWorkerHealth();

      expect(spawnPython).toHaveBeenCalledTimes(2);
    });
  });
});

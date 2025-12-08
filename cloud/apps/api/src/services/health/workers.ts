/**
 * Worker Health Service
 *
 * Checks health of Python workers by running the health_check.py script.
 * Results are cached to avoid repeated process spawns.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '@valuerank/shared';
import { spawnPython } from '../../queue/spawn.js';

const log = createLogger('services:health:workers');

// Get absolute path to cloud/ directory (this file is at apps/api/src/services/health/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLOUD_DIR = path.resolve(__dirname, '../../../../..');

export type WorkerHealthStatus = {
  isHealthy: boolean;
  pythonVersion: string | null;
  packages: Record<string, string>;
  apiKeys: Record<string, boolean>;
  warnings: string[];
  error?: string;
  checkedAt: Date;
};

// Health check output structure from Python
type HealthCheckOutput = {
  success: boolean;
  health?: {
    pythonVersion: string;
    packages: Record<string, string>;
    apiKeys: Record<string, boolean>;
    warnings: string[];
  };
  error?: { message: string; code: string; retryable: boolean };
};

// Cache health check results for 30 seconds (short for responsive UI)
const CACHE_TTL_MS = 30 * 1000;
let cachedResult: WorkerHealthStatus | null = null;
let cacheTimestamp = 0;

// Path to health check script (relative to cloud/ directory)
const HEALTH_CHECK_PATH = 'workers/health_check.py';

/**
 * Get health status for Python workers.
 * Results are cached for 10 minutes to avoid excessive process spawns.
 */
export async function getWorkerHealth(forceRefresh = false): Promise<WorkerHealthStatus> {
  const now = Date.now();

  // Return cached result if still valid
  if (!forceRefresh && cachedResult && now - cacheTimestamp < CACHE_TTL_MS) {
    log.debug('Returning cached worker health');
    return cachedResult;
  }

  log.info('Checking worker health');

  try {
    log.info({ cloudDir: CLOUD_DIR, script: HEALTH_CHECK_PATH }, 'Spawning health check');

    const result = await spawnPython<Record<string, never>, HealthCheckOutput>(
      HEALTH_CHECK_PATH,
      {},
      {
        cwd: CLOUD_DIR,
        timeout: 15000, // 15 second timeout
      }
    );

    if (!result.success) {
      log.error({ error: result.error, stderr: result.stderr }, 'Failed to spawn health check');

      const healthStatus: WorkerHealthStatus = {
        isHealthy: false,
        pythonVersion: null,
        packages: {},
        apiKeys: {},
        warnings: [],
        error: result.error,
        checkedAt: new Date(),
      };

      cachedResult = healthStatus;
      cacheTimestamp = now;
      return healthStatus;
    }

    const output = result.data;

    if (!output.success) {
      log.warn({ error: output.error }, 'Health check returned error');

      const healthStatus: WorkerHealthStatus = {
        isHealthy: false,
        pythonVersion: null,
        packages: {},
        apiKeys: {},
        warnings: [],
        error: output.error?.message ?? 'Unknown error',
        checkedAt: new Date(),
      };

      cachedResult = healthStatus;
      cacheTimestamp = now;
      return healthStatus;
    }

    const health = output.health;
    if (!health) {
      const healthStatus: WorkerHealthStatus = {
        isHealthy: false,
        pythonVersion: null,
        packages: {},
        apiKeys: {},
        warnings: [],
        error: 'No health data returned',
        checkedAt: new Date(),
      };

      cachedResult = healthStatus;
      cacheTimestamp = now;
      return healthStatus;
    }

    const healthStatus: WorkerHealthStatus = {
      isHealthy: true,
      pythonVersion: health.pythonVersion,
      packages: health.packages,
      apiKeys: health.apiKeys,
      warnings: health.warnings,
      checkedAt: new Date(),
    };

    log.info(
      {
        pythonVersion: health.pythonVersion,
        packageCount: Object.keys(health.packages).length,
        configuredProviders: Object.entries(health.apiKeys)
          .filter(([, v]) => v)
          .map(([k]) => k),
        warningCount: health.warnings.length,
      },
      'Worker health check complete'
    );

    cachedResult = healthStatus;
    cacheTimestamp = now;
    return healthStatus;
  } catch (error) {
    log.error({ error }, 'Worker health check failed');

    const healthStatus: WorkerHealthStatus = {
      isHealthy: false,
      pythonVersion: null,
      packages: {},
      apiKeys: {},
      warnings: [],
      error: error instanceof Error ? error.message : 'Unknown error',
      checkedAt: new Date(),
    };

    cachedResult = healthStatus;
    cacheTimestamp = now;
    return healthStatus;
  }
}

/**
 * Clear the health check cache.
 * Useful for testing or forcing immediate re-check.
 */
export function clearWorkerHealthCache(): void {
  cachedResult = null;
  cacheTimestamp = 0;
}

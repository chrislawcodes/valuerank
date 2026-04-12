/**
 * Python worker health check.
 *
 * Runs once per process lifetime (lazy initialization) to verify
 * the Python environment is operational before probe jobs start.
 */

import path from 'path';
import { createLogger } from '@valuerank/shared';
import { spawnPython } from '../../spawn.js';

const log = createLogger('queue:probe-scenario');

const HEALTH_CHECK_PATH = 'workers/health_check.py';

/**
 * Health check output structure.
 */
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

// Health check cache - verified once per process lifetime
let healthCheckDone = false;
let healthCheckPromise: Promise<void> | null = null;

/**
 * Run health check on first probe job (lazy initialization).
 * Caches result to avoid repeated checks.
 */
export async function ensureHealthCheck(): Promise<void> {
  // Already verified
  if (healthCheckDone) {
    return;
  }

  // Health check in progress - wait for it
  if (healthCheckPromise !== null) {
    return healthCheckPromise;
  }

  // Start health check
  healthCheckPromise = (async () => {
    log.info('Running Python worker health check');

    const result = await spawnPython<Record<string, never>, HealthCheckOutput>(
      HEALTH_CHECK_PATH,
      {},
      { cwd: path.resolve(process.cwd(), '../..'), timeout: 10000 }
    );

    if (!result.success) {
      log.error({ error: result.error, stderr: result.stderr }, 'Health check failed');
      throw new Error(`Python health check failed: ${result.error}`);
    }

    const output = result.data;
    if (!output.success) {
      log.error({ error: output.error }, 'Health check returned error');
      throw new Error(`Python health check error: ${output.error?.message}`);
    }

    // Log health status
    const health = output.health;
    if (health !== undefined) {
      log.info(
        {
          pythonVersion: health.pythonVersion,
          packages: Object.keys(health.packages).length,
          apiKeys: Object.fromEntries(
            Object.entries(health.apiKeys).filter(([, v]) => v)
          ),
        },
        'Python worker health check passed'
      );

      // Log warnings
      for (const warning of health.warnings) {
        log.warn({ warning }, 'Python worker health warning');
      }
    }

    healthCheckDone = true;
  })();

  return healthCheckPromise;
}

/**
 * Reset health check cache (for testing).
 */
export function resetHealthCheck(): void {
  healthCheckDone = false;
  healthCheckPromise = null;
}

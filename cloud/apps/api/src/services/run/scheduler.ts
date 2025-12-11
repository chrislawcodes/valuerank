/**
 * Run Recovery Scheduler
 *
 * Manages the periodic recovery job that detects and recovers orphaned runs.
 * Uses setInterval for simplicity - PgBoss schedule() is for distributed cron,
 * but we only need one instance running recovery.
 *
 * Activity-based scheduling:
 * - Recovery only runs for 1 hour after the last run was started
 * - When a new run starts, the activity timeout is reset
 * - This prevents wasting resources checking for orphaned runs when no runs are active
 */

import { createLogger } from '@valuerank/shared';
import { recoverOrphanedRuns, RECOVERY_INTERVAL_MS, runStartupRecovery } from './recovery.js';

const log = createLogger('services:run:scheduler');

let recoveryInterval: NodeJS.Timeout | null = null;
let activityTimeout: NodeJS.Timeout | null = null;
let isRecovering = false;

// How long to keep recovery running after the last run was started (1 hour)
export const RECOVERY_ACTIVITY_WINDOW_MS = 60 * 60 * 1000;

/**
 * Runs the recovery job, preventing concurrent executions.
 */
async function runRecoveryJob(): Promise<void> {
  if (isRecovering) {
    log.debug('Recovery already in progress, skipping');
    return;
  }

  isRecovering = true;
  try {
    const result = await recoverOrphanedRuns();

    if (result.detected.length > 0 || result.errors.length > 0) {
      log.info(
        {
          detected: result.detected.length,
          recovered: result.recovered.length,
          errors: result.errors.length,
        },
        'Recovery job completed'
      );
    }
  } catch (error) {
    log.error({ error }, 'Recovery job failed');
  } finally {
    isRecovering = false;
  }
}

/**
 * Clears the activity timeout if set.
 */
function clearActivityTimeout(): void {
  if (activityTimeout) {
    clearTimeout(activityTimeout);
    activityTimeout = null;
  }
}

/**
 * Starts the activity timeout that will stop recovery after RECOVERY_ACTIVITY_WINDOW_MS.
 */
function startActivityTimeout(): void {
  clearActivityTimeout();

  activityTimeout = setTimeout(() => {
    log.info(
      { windowMs: RECOVERY_ACTIVITY_WINDOW_MS },
      'Activity window expired, stopping recovery scheduler'
    );
    stopRecoveryInterval();
  }, RECOVERY_ACTIVITY_WINDOW_MS);
}

/**
 * Stops only the recovery interval (not the activity tracking).
 */
function stopRecoveryInterval(): void {
  if (recoveryInterval) {
    clearInterval(recoveryInterval);
    recoveryInterval = null;
    log.info('Recovery interval stopped');
  }
}

/**
 * Starts the recovery interval if not already running.
 */
function startRecoveryInterval(): void {
  if (recoveryInterval) {
    return; // Already running
  }

  recoveryInterval = setInterval(runRecoveryJob, RECOVERY_INTERVAL_MS);
  log.info({ intervalMs: RECOVERY_INTERVAL_MS }, 'Recovery interval started');
}

/**
 * Signals that a run has been started.
 * This resets the activity window and ensures recovery is running.
 */
export function signalRunActivity(): void {
  log.debug('Run activity signaled, resetting activity window');

  // Ensure recovery is running
  startRecoveryInterval();

  // Reset the activity timeout
  startActivityTimeout();
}

/**
 * Starts the recovery scheduler.
 * Runs recovery immediately on startup, then schedules periodic recovery
 * only if there are active runs (detected during startup recovery).
 */
export async function startRecoveryScheduler(): Promise<void> {
  if (recoveryInterval) {
    log.warn('Recovery scheduler already running');
    return;
  }

  log.info(
    { intervalMs: RECOVERY_INTERVAL_MS, activityWindowMs: RECOVERY_ACTIVITY_WINDOW_MS },
    'Starting recovery scheduler'
  );

  // Run startup recovery first
  let hasActiveRuns = false;
  try {
    const startupResult = await runStartupRecovery();
    if (startupResult.detected.length > 0) {
      log.info(
        {
          detected: startupResult.detected.length,
          recovered: startupResult.recovered.length,
          errors: startupResult.errors.length,
        },
        'Startup recovery completed'
      );
      // If we found orphaned runs, keep recovery running
      hasActiveRuns = true;
    }
  } catch (error) {
    log.error({ error }, 'Startup recovery failed');
    // Don't throw - we still want to proceed
  }

  // Only start the interval if we found active runs during startup
  if (hasActiveRuns) {
    startRecoveryInterval();
    startActivityTimeout();
    log.info('Recovery scheduler started (active runs detected)');
  } else {
    log.info('Recovery scheduler initialized but not running (no active runs)');
  }
}

/**
 * Stops the recovery scheduler completely (interval and activity timeout).
 */
export function stopRecoveryScheduler(): void {
  stopRecoveryInterval();
  clearActivityTimeout();
  log.info('Recovery scheduler stopped');
}

/**
 * Checks if the recovery scheduler is running.
 */
export function isRecoverySchedulerRunning(): boolean {
  return recoveryInterval !== null;
}

/**
 * Manually triggers a recovery run (for debugging/admin).
 */
export async function triggerRecovery(): Promise<{
  detected: number;
  recovered: number;
  errors: number;
}> {
  const result = await recoverOrphanedRuns();
  return {
    detected: result.detected.length,
    recovered: result.recovered.length,
    errors: result.errors.length,
  };
}

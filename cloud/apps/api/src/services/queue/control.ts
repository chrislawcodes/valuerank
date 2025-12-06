/**
 * Queue Control Service
 *
 * Provides global queue pause/resume functionality.
 */

import { createLogger } from '@valuerank/shared';
import { stopBoss, startBoss, isBossRunning } from '../../queue/boss.js';

const log = createLogger('services:queue:control');

// In-memory state for queue pause status
// This could be persisted to database for multi-instance deployments
let queuePaused = false;

/**
 * Checks if the queue is currently paused.
 */
export function isQueuePaused(): boolean {
  return queuePaused;
}

/**
 * Pauses the global queue, stopping all job processing.
 *
 * Jobs will continue to be queued but will not be processed
 * until the queue is resumed.
 */
export async function pauseQueue(): Promise<{
  isRunning: boolean;
  isPaused: boolean;
}> {
  log.info('Pausing global queue');

  if (queuePaused) {
    log.debug('Queue already paused');
    return { isRunning: false, isPaused: true };
  }

  try {
    await stopBoss();
    queuePaused = true;

    log.info('Global queue paused');
    return { isRunning: false, isPaused: true };
  } catch (error) {
    log.error({ error }, 'Failed to pause queue');
    throw error;
  }
}

/**
 * Resumes the global queue, restarting job processing.
 */
export async function resumeQueue(): Promise<{
  isRunning: boolean;
  isPaused: boolean;
}> {
  log.info('Resuming global queue');

  if (!queuePaused) {
    log.debug('Queue not paused');
    return { isRunning: isBossRunning(), isPaused: false };
  }

  try {
    await startBoss();
    queuePaused = false;

    log.info('Global queue resumed');
    return { isRunning: true, isPaused: false };
  } catch (error) {
    log.error({ error }, 'Failed to resume queue');
    throw error;
  }
}

/**
 * Gets current queue running/paused state.
 */
export function getQueueState(): { isRunning: boolean; isPaused: boolean } {
  return {
    isRunning: isBossRunning() && !queuePaused,
    isPaused: queuePaused,
  };
}

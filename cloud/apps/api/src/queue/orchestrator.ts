/**
 * Queue Orchestrator
 *
 * Manages job worker lifecycle and provides queue control operations.
 */

import { createLogger } from '@valuerank/shared';
import { getBoss, startBoss, stopBoss } from './boss.js';
import { registerHandlers, getJobTypes } from './handlers/index.js';

const log = createLogger('queue:orchestrator');

let isRunning = false;
let isPaused = false;

/**
 * Starts the queue orchestrator.
 * Initializes PgBoss and registers all job handlers.
 */
export async function startOrchestrator(): Promise<void> {
  if (isRunning) {
    log.warn('Orchestrator already running');
    return;
  }

  log.info('Starting queue orchestrator');

  // Start PgBoss
  await startBoss();

  // Register all handlers
  const boss = getBoss();
  await registerHandlers(boss);

  isRunning = true;
  isPaused = false;

  log.info({ jobTypes: getJobTypes() }, 'Queue orchestrator started');
}

/**
 * Stops the queue orchestrator gracefully.
 * Completes in-flight jobs before stopping.
 */
export async function stopOrchestrator(): Promise<void> {
  if (!isRunning) {
    log.warn('Orchestrator not running');
    return;
  }

  log.info('Stopping queue orchestrator');

  await stopBoss();
  isRunning = false;
  isPaused = false;

  log.info('Queue orchestrator stopped');
}

/**
 * Pauses the queue - stops picking up new jobs.
 * In-flight jobs will complete.
 */
export async function pauseQueue(): Promise<void> {
  if (!isRunning) {
    log.warn('Cannot pause - orchestrator not running');
    return;
  }

  if (isPaused) {
    log.debug('Queue already paused');
    return;
  }

  log.info('Pausing queue');

  const boss = getBoss();
  // Stop workers by unsubscribing from all job types
  for (const jobType of getJobTypes()) {
    await boss.offWork(jobType);
  }

  isPaused = true;
  log.info('Queue paused');
}

/**
 * Resumes the queue - starts picking up jobs again.
 */
export async function resumeQueue(): Promise<void> {
  if (!isRunning) {
    log.warn('Cannot resume - orchestrator not running');
    return;
  }

  if (!isPaused) {
    log.debug('Queue not paused');
    return;
  }

  log.info('Resuming queue');

  const boss = getBoss();
  await registerHandlers(boss);

  isPaused = false;
  log.info('Queue resumed');
}

/**
 * Returns current orchestrator state.
 */
export function getOrchestratorState(): { isRunning: boolean; isPaused: boolean } {
  return { isRunning, isPaused };
}

/**
 * Checks if orchestrator is running.
 */
export function isOrchestratorRunning(): boolean {
  return isRunning;
}

/**
 * Checks if queue is paused.
 */
export function isQueuePaused(): boolean {
  return isPaused;
}

/**
 * Queue Control Service
 *
 * Thin adapter over the queue orchestrator for pause/resume operations.
 * The orchestrator is the single source of truth for queue pause state.
 */

import { createLogger } from '@valuerank/shared';
import { isBossRunning } from '../../queue/boss.js';
import {
  pauseQueue as orchestratorPause,
  resumeQueue as orchestratorResume,
  isQueuePaused as orchestratorIsPaused,
  getOrchestratorState,
} from '../../queue/orchestrator.js';

const log = createLogger('services:queue:control');

function getDerivedQueueState(): { isRunning: boolean; isPaused: boolean } {
  const state = getOrchestratorState();
  return {
    isRunning: isBossRunning() && !state.isPaused,
    isPaused: state.isPaused,
  };
}

/**
 * Checks if the queue is currently paused.
 */
export function isQueuePaused(): boolean {
  return orchestratorIsPaused();
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
  log.info({}, 'Pausing global queue');
  await orchestratorPause();
  const state = getDerivedQueueState();
  log.info({ isRunning: state.isRunning, isPaused: state.isPaused }, 'Global queue paused');
  return state;
}

/**
 * Resumes the global queue, restarting job processing.
 */
export async function resumeQueue(): Promise<{
  isRunning: boolean;
  isPaused: boolean;
}> {
  log.info({}, 'Resuming global queue');
  await orchestratorResume();
  const state = getDerivedQueueState();
  log.info({ isRunning: state.isRunning, isPaused: state.isPaused }, 'Global queue resumed');
  return state;
}

/**
 * Gets current queue running/paused state.
 */
export function getQueueState(): { isRunning: boolean; isPaused: boolean } {
  return getDerivedQueueState();
}

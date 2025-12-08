/**
 * Queue Health Service
 *
 * Provides health status for the PgBoss job queue.
 * Wraps the existing queue status service with health-focused metrics.
 */

import { createLogger } from '@valuerank/shared';
import { getQueueStatus, type QueueStatus } from '../queue/status.js';

const log = createLogger('services:health:queue');

export type JobTypeStatus = {
  type: string;
  pending: number;
  active: number;
  completed: number;
  failed: number;
};

export type QueueHealthStatus = {
  isHealthy: boolean;
  isRunning: boolean;
  isPaused: boolean;
  activeJobs: number;
  pendingJobs: number;
  completedLast24h: number;
  failedLast24h: number;
  successRate: number | null; // null if no jobs completed
  jobTypes: JobTypeStatus[];
  error?: string;
  checkedAt: Date;
};

/**
 * Get health status for the job queue.
 * Provides a health-focused view of queue metrics.
 */
export async function getQueueHealth(): Promise<QueueHealthStatus> {
  log.debug('Checking queue health');

  try {
    const status: QueueStatus = await getQueueStatus();

    const activeJobs = status.totals.active;
    const pendingJobs = status.totals.pending;
    const completedLast24h = status.totals.completed;
    const failedLast24h = status.totals.failed;

    // Calculate success rate (completed / (completed + failed))
    const totalProcessed = completedLast24h + failedLast24h;
    const successRate = totalProcessed > 0 ? completedLast24h / totalProcessed : null;

    // Queue is healthy if it's running and not in an error state
    // Being paused is not unhealthy - it's an intentional state
    const isHealthy = status.isRunning;

    log.debug(
      {
        isHealthy,
        isRunning: status.isRunning,
        isPaused: status.isPaused,
        activeJobs,
        pendingJobs,
      },
      'Queue health checked'
    );

    return {
      isHealthy,
      isRunning: status.isRunning,
      isPaused: status.isPaused,
      activeJobs,
      pendingJobs,
      completedLast24h,
      failedLast24h,
      successRate,
      jobTypes: status.jobTypes,
      checkedAt: new Date(),
    };
  } catch (error) {
    log.error({ error }, 'Failed to check queue health');

    return {
      isHealthy: false,
      isRunning: false,
      isPaused: false,
      activeJobs: 0,
      pendingJobs: 0,
      completedLast24h: 0,
      failedLast24h: 0,
      successRate: null,
      jobTypes: [],
      error: error instanceof Error ? error.message : 'Unknown error',
      checkedAt: new Date(),
    };
  }
}

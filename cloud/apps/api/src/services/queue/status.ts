/**
 * Queue Status Service
 *
 * Provides queue health information by querying PgBoss job tables.
 */

import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import {
  ACTIVE_PROBE_QUEUE_SQL,
  LEGACY_PROBE_QUEUE_NAME,
  normalizeProbeQueueName,
} from './probe-queues.js';
import { getQueueState } from './control.js';

const log = createLogger('services:queue:status');

export type JobTypeStatus = {
  type: string;
  pending: number;
  active: number;
  completed: number;
  failed: number;
};

export type QueueStatus = {
  isRunning: boolean;
  isPaused: boolean;
  jobTypes: JobTypeStatus[];
  completedLast30m: number;
  totals: {
    pending: number;
    active: number;
    completed: number;
    failed: number;
  };
};

/**
 * Gets current queue status with job counts by type and state.
 */
export async function getQueueStatus(): Promise<QueueStatus> {
  log.debug('Fetching queue status');

  try {
    // Query PgBoss job table for counts by type and state
    const jobCounts = await db.$queryRaw<Array<{
      name: string;
      state: string;
      count: bigint;
    }>>`
      SELECT name, state, COUNT(*) as count
      FROM pgboss.job
      WHERE (${ACTIVE_PROBE_QUEUE_SQL} OR name IN ('summarize_transcript', 'analyze_basic', 'analyze_deep', 'expand_scenarios'))
      GROUP BY name, state
    `;

    const completedLast30mResult = await db.$queryRaw<Array<{
      count: bigint;
    }>>`
      SELECT COUNT(*) as count
      FROM pgboss.job
      WHERE state = 'completed'
        AND completedon >= NOW() - INTERVAL '30 minutes'
        AND (${ACTIVE_PROBE_QUEUE_SQL} OR name IN ('summarize_transcript', 'analyze_basic', 'analyze_deep', 'expand_scenarios'))
    `;

    // Note: PgBoss v10+ no longer uses a separate archive table.
    // All jobs (including completed/failed) stay in pgboss.job with different states.

    // Organize by job type
    const jobTypeMap = new Map<string, JobTypeStatus>();
    const knownTypes = [
      LEGACY_PROBE_QUEUE_NAME,
      'summarize_transcript',
      'analyze_basic',
      'analyze_deep',
      'expand_scenarios',
    ];

    // Initialize all known types
    for (const type of knownTypes) {
      jobTypeMap.set(type, {
        type,
        pending: 0,
        active: 0,
        completed: 0,
        failed: 0,
      });
    }

    // Process current job counts
    for (const row of jobCounts) {
      const status = jobTypeMap.get(normalizeProbeQueueName(row.name));
      if (status) {
        const count = Number(row.count);
        switch (row.state) {
          case 'created':
          case 'retry':
            status.pending += count;
            break;
          case 'active':
            status.active += count;
            break;
          case 'completed':
            status.completed += count;
            break;
          case 'failed':
          case 'expired':
          case 'cancelled':
            status.failed += count;
            break;
        }
      }
    }

    // Calculate totals
    const totals = { pending: 0, active: 0, completed: 0, failed: 0 };
    const jobTypes = Array.from(jobTypeMap.values());

    for (const jt of jobTypes) {
      totals.pending += jt.pending;
      totals.active += jt.active;
      totals.completed += jt.completed;
      totals.failed += jt.failed;
    }

    log.debug({ totals }, 'Queue status fetched');

    const state = getQueueState();
    return {
      isRunning: state.isRunning,
      isPaused: state.isPaused,
      jobTypes,
      completedLast30m: Number(completedLast30mResult?.[0]?.count ?? 0n),
      totals,
    };
  } catch (error) {
    // If PgBoss tables don't exist, return empty status
    log.warn({ error }, 'Failed to query queue status (tables may not exist)');

    const state = getQueueState();
    return {
      isRunning: state.isRunning,
      isPaused: state.isPaused,
      jobTypes: [
        { type: LEGACY_PROBE_QUEUE_NAME, pending: 0, active: 0, completed: 0, failed: 0 },
        { type: 'summarize_transcript', pending: 0, active: 0, completed: 0, failed: 0 },
        { type: 'analyze_basic', pending: 0, active: 0, completed: 0, failed: 0 },
        { type: 'analyze_deep', pending: 0, active: 0, completed: 0, failed: 0 },
        { type: 'expand_scenarios', pending: 0, active: 0, completed: 0, failed: 0 },
      ],
      completedLast30m: 0,
      totals: { pending: 0, active: 0, completed: 0, failed: 0 },
    };
  }
}

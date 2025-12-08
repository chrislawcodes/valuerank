/**
 * Queue Status Service
 *
 * Provides queue health information by querying PgBoss job tables.
 */

import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
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
      WHERE name IN ('probe_scenario', 'summarize_transcript', 'analyze_basic', 'analyze_deep', 'expand_scenarios')
      GROUP BY name, state
    `;

    // Also get archived job counts (completed/failed) - may not exist in all pgboss versions
    let archiveCounts: Array<{ name: string; state: string; count: bigint }> = [];
    try {
      archiveCounts = await db.$queryRaw<Array<{
        name: string;
        state: string;
        count: bigint;
      }>>`
        SELECT name, state, COUNT(*) as count
        FROM pgboss.archive
        WHERE name IN ('probe_scenario', 'summarize_transcript', 'analyze_basic', 'analyze_deep', 'expand_scenarios')
          AND archived_on > NOW() - INTERVAL '24 hours'
        GROUP BY name, state
      `;
    } catch {
      // Archive table may not exist - that's OK, just use job table
      log.debug('Archive table not available, using job table only');
    }

    // Combine and organize by job type
    const jobTypeMap = new Map<string, JobTypeStatus>();
    const knownTypes = ['probe_scenario', 'summarize_transcript', 'analyze_basic', 'analyze_deep', 'expand_scenarios'];

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
      const status = jobTypeMap.get(row.name);
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

    // Process archive counts (last 24 hours)
    for (const row of archiveCounts) {
      const status = jobTypeMap.get(row.name);
      if (status) {
        const count = Number(row.count);
        if (row.state === 'completed') {
          status.completed += count;
        } else if (['failed', 'expired', 'cancelled'].includes(row.state)) {
          status.failed += count;
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
        { type: 'probe_scenario', pending: 0, active: 0, completed: 0, failed: 0 },
        { type: 'summarize_transcript', pending: 0, active: 0, completed: 0, failed: 0 },
        { type: 'analyze_basic', pending: 0, active: 0, completed: 0, failed: 0 },
        { type: 'analyze_deep', pending: 0, active: 0, completed: 0, failed: 0 },
        { type: 'expand_scenarios', pending: 0, active: 0, completed: 0, failed: 0 },
      ],
      totals: { pending: 0, active: 0, completed: 0, failed: 0 },
    };
  }
}

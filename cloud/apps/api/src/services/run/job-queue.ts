/**
 * Job Queue Service
 *
 * Provides visibility into PgBoss job queue states for runs.
 * Used by MCP tools for diagnostics and operations.
 */

import { db } from '@valuerank/db';
import { createLogger, NotFoundError } from '@valuerank/shared';
import type { JobQueueStatus, JobQueueStatusOptions, JobFailure } from './types.js';

const log = createLogger('services:run:job-queue');

// PgBoss job state mapping
const PENDING_STATES = ['created', 'retry'];
const RUNNING_STATES = ['active'];
const COMPLETED_STATES = ['completed'];
const FAILED_STATES = ['failed'];

// Job types we track
const JOB_TYPES = ['probe_scenario', 'summarize_transcript', 'analyze_basic'] as const;

/**
 * Raw job count row from PgBoss query
 */
type JobCountRow = {
  name: string;
  state: string;
  count: bigint;
};

/**
 * Raw failed job row from PgBoss query
 */
type FailedJobRow = {
  id: string;
  name: string;
  data: Record<string, unknown>;
  output: Record<string, unknown> | null;
  completed_on: Date | null;
};

/**
 * Gets job queue status for a specific run.
 *
 * Queries PgBoss tables to return counts by job type and state.
 * Optionally includes recent failure details for debugging.
 *
 * @param runId - ID of the run to check
 * @param options - Query options
 * @returns Job queue status with counts and optional failures
 * @throws NotFoundError if run doesn't exist
 */
export async function getJobQueueStatus(
  runId: string,
  options: JobQueueStatusOptions = {}
): Promise<JobQueueStatus> {
  const { includeRecentFailures = false, failureLimit = 10 } = options;

  // Verify run exists
  const run = await db.run.findUnique({
    where: { id: runId },
    select: { id: true },
  });

  if (!run) {
    throw new NotFoundError('Run', runId);
  }

  // Initialize status
  const status: JobQueueStatus = {
    runId,
    byJobType: {},
    totalPending: 0,
    totalRunning: 0,
    totalCompleted: 0,
    totalFailed: 0,
  };

  try {
    // Query job counts from PgBoss
    // Note: probe_scenario jobs may have model-specific queue names like probe_scenario_openai
    const jobCounts = await db.$queryRaw<JobCountRow[]>`
      SELECT
        CASE
          WHEN name LIKE 'probe_scenario%' THEN 'probe_scenario'
          ELSE name
        END as name,
        state,
        COUNT(*) as count
      FROM pgboss.job
      WHERE (name LIKE 'probe_scenario%' OR name = 'summarize_transcript' OR name = 'analyze_basic')
        AND data->>'runId' = ${runId}
        AND state IN ('created', 'retry', 'active', 'completed', 'failed')
      GROUP BY
        CASE
          WHEN name LIKE 'probe_scenario%' THEN 'probe_scenario'
          ELSE name
        END,
        state
    `;

    // Process results into typed structure
    type MutableJobTypeCounts = { pending: number; running: number; completed: number; failed: number };
    const countsByType: Record<string, MutableJobTypeCounts> = {};

    for (const row of jobCounts) {
      const jobType = row.name;
      const state = row.state;
      const count = Number(row.count);

      // Initialize job type counts if not exists
      if (!countsByType[jobType]) {
        countsByType[jobType] = { pending: 0, running: 0, completed: 0, failed: 0 };
      }
      const typeCounts = countsByType[jobType];

      if (PENDING_STATES.includes(state)) {
        typeCounts.pending += count;
        status.totalPending += count;
      } else if (RUNNING_STATES.includes(state)) {
        typeCounts.running += count;
        status.totalRunning += count;
      } else if (COMPLETED_STATES.includes(state)) {
        typeCounts.completed += count;
        status.totalCompleted += count;
      } else if (FAILED_STATES.includes(state)) {
        typeCounts.failed += count;
        status.totalFailed += count;
      }
    }

    // Map to typed byJobType structure
    for (const jobType of JOB_TYPES) {
      const counts = countsByType[jobType];
      if (counts) {
        status.byJobType[jobType] = counts;
      }
    }

    // Optionally fetch recent failures
    if (includeRecentFailures) {
      status.recentFailures = await getRecentFailures(runId, failureLimit);
    }

    log.debug({ runId, status }, 'Job queue status retrieved');
    return status;
  } catch (err) {
    // Handle case where PgBoss tables don't exist
    if (err instanceof Error && err.message.includes('pgboss.job')) {
      log.warn({ runId }, 'PgBoss tables not found, returning empty status');
      return status;
    }
    throw err;
  }
}

/**
 * Gets recent failed jobs for a run.
 */
async function getRecentFailures(runId: string, limit: number): Promise<JobFailure[]> {
  try {
    const failedJobs = await db.$queryRaw<FailedJobRow[]>`
      SELECT
        id,
        name,
        data,
        output,
        completed_on
      FROM pgboss.job
      WHERE (name LIKE 'probe_scenario%' OR name = 'summarize_transcript' OR name = 'analyze_basic')
        AND data->>'runId' = ${runId}
        AND state = 'failed'
      ORDER BY completed_on DESC NULLS LAST
      LIMIT ${limit}
    `;

    return failedJobs.map((job) => {
      const data = job.data;
      const output = job.output;

      // Normalize job type name
      const jobType = job.name.startsWith('probe_scenario') ? 'probe_scenario' : job.name;

      // Extract error from output
      let error = 'Unknown error';
      if (output && typeof output === 'object') {
        if ('error' in output && typeof output.error === 'string') {
          error = output.error;
        } else if ('message' in output && typeof output.message === 'string') {
          error = output.message;
        }
      }

      return {
        jobId: job.id,
        jobType,
        error,
        failedAt: job.completed_on?.toISOString() ?? new Date().toISOString(),
        transcriptId: typeof data.transcriptId === 'string' ? data.transcriptId : undefined,
        scenarioId: typeof data.scenarioId === 'string' ? data.scenarioId : undefined,
        modelId: typeof data.modelId === 'string' ? data.modelId : undefined,
      } satisfies JobFailure;
    });
  } catch (err) {
    log.warn({ err, runId }, 'Failed to fetch recent failures');
    return [];
  }
}

/**
 * Expansion Status Service
 *
 * Queries the status of scenario expansion jobs for a definition.
 */

import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('services:scenario:expansion-status');

export type ExpansionJobStatus = 'pending' | 'active' | 'completed' | 'failed' | 'none';

/**
 * Real-time progress during scenario expansion.
 * This is updated by the Python worker via stderr JSON lines.
 */
export type ExpansionProgress = {
  phase: string;
  expectedScenarios: number;
  generatedScenarios: number;
  inputTokens: number;
  outputTokens: number;
  message: string;
  updatedAt: string;
};

export type DefinitionExpansionStatus = {
  definitionId: string;
  status: ExpansionJobStatus;
  jobId: string | null;
  triggeredBy: string | null;
  createdAt: Date | null;
  completedAt: Date | null;
  error: string | null;
  scenarioCount: number;
  /** Real-time progress during expansion (null when not expanding) */
  progress: ExpansionProgress | null;
};

/**
 * Get the expansion status for a definition.
 * Queries PgBoss job tables to find the most recent expansion job.
 * Also fetches real-time progress from the definition's expansionProgress field.
 */
export async function getDefinitionExpansionStatus(
  definitionId: string
): Promise<DefinitionExpansionStatus> {
  log.debug({ definitionId }, 'Fetching expansion status');

  try {
    // Query current jobs first
    const currentJobs = await db.$queryRaw<Array<{
      id: string;
      state: string;
      data: { definitionId: string; triggeredBy: string };
      created_on: Date;
      completed_on: Date | null;
      output: unknown;
    }>>`
      SELECT id, state, data, created_on, completed_on, output
      FROM pgboss.job
      WHERE name = 'expand_scenarios'
        AND data->>'definitionId' = ${definitionId}
      ORDER BY created_on DESC
      LIMIT 1
    `;

    // Get scenario count and expansion progress
    const definition = await db.definition.findUnique({
      where: { id: definitionId },
      select: { expansionProgress: true },
    });

    const scenarioCount = await db.scenario.count({
      where: { definitionId, deletedAt: null },
    });

    // Parse expansion progress from JSONB
    const progress = definition?.expansionProgress as ExpansionProgress | null;

    const currentJob = currentJobs[0];
    if (currentJob) {
      const state = currentJob.state;

      let status: ExpansionJobStatus = 'pending';
      if (state === 'active') status = 'active';
      else if (state === 'completed') status = 'completed';
      else if (['failed', 'expired', 'cancelled'].includes(state)) status = 'failed';
      else if (['created', 'retry'].includes(state)) status = 'pending';

      // Extract error from output if failed
      let error: string | null = null;
      if (status === 'failed' && currentJob.output) {
        const output = currentJob.output as { message?: string };
        error = output.message ?? 'Unknown error';
      }

      // Only return progress for active jobs, not terminal states
      // This prevents stale progress showing for failed/expired jobs
      const activeProgress = (status === 'active' || status === 'pending') ? progress : null;

      return {
        definitionId,
        status,
        jobId: currentJob.id,
        triggeredBy: currentJob.data?.triggeredBy ?? null,
        createdAt: currentJob.created_on,
        completedAt: currentJob.completed_on,
        error,
        scenarioCount,
        progress: activeProgress,
      };
    }

    // Note: PgBoss v10+ no longer uses a separate archive table.
    // All jobs (including completed/failed) stay in pgboss.job, which we queried above.

    // No job found
    return {
      definitionId,
      status: 'none',
      jobId: null,
      triggeredBy: null,
      createdAt: null,
      completedAt: null,
      error: null,
      scenarioCount,
      progress: null,
    };
  } catch (error) {
    log.error({ error, definitionId }, 'Failed to fetch expansion status');

    // Return status indicating no job found (tables may not exist yet)
    const scenarioCount = await db.scenario.count({
      where: { definitionId, deletedAt: null },
    }).catch(() => 0);

    return {
      definitionId,
      status: 'none',
      jobId: null,
      triggeredBy: null,
      createdAt: null,
      completedAt: null,
      error: null,
      scenarioCount,
      progress: null,
    };
  }
}

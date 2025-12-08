/**
 * Expansion Status Service
 *
 * Queries the status of scenario expansion jobs for a definition.
 */

import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('services:scenario:expansion-status');

export type ExpansionJobStatus = 'pending' | 'active' | 'completed' | 'failed' | 'none';

export type DefinitionExpansionStatus = {
  definitionId: string;
  status: ExpansionJobStatus;
  jobId: string | null;
  triggeredBy: string | null;
  createdAt: Date | null;
  completedAt: Date | null;
  error: string | null;
  scenarioCount: number;
};

/**
 * Get the expansion status for a definition.
 * Queries PgBoss job tables to find the most recent expansion job.
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

    // Get scenario count
    const scenarioCount = await db.scenario.count({
      where: { definitionId, deletedAt: null },
    });

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

      return {
        definitionId,
        status,
        jobId: currentJob.id,
        triggeredBy: currentJob.data?.triggeredBy ?? null,
        createdAt: currentJob.created_on,
        completedAt: currentJob.completed_on,
        error,
        scenarioCount,
      };
    }

    // Check archive for recent completed jobs (archive table may not exist in all pgboss versions)
    try {
      const archivedJobs = await db.$queryRaw<Array<{
        id: string;
        state: string;
        data: { definitionId: string; triggeredBy: string };
        created_on: Date;
        completed_on: Date | null;
        output: unknown;
      }>>`
        SELECT id, state, data, created_on, completed_on, output
        FROM pgboss.archive
        WHERE name = 'expand_scenarios'
          AND data->>'definitionId' = ${definitionId}
          AND archived_on > NOW() - INTERVAL '1 hour'
        ORDER BY created_on DESC
        LIMIT 1
      `;

      const archivedJob = archivedJobs[0];
      if (archivedJob) {
        let status: ExpansionJobStatus = 'completed';
        let error: string | null = null;

        if (['failed', 'expired', 'cancelled'].includes(archivedJob.state)) {
          status = 'failed';
          if (archivedJob.output) {
            const output = archivedJob.output as { message?: string };
            error = output.message ?? 'Unknown error';
          }
        }

        return {
          definitionId,
          status,
          jobId: archivedJob.id,
          triggeredBy: archivedJob.data?.triggeredBy ?? null,
          createdAt: archivedJob.created_on,
          completedAt: archivedJob.completed_on,
          error,
          scenarioCount,
        };
      }
    } catch {
      // Archive table may not exist - that's OK
      log.debug({ definitionId }, 'Archive table not available');
    }

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
    };
  }
}

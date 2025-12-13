/**
 * Cancel Expansion Service
 *
 * Cancels an in-progress scenario expansion job for a definition.
 */

import { db, Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { getBoss } from '../../queue/boss.js';

const log = createLogger('services:scenario:cancel-expansion');

export type CancelExpansionResult = {
  definitionId: string;
  cancelled: boolean;
  jobId: string | null;
  message: string;
};

/**
 * Cancel any pending or active expansion jobs for a definition.
 * Also clears the expansionProgress field.
 */
export async function cancelScenarioExpansion(
  definitionId: string
): Promise<CancelExpansionResult> {
  log.info({ definitionId }, 'Cancelling scenario expansion');

  try {
    // Find active/pending expansion job for this definition
    const jobs = await db.$queryRaw<Array<{
      id: string;
      state: string;
    }>>`
      SELECT id, state
      FROM pgboss.job
      WHERE name = 'expand_scenarios'
        AND data->>'definitionId' = ${definitionId}
        AND state IN ('created', 'retry', 'active')
      ORDER BY created_on DESC
      LIMIT 1
    `;

    const job = jobs[0];

    if (!job) {
      // No active job - just clear any stale progress
      await db.definition.update({
        where: { id: definitionId },
        data: {
          expansionProgress: Prisma.JsonNull,
          expansionDebug: {
            rawResponse: null,
            extractedYaml: null,
            parseError: 'Cancelled by user (no active job found)',
            timestamp: new Date().toISOString(),
          },
        },
      });

      log.info({ definitionId }, 'No active expansion job found, cleared progress');
      return {
        definitionId,
        cancelled: false,
        jobId: null,
        message: 'No active expansion job found',
      };
    }

    // Cancel the job in PgBoss
    const boss = getBoss();
    await boss.cancel('expand_scenarios', job.id);

    log.info({ definitionId, jobId: job.id, state: job.state }, 'PgBoss job cancelled');

    // Clear expansion progress and record cancellation
    await db.definition.update({
      where: { id: definitionId },
      data: {
        expansionProgress: Prisma.JsonNull,
        expansionDebug: {
          rawResponse: null,
          extractedYaml: null,
          parseError: 'Cancelled by user',
          jobId: job.id,
          timestamp: new Date().toISOString(),
          scenariosCreated: 0,
        },
      },
    });

    log.info({ definitionId, jobId: job.id }, 'Expansion cancelled successfully');

    return {
      definitionId,
      cancelled: true,
      jobId: job.id,
      message: `Cancelled expansion job ${job.id}`,
    };
  } catch (error) {
    log.error({ error, definitionId }, 'Failed to cancel expansion');

    // Still try to clear the progress even if cancel fails
    try {
      await db.definition.update({
        where: { id: definitionId },
        data: {
          expansionProgress: Prisma.JsonNull,
        },
      });
    } catch (clearError) {
      log.warn({ clearError, definitionId }, 'Failed to clear expansion progress');
    }

    throw error;
  }
}

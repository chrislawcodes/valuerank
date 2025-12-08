/**
 * Queue Scenario Expansion Service
 *
 * Queues a job to expand scenarios from a definition.
 * The actual expansion happens asynchronously in the job handler.
 */

import { createLogger } from '@valuerank/shared';
import { getBoss } from '../../queue/boss.js';
import type { ExpandScenariosJobData } from '../../queue/types.js';
import { DEFAULT_JOB_OPTIONS } from '../../queue/types.js';

const log = createLogger('services:scenario:queue-expansion');

export type QueueExpansionResult = {
  jobId: string | null;
  queued: boolean;
};

/**
 * Queues a job to expand scenarios for a definition.
 *
 * Uses singleton key to ensure only one expansion job per definition
 * is running at a time (new requests replace pending ones).
 *
 * @param definitionId - The definition to expand scenarios for
 * @param triggeredBy - What triggered the expansion (create, update, fork)
 * @returns The queued job ID, or null if queue not ready
 */
export async function queueScenarioExpansion(
  definitionId: string,
  triggeredBy: 'create' | 'update' | 'fork'
): Promise<QueueExpansionResult> {
  log.info({ definitionId, triggeredBy }, 'Queuing scenario expansion');

  try {
    const boss = getBoss();

    const jobData: ExpandScenariosJobData = {
      definitionId,
      triggeredBy,
    };

    const options = {
      ...DEFAULT_JOB_OPTIONS['expand_scenarios'],
      // Use definitionId as singleton key to dedupe multiple rapid saves
      singletonKey: `expand_${definitionId}`,
    };

    const jobId = await boss.send('expand_scenarios', jobData, options);

    log.info(
      { definitionId, triggeredBy, jobId },
      'Scenario expansion job queued'
    );

    return {
      jobId: jobId ?? null,
      queued: true,
    };
  } catch (error) {
    log.error({ definitionId, triggeredBy, err: error }, 'Failed to queue scenario expansion');

    return {
      jobId: null,
      queued: false,
    };
  }
}

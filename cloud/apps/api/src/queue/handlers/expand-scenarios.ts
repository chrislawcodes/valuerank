/**
 * Expand Scenarios Handler
 *
 * Handles expand_scenarios jobs by calling the LLM to generate scenarios
 * from a definition's dimensions.
 */

import type * as PgBoss from 'pg-boss';
import { db, resolveDefinitionContent } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import type { ExpandScenariosJobData } from '../types.js';
import { expandScenarios } from '../../services/scenario/expand.js';

const log = createLogger('queue:expand-scenarios');

/**
 * Creates a handler for expand_scenarios jobs.
 */
export function createExpandScenariosHandler(): PgBoss.WorkHandler<ExpandScenariosJobData> {
  return async (jobs: PgBoss.Job<ExpandScenariosJobData>[]) => {
    for (const job of jobs) {
      const { definitionId, triggeredBy } = job.data;
      const jobId = job.id;

      log.info(
        { jobId, definitionId, triggeredBy },
        'Processing expand_scenarios job'
      );

      try {
        // Check if definition still exists
        const definition = await db.definition.findUnique({
          where: { id: definitionId },
          select: { id: true, name: true, deletedAt: true },
        });

        if (!definition || definition.deletedAt !== null) {
          log.warn({ jobId, definitionId }, 'Definition not found or deleted, skipping expansion');
          return;
        }

        // Resolve the full definition content (with inheritance)
        const { resolvedContent } = await resolveDefinitionContent(definitionId);

        // Expand scenarios using LLM
        const result = await expandScenarios(definitionId, resolvedContent);

        log.info(
          {
            jobId,
            definitionId,
            definitionName: definition.name,
            scenariosCreated: result.created,
            scenariosDeleted: result.deleted,
            triggeredBy,
          },
          'Scenarios expanded successfully'
        );
      } catch (error) {
        log.error(
          { jobId, definitionId, triggeredBy, err: error },
          'Failed to expand scenarios'
        );

        // Re-throw to trigger retry
        throw error;
      }
    }
  };
}

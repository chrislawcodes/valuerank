/**
 * Expand Scenarios Handler
 *
 * Handles expand_scenarios jobs by calling the LLM to generate scenarios
 * from a definition's dimensions.
 */

import type * as PgBoss from 'pg-boss';
import { db, Prisma, resolveDefinitionContent } from '@valuerank/db';
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

        // Clear stale progress and update debug info
        // This ensures UI doesn't show "expanding" state for failed/expired jobs
        try {
          // Check if expand.ts already saved debug info for this error
          // If so, preserve it (it has rawResponse) and just update the parseError format
          const current = await db.definition.findUnique({
            where: { id: definitionId },
            select: { expansionDebug: true },
          });

          const existingDebug = current?.expansionDebug as Record<string, unknown> | null;
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Preserve existing debug data (rawResponse, extractedYaml) if available
          await db.definition.update({
            where: { id: definitionId },
            data: {
              expansionProgress: Prisma.JsonNull,
              expansionDebug: {
                rawResponse: existingDebug?.rawResponse ?? null,
                extractedYaml: existingDebug?.extractedYaml ?? null,
                parseError: `Job failed: ${errorMessage}`,
                errorDetails: existingDebug?.errorDetails ?? null,
                partialTokens: existingDebug?.partialTokens ?? null,
                modelId: existingDebug?.modelId ?? null,
                jobId,
                timestamp: new Date().toISOString(),
                scenariosCreated: 0,
              },
            },
          });
        } catch (cleanupError) {
          log.warn({ cleanupError, definitionId }, 'Failed to clear expansion progress on error');
        }

        // Re-throw to trigger retry
        throw error;
      }
    }
  };
}

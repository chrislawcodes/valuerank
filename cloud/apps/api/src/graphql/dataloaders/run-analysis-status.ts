import DataLoader from 'dataloader';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { resolveRunAnalysisStatuses, type RunAnalysisStatus } from '../../services/run/analysis-status.js';

const log = createLogger('dataloader:run-analysis-status');

/**
 * Creates a DataLoader for batching run analysis status lookups by run ID.
 */
export function createRunAnalysisStatusLoader(): DataLoader<string, RunAnalysisStatus> {
  return new DataLoader<string, RunAnalysisStatus>(
    async (runIds: readonly string[]) => {
      log.debug({ runIds: [...runIds] }, 'Batching run analysis status load');

      const uniqueRunIds = [...new Set(runIds)];
      const runs = await db.run.findMany({
        where: { id: { in: uniqueRunIds }, deletedAt: null },
        select: {
          id: true,
          definitionId: true,
          status: true,
          completedAt: true,
          config: true,
        },
      });
      const statuses = await resolveRunAnalysisStatuses(runs);

      return runIds.map((runId) => statuses.get(runId) ?? null);
    },
    { cache: true },
  );
}

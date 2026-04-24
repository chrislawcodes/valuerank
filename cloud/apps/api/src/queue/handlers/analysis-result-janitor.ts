import type * as PgBoss from 'pg-boss';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { SUPERSEDED_ANALYSIS_RETENTION_DAYS } from '../../services/analysis/constants.js';
import type { AnalysisResultJanitorJobData } from '../types.js';

const log = createLogger('queue:analysis-result-janitor');

export function createAnalysisResultJanitorHandler(): PgBoss.WorkHandler<AnalysisResultJanitorJobData> {
  return async (jobs: PgBoss.Job<AnalysisResultJanitorJobData>[]): Promise<void> => {
    if (jobs.length === 0) {
      return;
    }

    try {
      const deletedCount = await db.$executeRaw`
        DELETE FROM analysis_results
        WHERE status = 'SUPERSEDED'
          AND updated_at < NOW() - (${SUPERSEDED_ANALYSIS_RETENTION_DAYS} * INTERVAL '1 day')
      `;

      log.info({ deletedCount }, 'Pruned superseded analysis results');
    } catch (error) {
      log.error({ err: error }, 'Failed to prune superseded analysis results');
      throw error;
    }
  };
}

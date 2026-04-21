import type * as PgBoss from 'pg-boss';
import { createLogger } from '@valuerank/shared';
import type { RefreshDomainAnalysisSnapshotJobData } from '../types.js';
import { refreshDomainAnalysisSnapshot } from '../../services/analysis/domain-analysis-cache.js';

const log = createLogger('queue:refresh-domain-analysis-snapshot');

export function createRefreshDomainAnalysisSnapshotHandler(): PgBoss.WorkHandler<RefreshDomainAnalysisSnapshotJobData> {
  return async (jobs: PgBoss.Job<RefreshDomainAnalysisSnapshotJobData>[]) => {
    for (const job of jobs) {
      const { scope, domainId, signature, reason } = job.data;
      log.info({ jobId: job.id, scope, domainId, signature, reason }, 'Refreshing domain analysis snapshot');
      await refreshDomainAnalysisSnapshot({
        scope,
        domainId,
        requestedSignature: signature,
      });
      log.info({ jobId: job.id, scope, domainId, signature, reason }, 'Domain analysis snapshot refreshed');
    }
  };
}

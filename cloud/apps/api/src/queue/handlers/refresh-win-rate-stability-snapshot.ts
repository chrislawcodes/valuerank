import type * as PgBoss from 'pg-boss';
import { createLogger } from '@valuerank/shared';
import type { RefreshWinRateStabilitySnapshotJobData } from '../types.js';
import { refreshWinRateStabilitySnapshot } from '../../services/analysis/win-rate-stability/snapshot-cache.js';

const log = createLogger('queue:refresh-win-rate-stability-snapshot');

export function createRefreshWinRateStabilitySnapshotHandler(): PgBoss.WorkHandler<RefreshWinRateStabilitySnapshotJobData> {
  return async (jobs: PgBoss.Job<RefreshWinRateStabilitySnapshotJobData>[]) => {
    for (const job of jobs) {
      const { domainId, domainIds, signature, reason } = job.data;
      log.info({ jobId: job.id, domainId, domainIds, signature, reason }, 'Refreshing win rate stability snapshot');
      await refreshWinRateStabilitySnapshot({ domainId, domainIds, signature });
      log.info({ jobId: job.id, domainId, domainIds, signature, reason }, 'Win rate stability snapshot refreshed');
    }
  };
}

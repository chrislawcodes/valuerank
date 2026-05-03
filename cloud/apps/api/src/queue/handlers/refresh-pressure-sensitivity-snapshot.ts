import type * as PgBoss from 'pg-boss';
import { createLogger } from '@valuerank/shared';
import type { RefreshPressureSensitivitySnapshotJobData } from '../types.js';
import { refreshPressureSensitivitySnapshot } from '../../services/pressure-sensitivity/snapshot-cache.js';

const log = createLogger('queue:refresh-pressure-sensitivity-snapshot');

export function createRefreshPressureSensitivitySnapshotHandler(): PgBoss.WorkHandler<RefreshPressureSensitivitySnapshotJobData> {
  return async (jobs: PgBoss.Job<RefreshPressureSensitivitySnapshotJobData>[]) => {
    for (const job of jobs) {
      const { domainId, signature, reason } = job.data;
      log.info({ jobId: job.id, domainId, signature, reason }, 'Refreshing pressure sensitivity snapshot');
      await refreshPressureSensitivitySnapshot({ domainId, signature });
      log.info({ jobId: job.id, domainId, signature, reason }, 'Pressure sensitivity snapshot refreshed');
    }
  };
}

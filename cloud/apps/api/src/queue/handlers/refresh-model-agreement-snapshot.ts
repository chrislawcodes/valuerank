import type * as PgBoss from 'pg-boss';
import { createLogger } from '@valuerank/shared';
import type { RefreshModelAgreementSnapshotJobData } from '../types.js';
import { db } from '@valuerank/db';
import { buildModelAgreementSnapshot } from '../../services/analysis/model-agreement-snapshot/snapshot-builder.js';

const log = createLogger('queue:refresh-model-agreement-snapshot');

export function createRefreshModelAgreementSnapshotHandler(): PgBoss.WorkHandler<RefreshModelAgreementSnapshotJobData> {
  return async (jobs: PgBoss.Job<RefreshModelAgreementSnapshotJobData>[]) => {
    for (const job of jobs) {
      const { scope, signature, domainId, domainIds, modelIds, reason } = job.data;
      log.info(
        { jobId: job.id, scope, signature, domainId, domainIds, modelIds, reason },
        'Refreshing model agreement snapshot',
      );

      const snapshot = await buildModelAgreementSnapshot(db, {
        scope,
        signature,
        domainId,
        domainIds,
        modelIds,
      });

      await db.modelAgreementSnapshot.upsert({
        where: {
          scope_signature_domainIdsHash_modelIdsHash: {
            scope: snapshot.scope,
            signature: snapshot.signature,
            domainIdsHash: snapshot.domainIdsHash,
            modelIdsHash: snapshot.modelIdsHash,
          },
        },
        create: snapshot,
        update: snapshot,
      });

      log.info(
        { jobId: job.id, scope, signature, domainId, domainIds, modelIds, reason },
        'Model agreement snapshot refreshed',
      );
    }
  };
}

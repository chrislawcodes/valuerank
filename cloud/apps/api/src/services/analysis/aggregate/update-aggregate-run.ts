import { createLogger } from '@valuerank/shared';
import {
  claimAggregateRun,
  persistAggregateRun,
  prepareAggregateRunSnapshot,
  releaseAggregateClaim,
  spawnAggregateWorker,
} from './aggregate-run-workflow.js';

const log = createLogger('analysis:aggregate');

export async function updateAggregateRun(
  definitionId: string,
  preambleVersionId: string | null,
  definitionVersion: number | null,
  temperature: number | null = null,
) {
  if (!definitionId) {
    log.error('Cannot update aggregate run without definitionId');
    return;
  }

  log.info({ definitionId, preambleVersionId, definitionVersion, temperature }, 'Updating aggregate run (workflow split)');

  const prepared = await prepareAggregateRunSnapshot(definitionId, preambleVersionId, definitionVersion, temperature);
  if (prepared == null) {
    return;
  }

  const claim = await claimAggregateRun(prepared);

  try {
    const workerResult = await spawnAggregateWorker(prepared);
    await persistAggregateRun(prepared, claim, workerResult);
  } catch (err) {
    await releaseAggregateClaim(prepared, claim);
    throw err;
  }
}

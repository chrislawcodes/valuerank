/**
 * Low-level job queue operations for run recovery.
 * Extracted from recovery.ts to keep that file under the 400-line limit.
 */

import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { getBoss } from '../../queue/boss.js';
import { DEFAULT_JOB_OPTIONS } from '../../queue/types.js';
import { getQueueNameForModel } from '../parallelism/index.js';
import type { TranscriptKey } from './coverage-completeness.js';

const log = createLogger('services:run:recovery');

/**
 * Counts pending and active jobs for a specific run across all probe queues.
 */
export async function countJobsForRun(runId: string): Promise<{ pending: number; active: number }> {
  // Query PgBoss job table directly for accurate counts
  const result = await db.$queryRaw<Array<{ state: string; count: bigint }>>`
    SELECT state, COUNT(*) as count
    FROM pgboss.job
    WHERE (name = 'probe_scenario' OR name LIKE 'probe_scenario_%')
      AND state IN ('created', 'retry', 'active')
      AND data->>'runId' = ${runId}
    GROUP BY state
  `;

  let pending = 0;
  let active = 0;

  for (const row of result) {
    const count = Number(row.count);
    if (row.state === 'active') {
      active = count;
    } else {
      pending += count; // 'created' and 'retry' are both pending
    }
  }

  return { pending, active };
}

/**
 * Re-queues missing probe jobs for an orphaned run.
 * Handles multi-sample runs by including sampleIndex in job data.
 */
export async function requeueMissingProbes(
  runId: string,
  missingProbes: TranscriptKey[]
): Promise<number> {
  const boss = getBoss();

  const jobOptions = DEFAULT_JOB_OPTIONS['probe_scenario'];
  let queuedCount = 0;

  for (const { scenarioId, modelId, sampleIndex } of missingProbes) {
    const queueName = await getQueueNameForModel(modelId);

    await boss.send(
      queueName,
      {
        runId,
        scenarioId,
        modelId,
        sampleIndex,
        config: {
          maxTurns: 10,
        },
      },
      jobOptions
    );

    queuedCount++;
  }

  log.info({ runId, queuedCount }, 'Re-queued missing probe jobs');
  return queuedCount;
}

/**
 * Queues summarize jobs for all unsummarized transcripts in a run.
 * Duplicated from progress.ts since that function is private.
 */
export async function queueSummarizeJobsForRecovery(runId: string): Promise<number> {
  const boss = getBoss();

  const transcripts = await db.transcript.findMany({
    where: { runId, summarizedAt: null },
    select: { id: true },
  });

  if (transcripts.length === 0) {
    return 0;
  }

  const jobOptions = DEFAULT_JOB_OPTIONS['summarize_transcript'];

  for (const transcript of transcripts) {
    await boss.send('summarize_transcript', {
      runId,
      transcriptId: transcript.id,
    }, jobOptions);
  }

  log.info({ runId, jobCount: transcripts.length }, 'Queued summarize jobs for recovery');
  return transcripts.length;
}

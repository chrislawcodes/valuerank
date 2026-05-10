/**
 * Probe Dead Letter Handler
 *
 * Handles failed/expired probe_scenario jobs that were moved to the dead letter queue.
 * Logs the failure and updates run progress to ensure runs don't get stuck.
 */

import type * as PgBoss from 'pg-boss';
import { createLogger } from '@valuerank/shared';
import type { ProbeDeadLetterJobData } from '../types.js';
import { maybeAdvanceRunStatus } from '../../services/run/index.js';
import { recordProbeFailure } from '../../services/probe-result/index.js';

const log = createLogger('queue:probe-dead-letter');

/**
 * Creates a handler for probe_dead_letter jobs.
 *
 * This handler processes failed/expired probe jobs:
 * 1. Logs the failure with full context
 * 2. Records the failure in ProbeResult table
 * 3. Increments the failed count for the run
 *
 * This ensures runs don't get stuck when jobs expire or fail silently.
 */
export function createProbeDeadLetterHandler(): PgBoss.WorkHandler<ProbeDeadLetterJobData> {
  return async (jobs: PgBoss.Job<ProbeDeadLetterJobData>[]) => {
    for (const job of jobs) {
      const { runId, scenarioId, modelId, sampleIndex = 0 } = job.data;
      const jobId = job.id;

      log.error(
        { jobId, runId, scenarioId, modelId, sampleIndex },
        'Probe job failed/expired - processing dead letter'
      );

      // Record the failure in ProbeResult table.
      //
      // Failures here are rethrown so the DLQ job goes to PgBoss "failed" state and the
      // operator can see something went wrong. Previously this catch swallowed silently,
      // which is why 15 zombie-killed probes on a known run never appeared in
      // Run.failedProbes — recordProbeFailure was failing and nobody could tell.
      //
      // retryLimit on probe_dead_letter is 0, so a thrown error does NOT cause a retry
      // loop; the DLQ job just fails once and stays visible.
      try {
        await recordProbeFailure({
          runId,
          scenarioId,
          modelId,
          sampleIndex,
          errorCode: 'JOB_EXPIRED',
          errorMessage: 'Job expired or failed without completing - moved to dead letter queue',
          retryCount: 0,
        });

        const result = await maybeAdvanceRunStatus(runId);

        log.info(
          { jobId, runId, scenarioId, modelId, sampleIndex, result },
          'Dead letter job processed - run progress updated'
        );
      } catch (error) {
        log.error(
          {
            jobId,
            runId,
            scenarioId,
            modelId,
            sampleIndex,
            err: error,
            jobData: job.data,
          },
          'Failed to process dead letter job — rethrowing so PgBoss marks it failed'
        );
        throw error;
      }
    }
  };
}

/**
 * Analyze Basic Handler (Stub)
 *
 * Handles analyze:basic jobs. Currently a stub that simulates work.
 * Real analysis will be added in Stage 11.
 */

import type * as PgBoss from 'pg-boss';
import { createLogger } from '@valuerank/shared';
import type { AnalyzeBasicJobData } from '../types.js';

const log = createLogger('queue:analyze-basic');

// Configurable delay for stub simulation (ms)
const STUB_DELAY_MS = parseInt(process.env.STUB_JOB_DELAY_MS ?? '100', 10);

/**
 * Creates a handler for analyze:basic jobs.
 * Returns a function that processes a batch of jobs.
 */
export function createAnalyzeBasicHandler(): PgBoss.WorkHandler<AnalyzeBasicJobData> {
  return async (jobs: PgBoss.Job<AnalyzeBasicJobData>[]) => {
    for (const job of jobs) {
      const { runId, transcriptIds } = job.data;
      const jobId = job.id;

      log.info(
        { jobId, runId, transcriptCount: transcriptIds.length },
        'Processing analyze:basic job'
      );

      // Simulate work
      await new Promise((resolve) => setTimeout(resolve, STUB_DELAY_MS));

      log.info(
        { jobId, runId },
        'Analyze:basic job completed (stub)'
      );
    }
  };
}

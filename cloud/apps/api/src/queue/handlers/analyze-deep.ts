/**
 * Analyze Deep Handler (Stub)
 *
 * Handles analyze_deep jobs. Currently a stub that simulates work.
 * Real analysis will be added in Stage 11.
 */

import type * as PgBoss from 'pg-boss';
import { createLogger } from '@valuerank/shared';
import type { AnalyzeDeepJobData } from '../types.js';

const log = createLogger('queue:analyze-deep');

// Configurable delay for stub simulation (ms)
const STUB_DELAY_MS = parseInt(process.env.STUB_JOB_DELAY_MS ?? '100', 10);

/**
 * Creates a handler for analyze_deep jobs.
 * Returns a function that processes a batch of jobs.
 */
export function createAnalyzeDeepHandler(): PgBoss.WorkHandler<AnalyzeDeepJobData> {
  return async (jobs: PgBoss.Job<AnalyzeDeepJobData>[]) => {
    for (const job of jobs) {
      const { runId, analysisType } = job.data;
      const jobId = job.id;

      log.info(
        { jobId, runId, analysisType },
        'Processing analyze_deep job'
      );

      // Simulate work
      await new Promise((resolve) => setTimeout(resolve, STUB_DELAY_MS));

      log.info(
        { jobId, runId, analysisType },
        'Analyze:deep job completed (stub)'
      );
    }
  };
}

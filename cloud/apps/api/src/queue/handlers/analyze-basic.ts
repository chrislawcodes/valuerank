/**
 * Analyze Basic Handler
 *
 * Handles analyze_basic jobs by executing Python analyze_basic worker.
 * Currently runs a stub that returns placeholder results.
 * Real analysis will be added in Stage 11.
 */

import path from 'path';
import crypto from 'crypto';
import type * as PgBoss from 'pg-boss';
import { db, Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import type { AnalyzeBasicJobData } from '../types.js';
import { spawnPython } from '../spawn.js';

const log = createLogger('queue:analyze-basic');

// Python worker path (relative to cloud/ directory)
const ANALYZE_WORKER_PATH = 'workers/analyze_basic.py';

// Code version for tracking analysis versions
const CODE_VERSION = '0.1.0-stub';

/**
 * Python worker input structure.
 */
type AnalyzeWorkerInput = {
  runId: string;
  transcriptIds: string[];
};

/**
 * Python worker output structure.
 */
type AnalyzeWorkerOutput =
  | { success: true; analysis: { status: string; message: string; transcriptCount: number; completedAt: string } }
  | { success: false; error: { message: string; code: string; retryable: boolean } };

/**
 * Creates a handler for analyze_basic jobs.
 * Returns a function that processes a batch of jobs.
 */
export function createAnalyzeBasicHandler(): PgBoss.WorkHandler<AnalyzeBasicJobData> {
  return async (jobs: PgBoss.Job<AnalyzeBasicJobData>[]) => {
    for (const job of jobs) {
      const { runId, transcriptIds } = job.data;
      const jobId = job.id;

      log.info(
        { jobId, runId, transcriptCount: transcriptIds.length },
        'Processing analyze_basic job'
      );

      try {
        // Execute Python analyze worker
        const result = await spawnPython<AnalyzeWorkerInput, AnalyzeWorkerOutput>(
          ANALYZE_WORKER_PATH,
          { runId, transcriptIds },
          { cwd: path.resolve(process.cwd(), '../..'), timeout: 60000 }
        );

        // Handle spawn failure
        if (!result.success) {
          log.error({ jobId, runId, error: result.error, stderr: result.stderr }, 'Python spawn failed');
          throw new Error(`Python worker failed: ${result.error}`);
        }

        // Handle worker failure
        const output = result.data;
        if (!output.success) {
          const err = output.error;
          log.warn({ jobId, runId, error: err }, 'Analyze worker returned error');
          if (!err.retryable) {
            // Non-retryable error - log and complete job
            log.error({ jobId, runId, error: err }, 'Analysis permanently failed');
            return;
          }
          throw new Error(`${err.code}: ${err.message}`);
        }

        // Create input hash for deduplication
        const inputHash = crypto
          .createHash('sha256')
          .update(JSON.stringify({ runId, transcriptIds: transcriptIds.sort() }))
          .digest('hex')
          .slice(0, 16);

        // Create analysis result record
        await db.analysisResult.create({
          data: {
            runId,
            analysisType: 'basic',
            inputHash,
            codeVersion: CODE_VERSION,
            output: output.analysis as unknown as Prisma.InputJsonValue,
            status: 'CURRENT',
          },
        });

        log.info(
          { jobId, runId, status: output.analysis.status },
          'Analyze:basic job completed'
        );
      } catch (error) {
        log.error({ jobId, runId, err: error }, 'Analyze:basic job failed');
        throw error;
      }
    }
  };
}

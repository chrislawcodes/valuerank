/**
 * Summarize Transcript Handler
 *
 * Handles summarize_transcript jobs by executing Python summarize worker
 * and updating transcripts with decision code and text.
 */

import path from 'path';
import type * as PgBoss from 'pg-boss';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import type { SummarizeTranscriptJobData } from '../types.js';
import { DEFAULT_JOB_OPTIONS } from '../types.js';
import { spawnPython } from '../spawn.js';
import { triggerBasicAnalysis } from '../../services/analysis/index.js';
import { getSummarizerModel } from '../../services/infra-models.js';
import { incrementSummarizeCompleted, incrementSummarizeFailed } from '../../services/run/progress.js';

const log = createLogger('queue:summarize-transcript');

// Retry limit from job options
const RETRY_LIMIT = DEFAULT_JOB_OPTIONS['summarize_transcript'].retryLimit ?? 3;

// Python worker path (relative to cloud/ directory)
const SUMMARIZE_WORKER_PATH = 'workers/summarize.py';

/**
 * Python worker input structure.
 */
type SummarizeWorkerInput = {
  transcriptId: string;
  modelId: string;
  transcriptContent: unknown;
};

/**
 * Python worker output structure.
 */
type SummarizeWorkerOutput =
  | { success: true; summary: { decisionCode: string; decisionText: string } }
  | { success: false; error: { message: string; code: string; retryable: boolean; details?: string } };

/**
 * Queues a compute_token_stats job for cost prediction data.
 */
async function queueComputeTokenStats(runId: string): Promise<void> {
  // Dynamic import to avoid circular dependency
  const { getBoss } = await import('../boss.js');

  const boss = getBoss();
  if (!boss) {
    log.warn({ runId }, 'Cannot queue compute_token_stats - boss not initialized');
    return;
  }

  const jobOptions = DEFAULT_JOB_OPTIONS['compute_token_stats'];

  await boss.send(
    'compute_token_stats',
    { runId },
    {
      ...jobOptions,
      singletonKey: runId, // Only one stats computation per run
    }
  );

  log.info({ runId }, 'Queued compute_token_stats job');
}

/**
 * Check if all transcripts for a run have been summarized.
 */
async function checkAllSummarized(runId: string): Promise<boolean> {
  const unsummarized = await db.transcript.count({
    where: {
      runId,
      summarizedAt: null,
    },
  });
  return unsummarized === 0;
}

/**
 * Update run status to COMPLETED if all transcripts are summarized.
 * Also triggers basic analysis and token statistics computation for the completed run.
 */
async function maybeCompleteRun(runId: string): Promise<void> {
  const allDone = await checkAllSummarized(runId);

  if (allDone) {
    await db.run.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });
    log.info({ runId }, 'Run completed - all transcripts summarized');

    // Trigger basic analysis for the completed run
    try {
      await triggerBasicAnalysis(runId);
    } catch (error) {
      // Log error but don't fail - analysis can be triggered manually
      log.error({ runId, err: error }, 'Failed to trigger basic analysis');
    }

    // Trigger token statistics computation for cost prediction
    try {
      await queueComputeTokenStats(runId);
    } catch (error) {
      // Log error but don't fail - stats can be computed manually
      log.error({ runId, err: error }, 'Failed to trigger token stats computation');
    }
  }
}

/**
 * Creates a handler for summarize_transcript jobs.
 */
export function createSummarizeTranscriptHandler(): PgBoss.WorkHandler<SummarizeTranscriptJobData> {
  return async (jobs: PgBoss.Job<SummarizeTranscriptJobData>[]) => {
    for (const job of jobs) {
      const { runId, transcriptId, summaryModelId } = job.data;
      const jobId = job.id;

      // Get model ID from job data or configured infrastructure model
      let modelId: string;
      if (summaryModelId) {
        modelId = summaryModelId;
      } else {
        const infraModel = await getSummarizerModel();
        modelId = `${infraModel.providerName}:${infraModel.modelId}`;
      }

      log.info(
        { jobId, runId, transcriptId, modelId },
        'Processing summarize_transcript job'
      );

      try {
        // Fetch transcript from database
        const transcript = await db.transcript.findUnique({
          where: { id: transcriptId },
        });

        if (!transcript) {
          log.error({ jobId, transcriptId }, 'Transcript not found');
          return; // Complete job - nothing to summarize
        }

        // Skip if already summarized
        if (transcript.summarizedAt) {
          log.info({ jobId, transcriptId }, 'Transcript already summarized, skipping');
          return;
        }

        // Build input for Python worker
        const workerInput: SummarizeWorkerInput = {
          transcriptId,
          modelId,
          transcriptContent: transcript.content,
        };

        log.debug({ jobId, workerInput: { transcriptId, modelId } }, 'Calling Python summarize worker');

        // Execute Python summarize worker
        const result = await spawnPython<SummarizeWorkerInput, SummarizeWorkerOutput>(
          SUMMARIZE_WORKER_PATH,
          workerInput,
          { cwd: path.resolve(process.cwd(), '../..') } // cloud/ directory
        );

        // Handle spawn failure
        if (!result.success) {
          log.error({ jobId, transcriptId, error: result.error, stderr: result.stderr }, 'Python spawn failed');
          throw new Error(`Python worker failed: ${result.error}`);
        }

        // Handle worker failure
        const output = result.data;
        if (!output.success) {
          const err = output.error;
          log.warn({ jobId, transcriptId, error: err }, 'Summarize worker returned error');

          if (!err.retryable) {
            // Non-retryable error - store error in decision_text
            await db.transcript.update({
              where: { id: transcriptId },
              data: {
                decisionCode: 'error',
                decisionText: `Summary failed: ${err.message}`,
                summarizedAt: new Date(),
              },
            });
            await incrementSummarizeFailed(runId);
            await maybeCompleteRun(runId);
            return;
          }

          // Retryable error - throw to trigger retry
          throw new Error(`${err.code}: ${err.message}`);
        }

        // Update transcript with summary
        await db.transcript.update({
          where: { id: transcriptId },
          data: {
            decisionCode: output.summary.decisionCode,
            decisionText: output.summary.decisionText,
            summarizedAt: new Date(),
          },
        });

        log.info(
          { jobId, transcriptId, decisionCode: output.summary.decisionCode },
          'Transcript summarized'
        );

        // Increment summarize progress
        await incrementSummarizeCompleted(runId);

        // Check if run is complete
        await maybeCompleteRun(runId);

      } catch (error) {
        const retryCount = (job as unknown as { retrycount?: number }).retrycount ?? 0;
        const maxRetriesReached = retryCount >= RETRY_LIMIT;

        log.warn(
          { jobId, transcriptId, retryCount, maxRetriesReached, err: error },
          'Summarize job error'
        );

        if (maxRetriesReached) {
          // Store error in transcript
          try {
            await db.transcript.update({
              where: { id: transcriptId },
              data: {
                decisionCode: 'error',
                decisionText: `Summary failed after ${retryCount} retries: ${error instanceof Error ? error.message : String(error)}`,
                summarizedAt: new Date(),
              },
            });
            await incrementSummarizeFailed(runId);
            await maybeCompleteRun(runId);
          } catch (updateError) {
            log.error({ jobId, transcriptId, err: updateError }, 'Failed to update transcript after summary failure');
          }
          return; // Complete job - don't retry
        }

        // Re-throw to trigger retry
        throw error;
      }
    }
  };
}

/**
 * Summarize Transcript Handler
 *
 * Handles summarize_transcript jobs by executing Python summarize worker
 * and updating transcripts with decision code and text.
 *
 * Jobs are processed in PARALLEL within each batch, with rate limiting
 * enforced per-provider using Bottleneck.
 */

import path from 'path';
import type * as PgBoss from 'pg-boss';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import type { SummarizeTranscriptJobData } from '../types.js';
import { DEFAULT_JOB_OPTIONS } from '../types.js';
import { spawnPython } from '../spawn.js';
import { triggerBasicAnalysis } from '../../services/analysis/index.js';
import { getSummarizerModel, type InfraModelConfig } from '../../services/infra-models.js';
import { incrementSummarizeCompleted, incrementSummarizeFailed } from '../../services/run/progress.js';
import { schedule as rateLimitSchedule, getLimiterStats, type ScheduleOptions } from '../../services/rate-limiter/index.js';
import { getMaxParallelSummarizations } from '../../services/summarization-parallelism/index.js';

const log = createLogger('queue:summarize-transcript');

// Track batch processing for diagnostics
let batchCounter = 0;

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
 * Process a single summarize job.
 * Extracted to allow parallel execution within batches.
 */
async function processSummarizeJob(
  job: PgBoss.Job<SummarizeTranscriptJobData>,
  infraModel: InfraModelConfig
): Promise<void> {
  const { runId, transcriptId, summaryModelId } = job.data;
  const jobId = job.id;

  // Get model ID from job data or configured infrastructure model
  const modelId = summaryModelId ?? `${infraModel.providerName}:${infraModel.modelId}`;

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

/**
 * Creates a handler for summarize_transcript jobs.
 *
 * Jobs in each batch are processed in PARALLEL using the rate limiter
 * to enforce per-provider concurrency and rate limits.
 */
export function createSummarizeTranscriptHandler(): PgBoss.WorkHandler<SummarizeTranscriptJobData> {
  return async (jobs: PgBoss.Job<SummarizeTranscriptJobData>[]) => {
    if (jobs.length === 0) {
      return;
    }

    const batchId = ++batchCounter;
    const batchStartTime = Date.now();

    // Get the summarizer model config once for the batch
    const infraModel = await getSummarizerModel();
    const providerName = infraModel.providerName;

    // Get summarization parallelism for rate limiter override
    // This allows summarization to use higher concurrency than provider probe limits
    const summarizationParallelism = await getMaxParallelSummarizations();
    const scheduleOptions: ScheduleOptions = {
      concurrencyOverride: summarizationParallelism,
    };

    // Get rate limiter stats before processing
    const limiterStatsBefore = await getLimiterStats(providerName);

    // Extract unique run IDs for logging
    const runIds = [...new Set(jobs.map(j => j.data.runId))];

    log.info(
      {
        batchId,
        jobCount: jobs.length,
        provider: providerName,
        modelId: infraModel.modelId,
        summarizationParallelism,
        runIds,
        rateLimiter: limiterStatsBefore,
      },
      'Summarize batch received from PgBoss'
    );

    // Track individual job timing
    const jobTimings: Array<{ jobId: string; transcriptId: string; durationMs: number; status: string }> = [];

    // Process all jobs in parallel with rate limiting
    const results = await Promise.allSettled(
      jobs.map(async (job, index) => {
        const { transcriptId, runId } = job.data;
        const jobId = job.id;
        const jobStartTime = Date.now();

        log.debug(
          { batchId, jobId, transcriptId, runId, jobIndex: index, totalInBatch: jobs.length },
          'Scheduling job through rate limiter'
        );

        try {
          // Schedule through rate limiter for the summarizer provider
          // Pass concurrencyOverride to use summarization parallelism setting
          const result = await rateLimitSchedule(
            providerName,
            jobId,
            `${providerName}:${infraModel.modelId}`,
            transcriptId,
            () => processSummarizeJob(job, infraModel),
            scheduleOptions
          );

          const durationMs = Date.now() - jobStartTime;
          jobTimings.push({ jobId, transcriptId, durationMs, status: 'success' });

          log.debug(
            { batchId, jobId, transcriptId, durationMs },
            'Job completed successfully'
          );

          return result;
        } catch (error) {
          const durationMs = Date.now() - jobStartTime;
          jobTimings.push({ jobId, transcriptId, durationMs, status: 'error' });

          log.warn(
            { batchId, jobId, transcriptId, durationMs, err: error },
            'Job failed in rate limiter'
          );

          throw error;
        }
      })
    );

    // Get rate limiter stats after processing
    const limiterStatsAfter = await getLimiterStats(providerName);

    // Check for failures - PgBoss needs us to throw to trigger retries
    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );

    const batchDurationMs = Date.now() - batchStartTime;
    const avgJobDurationMs = jobTimings.length > 0
      ? Math.round(jobTimings.reduce((sum, j) => sum + j.durationMs, 0) / jobTimings.length)
      : 0;

    if (failures.length > 0) {
      log.warn(
        {
          batchId,
          failureCount: failures.length,
          totalJobs: jobs.length,
          batchDurationMs,
          avgJobDurationMs,
          rateLimiterBefore: limiterStatsBefore,
          rateLimiterAfter: limiterStatsAfter,
        },
        'Some summarize jobs in batch failed'
      );

      // If all jobs failed, throw the first error
      if (failures.length === jobs.length && failures[0]) {
        throw failures[0].reason;
      }

      // If some succeeded and some failed, log but don't throw
      // The successful ones are done, failed ones were handled in processSummarizeJob
    }

    log.info(
      {
        batchId,
        completed: results.length - failures.length,
        failed: failures.length,
        batchDurationMs,
        avgJobDurationMs,
        jobsPerSecond: batchDurationMs > 0 ? Math.round((jobs.length / batchDurationMs) * 1000 * 10) / 10 : 0,
        rateLimiterBefore: limiterStatsBefore,
        rateLimiterAfter: limiterStatsAfter,
      },
      'Summarize batch processing complete'
    );
  };
}

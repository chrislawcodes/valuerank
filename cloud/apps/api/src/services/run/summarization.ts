/**
 * Summarization Control Service
 *
 * Handles cancel and restart operations for the summarization phase.
 */

import { db } from '@valuerank/db';
import { createLogger, NotFoundError, RunStateError } from '@valuerank/shared';
import { getBoss } from '../../queue/boss.js';
import { invalidateCache } from '../analysis/cache.js';

const log = createLogger('services:run:summarization');

// States where summarization can be cancelled (has pending summarize jobs)
const SUMMARIZATION_CANCELLABLE_STATES = ['SUMMARIZING'];

// Terminal states where summarization can be restarted
const SUMMARIZATION_RESTARTABLE_STATES = ['COMPLETED', 'FAILED', 'CANCELLED'];

export type SummarizeProgress = {
  total: number;
  completed: number;
  failed: number;
};

export type CancelSummarizationResult = {
  run: {
    id: string;
    status: string;
    summarizeProgress: SummarizeProgress | null;
  };
  cancelledCount: number;
};

export type RestartSummarizationResult = {
  run: {
    id: string;
    status: string;
    summarizeProgress: SummarizeProgress | null;
  };
  queuedCount: number;
};

/**
 * Cancels pending summarization jobs for a run.
 *
 * - Only works when run is in SUMMARIZING state
 * - Cancels pending summarize_transcript jobs in the queue
 * - Updates summarizeProgress to reflect cancelled jobs
 * - Preserves already-completed summaries
 *
 * @param runId - The run ID to cancel summarization for
 * @returns The updated run and count of cancelled jobs
 */
export async function cancelSummarization(runId: string): Promise<CancelSummarizationResult> {
  log.info({ runId }, 'Attempting to cancel summarization');

  const run = await db.run.findUnique({
    where: { id: runId },
    select: {
      id: true,
      status: true,
      summarizeProgress: true,
    },
  });

  if (!run) {
    throw new NotFoundError('Run', runId);
  }

  if (!SUMMARIZATION_CANCELLABLE_STATES.includes(run.status)) {
    throw new RunStateError(runId, run.status, 'cancel summarization');
  }

  let cancelledCount = 0;

  // Cancel pending summarize_transcript jobs in PgBoss
  try {
    const result = await db.$executeRaw`
      UPDATE pgboss.job
      SET state = 'cancelled'
      WHERE name = 'summarize_transcript'
        AND state IN ('created', 'retry')
        AND data->>'runId' = ${runId}
    `;
    cancelledCount = Number(result);
    log.info({ runId, cancelledCount }, 'Cancelled pending summarize jobs');
  } catch (error) {
    // If PgBoss tables don't exist, that's fine - no jobs to cancel
    log.warn({ runId, error }, 'Failed to cancel summarize jobs in queue');
  }

  // Get current counts of completed summaries
  // Note: We can't reliably distinguish failed vs not-yet-processed transcripts,
  // so we only count completed summaries here
  const completedCount = await db.transcript.count({
    where: { runId, summarizedAt: { not: null } },
  });

  // Update summarizeProgress to reflect the cancellation
  // Total stays the same, but we adjust completed/failed based on actual counts
  const currentProgress = run.summarizeProgress as SummarizeProgress | null;
  const updatedProgress: SummarizeProgress = {
    total: currentProgress?.total ?? 0,
    completed: completedCount,
    failed: currentProgress?.failed ?? 0,
  };

  // Update run status - go back to COMPLETED if probing was done, else keep current
  // Since we were in SUMMARIZING, probing is complete
  const updatedRun = await db.run.update({
    where: { id: runId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      summarizeProgress: updatedProgress,
    },
    select: {
      id: true,
      status: true,
      summarizeProgress: true,
    },
  });

  log.info(
    { runId, cancelledCount, previousStatus: run.status, newStatus: updatedRun.status },
    'Summarization cancelled'
  );

  return {
    run: {
      id: updatedRun.id,
      status: updatedRun.status,
      summarizeProgress: updatedRun.summarizeProgress as SummarizeProgress | null,
    },
    cancelledCount,
  };
}

/**
 * Restarts summarization for a run.
 *
 * - Only works when run is in a terminal state (COMPLETED/FAILED/CANCELLED)
 * - By default, only re-queues transcripts without summaries
 * - With force=true, re-queues all transcripts
 *
 * @param runId - The run ID to restart summarization for
 * @param force - If true, re-summarize all transcripts (not just failed/missing)
 * @returns The updated run and count of queued jobs
 */
export async function restartSummarization(
  runId: string,
  force = false
): Promise<RestartSummarizationResult> {
  log.info({ runId, force }, 'Attempting to restart summarization');

  const run = await db.run.findUnique({
    where: { id: runId },
    select: {
      id: true,
      status: true,
      summarizeProgress: true,
    },
  });

  if (!run) {
    throw new NotFoundError('Run', runId);
  }

  if (!SUMMARIZATION_RESTARTABLE_STATES.includes(run.status)) {
    throw new RunStateError(runId, run.status, 'restart summarization');
  }

  // Cancel any pending summarize jobs first (to avoid duplicates if somehow there are some)
  try {
    await db.$executeRaw`
      UPDATE pgboss.job
      SET state = 'cancelled'
      WHERE name = 'summarize_transcript'
        AND state IN ('created', 'retry')
        AND data->>'runId' = ${runId}
    `;
  } catch (error) {
    // Ignore if PgBoss tables don't exist
  }

  // Invalidate any cached analysis results so they get recomputed
  // with the new decision codes after summarization completes
  const invalidatedCount = await invalidateCache(runId);
  if (invalidatedCount > 0) {
    log.info({ runId, invalidatedCount }, 'Invalidated cached analysis results');
  }

  // Get transcripts to re-summarize
  const whereClause = force
    ? { runId }
    : { runId, OR: [{ summarizedAt: null }, { decisionCode: 'error' }] };

  const transcriptsToQueue = await db.transcript.findMany({
    where: whereClause,
    select: { id: true },
  });

  if (transcriptsToQueue.length === 0) {
    log.info({ runId, force }, 'No transcripts need summarization');

    return {
      run: {
        id: run.id,
        status: run.status,
        summarizeProgress: run.summarizeProgress as SummarizeProgress | null,
      },
      queuedCount: 0,
    };
  }

  // Clear summarizedAt for transcripts being re-processed
  // This ensures the job handler doesn't skip them
  const transcriptIds = transcriptsToQueue.map((t) => t.id);
  await db.transcript.updateMany({
    where: { id: { in: transcriptIds } },
    data: {
      summarizedAt: null,
      decisionCode: null,
      decisionText: null,
    },
  });
  log.info({ runId, count: transcriptIds.length }, 'Cleared summarizedAt for transcripts');

  // Update run status to SUMMARIZING and reset progress
  const updatedProgress: SummarizeProgress = {
    total: transcriptsToQueue.length,
    completed: 0,
    failed: 0,
  };

  const updatedRun = await db.run.update({
    where: { id: runId },
    data: {
      status: 'SUMMARIZING',
      completedAt: null,
      summarizeProgress: updatedProgress,
    },
    select: {
      id: true,
      status: true,
      summarizeProgress: true,
    },
  });

  // Queue summarize jobs
  const boss = getBoss();
  if (!boss) {
    throw new Error('PgBoss not initialized');
  }

  const { DEFAULT_JOB_OPTIONS } = await import('../../queue/types.js');
  const jobOptions = DEFAULT_JOB_OPTIONS['summarize_transcript'];

  for (const transcript of transcriptsToQueue) {
    await boss.send(
      'summarize_transcript',
      {
        runId,
        transcriptId: transcript.id,
      },
      jobOptions
    );
  }

  log.info(
    { runId, queuedCount: transcriptsToQueue.length, force },
    'Summarization restarted'
  );

  return {
    run: {
      id: updatedRun.id,
      status: updatedRun.status,
      summarizeProgress: updatedRun.summarizeProgress as SummarizeProgress | null,
    },
    queuedCount: transcriptsToQueue.length,
  };
}

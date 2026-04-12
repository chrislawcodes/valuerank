/**
 * Run Progress Service
 *
 * Handles atomic progress updates and status transitions for runs.
 * Uses PostgreSQL JSONB operators for concurrent-safe increments.
 */

import { db } from '@valuerank/db';
import { createLogger, NotFoundError } from '@valuerank/shared';
import type { Prisma } from '@prisma/client';

const log = createLogger('services:run:progress');

export type ProgressUpdate = {
  incrementCompleted?: number;
  incrementFailed?: number;
};

export type ProgressData = {
  total: number;
  completed: number;
  failed: number;
};

/**
 * Updates run progress atomically using PostgreSQL JSONB operators.
 *
 * This function:
 * 1. Atomically increments completed/failed counts
 * 2. Transitions run status based on progress:
 *    - PENDING -> RUNNING when first job completes
 *    - RUNNING -> SUMMARIZING when all jobs done
 * 3. Sets startedAt/completedAt timestamps as appropriate
 *
 * Note: Progress is only updated for runs in PENDING or RUNNING state.
 * Once a run transitions to SUMMARIZING or terminal states, progress
 * updates are ignored to prevent overcounting.
 */
export async function updateProgress(
  runId: string,
  update: ProgressUpdate
): Promise<{ progress: ProgressData; status: string }> {
  const { incrementCompleted = 0, incrementFailed = 0 } = update;

  // First check current state
  const currentRun = await db.run.findUnique({
    where: { id: runId },
    select: { progress: true, status: true },
  });

  if (!currentRun) {
    throw new NotFoundError('Run', runId);
  }

  // Allow correction swaps regardless of run status.
  // A correction swap is exactly { +1, -1 } or { -1, +1 } - the counters offset each other.
  // This handles FAILED -> SUCCESS or SUCCESS -> FAILED probe transitions during recovery
  // even after the run has moved to SUMMARIZING or a terminal state.
  const isCorrectionSwap =
    (incrementCompleted === 1 && incrementFailed === -1) ||
    (incrementCompleted === -1 && incrementFailed === 1);
  if (!['PENDING', 'RUNNING'].includes(currentRun.status) && !isCorrectionSwap) {
    log.debug(
      { runId, status: currentRun.status, incrementCompleted, incrementFailed },
      'Skipping progress update - run not in PENDING/RUNNING state'
    );
    return {
      progress: currentRun.progress as ProgressData,
      status: currentRun.status,
    };
  }

  if (incrementCompleted === 0 && incrementFailed === 0) {
    // No-op, just return current state
    return {
      progress: currentRun.progress as ProgressData,
      status: currentRun.status,
    };
  }

  log.debug(
    { runId, incrementCompleted, incrementFailed },
    'Updating run progress'
  );

  // Use raw SQL for atomic JSONB increment
  // This prevents race conditions when multiple jobs complete simultaneously
  const result = await db.$queryRaw<Array<{
    id: string;
    progress: ProgressData;
    status: string;
    started_at: Date | null;
    completed_at: Date | null;
  }>>`
    UPDATE runs
    SET
      progress = jsonb_set(
        jsonb_set(
          progress,
          '{completed}',
          to_jsonb(GREATEST(0, (progress->>'completed')::int + ${incrementCompleted}))
        ),
        '{failed}',
        to_jsonb(GREATEST(0, (progress->>'failed')::int + ${incrementFailed}))
      ),
      updated_at = NOW()
    WHERE id = ${runId}
    RETURNING id, progress, status, started_at, completed_at
  `;

  const updatedRun = result[0];
  if (!updatedRun) {
    throw new NotFoundError('Run', runId);
  }

  const progress = updatedRun.progress;

  // Determine if status transition is needed
  const newStatus = determineStatus(progress, updatedRun.status);

  if (newStatus !== updatedRun.status) {
    await transitionStatus(runId, updatedRun.status, newStatus);
    log.info(
      { runId, oldStatus: updatedRun.status, newStatus, progress },
      'Run status transitioned'
    );
    return { progress, status: newStatus };
  }

  log.debug({ runId, progress }, 'Progress updated');
  return { progress, status: updatedRun.status };
}

// Valid run statuses (from Prisma enum)
type RunStatus = 'PENDING' | 'RUNNING' | 'PAUSED' | 'SUMMARIZING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/**
 * Determines the appropriate run status based on progress.
 */
function determineStatus(progress: ProgressData, currentStatus: string): RunStatus {
  const { total, completed, failed } = progress;
  const done = completed + failed;

  // If run is already in a terminal state, don't change
  if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(currentStatus)) {
    return currentStatus as RunStatus;
  }

  // If already summarizing, don't change (summarize completion handled separately)
  if (currentStatus === 'SUMMARIZING') {
    return 'SUMMARIZING';
  }

  // If run is PAUSED, keep it paused - only resumeRun can change this
  if (currentStatus === 'PAUSED') {
    // But if all jobs are done, transition to SUMMARIZING
    if (done >= total) {
      return 'SUMMARIZING';
    }
    return 'PAUSED';
  }

  // If all jobs are done, transition to SUMMARIZING (not directly to COMPLETED)
  if (done >= total) {
    return 'SUMMARIZING';
  }

  // If at least one job has completed/failed, run is RUNNING
  if (done > 0 && currentStatus === 'PENDING') {
    return 'RUNNING';
  }

  return currentStatus as RunStatus;
}

/**
 * Transitions run to a new status with appropriate timestamp updates.
 */
async function transitionStatus(
  runId: string,
  fromStatus: string,
  toStatus: RunStatus
): Promise<void> {
  const updates: Prisma.RunUpdateInput = {
    status: toStatus,
  };

  // Set startedAt when transitioning to RUNNING
  if (toStatus === 'RUNNING' && fromStatus === 'PENDING') {
    updates.startedAt = new Date();
  }

  // Set completedAt when transitioning to a terminal state
  if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(toStatus)) {
    updates.completedAt = new Date();
  }

  if (toStatus !== 'RUNNING') {
    updates.stalledModels = [];
  }

  await db.run.update({
    where: { id: runId },
    data: updates,
  });

  // When transitioning to SUMMARIZING, queue summarize jobs for all transcripts
  if (toStatus === 'SUMMARIZING') {
    await queueSummarizeJobs(runId);
  }
}

/**
 * Wait for transcript rows to settle before counting.
 *
 * When the last probe job triggers SUMMARIZING, other probe jobs may still
 * be committing their transcript rows. This polls briefly (up to 5 seconds)
 * until the DB transcript count matches the expected total from probe progress,
 * so the summarization denominator is accurate.
 */
const SETTLE_POLL_INTERVAL_MS = 500;
const SETTLE_MAX_WAIT_MS = 5_000;

async function waitForTranscriptSettle(
  runId: string,
  expectedCompleted: number,
): Promise<number> {
  const deadline = Date.now() + SETTLE_MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const count = await db.transcript.count({ where: { runId } });
    if (count >= expectedCompleted) {
      return count;
    }
    log.debug(
      { runId, dbCount: count, expected: expectedCompleted },
      'Waiting for in-flight transcript commits to settle'
    );
    await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_INTERVAL_MS));
  }

  // Timed out — return whatever we have
  const finalCount = await db.transcript.count({ where: { runId } });
  log.warn(
    { runId, dbCount: finalCount, expected: expectedCompleted },
    'Transcript settle timed out — proceeding with current count'
  );
  return finalCount;
}

/**
 * Queues summarize jobs for all transcripts in a run.
 */
async function queueSummarizeJobs(runId: string): Promise<void> {
  // Dynamic import to avoid circular dependency
  const { getBoss } = await import('../../queue/boss.js');
  const { DEFAULT_JOB_OPTIONS } = await import('../../queue/types.js');

  const boss = getBoss();

  // Read the probe progress to know how many successful transcripts to expect
  const run = await db.run.findUnique({
    where: { id: runId },
    select: { progress: true },
  });
  const probeProgress = run?.progress as ProgressData | null;
  const expectedCompleted = probeProgress?.completed ?? 0;

  // Wait for in-flight transcript commits before counting
  if (expectedCompleted > 0) {
    await waitForTranscriptSettle(runId, expectedCompleted);
  }

  // Get all transcripts for this run
  const transcripts = await db.transcript.findMany({
    where: { runId },
    select: { id: true },
  });

  if (transcripts.length === 0) {
    log.warn({ runId }, 'No transcripts to summarize, completing run');
    await db.run.update({
      where: { id: runId },
      data: { status: 'COMPLETED', completedAt: new Date(), stalledModels: [] },
    });
    return;
  }

  // Initialize summarizeProgress
  await db.run.update({
    where: { id: runId },
    data: {
      summarizeProgress: {
        total: transcripts.length,
        completed: 0,
        failed: 0,
      },
    },
  });

  log.info({ runId, transcriptCount: transcripts.length }, 'Queueing summarize jobs');

  const jobOptions = DEFAULT_JOB_OPTIONS['summarize_transcript'];

  for (const transcript of transcripts) {
    await boss.send('summarize_transcript', {
      runId,
      transcriptId: transcript.id,
    }, jobOptions);
  }

  log.info({ runId, jobCount: transcripts.length }, 'Summarize jobs queued');
}

/**
 * Increments completed count by 1.
 * Convenience wrapper for updateProgress.
 */
export async function incrementCompleted(
  runId: string
): Promise<{ progress: ProgressData; status: string }> {
  return updateProgress(runId, { incrementCompleted: 1 });
}

/**
 * Increments failed count by 1.
 * Convenience wrapper for updateProgress.
 */
export async function incrementFailed(
  runId: string
): Promise<{ progress: ProgressData; status: string }> {
  return updateProgress(runId, { incrementFailed: 1 });
}

/**
 * Gets current progress for a run.
 */
export async function getProgress(runId: string): Promise<ProgressData | null> {
  const run = await db.run.findUnique({
    where: { id: runId },
    select: { progress: true },
  });

  if (!run) {
    return null;
  }

  return run.progress as ProgressData | null;
}

/**
 * Calculates percent complete from progress data.
 */
export function calculatePercentComplete(progress: ProgressData): number {
  if (progress.total === 0) {
    return 100; // Edge case: no jobs means complete
  }
  const done = progress.completed + progress.failed;
  return Math.round((done / progress.total) * 100);
}

/**
 * Updates summarize progress atomically using PostgreSQL JSONB operators.
 * Increments the completed or failed count for transcript summarization.
 */
export async function updateSummarizeProgress(
  runId: string,
  update: { incrementCompleted?: number; incrementFailed?: number }
): Promise<ProgressData | null> {
  const { incrementCompleted = 0, incrementFailed = 0 } = update;

  if (incrementCompleted === 0 && incrementFailed === 0) {
    const run = await db.run.findUnique({
      where: { id: runId },
      select: { summarizeProgress: true },
    });
    return run?.summarizeProgress as ProgressData | null;
  }

  log.debug(
    { runId, incrementCompleted, incrementFailed },
    'Updating summarize progress'
  );

  // Use raw SQL for atomic JSONB increment
  const result = await db.$queryRaw<Array<{
    id: string;
    summarize_progress: ProgressData;
  }>>`
    UPDATE runs
    SET
      summarize_progress = jsonb_set(
        jsonb_set(
          summarize_progress,
          '{completed}',
          to_jsonb((summarize_progress->>'completed')::int + ${incrementCompleted})
        ),
        '{failed}',
        to_jsonb((summarize_progress->>'failed')::int + ${incrementFailed})
      ),
      updated_at = NOW()
    WHERE id = ${runId}
    RETURNING id, summarize_progress
  `;

  const updatedRun = result[0];
  if (!updatedRun) {
    return null;
  }

  log.debug({ runId, summarizeProgress: updatedRun.summarize_progress }, 'Summarize progress updated');
  return updatedRun.summarize_progress;
}

/**
 * Increments summarize completed count by 1.
 */
export async function incrementSummarizeCompleted(runId: string): Promise<ProgressData | null> {
  return updateSummarizeProgress(runId, { incrementCompleted: 1 });
}

/**
 * Increments summarize failed count by 1.
 */
export async function incrementSummarizeFailed(runId: string): Promise<ProgressData | null> {
  return updateSummarizeProgress(runId, { incrementFailed: 1 });
}

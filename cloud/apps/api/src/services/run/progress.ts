/**
 * Run Progress Service
 *
 * Handles atomic progress updates and status transitions for runs.
 * Uses PostgreSQL JSONB operators for concurrent-safe increments.
 */

import { db } from '@valuerank/db';
import { createLogger, NotFoundError } from '@valuerank/shared';
import { Prisma } from '@prisma/client';

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
 *    - RUNNING -> COMPLETED when all jobs done
 *    - RUNNING -> FAILED when all jobs done and some failed
 * 3. Sets startedAt/completedAt timestamps as appropriate
 */
export async function updateProgress(
  runId: string,
  update: ProgressUpdate
): Promise<{ progress: ProgressData; status: string }> {
  const { incrementCompleted = 0, incrementFailed = 0 } = update;

  if (incrementCompleted === 0 && incrementFailed === 0) {
    // No-op, just return current state
    const run = await db.run.findUnique({
      where: { id: runId },
      select: { progress: true, status: true },
    });
    if (!run) {
      throw new NotFoundError('Run', runId);
    }
    return {
      progress: run.progress as ProgressData,
      status: run.status,
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
          to_jsonb((progress->>'completed')::int + ${incrementCompleted})
        ),
        '{failed}',
        to_jsonb((progress->>'failed')::int + ${incrementFailed})
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
type RunStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

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

  // If all jobs are done
  if (done >= total) {
    // If any failed, mark as COMPLETED (we still completed, just with failures)
    // Per spec: "failures don't block completion"
    return 'COMPLETED';
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

  await db.run.update({
    where: { id: runId },
    data: updates,
  });
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

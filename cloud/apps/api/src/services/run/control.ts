/**
 * Run Control Service
 *
 * Handles run state transitions: pause, resume, cancel.
 */

import { db } from '@valuerank/db';
import { createLogger, NotFoundError, RunStateError } from '@valuerank/shared';
import { getBoss } from '../../queue/boss.js';

const log = createLogger('services:run:control');

// Valid states for pause operation
const PAUSEABLE_STATES = ['PENDING', 'RUNNING'];

// Valid states for resume operation
const RESUMEABLE_STATES = ['PAUSED'];

// Valid states for cancel operation
const CANCELLABLE_STATES = ['PENDING', 'RUNNING', 'PAUSED'];

/**
 * Pauses a run, stopping new job dispatch.
 *
 * Jobs currently being processed will complete, but no new jobs
 * will be started until the run is resumed.
 */
export async function pauseRun(runId: string): Promise<{
  id: string;
  status: string;
  progress: { total: number; completed: number; failed: number } | null;
}> {
  log.info({ runId }, 'Attempting to pause run');

  const run = await db.run.findUnique({
    where: { id: runId },
    select: { id: true, status: true, progress: true },
  });

  if (!run) {
    throw new NotFoundError('Run', runId);
  }

  if (!PAUSEABLE_STATES.includes(run.status)) {
    throw new RunStateError(runId, run.status, 'pause');
  }

  const updatedRun = await db.run.update({
    where: { id: runId },
    data: { status: 'PAUSED' },
    select: { id: true, status: true, progress: true },
  });

  log.info({ runId, previousStatus: run.status }, 'Run paused');

  return {
    id: updatedRun.id,
    status: updatedRun.status,
    progress: updatedRun.progress as { total: number; completed: number; failed: number } | null,
  };
}

/**
 * Resumes a paused run.
 *
 * Jobs will begin processing again from where they left off.
 */
export async function resumeRun(runId: string): Promise<{
  id: string;
  status: string;
  progress: { total: number; completed: number; failed: number } | null;
}> {
  log.info({ runId }, 'Attempting to resume run');

  const run = await db.run.findUnique({
    where: { id: runId },
    select: { id: true, status: true, progress: true },
  });

  if (!run) {
    throw new NotFoundError('Run', runId);
  }

  if (!RESUMEABLE_STATES.includes(run.status)) {
    throw new RunStateError(runId, run.status, 'resume');
  }

  const updatedRun = await db.run.update({
    where: { id: runId },
    data: { status: 'RUNNING' },
    select: { id: true, status: true, progress: true },
  });

  log.info({ runId }, 'Run resumed');

  return {
    id: updatedRun.id,
    status: updatedRun.status,
    progress: updatedRun.progress as { total: number; completed: number; failed: number } | null,
  };
}

/**
 * Cancels a run, removing pending jobs while preserving completed results.
 *
 * Jobs currently being processed will complete, but all pending jobs
 * will be removed from the queue.
 */
export async function cancelRun(runId: string): Promise<{
  id: string;
  status: string;
  progress: { total: number; completed: number; failed: number } | null;
}> {
  log.info({ runId }, 'Attempting to cancel run');

  const run = await db.run.findUnique({
    where: { id: runId },
    select: { id: true, status: true, progress: true },
  });

  if (!run) {
    throw new NotFoundError('Run', runId);
  }

  if (!CANCELLABLE_STATES.includes(run.status)) {
    throw new RunStateError(runId, run.status, 'cancel');
  }

  // Cancel pending jobs in PgBoss
  try {
    const boss = getBoss();

    // Query pending jobs for this run and cancel them
    // PgBoss stores jobs with data.runId, we need to cancel those
    const result = await db.$executeRaw`
      UPDATE pgboss.job
      SET state = 'cancelled'
      WHERE name = 'probe_scenario'
        AND state IN ('created', 'retry')
        AND data->>'runId' = ${runId}
    `;

    log.info({ runId, cancelledJobs: result }, 'Cancelled pending jobs');
  } catch (error) {
    // If PgBoss tables don't exist, that's fine - no jobs to cancel
    log.warn({ runId, error }, 'Failed to cancel jobs in queue (may not exist)');
  }

  const updatedRun = await db.run.update({
    where: { id: runId },
    data: {
      status: 'CANCELLED',
      completedAt: new Date(),
    },
    select: { id: true, status: true, progress: true },
  });

  log.info({ runId, previousStatus: run.status }, 'Run cancelled');

  return {
    id: updatedRun.id,
    status: updatedRun.status,
    progress: updatedRun.progress as { total: number; completed: number; failed: number } | null,
  };
}

/**
 * Checks if a run is in a paused state.
 * Used by job handlers to skip processing when paused.
 */
export async function isRunPaused(runId: string): Promise<boolean> {
  const run = await db.run.findUnique({
    where: { id: runId },
    select: { status: true },
  });

  return run?.status === 'PAUSED';
}

/**
 * Checks if a run is in a terminal state (completed, failed, cancelled).
 * Used by job handlers to skip processing.
 */
export async function isRunTerminal(runId: string): Promise<boolean> {
  const run = await db.run.findUnique({
    where: { id: runId },
    select: { status: true },
  });

  return run?.status ? ['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status) : true;
}

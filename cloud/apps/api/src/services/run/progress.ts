/**
 * Run Progress Service
 *
 * Handles derived progress reads and atomic run status transitions.
 */

import { db } from '@valuerank/db';
import { createLogger, NotFoundError } from '@valuerank/shared';
import type { RunProgress } from './derived-progress.js';

const log = createLogger('services:run:progress');

export type ProgressData = {
  total: number;
  completed: number;
  failed: number;
};

export type AdvanceRunStatusResult = {
  enteredSummarizing: boolean;
  completed: boolean;
};

async function queueSummarizeJobs(runId: string): Promise<void> {
  const { getBoss } = await import('../../queue/boss.js');
  const { DEFAULT_JOB_OPTIONS } = await import('../../queue/types.js');

  const transcripts = await db.transcript.findMany({
    where: {
      runId,
      deletedAt: null,
      summarizedAt: null,
      summarizeFailedAt: null,
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  if (transcripts.length === 0) {
    return;
  }

  const boss = getBoss();
  const jobOptions = DEFAULT_JOB_OPTIONS['summarize_transcript'];

  for (const transcript of transcripts) {
    await boss.send(
      'summarize_transcript',
      {
        runId,
        transcriptId: transcript.id,
        enqueuedAt: new Date().toISOString(),
      },
      {
        ...jobOptions,
        singletonKey: transcript.id,
      }
    );
  }

  log.info({ runId, jobCount: transcripts.length }, 'Queued summarize jobs');
}

async function triggerCompletionSideEffects(runId: string): Promise<void> {
  const { triggerBasicAnalysis } = await import('../analysis/index.js');
  const { queueComputeTokenStats } = await import('../../queue/handlers/summarize-persistence.js');
  const { deductActualProviderBalancesForRun } = await import('../budget/deduct.js');

  try {
    const prompted = await triggerBasicAnalysis(runId);
    if (prompted) {
      log.info({ runId }, 'Analysis triggered successfully');
    } else {
      log.debug({ runId }, 'Analysis not triggered');
    }
  } catch (error) {
    log.error({ runId, err: error }, 'Failed to trigger basic analysis');
  }

  try {
    await queueComputeTokenStats(runId);
  } catch (error) {
    log.error({ runId, err: error }, 'Failed to queue token stats computation');
  }

  try {
    await deductActualProviderBalancesForRun(runId);
  } catch (error) {
    log.error({ runId, err: error }, 'Failed to deduct provider balances');
  }
}

async function maybeTransitionToSummarizing(runId: string): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    UPDATE "runs"
    SET "status" = 'SUMMARIZING',
        "stalled_models" = ARRAY[]::text[],
        "updated_at" = NOW()
    WHERE "id" = ${runId}
      AND "deleted_at" IS NULL
      AND "status" IN ('RUNNING', 'PAUSED')
      AND (
        SELECT COUNT(*)
        FROM "probe_results"
        WHERE "run_id" = ${runId}
          AND "status" IN ('SUCCESS', 'FAILED')
          AND "deleted_at" IS NULL
      ) >= COALESCE((progress->>'total')::int, 0)
    RETURNING "id"
  `;

  return rows.length === 1;
}

async function maybeTransitionToCompleted(runId: string): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    UPDATE "runs"
    SET "status" = 'COMPLETED',
        "completed_at" = NOW(),
        "stalled_models" = ARRAY[]::text[],
        "updated_at" = NOW()
    WHERE "id" = ${runId}
      AND "deleted_at" IS NULL
      AND "status" = 'SUMMARIZING'
      AND NOT EXISTS (
        SELECT 1
        FROM "transcripts"
        WHERE "run_id" = ${runId}
          AND "deleted_at" IS NULL
          AND "summarized_at" IS NULL
          AND "summarize_failed_at" IS NULL
      )
    RETURNING "id"
  `;

  return rows.length === 1;
}

async function maybeCompleteEmptyRun(runId: string): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    UPDATE "runs"
    SET "status" = 'COMPLETED',
        "started_at" = COALESCE("started_at", NOW()),
        "completed_at" = NOW(),
        "stalled_models" = ARRAY[]::text[],
        "updated_at" = NOW()
    WHERE "id" = ${runId}
      AND "deleted_at" IS NULL
      AND "status" = 'PENDING'
      AND COALESCE((progress->>'total')::int, 0) = 0
    RETURNING "id"
  `;

  return rows.length === 1;
}

/**
 * Advances the run status using atomic compare-and-swap updates.
 *
 * Two-gate chain:
 * 1. RUNNING / PAUSED -> SUMMARIZING when probe completion reaches the stored total.
 * 2. SUMMARIZING -> COMPLETED when there are no live transcripts left to summarize.
 *
 * These gates replace the old read-then-write completion logic.
 */
export async function maybeAdvanceRunStatus(runId: string): Promise<AdvanceRunStatusResult> {
  const run = await db.run.findUnique({
    where: { id: runId },
    select: {
      status: true,
      progress: true,
      deletedAt: true,
    },
  });

  if (run === null) {
    throw new NotFoundError('Run', runId);
  }

  if (run.deletedAt !== null) {
    log.debug({ runId }, 'Skipping status advance for deleted run');
    return { enteredSummarizing: false, completed: false };
  }

  const total = (() => {
    const progress = run.progress as ProgressData | null;
    return progress?.total ?? 0;
  })();

  if (run.status === 'PENDING' && total === 0) {
    const completed = await maybeCompleteEmptyRun(runId);
    if (completed) {
      log.info({ runId }, 'Completed zero-probe run at launch');
      await triggerCompletionSideEffects(runId);
    }
    return { enteredSummarizing: false, completed };
  }

  const enteredSummarizing = await maybeTransitionToSummarizing(runId);
  if (enteredSummarizing) {
    log.info({ runId }, 'Run entered SUMMARIZING');
    await queueSummarizeJobs(runId);
  }

  const completed = await maybeTransitionToCompleted(runId);
  if (completed) {
    log.info({ runId }, 'Run completed');
    await triggerCompletionSideEffects(runId);
  }

  return { enteredSummarizing, completed };
}

/**
 * Gets current progress JSON for a run.
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
 * Calculates percent complete from derived progress data.
 */
export function calculatePercentComplete(progress: Pick<RunProgress, 'total' | 'completed' | 'failed'>): number {
  if (progress.total === 0) {
    return 100;
  }

  const done = progress.completed + progress.failed;
  return Math.min(100, Math.round((done / progress.total) * 100));
}

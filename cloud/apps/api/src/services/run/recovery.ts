/**
 * Run Recovery Service
 *
 * Detects and recovers orphaned runs - runs stuck in RUNNING/SUMMARIZING state
 * with no active/pending jobs in the queue.
 *
 * This handles scenarios like:
 * - API restart during job processing (jobs orphaned)
 * - Power outage / pod eviction
 * - Jobs that expired and exhausted retries without updating run progress
 */

import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { findMissingProbes } from './coverage-completeness.js';
import { computeRunProgress } from './derived-progress.js';
import { maybeAdvanceRunStatus } from './progress.js';
import { ACTIVE_PROBE_QUEUE_SQL } from '../queue/probe-queues.js';
import {
  countJobsForRun,
  requeueMissingProbes,
  queueSummarizeJobsForRecovery,
} from './recovery-jobs.js';

const log = createLogger('services:run:recovery');

// How long a run must be stuck before we consider it orphaned (5 minutes)
const STUCK_THRESHOLD_MINUTES = 5;

// How often to run recovery (set by scheduled job)
export const RECOVERY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export type OrphanedRunInfo = {
  runId: string;
  status: string;
  progress: { total: number; completed: number; failed: number };
  pendingJobs: number;
  activeJobs: number;
  missingProbes: number;
  stuckMinutes: number;
};

export type RecoveryResult = {
  detected: OrphanedRunInfo[];
  recovered: Array<{ runId: string; action: string; requeuedCount?: number }>;
  errors: Array<{ runId: string; error: string }>;
};

/**
 * Detects orphaned runs by comparing run progress with actual queue state.
 *
 * A run is considered orphaned if:
 * 1. Status is RUNNING or SUMMARIZING
 * 2. No pending or active jobs exist for this run
 * 3. Progress shows incomplete (completed + failed < total)
 * 4. Last update was > STUCK_THRESHOLD_MINUTES ago
 */
export async function detectOrphanedRuns(): Promise<OrphanedRunInfo[]> {
  const orphaned: OrphanedRunInfo[] = [];

  // Find runs that might be stuck.
  // PENDING is included as defense-in-depth: post-PR #745, non-empty runs are
  // created in `RUNNING` so they should not normally appear here, but if
  // anything ever leaves a run stuck in `PENDING` we still want recovery to
  // catch it instead of silently ignoring the row.
  const stuckRuns = await db.run.findMany({
    where: {
      status: { in: ['PENDING', 'RUNNING', 'SUMMARIZING'] },
      updatedAt: {
        lt: new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000),
      },
      deletedAt: null,
    },
    select: {
      id: true,
      status: true,
      progress: true,
      updatedAt: true,
      config: true,
    },
  });

  if (stuckRuns.length === 0) {
    return [];
  }

  log.debug({ stuckRunCount: stuckRuns.length }, 'Checking potentially stuck runs');

  for (const run of stuckRuns) {
    const progress = run.progress as { total: number; completed: number; failed: number };

    // Count pending/active jobs for this run in PgBoss
    const jobCounts = await countJobsForRun(run.id);

    if (jobCounts.pending === 0 && jobCounts.active === 0) {
      // Coverage check is based on expected scenario/model/sample keys, not progress counters.
      // This catches runs where progress counters are inaccurate due retries/duplicates.
      const missingProbes = await findMissingProbes(run.id);
      const stuckMinutes = Math.floor(
        (Date.now() - run.updatedAt.getTime()) / (60 * 1000)
      );

      orphaned.push({
        runId: run.id,
        status: run.status,
        progress,
        pendingJobs: jobCounts.pending,
        activeJobs: jobCounts.active,
        missingProbes: missingProbes.length,
        stuckMinutes,
      });

      log.info(
        {
          runId: run.id,
          status: run.status,
          progress,
          missingProbes: missingProbes.length,
          stuckMinutes,
        },
        'Detected orphaned run'
      );
    }
  }

  return orphaned;
}

/**
 * Recovers a single orphaned run by re-queuing missing probes.
 */
export async function recoverOrphanedRun(
  runId: string
): Promise<{ action: string; requeuedCount?: number }> {
  const run = await db.run.findUnique({
    where: { id: runId },
    select: { status: true, startedAt: true },
  });

  if (run?.status === 'CANCELLED') {
    log.info({ runId }, 'Skipping recovery for cancelled run');
    return { action: 'run_cancelled' };
  }

  const missingProbes = await findMissingProbes(runId);

  if (missingProbes.length === 0) {
    // No missing probes - check if we need to trigger summarization
    const currentRun = await db.run.findUnique({
      where: { id: runId },
      select: { status: true, progress: true },
    });

    if (currentRun?.status === 'RUNNING') {
      const progress = await computeRunProgress(runId);
      if (progress.completed + progress.failed >= progress.total) {
        // Progress complete, trigger summarization
        log.info({ runId }, 'Triggering summarization for completed run');
        const advanceResult = await maybeAdvanceRunStatus(runId);
        if (advanceResult.enteredSummarizing) {
          return { action: 'triggered_summarization' };
        }
      }
    }

    // Check if run is in SUMMARIZING but has no pending summarize jobs
    if (currentRun?.status === 'SUMMARIZING') {
      const pendingSummarizeJobs = await db.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM pgboss.job
        WHERE name = 'summarize_transcript'
          AND state IN ('created', 'retry', 'active')
          AND data->>'runId' = ${runId}
      `;

      const pendingCount = Number(pendingSummarizeJobs[0]?.count ?? 0);

      if (pendingCount === 0) {
        // Check if there are unsummarized transcripts
        const unsummarizedCount = await db.transcript.count({
          where: { runId, deletedAt: null, summarizedAt: null, summarizeFailedAt: null },
        });

        if (unsummarizedCount > 0) {
          // Re-queue summarize jobs
          const queuedCount = await queueSummarizeJobsForRecovery(runId);
          log.info({ runId, queuedCount }, 'Re-queued orphaned summarize jobs');
          return { action: 'requeued_summarize_jobs', requeuedCount: queuedCount };
        } else {
          // All transcripts summarized, mark as complete
          log.info({ runId }, 'All transcripts summarized, completing run');
          const advanceResult = await maybeAdvanceRunStatus(runId);
          if (advanceResult.completed) {
            return { action: 'completed_run' };
          }
        }
      }
    }

    return { action: 'no_missing_probes' };
  }

  // Ensure run is set to RUNNING so re-queued probe jobs are not skipped as terminal.
  // (COMPLETED/FAILED runs can be manually recovered if missing probes are detected.)
  const shouldResume = run !== null && run.status !== 'RUNNING';
  await db.run.update({
    where: { id: runId },
    data: {
      status: shouldResume ? 'RUNNING' : undefined,
      completedAt: shouldResume ? null : undefined,
      startedAt: shouldResume && run.startedAt === null ? new Date() : undefined,
      updatedAt: new Date(),
    },
  });

  // Re-queue missing probes after status update.
  // This avoids workers skipping jobs when a run was previously terminal.
  const requeuedCount = await requeueMissingProbes(runId, missingProbes);

  // Log details about missing probes (include full details if small number)
  const logDetails = missingProbes.length <= 10
    ? { runId, requeuedCount, missingProbes }
    : { runId, requeuedCount, missingCount: missingProbes.length, sample: missingProbes.slice(0, 5) };
  log.info(logDetails, 'Recovered orphaned run');

  return { action: 'requeued_probes', requeuedCount };
}

/**
 * Detects and recovers all orphaned runs.
 * This is the main entry point for scheduled recovery.
 */
export async function recoverOrphanedRuns(): Promise<RecoveryResult> {
  const result: RecoveryResult = {
    detected: [],
    recovered: [],
    errors: [],
  };

  try {
    // Detect orphaned runs
    result.detected = await detectOrphanedRuns();

    if (result.detected.length === 0) {
      log.debug('No orphaned runs detected');
      return result;
    }

    log.info(
      { orphanedCount: result.detected.length },
      'Recovering orphaned runs'
    );

    // Recover each orphaned run
    for (const orphaned of result.detected) {
      try {
        const recovery = await recoverOrphanedRun(orphaned.runId);
        result.recovered.push({
          runId: orphaned.runId,
          ...recovery,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error({ runId: orphaned.runId, error: errorMessage }, 'Failed to recover run');
        result.errors.push({
          runId: orphaned.runId,
          error: errorMessage,
        });
      }
    }

    log.info(
      {
        detected: result.detected.length,
        recovered: result.recovered.length,
        errors: result.errors.length,
      },
      'Orphaned run recovery complete'
    );
  } catch (error) {
    log.error({ error }, 'Failed to run orphaned run recovery');
    throw error;
  }

  return result;
}

/**
 * Runs recovery immediately on startup.
 * Called once when the API server starts to recover any runs
 * that were orphaned during the previous shutdown.
 */
export async function runStartupRecovery(): Promise<RecoveryResult> {
  log.info('Running startup recovery for orphaned runs');
  // Run both standard recovery and zombie detection
  const result = await recoverOrphanedRuns();
  const zombieResult = await detectAndRecoverStuckJobs();

  if (zombieResult.recovered > 0) {
    log.info({ count: zombieResult.recovered }, 'Startup recovery killed zombie jobs');
  }

  return result;
}

/**
 * Detects and recovers stuck jobs (zombies) that have been active for too long.
 * This is a failsafe for when PgBoss expiration mechanisms fail or job handlers crash silently.
 */
export async function detectAndRecoverStuckJobs(): Promise<{ recovered: number; errors: number }> {
  // Active-execution timeout. The Python process timeout is 300s (5m), so no legitimate
  // probe can run longer than that. We add a 2-minute buffer (for SIGTERM cleanup and
  // pgboss write) to arrive at 7m. This is a 4x improvement over the previous 30m
  // threshold while still giving the longest real calls (deepseek-reasoner p99 ~51s,
  // max ~299s) room to complete before the watchdog fires.
  const ZOMBIE_THRESHOLD_MINUTES = 7;

  const stuckJobs = await db.$queryRaw<Array<{ id: string; name: string; run_id: string }>>`
    SELECT id, name, data->>'runId' as run_id
    FROM pgboss.job
    WHERE state = 'active'
      AND started_on < NOW() - (${ZOMBIE_THRESHOLD_MINUTES} || ' minutes')::interval
      AND ${ACTIVE_PROBE_QUEUE_SQL}
  `;

  if (stuckJobs.length === 0) {
    return { recovered: 0, errors: 0 };
  }

  log.warn(
    { count: stuckJobs.length, thresholdMinutes: ZOMBIE_THRESHOLD_MINUTES },
    'Detected zombie jobs'
  );

  let recovered = 0;
  let errors = 0;

  const errorOutput = JSON.stringify({
    error: `Zombie job detected and killed by watchdog (active > ${ZOMBIE_THRESHOLD_MINUTES}m)`,
  });

  for (const job of stuckJobs) {
    try {
      // Force fail the job
      await db.$executeRaw`
        UPDATE pgboss.job
        SET state = 'failed',
            output = ${errorOutput}::jsonb,
            completed_on = NOW()
        WHERE id = ${job.id}::uuid
      `;

      log.info({ jobId: job.id, runId: job.run_id }, 'Killed zombie job');
      recovered++;
    } catch (err) {
      log.error({ jobId: job.id, err }, 'Failed to kill zombie job');
      errors++;
    }
  }

  return { recovered, errors };
}

/**
 * Run Recovery Scheduler
 *
 * Manages the periodic recovery job that detects and recovers orphaned runs.
 * Uses setInterval for simplicity - PgBoss schedule() is for distributed cron,
 * but we only need one instance running recovery.
 *
 * Activity-based scheduling:
 * - Recovery only runs for 1 hour after the last run was started
 * - When a new run starts, the activity timeout is reset
 * - This prevents wasting resources checking for orphaned runs when no runs are active
 */

import { db, Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import {
  recoverOrphanedRuns,
  detectAndRecoverStuckJobs,
  RECOVERY_INTERVAL_MS,
  runStartupRecovery
} from './recovery.js';
import { detectAndUpdateStalledRuns } from './stall-detection.js';
import {
  ORPHAN_TRANSCRIPT_MIN_AGE_SECONDS,
  RECENT_COMPLETED_RUN_WINDOW_DAYS,
} from './anomaly-thresholds.js';
import { PROBE_QUEUE_DEPTH_PER_PROVIDER } from './start-queue.js';
import { enqueueTopUpProbesSingleton } from '../../queue/handlers/top-up-probes.js';
import { DEFAULT_JOB_OPTIONS } from '../../queue/types.js';
import { getBoss } from '../../queue/boss.js';
import { getQueueNameForModel } from '../parallelism/index.js';

const log = createLogger('services:run:scheduler');

type RunConfig = {
  models?: string[];
};

let recoveryInterval: NodeJS.Timeout | null = null;
let activityTimeout: NodeJS.Timeout | null = null;
let isRecovering = false;
let reconcileWindowDaysCache: number | null = null;

// How long to keep recovery running after the last run was started (1 hour)
export const RECOVERY_ACTIVITY_WINDOW_MS = 60 * 60 * 1000;

function parseRunConfig(config: unknown): RunConfig {
  return config !== null && typeof config === 'object' ? (config as RunConfig) : {};
}

function resolveReconcileWindowDays(): number {
  const rawValue = process.env.RUN_RECONCILE_WINDOW_DAYS;
  if (rawValue === undefined) {
    return RECENT_COMPLETED_RUN_WINDOW_DAYS;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    log.warn(
      { rawValue, fallbackDays: RECENT_COMPLETED_RUN_WINDOW_DAYS },
      'Invalid RUN_RECONCILE_WINDOW_DAYS, falling back to default'
    );
    return RECENT_COMPLETED_RUN_WINDOW_DAYS;
  }

  return parsed;
}

// Read once at module load. Changing RUN_RECONCILE_WINDOW_DAYS requires a process restart.
reconcileWindowDaysCache = resolveReconcileWindowDays();

export function getReconcileWindowDays(): number {
  return reconcileWindowDaysCache ?? RECENT_COMPLETED_RUN_WINDOW_DAYS;
}

function buildOrphanBacklogExistsClause(): Prisma.Sql {
  return Prisma.sql`
    EXISTS (
      SELECT 1
      FROM transcripts t
      LEFT JOIN probe_results p
        ON p.run_id = t.run_id
       AND p.scenario_id = t.scenario_id
       AND p.model_id = t.model_id
       AND p.sample_index = t.sample_index
       AND p.deleted_at IS NULL
      WHERE t.run_id = r.id
        AND t.deleted_at IS NULL
        AND t.created_at < NOW() - (${ORPHAN_TRANSCRIPT_MIN_AGE_SECONDS} || ' seconds')::interval
        AND p.id IS NULL
      LIMIT 1
    )
  `;
}

async function getPendingJobsForQueue(runId: string, queueName: string): Promise<number> {
  const rows = await db.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count
    FROM pgboss.job
    WHERE name = ${queueName}
      AND data->>'runId' = ${runId}
      AND state IN ('created', 'retry', 'active')
  `;

  return Number(rows[0]?.count ?? 0);
}

async function sweepRunForTopUp(run: { id: string; config: unknown }): Promise<boolean> {
  const models = parseRunConfig(run.config).models ?? [];
  if (models.length === 0) {
    return false;
  }

  const queueNames = new Set<string>();
  for (const modelId of models) {
    queueNames.add(await getQueueNameForModel(modelId));
  }

  for (const queueName of queueNames) {
    const pendingJobs = await getPendingJobsForQueue(run.id, queueName);
    if (pendingJobs < PROBE_QUEUE_DEPTH_PER_PROVIDER / 2) {
      await enqueueTopUpProbesSingleton(run.id);
      log.debug({ runId: run.id, queueName, pendingJobs }, 'Queued recovery top-up sweep');
      return true;
    }
  }

  return false;
}

async function hasRecoveryActivity(): Promise<boolean> {
  const windowDays = getReconcileWindowDays();
  const activeRuns = await db.run.findFirst({
    where: {
      deletedAt: null,
      status: { in: ['RUNNING', 'SUMMARIZING', 'PAUSED'] },
    },
    select: { id: true },
  });

  if (activeRuns !== null) {
    return true;
  }

  const strandedTranscript = await db.transcript.findFirst({
    where: {
      deletedAt: null,
      summarizedAt: null,
      summarizeFailedAt: null,
      run: {
        deletedAt: null,
        status: 'COMPLETED',
        updatedAt: {
          gt: new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000),
        },
      },
    },
    select: { id: true },
  });

  if (strandedTranscript !== null) {
    return true;
  }

  const orphanBacklog = await db.$queryRaw<Array<{ run_id: string }>>`
    SELECT r.id AS run_id
    FROM runs r
    WHERE r.deleted_at IS NULL
      AND r.status = 'COMPLETED'
      AND r.updated_at > NOW() - (${windowDays} || ' days')::interval
      AND ${buildOrphanBacklogExistsClause()}
    LIMIT 1
  `;

  if (orphanBacklog.length > 0) {
    return true;
  }

  // Wake on lingering open anomalies even when transcript state is clean.
  // The reconciler clears stale default-source anomalies via
  // syncAnomalies(..., [], 'default'), but only when it actually runs. Without
  // this check, an idle system can't auto-resolve anomalies that have already
  // self-cleared underneath, leaving rows in run_anomalies forever.
  const staleAnomaly = await db.runAnomaly.findFirst({
    where: {
      resolvedAt: null,
      source: 'default',
      run: {
        deletedAt: null,
        status: 'COMPLETED',
        updatedAt: {
          gt: new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000),
        },
      },
    },
    select: { id: true },
  });

  return staleAnomaly !== null;
}

export async function enqueueRunStateReconcileJobs(): Promise<number> {
  const boss = getBoss();
  const jobOptions = DEFAULT_JOB_OPTIONS['run_state_reconcile'];
  const windowDays = getReconcileWindowDays();

  const runs = await db.$queryRaw<Array<{ run_id: string }>>`
    SELECT id AS run_id
    FROM runs
    WHERE deleted_at IS NULL
      AND status IN ('RUNNING', 'SUMMARIZING', 'PAUSED')

    UNION

    SELECT DISTINCT r.id AS run_id
    FROM runs r
    WHERE r.deleted_at IS NULL
      AND r.status = 'COMPLETED'
      AND r.updated_at > NOW() - (${windowDays} || ' days')::interval
      AND (
        EXISTS (
          SELECT 1
          FROM transcripts stranded_t
          WHERE stranded_t.run_id = r.id
            AND stranded_t.deleted_at IS NULL
            AND stranded_t.summarized_at IS NULL
            AND stranded_t.summarize_failed_at IS NULL
          LIMIT 1
        )
        OR ${buildOrphanBacklogExistsClause()}
        -- Also pick up runs that have lingering open anomalies, even if the
        -- underlying transcript state is clean. Without this, an anomaly that
        -- was created (source='default') but later self-cleared has no path
        -- to auto-resolution -- the reconciler skips clean runs, so
        -- syncAnomalies(..., [], 'default') never fires to mark it resolved.
        OR EXISTS (
          SELECT 1
          FROM run_anomalies ra
          WHERE ra.run_id = r.id
            AND ra.resolved_at IS NULL
            AND ra.source = 'default'
          LIMIT 1
        )
      )
  `;

  let queued = 0;
  for (const run of runs) {
    await boss.send(
      'run_state_reconcile',
      { runId: run.run_id },
      {
        ...jobOptions,
        singletonKey: run.run_id,
      }
    );
    queued++;
  }

  if (queued > 0) {
    log.info({ queued }, 'Queued run_state_reconcile jobs');
  }

  return queued;
}

/**
 * Runs the recovery job, preventing concurrent executions.
 */
async function runRecoveryJob(): Promise<void> {
  if (isRecovering) {
    log.debug('Recovery already in progress, skipping');
    return;
  }

  isRecovering = true;
  try {
    const result = await recoverOrphanedRuns();
    const zombieResult = await detectAndRecoverStuckJobs();
    const stallResult = await detectAndUpdateStalledRuns();
    const runningRuns = await db.run.findMany({
      where: { status: 'RUNNING', deletedAt: null },
      select: { id: true, config: true },
    });

    let topUpQueued = 0;
    for (const run of runningRuns) {
      if (await sweepRunForTopUp(run)) {
        topUpQueued++;
      }
    }

    const reconcileQueued = await enqueueRunStateReconcileJobs();

    if (
      result.detected.length > 0 ||
      result.errors.length > 0 ||
      zombieResult.recovered > 0 ||
      topUpQueued > 0 ||
      reconcileQueued > 0
    ) {
      log.info(
        {
          detected: result.detected.length,
          recovered: result.recovered.length,
          zombiesKilled: zombieResult.recovered,
          errors: result.errors.length + zombieResult.errors,
          recoveryTopUps: topUpQueued,
          reconcileQueued,
        },
        'Recovery job completed'
      );
    }

    if (await hasRecoveryActivity()) {
      signalRunActivity();
    }

    if (stallResult.totalStalled > 0) {
      // Keep scheduler alive while stalls persist (not just when new stalls appear)
      signalRunActivity();
    }
  } catch (error) {
    log.error({ error }, 'Recovery job failed');
  } finally {
    isRecovering = false;
  }
}

/**
 * Clears the activity timeout if set.
 */
function clearActivityTimeout(): void {
  if (activityTimeout !== null) {
    clearTimeout(activityTimeout);
    activityTimeout = null;
  }
}

/**
 * Starts the activity timeout that will stop recovery after RECOVERY_ACTIVITY_WINDOW_MS.
 */
function startActivityTimeout(): void {
  clearActivityTimeout();

  activityTimeout = setTimeout(() => {
    log.info(
      { windowMs: RECOVERY_ACTIVITY_WINDOW_MS },
      'Activity window expired, stopping recovery scheduler'
    );
    stopRecoveryInterval();
  }, RECOVERY_ACTIVITY_WINDOW_MS);
}

async function registerRunStateAuditSchedule(): Promise<void> {
  try {
    const boss = getBoss();
    await boss.unschedule('run_state_audit').catch(() => undefined);
    await boss.schedule('run_state_audit', '0 9 * * *', {});
    log.info(
      { jobType: 'run_state_audit', cron: '0 9 * * *' },
      'Registered run_state_audit schedule'
    );
  } catch (error) {
    log.error({ error }, 'Failed to register run_state_audit schedule');
  }
}

async function registerAnalysisResultJanitorSchedule(): Promise<void> {
  try {
    const boss = getBoss();
    await boss.unschedule('analysis_result_janitor').catch(() => undefined);
    await boss.schedule('analysis_result_janitor', '0 10 * * *', {});
    log.info(
      { jobType: 'analysis_result_janitor', cron: '0 10 * * *' },
      'Registered analysis_result_janitor schedule'
    );
  } catch (error) {
    log.error({ error }, 'Failed to register analysis_result_janitor schedule');
  }
}

/**
 * Stops only the recovery interval (not the activity tracking).
 */
function stopRecoveryInterval(): void {
  if (recoveryInterval !== null) {
    clearInterval(recoveryInterval);
    recoveryInterval = null;
    log.info('Recovery interval stopped');
  }
}

/**
 * Starts the recovery interval if not already running.
 */
function startRecoveryInterval(): void {
  if (recoveryInterval !== null) {
    return; // Already running
  }

  recoveryInterval = setInterval(() => { void runRecoveryJob(); }, RECOVERY_INTERVAL_MS);
  log.info({ intervalMs: RECOVERY_INTERVAL_MS }, 'Recovery interval started');
}

/**
 * Signals that a run has been started.
 * This resets the activity window and ensures recovery is running.
 */
export function signalRunActivity(): void {
  log.debug('Run activity signaled, resetting activity window');

  // Ensure recovery is running
  startRecoveryInterval();

  // Reset the activity timeout
  startActivityTimeout();
}

/**
 * Starts the recovery scheduler.
 * Runs recovery immediately on startup, then schedules periodic recovery
 * only if there are active runs (detected during startup recovery).
 */
export async function startRecoveryScheduler(): Promise<void> {
  if (recoveryInterval !== null) {
    log.warn('Recovery scheduler already running');
    return;
  }

  log.info(
    { intervalMs: RECOVERY_INTERVAL_MS, activityWindowMs: RECOVERY_ACTIVITY_WINDOW_MS },
    'Starting recovery scheduler'
  );

  await registerRunStateAuditSchedule();
  await registerAnalysisResultJanitorSchedule();

  // Run startup recovery first
  let hasActiveRuns = false;
  try {
    const startupResult = await runStartupRecovery();
    if (startupResult.detected.length > 0) {
      log.info(
        {
          detected: startupResult.detected.length,
          recovered: startupResult.recovered.length,
          errors: startupResult.errors.length,
        },
        'Startup recovery completed'
      );
      // If we found orphaned runs, keep recovery running
      hasActiveRuns = true;
    }
    if (!hasActiveRuns) {
      hasActiveRuns = await hasRecoveryActivity();
    }
  } catch (error) {
    log.error({ error }, 'Startup recovery failed');
    // Don't throw - we still want to proceed
  }

  // Only start the interval if we found active runs during startup
  if (hasActiveRuns) {
    startRecoveryInterval();
    startActivityTimeout();
    log.info('Recovery scheduler started (active runs detected)');
  } else {
    log.info('Recovery scheduler initialized but not running (no active runs)');
  }
}

/**
 * Stops the recovery scheduler completely (interval and activity timeout).
 */
export function stopRecoveryScheduler(): void {
  stopRecoveryInterval();
  clearActivityTimeout();
  log.info('Recovery scheduler stopped');
}

/**
 * Checks if the recovery scheduler is running.
 */
export function isRecoverySchedulerRunning(): boolean {
  return recoveryInterval !== null;
}

/**
 * Manually triggers a recovery run (for debugging/admin).
 */
export async function triggerRecovery(): Promise<{
  detected: number;
  recovered: number;
  errors: number;
}> {
  const result = await recoverOrphanedRuns();
  return {
    detected: result.detected.length,
    recovered: result.recovered.length,
    errors: result.errors.length,
  };
}

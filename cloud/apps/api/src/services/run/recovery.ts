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
import { getBoss } from '../../queue/boss.js';
import { DEFAULT_JOB_OPTIONS } from '../../queue/types.js';
import { getQueueNameForModel } from '../parallelism/index.js';

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

  // Find runs that might be stuck
  const stuckRuns = await db.run.findMany({
    where: {
      status: { in: ['RUNNING', 'SUMMARIZING'] },
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
    const done = progress.completed + progress.failed;

    // Check if run is actually incomplete
    if (done >= progress.total) {
      // Progress shows complete, but status not updated - different issue
      // This might be a stuck summarization, handle separately
      if (run.status === 'RUNNING') {
        log.warn(
          { runId: run.id, progress },
          'Run progress complete but status still RUNNING - triggering summarization'
        );
        // This is an edge case - we'll handle it in recovery
      }
      continue;
    }

    // Count pending/active jobs for this run in PgBoss
    const jobCounts = await countJobsForRun(run.id);

    if (jobCounts.pending === 0 && jobCounts.active === 0) {
      const stuckMinutes = Math.floor(
        (Date.now() - run.updatedAt.getTime()) / (60 * 1000)
      );

      orphaned.push({
        runId: run.id,
        status: run.status,
        progress,
        pendingJobs: jobCounts.pending,
        activeJobs: jobCounts.active,
        missingProbes: progress.total - done,
        stuckMinutes,
      });

      log.info(
        {
          runId: run.id,
          status: run.status,
          progress,
          missingProbes: progress.total - done,
          stuckMinutes,
        },
        'Detected orphaned run'
      );
    }
  }

  return orphaned;
}

/**
 * Counts pending and active jobs for a specific run across all probe queues.
 */
async function countJobsForRun(runId: string): Promise<{ pending: number; active: number }> {
  // Query PgBoss job table directly for accurate counts
  const result = await db.$queryRaw<Array<{ state: string; count: bigint }>>`
    SELECT state, COUNT(*) as count
    FROM pgboss.job
    WHERE (name = 'probe_scenario' OR name LIKE 'probe_scenario_%')
      AND state IN ('created', 'retry', 'active')
      AND data->>'runId' = ${runId}
    GROUP BY state
  `;

  let pending = 0;
  let active = 0;

  for (const row of result) {
    const count = Number(row.count);
    if (row.state === 'active') {
      active = count;
    } else {
      pending += count; // 'created' and 'retry' are both pending
    }
  }

  return { pending, active };
}

/**
 * Finds which scenario+model+sampleIndex combinations are missing transcripts for a run.
 * Handles multi-sample runs where samplesPerScenario > 1.
 */
async function findMissingProbes(
  runId: string
): Promise<Array<{ scenarioId: string; modelId: string; sampleIndex: number }>> {
  // Get run config to know which models were requested and samples per scenario
  const run = await db.run.findUnique({
    where: { id: runId },
    select: {
      config: true,
      scenarioSelections: {
        select: { scenarioId: true },
      },
    },
  });

  if (!run) {
    return [];
  }

  const config = run.config as { models: string[]; samplesPerScenario?: number };
  const models = config.models || [];
  const samplesPerScenario = config.samplesPerScenario ?? 1;
  const scenarioIds = run.scenarioSelections.map((s) => s.scenarioId);

  // Get existing transcripts for this run (include sampleIndex for multi-sample runs)
  const existingTranscripts = await db.transcript.findMany({
    where: { runId },
    select: { scenarioId: true, modelId: true, sampleIndex: true },
  });

  // Build set of existing scenario+model+sampleIndex triples
  const existingTriples = new Set(
    existingTranscripts.map((t) => `${t.scenarioId}:${t.modelId}:${t.sampleIndex}`)
  );

  // Find missing triples
  const missing: Array<{ scenarioId: string; modelId: string; sampleIndex: number }> = [];

  for (const modelId of models) {
    for (const scenarioId of scenarioIds) {
      for (let sampleIndex = 0; sampleIndex < samplesPerScenario; sampleIndex++) {
        const key = `${scenarioId}:${modelId}:${sampleIndex}`;
        if (!existingTriples.has(key)) {
          missing.push({ scenarioId, modelId, sampleIndex });
        }
      }
    }
  }

  return missing;
}

/**
 * Re-queues missing probe jobs for an orphaned run.
 * Handles multi-sample runs by including sampleIndex in job data.
 */
async function requeueMissingProbes(
  runId: string,
  missingProbes: Array<{ scenarioId: string; modelId: string; sampleIndex: number }>
): Promise<number> {
  const boss = getBoss();
  if (!boss) {
    throw new Error('PgBoss not initialized');
  }

  const jobOptions = DEFAULT_JOB_OPTIONS['probe_scenario'];
  let queuedCount = 0;

  for (const { scenarioId, modelId, sampleIndex } of missingProbes) {
    const queueName = await getQueueNameForModel(modelId);

    await boss.send(
      queueName,
      {
        runId,
        scenarioId,
        modelId,
        sampleIndex,
        config: {
          temperature: 0.7,
          maxTurns: 10,
        },
      },
      jobOptions
    );

    queuedCount++;
  }

  log.info({ runId, queuedCount }, 'Re-queued missing probe jobs');
  return queuedCount;
}

/**
 * Queues summarize jobs for all transcripts in a run.
 * Duplicated from progress.ts since that function is private.
 */
async function queueSummarizeJobsForRecovery(runId: string): Promise<number> {
  const boss = getBoss();
  if (!boss) {
    throw new Error('PgBoss not initialized for summarization');
  }

  // Get all transcripts for this run that haven't been summarized
  const transcripts = await db.transcript.findMany({
    where: { runId, summarizedAt: null },
    select: { id: true },
  });

  if (transcripts.length === 0) {
    return 0;
  }

  const jobOptions = DEFAULT_JOB_OPTIONS['summarize_transcript'];

  for (const transcript of transcripts) {
    await boss.send('summarize_transcript', {
      runId,
      transcriptId: transcript.id,
    }, jobOptions);
  }

  log.info({ runId, jobCount: transcripts.length }, 'Queued summarize jobs for recovery');
  return transcripts.length;
}

/**
 * Recovers a single orphaned run by re-queuing missing probes.
 */
export async function recoverOrphanedRun(
  runId: string
): Promise<{ action: string; requeuedCount?: number }> {
  const missingProbes = await findMissingProbes(runId);

  if (missingProbes.length === 0) {
    // No missing probes - check if we need to trigger summarization
    const run = await db.run.findUnique({
      where: { id: runId },
      select: { status: true, progress: true },
    });

    if (run?.status === 'RUNNING') {
      const progress = run.progress as { total: number; completed: number; failed: number };
      if (progress.completed + progress.failed >= progress.total) {
        // Progress complete, trigger summarization
        log.info({ runId }, 'Triggering summarization for completed run');
        await db.run.update({
          where: { id: runId },
          data: { status: 'SUMMARIZING' },
        });

        // Queue summarize jobs for unsummarized transcripts
        const queuedCount = await queueSummarizeJobsForRecovery(runId);
        return { action: 'triggered_summarization', requeuedCount: queuedCount };
      }
    }

    // Check if run is in SUMMARIZING but has no pending summarize jobs
    if (run?.status === 'SUMMARIZING') {
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
          where: { runId, summarizedAt: null },
        });

        if (unsummarizedCount > 0) {
          // Re-queue summarize jobs
          const queuedCount = await queueSummarizeJobsForRecovery(runId);
          log.info({ runId, queuedCount }, 'Re-queued orphaned summarize jobs');
          return { action: 'requeued_summarize_jobs', requeuedCount: queuedCount };
        } else {
          // All transcripts summarized, mark as complete
          log.info({ runId }, 'All transcripts summarized, completing run');
          await db.run.update({
            where: { id: runId },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
          return { action: 'completed_run' };
        }
      }
    }

    return { action: 'no_missing_probes' };
  }

  // Re-queue missing probes
  const requeuedCount = await requeueMissingProbes(runId, missingProbes);

  // Update run status back to RUNNING if it was stuck
  await db.run.update({
    where: { id: runId },
    data: { updatedAt: new Date() },
  });

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
  // Find jobs active for > 5 minutes (user requested tight watchdog)
  const ZOMBIE_THRESHOLD_MINUTES = 5;

  const stuckJobs = await db.$queryRaw<Array<{ id: string; name: string; run_id: string }>>`
    SELECT id, name, data->>'runId' as run_id
    FROM pgboss.job
    WHERE state = 'active'
      AND started_on < NOW() - INTERVAL '5 minutes'
      AND (name = 'probe_scenario' OR name LIKE 'probe_scenario_%')
  `;

  if (stuckJobs.length === 0) {
    return { recovered: 0, errors: 0 };
  }

  log.warn({ count: stuckJobs.length }, 'Detected zombie jobs (active > 15m)');

  let recovered = 0;
  let errors = 0;

  for (const job of stuckJobs) {
    try {
      // Force fail the job
      await db.$executeRaw`
        UPDATE pgboss.job 
        SET state = 'failed', 
            output = '{"error": "Zombie job detected and killed by watchdog (active > 15m)"}',
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

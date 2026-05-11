/**
 * Probe Scenario Handler
 *
 * Handles probe_scenario jobs by executing Python probe worker
 * and saving transcripts to database.
 *
 * Jobs are processed in parallel within each batch, with rate limiting
 * enforced per-provider using Bottleneck.
 */

import path from 'path';
import type * as PgBoss from 'pg-boss';
import type { Prisma } from '@valuerank/db';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import type { ProbeScenarioJobData } from '../../types.js';
import { DEFAULT_JOB_OPTIONS } from '../../types.js';
import { spawnPython } from '../../spawn.js';
import { isRunPaused, isRunTerminal, maybeAdvanceRunStatus } from '../../../services/run/index.js';
import { createTranscript, validateTranscript } from '../../../services/transcript/index.js';
import type { CostSnapshot } from '../../../services/transcript/index.js';
import { recordProbeSuccess, recordProbeFailure } from '../../../services/probe-result/index.js';
import { schedule as rateLimitSchedule } from '../../../services/rate-limiter/index.js';
import { getProviderForModel } from '../../../services/parallelism/index.js';
import { ensureHealthCheck } from './health-check.js';
import { enqueueTopUpProbesSingleton } from '../top-up-probes.js';
import { formatWorkerErrorMessage, extractStoredTranscriptTokenUsage, handleJobError } from './retry.js';
import { PROBE_WORKER_PATH, fetchScenario, buildWorkerInput } from './worker-input.js';
import type { ProbeWorkerInput, ProbeWorkerOutput } from './worker-input.js';
import { setReprobeStage } from '../../../services/run/anomaly-persistence.js';

const log = createLogger('queue:probe-scenario');

// Retry limit from job options (default 3)
const RETRY_LIMIT = DEFAULT_JOB_OPTIONS['probe_scenario'].retryLimit ?? 3;

function computeQueueWaitMs(enqueuedAt: string | null | undefined, nowMs: number): number | null {
  if (typeof enqueuedAt !== 'string' || enqueuedAt.trim() === '') {
    return null;
  }

  const queuedAtMs = Date.parse(enqueuedAt);
  if (Number.isNaN(queuedAtMs)) {
    return null;
  }

  return Math.max(0, nowMs - queuedAtMs);
}

async function enqueueSummarizeTranscriptSingleton(runId: string, transcriptId: string): Promise<void> {
  const { getBoss } = await import('../../boss.js');
  const { DEFAULT_JOB_OPTIONS: jobOptions } = await import('../../types.js');
  const boss = getBoss();

  await boss.send(
    'summarize_transcript',
    {
      runId,
      transcriptId,
      enqueuedAt: new Date().toISOString(),
    },
    {
      ...jobOptions['summarize_transcript'],
      singletonKey: transcriptId,
    }
  );

  log.info({ runId, transcriptId }, 'Queued summarize job for late-arriving transcript');
}

/**
 * Process a single probe job.
 * Extracted to allow parallel execution within batches.
 */
async function processProbeJob(job: PgBoss.Job<ProbeScenarioJobData>): Promise<void> {
  const { runId, scenarioId, modelId, sampleIndex = 0, config } = job.data;
  const jobId = job.id;
  const jobStartMs = Date.now();
  const queueWaitMs = computeQueueWaitMs(job.data.enqueuedAt, jobStartMs);
  const probeResultKey = {
    runId_scenarioId_modelId_sampleIndex: {
      runId,
      scenarioId,
      modelId,
      sampleIndex,
    },
  };

  log.info(
    {
      phase: 'probe:received',
      jobId,
      runId,
      scenarioId,
      modelId,
      sampleIndex,
      queueWaitMs,
      enqueuedAt: job.data.enqueuedAt ?? null,
      config,
    },
    'Processing probe_scenario job'
  );

  try {
    // Check if run is in a terminal state (completed/cancelled) - skip processing.
    // manualReprobe bypasses this guard: the reprobeAnomalySlot mutation explicitly
    // targets completed runs whose anomalies predate the adapter guards.
    if (job.data.manualReprobe !== true && await isRunTerminal(runId)) {
      log.info({ jobId, runId }, 'Skipping job - run is in terminal state');
      return;
    }

    // Check if run is paused - defer job for later
    if (await isRunPaused(runId)) {
      log.info({ jobId, runId }, 'Deferring job - run is paused');
      throw new Error('RUN_PAUSED: Job deferred because run is paused');
    }

    // Idempotency: if this probe combination already succeeded, skip it.
    const existingProbeResult = await db.probeResult.findUnique({
      where: probeResultKey,
      select: {
        status: true,
        transcriptId: true,
      },
    });
    const currentRetryCount = (job as unknown as { retrycount?: number }).retrycount ?? 0;

    if (
      existingProbeResult !== null &&
      existingProbeResult.status === 'SUCCESS' &&
      typeof existingProbeResult.transcriptId === 'string' &&
      existingProbeResult.transcriptId !== ''
    ) {
      if (job.data.manualReprobe !== true) {
        await enqueueTopUpProbesSingleton(runId);
      }
      await maybeAdvanceRunStatus(runId);
      log.info(
        {
          phase: 'probe:skip:already-succeeded',
          jobId,
          runId,
          scenarioId,
          modelId,
          sampleIndex,
          queueWaitMs,
          totalDurationMs: Date.now() - jobStartMs,
          transcriptId: existingProbeResult.transcriptId,
        },
        'Skipping probe job - result already succeeded'
      );
      return;
    }

    // If this specific key is already terminal-failed and this is only a PgBoss retry,
    // skip repeating a call that has already been recorded as failed.
    if (
      existingProbeResult !== null &&
      existingProbeResult.status === 'FAILED' &&
      currentRetryCount > 0
    ) {
      if (job.data.manualReprobe !== true) {
        await enqueueTopUpProbesSingleton(runId);
      }
      await maybeAdvanceRunStatus(runId);
      log.info(
        {
          phase: 'probe:skip:already-failed',
          jobId,
          runId,
          scenarioId,
          modelId,
          sampleIndex,
          queueWaitMs,
          totalDurationMs: Date.now() - jobStartMs,
          retryCount: currentRetryCount,
        },
        'Skipping probe job - already terminal failed'
      );
      return;
    }

    // Recovery path: transcript exists but probe_result success row is missing
    const existingTranscript = await db.transcript.findFirst({
      where: {
        runId,
        scenarioId,
        modelId,
        sampleIndex,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        durationMs: true,
        tokenCount: true,
        content: true,
      },
    });

    if (existingTranscript !== null) {
      const persistStartMs = Date.now();
      const tokenUsage = extractStoredTranscriptTokenUsage(
        existingTranscript.content,
        existingTranscript.tokenCount
      );

      await recordProbeSuccess({
        runId,
        scenarioId,
        modelId,
        sampleIndex,
        queuedAt: job.data.enqueuedAt ?? null,
        transcriptId: existingTranscript.id,
        durationMs: existingTranscript.durationMs,
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
      });
      const persistDurationMs = Date.now() - persistStartMs;

      const advanceResult = await maybeAdvanceRunStatus(runId);
      const currentRun = await db.run.findUnique({
        where: { id: runId },
        select: { status: true },
      });
      if (!advanceResult.enteredSummarizing && currentRun?.status === 'SUMMARIZING') {
        await enqueueSummarizeTranscriptSingleton(runId, existingTranscript.id);
      }
      log.info(
        {
          phase: 'probe:persist:recovered',
          jobId,
          runId,
          scenarioId,
          modelId,
          sampleIndex,
          queueWaitMs,
          persistDurationMs,
          totalDurationMs: Date.now() - jobStartMs,
          transcriptId: existingTranscript.id,
          advanceResult,
        },
        'Recovered probe result from existing transcript'
      );
      return;
    }

    // Run health check on first job (lazy initialization)
    await ensureHealthCheck();

    // Fetch scenario and definition from database
    const scenario = await fetchScenario(scenarioId);

    // Build input for Python worker
    const workerInput = await buildWorkerInput(
      runId,
      scenarioId,
      modelId,
      scenario.content,
      scenario.definition.content,
      scenario.definition.preambleVersion?.content ?? undefined,
      config
    );

    const workerStartMs = Date.now();
    log.info(
      {
        phase: 'probe:worker:start',
        jobId,
        runId,
        scenarioId,
        modelId,
        sampleIndex,
        queueWaitMs,
      },
      'Calling Python probe worker'
    );

    // Execute Python probe worker
    const result = await spawnPython<ProbeWorkerInput, ProbeWorkerOutput>(
      PROBE_WORKER_PATH,
      workerInput,
      { cwd: path.resolve(process.cwd(), '../..') } // cloud/ directory
    );
    const workerDurationMs = Date.now() - workerStartMs;

    // Handle spawn failure
    if (!result.success) {
      log.error(
        {
          phase: 'probe:worker:spawn-failed',
          jobId,
          runId,
          scenarioId,
          modelId,
          sampleIndex,
          queueWaitMs,
          workerDurationMs,
          error: result.error,
          stderr: result.stderr,
        },
        'Python spawn failed'
      );
      throw new Error(`Python worker failed: ${result.error}`);
    }

    // Handle worker failure
    const output = result.data;
    if (!output.success) {
      const err = output.error;
      log.warn(
        {
          phase: 'probe:worker:failed',
          jobId,
          runId,
          scenarioId,
          modelId,
          sampleIndex,
          queueWaitMs,
          workerDurationMs,
          error: err,
        },
        'Probe worker returned error'
      );

      // Use Python's retryable flag if available
      if (!err.retryable) {
        const errorMessage = formatWorkerErrorMessage(err);
        // Non-retryable error - record failure and increment failed count.
        // recordProbeFailure now throws on persistence error (so the DLQ handler can
        // surface those failures), so this caller must wrap it. Keep the original
        // probe-failed semantics: never block job completion on a metadata write.
        try {
          const persistStartMs = Date.now();
          await recordProbeFailure({
            runId,
            scenarioId,
            modelId,
            sampleIndex,
            queuedAt: job.data.enqueuedAt ?? null,
            errorCode: err.code,
            errorMessage,
            retryCount: 0,
          });
          const persistDurationMs = Date.now() - persistStartMs;
          log.info(
            {
              phase: 'probe:persist:failure',
              jobId,
              runId,
              scenarioId,
              modelId,
              sampleIndex,
              queueWaitMs,
              workerDurationMs,
              persistDurationMs,
              totalDurationMs: Date.now() - jobStartMs,
              errorCode: err.code,
            },
            'Recorded probe failure'
          );
        } catch (recordErr) {
          log.error(
            {
              phase: 'probe:persist:failure',
              jobId,
              runId,
              scenarioId,
              modelId,
              sampleIndex,
              queueWaitMs,
              workerDurationMs,
              error: recordErr,
            },
            'Failed to record probe failure — continuing'
          );
        }
        const advanceResult = await maybeAdvanceRunStatus(runId);
        log.error(
          {
            phase: 'probe:complete:failed',
            jobId,
            runId,
            scenarioId,
            modelId,
            sampleIndex,
            queueWaitMs,
            workerDurationMs,
            totalDurationMs: Date.now() - jobStartMs,
            advanceResult,
            error: err,
          },
          'Probe job permanently failed'
        );
        return; // Complete job without retrying
      }

      // Retryable error - throw to trigger retry
      throw new Error(`${err.code}: ${formatWorkerErrorMessage(err)}`);
    }

    // Validate transcript structure
    if (!validateTranscript(output.transcript)) {
      log.error({ jobId, runId }, 'Invalid transcript structure from Python worker');
      throw new Error('Invalid transcript structure');
    }

    // Create transcript record with cost snapshot if model cost info available
    let costSnapshot: CostSnapshot | undefined;
    if (workerInput.modelCost !== undefined) {
      const { costInputPerMillion, costOutputPerMillion } = workerInput.modelCost;
      const inputTokens = output.transcript.totalInputTokens;
      const outputTokens = output.transcript.totalOutputTokens;
      const estimatedCost =
        (inputTokens * costInputPerMillion) / 1_000_000 +
        (outputTokens * costOutputPerMillion) / 1_000_000;
      const reasoningTokens = output.transcript.totalReasoningTokens;
      costSnapshot = {
        inputTokens,
        outputTokens,
        estimatedCost,
        costInputPerMillion,
        costOutputPerMillion,
        ...(reasoningTokens != null && reasoningTokens > 0 && { reasoningTokens }),
      };
    }

    // Use an advisory lock to prevent concurrent probe jobs from creating
    // duplicate transcripts for the same (runId, scenarioId, modelId, sampleIndex).
    // Without this, two retries can both pass the "existing transcript?" check
    // before either finishes inserting, producing duplicate rows.
    const probeKey = `${runId}:${scenarioId}:${modelId}:${sampleIndex}`;
    const transcriptRecord = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${probeKey}))`;

      // Re-check inside the lock — another job may have inserted while we waited
      const alreadyCreated = await tx.transcript.findFirst({
        where: { runId, scenarioId, modelId, sampleIndex, deletedAt: null },
        select: { id: true, durationMs: true, tokenCount: true, content: true },
      });

      if (alreadyCreated !== null) {
        log.info(
          { runId, scenarioId, modelId, sampleIndex, existingId: alreadyCreated.id },
          'Transcript already created by concurrent job — skipping duplicate insert'
        );
        return alreadyCreated;
      }

      return createTranscript({
        runId,
        scenarioId,
        modelId,
        sampleIndex,
        transcript: output.transcript,
        definitionSnapshot: scenario.definition.content as Prisma.InputJsonValue,
        costSnapshot,
      }, tx);
    });

    // Record probe success in results table
    // Calculate duration from timestamps
    const startedAt = new Date(output.transcript.startedAt);
    const completedAt = new Date(output.transcript.completedAt);
    const durationMs = completedAt.getTime() - startedAt.getTime();

    const persistStartMs = Date.now();
    await recordProbeSuccess({
      runId,
      scenarioId,
      modelId,
      sampleIndex,
      queuedAt: job.data.enqueuedAt ?? null,
      transcriptId: transcriptRecord.id,
      durationMs,
      inputTokens: output.transcript.totalInputTokens,
      outputTokens: output.transcript.totalOutputTokens,
    });
    const persistDurationMs = Date.now() - persistStartMs;

    const advanceResult = await maybeAdvanceRunStatus(runId);
    const currentRun = await db.run.findUnique({
      where: { id: runId },
      select: { status: true },
    });
    if (job.data.manualReprobe !== true) {
      await enqueueTopUpProbesSingleton(runId);
    }

    // If the run is already summarizing, queue the just-created transcript.
    // When we just entered SUMMARIZING in this call, queueSummarizeJobs already handled it.
    if (!advanceResult.enteredSummarizing && currentRun?.status === 'SUMMARIZING') {
      await enqueueSummarizeTranscriptSingleton(runId, transcriptRecord.id);
    }

    // Reprobe pipeline: kick off summarization and advance stage.
    // Enqueue first so a boss.send failure leaves the stage at 'probing' (safe to retry).
    // Normal runs handle summarize via SUMMARIZING status; COMPLETED runs need explicit enqueue.
    if (job.data.manualReprobe === true && typeof job.data.anomalyId === 'string' && job.data.anomalyId !== '') {
      const anomalyId = job.data.anomalyId;
      const { getBoss } = await import('../../boss.js');
      const { DEFAULT_JOB_OPTIONS: jobOptions } = await import('../../types.js');
      const boss = getBoss();
      await boss.send(
        'summarize_transcript',
        { runId, transcriptId: transcriptRecord.id, anomalyId, enqueuedAt: new Date().toISOString() },
        { ...jobOptions['summarize_transcript'], singletonKey: transcriptRecord.id },
      );
      await setReprobeStage(anomalyId, 'summarizing', { transcriptId: transcriptRecord.id });
      log.info({ jobId, runId, anomalyId, transcriptId: transcriptRecord.id }, 'Enqueued summarize for reprobe pipeline');
    }

    log.info(
      {
        phase: 'probe:complete',
        jobId,
        runId,
        scenarioId,
        modelId,
        sampleIndex,
        transcriptId: transcriptRecord.id,
        queueWaitMs,
        workerDurationMs,
        persistDurationMs,
        totalDurationMs: Date.now() - jobStartMs,
        advanceResult,
        turns: output.transcript.turns.length,
      },
      'Probe job completed'
    );
  } catch (error) {
    // Pause deferral is not a real failure — propagate immediately
    if (error instanceof Error && error.message.startsWith('RUN_PAUSED:')) {
      throw error;
    }

    const retryCount = (job as unknown as { retrycount?: number }).retrycount ?? 0;
    const terminal = await handleJobError(
      error, jobId, runId, scenarioId, modelId, sampleIndex, retryCount, RETRY_LIMIT, job.data.enqueuedAt, probeResultKey
    );
    if (terminal) {
      return;
    }

    // Re-throw to let PgBoss handle retry logic
    throw error;
  }
}

/**
 * Creates a handler for probe_scenario jobs.
 *
 * Jobs in each batch are processed in PARALLEL using the rate limiter
 * to enforce per-provider concurrency and rate limits.
 */
export function createProbeScenarioHandler(): PgBoss.WorkHandler<ProbeScenarioJobData> {
  return async (jobs: PgBoss.Job<ProbeScenarioJobData>[]) => {
    if (jobs.length === 0) {
      return;
    }

    log.info({ jobCount: jobs.length }, 'Processing probe_scenario batch in parallel');

    // Process all jobs in parallel with rate limiting
    const results = await Promise.allSettled(
      jobs.map(async (job) => {
        const { modelId, scenarioId } = job.data;
        const jobId = job.id;

        // Get provider for this model to route to correct rate limiter
        const provider = await getProviderForModel(modelId);

        if (provider === null) {
          // Unknown provider - process without rate limiting (fallback)
          log.warn({ jobId, modelId }, 'Unknown provider for model, processing without rate limit');
          return processProbeJob(job);
        }

        // Schedule through rate limiter for this provider
        return rateLimitSchedule(
          provider,
          jobId,
          job.data.runId,
          modelId,
          scenarioId,
          () => processProbeJob(job)
        );
      })
    );

    // Check for failures - PgBoss needs us to throw to trigger retries
    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );

    if (failures.length > 0) {
      log.warn(
        { failureCount: failures.length, totalJobs: jobs.length },
        'Some jobs in batch failed'
      );

      // Throw when any retryable failures occurred so PgBoss requeues them.
      // Succeeded jobs are idempotent (checked by probe_result/transcript), so retries are safe.
      if (failures[0] !== undefined) {
        throw failures[0].reason;
      }
    }

    log.info(
      { completed: results.length - failures.length, failed: failures.length },
      'Probe batch processing complete'
    );
  };
}

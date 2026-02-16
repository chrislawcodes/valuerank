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
import type { ProbeScenarioJobData } from '../types.js';
import { DEFAULT_JOB_OPTIONS } from '../types.js';
import { spawnPython } from '../spawn.js';
import { updateProgress, isRunPaused, isRunTerminal } from '../../services/run/index.js';
import { createTranscript, validateTranscript } from '../../services/transcript/index.js';
import type { ProbeTranscript, CostSnapshot } from '../../services/transcript/index.js';
import { recordProbeSuccess, recordProbeFailure } from '../../services/probe-result/index.js';
import { LLM_PROVIDERS } from '../../config/models.js';
import { schedule as rateLimitSchedule } from '../../services/rate-limiter/index.js';
import { getProviderForModel } from '../../services/parallelism/index.js';

const log = createLogger('queue:probe-scenario');

// Retry limit from job options (default 3)
const RETRY_LIMIT = DEFAULT_JOB_OPTIONS['probe_scenario'].retryLimit ?? 3;

// Python worker paths (relative to cloud/ directory)
const PROBE_WORKER_PATH = 'workers/probe.py';
const HEALTH_CHECK_PATH = 'workers/health_check.py';

// Health check cache - verified once per process lifetime
let healthCheckDone = false;
let healthCheckPromise: Promise<void> | null = null;

/**
 * Health check output structure.
 */
type HealthCheckOutput = {
  success: boolean;
  health?: {
    pythonVersion: string;
    packages: Record<string, string>;
    apiKeys: Record<string, boolean>;
    warnings: string[];
  };
  error?: { message: string; code: string; retryable: boolean };
};

/**
 * Run health check on first probe job (lazy initialization).
 * Caches result to avoid repeated checks.
 */
async function ensureHealthCheck(): Promise<void> {
  // Already verified
  if (healthCheckDone) {
    return;
  }

  // Health check in progress - wait for it
  if (healthCheckPromise !== null) {
    return healthCheckPromise;
  }

  // Start health check
  healthCheckPromise = (async () => {
    log.info('Running Python worker health check');

    const result = await spawnPython<Record<string, never>, HealthCheckOutput>(
      HEALTH_CHECK_PATH,
      {},
      { cwd: path.resolve(process.cwd(), '../..'), timeout: 10000 }
    );

    if (!result.success) {
      log.error({ error: result.error, stderr: result.stderr }, 'Health check failed');
      throw new Error(`Python health check failed: ${result.error}`);
    }

    const output = result.data;
    if (!output.success) {
      log.error({ error: output.error }, 'Health check returned error');
      throw new Error(`Python health check error: ${output.error?.message}`);
    }

    // Log health status
    const health = output.health;
    if (health !== undefined) {
      log.info(
        {
          pythonVersion: health.pythonVersion,
          packages: Object.keys(health.packages).length,
          apiKeys: Object.fromEntries(
            Object.entries(health.apiKeys).filter(([, v]) => v)
          ),
        },
        'Python worker health check passed'
      );

      // Log warnings
      for (const warning of health.warnings) {
        log.warn({ warning }, 'Python worker health warning');
      }
    }

    healthCheckDone = true;
  })();

  return healthCheckPromise;
}

/**
 * Reset health check cache (for testing).
 */
export function resetHealthCheck(): void {
  healthCheckDone = false;
  healthCheckPromise = null;
}

/**
 * Python worker input structure.
 */
type ProbeWorkerInput = {
  runId: string;
  scenarioId: string;
  modelId: string;
  scenario: {
    preamble?: string;
    prompt: string;
    followups: Array<{ label: string; prompt: string }>;
  };
  config: {
    temperature?: number;
    maxTokens: number;
    maxTurns: number;
  };
  modelCost?: {
    costInputPerMillion: number;
    costOutputPerMillion: number;
  };
  modelConfig?: Record<string, unknown>;
};

/**
 * Python worker output structure.
 */
type ProbeWorkerOutput =
  | { success: true; transcript: ProbeTranscript }
  | { success: false; error: { message: string; code: string; retryable: boolean; details?: string } };

type ProbeStatus = 'SUCCESS' | 'FAILED' | null;

function getProgressDelta(
  previousStatus: ProbeStatus,
  nextStatus: 'SUCCESS' | 'FAILED'
): { incrementCompleted: number; incrementFailed: number } {
  if (previousStatus === nextStatus) {
    return { incrementCompleted: 0, incrementFailed: 0 };
  }

  if (previousStatus === null) {
    return nextStatus === 'SUCCESS'
      ? { incrementCompleted: 1, incrementFailed: 0 }
      : { incrementCompleted: 0, incrementFailed: 1 };
  }

  // Transition between terminal states (rare but possible if recovered/overridden)
  return nextStatus === 'SUCCESS'
    ? { incrementCompleted: 1, incrementFailed: -1 }
    : { incrementCompleted: -1, incrementFailed: 1 };
}

function extractStoredTranscriptTokenUsage(
  content: unknown,
  fallbackTokenCount: number
): { inputTokens: number; outputTokens: number } {
  const value = content as Record<string, unknown>;
  const snapshot = value.costSnapshot as Record<string, unknown> | undefined;
  const snapshotInput = snapshot?.inputTokens;
  const snapshotOutput = snapshot?.outputTokens;

  if (typeof snapshotInput === 'number' && typeof snapshotOutput === 'number') {
    return { inputTokens: snapshotInput, outputTokens: snapshotOutput };
  }

  const turns = Array.isArray(value.turns) ? value.turns : [];
  let inputTokens = 0;
  let outputTokens = 0;
  let foundAny = false;

  for (const turn of turns) {
    if (turn === null || typeof turn !== 'object') {
      continue;
    }

    const turnObj = turn as Record<string, unknown>;
    if (typeof turnObj.inputTokens === 'number') {
      inputTokens += turnObj.inputTokens;
      foundAny = true;
    }
    if (typeof turnObj.outputTokens === 'number') {
      outputTokens += turnObj.outputTokens;
      foundAny = true;
    }
  }

  if (foundAny) {
    return { inputTokens, outputTokens };
  }

  // Last-resort fallback when detailed counts are unavailable in legacy transcript payloads
  return { inputTokens: 0, outputTokens: fallbackTokenCount };
}

async function applyProgressDelta(
  runId: string,
  previousStatus: ProbeStatus,
  nextStatus: 'SUCCESS' | 'FAILED'
): Promise<{ progress: { total: number; completed: number; failed: number } | null; status: string | null }> {
  const delta = getProgressDelta(previousStatus, nextStatus);
  if (delta.incrementCompleted === 0 && delta.incrementFailed === 0) {
    return { progress: null, status: null };
  }

  const updated = await updateProgress(runId, delta);
  return { progress: updated.progress, status: updated.status };
}

/**
 * Checks if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true; // Unknown errors are retryable by default
  }

  const message = error.message.toLowerCase();

  // Network errors - retryable
  const networkErrorPatterns = [
    'econnrefused',
    'enotfound',
    'etimedout',
    'econnreset',
    'socket hang up',
    'network error',
    'fetch failed',
  ];

  if (networkErrorPatterns.some((pattern) => message.includes(pattern))) {
    return true;
  }

  // HTTP status code errors
  if (message.includes('429') || message.includes('rate limit')) {
    return true; // Rate limit - retryable
  }

  if (/5\d{2}/.test(message)) {
    return true; // Server errors (5xx) - retryable
  }

  // Non-retryable errors
  const nonRetryablePatterns = [
    'validation',
    'invalid',
    '401',
    '403',
    '404',
    '400',
    'unauthorized',
    'forbidden',
    'not found',
    'bad request',
  ];

  if (nonRetryablePatterns.some((pattern) => message.includes(pattern))) {
    return false;
  }

  // Default: retryable
  return true;
}

// Define the query structure for scenario fetching to ensure type safety
const scenarioQuery = {
  include: {
    definition: {
      select: {
        id: true,
        content: true,
        deletedAt: true,
        preambleVersion: {
          select: {
            content: true,
          },
        },
      },
    },
  },
} as const;

// Derive the type from the query
type ScenarioWithDefinition = Prisma.ScenarioGetPayload<typeof scenarioQuery>;

/**
 * Fetch scenario content from database.
 */
async function fetchScenario(scenarioId: string): Promise<ScenarioWithDefinition> {
  const scenario = await db.scenario.findUnique({
    where: { id: scenarioId },
    ...scenarioQuery,
  });

  // Allow probing soft-deleted scenarios/definitions so historical runs can be recovered
  // even after newer definition versions have retired old scenarios.
  if (!scenario) {
    throw new Error(`Scenario not found: ${scenarioId}`);
  }

  if (scenario.deletedAt !== null || scenario.definition.deletedAt !== null) {
    log.warn(
      {
        scenarioId,
        scenarioDeletedAt: scenario.deletedAt?.toISOString() ?? null,
        definitionId: scenario.definition.id,
        definitionDeletedAt: scenario.definition.deletedAt?.toISOString() ?? null,
      },
      'Processing probe against soft-deleted scenario/definition for run recovery'
    );
  }

  return scenario;
}

/**
 * Resolve a model ID to its full API version.
 * E.g., "claude-3-5-haiku" -> "claude-3-5-haiku-20241022"
 */
function resolveModelVersion(modelId: string): string {
  for (const provider of LLM_PROVIDERS) {
    for (const model of provider.models) {
      if (model.id === modelId) {
        return model.defaultVersion ?? modelId;
      }
    }
  }
  // If not found in config, return as-is (might be a full version ID)
  return modelId;
}

/**
 * Model info fetched from database.
 */
type ModelInfo = {
  costInputPerMillion: number;
  costOutputPerMillion: number;
  apiConfig?: Record<string, unknown>;
};

/**
 * Fetch model info (cost and API config) from database.
 */
async function fetchModelInfo(modelId: string): Promise<ModelInfo | null> {
  try {
    const model = await db.llmModel.findFirst({
      where: { modelId },
      select: {
        costInputPerMillion: true,
        costOutputPerMillion: true,
        apiConfig: true,
      },
    });

    if (model) {
      return {
        costInputPerMillion: Number(model.costInputPerMillion),
        costOutputPerMillion: Number(model.costOutputPerMillion),
        apiConfig: model.apiConfig as Record<string, unknown> | undefined,
      };
    }
  } catch (err) {
    log.warn({ modelId, err }, 'Failed to fetch model info, continuing without cost tracking');
  }

  return null;
}

/**
 * Build Python worker input from scenario data.
 */
async function buildWorkerInput(
  runId: string,
  scenarioId: string,
  modelId: string,
  scenarioContent: unknown,
  definitionContent: unknown,
  definitionPreamble: string | undefined, // New argument for fallback
  config: { temperature?: number; maxTurns: number; maxTokens?: number }
): Promise<ProbeWorkerInput> {
  // Extract scenario fields (content is JSON in database)
  const content = scenarioContent as Record<string, unknown>;

  // Resolve preamble: Prefer scenario-specific, fallback to definition default
  const preamble = (content.preamble as string) || definitionPreamble;


  // Get prompt from scenario
  const prompt = (content.prompt as string) || '';

  // Get followups from scenario
  const followups = (content.followups as Array<{ label: string; prompt: string }> | undefined) ?? [];

  // Resolve model ID to full API version (e.g., "claude-3-5-haiku" -> "claude-3-5-haiku-20241022")
  const resolvedModelId = resolveModelVersion(modelId);

  // Fetch model info (cost and API config)
  const modelInfo = await fetchModelInfo(resolvedModelId) || await fetchModelInfo(modelId);

  const input: ProbeWorkerInput = {
    runId,
    scenarioId,
    modelId: resolvedModelId,
    scenario: {
      preamble,
      prompt,
      followups,
    },
    config: {
      maxTokens: config.maxTokens ?? 8192, // Default to 8192 to support reasoning models
      maxTurns: config.maxTurns,
      ...(typeof config.temperature === 'number' ? { temperature: config.temperature } : {}),
    },
  };

  if (modelInfo !== null) {
    input.modelCost = {
      costInputPerMillion: modelInfo.costInputPerMillion,
      costOutputPerMillion: modelInfo.costOutputPerMillion,
    };
    if (modelInfo.apiConfig !== undefined) {
      input.modelConfig = modelInfo.apiConfig;
    }
  }

  return input;
}

/**
 * Process a single probe job.
 * Extracted to allow parallel execution within batches.
 */
async function processProbeJob(job: PgBoss.Job<ProbeScenarioJobData>): Promise<void> {
  const { runId, scenarioId, modelId, sampleIndex = 0, config } = job.data;
  const jobId = job.id;
  const probeResultKey = {
    runId_scenarioId_modelId_sampleIndex: {
      runId,
      scenarioId,
      modelId,
      sampleIndex,
    },
  };

  log.info(
    { jobId, runId, scenarioId, modelId, sampleIndex, config },
    'Processing probe_scenario job'
  );

  try {
    // Check if run is in a terminal state (completed/cancelled) - skip processing
    if (await isRunTerminal(runId)) {
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
    const previousProbeStatus = existingProbeResult?.status ?? null;
    const currentRetryCount = (job as unknown as { retrycount?: number }).retrycount ?? 0;

    if (
      existingProbeResult !== null &&
      existingProbeResult.status === 'SUCCESS' &&
      typeof existingProbeResult.transcriptId === 'string' &&
      existingProbeResult.transcriptId !== ''
    ) {
      log.info(
        { jobId, runId, scenarioId, modelId, sampleIndex, transcriptId: existingProbeResult.transcriptId },
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
      log.info(
        { jobId, runId, scenarioId, modelId, sampleIndex, currentRetryCount },
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
      const tokenUsage = extractStoredTranscriptTokenUsage(
        existingTranscript.content,
        existingTranscript.tokenCount
      );

      await recordProbeSuccess({
        runId,
        scenarioId,
        modelId,
        sampleIndex,
        transcriptId: existingTranscript.id,
        durationMs: existingTranscript.durationMs,
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
      });

      const { progress, status } = await applyProgressDelta(runId, previousProbeStatus, 'SUCCESS');
      log.info(
        { jobId, runId, scenarioId, modelId, sampleIndex, transcriptId: existingTranscript.id, progress, status },
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

    log.debug({ jobId, workerInput }, 'Calling Python probe worker');

    // Execute Python probe worker
    const result = await spawnPython<ProbeWorkerInput, ProbeWorkerOutput>(
      PROBE_WORKER_PATH,
      workerInput,
      { cwd: path.resolve(process.cwd(), '../..') } // cloud/ directory
    );

    // Handle spawn failure
    if (!result.success) {
      log.error({ jobId, runId, error: result.error, stderr: result.stderr }, 'Python spawn failed');
      throw new Error(`Python worker failed: ${result.error}`);
    }

    // Handle worker failure
    const output = result.data;
    if (!output.success) {
      const err = output.error;
      log.warn({ jobId, runId, error: err }, 'Probe worker returned error');

      // Use Python's retryable flag if available
      if (!err.retryable) {
        // Non-retryable error - record failure and increment failed count
        await recordProbeFailure({
          runId,
          scenarioId,
          modelId,
          sampleIndex,
          errorCode: err.code,
          errorMessage: err.message,
          retryCount: 0,
        });
        const { progress, status } = await applyProgressDelta(runId, previousProbeStatus, 'FAILED');
        log.error({ jobId, runId, progress, status, error: err }, 'Probe job permanently failed');
        return; // Complete job without retrying
      }

      // Retryable error - throw to trigger retry
      throw new Error(`${err.code}: ${err.message}`);
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
      costSnapshot = {
        inputTokens,
        outputTokens,
        estimatedCost,
        costInputPerMillion,
        costOutputPerMillion,
      };
    }

    const transcriptRecord = await createTranscript({
      runId,
      scenarioId,
      modelId,
      sampleIndex,
      transcript: output.transcript,
      definitionSnapshot: scenario.definition.content as Prisma.InputJsonValue,
      costSnapshot,
    });

    // Record probe success in results table
    // Calculate duration from timestamps
    const startedAt = new Date(output.transcript.startedAt);
    const completedAt = new Date(output.transcript.completedAt);
    const durationMs = completedAt.getTime() - startedAt.getTime();

    await recordProbeSuccess({
      runId,
      scenarioId,
      modelId,
      sampleIndex,
      transcriptId: transcriptRecord.id,
      durationMs,
      inputTokens: output.transcript.totalInputTokens,
      outputTokens: output.transcript.totalOutputTokens,
    });

    // Update progress based on status transition for this probe key
    const { progress, status } = await applyProgressDelta(runId, previousProbeStatus, 'SUCCESS');

    // If run is already in SUMMARIZING state (late-arriving probe job),
    // queue a summarize job for this transcript immediately
    if (status === 'SUMMARIZING') {
      const { getBoss } = await import('../boss.js');
      const { DEFAULT_JOB_OPTIONS } = await import('../types.js');
      const boss = getBoss();
      if (boss !== null) {
        await boss.send('summarize_transcript', {
          runId,
          transcriptId: transcriptRecord.id,
        }, DEFAULT_JOB_OPTIONS['summarize_transcript']);
        log.info({ runId, transcriptId: transcriptRecord.id }, 'Queued summarize job for late-arriving transcript');
      }
    }

    log.info(
      { jobId, runId, scenarioId, modelId, progress, status, turns: output.transcript.turns.length },
      'Probe job completed'
    );
  } catch (error) {
    // Check if this is a pause deferral (not a real failure)
    const isPauseDeferral = error instanceof Error && error.message.startsWith('RUN_PAUSED:');

    if (isPauseDeferral) {
      throw error;
    }

    // Check if error is retryable and if we have retries left
    const retryable = isRetryableError(error);
    const retryCount = (job as unknown as { retrycount?: number }).retrycount ?? 0;
    const maxRetriesReached = retryCount >= RETRY_LIMIT;

    log.warn(
      { jobId, runId, scenarioId, modelId, retryable, retryCount, maxRetriesReached, err: error },
      'Probe job error'
    );

    // Only increment failed count if:
    // 1. Error is not retryable, OR
    // 2. Max retries have been reached
    if (!retryable || maxRetriesReached) {
      try {
        // Record the failure with error details
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorCode = !retryable ? 'NON_RETRYABLE' : 'MAX_RETRIES_EXCEEDED';
        const existingProbeResult = await db.probeResult.findUnique({
          where: probeResultKey,
          select: { status: true },
        });
        await recordProbeFailure({
          runId,
          scenarioId,
          modelId,
          sampleIndex,
          errorCode,
          errorMessage,
          retryCount,
        });
        const { progress, status } = await applyProgressDelta(
          runId,
          existingProbeResult?.status ?? null,
          'FAILED'
        );
        log.error(
          { jobId, runId, scenarioId, modelId, progress, status, retryCount, err: error },
          'Probe job permanently failed'
        );
      } catch (progressError) {
        log.error(
          { jobId, runId, err: progressError },
          'Failed to update progress after job failure'
        );
      }
      return;
    } else {
      log.info(
        { jobId, runId, retryCount, retriesRemaining: RETRY_LIMIT - retryCount },
        'Job will be retried'
      );
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

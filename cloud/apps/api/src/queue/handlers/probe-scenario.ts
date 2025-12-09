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
import { incrementCompleted, incrementFailed, isRunPaused, isRunTerminal } from '../../services/run/index.js';
import { createTranscript, validateTranscript } from '../../services/transcript/index.js';
import type { ProbeTranscript } from '../../services/transcript/index.js';
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
  if (healthCheckPromise) {
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
    if (health) {
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
    preamble: string;
    prompt: string;
    followups: Array<{ label: string; prompt: string }>;
  };
  config: {
    temperature: number;
    maxTokens: number;
    maxTurns: number;
  };
  modelCost?: {
    costInputPerMillion: number;
    costOutputPerMillion: number;
  };
};

/**
 * Python worker output structure.
 */
type ProbeWorkerOutput =
  | { success: true; transcript: ProbeTranscript }
  | { success: false; error: { message: string; code: string; retryable: boolean; details?: string } };

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

/**
 * Fetch scenario content from database.
 */
async function fetchScenario(scenarioId: string) {
  const scenario = await db.scenario.findUnique({
    where: { id: scenarioId },
    include: {
      definition: {
        select: {
          id: true,
          content: true,
          deletedAt: true,
        },
      },
    },
  });

  // Check scenario is not deleted and its definition is not deleted
  if (!scenario || scenario.deletedAt !== null || scenario.definition.deletedAt !== null) {
    throw new Error(`Scenario not found: ${scenarioId}`);
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
 * Fetch model cost data from database.
 */
async function fetchModelCost(modelId: string): Promise<{ costInputPerMillion: number; costOutputPerMillion: number } | null> {
  try {
    const model = await db.llmModel.findFirst({
      where: { modelId },
      select: {
        costInputPerMillion: true,
        costOutputPerMillion: true,
      },
    });

    if (model) {
      return {
        costInputPerMillion: Number(model.costInputPerMillion),
        costOutputPerMillion: Number(model.costOutputPerMillion),
      };
    }
  } catch (err) {
    log.warn({ modelId, err }, 'Failed to fetch model cost, continuing without cost tracking');
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
  config: { temperature: number; maxTurns: number }
): Promise<ProbeWorkerInput> {
  // Extract scenario fields (content is JSON in database)
  const content = scenarioContent as Record<string, unknown>;
  const definition = definitionContent as Record<string, unknown>;

  // Get preamble from definition or scenario
  const preamble = (content.preamble as string) || (definition.preamble as string) || '';

  // Get prompt from scenario
  const prompt = (content.prompt as string) || '';

  // Get followups from scenario
  const followups = (content.followups as Array<{ label: string; prompt: string }>) || [];

  // Resolve model ID to full API version (e.g., "claude-3-5-haiku" -> "claude-3-5-haiku-20241022")
  const resolvedModelId = resolveModelVersion(modelId);

  // Fetch model cost for cost tracking
  const modelCost = await fetchModelCost(resolvedModelId) || await fetchModelCost(modelId);

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
      temperature: config.temperature,
      maxTokens: 1024, // Default max tokens
      maxTurns: config.maxTurns,
    },
  };

  if (modelCost) {
    input.modelCost = modelCost;
  }

  return input;
}

/**
 * Process a single probe job.
 * Extracted to allow parallel execution within batches.
 */
async function processProbeJob(job: PgBoss.Job<ProbeScenarioJobData>): Promise<void> {
  const { runId, scenarioId, modelId, config } = job.data;
  const jobId = job.id;

  log.info(
    { jobId, runId, scenarioId, modelId, config },
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
        // Non-retryable error - increment failed count immediately
        const { progress, status } = await incrementFailed(runId);
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

    // Create transcript record
    const transcriptRecord = await createTranscript({
      runId,
      scenarioId,
      modelId,
      transcript: output.transcript,
      definitionSnapshot: scenario.definition.content as Prisma.InputJsonValue,
    });

    // Update progress - increment completed count
    const { progress, status } = await incrementCompleted(runId);

    // If run is already in SUMMARIZING state (late-arriving probe job),
    // queue a summarize job for this transcript immediately
    if (status === 'SUMMARIZING') {
      const { getBoss } = await import('../boss.js');
      const { DEFAULT_JOB_OPTIONS } = await import('../types.js');
      const boss = getBoss();
      if (boss) {
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
        const { progress, status } = await incrementFailed(runId);
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

        if (!provider) {
          // Unknown provider - process without rate limiting (fallback)
          log.warn({ jobId, modelId }, 'Unknown provider for model, processing without rate limit');
          return processProbeJob(job);
        }

        // Schedule through rate limiter for this provider
        return rateLimitSchedule(
          provider,
          jobId,
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

      // If all jobs failed, throw the first error
      if (failures.length === jobs.length && failures[0]) {
        throw failures[0].reason;
      }

      // If some succeeded and some failed, log but don't throw
      // The successful ones are done, failed ones were handled in processProbeJob
    }

    log.info(
      { completed: results.length - failures.length, failed: failures.length },
      'Probe batch processing complete'
    );
  };
}

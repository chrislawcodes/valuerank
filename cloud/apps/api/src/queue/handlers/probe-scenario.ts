/**
 * Probe Scenario Handler
 *
 * Handles probe_scenario jobs by executing Python probe worker
 * and saving transcripts to database.
 */

import path from 'path';
import type * as PgBoss from 'pg-boss';
import { db, Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import type { ProbeScenarioJobData } from '../types.js';
import { DEFAULT_JOB_OPTIONS } from '../types.js';
import { spawnPython } from '../spawn.js';
import { incrementCompleted, incrementFailed, isRunPaused, isRunTerminal } from '../../services/run/index.js';
import { createTranscript, validateTranscript } from '../../services/transcript/index.js';
import type { ProbeTranscript } from '../../services/transcript/index.js';

const log = createLogger('queue:probe-scenario');

// Retry limit from job options (default 3)
const RETRY_LIMIT = DEFAULT_JOB_OPTIONS['probe_scenario'].retryLimit ?? 3;

// Python worker path (relative to cloud/ directory)
const PROBE_WORKER_PATH = 'workers/probe.py';

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
        },
      },
    },
  });

  if (!scenario) {
    throw new Error(`Scenario not found: ${scenarioId}`);
  }

  return scenario;
}

/**
 * Build Python worker input from scenario data.
 */
function buildWorkerInput(
  runId: string,
  scenarioId: string,
  modelId: string,
  scenarioContent: unknown,
  definitionContent: unknown,
  config: { temperature: number; maxTurns: number }
): ProbeWorkerInput {
  // Extract scenario fields (content is JSON in database)
  const content = scenarioContent as Record<string, unknown>;
  const definition = definitionContent as Record<string, unknown>;

  // Get preamble from definition or scenario
  const preamble = (content.preamble as string) || (definition.preamble as string) || '';

  // Get prompt from scenario
  const prompt = (content.prompt as string) || '';

  // Get followups from scenario
  const followups = (content.followups as Array<{ label: string; prompt: string }>) || [];

  return {
    runId,
    scenarioId,
    modelId,
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
}

/**
 * Creates a handler for probe_scenario jobs.
 */
export function createProbeScenarioHandler(): PgBoss.WorkHandler<ProbeScenarioJobData> {
  return async (jobs: PgBoss.Job<ProbeScenarioJobData>[]) => {
    for (const job of jobs) {
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

        // Fetch scenario and definition from database
        const scenario = await fetchScenario(scenarioId);

        // Build input for Python worker
        const workerInput = buildWorkerInput(
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
          { cwd: path.resolve(process.cwd(), '..') } // cloud/ directory
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
        await createTranscript({
          runId,
          scenarioId,
          modelId,
          transcript: output.transcript,
          definitionSnapshot: scenario.definition.content as Prisma.InputJsonValue,
        });

        // Update progress - increment completed count
        const { progress, status } = await incrementCompleted(runId);

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
  };
}

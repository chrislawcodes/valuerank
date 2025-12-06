/**
 * Probe Scenario Handler (Stub)
 *
 * Handles probe:scenario jobs. Currently a stub that simulates work.
 * Real Python execution will be added in Stage 6.
 */

import type * as PgBoss from 'pg-boss';
import { createLogger } from '@valuerank/shared';
import type { ProbeScenarioJobData } from '../types.js';
import { DEFAULT_JOB_OPTIONS } from '../types.js';
import { incrementCompleted, incrementFailed, isRunPaused, isRunTerminal } from '../../services/run/index.js';

const log = createLogger('queue:probe-scenario');

// Configurable delay for stub simulation (ms)
const STUB_DELAY_MS = parseInt(process.env.STUB_JOB_DELAY_MS ?? '100', 10);

// Test failure injection: set FAIL_MODEL_ID to trigger failures
const FAIL_MODEL_ID = process.env.FAIL_MODEL_ID ?? 'fail-test-model';

// Retry limit from job options (default 3)
const RETRY_LIMIT = DEFAULT_JOB_OPTIONS['probe:scenario'].retryLimit ?? 3;

/**
 * Checks if an error is retryable.
 *
 * Retryable errors:
 * - Network errors (ECONNREFUSED, ENOTFOUND, ETIMEDOUT, ECONNRESET)
 * - Rate limit errors (HTTP 429)
 * - Temporary server errors (HTTP 500, 502, 503, 504)
 *
 * Non-retryable errors:
 * - Validation errors
 * - Authentication errors (HTTP 401, 403)
 * - Not found errors (HTTP 404)
 * - Bad request errors (HTTP 400)
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
 * Creates a handler for probe:scenario jobs.
 * Returns a function that processes a batch of jobs.
 */
export function createProbeScenarioHandler(): PgBoss.WorkHandler<ProbeScenarioJobData> {
  return async (jobs: PgBoss.Job<ProbeScenarioJobData>[]) => {
    for (const job of jobs) {
      const { runId, scenarioId, modelId, config } = job.data;
      const jobId = job.id;

      log.info(
        { jobId, runId, scenarioId, modelId, config },
        'Processing probe:scenario job'
      );

      try {
        // Check if run is in a terminal state (completed/cancelled) - skip processing
        if (await isRunTerminal(runId)) {
          log.info({ jobId, runId }, 'Skipping job - run is in terminal state');
          return; // Complete job without doing work
        }

        // Check if run is paused - defer job for later
        if (await isRunPaused(runId)) {
          log.info({ jobId, runId }, 'Deferring job - run is paused');
          // Throw a special error to trigger retry after delay
          throw new Error('RUN_PAUSED: Job deferred because run is paused');
        }

        // Simulate work with configurable delay
        await new Promise((resolve) => setTimeout(resolve, STUB_DELAY_MS));

        // Test failure injection for retry testing
        if (modelId === FAIL_MODEL_ID) {
          log.warn({ jobId, runId, modelId }, 'Injecting test failure');
          throw new Error(`Test failure injected for model: ${modelId}`);
        }

        // Mock transcript data that would come from Python worker
        // TODO: Store transcript in database (Stage 6)
        const mockTranscript = {
          runId,
          scenarioId,
          modelId,
          turns: [
            { role: 'system', content: 'Mock scenario prompt' },
            { role: 'assistant', content: 'Mock model response' },
          ],
          completedAt: new Date().toISOString(),
        };

        // Update progress - increment completed count
        const { progress, status } = await incrementCompleted(runId);

        log.info(
          { jobId, runId, scenarioId, modelId, progress, status },
          'Probe job completed (stub)'
        );
      } catch (error) {
        // Check if this is a pause deferral (not a real failure)
        const isPauseDeferral = error instanceof Error && error.message.startsWith('RUN_PAUSED:');

        if (isPauseDeferral) {
          // Re-throw to trigger retry later
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

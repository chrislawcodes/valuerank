/**
 * Probe Scenario Handler (Stub)
 *
 * Handles probe:scenario jobs. Currently a stub that simulates work.
 * Real Python execution will be added in Stage 6.
 */

import type * as PgBoss from 'pg-boss';
import { createLogger } from '@valuerank/shared';
import type { ProbeScenarioJobData } from '../types.js';
import { incrementCompleted, incrementFailed, isRunPaused, isRunTerminal } from '../../services/run/index.js';

const log = createLogger('queue:probe-scenario');

// Configurable delay for stub simulation (ms)
const STUB_DELAY_MS = parseInt(process.env.STUB_JOB_DELAY_MS ?? '100', 10);

// Test failure injection: set FAIL_MODEL_ID to trigger failures
const FAIL_MODEL_ID = process.env.FAIL_MODEL_ID ?? 'fail-test-model';

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

        if (!isPauseDeferral) {
          // Update progress - increment failed count (only for real failures)
          try {
            const { progress, status } = await incrementFailed(runId);
            log.error(
              { jobId, runId, scenarioId, modelId, progress, status, err: error },
              'Probe job failed'
            );
          } catch (progressError) {
            log.error(
              { jobId, runId, err: progressError },
              'Failed to update progress after job failure'
            );
          }
        }

        // Re-throw to let PgBoss handle retry logic
        throw error;
      }
    }
  };
}

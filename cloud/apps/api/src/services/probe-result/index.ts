/**
 * Probe Result Service
 *
 * Tracks the outcome of each probe job (success or failure).
 * Provides queryable data for job status, error details, and diagnostics.
 */

import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('services:probe-result');

/**
 * Input for recording a successful probe result.
 */
export type RecordSuccessInput = {
  runId: string;
  scenarioId: string;
  modelId: string;
  sampleIndex?: number; // Index within sample set for multi-sample runs (0 to N-1), defaults to 0
  queuedAt?: string | null;
  transcriptId: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
};

/**
 * Input for recording a failed probe result.
 */
export type RecordFailureInput = {
  runId: string;
  scenarioId: string;
  modelId: string;
  sampleIndex?: number; // Index within sample set for multi-sample runs (0 to N-1), defaults to 0
  queuedAt?: string | null;
  errorCode: string;
  errorMessage: string;
  retryCount?: number;
};

/**
 * Records a successful probe result.
 * Creates or updates the probe_results record for this run/scenario/model/sampleIndex combination.
 */
export async function recordProbeSuccess(input: RecordSuccessInput): Promise<void> {
  const { runId, scenarioId, modelId, sampleIndex = 0, queuedAt, transcriptId, durationMs, inputTokens, outputTokens } = input;

  try {
    await db.probeResult.upsert({
      where: {
        runId_scenarioId_modelId_sampleIndex: { runId, scenarioId, modelId, sampleIndex },
      },
      create: {
        runId,
        scenarioId,
        modelId,
        sampleIndex,
        status: 'SUCCESS',
        transcriptId,
        durationMs,
        inputTokens,
        outputTokens,
        queuedAt: queuedAt != null ? new Date(queuedAt) : null,
        completedAt: new Date(),
      },
      update: {
        status: 'SUCCESS',
        transcriptId,
        durationMs,
        inputTokens,
        outputTokens,
        errorCode: null,
        errorMessage: null,
        queuedAt: queuedAt != null ? new Date(queuedAt) : undefined,
        completedAt: new Date(),
      },
    });

    log.debug({ runId, scenarioId, modelId, sampleIndex, transcriptId }, 'Recorded probe success');
  } catch (err) {
    // Log but don't fail the job - probe result recording is supplementary
    log.error({ runId, scenarioId, modelId, sampleIndex, err }, 'Failed to record probe success');
  }
}

/**
 * Records a failed probe result.
 * Creates or updates the probe_results record with error details.
 */
export async function recordProbeFailure(input: RecordFailureInput): Promise<void> {
  const { runId, scenarioId, modelId, sampleIndex = 0, queuedAt, errorCode, errorMessage, retryCount = 0 } = input;

  // Truncate error message if too long (to avoid DB issues)
  const truncatedMessage = errorMessage.length > 2000
    ? errorMessage.substring(0, 2000) + '...'
    : errorMessage;

  // Failures here are rethrown. The dead-letter handler relies on this row to surface
  // expired/zombie probes through Run.failedProbes; if the upsert silently swallows,
  // operators see "0 failed probes" while the queue actually has dead jobs.
  await db.probeResult.upsert({
    where: {
      runId_scenarioId_modelId_sampleIndex: { runId, scenarioId, modelId, sampleIndex },
    },
    create: {
      runId,
      scenarioId,
      modelId,
      sampleIndex,
      status: 'FAILED',
      errorCode,
      errorMessage: truncatedMessage,
      retryCount,
      queuedAt: queuedAt != null ? new Date(queuedAt) : null,
      completedAt: new Date(),
    },
    update: {
      status: 'FAILED',
      errorCode,
      errorMessage: truncatedMessage,
      retryCount,
      transcriptId: null,
      durationMs: null,
      inputTokens: null,
      outputTokens: null,
      queuedAt: queuedAt != null ? new Date(queuedAt) : undefined,
      completedAt: new Date(),
    },
  });

  log.debug({ runId, scenarioId, modelId, sampleIndex, errorCode }, 'Recorded probe failure');
}

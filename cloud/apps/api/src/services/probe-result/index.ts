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
  errorCode: string;
  errorMessage: string;
  retryCount?: number;
};

/**
 * Records a successful probe result.
 * Creates or updates the probe_results record for this run/scenario/model/sampleIndex combination.
 */
export async function recordProbeSuccess(input: RecordSuccessInput): Promise<void> {
  const { runId, scenarioId, modelId, sampleIndex = 0, transcriptId, durationMs, inputTokens, outputTokens } = input;

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
  const { runId, scenarioId, modelId, sampleIndex = 0, errorCode, errorMessage, retryCount = 0 } = input;

  // Truncate error message if too long (to avoid DB issues)
  const truncatedMessage = errorMessage.length > 2000
    ? errorMessage.substring(0, 2000) + '...'
    : errorMessage;

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
        status: 'FAILED',
        errorCode,
        errorMessage: truncatedMessage,
        retryCount,
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
        completedAt: new Date(),
      },
    });

    log.debug({ runId, scenarioId, modelId, sampleIndex, errorCode }, 'Recorded probe failure');
  } catch (err) {
    // Log but don't fail the job - probe result recording is supplementary
    log.error({ runId, scenarioId, modelId, sampleIndex, err }, 'Failed to record probe failure');
  }
}

/**
 * Gets all probe results for a run.
 */
export async function getProbeResults(runId: string) {
  return db.probeResult.findMany({
    where: { runId },
    orderBy: [{ status: 'asc' }, { modelId: 'asc' }, { scenarioId: 'asc' }],
  });
}

/**
 * Gets failed probe results for a run.
 */
export async function getFailedProbeResults(runId: string) {
  return db.probeResult.findMany({
    where: { runId, status: 'FAILED' },
    orderBy: [{ modelId: 'asc' }, { errorCode: 'asc' }],
  });
}

/**
 * Gets a summary of probe results by model for a run.
 */
export async function getProbeResultsSummaryByModel(runId: string) {
  const results = await db.probeResult.groupBy({
    by: ['modelId', 'status'],
    where: { runId },
    _count: true,
  });

  // Transform into a map of modelId -> { success, failed }
  const summary: Record<string, { success: number; failed: number }> = {};

  for (const result of results) {
    const modelEntry = summary[result.modelId] ?? { success: 0, failed: 0 };
    summary[result.modelId] = modelEntry;

    if (result.status === 'SUCCESS') {
      modelEntry.success = result._count;
    } else {
      modelEntry.failed = result._count;
    }
  }

  return summary;
}

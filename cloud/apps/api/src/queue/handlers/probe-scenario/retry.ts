/**
 * Retry logic, error classification, and progress delta helpers.
 */

import { createLogger } from '@valuerank/shared';
import { db } from '@valuerank/db';
import { updateProgress } from '../../../services/run/index.js';
import { recordProbeFailure } from '../../../services/probe-result/index.js';
import { enqueueTopUpProbesSingleton } from '../top-up-probes.js';

const log = createLogger('queue:probe-scenario');

export type ProbeStatus = 'SUCCESS' | 'FAILED' | null;

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

export function formatWorkerErrorMessage(error: { message: string; details?: string }): string {
  const baseMessage = error.message;
  const details = typeof error.details === 'string' ? error.details.trim() : '';
  if (details === '') {
    return baseMessage;
  }

  if (baseMessage.toLowerCase().includes(details.toLowerCase())) {
    return baseMessage;
  }

  return `${baseMessage} | ${details}`;
}

export function getProgressDelta(
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

export function extractStoredTranscriptTokenUsage(
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

export async function applyProgressDelta(
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

type ProbeResultKey = {
  runId_scenarioId_modelId_sampleIndex: {
    runId: string;
    scenarioId: string;
    modelId: string;
    sampleIndex: number;
  };
};

/**
 * Handle a caught error in processProbeJob.
 *
 * Returns true if the job should return (terminal failure recorded),
 * or rethrows if the error should propagate to PgBoss for retry.
 *
 * Pause deferral errors are always rethrown before calling this function.
 */
export async function handleJobError(
  error: unknown,
  jobId: string,
  runId: string,
  scenarioId: string,
  modelId: string,
  sampleIndex: number,
  retryCount: number,
  retryLimit: number,
  probeResultKey: ProbeResultKey
): Promise<boolean> {
  const retryable = isRetryableError(error);
  const maxRetriesReached = retryCount >= retryLimit;

  log.warn(
    { jobId, runId, scenarioId, modelId, retryable, retryCount, maxRetriesReached, err: error },
    'Probe job error'
  );

  if (!retryable || maxRetriesReached) {
    try {
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
      await enqueueTopUpProbesSingleton(runId);
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
    return true; // caller should return
  }

  log.info(
    { jobId, runId, retryCount, retriesRemaining: retryLimit - retryCount },
    'Job will be retried'
  );
  return false; // caller should rethrow
}

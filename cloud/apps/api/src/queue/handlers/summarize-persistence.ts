import { db, Prisma, type SummaryCache } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { DEFAULT_JOB_OPTIONS } from '../types.js';
import { findMissingProbes } from '../../services/run/coverage-completeness.js';
import { triggerBasicAnalysis } from '../../services/analysis/index.js';
import { maybeAdvanceRunStatus } from '../../services/run/index.js';
import { deductSingleTranscriptBalance } from '../../services/budget/deduct.js';
import {
  buildDecisionMetadataForPersist,
  type SummarizeTranscriptJobData,
  type WinnerFirstSummaryCache,
} from './summarize-types.js';
import { buildRawDecisionEvidence } from '../../graphql/queries/domain/shared.js';
import { isRecord } from '../../utils/isRecord.js';

const log = createLogger('queue:summarize-transcript');

export function buildSummaryCacheRecord(
  summary: {
    decisionText: string | null;
    decisionMetadata?: unknown;
    canonicalDecision?: WinnerFirstSummaryCache | null;
  },
  responseSha256: string,
  parserVersion: string,
  modelId: string,
): SummaryCache | null {
  if (!isRecord(summary.decisionMetadata)) {
    return null;
  }

  const { summaryCache: _ignoredSummaryCache, ...workerDecisionMetadata } = summary.decisionMetadata;

  return {
    responseSha256,
    parserVersion,
    modelId,
    summary: {
      decisionText: summary.decisionText,
      decisionMetadata: workerDecisionMetadata,
      ...(summary.canonicalDecision ? { canonicalDecision: summary.canonicalDecision } : {}),
    },
  };
}

export function isCacheRecordMatch(
  cache: SummaryCache,
  responseSha256: string | null,
  parserVersion: string,
  modelId: string,
): boolean {
  return (
    responseSha256 !== null &&
    cache.responseSha256 === responseSha256 &&
    cache.parserVersion === parserVersion &&
    cache.modelId === modelId
  );
}

/**
 * Returns true when a run has no live transcripts left and no missing probes.
 *
 * Failed summaries are terminal and must be excluded from the unsummarized count.
 */
export async function checkAllSummarized(runId: string): Promise<boolean> {
  const unsummarizedCount = await db.transcript.count({
    where: {
      runId,
      deletedAt: null,
      summarizedAt: null,
      summarizeFailedAt: null,
    },
  });

  if (unsummarizedCount > 0) {
    return false;
  }

  const missingProbes = await findMissingProbes(runId);
  return missingProbes.length === 0;
}

/**
 * Queues a compute_token_stats job for cost prediction data.
 */
export async function queueComputeTokenStats(runId: string): Promise<void> {
  // Dynamic import to avoid circular dependency
  const { getBoss } = await import('../boss.js');

  const boss = getBoss();
  const jobOptions = DEFAULT_JOB_OPTIONS['compute_token_stats'];

  await boss.send(
    'compute_token_stats',
    { runId },
    {
      ...jobOptions,
      singletonKey: runId,
    }
  );

  log.info({ runId }, 'Queued compute_token_stats job');
}

async function refreshPostSummarySideEffects(runId: string, transcriptId: string): Promise<void> {
  const advanceResult = await maybeAdvanceRunStatus(runId);
  if (advanceResult.completed) {
    return;
  }

  const run = await db.run.findUnique({
    where: { id: runId },
    select: { status: true },
  });

  if (run?.status !== 'COMPLETED') {
    return;
  }

  try {
    const prompted = await triggerBasicAnalysis(runId);
    if (prompted) {
      log.info({ runId }, 'Analysis triggered successfully');
    } else {
      log.debug({ runId }, 'Analysis not triggered');
    }
  } catch (error) {
    log.error({ runId, err: error }, 'Failed to trigger basic analysis');
  }

  try {
    await queueComputeTokenStats(runId);
  } catch (error) {
    log.error({ runId, err: error }, 'Failed to trigger token stats computation');
  }

  try {
    await deductSingleTranscriptBalance(transcriptId);
  } catch (error) {
    log.error({ runId, transcriptId, err: error }, 'Failed to deduct transcript provider balance');
  }
}

export async function persistCachedSummary(
  job: { id: string; data: SummarizeTranscriptJobData },
  transcript: { id: string },
  summaryCache: SummaryCache,
  responseSha256: string | null,
  parserVersion: string,
  modelId: string,
): Promise<void> {
  const rawDecisionEvidence = buildRawDecisionEvidence(summaryCache.summary.decisionMetadata);
  const persistedSummaryCache = responseSha256
    ? buildSummaryCacheRecord(
        {
          decisionText: summaryCache.summary.decisionText,
          decisionMetadata: summaryCache.summary.decisionMetadata,
          canonicalDecision: summaryCache.summary.canonicalDecision ?? null,
        },
        responseSha256,
        parserVersion,
        modelId,
      )
    : null;

  await db.transcript.update({
    where: { id: transcript.id },
    data: {
      decisionText: summaryCache.summary.decisionText,
      decisionMetadata: buildDecisionMetadataForPersist(
        summaryCache.summary.decisionMetadata,
        rawDecisionEvidence,
        persistedSummaryCache ?? undefined,
      ),
      summarizeFailedAt: null,
      summarizedAt: new Date(),
    },
  });

  await refreshPostSummarySideEffects(job.data.runId, transcript.id);
}

export async function persistSuccessfulSummary(
  job: { id: string; data: SummarizeTranscriptJobData },
  transcript: { id: string; scenarioId: string | null; definitionSnapshot: unknown },
  responseSha256: string | null,
  parserVersion: string,
  modelId: string,
  canonicalDecision: WinnerFirstSummaryCache | null,
  summary: { decisionText: string | null; decisionMetadata?: unknown },
): Promise<void> {
  const rawDecisionEvidence = buildRawDecisionEvidence(summary.decisionMetadata);
  const freshSummaryCache = responseSha256
    ? buildSummaryCacheRecord(
        {
          ...summary,
          canonicalDecision,
        },
        responseSha256,
        parserVersion,
        modelId,
      )
    : null;

  await db.transcript.update({
    where: { id: transcript.id },
    data: {
      decisionText: summary.decisionText,
      decisionMetadata: buildDecisionMetadataForPersist(
        summary.decisionMetadata,
        rawDecisionEvidence,
        freshSummaryCache ?? undefined,
      ),
      summarizeFailedAt: null,
      summarizedAt: new Date(),
    },
  });

  log.info({ jobId: job.id, transcriptId: transcript.id }, 'Transcript summarized');

  await refreshPostSummarySideEffects(job.data.runId, transcript.id);
}

export async function persistSummarizeFailure(
  job: { id: string; data: SummarizeTranscriptJobData; retrycount?: number },
  transcript: { id: string },
  error: { message: string; code: string; retryable: boolean; details?: unknown },
): Promise<boolean> {
  const retryCount = job.retrycount ?? 0;
  const maxRetriesReached = retryCount >= (DEFAULT_JOB_OPTIONS['summarize_transcript'].retryLimit ?? 3);

  log.warn(
    { jobId: job.id, transcriptId: transcript.id, retryCount, maxRetriesReached, error },
    'Summarize worker returned error'
  );

  if (error.retryable && !maxRetriesReached) {
    return true;
  }

  const failureText = error.retryable
    ? `Summary failed after ${retryCount} retries: ${error.message}`
    : `Summary failed: ${error.message}`;

  await db.transcript.update({
    where: { id: transcript.id },
    data: {
      decisionText: failureText,
      decisionMetadata: Prisma.DbNull,
      summarizeFailedAt: new Date(),
    },
  });

  await maybeAdvanceRunStatus(job.data.runId);
  return false;
}

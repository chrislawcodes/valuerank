import { db, Prisma, type SummaryCache } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { DEFAULT_JOB_OPTIONS } from '../types.js';
import { triggerBasicAnalysis } from '../../services/analysis/index.js';
import { incrementSummarizeCompleted, incrementSummarizeFailed } from '../../services/run/progress.js';
import { deductActualProviderBalancesForRun } from '../../services/budget/deduct.js';
import {
  buildDecisionMetadataForPersist,
  isPlainJsonObject,
  type SummarizeTranscriptJobData,
  type WinnerFirstSummaryCache,
} from './summarize-types.js';
import { buildRawDecisionEvidence } from '../../graphql/queries/domain/shared.js';

const log = createLogger('queue:summarize-transcript');

export function buildSummaryCacheRecord(
  summary: {
    decisionCode: string;
    decisionSource: string;
    decisionText: string | null;
    decisionMetadata?: unknown;
    canonicalDecision?: WinnerFirstSummaryCache | null;
  },
  responseSha256: string,
  parserVersion: string,
  modelId: string,
): SummaryCache | null {
  if (!isPlainJsonObject(summary.decisionMetadata)) {
    return null;
  }

  const { summaryCache: _ignoredSummaryCache, ...workerDecisionMetadata } = summary.decisionMetadata;

  return {
    responseSha256,
    parserVersion,
    modelId,
    summary: {
      decisionCode: summary.decisionCode,
      decisionCodeSource: summary.decisionSource,
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

/**
 * Check if all transcripts for a run have been summarized.
 */
export async function checkAllSummarized(runId: string): Promise<boolean> {
  const unsummarized = await db.transcript.count({
    where: {
      runId,
      summarizedAt: null,
    },
  });
  return unsummarized === 0;
}

/**
 * Update run status to COMPLETED if all transcripts are summarized.
 * Also triggers basic analysis, token statistics computation, and budget deduction.
 *
 * Uses an atomic status transition (SUMMARIZING → COMPLETED) to prevent
 * duplicate side effects when multiple summarization jobs finish concurrently.
 * Only the first caller that successfully transitions the status will run
 * the completion side effects (analysis, token stats, budget deduction).
 */
export async function maybeCompleteRun(runId: string): Promise<void> {
  const allDone = await checkAllSummarized(runId);

  if (allDone) {
    // Atomic transition: only update if status is still SUMMARIZING.
    // If another caller already moved it to COMPLETED, this returns 0 rows
    // and we skip all side effects to avoid duplicates (e.g., double deductions).
    const transitioned = await db.$executeRaw`
      UPDATE "runs"
      SET "status" = 'COMPLETED',
          "completed_at" = NOW(),
          "stalled_models" = '{}'::text[]
      WHERE "id" = ${runId}
        AND "status" = 'SUMMARIZING'
    `;

    if (transitioned === 0) {
      log.debug({ runId }, 'Run already completed by another worker — skipping side effects');
      return;
    }

    log.info({ runId }, 'Run completed - all transcripts summarized');

    try {
      const prompted = await triggerBasicAnalysis(runId);
      if (prompted) {
        log.info({ runId }, 'Analysis triggered successfully');
      } else {
        log.warn({ runId }, 'Analysis not triggered - no qualify transcripts?');
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
      await deductActualProviderBalancesForRun(runId);
    } catch (error) {
      log.error({ runId, err: error }, 'Failed to deduct provider balances');
    }
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
          decisionCode: summaryCache.summary.decisionCode ?? '',
          decisionSource: summaryCache.summary.decisionCodeSource ?? '',
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
      summarizedAt: new Date(),
    },
  });

  await incrementSummarizeCompleted(job.data.runId);
  await maybeCompleteRun(job.data.runId);
}

export async function persistSuccessfulSummary(
  job: { id: string; data: SummarizeTranscriptJobData },
  transcript: { id: string; scenarioId: string | null; definitionSnapshot: unknown },
  responseSha256: string | null,
  parserVersion: string,
  modelId: string,
  canonicalDecision: WinnerFirstSummaryCache | null,
  summary: { decisionCode: string; decisionSource: string; decisionText: string | null; decisionMetadata?: unknown },
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
      summarizedAt: new Date(),
    },
  });

  log.info({ jobId: job.id, transcriptId: transcript.id }, 'Transcript summarized');

  await incrementSummarizeCompleted(job.data.runId);
  await maybeCompleteRun(job.data.runId);
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
      summarizedAt: new Date(),
    },
  });

  await incrementSummarizeFailed(job.data.runId);
  await maybeCompleteRun(job.data.runId);
  return false;
}

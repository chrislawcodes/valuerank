/**
 * Summarize Transcript Handler
 *
 * Handles summarize_transcript jobs by executing Python summarize worker
 * and updating transcripts with decision code and text.
 *
 * Jobs are processed in PARALLEL within each batch, with rate limiting
 * enforced per-provider using Bottleneck.
 */

import path from 'path';
import crypto from 'crypto';
import type * as PgBoss from 'pg-boss';
import { db, Prisma } from '@valuerank/db';
import type { DecisionMetadata, SummaryCache } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { config } from '../../config.js';
import type { SummarizeTranscriptJobData } from '../types.js';
import { DEFAULT_JOB_OPTIONS } from '../types.js';
import { spawnPython, type SpawnPythonResult } from '../spawn.js';
import { triggerBasicAnalysis } from '../../services/analysis/index.js';
import { getSummarizerModel, type InfraModelConfig } from '../../services/infra-models.js';
import { incrementSummarizeCompleted, incrementSummarizeFailed } from '../../services/run/progress.js';
import { schedule as rateLimitSchedule, getLimiterStats, type ScheduleOptions } from '../../services/rate-limiter/index.js';
import { getMaxParallelSummarizations } from '../../services/summarization-parallelism/index.js';
import { buildRawDecisionEvidence, resolveTranscriptDecisionModel } from '../../graphql/queries/domain/shared.js';
import { deductProviderBalancesForRun } from '../../services/budget/deduct.js';

const log = createLogger('queue:summarize-transcript');

// Track batch processing for diagnostics
let batchCounter = 0;

// Retry limit from job options
const RETRY_LIMIT = DEFAULT_JOB_OPTIONS['summarize_transcript'].retryLimit ?? 3;

// Python worker path (relative to cloud/ directory)
const SUMMARIZE_WORKER_PATH = 'workers/summarize.py';

/**
 * Python worker input structure.
 */
type SummarizeWorkerInput = {
  transcriptId: string;
  modelId: string;
  transcriptContent: unknown;
};

/**
 * Python worker output structure.
 */
type SummarizeWorkerOutput =
  | {
      success: true;
      summary: {
        decisionCode: string;
        decisionSource: string;
        decisionText: string | null;
        decisionMetadata?: DecisionMetadata | null;
      };
    }
  | { success: false; error: { message: string; code: string; retryable: boolean; details?: string } };

type SuccessfulSummarizeWorkerSummary = Extract<SummarizeWorkerOutput, { success: true }>['summary'];

type TranscriptRecord = NonNullable<Awaited<ReturnType<typeof db.transcript.findUnique>>>;

type SummarizeWorkerBatchInput = {
  transcripts: SummarizeWorkerInput[];
};

type SummarizeWorkerBatchItemOutput = {
  transcriptId: string | null;
  batchIndex: number;
} & (
  | {
      success: true;
      summary: SuccessfulSummarizeWorkerSummary;
    }
  | {
      success: false;
      error: { message: string; code: string; retryable: boolean; details?: unknown };
    }
);

type SummarizeWorkerBatchOutput =
  | {
      success: true;
      summaries: SummarizeWorkerBatchItemOutput[];
    }
  | {
      success: false;
      error: { message: string; code: string; retryable: boolean; details?: unknown };
      summaries?: SummarizeWorkerBatchItemOutput[];
    };

type SummarizeWorkerResponse = SummarizeWorkerOutput | SummarizeWorkerBatchOutput;

type PreparedSummarizeJob = {
  job: PgBoss.Job<SummarizeTranscriptJobData>;
  transcript: TranscriptRecord;
  transcriptId: string;
  modelId: string;
  providerName: string;
  responseSha256: string | null;
  parserVersion: string;
};

type ResolveSummarizeJobResult =
  | { kind: 'missing' }
  | { kind: 'cache-hit' }
  | { kind: 'skipped' }
  | { kind: 'pending'; job: PreparedSummarizeJob };

type WinnerFirstSummaryCache = NonNullable<SummaryCache['summary']['canonicalDecision']>;

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function buildDecisionMetadataForPersist(
  decisionMetadata: unknown,
  rawDecisionEvidence: ReturnType<typeof buildRawDecisionEvidence>,
  summaryCache?: SummaryCache,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (decisionMetadata == null) {
    return Prisma.DbNull;
  }

  if (!isPlainJsonObject(decisionMetadata)) {
    return decisionMetadata as Prisma.InputJsonValue;
  }

  const { summaryCache: _ignoredSummaryCache, ...persistedDecisionMetadata } = decisionMetadata;

  return {
    ...persistedDecisionMetadata,
    rawDecisionEvidence,
    ...(summaryCache ? { summaryCache } : {}),
  } as Prisma.InputJsonValue;
}

function getTranscriptResponseText(transcriptContent: unknown): string {
  if (!isPlainJsonObject(transcriptContent)) {
    return '';
  }

  const turns = transcriptContent.turns;
  if (!Array.isArray(turns)) {
    return '';
  }

  const responses: string[] = [];
  for (const turn of turns) {
    if (!isPlainJsonObject(turn)) {
      continue;
    }

    const response = turn.targetResponse;
    if (typeof response === 'string' && response.length > 0) {
      responses.push(response);
    }
  }

  return responses.join('\n').trim();
}

function computeTranscriptResponseSha256(transcriptContent: unknown): string | null {
  const responseText = getTranscriptResponseText(transcriptContent);
  if (responseText.length === 0) {
    return null;
  }

  return crypto.createHash('sha256').update(responseText, 'utf8').digest('hex');
}

function isWinnerFirstSummaryCache(value: unknown): value is WinnerFirstSummaryCache {
  if (!isPlainJsonObject(value)) {
    return false;
  }

  if (
    value.cacheVersion !== 1
    || (value.decisionState !== 'resolved' && value.decisionState !== 'neutral' && value.decisionState !== 'unknown')
  ) {
    return false;
  }

  if (value.decisionState === 'resolved') {
    return (
      typeof value.favoredValueKey === 'string'
      && value.favoredValueKey.length > 0
      && (value.strength === 'strong' || value.strength === 'lean')
    );
  }

  if (value.decisionState === 'neutral') {
    return value.favoredValueKey === null && value.strength === 'neutral';
  }

  return value.favoredValueKey === null && value.strength === 'unknown';
}

function isSummaryCacheSummary(value: unknown): value is SummaryCache['summary'] {
  if (!isPlainJsonObject(value)) {
    return false;
  }

  return (
    typeof value.decisionCode === 'string' &&
    value.decisionCode !== 'error' &&
    typeof value.decisionCodeSource === 'string' &&
    (typeof value.decisionText === 'string' || value.decisionText === null) &&
    isPlainJsonObject(value.decisionMetadata) &&
    (!('canonicalDecision' in value) || isWinnerFirstSummaryCache(value.canonicalDecision)) &&
    !('summaryCache' in value)
  );
}

function isSummaryCache(value: unknown): value is SummaryCache {
  if (!isPlainJsonObject(value)) {
    return false;
  }

  return (
    typeof value.responseSha256 === 'string' &&
    value.responseSha256.length > 0 &&
    typeof value.parserVersion === 'string' &&
    value.parserVersion.length > 0 &&
    typeof value.modelId === 'string' &&
    value.modelId.length > 0 &&
    isSummaryCacheSummary(value.summary)
  );
}

function buildSummaryCacheRecord(
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

function isCacheRecordMatch(
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
async function queueComputeTokenStats(runId: string): Promise<void> {
  // Dynamic import to avoid circular dependency
  const { getBoss } = await import('../boss.js');

  const boss = getBoss();
  const jobOptions = DEFAULT_JOB_OPTIONS['compute_token_stats'];

  await boss.send(
    'compute_token_stats',
    { runId },
    {
      ...jobOptions,
      singletonKey: runId, // Only one stats computation per run
    }
  );

  log.info({ runId }, 'Queued compute_token_stats job');
}

/**
 * Check if all transcripts for a run have been summarized.
 */
async function checkAllSummarized(runId: string): Promise<boolean> {
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
 * Also triggers basic analysis and token statistics computation for the completed run.
 */
async function maybeCompleteRun(runId: string): Promise<void> {
  const allDone = await checkAllSummarized(runId);

  if (allDone) {
    await db.run.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        stalledModels: [],
      },
    });
    log.info({ runId }, 'Run completed - all transcripts summarized');

    // Trigger basic analysis for the completed run
    try {
      const prompted = await triggerBasicAnalysis(runId);
      if (prompted) {
        log.info({ runId }, 'Analysis triggered successfully');
      } else {
        log.warn({ runId }, 'Analysis not triggered - no qualify transcripts?');
      }
    } catch (error) {
      // Log error but don't fail - analysis can be triggered manually
      log.error({ runId, err: error }, 'Failed to trigger basic analysis');
    }

    // Trigger token statistics computation for cost prediction
    try {
      await queueComputeTokenStats(runId);
    } catch (error) {
      // Log error but don't fail - stats can be computed manually
      log.error({ runId, err: error }, 'Failed to trigger token stats computation');
    }

    // Deduct provider balances for the completed run
    try {
      await deductProviderBalancesForRun(runId);
    } catch (error) {
      // Log error but don't fail - balance deduction is best-effort
      log.error({ runId, err: error }, 'Failed to deduct provider balances');
    }
  }
}

function getProviderNameFromModelId(modelId: string, fallbackProvider: string): string {
  if (!modelId.includes(':')) {
    return fallbackProvider;
  }

  return modelId.split(':', 1)[0] ?? fallbackProvider;
}

async function buildWinnerFirstSummaryCache(
  transcript: TranscriptRecord,
  summary: SuccessfulSummarizeWorkerSummary,
): Promise<WinnerFirstSummaryCache | null> {
  const scenario = transcript.scenarioId
    ? await db.scenario.findUnique({
        where: { id: transcript.scenarioId },
        select: { orientationFlipped: true },
      })
    : null;

  const result = resolveTranscriptDecisionModel({
    decisionCode: summary.decisionCode,
    decisionMetadata: summary.decisionMetadata,
    definitionSnapshot: transcript.definitionSnapshot,
    orientationFlipped: scenario?.orientationFlipped ?? null,
  });

  const canonical = result.canonical;

  if (canonical.direction === 'unknown' || canonical.strength === 'unknown') {
    return {
      cacheVersion: 1,
      decisionState: 'unknown',
      favoredValueKey: null,
      strength: 'unknown',
    };
  }

  if (canonical.direction === 'neutral' && canonical.strength === 'neutral') {
    return {
      cacheVersion: 1,
      decisionState: 'neutral',
      favoredValueKey: null,
      strength: 'neutral',
    };
  }

  if (canonical.favoredValueKey == null) {
    return null;
  }

  return {
    cacheVersion: 1,
    decisionState: 'resolved',
    favoredValueKey: canonical.favoredValueKey,
    strength: canonical.strength,
  };
}

async function persistCachedSummary(
  job: PgBoss.Job<SummarizeTranscriptJobData>,
  transcript: TranscriptRecord,
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

async function persistSuccessfulSummary(
  job: PgBoss.Job<SummarizeTranscriptJobData>,
  transcript: TranscriptRecord,
  responseSha256: string | null,
  parserVersion: string,
  modelId: string,
  summary: SuccessfulSummarizeWorkerSummary,
): Promise<void> {
  const rawDecisionEvidence = buildRawDecisionEvidence(summary.decisionMetadata);
  const canonicalDecision = await buildWinnerFirstSummaryCache(transcript, summary);
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

  log.info(
    { jobId: job.id, transcriptId: transcript.id },
    'Transcript summarized'
  );

  await incrementSummarizeCompleted(job.data.runId);
  await maybeCompleteRun(job.data.runId);
}

async function persistSummarizeFailure(
  job: PgBoss.Job<SummarizeTranscriptJobData>,
  transcript: TranscriptRecord,
  error: { message: string; code: string; retryable: boolean; details?: unknown },
): Promise<boolean> {
  const retryCount = (job as unknown as { retrycount?: number }).retrycount ?? 0;
  const maxRetriesReached = retryCount >= RETRY_LIMIT;

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

async function resolveSummarizeJob(
  job: PgBoss.Job<SummarizeTranscriptJobData>,
  infraModel: InfraModelConfig,
): Promise<ResolveSummarizeJobResult> {
  const { transcriptId, summaryModelId } = job.data;
  const modelId = summaryModelId ?? `${infraModel.providerName}:${infraModel.modelId}`;
  const providerName = getProviderNameFromModelId(modelId, infraModel.providerName);

  log.info(
    { jobId: job.id, runId: job.data.runId, transcriptId, modelId },
    'Processing summarize_transcript job'
  );

  const transcript = await db.transcript.findUnique({
    where: { id: transcriptId },
  });

  if (!transcript) {
    log.error({ jobId: job.id, transcriptId }, 'Transcript not found');
    return { kind: 'missing' };
  }

  const wasAlreadySummarized = transcript.summarizedAt !== null;
  const responseSha256 = computeTranscriptResponseSha256(transcript.content);
  const transcriptDecisionMetadata = isPlainJsonObject(transcript.decisionMetadata)
    ? transcript.decisionMetadata
    : null;
  const hasSummaryCacheField = transcriptDecisionMetadata !== null
    && 'summaryCache' in transcriptDecisionMetadata;
  const summaryCache = hasSummaryCacheField && isSummaryCache(transcriptDecisionMetadata.summaryCache)
    ? transcriptDecisionMetadata.summaryCache
    : null;
  const parserVersion = config.SUMMARIZE_PARSER_VERSION;
  const forceSummarize = job.data.forceSummarize === true;

  if (!forceSummarize && summaryCache && isCacheRecordMatch(summaryCache, responseSha256, parserVersion, modelId)) {
    log.info({ jobId: job.id, transcriptId, modelId }, 'Transcript summary cache hit');

    if (!wasAlreadySummarized) {
      await persistCachedSummary(job, transcript, summaryCache, responseSha256, parserVersion, modelId);
    }

    return { kind: 'cache-hit' };
  }

  // Skip only for legacy summarized transcripts with no cache metadata.
  if (!forceSummarize && !hasSummaryCacheField && wasAlreadySummarized) {
    log.info({ jobId: job.id, transcriptId }, 'Transcript already summarized, skipping');
    return { kind: 'skipped' };
  }

  if (!forceSummarize && hasSummaryCacheField) {
    log.info({ jobId: job.id, transcriptId, modelId }, 'Transcript summary cache miss, re-summarizing');
  }

  return {
    kind: 'pending',
    job: {
      job,
      transcript,
      transcriptId,
      modelId,
      providerName,
      responseSha256,
      parserVersion,
    },
  };
}

async function processSummarizeBatchGroup(
  batchId: number,
  groupIndex: number,
  pendingJobs: PreparedSummarizeJob[],
  scheduleOptions: ScheduleOptions,
): Promise<Error | null> {
  if (pendingJobs.length === 0) {
    return null;
  }

  const firstJob = pendingJobs[0];
  if (!firstJob) {
    return new Error('Python worker batch received no pending jobs');
  }

  const modelId = firstJob.modelId;
  const providerName = firstJob.providerName;
  const workerInput: SummarizeWorkerBatchInput = {
    transcripts: pendingJobs.map((pendingJob) => ({
      transcriptId: pendingJob.transcriptId,
      modelId: pendingJob.modelId,
      transcriptContent: pendingJob.transcript.content,
    })),
  };

  log.debug(
    {
      batchId,
      groupIndex,
      modelId,
      providerName,
      transcriptIds: pendingJobs.map((pendingJob) => pendingJob.transcriptId),
    },
    'Calling Python summarize worker for batch'
  );

  const handleBatchFailure = async (error: Error): Promise<Error | null> => {
    let retryableError: Error | null = null;
    const transientFailure = {
      message: error.message,
      code: 'PYTHON_WORKER_FAILED',
      retryable: true,
      details: error.name,
    };

    for (const pendingJob of pendingJobs) {
      const shouldRetry = await persistSummarizeFailure(
        pendingJob.job,
        pendingJob.transcript,
        transientFailure,
      );

      if (shouldRetry && retryableError === null) {
        retryableError = error;
      }
    }

    return retryableError;
  };

  let result: SpawnPythonResult<SummarizeWorkerResponse> | null = null;
  try {
    result = await rateLimitSchedule(
      providerName,
      `summarize_transcript:${batchId}:${groupIndex}`,
      firstJob.job.data.runId,
      modelId,
      firstJob.transcriptId,
      () => spawnPython<SummarizeWorkerBatchInput, SummarizeWorkerResponse>(
        SUMMARIZE_WORKER_PATH,
        workerInput,
        { cwd: path.resolve(process.cwd(), '../..') }
      ),
      scheduleOptions,
    );
  } catch (error) {
    log.error(
      { batchId, groupIndex, modelId, providerName, err: error },
      'Python spawn failed'
    );
    return handleBatchFailure(error instanceof Error ? error : new Error(String(error)));
  }

  if (result === null) {
    return handleBatchFailure(new Error('Python worker failed before returning a result'));
  }

  if (!result.success) {
    log.error({ batchId, groupIndex, modelId, providerName, error: result.error, stderr: result.stderr }, 'Python spawn failed');
    return handleBatchFailure(new Error(`Python worker failed: ${result.error}`));
  }

  const output = result.data;
  let summaries: SummarizeWorkerBatchItemOutput[] | null = null;

  if ('summaries' in output && Array.isArray(output.summaries)) {
    summaries = output.summaries;
  } else if (pendingJobs.length === 1 && 'summary' in output && output.success) {
    summaries = [
      {
        transcriptId: firstJob.transcriptId,
        batchIndex: 0,
        success: true,
        summary: output.summary,
      },
    ];
  } else if (pendingJobs.length === 1 && !output.success && 'error' in output) {
    summaries = [
      {
        transcriptId: firstJob.transcriptId,
        batchIndex: 0,
        success: false,
        error: output.error,
      },
    ];
  } else if (!output.success) {
    const err = output.error;
    return handleBatchFailure(new Error(`Python worker failed: ${err.code}: ${err.message}`));
  }

  if (!summaries) {
    return handleBatchFailure(new Error('Python worker batch returned no summaries'));
  }

  if (summaries.length !== pendingJobs.length) {
    return handleBatchFailure(
      new Error(`Python worker batch returned ${summaries.length} summaries for ${pendingJobs.length} transcripts`)
    );
  }

  let retryableError: Error | null = null;

  for (const summaryResult of summaries) {
    const pendingJob = pendingJobs[summaryResult.batchIndex];
    if (!pendingJob) {
      return handleBatchFailure(new Error(`Python worker batch returned invalid batchIndex ${summaryResult.batchIndex}`));
    }

    if (summaryResult.transcriptId !== null && summaryResult.transcriptId !== pendingJob.transcriptId) {
      return handleBatchFailure(
        new Error(
          `Python worker batch returned transcriptId ${summaryResult.transcriptId} for ${pendingJob.transcriptId}`
        )
      );
    }

    if (summaryResult.success) {
      await persistSuccessfulSummary(
        pendingJob.job,
        pendingJob.transcript,
        pendingJob.responseSha256,
        pendingJob.parserVersion,
        pendingJob.modelId,
        summaryResult.summary,
      );
      continue;
    }

    const shouldRetry = await persistSummarizeFailure(
      pendingJob.job,
      pendingJob.transcript,
      summaryResult.error,
    );

    if (shouldRetry && retryableError === null) {
      retryableError = new Error(`${summaryResult.error.code}: ${summaryResult.error.message}`);
    }
  }

  return retryableError;
}

/**
 * Creates a handler for summarize_transcript jobs.
 *
 * Jobs in each batch are resolved against cache first, then remaining jobs are
 * grouped by model and sent through a single Python worker invocation per group.
 */
export function createSummarizeTranscriptHandler(): PgBoss.WorkHandler<SummarizeTranscriptJobData> {
  return async (jobs: PgBoss.Job<SummarizeTranscriptJobData>[]) => {
    if (jobs.length === 0) {
      return;
    }

    const batchId = ++batchCounter;
    const batchStartTime = Date.now();

    // Get the summarizer model config once for the batch
    const infraModel = await getSummarizerModel();
    const providerName = infraModel.providerName;

    // Get summarization parallelism for rate limiter override
    // This allows summarization to use higher concurrency than provider probe limits
    const summarizationParallelism = await getMaxParallelSummarizations();
    const scheduleOptions: ScheduleOptions = {
      concurrencyOverride: summarizationParallelism,
    };

    // Get rate limiter stats before processing
    const limiterStatsBefore = getLimiterStats(providerName);

    // Extract unique run IDs for logging
    const runIds = [...new Set(jobs.map(j => j.data.runId))];

    log.info(
      {
        batchId,
        jobCount: jobs.length,
        provider: providerName,
        modelId: infraModel.modelId,
        summarizationParallelism,
        runIds,
        rateLimiter: limiterStatsBefore,
      },
      'Summarize batch received from PgBoss'
    );

    const pendingByModelId = new Map<string, PreparedSummarizeJob[]>();
    let cacheHitCount = 0;
    let skippedCount = 0;

    for (const job of jobs) {
      const resolved = await resolveSummarizeJob(job, infraModel);
      if (resolved.kind === 'pending') {
        const modelJobs = pendingByModelId.get(resolved.job.modelId) ?? [];
        modelJobs.push(resolved.job);
        pendingByModelId.set(resolved.job.modelId, modelJobs);
        continue;
      }

      if (resolved.kind === 'cache-hit') {
        cacheHitCount++;
      } else if (resolved.kind === 'skipped') {
        skippedCount++;
      }
    }

    const limiterStatsAfterCache = getLimiterStats(providerName);
    const pendingGroups = [...pendingByModelId.values()];
    let retryableError: Error | null = null;

    for (let groupIndex = 0; groupIndex < pendingGroups.length; groupIndex += 1) {
      const group = pendingGroups[groupIndex];
      if (!group) {
        continue;
      }
      const groupRetryableError = await processSummarizeBatchGroup(
        batchId,
        groupIndex,
        group,
        scheduleOptions,
      );

      if (groupRetryableError !== null && retryableError === null) {
        retryableError = groupRetryableError;
      }
    }

    const batchDurationMs = Date.now() - batchStartTime;
    const limiterStatsAfter = getLimiterStats(providerName);

    log.info(
      {
        batchId,
        totalJobs: jobs.length,
        cacheHitCount,
        skippedCount,
        batchGroups: pendingGroups.length,
        batchDurationMs,
        rateLimiterBefore: limiterStatsBefore,
        rateLimiterAfterCache: limiterStatsAfterCache,
        rateLimiterAfter: limiterStatsAfter,
      },
      'Summarize batch processing complete'
    );

    if (retryableError !== null) {
      throw retryableError;
    }
  };
}

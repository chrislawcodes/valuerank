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
import type * as PgBoss from 'pg-boss';
import { db, type DecisionMetadata } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { config } from '../../config.js';
import { spawnPython, type SpawnPythonResult } from '../spawn.js';
import { getSummarizerModel, type InfraModelConfig } from '../../services/infra-models.js';
import { getMaxParallelSummarizations } from '../../services/summarization-parallelism/index.js';
import { schedule as rateLimitSchedule, getLimiterStats, type ScheduleOptions } from '../../services/rate-limiter/index.js';
import { maybeAdvanceRunStatus } from '../../services/run/index.js';
import { resolveTranscriptDecisionModel } from '../../graphql/queries/domain/shared.js';
import type { SummarizeTranscriptJobData } from '../types.js';
import {
  computeTranscriptResponseSha256,
  isPlainJsonObject,
  isSummaryCache,
  type WinnerFirstSummaryCache,
} from './summarize-types.js';
import { setReprobeStage } from '../../services/run/anomaly-persistence.js';
import {
  isCacheRecordMatch,
  persistCachedSummary,
  persistSummarizeFailure,
  persistSuccessfulSummary,
} from './summarize-persistence.js';

const log = createLogger('queue:summarize-transcript');
let batchCounter = 0;
const _RETRY_LIMIT = 3;
const PYTHON_WORKER_PATH = 'workers/summarize.py';

type SummarizeWorkerInput = {
  transcriptId: string;
  modelId: string;
  transcriptContent: unknown;
};

type SummarizeWorkerOutput =
  | {
      success: true;
      summary: {
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

function getProviderNameFromModelId(modelId: string, fallbackProvider: string): string {
  if (!modelId.includes(':')) {
    return fallbackProvider;
  }

  return modelId.split(':', 1)[0] ?? fallbackProvider;
}

async function buildWinnerFirstSummaryCache(
  transcript: TranscriptRecord,
  summary: SuccessfulSummarizeWorkerSummary,
): Promise<WinnerFirstSummaryCache> {
  const scenarioId = transcript.scenarioId;
  const scenario = scenarioId == null
    ? null
    : await db.scenario.findUnique({
        where: { id: scenarioId },
        select: { orientationFlipped: true },
      });

  const result = resolveTranscriptDecisionModel({
    decisionMetadata: summary.decisionMetadata,
    definitionSnapshot: transcript.definitionSnapshot,
    orientationFlipped: scenario?.orientationFlipped ?? null,
  });

  const canonical = result.canonical;

  if (canonical.direction === 'refusal') {
    return {
      cacheVersion: 2,
      decisionState: 'refusal',
      favoredValueKey: null,
      strength: 'unknown',
    };
  }

  if (canonical.direction === 'unknown' || canonical.strength === 'unknown') {
    return {
      cacheVersion: 2,
      decisionState: 'unknown',
      favoredValueKey: null,
      strength: 'unknown',
    };
  }

  if (canonical.direction === 'neutral' && canonical.strength === 'neutral') {
    return {
      cacheVersion: 2,
      decisionState: 'neutral',
      favoredValueKey: null,
      strength: 'neutral',
    };
  }

  if (canonical.favoredValueKey == null) {
    // Explicit sentinel instead of returning null — makes parser failures
    // visible in JSONB queries as decisionState='parse_failed' rather than
    // a missing canonicalDecision key. Structurally identical to 'unknown';
    // the distinct label flags that the resolver could not pin a value even
    // though direction/strength were not themselves marked unknown.
    return {
      cacheVersion: 2,
      decisionState: 'parse_failed',
      favoredValueKey: null,
      strength: 'unknown',
    };
  }

  return {
    cacheVersion: 2,
    decisionState: 'resolved',
    favoredValueKey: canonical.favoredValueKey,
    strength: canonical.strength,
  };
}

async function resolveSummarizeJob(
  job: PgBoss.Job<SummarizeTranscriptJobData>,
  infraModel: InfraModelConfig,
): Promise<ResolveSummarizeJobResult> {
  const { db } = await import('@valuerank/db');
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

  const isTerminal = transcript.summarizedAt !== null || transcript.summarizeFailedAt !== null;
  const responseSha256 = computeTranscriptResponseSha256(transcript.content);
  const transcriptDecisionMetadata = isPlainJsonObject(transcript.decisionMetadata)
    ? transcript.decisionMetadata
    : null;
  const hasSummaryCacheField = transcriptDecisionMetadata !== null && 'summaryCache' in transcriptDecisionMetadata;
  const summaryCache = hasSummaryCacheField && isSummaryCache(transcriptDecisionMetadata.summaryCache)
    ? transcriptDecisionMetadata.summaryCache
    : null;
  const parserVersion = config.SUMMARIZE_PARSER_VERSION;
  const forceSummarize = job.data.forceSummarize === true;

  if (!forceSummarize && summaryCache && isCacheRecordMatch(summaryCache, responseSha256, parserVersion, modelId)) {
    log.info({ jobId: job.id, transcriptId, modelId }, 'Transcript summary cache hit');

    if (!isTerminal) {
      await persistCachedSummary(job, transcript, summaryCache, responseSha256, parserVersion, modelId);
    }

    return { kind: 'cache-hit' };
  }

  if (!forceSummarize && !hasSummaryCacheField && isTerminal) {
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
        PYTHON_WORKER_PATH,
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
      const canonicalDecision = await buildWinnerFirstSummaryCache(
        pendingJob.transcript,
        summaryResult.summary,
      );
      await persistSuccessfulSummary(
        pendingJob.job,
        pendingJob.transcript,
        pendingJob.responseSha256,
        pendingJob.parserVersion,
        pendingJob.modelId,
        canonicalDecision,
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

export function createSummarizeTranscriptHandler(): PgBoss.WorkHandler<SummarizeTranscriptJobData> {
  return async (jobs: PgBoss.Job<SummarizeTranscriptJobData>[]) => {
    if (jobs.length === 0) {
      return;
    }

    const batchId = ++batchCounter;
    const batchStartTime = Date.now();

    const infraModel = await getSummarizerModel();
    const providerName = infraModel.providerName;
    const summarizationParallelism = await getMaxParallelSummarizations();
    const scheduleOptions: ScheduleOptions = {
      concurrencyOverride: summarizationParallelism,
    };

    const limiterStatsBefore = getLimiterStats(providerName);
    const runIds = [...new Set(jobs.map((j) => j.data.runId))];

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
        await maybeAdvanceRunStatus(job.data.runId);
      } else if (resolved.kind === 'skipped') {
        skippedCount++;
        await maybeAdvanceRunStatus(job.data.runId);
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

    // Reprobe pipeline: advance stage for any jobs that carried an anomalyId.
    for (const job of jobs) {
      const { anomalyId, transcriptId } = job.data;
      if (anomalyId == null || anomalyId === '') continue;
      const transcript = await db.transcript.findUnique({
        where: { id: transcriptId },
        select: { summarizedAt: true },
      });
      if (transcript?.summarizedAt == null) continue;
      await setReprobeStage(anomalyId, 'analyzing');
      log.info({ anomalyId, transcriptId, runId: job.data.runId }, 'Advanced reprobe stage to analyzing');
    }

    if (retryableError !== null) {
      throw retryableError;
    }
  };
}

import { db, Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import {
  MODEL_SHORTFALL_ABSOLUTE_RATE,
  MODEL_SHORTFALL_MIN_PROBES,
  MODEL_SHORTFALL_PEER_RATE,
  MODEL_SHORTFALL_RELATIVE_RATE,
  ORPHAN_TRANSCRIPT_MIN_AGE_SECONDS,
  SUMMARIZING_STALL_MINUTES,
} from './anomaly-thresholds.js';

const log = createLogger('services:run:anomaly-detection');

export type RunAnomalyType =
  | 'STRANDED_TRANSCRIPT'
  | 'ORPHAN_TRANSCRIPT'
  | 'SUMMARIZING_STALL'
  | 'MODEL_TRANSCRIPT_SHORTFALL'
  | 'SCHEDULED_COUNT_MISMATCH'
  | 'INVALID_RESPONSE_FAILURE';

export type AnomalyDraft = {
  type: RunAnomalyType;
  subject: string;
  details: Prisma.InputJsonValue;
};

type RunSnapshot = {
  id: string;
  status: string;
  updatedAt: Date;
  config: unknown;
  progress: unknown;
  deletedAt: Date | null;
};

type RunConfig = {
  models?: string[];
  samplesPerScenario?: number;
};

type SuccessCountRow = {
  modelId: string;
  _count: { _all: number };
};

type OrphanTranscriptRow = {
  id: string;
  scenarioId: string | null;
  modelId: string;
  sampleIndex: number;
  createdAt: Date;
  durationMs: number;
  tokenCount: number;
  content: unknown;
};

export type AnomalyThresholds = {
  modelShortfallAbsoluteRate?: number;
  modelShortfallRelativeRate?: number;
  modelShortfallPeerRate?: number;
};

export type AnomalyDetectionMode = 'default' | 'audit';

type DetectionOptions = {
  mode: AnomalyDetectionMode;
  thresholds: AnomalyThresholds | null;
};

function parseRunConfig(config: unknown): RunConfig {
  if (config === null || typeof config !== 'object') {
    return {};
  }

  return config as RunConfig;
}

function getModelIds(config: unknown): string[] {
  const models = parseRunConfig(config).models ?? [];
  return models.filter((modelId) => typeof modelId === 'string' && modelId.length > 0);
}

function getSamplesPerScenario(config: unknown): number {
  const samples = parseRunConfig(config).samplesPerScenario;
  return typeof samples === 'number' && Number.isFinite(samples) && samples > 0 ? samples : 1;
}

function getProgressTotal(progress: unknown): number {
  if (progress === null || progress === undefined || typeof progress !== 'object') {
    return 0;
  }

  const total = (progress as Record<string, unknown>).total;
  return typeof total === 'number' && Number.isFinite(total) ? total : 0;
}

export function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function isThresholdOverrides(value: AnomalyDetectionMode | AnomalyThresholds | undefined): value is AnomalyThresholds {
  return value !== undefined && value !== 'default' && value !== 'audit';
}

function hasAuditThresholdOverrides(thresholds: AnomalyThresholds | null): boolean {
  return thresholds !== null
    && thresholds.modelShortfallAbsoluteRate === 0
    && thresholds.modelShortfallRelativeRate === 0
    && thresholds.modelShortfallPeerRate === 0;
}

function normalizeDetectionOptions(
  options?: AnomalyDetectionMode | AnomalyThresholds,
): DetectionOptions {
  if (options === 'audit') {
    return { mode: 'audit', thresholds: null };
  }

  if (isThresholdOverrides(options)) {
    return {
      mode: hasAuditThresholdOverrides(options) ? 'audit' : 'default',
      thresholds: options,
    };
  }

  return { mode: 'default', thresholds: null };
}

function buildOrphanTranscriptFromClause(runId: string): Prisma.Sql {
  const minAge = new Date(Date.now() - ORPHAN_TRANSCRIPT_MIN_AGE_SECONDS * 1000);
  return Prisma.sql`
    FROM transcripts t
    LEFT JOIN probe_results p
      ON p.run_id = t.run_id
     AND p.scenario_id = t.scenario_id
     AND p.model_id = t.model_id
     AND p.sample_index = t.sample_index
     AND p.deleted_at IS NULL
    WHERE t.run_id = ${runId}
      AND t.deleted_at IS NULL
      AND t.created_at < ${minAge}
      AND p.id IS NULL
  `;
}

export async function detectStrandedTranscript(runId: string): Promise<AnomalyDraft | null> {
  const transcripts = await db.transcript.findMany({
    where: {
      runId,
      deletedAt: null,
      summarizedAt: null,
      summarizeFailedAt: null,
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  if (transcripts.length === 0) {
    return null;
  }

  return {
    type: 'STRANDED_TRANSCRIPT',
    subject: '',
    details: toJsonValue({
      transcriptIds: transcripts.map((transcript) => transcript.id),
    }),
  };
}

export async function findOrphanTranscripts(runId: string, limit?: number): Promise<OrphanTranscriptRow[]> {
  const fromClause = buildOrphanTranscriptFromClause(runId);

  if (limit !== undefined) {
    return db.$queryRaw<OrphanTranscriptRow[]>`
    SELECT
      t.id,
      t.scenario_id AS "scenarioId",
      t.model_id AS "modelId",
      t.sample_index AS "sampleIndex",
      t.created_at AS "createdAt",
      t.duration_ms AS "durationMs",
      t.token_count AS "tokenCount",
      t.content AS "content"
    ${fromClause}
    ORDER BY t.created_at ASC
    LIMIT ${limit}
  `;
  }

  return db.$queryRaw<OrphanTranscriptRow[]>`
    SELECT
      t.id,
      t.scenario_id AS "scenarioId",
      t.model_id AS "modelId",
      t.sample_index AS "sampleIndex",
      t.created_at AS "createdAt",
      t.duration_ms AS "durationMs",
      t.token_count AS "tokenCount",
      t.content AS "content"
    ${fromClause}
    ORDER BY t.created_at ASC
  `;
}

export async function countOrphanTranscripts(runId: string): Promise<number> {
  const fromClause = buildOrphanTranscriptFromClause(runId);
  const rows = await db.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count
    ${fromClause}
  `;

  return Number(rows[0]?.count ?? 0);
}

export async function detectOrphanTranscript(runId: string): Promise<AnomalyDraft | null> {
  const orphans = await findOrphanTranscripts(runId);
  if (orphans.length === 0) {
    return null;
  }

  return {
    type: 'ORPHAN_TRANSCRIPT',
    subject: '',
    details: toJsonValue({
      transcriptIds: orphans.map((transcript) => transcript.id),
    }),
  };
}

export function detectSummarizingStall(run: RunSnapshot): AnomalyDraft | null {
  if (run.status !== 'SUMMARIZING') {
    return null;
  }

  const ageMinutes = Math.floor((Date.now() - run.updatedAt.getTime()) / 60000);
  if (ageMinutes < SUMMARIZING_STALL_MINUTES) {
    return null;
  }

  return {
    type: 'SUMMARIZING_STALL',
    subject: '',
    details: toJsonValue({
      updatedAt: run.updatedAt.toISOString(),
      ageMinutes,
    }),
  };
}

export async function detectModelTranscriptShortfall(
  run: RunSnapshot,
  options?: AnomalyDetectionMode | AnomalyThresholds,
): Promise<AnomalyDraft[]> {
  const detection = normalizeDetectionOptions(options);
  const modelIds = getModelIds(run.config);
  if (modelIds.length === 0) {
    return [];
  }

  const scenarioCount = await db.runScenarioSelection.count({ where: { runId: run.id } });
  const samplesPerScenario = getSamplesPerScenario(run.config);
  const scheduledPerModel = scenarioCount * samplesPerScenario;

  if (scheduledPerModel < MODEL_SHORTFALL_MIN_PROBES) {
    return [];
  }

  const successRows = await db.probeResult.groupBy({
    by: ['modelId'],
    where: {
      runId: run.id,
      deletedAt: null,
      status: 'SUCCESS',
    },
    _count: { _all: true },
  });

  const successesByModel = new Map<string, number>();
  for (const row of successRows as SuccessCountRow[]) {
    successesByModel.set(row.modelId, row._count._all);
  }

  const rates = modelIds.map((modelId) => {
    const successes = successesByModel.get(modelId) ?? 0;
    return {
      modelId,
      successes,
      scheduled: scheduledPerModel,
      rate: scheduledPerModel === 0 ? 0 : successes / scheduledPerModel,
    };
  });

  const sorted = [...rates].map((rate) => rate.rate).sort((left, right) => left - right);
  const peerMedianRate = sorted.length === 0
    ? 0
    : sorted.length % 2 === 0
      ? ((sorted[sorted.length / 2 - 1] ?? 0) + (sorted[sorted.length / 2] ?? 0)) / 2
      : sorted[Math.floor(sorted.length / 2)] ?? 0;

  if (detection.mode === 'audit') {
    return rates
      .filter((rate) => rate.rate < peerMedianRate - 0.0001)
      .map((rate) => ({
        type: 'MODEL_TRANSCRIPT_SHORTFALL' as const,
        subject: rate.modelId,
        details: toJsonValue({
          runId: run.id,
          modelId: rate.modelId,
          successes: rate.successes,
          scheduled: rate.scheduled,
          rate: rate.rate,
          peerMedianRate,
        }),
      }));
  }

  const absoluteRateThreshold =
    detection.thresholds?.modelShortfallAbsoluteRate ?? MODEL_SHORTFALL_ABSOLUTE_RATE;
  const relativeRateThreshold =
    detection.thresholds?.modelShortfallRelativeRate ?? MODEL_SHORTFALL_RELATIVE_RATE;
  const peerRateThreshold =
    detection.thresholds?.modelShortfallPeerRate ?? MODEL_SHORTFALL_PEER_RATE;

  return rates
    .filter((rate) => rate.rate < absoluteRateThreshold || (
      rate.rate < relativeRateThreshold && peerMedianRate > peerRateThreshold
    ))
    .map((rate) => ({
      type: 'MODEL_TRANSCRIPT_SHORTFALL' as const,
      subject: rate.modelId,
      details: toJsonValue({
        runId: run.id,
        modelId: rate.modelId,
        successes: rate.successes,
        scheduled: rate.scheduled,
        rate: rate.rate,
        peerMedianRate,
      }),
    }));
}

export async function detectScheduledCountMismatch(
  run: RunSnapshot,
): Promise<{ draft: AnomalyDraft | null; canonicalTotal: number }> {
  const modelCount = getModelIds(run.config).length;
  const scenarioCount = await db.runScenarioSelection.count({ where: { runId: run.id } });
  const samplesPerScenario = getSamplesPerScenario(run.config);
  const canonicalTotal = modelCount * scenarioCount * samplesPerScenario;
  const currentTotal = getProgressTotal(run.progress);

  if (currentTotal === canonicalTotal) {
    return { draft: null, canonicalTotal };
  }

  return {
    draft: {
      type: 'SCHEDULED_COUNT_MISMATCH',
      subject: '',
      details: toJsonValue({
        runId: run.id,
        canonicalTotal,
        currentTotal,
        modelCount,
        scenarioCount,
        samplesPerScenario,
      }),
    },
    canonicalTotal,
  };
}

export async function detectRunAnomalies(run: RunSnapshot): Promise<AnomalyDraft[]> {
  const drafts: AnomalyDraft[] = [];

  const stranded = await detectStrandedTranscript(run.id);
  if (stranded !== null) drafts.push(stranded);

  const orphan = await detectOrphanTranscript(run.id);
  if (orphan !== null) drafts.push(orphan);

  const stall = detectSummarizingStall(run);
  if (stall !== null) drafts.push(stall);

  drafts.push(...await detectModelTranscriptShortfall(run));

  const scheduled = await detectScheduledCountMismatch(run);
  if (scheduled.draft !== null) drafts.push(scheduled.draft);

  log.debug({ runId: run.id, anomalyCount: drafts.length }, 'Detected run anomalies');
  return drafts;
}

export type { RunSnapshot };

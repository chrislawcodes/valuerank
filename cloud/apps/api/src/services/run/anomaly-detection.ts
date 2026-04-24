import { db, Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import {
  MODEL_SHORTFALL_ABSOLUTE_RATE,
  MODEL_SHORTFALL_MIN_PROBES,
  MODEL_SHORTFALL_PEER_RATE,
  MODEL_SHORTFALL_RELATIVE_RATE,
  ORPHAN_TRANSCRIPT_MIN_AGE_SECONDS,
  PAIR_ASYMMETRY_MIN_PROBES,
  PAIR_ASYMMETRY_THRESHOLD_PCT,
  SUMMARIZING_STALL_MINUTES,
} from './anomaly-thresholds.js';

const log = createLogger('services:run:anomaly-detection');

export type RunAnomalyType =
  | 'STRANDED_TRANSCRIPT'
  | 'ORPHAN_TRANSCRIPT'
  | 'PAIR_ASYMMETRY'
  | 'SUMMARIZING_STALL'
  | 'MODEL_TRANSCRIPT_SHORTFALL'
  | 'SCHEDULED_COUNT_MISMATCH';

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
  jobChoiceBatchGroupId?: string | null;
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

type PairAsymmetryCandidate = {
  id: string;
  config: unknown;
};

type PairAsymmetryMetrics = {
  runId: string;
  scheduled: number;
  successCount: number;
  successRate: number;
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

function getGroupId(config: unknown): string | null {
  const groupId = parseRunConfig(config).jobChoiceBatchGroupId;
  return typeof groupId === 'string' && groupId.trim() !== '' ? groupId : null;
}

function getProgressTotal(progress: unknown): number {
  if (progress === null || progress === undefined || typeof progress !== 'object') {
    return 0;
  }

  const total = (progress as Record<string, unknown>).total;
  return typeof total === 'number' && Number.isFinite(total) ? total : 0;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
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

export async function detectPairAsymmetry(run: RunSnapshot): Promise<AnomalyDraft | null> {
  const groupId = getGroupId(run.config);
  if (groupId === null) {
    return null;
  }

  const siblings = await db.run.findMany({
    where: {
      deletedAt: null,
      id: { not: run.id },
      config: {
        path: ['jobChoiceBatchGroupId'],
        equals: groupId,
      },
    },
    select: {
      id: true,
      config: true,
    },
    orderBy: { updatedAt: 'asc' },
  });

  if (siblings.length === 0) {
    return null;
  }

  const comparisonRuns: PairAsymmetryCandidate[] = [run, ...siblings];
  const metrics = await Promise.all(
    comparisonRuns.map(async (candidate): Promise<PairAsymmetryMetrics> => {
      const modelCount = getModelIds(candidate.config).length;
      const scenarioCount = await db.runScenarioSelection.count({ where: { runId: candidate.id } });
      const samplesPerScenario = getSamplesPerScenario(candidate.config);
      const scheduled = scenarioCount * modelCount * samplesPerScenario;
      const successCount = await db.probeResult.count({
        where: { runId: candidate.id, deletedAt: null, status: 'SUCCESS' },
      });
      return {
        runId: candidate.id,
        scheduled,
        successCount,
        successRate: scheduled === 0 ? 0 : successCount / scheduled,
      };
    })
  );

  const currentMetrics = metrics.find((candidate) => candidate.runId === run.id) ?? null;
  if (currentMetrics === null) {
    return null;
  }

  const skippedUnderSampledRunIds: string[] = [];
  let maxDeltaPct = -1;
  let maxDeltaSibling: PairAsymmetryMetrics | null = null;

  for (const siblingMetrics of metrics) {
    if (siblingMetrics.runId === run.id) {
      continue;
    }

    if (currentMetrics.scheduled < PAIR_ASYMMETRY_MIN_PROBES || siblingMetrics.scheduled < PAIR_ASYMMETRY_MIN_PROBES) {
      skippedUnderSampledRunIds.push(siblingMetrics.runId);
      continue;
    }

    const deltaPct = Math.abs(currentMetrics.successRate - siblingMetrics.successRate) * 100;
    if (deltaPct > maxDeltaPct) {
      maxDeltaPct = deltaPct;
      maxDeltaSibling = siblingMetrics;
    }
  }

  if (maxDeltaSibling === null) {
    return null;
  }

  // <= so identical rates (deltaPct === 0) don't fire when threshold is 0.
  // At threshold=0 the detector fires on any measurable asymmetry.
  if (maxDeltaPct <= PAIR_ASYMMETRY_THRESHOLD_PCT) {
    return null;
  }

  return {
    type: 'PAIR_ASYMMETRY',
    subject: groupId,
    details: toJsonValue({
      runId: run.id,
      siblingRunId: maxDeltaSibling.runId,
      currentSuccessRate: currentMetrics.successRate,
      siblingSuccessRate: maxDeltaSibling.successRate,
      scheduled: currentMetrics.scheduled,
      siblingScheduled: maxDeltaSibling.scheduled,
      siblingRunIds: metrics.map((candidate) => candidate.runId),
      siblingSuccessRates: metrics.map((candidate) => candidate.successRate),
      maxDeltaPct,
      skippedUnderSampledRunIds,
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

export async function detectModelTranscriptShortfall(run: RunSnapshot): Promise<AnomalyDraft[]> {
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

  return rates
    .filter((rate) => rate.rate < MODEL_SHORTFALL_ABSOLUTE_RATE || (
      rate.rate < MODEL_SHORTFALL_RELATIVE_RATE && peerMedianRate > MODEL_SHORTFALL_PEER_RATE
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

  const pair = await detectPairAsymmetry(run);
  if (pair !== null) drafts.push(pair);

  const stall = detectSummarizingStall(run);
  if (stall !== null) drafts.push(stall);

  drafts.push(...await detectModelTranscriptShortfall(run));

  const scheduled = await detectScheduledCountMismatch(run);
  if (scheduled.draft !== null) drafts.push(scheduled.draft);

  log.debug({ runId: run.id, anomalyCount: drafts.length }, 'Detected run anomalies');
  return drafts;
}

export type { RunSnapshot };

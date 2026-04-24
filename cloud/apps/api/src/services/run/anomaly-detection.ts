import { db, type Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import {
  MODEL_SHORTFALL_ABSOLUTE_RATE,
  MODEL_SHORTFALL_MIN_PROBES,
  MODEL_SHORTFALL_PEER_RATE,
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

export async function findOrphanTranscripts(runId: string): Promise<OrphanTranscriptRow[]> {
  const minAge = new Date(Date.now() - ORPHAN_TRANSCRIPT_MIN_AGE_SECONDS * 1000);
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
    ORDER BY t.created_at ASC
  `;
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

  if (siblings.length < 2) {
    return null;
  }

  const sibling = siblings.find((candidate) => candidate.id !== run.id) ?? null;
  if (sibling === null) {
    return null;
  }

  const scheduledCounts = await Promise.all(
    [run, sibling].map(async (candidate) => {
      const modelCount = getModelIds(candidate.config).length;
      const scenarioCount = await db.runScenarioSelection.count({ where: { runId: candidate.id } });
      const samplesPerScenario = getSamplesPerScenario(candidate.config);
      return {
        runId: candidate.id,
        scheduled: scenarioCount * modelCount * samplesPerScenario,
      };
    })
  );

  const currentScheduled = scheduledCounts.find((item) => item.runId === run.id)?.scheduled ?? 0;
  const siblingScheduled = scheduledCounts.find((item) => item.runId === sibling.id)?.scheduled ?? 0;

  if (currentScheduled < PAIR_ASYMMETRY_MIN_PROBES || siblingScheduled < PAIR_ASYMMETRY_MIN_PROBES) {
    return null;
  }

  const [currentSuccess, siblingSuccess] = await Promise.all(
    [run.id, sibling.id].map(async (runId) => {
      const successCount = await db.probeResult.count({
        where: { runId, deletedAt: null, status: 'SUCCESS' },
      });
      const total = scheduledCounts.find((item) => item.runId === runId)?.scheduled ?? 0;
      return {
        runId,
        successRate: total === 0 ? 0 : successCount / total,
      };
    })
  );

  const deltaPct = Math.abs(currentSuccess.successRate - siblingSuccess.successRate) * 100;
  if (deltaPct < PAIR_ASYMMETRY_THRESHOLD_PCT) {
    return null;
  }

  return {
    type: 'PAIR_ASYMMETRY',
    subject: groupId,
    details: toJsonValue({
      runId: run.id,
      siblingRunId: sibling.id,
      currentSuccessRate: currentSuccess.successRate,
      siblingSuccessRate: siblingSuccess.successRate,
      scheduled: currentScheduled,
      siblingScheduled,
    }),
  };
}

export async function detectSummarizingStall(run: RunSnapshot): Promise<AnomalyDraft | null> {
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

  const peerMedianRate = [...rates]
    .map((rate) => rate.rate)
    .sort((left, right) => left - right)[Math.floor(rates.length / 2)] ?? 0;

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

  const stall = await detectSummarizingStall(run);
  if (stall !== null) drafts.push(stall);

  drafts.push(...await detectModelTranscriptShortfall(run));

  const scheduled = await detectScheduledCountMismatch(run);
  if (scheduled.draft !== null) drafts.push(scheduled.draft);

  log.debug({ runId: run.id, anomalyCount: drafts.length }, 'Detected run anomalies');
  return drafts;
}

export type { RunSnapshot };

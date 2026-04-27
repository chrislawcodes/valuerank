import { db, Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { getTranscriptResponseText } from '../../queue/handlers/summarize-types.js';
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

type InvalidResponseFailureProbeRow = {
  probeResultsId: string;
  runId: string;
  scenarioId: string | null;
  modelId: string;
  sampleIndex: number;
};

type InvalidResponseFailureTranscriptRow = {
  transcriptId: string;
  runId: string;
  scenarioId: string | null;
  modelId: string;
  sampleIndex: number;
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

export type AnomalyThresholds = {
  pairAsymmetryThresholdPct?: number;
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

function isThresholdOverrides(value: AnomalyDetectionMode | AnomalyThresholds | undefined): value is AnomalyThresholds {
  return value !== undefined && value !== 'default' && value !== 'audit';
}

function hasAuditThresholdOverrides(thresholds: AnomalyThresholds | null): boolean {
  return thresholds !== null
    && thresholds.pairAsymmetryThresholdPct === 0
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

export async function detectPairAsymmetry(
  run: RunSnapshot,
  options?: AnomalyDetectionMode | AnomalyThresholds,
): Promise<AnomalyDraft | null> {
  const detection = normalizeDetectionOptions(options);
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

  const thresholdPct =
    detection.mode === 'audit'
      ? 0
      : detection.thresholds?.pairAsymmetryThresholdPct ?? PAIR_ASYMMETRY_THRESHOLD_PCT;

  // <= so identical rates (deltaPct === 0) don't fire when threshold is 0.
  // At threshold=0 the detector fires on any measurable asymmetry.
  if (maxDeltaPct <= thresholdPct) {
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

/**
 * INVALID_RESPONSE_FAILURE anomalies are slot-keyed rather than transcript-keyed.
 *
 * Existing detectors (e.g. STRANDED_TRANSCRIPT) use the transcript ID as the subject
 * because the anomaly is about that specific transcript row. INVALID_RESPONSE_FAILURE
 * is about a *slot* (the (run, scenario, model, sampleIndex) tuple), not any one
 * transcript at that slot, because:
 *
 *   1. The forward path (post-PR #760) has NO transcript at the slot — only a FAILED
 *      probe_results row. A transcript-keyed subject would have nothing to bind to.
 *   2. When a slot is re-probed, the old transcript is soft-deleted and a new one is
 *      created at the same slot. Transcript-keyed subjects would create a fresh anomaly
 *      for the new transcript while the old anomaly stays open pointing at a deleted row.
 *
 * Slot-keyed subjects let `syncAnomalies()` cleanly close the anomaly when the slot is
 * fixed (no failure shape detected at that slot any more), regardless of which underlying
 * transcript or probe_results row currently lives there.
 *
 * The empty-string fallback for null scenarioId is safe in practice because scenarioId
 * is a CUID — never an empty string in real data — so `runId::modelId:N` cannot collide
 * with `runId:scenarioId:modelId:N`. CUIDs also never contain `:`, so the colon
 * separator is unambiguous.
 */
function buildInvalidResponseFailureSubject(
  runId: string,
  scenarioId: string | null,
  modelId: string,
  sampleIndex: number,
): string {
  return `${runId}:${scenarioId ?? ''}:${modelId}:${sampleIndex}`;
}

function buildInvalidResponseFailureDraft(
  runId: string,
  scenarioId: string | null,
  modelId: string,
  sampleIndex: number,
  shape: 'forward' | 'historical',
  transcriptId: string | null,
  probeResultId: string | null,
): AnomalyDraft {
  return {
    type: 'INVALID_RESPONSE_FAILURE',
    subject: buildInvalidResponseFailureSubject(runId, scenarioId, modelId, sampleIndex),
    details: toJsonValue({
      scenarioId,
      modelId,
      sampleIndex,
      transcriptId,
      probeResultId,
      shape,
      reprobeAttempts: 0,
    }),
  };
}

/**
 * Detects INVALID_RESPONSE_FAILURE anomalies via two query paths:
 *
 *   PATH A (forward): A FAILED probe_results row with error_code='INVALID_RESPONSE'
 *     and no associated non-deleted transcript at the slot. This is the post-PR #760
 *     shape — adapter-level guards now mark these probes FAILED instead of writing an
 *     empty transcript.
 *
 *   PATH B (historical): A non-deleted, summarized transcript whose visible response
 *     text is empty. This is the pre-PR #760 shape — the empty transcript exists in
 *     the database because the adapter silently coerced the empty content.
 *
 * `options` is accepted for parity with other detectors' (default | audit) signature,
 * but the detector returns the SAME drafts in both modes. Source coexistence between
 * default and audit rows for the same slot is fine — the unique constraint
 * (runId, type, subject, source) explicitly allows it, and the UI layer dedupes by
 * subject when rendering. Filtering audit drafts inside the detector would be unsafe:
 * `syncAnomalies()` resolves any open anomaly whose subject is missing from the draft
 * list, so a filtered draft would resolve a still-valid audit-source anomaly on the
 * next sweep.
 *
 * Forward-takes-precedence in dedup: when both PATH A and PATH B match the same slot
 * (rare — would happen only if a stale empty transcript and a new FAILED probe coexist
 * at the same slot), the forward draft wins because it carries the more recent
 * probe_results id and reflects the current failure shape. The historical draft is
 * skipped to prevent two drafts with the same subject in the return value, which would
 * cause a UNIQUE constraint violation downstream in syncAnomalies/upsertAnomaly.
 */
export async function detectInvalidResponseFailures(
  runId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options?: AnomalyDetectionMode | AnomalyThresholds,
): Promise<AnomalyDraft[]> {
  const probeResultRows = await db.$queryRaw<InvalidResponseFailureProbeRow[]>`
    SELECT pr.id AS "probeResultsId",
           pr.run_id AS "runId",
           pr.scenario_id AS "scenarioId",
           pr.model_id AS "modelId",
           pr.sample_index AS "sampleIndex"
    FROM probe_results pr
    WHERE pr.run_id = ${runId}
      AND pr.status = 'FAILED'
      AND pr.error_code = 'INVALID_RESPONSE'
      AND pr.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM transcripts t
        WHERE t.run_id = pr.run_id
          AND t.scenario_id = pr.scenario_id
          AND t.model_id = pr.model_id
          AND t.sample_index = pr.sample_index
          AND t.deleted_at IS NULL
      )
  `;

  const draftsBySlot = new Map<string, AnomalyDraft>();
  for (const row of probeResultRows) {
    const subject = buildInvalidResponseFailureSubject(row.runId, row.scenarioId, row.modelId, row.sampleIndex);
    draftsBySlot.set(
      subject,
      buildInvalidResponseFailureDraft(
        row.runId,
        row.scenarioId,
        row.modelId,
        row.sampleIndex,
        'forward',
        null,
        row.probeResultsId,
      )
    );
  }

  // PATH B loads candidate transcripts and applies the empty-text check in JS because
  // getTranscriptResponseText iterates content.turns[].targetResponse with whitespace
  // trimming — non-trivial to express in SQL. At current volume (≤2k transcripts/run)
  // this is fine; if anomaly volume grows, push the empty check into a Postgres JSONB
  // expression to avoid loading transcript content into memory.
  const transcriptRows = await db.$queryRaw<InvalidResponseFailureTranscriptRow[]>`
    SELECT t.id AS "transcriptId",
           t.run_id AS "runId",
           t.scenario_id AS "scenarioId",
           t.model_id AS "modelId",
           t.sample_index AS "sampleIndex",
           t.content AS "content"
    FROM transcripts t
    WHERE t.run_id = ${runId}
      AND t.deleted_at IS NULL
      AND t.summarized_at IS NOT NULL
  `;

  for (const row of transcriptRows) {
    if (getTranscriptResponseText(row.content).length !== 0) {
      continue;
    }

    const subject = buildInvalidResponseFailureSubject(row.runId, row.scenarioId, row.modelId, row.sampleIndex);
    // Forward-takes-precedence: if PATH A already produced a draft for this slot,
    // skip the historical draft to keep one draft per subject.
    if (draftsBySlot.has(subject)) {
      continue;
    }

    draftsBySlot.set(
      subject,
      buildInvalidResponseFailureDraft(
        row.runId,
        row.scenarioId,
        row.modelId,
        row.sampleIndex,
        'historical',
        row.transcriptId,
        null,
      )
    );
  }

  return [...draftsBySlot.values()];
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

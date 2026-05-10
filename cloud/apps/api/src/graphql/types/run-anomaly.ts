import { db } from '@valuerank/db';
import { builder } from '../builder.js';
import { DomainRef, RunAnomalyRef, RunRef } from './refs.js';

export const RunAnomalyTypeEnum: ReturnType<typeof builder.enumType<'RunAnomalyType', readonly ['STRANDED_TRANSCRIPT', 'ORPHAN_TRANSCRIPT', 'SUMMARIZING_STALL', 'MODEL_TRANSCRIPT_SHORTFALL', 'SCHEDULED_COUNT_MISMATCH', 'INVALID_RESPONSE_FAILURE']>> = builder.enumType('RunAnomalyType', {
  values: [
    'STRANDED_TRANSCRIPT',
    'ORPHAN_TRANSCRIPT',
    'SUMMARIZING_STALL',
    'MODEL_TRANSCRIPT_SHORTFALL',
    'SCHEDULED_COUNT_MISMATCH',
    'INVALID_RESPONSE_FAILURE',
  ] as const,
  description: 'Structured anomaly type for run state reconciliation',
});

const RunAnomalySourceEnum = builder.enumType('RunAnomalySource', {
  values: {
    DEFAULT: { value: 'default', description: 'Anomaly detected by the default reconciliation sweep' },
    AUDIT: { value: 'audit', description: 'Anomaly detected by the audit sweep' },
  },
  description: 'Source of a run anomaly record',
});

const REPROBE_LIMIT = 3;
const RECENT_COST_SAMPLE_SIZE = 10;

const DISPLAY_LABEL_BY_TYPE: Record<string, string> = {
  STRANDED_TRANSCRIPT: 'Stranded Transcript',
  ORPHAN_TRANSCRIPT: 'Orphan Transcript',
  SUMMARIZING_STALL: 'Summarizing Stall',
  MODEL_TRANSCRIPT_SHORTFALL: 'Model Transcript Shortfall',
  SCHEDULED_COUNT_MISMATCH: 'Scheduled Count Mismatch',
  INVALID_RESPONSE_FAILURE: 'Invalid Response',
};

const SLOT_KEYED_TYPES = new Set(['INVALID_RESPONSE_FAILURE']);
const REPROBABLE_TYPES = new Set(['INVALID_RESPONSE_FAILURE']);
const TRANSCRIPT_KEYED_TYPES = new Set(['STRANDED_TRANSCRIPT', 'ORPHAN_TRANSCRIPT']);

function readReprobeAttempts(details: unknown): number {
  if (details == null || typeof details !== 'object' || Array.isArray(details)) {
    return 0;
  }
  const value = (details as Record<string, unknown>).reprobeAttempts;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function readModelIdFromDetails(details: unknown): string | null {
  if (details == null || typeof details !== 'object' || Array.isArray(details)) {
    return null;
  }
  const value = (details as Record<string, unknown>).modelId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

type SlotTuple = {
  runId: string;
  scenarioId: string | null;
  modelId: string;
  sampleIndex: number;
};

/**
 * Parse a slot-keyed subject `<runId>:<scenarioId>:<modelId>:<sampleIndex>`.
 * Returns null if the format doesn't match. Empty scenarioId segment is mapped
 * back to null (matches the empty-string fallback in
 * anomaly-invalid-response-detection.ts).
 */
export function parseSlotSubject(subject: string): SlotTuple | null {
  const parts = subject.split(':');
  if (parts.length !== 4) return null;
  const [runId, scenarioRaw, modelId, sampleRaw] = parts;
  if (!runId || !modelId || !sampleRaw) return null;
  const sampleIndex = Number.parseInt(sampleRaw, 10);
  if (!Number.isInteger(sampleIndex) || sampleIndex < 0) return null;
  return {
    runId,
    scenarioId: scenarioRaw && scenarioRaw.length > 0 ? scenarioRaw : null,
    modelId,
    sampleIndex,
  };
}

function buildDisplaySubject(type: string, subject: string): string {
  if (SLOT_KEYED_TYPES.has(type)) {
    const slot = parseSlotSubject(subject);
    if (slot !== null) {
      return `model ${slot.modelId} · sample ${slot.sampleIndex}`;
    }
    return subject;
  }
  if (TRANSCRIPT_KEYED_TYPES.has(type)) {
    if (subject.length === 0) return subject;
    const shortId = subject.slice(0, 8);
    return `transcript ${shortId}`;
  }
  return subject;
}

builder.objectType(RunAnomalyRef, {
  description: 'Structured anomaly record for a run',
  fields: (t) => ({
    id: t.exposeID('id'),
    runId: t.exposeString('runId'),
    type: t.field({
      type: RunAnomalyTypeEnum,
      resolve: (anomaly) => anomaly.type,
    }),
    subject: t.exposeString('subject'),
    source: t.field({
      type: RunAnomalySourceEnum,
      resolve: (anomaly) => anomaly.source,
    }),
    details: t.field({
      type: 'JSON',
      resolve: (anomaly) => anomaly.details,
    }),
    firstSeenAt: t.expose('firstSeenAt', { type: 'DateTime' }),
    lastSeenAt: t.expose('lastSeenAt', { type: 'DateTime' }),
    resolvedAt: t.expose('resolvedAt', { type: 'DateTime', nullable: true }),
    acknowledgedByUserId: t.exposeString('acknowledgedByUserId', { nullable: true }),

    run: t.field({
      type: RunRef,
      description: 'The run this anomaly belongs to',
      resolve: async (anomaly) => {
        const run = await db.run.findUniqueOrThrow({ where: { id: anomaly.runId } });
        return run;
      },
    }),

    domain: t.field({
      type: DomainRef,
      nullable: true,
      description: 'The domain this anomaly belongs to (via run.definition.domain). Null if the definition is not associated with a domain.',
      resolve: async (anomaly) => {
        const run = await db.run.findUnique({
          where: { id: anomaly.runId },
          select: { definition: { select: { domain: true } } },
        });
        return run?.definition.domain ?? null;
      },
    }),

    displayLabel: t.string({
      description: 'Human-friendly anomaly type label. For unknown future enum values, returns the raw enum string.',
      resolve: (anomaly) => DISPLAY_LABEL_BY_TYPE[anomaly.type] ?? anomaly.type,
    }),

    displaySubject: t.string({
      description: 'Human-friendly subject label. Type-aware: slot-keyed types render as "model X · sample N", transcript-keyed types render as "transcript <short>", others return the raw subject.',
      resolve: (anomaly) => buildDisplaySubject(anomaly.type, anomaly.subject),
    }),

    reprobeEligible: t.boolean({
      description: 'Whether the [Re-probe] action is offered for this anomaly type. v1: only INVALID_RESPONSE_FAILURE is reprobable; other slot-keyed types may be added later.',
      resolve: (anomaly) => REPROBABLE_TYPES.has(anomaly.type),
    }),

    reprobeCount: t.int({
      description: 'Number of re-probe attempts already made for this anomaly. Reads details.reprobeAttempts; 0 for non-slot-keyed types.',
      resolve: (anomaly) => REPROBABLE_TYPES.has(anomaly.type) ? readReprobeAttempts(anomaly.details) : 0,
    }),

    reprobeLimitReached: t.boolean({
      description: 'True when reprobeCount has reached the circuit-breaker limit (3). UI should disable the [Re-probe] button.',
      resolve: (anomaly) => REPROBABLE_TYPES.has(anomaly.type) && readReprobeAttempts(anomaly.details) >= REPROBE_LIMIT,
    }),

    reprobeStage: t.string({
      nullable: true,
      description: 'Current pipeline stage for an in-progress manual re-probe: probing | summarizing | analyzing | aggregating | fixed. Null when no re-probe is in flight.',
      resolve: (anomaly) => {
        if (!REPROBABLE_TYPES.has(anomaly.type)) return null;
        const details = anomaly.details as Record<string, unknown> | null;
        const stage = details?.reprobeStage;
        return typeof stage === 'string' && stage.length > 0 ? stage : null;
      },
    }),

    activeTranscriptId: t.string({
      nullable: true,
      description: 'ID of the most recent non-deleted transcript for this slot. For INVALID_RESPONSE_FAILURE only — queries by (runId, scenarioId, modelId, sampleIndex). Handles reprobe-fixed anomalies where details.transcriptId still points to the original. Null for non-slot types.',
      resolve: async (anomaly) => {
        if (!SLOT_KEYED_TYPES.has(anomaly.type)) return null;
        const slot = parseSlotSubject(anomaly.subject);
        if (slot === null) return null;
        const transcript = await db.transcript.findFirst({
          where: {
            runId: slot.runId,
            scenarioId: slot.scenarioId ?? null,
            modelId: slot.modelId,
            sampleIndex: slot.sampleIndex,
            deletedAt: null,
          },
          select: { id: true },
          orderBy: { createdAt: 'desc' },
        });
        return transcript?.id ?? null;
      },
    }),

    scenarioName: t.string({
      nullable: true,
      description: 'Scenario (vignette) name for slot-keyed anomaly types. Null for non-slot types or when the scenario cannot be found.',
      resolve: async (anomaly) => {
        const details = anomaly.details as Record<string, unknown> | null;
        const scenarioId = typeof details?.scenarioId === 'string' && details.scenarioId.length > 0 ? details.scenarioId : null;
        if (scenarioId === null) return null;
        const scenario = await db.scenario.findUnique({ where: { id: scenarioId }, select: { name: true } });
        return scenario?.name ?? null;
      },
    }),

    dimensionValues: t.field({
      type: 'JSON',
      nullable: true,
      description: 'Dimension values from the scenario content for slot-keyed anomaly types (Record<string, string>). Null for non-slot types.',
      resolve: async (anomaly) => {
        const details = anomaly.details as Record<string, unknown> | null;
        const scenarioId = typeof details?.scenarioId === 'string' && details.scenarioId.length > 0 ? details.scenarioId : null;
        if (scenarioId === null) return null;
        const scenario = await db.scenario.findUnique({ where: { id: scenarioId }, select: { content: true } });
        if (scenario === null) return null;
        const content = scenario.content as { dimension_values?: Record<string, string> } | null;
        const dv = content?.dimension_values;
        if (dv == null || typeof dv !== 'object' || Object.keys(dv).length === 0) return null;
        return dv;
      },
    }),

    estimatedCost: t.float({
      nullable: true,
      description: 'Best-effort cost estimate for the next re-probe attempt, computed as the average estimatedCost of the last 10 successful (non-deleted, summarized) transcripts for the same modelId across all runs. Returns null when the anomaly is not reprobable, no modelId is available, or no recent transcripts have cost data.',
      resolve: async (anomaly) => {
        if (!REPROBABLE_TYPES.has(anomaly.type)) return null;
        const modelId = readModelIdFromDetails(anomaly.details);
        if (modelId === null) return null;

        const recent = await db.transcript.findMany({
          where: {
            modelId,
            deletedAt: null,
            summarizedAt: { not: null },
            estimatedCost: { not: null },
          },
          select: { estimatedCost: true },
          orderBy: { createdAt: 'desc' },
          take: RECENT_COST_SAMPLE_SIZE,
        });

        if (recent.length === 0) return null;

        let total = 0;
        let counted = 0;
        for (const row of recent) {
          if (row.estimatedCost !== null && Number.isFinite(row.estimatedCost)) {
            total += row.estimatedCost;
            counted += 1;
          }
        }

        return counted > 0 ? total / counted : null;
      },
    }),
  }),
});

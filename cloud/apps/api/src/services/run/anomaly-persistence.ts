import { db, type Prisma } from '@valuerank/db';
import type { RunAnomalySource } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import type { AnomalyDraft, RunAnomalyType } from './anomaly-detection.js';

const log = createLogger('services:run:anomaly-persistence');

type RunProgress = {
  total: number;
  completed: number;
  failed: number;
};

type RunAnomalyKey = {
  runId: string;
  type: RunAnomalyType;
  subject: string;
  source: RunAnomalySource;
};

function parseProgress(progress: unknown): RunProgress {
  if (progress === null || progress === undefined || typeof progress !== 'object') {
    return { total: 0, completed: 0, failed: 0 };
  }

  const record = progress as Record<string, unknown>;
  const total = typeof record.total === 'number' && Number.isFinite(record.total) ? record.total : 0;
  const completed = typeof record.completed === 'number' && Number.isFinite(record.completed) ? record.completed : 0;
  const failed = typeof record.failed === 'number' && Number.isFinite(record.failed) ? record.failed : 0;
  return { total, completed, failed };
}

export async function upsertAnomaly(
  runId: string,
  draft: AnomalyDraft,
  source: RunAnomalySource,
): Promise<void> {
  const now = new Date();
  await db.runAnomaly.upsert({
    where: {
      runId_type_subject_source: {
        runId,
        type: draft.type,
        subject: draft.subject,
        source,
      },
    },
    create: {
      runId,
      type: draft.type,
      subject: draft.subject,
      source,
      details: draft.details,
      firstSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      details: draft.details,
      lastSeenAt: now,
      resolvedAt: null,
    },
  });
}

export async function syncAnomalies(
  runId: string,
  type: RunAnomalyType,
  drafts: AnomalyDraft[],
  source: RunAnomalySource,
): Promise<void> {
  for (const draft of drafts) {
    await upsertAnomaly(runId, draft, source);
  }
  const currentSubjects = new Set(drafts.map((draft) => draft.subject));
  const existing = await db.runAnomaly.findMany({
    where: {
      runId,
      type,
      source,
      resolvedAt: null,
    },
    select: { subject: true, details: true },
  });

  for (const anomaly of existing) {
    if (!currentSubjects.has(anomaly.subject)) {
      // Don't auto-resolve when a reprobe pipeline is in flight or has completed.
      // 'fixed' anomalies must be resolved explicitly by the user; intermediate
      // stages must not be resolved before the pipeline finishes.
      const details = anomaly.details as Record<string, unknown> | null;
      const reprobeStage = typeof details?.reprobeStage === 'string' ? details.reprobeStage : null;
      if (reprobeStage !== null) {
        continue;
      }
      await resolveAnomaly({ runId, type, subject: anomaly.subject, source });
    }
  }
}

/**
 * Merge-updates the reprobeStage field inside an anomaly's JSONB details.
 * Safe to call even if the anomaly has been resolved; logs a warning and no-ops.
 */
export async function setReprobeStage(
  anomalyId: string,
  stage: string,
  extraFields?: Record<string, unknown>,
): Promise<void> {
  const anomaly = await db.runAnomaly.findUnique({
    where: { id: anomalyId },
    select: { details: true },
  });
  if (anomaly === null) {
    log.warn({ anomalyId, stage }, 'setReprobeStage: anomaly not found');
    return;
  }
  const current: Record<string, unknown> =
    anomaly.details !== null &&
    typeof anomaly.details === 'object' &&
    !Array.isArray(anomaly.details)
      ? { ...(anomaly.details as Record<string, unknown>) }
      : {};
  current.reprobeStage = stage;
  if (extraFields != null) {
    Object.assign(current, extraFields);
  }
  await db.runAnomaly.update({
    where: { id: anomalyId },
    data: { details: current as Prisma.InputJsonValue },
  });
  log.info({ anomalyId, stage }, 'Set reprobeStage');
}

export async function resolveAnomaly(key: RunAnomalyKey): Promise<void> {
  const now = new Date();
  await db.runAnomaly.updateMany({
    where: {
      runId: key.runId,
      type: key.type,
      subject: key.subject,
      source: key.source,
      resolvedAt: null,
    },
    data: {
      resolvedAt: now,
    },
  });
}

export async function repairScheduledCount(runId: string, canonicalTotal: number): Promise<boolean> {
  const run = await db.run.findUnique({
    where: { id: runId },
    select: { progress: true },
  });

  if (run === null) {
    return false;
  }

  const current = parseProgress(run.progress);
  if (current.total === canonicalTotal) {
    return false;
  }

  const updated: RunProgress = {
    ...current,
    total: canonicalTotal,
  };

  await db.run.update({
    where: { id: runId },
    data: { progress: updated },
  });

  log.info({ runId, currentTotal: current.total, canonicalTotal }, 'Repaired scheduled count');
  return true;
}

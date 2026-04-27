import type * as PgBoss from 'pg-boss';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { getReconcileWindowDays } from '../../services/run/scheduler.js';
import {
  detectModelTranscriptShortfall,
  detectOrphanTranscript,
  detectPairAsymmetry,
  detectScheduledCountMismatch,
  detectStrandedTranscript,
  detectSummarizingStall,
  type AnomalyDraft,
  type RunSnapshot,
} from '../../services/run/anomaly-detection.js';
import { syncAnomalies } from '../../services/run/anomaly-persistence.js';
import type { RunStateAuditJobData } from '../types.js';

const log = createLogger('queue:run-state-audit');

type RunAuditSnapshot = Pick<RunSnapshot, 'id' | 'status' | 'updatedAt' | 'config' | 'progress' | 'deletedAt'>;

async function findRunsForAudit(): Promise<RunAuditSnapshot[]> {
  const windowDays = getReconcileWindowDays();
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  return db.run.findMany({
    where: {
      deletedAt: null,
      OR: [
        { status: { in: ['RUNNING', 'PAUSED', 'SUMMARIZING'] } },
        { status: 'COMPLETED', updatedAt: { gt: cutoff } },
      ],
    },
    select: {
      id: true,
      status: true,
      updatedAt: true,
      config: true,
      progress: true,
      deletedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

async function inspectRun(run: RunAuditSnapshot): Promise<void> {
  const draftsByType = new Map<AnomalyDraft['type'], AnomalyDraft[]>();
  const addDraft = (draft: AnomalyDraft): void => {
    const current = draftsByType.get(draft.type) ?? [];
    current.push(draft);
    draftsByType.set(draft.type, current);
  };

  try {
    const orphan = await detectOrphanTranscript(run.id);
    if (orphan !== null) {
      addDraft(orphan);
    }
  } catch (error) {
    log.warn({ runId: run.id, err: error }, 'Audit orphan transcript detection failed');
  }

  try {
    const pair = await detectPairAsymmetry(run, 'audit');
    if (pair !== null) {
      addDraft(pair);
    }
  } catch (error) {
    log.warn({ runId: run.id, err: error }, 'Audit pair asymmetry detection failed');
  }

  try {
    const shortfalls = await detectModelTranscriptShortfall(run, 'audit');
    for (const shortfall of shortfalls) {
      addDraft(shortfall);
    }
  } catch (error) {
    log.warn({ runId: run.id, err: error }, 'Audit model shortfall detection failed');
  }

  const scannedTypes: AnomalyDraft['type'][] = [
    'ORPHAN_TRANSCRIPT',
    'PAIR_ASYMMETRY',
    'MODEL_TRANSCRIPT_SHORTFALL',
  ];

  if (run.status === 'COMPLETED') {
    try {
      const stranded = await detectStrandedTranscript(run.id);
      if (stranded !== null) {
        addDraft(stranded);
      }
    } catch (error) {
      log.warn({ runId: run.id, err: error }, 'Audit stranded transcript detection failed');
    }

    try {
      const stall = detectSummarizingStall(run);
      if (stall !== null) {
        addDraft(stall);
      }
    } catch (error) {
      log.warn({ runId: run.id, err: error }, 'Audit summarizing stall detection failed');
    }

    try {
      const scheduled = await detectScheduledCountMismatch(run);
      if (scheduled.draft !== null) {
        addDraft(scheduled.draft);
      }
    } catch (error) {
      log.warn({ runId: run.id, err: error }, 'Audit scheduled count mismatch detection failed');
    }
    scannedTypes.push('STRANDED_TRANSCRIPT', 'SUMMARIZING_STALL', 'SCHEDULED_COUNT_MISMATCH');
  }

  for (const type of scannedTypes) {
    await syncAnomalies(run.id, type, draftsByType.get(type) ?? [], 'audit');
  }
}

export function createRunStateAuditHandler(): PgBoss.WorkHandler<RunStateAuditJobData> {
  return async (jobs: PgBoss.Job<RunStateAuditJobData>[]): Promise<void> => {
    if (jobs.length === 0) {
      return;
    }

    const runs = await findRunsForAudit();

    for (const run of runs) {
      try {
        await inspectRun(run);
      } catch (error) {
        log.warn({ runId: run.id, err: error }, 'Audit run inspection failed');
      }
    }
  };
}

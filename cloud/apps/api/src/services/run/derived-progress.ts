/**
 * Derived run progress reads.
 */

import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('services:run:derived-progress');

export type RunProgress = {
  total: number;
  completed: number;
  failed: number;
  summarizeTotal: number;
  summarizeCompleted: number;
  summarizeFailed: number;
};

function extractTotal(progress: unknown): number {
  if (progress === null || progress === undefined || typeof progress !== 'object') {
    return 0;
  }

  const record = progress as Record<string, unknown>;
  const total = record.total;
  return typeof total === 'number' && Number.isFinite(total) ? total : 0;
}

export async function computeRunProgress(runId: string): Promise<RunProgress> {
  log.debug({ runId }, 'Computing derived run progress');

  const [run, probeResults, summarizeTotal, summarizeCompleted, summarizeFailed] =
    await Promise.all([
      db.run.findUnique({
        where: { id: runId },
        select: { progress: true },
      }),
      db.probeResult.groupBy({
        by: ['status'],
        where: { runId, deletedAt: null },
        _count: { _all: true },
      }),
      db.transcript.count({
        where: { runId, deletedAt: null },
      }),
      db.transcript.count({
        where: {
          runId,
          deletedAt: null,
          summarizedAt: { not: null },
          summarizeFailedAt: null,
        },
      }),
      db.transcript.count({
        where: {
          runId,
          deletedAt: null,
          summarizeFailedAt: { not: null },
        },
      }),
    ]);

  const progress = run?.progress;
  const total = extractTotal(progress);

  let completed = 0;
  let failed = 0;
  for (const row of probeResults) {
    if (row.status === 'SUCCESS') {
      completed = row._count._all;
    } else if (row.status === 'FAILED') {
      failed = row._count._all;
    }
  }

  const result: RunProgress = {
    total,
    completed,
    failed,
    summarizeTotal,
    summarizeCompleted,
    summarizeFailed,
  };

  log.debug({ runId, result }, 'Derived run progress computed');
  return result;
}

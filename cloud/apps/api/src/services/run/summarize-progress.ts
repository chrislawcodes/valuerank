/**
 * Summarize Progress Service
 *
 * Legacy read helpers for summarize progress.
 * Counter writes were removed in favor of derived reads.
 */

import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import type { ProgressData } from './progress.js';

const log = createLogger('services:run:summarize-progress');

export async function updateSummarizeProgress(runId: string): Promise<ProgressData | null> {
  const run = await db.run.findUnique({
    where: { id: runId },
    select: { summarizeProgress: true },
  });

  if (run === null) {
    return null;
  }

  return run.summarizeProgress as ProgressData | null;
}

export async function incrementSummarizeCompleted(runId: string): Promise<ProgressData | null> {
  log.debug({ runId }, 'incrementSummarizeCompleted is read-only in derived mode');
  return updateSummarizeProgress(runId);
}

export async function incrementSummarizeFailed(runId: string): Promise<ProgressData | null> {
  log.debug({ runId }, 'incrementSummarizeFailed is read-only in derived mode');
  return updateSummarizeProgress(runId);
}

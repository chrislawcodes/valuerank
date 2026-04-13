/**
 * Summarize Progress Service
 *
 * Handles atomic progress updates for transcript summarization.
 * Extracted from progress.ts to keep file sizes within limits.
 */

import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import type { ProgressData } from './progress.js';

const log = createLogger('services:run:progress');

/**
 * Updates summarize progress atomically using PostgreSQL JSONB operators.
 * Increments the completed or failed count for transcript summarization.
 */
export async function updateSummarizeProgress(
  runId: string,
  update: { incrementCompleted?: number; incrementFailed?: number }
): Promise<ProgressData | null> {
  const { incrementCompleted = 0, incrementFailed = 0 } = update;

  if (incrementCompleted === 0 && incrementFailed === 0) {
    const run = await db.run.findUnique({
      where: { id: runId },
      select: { summarizeProgress: true },
    });
    return run?.summarizeProgress as ProgressData | null;
  }

  log.debug(
    { runId, incrementCompleted, incrementFailed },
    'Updating summarize progress'
  );

  // Use raw SQL for atomic JSONB increment
  const result = await db.$queryRaw<Array<{
    id: string;
    summarize_progress: ProgressData;
  }>>`
    UPDATE runs
    SET
      summarize_progress = jsonb_set(
        jsonb_set(
          summarize_progress,
          '{completed}',
          to_jsonb((summarize_progress->>'completed')::int + ${incrementCompleted})
        ),
        '{failed}',
        to_jsonb((summarize_progress->>'failed')::int + ${incrementFailed})
      ),
      updated_at = NOW()
    WHERE id = ${runId}
    RETURNING id, summarize_progress
  `;

  const updatedRun = result[0];
  if (!updatedRun) {
    return null;
  }

  log.debug({ runId, summarizeProgress: updatedRun.summarize_progress }, 'Summarize progress updated');
  return updatedRun.summarize_progress;
}

/**
 * Increments summarize completed count by 1.
 */
export async function incrementSummarizeCompleted(runId: string): Promise<ProgressData | null> {
  return updateSummarizeProgress(runId, { incrementCompleted: 1 });
}

/**
 * Increments summarize failed count by 1.
 */
export async function incrementSummarizeFailed(runId: string): Promise<ProgressData | null> {
  return updateSummarizeProgress(runId, { incrementFailed: 1 });
}

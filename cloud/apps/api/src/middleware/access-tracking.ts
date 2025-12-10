/**
 * Access Tracking Service
 *
 * Updates lastAccessedAt timestamps when entities are viewed.
 * This enables tracking which runs and transcripts are actively being used.
 */

import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('access-tracking');

/**
 * Update lastAccessedAt for a run.
 * Non-blocking - fire and forget.
 *
 * IMPORTANT: Uses raw SQL to avoid triggering Prisma's @updatedAt auto-update.
 * This ensures that polling the run status doesn't reset updatedAt, which would
 * prevent the orphaned run recovery service from detecting stuck runs.
 */
export function trackRunAccess(runId: string): void {
  db.$executeRaw`
    UPDATE runs
    SET last_accessed_at = NOW()
    WHERE id = ${runId}
  `
    .then(() => {
      log.debug({ runId }, 'Run access tracked');
    })
    .catch((err) => {
      // Don't fail on tracking errors - just log
      log.warn({ err, runId }, 'Failed to track run access');
    });
}

/**
 * Update lastAccessedAt for a transcript.
 * Non-blocking - fire and forget.
 */
export function trackTranscriptAccess(transcriptId: string): void {
  db.transcript
    .update({
      where: { id: transcriptId },
      data: { lastAccessedAt: new Date() },
    })
    .then(() => {
      log.debug({ transcriptId }, 'Transcript access tracked');
    })
    .catch((err) => {
      // Don't fail on tracking errors - just log
      log.warn({ err, transcriptId }, 'Failed to track transcript access');
    });
}

/**
 * Update lastAccessedAt for multiple transcripts.
 * Non-blocking - fire and forget.
 */
export function trackTranscriptsAccess(transcriptIds: string[]): void {
  if (transcriptIds.length === 0) return;

  db.transcript
    .updateMany({
      where: { id: { in: transcriptIds } },
      data: { lastAccessedAt: new Date() },
    })
    .then((result) => {
      log.debug({ count: result.count }, 'Transcript accesses tracked');
    })
    .catch((err) => {
      // Don't fail on tracking errors - just log
      log.warn({ err, count: transcriptIds.length }, 'Failed to track transcript accesses');
    });
}

/**
 * Update lastAccessedAt for a definition.
 * Non-blocking - fire and forget.
 */
export function trackDefinitionAccess(definitionId: string): void {
  db.definition
    .update({
      where: { id: definitionId },
      data: { lastAccessedAt: new Date() },
    })
    .then(() => {
      log.debug({ definitionId }, 'Definition access tracked');
    })
    .catch((err) => {
      // Don't fail on tracking errors - just log
      log.warn({ err, definitionId }, 'Failed to track definition access');
    });
}

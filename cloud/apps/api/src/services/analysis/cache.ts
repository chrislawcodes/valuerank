/**
 * Analysis Cache Service
 *
 * Handles input hash computation and cache validation for analysis results.
 */

import crypto from 'crypto';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('analysis:cache');

/**
 * Compute an input hash for analysis deduplication.
 * Hash is based on runId and sorted transcript IDs.
 */
export function computeInputHash(runId: string, transcriptIds: string[]): string {
  const sortedIds = [...transcriptIds].sort();
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ runId, transcriptIds: sortedIds }))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Check if a valid cached analysis exists.
 *
 * @param runId - The run ID
 * @param inputHash - The input hash to check
 * @param codeVersion - The expected code version
 * @returns The cached analysis ID if valid, null otherwise
 */
export async function getCachedAnalysis(
  runId: string,
  inputHash: string,
  codeVersion: string
): Promise<{ id: string; computedAt: Date | null } | null> {
  const existing = await db.analysisResult.findFirst({
    where: {
      runId,
      inputHash,
      codeVersion,
      status: 'CURRENT',
    },
    select: {
      id: true,
      createdAt: true,
    },
  });

  if (existing) {
    log.debug({ runId, analysisId: existing.id }, 'Found cached analysis');
    return { id: existing.id, computedAt: existing.createdAt };
  }

  return null;
}

/**
 * Check if analysis cache is stale (transcript data has changed).
 *
 * @param runId - The run ID
 * @param transcriptIds - Current transcript IDs
 * @param codeVersion - Current code version
 * @returns True if cache is stale or doesn't exist
 */
export async function isCacheStale(
  runId: string,
  transcriptIds: string[],
  codeVersion: string
): Promise<boolean> {
  const inputHash = computeInputHash(runId, transcriptIds);
  const cached = await getCachedAnalysis(runId, inputHash, codeVersion);
  return cached === null;
}

/**
 * Invalidate all cached analyses for a run.
 * Marks all CURRENT analyses as SUPERSEDED.
 *
 * @param runId - The run ID
 * @returns Number of analyses invalidated
 */
export async function invalidateCache(runId: string): Promise<number> {
  const result = await db.analysisResult.updateMany({
    where: {
      runId,
      status: 'CURRENT',
    },
    data: {
      status: 'SUPERSEDED',
    },
  });

  if (result.count > 0) {
    log.info({ runId, count: result.count }, 'Invalidated cached analyses');
  }

  return result.count;
}

/**
 * Get latest analysis result for a run regardless of cache status.
 */
export async function getLatestAnalysis(runId: string) {
  return db.analysisResult.findFirst({
    where: {
      runId,
      status: 'CURRENT',
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

/**
 * Get analysis history for a run.
 *
 * @param runId - The run ID
 * @param limit - Maximum number of results
 */
export async function getAnalysisHistory(runId: string, limit = 10) {
  return db.analysisResult.findMany({
    where: { runId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

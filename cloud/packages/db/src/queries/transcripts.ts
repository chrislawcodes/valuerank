/**
 * Transcript query helpers.
 * Handles CRUD operations for pipeline transcripts.
 */

import { createLogger, NotFoundError, ValidationError } from '@valuerank/shared';
import { db } from '../client.js';
import { loadTranscriptContent } from '../schema-migration.js';
import type { TranscriptContent } from '../types.js';
import type { Transcript, Prisma } from '@prisma/client';

const log = createLogger('db:transcripts');

// ============================================================================
// INPUT TYPES
// ============================================================================

export type CreateTranscriptInput = {
  runId: string;
  scenarioId?: string;
  modelId: string;
  modelVersion?: string;
  definitionSnapshot?: Record<string, unknown>;
  content: TranscriptContent;
  turnCount: number;
  tokenCount: number;
  durationMs: number;
};

export type TranscriptFilters = {
  runId?: string;
  scenarioId?: string;
  modelId?: string;
  limit?: number;
  offset?: number;
};

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export type TranscriptWithContent = Transcript & {
  parsedContent: TranscriptContent;
};

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

/**
 * Create a new transcript.
 */
export async function createTranscript(data: CreateTranscriptInput): Promise<Transcript> {
  if (!data.runId) {
    throw new ValidationError('Run ID is required', { field: 'runId' });
  }
  if (!data.modelId) {
    throw new ValidationError('Model ID is required', { field: 'modelId' });
  }
  if (!data.content) {
    throw new ValidationError('Transcript content is required', { field: 'content' });
  }

  log.info(
    { runId: data.runId, modelId: data.modelId, modelVersion: data.modelVersion, turnCount: data.turnCount },
    'Creating transcript'
  );

  return db.transcript.create({
    data: {
      runId: data.runId,
      scenarioId: data.scenarioId,
      modelId: data.modelId,
      modelVersion: data.modelVersion,
      definitionSnapshot: data.definitionSnapshot as unknown as Prisma.InputJsonValue,
      content: data.content as unknown as Prisma.InputJsonValue,
      turnCount: data.turnCount,
      tokenCount: data.tokenCount,
      durationMs: data.durationMs,
    },
  });
}

/**
 * Create multiple transcripts in a single batch.
 */
export async function createTranscripts(
  transcripts: CreateTranscriptInput[]
): Promise<{ count: number }> {
  if (transcripts.length === 0) {
    return { count: 0 };
  }

  log.info({ count: transcripts.length }, 'Creating transcripts batch');

  const result = await db.transcript.createMany({
    data: transcripts.map((t) => ({
      runId: t.runId,
      scenarioId: t.scenarioId,
      modelId: t.modelId,
      modelVersion: t.modelVersion,
      definitionSnapshot: t.definitionSnapshot as unknown as Prisma.InputJsonValue,
      content: t.content as unknown as Prisma.InputJsonValue,
      turnCount: t.turnCount,
      tokenCount: t.tokenCount,
      durationMs: t.durationMs,
    })),
  });

  return result;
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get a transcript by ID.
 * Only returns non-deleted transcripts.
 */
export async function getTranscriptById(id: string): Promise<Transcript> {
  log.debug({ id }, 'Fetching transcript');

  const transcript = await db.transcript.findUnique({ where: { id } });
  if (!transcript || transcript.deletedAt !== null) {
    log.warn({ id }, 'Transcript not found');
    throw new NotFoundError('Transcript', id);
  }

  return transcript;
}

/**
 * Get a transcript with parsed content.
 */
export async function getTranscriptWithContent(id: string): Promise<TranscriptWithContent> {
  const transcript = await getTranscriptById(id);
  const parsedContent = loadTranscriptContent(transcript.content);

  return {
    ...transcript,
    parsedContent,
  };
}

/**
 * Get all transcripts for a run.
 * Automatically excludes soft-deleted transcripts.
 */
export async function getTranscriptsForRun(runId: string): Promise<Transcript[]> {
  log.debug({ runId }, 'Fetching transcripts for run');

  return db.transcript.findMany({
    where: { runId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Get transcripts with parsed content for a run.
 */
export async function getTranscriptsWithContentForRun(
  runId: string
): Promise<TranscriptWithContent[]> {
  const transcripts = await getTranscriptsForRun(runId);

  return transcripts.map((t) => ({
    ...t,
    parsedContent: loadTranscriptContent(t.content),
  }));
}

/**
 * List transcripts with optional filters.
 * Automatically excludes soft-deleted transcripts.
 */
export async function listTranscripts(filters?: TranscriptFilters): Promise<Transcript[]> {
  log.debug({ filters }, 'Listing transcripts');

  const where: Prisma.TranscriptWhereInput = {
    deletedAt: null, // Exclude soft-deleted
  };

  if (filters?.runId) where.runId = filters.runId;
  if (filters?.scenarioId) where.scenarioId = filters.scenarioId;
  if (filters?.modelId) where.modelId = filters.modelId;

  return db.transcript.findMany({
    where,
    take: filters?.limit,
    skip: filters?.offset,
    orderBy: { createdAt: 'desc' },
  });
}

// ============================================================================
// AGGREGATE OPERATIONS
// ============================================================================

/**
 * Get transcript statistics for a run.
 * Excludes soft-deleted transcripts from statistics.
 */
export async function getTranscriptStatsForRun(
  runId: string
): Promise<{
  count: number;
  totalTokens: number;
  totalDurationMs: number;
  avgTurns: number;
  modelCounts: Record<string, number>;
}> {
  log.debug({ runId }, 'Getting transcript stats');

  const transcripts = await db.transcript.findMany({
    where: { runId, deletedAt: null },
    select: {
      modelId: true,
      turnCount: true,
      tokenCount: true,
      durationMs: true,
    },
  });

  const modelCounts: Record<string, number> = {};
  let totalTokens = 0;
  let totalDurationMs = 0;
  let totalTurns = 0;

  for (const t of transcripts) {
    modelCounts[t.modelId] = (modelCounts[t.modelId] ?? 0) + 1;
    totalTokens += t.tokenCount;
    totalDurationMs += t.durationMs;
    totalTurns += t.turnCount;
  }

  return {
    count: transcripts.length,
    totalTokens,
    totalDurationMs,
    avgTurns: transcripts.length > 0 ? totalTurns / transcripts.length : 0,
    modelCounts,
  };
}

// ============================================================================
// ACCESS TRACKING
// ============================================================================

/**
 * Update the last_accessed_at timestamp for a transcript.
 * Call this on read operations to track usage.
 */
export async function touchTranscript(id: string): Promise<void> {
  log.debug({ id }, 'Updating transcript access timestamp');

  await db.transcript.update({
    where: { id },
    data: { lastAccessedAt: new Date() },
  });
}

/**
 * Update the last_accessed_at timestamp for multiple transcripts.
 */
export async function touchTranscripts(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  log.debug({ count: ids.length }, 'Updating transcript access timestamps');

  await db.transcript.updateMany({
    where: { id: { in: ids } },
    data: { lastAccessedAt: new Date() },
  });
}

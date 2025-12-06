/**
 * Run query helpers.
 * Handles CRUD operations and progress tracking for pipeline runs.
 */

import { createLogger, NotFoundError, ValidationError } from '@valuerank/shared';
import { db } from '../client.js';
import { loadRunConfig } from '../schema-migration.js';
import { getDefinitionTreeIds } from './definitions.js';
import type { RunConfig, RunProgress } from '../types.js';
import type { Run, RunStatus, Prisma, Transcript } from '@prisma/client';

const log = createLogger('db:runs');

// ============================================================================
// INPUT TYPES
// ============================================================================

export type CreateRunInput = {
  definitionId: string;
  config: RunConfig;
  experimentId?: string;
};

export type RunFilters = {
  definitionId?: string;
  experimentId?: string;
  status?: RunStatus;
  limit?: number;
  offset?: number;
};

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export type RunWithTranscripts = Run & {
  transcripts: Transcript[];
  parsedConfig: RunConfig;
};

export type RunWithProgress = Run & {
  parsedConfig: RunConfig;
  parsedProgress: RunProgress | null;
};

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

/**
 * Create a new run.
 */
export async function createRun(data: CreateRunInput): Promise<Run> {
  if (!data.definitionId) {
    throw new ValidationError('Definition ID is required', { field: 'definitionId' });
  }
  if (!data.config) {
    throw new ValidationError('Run config is required', { field: 'config' });
  }

  log.info({ definitionId: data.definitionId, models: data.config.models }, 'Creating run');

  return db.run.create({
    data: {
      definitionId: data.definitionId,
      experimentId: data.experimentId,
      config: data.config as unknown as Prisma.InputJsonValue,
      progress: { total: 0, completed: 0, failed: 0 } as unknown as Prisma.InputJsonValue,
    },
  });
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get a run by ID.
 */
export async function getRunById(id: string): Promise<Run> {
  log.debug({ id }, 'Fetching run');

  const run = await db.run.findUnique({ where: { id } });
  if (!run) {
    log.warn({ id }, 'Run not found');
    throw new NotFoundError('Run', id);
  }

  return run;
}

/**
 * Get a run with its transcripts.
 */
export async function getRunWithTranscripts(id: string): Promise<RunWithTranscripts> {
  const run = await db.run.findUnique({
    where: { id },
    include: { transcripts: true },
  });

  if (!run) {
    throw new NotFoundError('Run', id);
  }

  const parsedConfig = loadRunConfig(run.config);

  return {
    ...run,
    parsedConfig,
  };
}

/**
 * Get a run with parsed config and progress.
 */
export async function getRunWithProgress(id: string): Promise<RunWithProgress> {
  const run = await getRunById(id);
  const parsedConfig = loadRunConfig(run.config);
  const parsedProgress = run.progress ? (run.progress as unknown as RunProgress) : null;

  return {
    ...run,
    parsedConfig,
    parsedProgress,
  };
}

/**
 * List runs with optional filters.
 */
export async function listRuns(filters?: RunFilters): Promise<Run[]> {
  log.debug({ filters }, 'Listing runs');

  const where: Prisma.RunWhereInput = {};

  if (filters?.definitionId) where.definitionId = filters.definitionId;
  if (filters?.experimentId) where.experimentId = filters.experimentId;
  if (filters?.status) where.status = filters.status;

  return db.run.findMany({
    where,
    take: filters?.limit,
    skip: filters?.offset,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get all runs for a definition tree (root + all descendants).
 */
export async function getRunsForDefinitionTree(rootDefinitionId: string): Promise<Run[]> {
  log.debug({ rootDefinitionId }, 'Fetching runs for definition tree');

  const treeIds = await getDefinitionTreeIds(rootDefinitionId);

  return db.run.findMany({
    where: {
      definitionId: { in: treeIds },
    },
    orderBy: { createdAt: 'desc' },
  });
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Update run status.
 */
export async function updateRunStatus(id: string, status: RunStatus): Promise<Run> {
  log.info({ id, status }, 'Updating run status');

  // Verify exists first
  await getRunById(id);

  const updateData: Prisma.RunUpdateInput = { status };

  // Set timestamps based on status
  if (status === 'RUNNING') {
    updateData.startedAt = new Date();
  } else if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') {
    updateData.completedAt = new Date();
  }

  return db.run.update({
    where: { id },
    data: updateData,
  });
}

/**
 * Update run progress.
 */
export async function updateRunProgress(id: string, progress: RunProgress): Promise<Run> {
  log.debug({ id, progress }, 'Updating run progress');

  // Verify exists first
  await getRunById(id);

  return db.run.update({
    where: { id },
    data: {
      progress: progress as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Increment run progress.
 */
export async function incrementRunProgress(
  id: string,
  increment: { completed?: number; failed?: number }
): Promise<Run> {
  const run = await getRunById(id);
  const current = (run.progress as unknown as RunProgress) ?? { total: 0, completed: 0, failed: 0 };

  const updated: RunProgress = {
    total: current.total,
    completed: current.completed + (increment.completed ?? 0),
    failed: current.failed + (increment.failed ?? 0),
  };

  return updateRunProgress(id, updated);
}

// ============================================================================
// ACCESS TRACKING
// ============================================================================

/**
 * Update the last_accessed_at timestamp for a run.
 * Call this on read operations to track usage.
 */
export async function touchRun(id: string): Promise<void> {
  log.debug({ id }, 'Updating run access timestamp');

  await db.run.update({
    where: { id },
    data: { lastAccessedAt: new Date() },
  });
}

/**
 * Update the last_accessed_at timestamp for multiple runs.
 */
export async function touchRuns(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  log.debug({ count: ids.length }, 'Updating run access timestamps');

  await db.run.updateMany({
    where: { id: { in: ids } },
    data: { lastAccessedAt: new Date() },
  });
}

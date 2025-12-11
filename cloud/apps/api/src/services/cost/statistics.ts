/**
 * Token Statistics Service
 *
 * Queries and updates token statistics for cost prediction.
 */

import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import type { ModelTokenStats, UpsertStatsInput } from './types.js';

const log = createLogger('services:cost:statistics');

/**
 * Fetches token statistics for specific models.
 * Only returns global stats (definitionId = null) for P1.
 *
 * Note: modelIds are model identifier strings (e.g., "gpt-4"), not database UUIDs.
 * The ModelTokenStatistics.modelId is a foreign key to LlmModel.id (UUID),
 * so we need to join through LlmModel to filter by model identifier.
 *
 * @param modelIds - Array of model identifier strings to fetch stats for
 * @returns Map of model identifier to ModelTokenStats
 */
export async function getTokenStatsForModels(
  modelIds: string[]
): Promise<Map<string, ModelTokenStats>> {
  if (modelIds.length === 0) {
    return new Map();
  }

  // Fetch statistics joined with LlmModel to filter by model identifier (not UUID)
  const stats = await db.modelTokenStatistics.findMany({
    where: {
      model: {
        modelId: { in: modelIds },
      },
      definitionId: null, // Global stats only (P1)
    },
    include: {
      model: {
        select: { modelId: true }, // Get the model identifier for mapping
      },
    },
  });

  log.debug({ modelIds, foundCount: stats.length }, 'Fetched token statistics');

  // Map by model identifier string (not database UUID)
  return new Map(
    stats.map((s) => [
      s.model.modelId, // Use the model identifier, not the database ID
      {
        modelId: s.model.modelId,
        avgInputTokens: Number(s.avgInputTokens),
        avgOutputTokens: Number(s.avgOutputTokens),
        sampleCount: s.sampleCount,
        lastUpdatedAt: s.lastUpdatedAt,
      },
    ])
  );
}

/**
 * All-model average token stats.
 */
export type AllModelAverage = {
  input: number;
  output: number;
  sampleCount: number;
};

/**
 * Calculates the average token counts across all models.
 * Used as fallback when a specific model has no statistics.
 *
 * @returns Average input/output tokens, or null if no data exists
 */
export async function getAllModelAverage(): Promise<AllModelAverage | null> {
  const result = await db.modelTokenStatistics.aggregate({
    where: {
      definitionId: null,
      sampleCount: { gt: 0 },
    },
    _avg: {
      avgInputTokens: true,
      avgOutputTokens: true,
    },
    _sum: {
      sampleCount: true,
    },
  });

  if (result._avg.avgInputTokens === null || result._avg.avgOutputTokens === null) {
    log.debug('No model statistics exist in database');
    return null;
  }

  const avg: AllModelAverage = {
    input: Number(result._avg.avgInputTokens),
    output: Number(result._avg.avgOutputTokens),
    sampleCount: result._sum.sampleCount ?? 0,
  };

  log.debug({ avg }, 'Computed all-model average');
  return avg;
}

/**
 * Updates or creates token statistics for a model.
 * Uses upsert to handle both new and existing records.
 *
 * Note: Prisma doesn't support null in compound unique keys for upsert,
 * so we use findFirst + create/update pattern instead.
 *
 * @param input - Statistics to upsert
 */
export async function upsertTokenStats(input: UpsertStatsInput): Promise<void> {
  const { modelId, definitionId, avgInputTokens, avgOutputTokens, sampleCount } = input;

  // Prisma doesn't support null in compound unique keys for upsert
  // So we use findFirst + create/update pattern
  const existing = await db.modelTokenStatistics.findFirst({
    where: {
      modelId,
      definitionId: definitionId ?? null,
    },
  });

  if (existing) {
    await db.modelTokenStatistics.update({
      where: { id: existing.id },
      data: {
        avgInputTokens,
        avgOutputTokens,
        sampleCount,
      },
    });
  } else {
    await db.modelTokenStatistics.create({
      data: {
        modelId,
        definitionId: definitionId ?? null,
        avgInputTokens,
        avgOutputTokens,
        sampleCount,
      },
    });
  }

  log.info(
    { modelId, definitionId, avgInputTokens, avgOutputTokens, sampleCount },
    'Upserted token statistics'
  );
}

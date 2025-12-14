/**
 * Provider Parallelism Service
 *
 * Enforces per-provider parallelism limits for probe jobs.
 * Uses provider-specific queues with PgBoss batchSize for concurrency control.
 *
 * Architecture:
 * - Each provider gets its own queue: `probe:openai`, `probe:anthropic`, etc.
 * - Queue batchSize is set from provider's `maxParallelRequests` setting
 * - Jobs are routed to provider queues based on modelId
 * - Workers process jobs in batches limited by maxParallelRequests
 */

import { createLogger } from '@valuerank/shared';
import { db, getAllProvidersWithModels } from '@valuerank/db';
import type { PgBoss, QueueResult } from 'pg-boss';

const log = createLogger('services:parallelism');

// Cache provider limits with TTL for performance
export type ProviderLimits = {
  maxParallelRequests: number;
  requestsPerMinute: number;
  queueName: string;
};

let providerLimitsCache: Map<string, ProviderLimits> = new Map();
let modelToProviderCache: Map<string, string> = new Map();
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60000; // 1 minute

/**
 * Generate the queue name for a provider's probe jobs.
 * Uses underscores as PgBoss only allows alphanumeric, underscores, hyphens, or periods.
 */
export function getProviderQueueName(providerName: string): string {
  return `probe_${providerName}`;
}

/**
 * Check if cache needs refresh.
 */
function isCacheStale(): boolean {
  return Date.now() - cacheLoadedAt > CACHE_TTL_MS;
}

/**
 * Load provider limits from database and populate cache.
 */
export async function loadProviderLimits(): Promise<Map<string, ProviderLimits>> {
  if (!isCacheStale() && providerLimitsCache.size > 0) {
    return providerLimitsCache;
  }

  log.debug('Loading provider limits from database');

  const providers = await getAllProvidersWithModels();

  // Clear and rebuild caches
  providerLimitsCache = new Map();
  modelToProviderCache = new Map();

  for (const provider of providers) {
    if (!provider.isEnabled) {
      continue;
    }

    const queueName = getProviderQueueName(provider.name);

    // Store provider limits
    providerLimitsCache.set(provider.name, {
      maxParallelRequests: provider.maxParallelRequests,
      requestsPerMinute: provider.requestsPerMinute,
      queueName,
    });

    // Map model IDs to provider names
    for (const model of provider.models) {
      modelToProviderCache.set(model.modelId, provider.name);
    }
  }

  cacheLoadedAt = Date.now();
  log.info(
    { providerCount: providerLimitsCache.size, modelCount: modelToProviderCache.size },
    'Provider limits loaded'
  );

  return providerLimitsCache;
}

/**
 * Get provider name for a model ID.
 * Falls back to database lookup if not in cache.
 */
export async function getProviderForModel(modelId: string): Promise<string | null> {
  // Check cache first
  if (!isCacheStale() && modelToProviderCache.has(modelId)) {
    return modelToProviderCache.get(modelId) ?? null;
  }

  // Reload cache
  await loadProviderLimits();

  // Check cache again
  if (modelToProviderCache.has(modelId)) {
    return modelToProviderCache.get(modelId) ?? null;
  }

  // Direct database lookup for uncached models
  log.debug({ modelId }, 'Model not in cache, looking up in database');
  const model = await db.llmModel.findFirst({
    where: { modelId, status: 'ACTIVE' },
    include: { provider: true },
  });

  if (model) {
    modelToProviderCache.set(modelId, model.provider.name);
    return model.provider.name;
  }

  return null;
}

/**
 * Get the queue name for a model ID.
 * Returns the provider-specific queue name.
 */
export async function getQueueNameForModel(modelId: string): Promise<string> {
  const providerName = await getProviderForModel(modelId);

  if (!providerName) {
    log.warn({ modelId }, 'Unknown model, using default queue');
    return 'probe_scenario'; // Fall back to default queue
  }

  return getProviderQueueName(providerName);
}

/**
 * Get parallelism limits for a provider.
 */
export async function getProviderLimits(providerName: string): Promise<ProviderLimits | null> {
  await loadProviderLimits();
  return providerLimitsCache.get(providerName) ?? null;
}

/**
 * Get all provider queue names and their limits.
 */
export async function getAllProviderQueues(): Promise<Map<string, ProviderLimits>> {
  await loadProviderLimits();
  return new Map(providerLimitsCache);
}

/**
 * Create provider-specific queues in PgBoss.
 * Should be called during orchestrator startup.
 */
export async function createProviderQueues(boss: PgBoss): Promise<void> {
  const limits = await loadProviderLimits();

  log.info({ providerCount: limits.size }, 'Creating provider-specific probe queues');

  for (const [providerName, providerLimits] of limits) {
    const queueName = providerLimits.queueName;

    log.info(
      { provider: providerName, queueName, maxParallel: providerLimits.maxParallelRequests },
      'Creating provider queue'
    );

    // Create queue (idempotent in PgBoss v10+)
    await boss.createQueue(queueName);
  }

  log.info('Provider queues created');
}

/**
 * Register handlers for all provider-specific probe queues.
 * Each queue gets a handler with batchSize matching the provider's maxParallelRequests.
 */
export async function registerProviderQueueHandlers(
  boss: PgBoss,
  handler: Parameters<PgBoss['work']>[2]
): Promise<void> {
  const limits = await loadProviderLimits();

  log.info({ providerCount: limits.size }, 'Registering provider queue handlers');

  for (const [providerName, providerLimits] of limits) {
    const queueName = providerLimits.queueName;
    const batchSize = providerLimits.maxParallelRequests;

    log.info(
      { provider: providerName, queueName, batchSize },
      'Registering provider queue handler'
    );

    // Register worker with batchSize limiting concurrent job processing
    await boss.work(queueName, { batchSize }, handler);
  }

  log.info('Provider queue handlers registered');
}

/**
 * Get active job counts per provider.
 * Uses PgBoss getQueues() for accurate queue state.
 */
export async function getActiveJobsPerProvider(boss: PgBoss): Promise<Map<string, number>> {
  const limits = await loadProviderLimits();
  const activeJobs = new Map<string, number>();

  try {
    // Get all queues with their stats
    const queues = await boss.getQueues();
    const queueMap = new Map<string, QueueResult>(queues.map(q => [q.name, q]));

    for (const [providerName, providerLimits] of limits) {
      const queueName = providerLimits.queueName;
      const queueInfo = queueMap.get(queueName);

      if (queueInfo) {
        // activeCount is the number of jobs currently being processed
        activeJobs.set(providerName, queueInfo.activeCount);
      } else {
        activeJobs.set(providerName, 0);
      }
    }
  } catch (err) {
    log.debug({ err }, 'Could not get queue stats');
    // Fall back to zeros
    for (const [providerName] of limits) {
      activeJobs.set(providerName, 0);
    }
  }

  return activeJobs;
}

/**
 * Check if a provider has capacity for more jobs.
 * Returns true if provider is under its parallelism limit.
 */
export async function hasProviderCapacity(
  boss: PgBoss,
  providerName: string
): Promise<boolean> {
  const limits = await getProviderLimits(providerName);
  if (!limits) {
    log.warn({ provider: providerName }, 'Unknown provider, allowing job');
    return true;
  }

  try {
    const queues = await boss.getQueues();
    const queueInfo = queues.find(q => q.name === limits.queueName);

    if (!queueInfo) {
      log.debug({ provider: providerName }, 'Queue not found, allowing job');
      return true;
    }

    const activeCount = queueInfo.activeCount;
    const hasCapacity = activeCount < limits.maxParallelRequests;

    log.debug(
      { provider: providerName, activeCount, maxParallel: limits.maxParallelRequests, hasCapacity },
      'Checking provider capacity'
    );

    return hasCapacity;
  } catch (err) {
    log.debug({ provider: providerName, err }, 'Could not check capacity');
    return true; // Allow job on error
  }
}

/**
 * Clear the provider limits cache.
 * Useful for testing or after provider settings change.
 */
export function clearCache(): void {
  providerLimitsCache = new Map();
  modelToProviderCache = new Map();
  cacheLoadedAt = 0;
  log.debug('Provider limits cache cleared');
}

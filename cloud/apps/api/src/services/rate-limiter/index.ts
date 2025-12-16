/**
 * Rate Limiter Service
 *
 * Provides per-provider rate limiting using Bottleneck.
 * Enforces both maxParallelRequests (concurrency) and requestsPerMinute (rate).
 *
 * Each provider gets its own Bottleneck instance configured from database settings.
 */

import Bottleneck from 'bottleneck';
import { createLogger } from '@valuerank/shared';
import { loadProviderLimits, type ProviderLimits } from '../parallelism/index.js';

const log = createLogger('services:rate-limiter');

// Per-provider Bottleneck instances
const providerLimiters = new Map<string, Bottleneck>();

// Track metrics for UI display
export type ProviderMetrics = {
  provider: string;
  activeJobs: number;
  queuedJobs: number;
  maxParallel: number;
  requestsPerMinute: number;
  recentCompletions: CompletionEvent[];
};

export type CompletionEvent = {
  modelId: string;
  scenarioId: string;
  success: boolean;
  completedAt: Date;
  durationMs: number;
};

// Circular buffer for recent completions per provider
const recentCompletionsBuffer = new Map<string, CompletionEvent[]>();
const MAX_RECENT_COMPLETIONS = 10;

// Active job tracking
const activeJobCounts = new Map<string, number>();
const queuedJobCounts = new Map<string, number>();

// Track limiter configuration for diagnostics
const limiterConfigs = new Map<string, {
  maxConcurrent: number;
  minTime: number;
  reservoir: number;
  requestsPerMinute: number;
  createdAt: Date;
}>();

/**
 * Stats returned by getLimiterStats for diagnostics.
 */
export type LimiterStats = {
  exists: boolean;
  provider: string;
  config?: {
    maxConcurrent: number;
    minTime: number;
    reservoir: number;
    requestsPerMinute: number;
    createdAt: string;
  };
  counts?: {
    running: number;
    queued: number;
    done: number;
    received: number;
  };
  tracking?: {
    activeJobs: number;
    queuedJobs: number;
  };
};

/**
 * Get or create a Bottleneck limiter for a provider.
 */
async function getOrCreateLimiter(providerName: string): Promise<Bottleneck> {
  // Return existing limiter if available
  const existing = providerLimiters.get(providerName);
  if (existing) {
    return existing;
  }

  // Load limits from database
  const allLimits = await loadProviderLimits();
  const limits = allLimits.get(providerName);

  if (!limits) {
    log.warn({ provider: providerName }, 'No limits found for provider, using defaults');
    // Default conservative limits
    const defaultLimiter = createLimiter(providerName, {
      maxParallelRequests: 1,
      requestsPerMinute: 30,
      queueName: `probe_${providerName}`,
    });
    providerLimiters.set(providerName, defaultLimiter);
    return defaultLimiter;
  }

  const limiter = createLimiter(providerName, limits);
  providerLimiters.set(providerName, limiter);
  return limiter;
}

/**
 * Create a Bottleneck instance with the given limits.
 */
function createLimiter(providerName: string, limits: ProviderLimits): Bottleneck {
  // Calculate minTime from requestsPerMinute
  // e.g., 60 rpm = 1000ms between requests
  const minTime = Math.ceil(60000 / limits.requestsPerMinute);

  log.info(
    {
      provider: providerName,
      maxConcurrent: limits.maxParallelRequests,
      requestsPerMinute: limits.requestsPerMinute,
      minTime,
      reservoir: limits.requestsPerMinute,
      reservoirRefreshInterval: 60000,
    },
    'Creating rate limiter with Bottleneck config'
  );

  const limiter = new Bottleneck({
    maxConcurrent: limits.maxParallelRequests,
    minTime,
    // Use a reservoir for additional rate limiting if needed
    reservoir: limits.requestsPerMinute,
    reservoirRefreshInterval: 60000, // Refill every minute
    reservoirRefreshAmount: limits.requestsPerMinute,
  });

  // Store config for diagnostics
  limiterConfigs.set(providerName, {
    maxConcurrent: limits.maxParallelRequests,
    minTime,
    reservoir: limits.requestsPerMinute,
    requestsPerMinute: limits.requestsPerMinute,
    createdAt: new Date(),
  });

  // Initialize metrics
  activeJobCounts.set(providerName, 0);
  queuedJobCounts.set(providerName, 0);
  recentCompletionsBuffer.set(providerName, []);

  // Track queue changes with detailed logging
  limiter.on('queued', (info) => {
    const current = queuedJobCounts.get(providerName) ?? 0;
    const newCount = current + 1;
    queuedJobCounts.set(providerName, newCount);

    // Log when queue starts building up (every 10 jobs or first job)
    if (newCount === 1 || newCount % 10 === 0) {
      log.debug(
        { provider: providerName, queuedCount: newCount, jobInfo: info },
        'Job queued in rate limiter'
      );
    }
  });

  limiter.on('executing', (info) => {
    const queued = queuedJobCounts.get(providerName) ?? 0;
    const active = activeJobCounts.get(providerName) ?? 0;
    queuedJobCounts.set(providerName, Math.max(0, queued - 1));
    const newActive = active + 1;
    activeJobCounts.set(providerName, newActive);

    // Log active count changes
    log.debug(
      { provider: providerName, activeCount: newActive, queuedCount: Math.max(0, queued - 1), jobInfo: info },
      'Job executing from rate limiter'
    );
  });

  limiter.on('done', (info) => {
    const active = activeJobCounts.get(providerName) ?? 0;
    const newActive = Math.max(0, active - 1);
    activeJobCounts.set(providerName, newActive);

    log.debug(
      { provider: providerName, activeCount: newActive, jobInfo: info },
      'Job done in rate limiter'
    );
  });

  limiter.on('depleted', () => {
    log.warn(
      { provider: providerName },
      'Rate limiter reservoir depleted - requests will be throttled until refill'
    );
  });

  limiter.on('error', (error) => {
    log.error({ provider: providerName, error }, 'Bottleneck error');
  });

  return limiter;
}

/**
 * Schedule a job through the rate limiter for a provider.
 */
export async function schedule<T>(
  providerName: string,
  jobId: string,
  modelId: string,
  scenarioId: string,
  fn: () => Promise<T>
): Promise<T> {
  const limiter = await getOrCreateLimiter(providerName);
  const startTime = Date.now();

  try {
    const result = await limiter.schedule({ id: jobId }, fn);

    // Record successful completion
    recordCompletion(providerName, {
      modelId,
      scenarioId,
      success: true,
      completedAt: new Date(),
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    // Record failed completion
    recordCompletion(providerName, {
      modelId,
      scenarioId,
      success: false,
      completedAt: new Date(),
      durationMs: Date.now() - startTime,
    });
    throw error;
  }
}

/**
 * Record a completion event for metrics tracking.
 */
function recordCompletion(providerName: string, event: CompletionEvent): void {
  const buffer = recentCompletionsBuffer.get(providerName) ?? [];
  buffer.unshift(event);

  // Keep only recent completions
  if (buffer.length > MAX_RECENT_COMPLETIONS) {
    buffer.pop();
  }

  recentCompletionsBuffer.set(providerName, buffer);
}

/**
 * Get current metrics for all providers.
 */
export async function getAllMetrics(): Promise<ProviderMetrics[]> {
  const allLimits = await loadProviderLimits();
  const metrics: ProviderMetrics[] = [];

  for (const [providerName, limits] of allLimits) {
    metrics.push({
      provider: providerName,
      activeJobs: activeJobCounts.get(providerName) ?? 0,
      queuedJobs: queuedJobCounts.get(providerName) ?? 0,
      maxParallel: limits.maxParallelRequests,
      requestsPerMinute: limits.requestsPerMinute,
      recentCompletions: recentCompletionsBuffer.get(providerName) ?? [],
    });
  }

  return metrics;
}

/**
 * Get metrics for a specific provider.
 */
export async function getProviderMetrics(providerName: string): Promise<ProviderMetrics | null> {
  const allLimits = await loadProviderLimits();
  const limits = allLimits.get(providerName);

  if (!limits) {
    return null;
  }

  return {
    provider: providerName,
    activeJobs: activeJobCounts.get(providerName) ?? 0,
    queuedJobs: queuedJobCounts.get(providerName) ?? 0,
    maxParallel: limits.maxParallelRequests,
    requestsPerMinute: limits.requestsPerMinute,
    recentCompletions: recentCompletionsBuffer.get(providerName) ?? [],
  };
}

/**
 * Get total active and queued jobs across all providers.
 */
export function getTotals(): { totalActive: number; totalQueued: number } {
  let totalActive = 0;
  let totalQueued = 0;

  for (const count of activeJobCounts.values()) {
    totalActive += count;
  }
  for (const count of queuedJobCounts.values()) {
    totalQueued += count;
  }

  return { totalActive, totalQueued };
}

/**
 * Clear all limiters and metrics (for testing).
 */
export function clearAll(): void {
  for (const limiter of providerLimiters.values()) {
    void limiter.disconnect();
  }
  providerLimiters.clear();
  limiterConfigs.clear();
  activeJobCounts.clear();
  queuedJobCounts.clear();
  recentCompletionsBuffer.clear();
  log.debug('All rate limiters cleared');
}

/**
 * Reload limiters from database (after settings change).
 */
export async function reloadLimiters(): Promise<void> {
  log.info('Reloading rate limiters from database');

  // Clear existing limiters
  for (const limiter of providerLimiters.values()) {
    void limiter.disconnect();
  }
  providerLimiters.clear();
  limiterConfigs.clear();

  // Pre-load all provider limiters
  const allLimits = await loadProviderLimits();
  for (const [providerName, limits] of allLimits) {
    const limiter = createLimiter(providerName, limits);
    providerLimiters.set(providerName, limiter);
  }

  log.info({ providerCount: providerLimiters.size }, 'Rate limiters reloaded');
}

/**
 * Get detailed stats for a rate limiter (for diagnostics).
 * Returns internal Bottleneck state plus our tracking counts.
 */
export async function getLimiterStats(providerName: string): Promise<LimiterStats> {
  const limiter = providerLimiters.get(providerName);

  if (!limiter) {
    return {
      exists: false,
      provider: providerName,
    };
  }

  // Get Bottleneck's internal counts
  const counts = limiter.counts();
  const config = limiterConfigs.get(providerName);

  return {
    exists: true,
    provider: providerName,
    config: config ? {
      maxConcurrent: config.maxConcurrent,
      minTime: config.minTime,
      reservoir: config.reservoir,
      requestsPerMinute: config.requestsPerMinute,
      createdAt: config.createdAt.toISOString(),
    } : undefined,
    counts: {
      running: counts.RUNNING ?? 0,
      queued: counts.QUEUED ?? 0,
      done: counts.DONE ?? 0,
      received: counts.RECEIVED ?? 0,
    },
    tracking: {
      activeJobs: activeJobCounts.get(providerName) ?? 0,
      queuedJobs: queuedJobCounts.get(providerName) ?? 0,
    },
  };
}

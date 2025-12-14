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
    },
    'Creating rate limiter'
  );

  const limiter = new Bottleneck({
    maxConcurrent: limits.maxParallelRequests,
    minTime,
    // Use a reservoir for additional rate limiting if needed
    reservoir: limits.requestsPerMinute,
    reservoirRefreshInterval: 60000, // Refill every minute
    reservoirRefreshAmount: limits.requestsPerMinute,
  });

  // Initialize metrics
  activeJobCounts.set(providerName, 0);
  queuedJobCounts.set(providerName, 0);
  recentCompletionsBuffer.set(providerName, []);

  // Track queue changes
  limiter.on('queued', () => {
    const current = queuedJobCounts.get(providerName) ?? 0;
    queuedJobCounts.set(providerName, current + 1);
  });

  limiter.on('executing', () => {
    const queued = queuedJobCounts.get(providerName) ?? 0;
    const active = activeJobCounts.get(providerName) ?? 0;
    queuedJobCounts.set(providerName, Math.max(0, queued - 1));
    activeJobCounts.set(providerName, active + 1);
  });

  limiter.on('done', () => {
    const active = activeJobCounts.get(providerName) ?? 0;
    activeJobCounts.set(providerName, Math.max(0, active - 1));
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

  // Pre-load all provider limiters
  const allLimits = await loadProviderLimits();
  for (const [providerName, limits] of allLimits) {
    const limiter = createLimiter(providerName, limits);
    providerLimiters.set(providerName, limiter);
  }

  log.info({ providerCount: providerLimiters.size }, 'Rate limiters reloaded');
}

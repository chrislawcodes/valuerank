/**
 * Summarization Parallelism Service
 *
 * Manages configurable parallelism for summarization jobs.
 * Uses SystemSetting table for persistence with in-memory caching.
 *
 * Architecture:
 * - Setting stored in `system_settings` table with key `infra_max_parallel_summarizations`
 * - Value cached with 60s TTL for performance
 * - Changes trigger handler re-registration for hot reload
 */

import os from 'os';
import { db } from '@valuerank/db';
import { createLogger, ValidationError } from '@valuerank/shared';
// Relative import to config file
import { config } from '../../config.js';

const log = createLogger('services:summarization-parallelism');

// Setting key in SystemSetting table
const SETTING_KEY = 'infra_max_parallel_summarizations';

// Absolute safety cap for production
const PROD_ABSOLUTE_CAP = 100;
// Safety cap for non-production environments
const DEV_ABSOLUTE_CAP = 16;

// Valid range for the setting
const MIN_PARALLELISM = 1;
const MAX_PARALLELISM = 500;

// Cache configuration
const CACHE_TTL_MS = 60000; // 1 minute

// In-memory cache
let cachedValue: number | null = null;
let cacheLoadedAt = 0;

/**
 * Calculates a smart default for parallelism based on system resources.
 * 
 * Heuristics:
 * 1. Memory: Reserve 2GB for OS/App, allocate ~50MB per worker.
 * 2. Environment: Cap at 100 for Prod, 16 for Dev/Test.
 */
function calculateSmartDefault(): number {
  try {
    // 1. Memory Heuristic
    const totalMem = os.totalmem();
    const reservedMem = 2 * 1024 * 1024 * 1024; // 2GB reserved
    const availableForWorkers = Math.max(0, totalMem - reservedMem);
    const workerMemEstimate = 50 * 1024 * 1024; // 50MB per worker
    const memoryLimit = Math.floor(availableForWorkers / workerMemEstimate);

    // 2. Environment Cap
    const isProduction = config.NODE_ENV === 'production';
    const environmentCap = isProduction ? PROD_ABSOLUTE_CAP : DEV_ABSOLUTE_CAP;

    // 3. Final Calculation
    // Take the minimum of memory capacity and environment cap
    // Ensure at least 1 worker
    const smartLimit = Math.max(1, Math.min(memoryLimit, environmentCap));

    log.debug(
      {
        totalMemGb: (totalMem / 1024 / 1024 / 1024).toFixed(2),
        isProduction,
        memoryLimit,
        environmentCap,
        smartLimit
      },
      'Calculated smart default parallelism'
    );

    return smartLimit;
  } catch (err) {
    log.warn({ err }, 'Failed to calculate smart default, falling back to safe minimum');
    return 4; // Conservative fallback
  }
}

// Calculate once at module load
const DEFAULT_PARALLELISM = calculateSmartDefault();

/**
 * Check if cache needs refresh.
 */
function isCacheStale(): boolean {
  return Date.now() - cacheLoadedAt > CACHE_TTL_MS;
}

/**
 * Get the maximum parallel summarizations setting.
 *
 * Returns the cached value if fresh, otherwise loads from database.
 * Falls back to smart default if setting doesn't exist or on database error.
 */
export async function getMaxParallelSummarizations(): Promise<number> {
  // Return cached value if fresh
  if (!isCacheStale() && cachedValue !== null) {
    return cachedValue;
  }

  log.debug('Loading max parallel summarizations from database');

  try {
    const setting = await db.systemSetting.findUnique({
      where: { key: SETTING_KEY },
    });

    if (setting && typeof setting.value === 'object' && setting.value !== null) {
      const value = (setting.value as { value?: number }).value;
      if (typeof value === 'number' && value >= MIN_PARALLELISM && value <= MAX_PARALLELISM) {
        cachedValue = value;
        cacheLoadedAt = Date.now();
        log.debug({ value: cachedValue }, 'Loaded max parallel summarizations');
        return cachedValue;
      }
    }

    // Setting doesn't exist or is invalid, use smart default
    cachedValue = DEFAULT_PARALLELISM;
    cacheLoadedAt = Date.now();
    log.debug({ value: cachedValue }, 'Using smart default max parallel summarizations');
    return cachedValue;
  } catch (err) {
    log.warn({ err }, 'Failed to load max parallel summarizations, using smart default');
    // Don't cache on error - will retry on next call
    return DEFAULT_PARALLELISM;
  }
}

/**
 * Set the maximum parallel summarizations.
 *
 * @param value - Number between 1 and 500
 * @throws ValidationError if value is out of range
 */
export async function setMaxParallelSummarizations(value: number): Promise<void> {
  // Validate input
  if (!Number.isInteger(value) || value < MIN_PARALLELISM || value > MAX_PARALLELISM) {
    throw new ValidationError(
      `max_parallel must be an integer between ${MIN_PARALLELISM} and ${MAX_PARALLELISM}`,
      { value, min: MIN_PARALLELISM, max: MAX_PARALLELISM }
    );
  }

  log.info({ value }, 'Setting max parallel summarizations');

  // Upsert the setting
  await db.systemSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: { value } },
    create: { key: SETTING_KEY, value: { value } },
  });

  // Update cache immediately
  cachedValue = value;
  cacheLoadedAt = Date.now();

  log.info({ value }, 'Max parallel summarizations updated');
}

/**
 * Clear the summarization parallelism cache.
 *
 * Useful after settings change or for testing.
 */
export function clearSummarizationCache(): void {
  cachedValue = null;
  cacheLoadedAt = 0;
  log.debug('Summarization parallelism cache cleared');
}

/**
 * Get the setting key used for storing parallelism configuration.
 * Useful for MCP tools that need to display the setting.
 */
export function getSettingKey(): string {
  return SETTING_KEY;
}

/**
 * Get the default parallelism value.
 */
export function getDefaultParallelism(): number {
  return DEFAULT_PARALLELISM;
}

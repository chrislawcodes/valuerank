/**
 * Queue Handler Registration
 *
 * Exports handler registration function for all job types.
 * Includes provider-specific queues for parallelism enforcement.
 */

import type { PgBoss } from 'pg-boss';
import { createLogger } from '@valuerank/shared';
import { queueConfig } from '../../config.js';
import type {
  JobType,
  ProbeScenarioJobData,
  SummarizeTranscriptJobData,
  AnalyzeBasicJobData,
  AnalyzeDeepJobData,
  ExpandScenariosJobData,
  ComputeTokenStatsJobData,
} from '../types.js';
import { createProbeScenarioHandler } from './probe-scenario.js';
import { createSummarizeTranscriptHandler } from './summarize-transcript.js';
import { createAnalyzeBasicHandler } from './analyze-basic.js';
import { createAnalyzeDeepHandler } from './analyze-deep.js';
import { createExpandScenariosHandler } from './expand-scenarios.js';
import { createComputeTokenStatsHandler } from './compute-token-stats.js';
import {
  createProviderQueues,
  getAllProviderQueues,
} from '../../services/parallelism/index.js';

const log = createLogger('queue:handlers');

// Re-export job data types for handlers
export type { ProbeScenarioJobData, SummarizeTranscriptJobData, AnalyzeBasicJobData, AnalyzeDeepJobData, ExpandScenariosJobData, ComputeTokenStatsJobData };

// Handler registration info
type HandlerRegistration = {
  name: JobType;
  register: (boss: PgBoss, batchSize: number) => Promise<void>;
};

const handlerRegistrations: HandlerRegistration[] = [
  {
    name: 'probe_scenario',
    register: async (boss, batchSize) => {
      // Register for the default probe_scenario queue (fallback)
      await boss.work<ProbeScenarioJobData>(
        'probe_scenario',
        { batchSize },
        createProbeScenarioHandler()
      );
    },
  },
  {
    name: 'summarize_transcript',
    register: async (boss, batchSize) => {
      await boss.work<SummarizeTranscriptJobData>(
        'summarize_transcript',
        { batchSize },
        createSummarizeTranscriptHandler()
      );
    },
  },
  {
    name: 'analyze_basic',
    register: async (boss, batchSize) => {
      await boss.work<AnalyzeBasicJobData>(
        'analyze_basic',
        { batchSize },
        createAnalyzeBasicHandler()
      );
    },
  },
  {
    name: 'analyze_deep',
    register: async (boss, batchSize) => {
      await boss.work<AnalyzeDeepJobData>(
        'analyze_deep',
        { batchSize },
        createAnalyzeDeepHandler()
      );
    },
  },
  {
    name: 'expand_scenarios',
    register: async (boss, batchSize) => {
      await boss.work<ExpandScenariosJobData>(
        'expand_scenarios',
        { batchSize },
        createExpandScenariosHandler()
      );
    },
  },
  {
    name: 'compute_token_stats',
    register: async (boss, batchSize) => {
      await boss.work<ComputeTokenStatsJobData>(
        'compute_token_stats',
        { batchSize },
        createComputeTokenStatsHandler()
      );
    },
  },
];

/**
 * Registers provider-specific probe queue handlers.
 * Each provider queue has its own batchSize based on maxParallelRequests.
 * batchSize controls how many jobs are fetched and processed concurrently.
 */
async function registerProviderProbeHandlers(boss: PgBoss): Promise<number> {
  const providerQueues = await getAllProviderQueues();
  const probeHandler = createProbeScenarioHandler();

  let registeredCount = 0;

  for (const [providerName, limits] of providerQueues) {
    const queueName = limits.queueName;
    const batchSize = limits.maxParallelRequests;

    log.info(
      { provider: providerName, queueName, batchSize },
      'Registering provider probe handler'
    );

    // batchSize controls max concurrent jobs for this queue
    await boss.work<ProbeScenarioJobData>(queueName, { batchSize }, probeHandler);
    registeredCount++;
  }

  return registeredCount;
}

/**
 * Registers all job handlers with PgBoss.
 * Creates queues first (required by PgBoss v10+), then registers workers.
 * Includes provider-specific probe queues for parallelism enforcement.
 */
export async function registerHandlers(boss: PgBoss): Promise<void> {
  // Import summarization parallelism service
  const { getMaxParallelSummarizations } = await import(
    '../../services/summarization-parallelism/index.js'
  );

  const defaultBatchSize = queueConfig.workerBatchSize;

  // Create standard queues first (required by PgBoss v10+)
  for (const registration of handlerRegistrations) {
    log.info({ jobType: registration.name }, 'Creating queue');
    await boss.createQueue(registration.name);
  }

  // Create provider-specific probe queues
  await createProviderQueues(boss);

  // Register standard handlers with appropriate batchSize
  for (const registration of handlerRegistrations) {
    // Use dynamic batchSize for summarize_transcript
    const batchSize = registration.name === 'summarize_transcript'
      ? await getMaxParallelSummarizations()
      : defaultBatchSize;

    log.info({ jobType: registration.name, batchSize }, 'Registering handler');
    await registration.register(boss, batchSize);
  }

  // Register provider-specific probe handlers with parallelism limits
  const providerHandlerCount = await registerProviderProbeHandlers(boss);

  log.info(
    {
      standardHandlers: handlerRegistrations.length,
      providerHandlers: providerHandlerCount,
    },
    'All handlers registered'
  );
}

/**
 * Gets list of registered job types.
 */
export function getJobTypes(): JobType[] {
  return handlerRegistrations.map((h) => h.name);
}

/**
 * Re-registers a single provider's probe queue handler with updated settings.
 * Called when provider parallelism settings are changed via API.
 *
 * This function:
 * 1. Unregisters the existing handler for the provider queue (allows in-flight jobs to complete)
 * 2. Clears the parallelism cache to reload settings from DB
 * 3. Registers a new handler with the updated batchSize
 *
 * Note: Jobs in the queue are NOT affected - they remain queued and will be processed
 * by the new handler. In-flight jobs complete normally before the handler is replaced.
 * PgBoss's offWork() is graceful and does not abort running jobs.
 *
 * @param providerName - The provider name (e.g., 'google', 'openai')
 */
export async function reregisterProviderHandler(
  boss: PgBoss,
  providerName: string
): Promise<void> {
  // Import here to avoid circular dependency
  const { clearCache, getProviderQueueName, loadProviderLimits } = await import(
    '../../services/parallelism/index.js'
  );
  const { reloadLimiters } = await import('../../services/rate-limiter/index.js');

  const queueName = getProviderQueueName(providerName);

  log.info({ provider: providerName, queueName }, 'Re-registering provider queue handler');

  // 1. Get queue stats before unregistering (for logging)
  let activeCount = 0;
  let queuedCount = 0;
  try {
    const queues = await boss.getQueues();
    const queueInfo = queues.find((q) => q.name === queueName);
    if (queueInfo) {
      activeCount = queueInfo.activeCount;
      queuedCount = queueInfo.queuedCount;
    }
  } catch {
    // Ignore errors getting stats
  }

  // 2. Unregister existing handler - this is GRACEFUL:
  //    - Stops fetching NEW jobs from the queue
  //    - In-flight jobs continue to completion
  //    - Jobs in queue remain untouched
  await boss.offWork(queueName);
  log.info(
    { provider: providerName, queueName, activeJobs: activeCount, queuedJobs: queuedCount },
    'Unregistered existing handler (in-flight jobs will complete)'
  );

  // 3. Clear caches to force reload from database
  clearCache();

  // 4. Load fresh limits
  const limits = await loadProviderLimits();
  const providerLimits = limits.get(providerName);

  if (!providerLimits) {
    log.warn({ provider: providerName }, 'Provider not found after cache reload');
    return;
  }

  // 5. Register new handler with updated batchSize
  //    This immediately starts processing queued jobs with the new concurrency
  const batchSize = providerLimits.maxParallelRequests;
  const probeHandler = createProbeScenarioHandler();

  await boss.work<ProbeScenarioJobData>(queueName, { batchSize }, probeHandler);

  log.info(
    { provider: providerName, queueName, batchSize },
    'Provider queue handler re-registered with new settings'
  );

  // 6. Reload rate limiters to pick up new settings
  await reloadLimiters();
  log.debug({ provider: providerName }, 'Rate limiters reloaded');
}

/**
 * Re-registers the summarize_transcript queue handler with updated batchSize.
 * Called when summarization parallelism settings are changed via MCP.
 *
 * This function:
 * 1. Unregisters the existing handler (allows in-flight jobs to complete)
 * 2. Clears the summarization parallelism cache to reload settings from DB
 * 3. Registers a new handler with the updated batchSize
 *
 * Note: Jobs in the queue are NOT affected - they remain queued and will be processed
 * by the new handler. In-flight jobs complete normally before the handler is replaced.
 * PgBoss's offWork() is graceful and does not abort running jobs.
 */
export async function reregisterSummarizeHandler(boss: PgBoss): Promise<void> {
  // Import here to avoid circular dependency
  const { clearSummarizationCache, getMaxParallelSummarizations } = await import(
    '../../services/summarization-parallelism/index.js'
  );

  const queueName = 'summarize_transcript';

  log.info({ queueName }, 'Re-registering summarize handler');

  // 1. Get queue stats before unregistering (for logging)
  let activeCount = 0;
  let queuedCount = 0;
  try {
    const queues = await boss.getQueues();
    const queueInfo = queues.find((q) => q.name === queueName);
    if (queueInfo) {
      activeCount = queueInfo.activeCount;
      queuedCount = queueInfo.queuedCount;
    }
  } catch {
    // Ignore errors getting stats
  }

  // 2. Unregister existing handler - this is GRACEFUL:
  //    - Stops fetching NEW jobs from the queue
  //    - In-flight jobs continue to completion
  //    - Jobs in queue remain untouched
  await boss.offWork(queueName);
  log.info(
    { queueName, activeJobs: activeCount, queuedJobs: queuedCount },
    'Unregistered existing handler (in-flight jobs will complete)'
  );

  // 3. Clear cache to force reload from database
  clearSummarizationCache();

  // 4. Load fresh parallelism setting
  const batchSize = await getMaxParallelSummarizations();

  // 5. Register new handler with updated batchSize
  //    This immediately starts processing queued jobs with the new concurrency
  const summarizeHandler = createSummarizeTranscriptHandler();

  await boss.work<SummarizeTranscriptJobData>(queueName, { batchSize }, summarizeHandler);

  log.info(
    { queueName, batchSize },
    'Summarize handler re-registered with new settings'
  );
}

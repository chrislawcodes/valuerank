/**
 * Queue Handler Registration
 *
 * Exports handler registration function for all job types.
 * Includes provider-specific queues for parallelism enforcement.
 */

import type { PgBoss } from 'pg-boss';
import type * as PgBossTypes from 'pg-boss';
import { createLogger } from '@valuerank/shared';
import { queueConfig } from '../../config.js';
import type {
  JobType,
  ProbeScenarioJobData,
  SummarizeTranscriptJobData,
  AnalyzeBasicJobData,
  AnalyzeDeepJobData,
  ExpandScenariosJobData,
} from '../types.js';
import { createProbeScenarioHandler } from './probe-scenario.js';
import { createSummarizeTranscriptHandler } from './summarize-transcript.js';
import { createAnalyzeBasicHandler } from './analyze-basic.js';
import { createAnalyzeDeepHandler } from './analyze-deep.js';
import { createExpandScenariosHandler } from './expand-scenarios.js';
import {
  createProviderQueues,
  getAllProviderQueues,
} from '../../services/parallelism/index.js';

const log = createLogger('queue:handlers');

// Re-export job data types for handlers
export type { ProbeScenarioJobData, SummarizeTranscriptJobData, AnalyzeBasicJobData, AnalyzeDeepJobData, ExpandScenariosJobData };

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
  const batchSize = queueConfig.workerBatchSize;

  // Create standard queues first (required by PgBoss v10+)
  for (const registration of handlerRegistrations) {
    log.info({ jobType: registration.name }, 'Creating queue');
    await boss.createQueue(registration.name);
  }

  // Create provider-specific probe queues
  await createProviderQueues(boss);

  // Register standard handlers
  for (const registration of handlerRegistrations) {
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

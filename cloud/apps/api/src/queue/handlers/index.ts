/**
 * Queue Handler Registration
 *
 * Exports handler registration function for all job types.
 */

import { PgBoss } from 'pg-boss';
import type * as PgBossTypes from 'pg-boss';
import { createLogger } from '@valuerank/shared';
import { queueConfig } from '../../config.js';
import type {
  JobType,
  ProbeScenarioJobData,
  AnalyzeBasicJobData,
  AnalyzeDeepJobData,
} from '../types.js';
import { createProbeScenarioHandler } from './probe-scenario.js';
import { createAnalyzeBasicHandler } from './analyze-basic.js';
import { createAnalyzeDeepHandler } from './analyze-deep.js';

const log = createLogger('queue:handlers');

// Re-export job data types for handlers
export type { ProbeScenarioJobData, AnalyzeBasicJobData, AnalyzeDeepJobData };

// Handler registration info
type HandlerRegistration = {
  name: JobType;
  register: (boss: PgBoss, batchSize: number) => Promise<void>;
};

const handlerRegistrations: HandlerRegistration[] = [
  {
    name: 'probe_scenario',
    register: async (boss, batchSize) => {
      await boss.work<ProbeScenarioJobData>(
        'probe_scenario',
        { batchSize },
        createProbeScenarioHandler()
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
];

/**
 * Registers all job handlers with PgBoss.
 * Creates queues first (required by PgBoss v10+), then registers workers.
 */
export async function registerHandlers(boss: PgBoss): Promise<void> {
  const batchSize = queueConfig.workerBatchSize;

  // Create queues first (required by PgBoss v10+)
  for (const registration of handlerRegistrations) {
    log.info({ jobType: registration.name }, 'Creating queue');
    await boss.createQueue(registration.name);
  }

  // Then register workers
  for (const registration of handlerRegistrations) {
    log.info({ jobType: registration.name, batchSize }, 'Registering handler');
    await registration.register(boss, batchSize);
  }

  log.info({ handlerCount: handlerRegistrations.length }, 'All handlers registered');
}

/**
 * Gets list of registered job types.
 */
export function getJobTypes(): JobType[] {
  return handlerRegistrations.map((h) => h.name);
}

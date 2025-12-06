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
    name: 'probe:scenario',
    register: async (boss, batchSize) => {
      await boss.work<ProbeScenarioJobData>(
        'probe:scenario',
        { batchSize },
        createProbeScenarioHandler()
      );
    },
  },
  {
    name: 'analyze:basic',
    register: async (boss, batchSize) => {
      await boss.work<AnalyzeBasicJobData>(
        'analyze:basic',
        { batchSize },
        createAnalyzeBasicHandler()
      );
    },
  },
  {
    name: 'analyze:deep',
    register: async (boss, batchSize) => {
      await boss.work<AnalyzeDeepJobData>(
        'analyze:deep',
        { batchSize },
        createAnalyzeDeepHandler()
      );
    },
  },
];

/**
 * Registers all job handlers with PgBoss.
 */
export async function registerHandlers(boss: PgBoss): Promise<void> {
  const batchSize = queueConfig.workerBatchSize;

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

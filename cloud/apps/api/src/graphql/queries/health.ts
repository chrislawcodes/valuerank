/**
 * Health Queries
 *
 * GraphQL queries for system health information.
 */

import { builder } from '../builder.js';
import {
  ProviderHealthType,
  QueueHealthType,
  WorkerHealthType,
  SystemHealthType,
} from '../types/health.js';
import {
  getProviderHealth,
  getQueueHealth,
  getWorkerHealth,
} from '../../services/health/index.js';

// Query: providerHealth - Get health status for LLM providers
builder.queryField('providerHealth', (t) =>
  t.field({
    type: ProviderHealthType,
    description: `
      Get health status for all LLM providers.

      Checks connectivity to each provider's API.
      Results are cached for 5 minutes.

      Use the \`refresh\` argument to force a fresh check.
    `,
    args: {
      refresh: t.arg.boolean({
        required: false,
        description: 'Force a fresh health check (ignore cache)',
      }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ refresh: args.refresh }, 'Fetching provider health');

      const result = await getProviderHealth(args.refresh ?? false);

      // Convert error field from undefined to null for GraphQL
      return {
        ...result,
        providers: result.providers.map((p) => ({
          ...p,
          error: p.error ?? null,
        })),
      };
    },
  })
);

// Query: queueHealth - Get health status for job queue
builder.queryField('queueHealth', (t) =>
  t.field({
    type: QueueHealthType,
    description: `
      Get health status for the job queue.

      Shows queue running state, job counts, and success rates.
    `,
    resolve: async (_root, _args, ctx) => {
      ctx.log.debug('Fetching queue health');

      const result = await getQueueHealth();

      return {
        ...result,
        error: result.error ?? null,
      };
    },
  })
);

// Query: workerHealth - Get health status for Python workers
builder.queryField('workerHealth', (t) =>
  t.field({
    type: WorkerHealthType,
    description: `
      Get health status for Python workers.

      Checks Python environment, packages, and API key configuration.
      Results are cached for 10 minutes.

      Use the \`refresh\` argument to force a fresh check.
    `,
    args: {
      refresh: t.arg.boolean({
        required: false,
        description: 'Force a fresh health check (ignore cache)',
      }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ refresh: args.refresh }, 'Fetching worker health');

      const result = await getWorkerHealth(args.refresh ?? false);

      return {
        ...result,
        error: result.error ?? null,
      };
    },
  })
);

// Query: systemHealth - Get combined system health status
builder.queryField('systemHealth', (t) =>
  t.field({
    type: SystemHealthType,
    description: `
      Get combined health status for all system components.

      Includes provider health, queue health, and worker health.
      Results are cached (providers: 5 min, workers: 10 min).

      Use the \`refresh\` argument to force fresh checks.
    `,
    args: {
      refresh: t.arg.boolean({
        required: false,
        description: 'Force fresh health checks (ignore cache)',
      }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ refresh: args.refresh }, 'Fetching system health');

      const forceRefresh = args.refresh ?? false;

      // Fetch all health checks in parallel
      const [providers, queue, worker] = await Promise.all([
        getProviderHealth(forceRefresh),
        getQueueHealth(),
        getWorkerHealth(forceRefresh),
      ]);

      return {
        providers: {
          ...providers,
          providers: providers.providers.map((p) => ({
            ...p,
            error: p.error ?? null,
          })),
        },
        queue: {
          ...queue,
          error: queue.error ?? null,
        },
        worker: {
          ...worker,
          error: worker.error ?? null,
        },
      };
    },
  })
);

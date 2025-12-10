/**
 * Run Mutations
 *
 * GraphQL mutations for run management: start, pause, resume, cancel, delete.
 */

import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { AuthenticationError, NotFoundError } from '@valuerank/shared';
import { RunRef } from '../types/refs.js';
import {
  startRun as startRunService,
  pauseRun as pauseRunService,
  resumeRun as resumeRunService,
  cancelRun as cancelRunService,
} from '../../services/run/index.js';
import { StartRunInput } from '../types/inputs/start-run.js';
import { createAuditLog } from '../../services/audit/index.js';

// StartRunPayload - return type for startRun mutation
const StartRunPayload = builder.objectRef<{
  run: {
    id: string;
    status: string;
    definitionId: string;
    experimentId: string | null;
    config: unknown;
    progress: { total: number; completed: number; failed: number };
    createdAt: Date;
  };
  jobCount: number;
}>('StartRunPayload').implement({
  description: 'Result of starting a new run',
  fields: (t) => ({
    run: t.field({
      type: RunRef,
      description: 'The created run',
      resolve: async (parent, _args, ctx) => {
        // Fetch the full run from database for the resolver
        const run = await ctx.loaders.run.load(parent.run.id);
        if (!run) {
          throw new Error(`Run not found: ${parent.run.id}`);
        }
        return run;
      },
    }),
    jobCount: t.exposeInt('jobCount', {
      description: 'Number of jobs queued for this run',
    }),
  }),
});

// Input type for startRun args
type StartRunArgs = {
  definitionId: string | number;
  models: string[];
  samplePercentage?: number | null;
  sampleSeed?: number | null;
  priority?: string | null;
  experimentId?: string | number | null;
};

// startRun mutation
builder.mutationField('startRun', (t) =>
  t.field({
    type: StartRunPayload,
    description: `
      Start a new evaluation run.

      Creates a run record and queues probe_scenario jobs for each model-scenario combination.
      Requires authentication.

      Returns the created run and the number of jobs queued.
    `,
    args: {
      input: t.arg({
        type: StartRunInput,
        required: true,
        description: 'Configuration for the new run',
      }),
    },
    resolve: async (_root, args, ctx) => {
      // Require authentication
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const userId = ctx.user.id;
      const input = args.input as StartRunArgs;

      ctx.log.info(
        { userId, definitionId: input.definitionId, modelCount: input.models.length },
        'Starting run via GraphQL'
      );

      const result = await startRunService({
        definitionId: String(input.definitionId),
        models: input.models,
        samplePercentage: input.samplePercentage ?? undefined,
        sampleSeed: input.sampleSeed ?? undefined,
        priority: input.priority ?? 'NORMAL',
        experimentId: input.experimentId ? String(input.experimentId) : undefined,
        userId,
      });

      ctx.log.info(
        { userId, runId: result.run.id, jobCount: result.jobCount },
        'Run started successfully'
      );

      // Audit log (non-blocking)
      createAuditLog({
        action: 'CREATE',
        entityType: 'Run',
        entityId: result.run.id,
        userId,
        metadata: {
          definitionId: String(input.definitionId),
          models: input.models,
          jobCount: result.jobCount,
        },
      });

      return result;
    },
  })
);

// pauseRun mutation
builder.mutationField('pauseRun', (t) =>
  t.field({
    type: RunRef,
    description: `
      Pause a running evaluation.

      Jobs currently being processed will complete, but no new jobs
      will be started until the run is resumed.

      Requires authentication. Run must be in PENDING or RUNNING state.
    `,
    args: {
      runId: t.arg.id({
        required: true,
        description: 'The ID of the run to pause',
      }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const runId = String(args.runId);
      ctx.log.info({ userId: ctx.user.id, runId }, 'Pausing run via GraphQL');

      const result = await pauseRunService(runId);

      ctx.log.info({ userId: ctx.user.id, runId, status: result.status }, 'Run paused');

      // Audit log (non-blocking)
      createAuditLog({
        action: 'ACTION',
        entityType: 'Run',
        entityId: runId,
        userId: ctx.user.id,
        metadata: { action: 'pause', previousStatus: result.status },
      });

      // Fetch full run for resolver
      const run = await ctx.loaders.run.load(result.id);
      if (!run) {
        throw new Error(`Run not found: ${result.id}`);
      }
      return run;
    },
  })
);

// resumeRun mutation
builder.mutationField('resumeRun', (t) =>
  t.field({
    type: RunRef,
    description: `
      Resume a paused evaluation.

      Jobs will begin processing again from where they left off.

      Requires authentication. Run must be in PAUSED state.
    `,
    args: {
      runId: t.arg.id({
        required: true,
        description: 'The ID of the run to resume',
      }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const runId = String(args.runId);
      ctx.log.info({ userId: ctx.user.id, runId }, 'Resuming run via GraphQL');

      const result = await resumeRunService(runId);

      ctx.log.info({ userId: ctx.user.id, runId, status: result.status }, 'Run resumed');

      // Audit log (non-blocking)
      createAuditLog({
        action: 'ACTION',
        entityType: 'Run',
        entityId: runId,
        userId: ctx.user.id,
        metadata: { action: 'resume', newStatus: result.status },
      });

      // Fetch full run for resolver
      const run = await ctx.loaders.run.load(result.id);
      if (!run) {
        throw new Error(`Run not found: ${result.id}`);
      }
      return run;
    },
  })
);

// cancelRun mutation
builder.mutationField('cancelRun', (t) =>
  t.field({
    type: RunRef,
    description: `
      Cancel an evaluation run.

      Jobs currently being processed will complete, but all pending jobs
      will be removed from the queue. Completed results are preserved.

      Requires authentication. Run must be in PENDING, RUNNING, or PAUSED state.
    `,
    args: {
      runId: t.arg.id({
        required: true,
        description: 'The ID of the run to cancel',
      }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const runId = String(args.runId);
      ctx.log.info({ userId: ctx.user.id, runId }, 'Cancelling run via GraphQL');

      const result = await cancelRunService(runId);

      ctx.log.info({ userId: ctx.user.id, runId, status: result.status }, 'Run cancelled');

      // Audit log (non-blocking)
      createAuditLog({
        action: 'ACTION',
        entityType: 'Run',
        entityId: runId,
        userId: ctx.user.id,
        metadata: { action: 'cancel', finalStatus: result.status },
      });

      // Fetch full run for resolver
      const run = await ctx.loaders.run.load(result.id);
      if (!run) {
        throw new Error(`Run not found: ${result.id}`);
      }
      return run;
    },
  })
);

// deleteRun mutation (soft delete)
builder.mutationField('deleteRun', (t) =>
  t.field({
    type: 'Boolean',
    description: `
      Soft delete a run and its associated data.

      Sets deletedAt timestamp on the run. Transcripts and analysis results
      associated with this run will be filtered out in queries.

      Requires authentication.
    `,
    args: {
      runId: t.arg.id({
        required: true,
        description: 'The ID of the run to delete',
      }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const runId = String(args.runId);
      ctx.log.info({ userId: ctx.user.id, runId }, 'Deleting run via GraphQL');

      // Check run exists and is not already deleted
      const run = await db.run.findFirst({
        where: {
          id: runId,
          deletedAt: null,
        },
      });

      if (!run) {
        throw new NotFoundError('Run', runId);
      }

      // Soft delete by setting deletedAt and deletedByUserId
      await db.run.update({
        where: { id: runId },
        data: {
          deletedAt: new Date(),
          deletedByUserId: ctx.user.id,
        },
      });

      ctx.log.info({ userId: ctx.user.id, runId }, 'Run deleted (soft)');

      // Audit log (non-blocking)
      createAuditLog({
        action: 'DELETE',
        entityType: 'Run',
        entityId: runId,
        userId: ctx.user.id,
      });

      return true;
    },
  })
);

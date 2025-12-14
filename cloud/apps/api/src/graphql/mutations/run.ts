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
  recoverOrphanedRun as recoverOrphanedRunService,
  triggerRecovery as triggerRecoveryService,
  cancelSummarization as cancelSummarizationService,
  restartSummarization as restartSummarizationService,
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

// RecoverRunPayload - return type for recoverRun mutation
const RecoverRunPayload = builder.objectRef<{
  run: { id: string };
  action: string;
  requeuedCount?: number;
}>('RecoverRunPayload').implement({
  description: 'Result of recovering an orphaned run',
  fields: (t) => ({
    run: t.field({
      type: RunRef,
      description: 'The recovered run',
      resolve: async (parent, _args, ctx) => {
        const run = await ctx.loaders.run.load(parent.run.id);
        if (!run) {
          throw new Error(`Run not found: ${parent.run.id}`);
        }
        return run;
      },
    }),
    action: t.exposeString('action', {
      description: 'The recovery action taken (requeued_probes, triggered_summarization, no_missing_probes, etc.)',
    }),
    requeuedCount: t.exposeInt('requeuedCount', {
      nullable: true,
      description: 'Number of jobs re-queued (if applicable)',
    }),
  }),
});

// recoverRun mutation - manually trigger recovery for a specific run
builder.mutationField('recoverRun', (t) =>
  t.field({
    type: RecoverRunPayload,
    description: `
      Attempt to recover an orphaned run.

      If the run is stuck in RUNNING or SUMMARIZING state with no active jobs,
      this will re-queue missing probe jobs or summarize jobs as needed.

      Useful for recovering from API restarts or other interruptions.

      Requires authentication.
    `,
    args: {
      runId: t.arg.id({
        required: true,
        description: 'The ID of the run to recover',
      }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const runId = String(args.runId);
      ctx.log.info({ userId: ctx.user.id, runId }, 'Recovering run via GraphQL');

      // Check run exists
      const run = await db.run.findFirst({
        where: {
          id: runId,
          deletedAt: null,
        },
      });

      if (!run) {
        throw new NotFoundError('Run', runId);
      }

      const result = await recoverOrphanedRunService(runId);

      ctx.log.info(
        { userId: ctx.user.id, runId, action: result.action, requeuedCount: result.requeuedCount },
        'Run recovery attempted'
      );

      // Audit log (non-blocking)
      createAuditLog({
        action: 'ACTION',
        entityType: 'Run',
        entityId: runId,
        userId: ctx.user.id,
        metadata: { action: 'recover', recoveryAction: result.action, requeuedCount: result.requeuedCount },
      });

      return {
        run: { id: runId },
        action: result.action,
        requeuedCount: result.requeuedCount,
      };
    },
  })
);

// TriggerRecoveryPayload - return type for triggerRecovery mutation
const TriggerRecoveryPayload = builder.objectRef<{
  detected: number;
  recovered: number;
  errors: number;
}>('TriggerRecoveryPayload').implement({
  description: 'Result of triggering system-wide orphaned run recovery',
  fields: (t) => ({
    detected: t.exposeInt('detected', {
      description: 'Number of orphaned runs detected',
    }),
    recovered: t.exposeInt('recovered', {
      description: 'Number of runs successfully recovered',
    }),
    errors: t.exposeInt('errors', {
      description: 'Number of runs that failed to recover',
    }),
  }),
});

// triggerRecovery mutation - manually trigger system-wide recovery scan
builder.mutationField('triggerRecovery', (t) =>
  t.field({
    type: TriggerRecoveryPayload,
    description: `
      Trigger a system-wide scan for orphaned runs.

      Detects all runs stuck in RUNNING or SUMMARIZING state with no active jobs,
      and attempts to recover them by re-queuing missing jobs.

      This is normally run automatically every 5 minutes, but can be triggered manually.

      Requires authentication.
    `,
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      ctx.log.info({ userId: ctx.user.id }, 'Triggering recovery scan via GraphQL');

      const result = await triggerRecoveryService();

      ctx.log.info(
        { userId: ctx.user.id, ...result },
        'Recovery scan completed'
      );

      // Audit log (non-blocking)
      createAuditLog({
        action: 'ACTION',
        entityType: 'System',
        entityId: 'recovery',
        userId: ctx.user.id,
        metadata: { action: 'triggerRecovery', ...result },
      });

      return result;
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

// Input type for updateRun mutation
const UpdateRunInput = builder.inputType('UpdateRunInput', {
  description: 'Input for updating a run',
  fields: (t) => ({
    name: t.string({
      required: false,
      description: 'New name for the run (null to clear)',
    }),
  }),
});

// updateRun mutation - update run properties
builder.mutationField('updateRun', (t) =>
  t.field({
    type: RunRef,
    description: `
      Update a run's properties.

      Currently supports updating the run name.

      Requires authentication.
    `,
    args: {
      runId: t.arg.id({
        required: true,
        description: 'The ID of the run to update',
      }),
      input: t.arg({
        type: UpdateRunInput,
        required: true,
        description: 'The fields to update',
      }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const runId = String(args.runId);
      ctx.log.info({ userId: ctx.user.id, runId, input: args.input }, 'Updating run via GraphQL');

      // Check run exists and is not deleted
      const run = await db.run.findFirst({
        where: {
          id: runId,
          deletedAt: null,
        },
      });

      if (!run) {
        throw new NotFoundError('Run', runId);
      }

      // Build update data
      const updateData: { name?: string | null } = {};

      // Handle name update - allow null to clear
      if ('name' in args.input) {
        updateData.name = args.input.name ?? null;
      }

      // Update the run
      const updated = await db.run.update({
        where: { id: runId },
        data: updateData,
      });

      ctx.log.info({ userId: ctx.user.id, runId, name: updated.name }, 'Run updated');

      // Audit log (non-blocking)
      createAuditLog({
        action: 'UPDATE',
        entityType: 'Run',
        entityId: runId,
        userId: ctx.user.id,
        metadata: { updates: updateData },
      });

      return updated;
    },
  })
);

// CancelSummarizationPayload - return type for cancelSummarization mutation
const CancelSummarizationPayload = builder.objectRef<{
  run: { id: string };
  cancelledCount: number;
}>('CancelSummarizationPayload').implement({
  description: 'Result of cancelling summarization for a run',
  fields: (t) => ({
    run: t.field({
      type: RunRef,
      description: 'The updated run',
      resolve: async (parent, _args, ctx) => {
        const run = await ctx.loaders.run.load(parent.run.id);
        if (!run) {
          throw new Error(`Run not found: ${parent.run.id}`);
        }
        return run;
      },
    }),
    cancelledCount: t.exposeInt('cancelledCount', {
      description: 'Number of pending summarization jobs cancelled',
    }),
  }),
});

// cancelSummarization mutation
builder.mutationField('cancelSummarization', (t) =>
  t.field({
    type: CancelSummarizationPayload,
    description: `
      Cancel pending summarization jobs for a run.

      Only works when run is in SUMMARIZING state.
      Cancels pending summarize_transcript jobs in the queue.
      Preserves already-completed summaries.
      Transitions run to COMPLETED state.

      Requires authentication.
    `,
    args: {
      runId: t.arg.id({
        required: true,
        description: 'The ID of the run to cancel summarization for',
      }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const runId = String(args.runId);
      ctx.log.info({ userId: ctx.user.id, runId }, 'Cancelling summarization via GraphQL');

      const result = await cancelSummarizationService(runId);

      ctx.log.info(
        { userId: ctx.user.id, runId, cancelledCount: result.cancelledCount },
        'Summarization cancelled'
      );

      // Audit log (non-blocking)
      createAuditLog({
        action: 'ACTION',
        entityType: 'Run',
        entityId: runId,
        userId: ctx.user.id,
        metadata: { action: 'cancelSummarization', cancelledCount: result.cancelledCount },
      });

      return {
        run: { id: result.run.id },
        cancelledCount: result.cancelledCount,
      };
    },
  })
);

// RestartSummarizationPayload - return type for restartSummarization mutation
const RestartSummarizationPayload = builder.objectRef<{
  run: { id: string };
  queuedCount: number;
}>('RestartSummarizationPayload').implement({
  description: 'Result of restarting summarization for a run',
  fields: (t) => ({
    run: t.field({
      type: RunRef,
      description: 'The updated run',
      resolve: async (parent, _args, ctx) => {
        const run = await ctx.loaders.run.load(parent.run.id);
        if (!run) {
          throw new Error(`Run not found: ${parent.run.id}`);
        }
        return run;
      },
    }),
    queuedCount: t.exposeInt('queuedCount', {
      description: 'Number of summarization jobs queued',
    }),
  }),
});

// restartSummarization mutation
builder.mutationField('restartSummarization', (t) =>
  t.field({
    type: RestartSummarizationPayload,
    description: `
      Restart summarization for a run.

      Only works when run is in a terminal state (COMPLETED/FAILED/CANCELLED).
      By default, only re-queues transcripts without summaries or with errors.
      With force=true, re-queues all transcripts.

      Requires authentication.
    `,
    args: {
      runId: t.arg.id({
        required: true,
        description: 'The ID of the run to restart summarization for',
      }),
      force: t.arg.boolean({
        required: false,
        description: 'If true, re-summarize all transcripts (not just failed/missing)',
      }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const runId = String(args.runId);
      const force = args.force ?? false;

      ctx.log.info({ userId: ctx.user.id, runId, force }, 'Restarting summarization via GraphQL');

      const result = await restartSummarizationService(runId, force);

      ctx.log.info(
        { userId: ctx.user.id, runId, queuedCount: result.queuedCount, force },
        'Summarization restarted'
      );

      // Audit log (non-blocking)
      createAuditLog({
        action: 'ACTION',
        entityType: 'Run',
        entityId: runId,
        userId: ctx.user.id,
        metadata: { action: 'restartSummarization', queuedCount: result.queuedCount, force },
      });

      return {
        run: { id: result.run.id },
        queuedCount: result.queuedCount,
      };
    },
  })
);

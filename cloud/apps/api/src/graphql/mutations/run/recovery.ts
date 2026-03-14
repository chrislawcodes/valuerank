import { db } from '@valuerank/db';
import { AuthenticationError, NotFoundError } from '@valuerank/shared';
import { builder } from '../../builder.js';
import {
  recoverOrphanedRun as recoverOrphanedRunService,
  triggerRecovery as triggerRecoveryService,
} from '../../../services/run/index.js';
import { createAuditLog } from '../../../services/audit/index.js';
import { RecoverRunPayload, TriggerRecoveryPayload } from './payloads.js';

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

      void createAuditLog({
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

      ctx.log.info({ userId: ctx.user.id, ...result }, 'Recovery scan completed');

      void createAuditLog({
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

import { AuthenticationError } from '@valuerank/shared';
import { builder } from '../../builder.js';
import {
  cancelSummarization as cancelSummarizationService,
  restartSummarization as restartSummarizationService,
} from '../../../services/run/index.js';
import { createAuditLog } from '../../../services/audit/index.js';
import { CancelSummarizationPayload, RestartSummarizationPayload } from './payloads.js';

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

      void createAuditLog({
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

      void createAuditLog({
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

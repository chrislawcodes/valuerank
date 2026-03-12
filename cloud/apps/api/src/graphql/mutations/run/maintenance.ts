import { db } from '@valuerank/db';
import { AuthenticationError, NotFoundError } from '@valuerank/shared';
import { builder } from '../../builder.js';
import { RunRef, TranscriptRef } from '../../types/refs.js';
import { triggerBasicAnalysis } from '../../../services/analysis/trigger.js';
import { createAuditLog } from '../../../services/audit/index.js';
import { UpdateRunInput } from './payloads.js';

function isValidManualDecisionCode(value: string): boolean {
  return /^[1-9]\d*$/.test(value);
}

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

      const run = await db.run.findFirst({
        where: {
          id: runId,
          deletedAt: null,
        },
      });

      if (!run) {
        throw new NotFoundError('Run', runId);
      }

      await db.run.update({
        where: { id: runId },
        data: {
          deletedAt: new Date(),
          deletedByUserId: ctx.user.id,
        },
      });

      ctx.log.info({ userId: ctx.user.id, runId }, 'Run deleted (soft)');

      void createAuditLog({
        action: 'DELETE',
        entityType: 'Run',
        entityId: runId,
        userId: ctx.user.id,
      });

      return true;
    },
  })
);

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

      const run = await db.run.findFirst({
        where: {
          id: runId,
          deletedAt: null,
        },
      });

      if (!run) {
        throw new NotFoundError('Run', runId);
      }

      const updateData: { name?: string | null } = {};
      if ('name' in args.input) {
        updateData.name = args.input.name ?? null;
      }

      const updated = await db.run.update({
        where: { id: runId },
        data: updateData,
      });

      ctx.log.info({ userId: ctx.user.id, runId, name: updated.name }, 'Run updated');

      void createAuditLog({
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

builder.mutationField('updateTranscriptDecision', (t) =>
  t.field({
    type: TranscriptRef,
    description: `
      Manually update a transcript decision code.

      Accepts only positive integer decision codes.
      If the run is already completed, this will supersede current analysis
      and queue a recompute job.

      Requires authentication.
    `,
    args: {
      transcriptId: t.arg.id({
        required: true,
        description: 'The ID of the transcript to update',
      }),
      decisionCode: t.arg.string({
        required: true,
        description: 'Decision code override (must be a positive integer)',
      }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const transcriptId = String(args.transcriptId);
      const decisionCode = args.decisionCode.trim();

      if (!isValidManualDecisionCode(decisionCode)) {
        throw new Error('decisionCode must be a positive integer');
      }

      const transcript = await db.transcript.findUnique({
        where: { id: transcriptId },
        select: {
          id: true,
          runId: true,
          decisionCode: true,
        },
      });

      if (!transcript) {
        throw new NotFoundError('Transcript', transcriptId);
      }

      const updatedTranscript = await db.transcript.update({
        where: { id: transcriptId },
        data: {
          decisionCode,
          decisionCodeSource: 'manual',
        },
      });

      let analysisQueued = false;
      const run = await db.run.findUnique({
        where: { id: transcript.runId },
        select: { id: true, status: true },
      });

      if (run?.status === 'COMPLETED') {
        await db.analysisResult.updateMany({
          where: {
            runId: run.id,
            status: 'CURRENT',
          },
          data: {
            status: 'SUPERSEDED',
          },
        });

        analysisQueued = await triggerBasicAnalysis(run.id, { force: true });
      }

      ctx.log.info(
        {
          userId: ctx.user.id,
          transcriptId,
          runId: transcript.runId,
          previousDecisionCode: transcript.decisionCode,
          decisionCode,
          analysisQueued,
        },
        'Transcript decision manually updated'
      );

      void createAuditLog({
        action: 'UPDATE',
        entityType: 'Run',
        entityId: transcript.runId,
        userId: ctx.user.id,
        metadata: {
          transcriptId,
          previousDecisionCode: transcript.decisionCode,
          decisionCode,
          runId: transcript.runId,
          analysisQueued,
        },
      });

      return updatedTranscript;
    },
  })
);

import { db, type Prisma } from '@valuerank/db';
import { AuthenticationError, NotFoundError, ValidationError } from '@valuerank/shared';
import { builder } from '../../builder.js';
import { RunRef, TranscriptRef } from '../../types/refs.js';
import { triggerBasicAnalysis } from '../../../services/analysis/trigger.js';
import { createAuditLog } from '../../../services/audit/index.js';
import { UpdateRunInput } from './payloads.js';

function isValidDecisionState(value: string): value is 'resolved' | 'neutral' | 'unknown' | 'refusal' {
  return value === 'resolved' || value === 'neutral' || value === 'unknown' || value === 'refusal';
}

function isValidStrength(value: string): value is 'strong' | 'lean' {
  return value === 'strong' || value === 'lean';
}

function extractPair(definitionSnapshot: unknown): { valueA: string; valueB: string } | null {
  if (definitionSnapshot == null || typeof definitionSnapshot !== 'object' || Array.isArray(definitionSnapshot)) return null;
  const components = (definitionSnapshot as { components?: unknown }).components;
  if (components == null || typeof components !== 'object' || Array.isArray(components)) return null;
  const vf = (components as { value_first?: unknown }).value_first;
  const vs = (components as { value_second?: unknown }).value_second;
  if (vf == null || typeof vf !== 'object' || Array.isArray(vf)) return null;
  if (vs == null || typeof vs !== 'object' || Array.isArray(vs)) return null;
  const a = (vf as { token?: unknown }).token;
  const b = (vs as { token?: unknown }).token;
  if (typeof a !== 'string' || typeof b !== 'string') return null;
  return { valueA: a, valueB: b };
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
      Manually override a transcript's canonical decision.

      Accepts one of four decisionStates: "resolved", "neutral", "unknown",
      or "refusal". For "resolved", favoredValueKey (one of the vignette
      pair's two value tokens) and strength ("strong" or "lean") are also
      required. Server derives direction (favor_first / favor_second)
      from favoredValueKey against the vignette pair.

      If the run is already completed, this supersedes current analysis
      and queues a recompute job.

      Requires authentication.
    `,
    args: {
      transcriptId: t.arg.id({
        required: true,
        description: 'The ID of the transcript to update',
      }),
      decisionState: t.arg.string({
        required: true,
        description: 'One of: "resolved", "neutral", "unknown", "refusal"',
      }),
      favoredValueKey: t.arg.string({
        required: false,
        description: 'Value key (pair.valueA or pair.valueB). Required when decisionState="resolved".',
      }),
      strength: t.arg.string({
        required: false,
        description: '"strong" or "lean". Required when decisionState="resolved".',
      }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const transcriptId = String(args.transcriptId);
      const decisionState = args.decisionState.trim();

      if (!isValidDecisionState(decisionState)) {
        throw new ValidationError('decisionState must be one of: resolved, neutral, unknown, refusal');
      }

      const transcript = await db.transcript.findUnique({
        where: { id: transcriptId },
        select: {
          id: true,
          runId: true,
          decisionMetadata: true,
          definitionSnapshot: true,
          scenario: { select: { orientationFlipped: true } },
        },
      });

      if (!transcript) {
        throw new NotFoundError('Transcript', transcriptId);
      }

      // Build the CanonicalAppliedDecision from the typed input. Server
      // derives direction; the client never sends a scale position.
      let appliedDecision: {
        favoredValueKey: string | null;
        opposedValueKey: string | null;
        direction: 'favor_first' | 'favor_second' | 'neutral' | 'unknown' | 'refusal';
        strength: 'strong' | 'lean' | 'neutral' | 'unknown';
      };

      if (decisionState === 'resolved') {
        const favoredValueKey = args.favoredValueKey?.trim();
        const strength = args.strength?.trim();
        if (favoredValueKey == null || favoredValueKey.length === 0) {
          throw new ValidationError('favoredValueKey is required when decisionState="resolved"');
        }
        if (strength == null || !isValidStrength(strength)) {
          throw new ValidationError('strength must be "strong" or "lean" when decisionState="resolved"');
        }
        const pair = extractPair(transcript.definitionSnapshot);
        if (pair == null) {
          throw new ValidationError('Cannot apply a resolved override — vignette definition is missing its value pair');
        }
        if (favoredValueKey !== pair.valueA && favoredValueKey !== pair.valueB) {
          throw new ValidationError(`favoredValueKey "${favoredValueKey}" does not match either value in the vignette pair (${pair.valueA}, ${pair.valueB})`);
        }
        const direction: 'favor_first' | 'favor_second' = favoredValueKey === pair.valueA ? 'favor_first' : 'favor_second';
        const opposedValueKey = favoredValueKey === pair.valueA ? pair.valueB : pair.valueA;
        appliedDecision = { favoredValueKey, opposedValueKey, direction, strength };
      } else if (decisionState === 'neutral') {
        appliedDecision = { favoredValueKey: null, opposedValueKey: null, direction: 'neutral', strength: 'neutral' };
      } else if (decisionState === 'refusal') {
        appliedDecision = { favoredValueKey: null, opposedValueKey: null, direction: 'refusal', strength: 'unknown' };
      } else {
        // unknown
        appliedDecision = { favoredValueKey: null, opposedValueKey: null, direction: 'unknown', strength: 'unknown' };
      }

      const existingMetadata =
        transcript.decisionMetadata != null &&
        typeof transcript.decisionMetadata === 'object' &&
        !Array.isArray(transcript.decisionMetadata)
          ? (transcript.decisionMetadata as Record<string, unknown>)
          : {};

      const previousAppliedDecision = (existingMetadata.manualOverride as { appliedDecision?: unknown } | undefined)?.appliedDecision ?? null;

      const manualOverrideMetadata = {
        ...existingMetadata,
        manualOverride: {
          appliedDecision,
          previousValue: previousAppliedDecision,
          overriddenAt: new Date().toISOString(),
          overriddenByUserId: ctx.user.id,
        },
      };

      const updatedTranscript = await db.transcript.update({
        where: { id: transcriptId },
        data: {
          // Intentionally does NOT touch the legacy transcripts.decision_code
          // column (A5). That column drop is a follow-up mini-PR after this
          // one lands.
          decisionMetadata: manualOverrideMetadata as Prisma.InputJsonValue,
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
          decisionState,
          favoredValueKey: appliedDecision.favoredValueKey,
          strength: appliedDecision.strength,
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
          appliedDecision,
          runId: transcript.runId,
          analysisQueued,
        },
      });

      return updatedTranscript;
    },
  })
);

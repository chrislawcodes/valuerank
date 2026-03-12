import { builder } from '../../builder.js';
import type { Context } from '../../context.js';
import { RunRef } from '../../types/refs.js';

type RunPayloadShape = {
  run: { id: string };
};

async function resolveRunFromPayload(parent: RunPayloadShape, ctx: Context) {
  const run = await ctx.loaders.run.load(parent.run.id);
  if (run == null) {
    throw new Error(`Run not found: ${parent.run.id}`);
  }
  return run;
}

export const StartRunPayload = builder.objectRef<{
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
      resolve: async (parent, _args, ctx) => resolveRunFromPayload(parent, ctx),
    }),
    jobCount: t.exposeInt('jobCount', {
      description: 'Number of jobs queued for this run',
    }),
  }),
});

export const RecoverRunPayload = builder.objectRef<{
  run: { id: string };
  action: string;
  requeuedCount?: number;
}>('RecoverRunPayload').implement({
  description: 'Result of recovering an orphaned run',
  fields: (t) => ({
    run: t.field({
      type: RunRef,
      description: 'The recovered run',
      resolve: async (parent, _args, ctx) => resolveRunFromPayload(parent, ctx),
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

export const TriggerRecoveryPayload = builder.objectRef<{
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

export const UpdateRunInput = builder.inputType('UpdateRunInput', {
  description: 'Input for updating a run',
  fields: (t) => ({
    name: t.string({
      required: false,
      description: 'New name for the run (null to clear)',
    }),
  }),
});

export const CancelSummarizationPayload = builder.objectRef<{
  run: { id: string };
  cancelledCount: number;
}>('CancelSummarizationPayload').implement({
  description: 'Result of cancelling summarization for a run',
  fields: (t) => ({
    run: t.field({
      type: RunRef,
      description: 'The updated run',
      resolve: async (parent, _args, ctx) => resolveRunFromPayload(parent, ctx),
    }),
    cancelledCount: t.exposeInt('cancelledCount', {
      description: 'Number of pending summarization jobs cancelled',
    }),
  }),
});

export const RestartSummarizationPayload = builder.objectRef<{
  run: { id: string };
  queuedCount: number;
}>('RestartSummarizationPayload').implement({
  description: 'Result of restarting summarization for a run',
  fields: (t) => ({
    run: t.field({
      type: RunRef,
      description: 'The updated run',
      resolve: async (parent, _args, ctx) => resolveRunFromPayload(parent, ctx),
    }),
    queuedCount: t.exposeInt('queuedCount', {
      description: 'Number of summarization jobs queued',
    }),
  }),
});

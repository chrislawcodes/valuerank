import { builder } from '../builder.js';
import { TranscriptRef, RunRef, ScenarioRef } from './refs.js';

// Re-export for backward compatibility
export { TranscriptRef };

builder.objectType(TranscriptRef, {
  description: 'A transcript from a model conversation during a run',
  fields: (t) => ({
    id: t.exposeID('id'),
    runId: t.exposeString('runId'),
    scenarioId: t.exposeString('scenarioId', { nullable: true }),
    modelId: t.exposeString('modelId', {
      description: 'The model identifier used for this transcript',
    }),
    modelVersion: t.exposeString('modelVersion', { nullable: true }),
    definitionSnapshot: t.expose('definitionSnapshot', { type: 'JSON', nullable: true }),
    content: t.expose('content', { type: 'JSON' }),
    turnCount: t.exposeInt('turnCount'),
    tokenCount: t.exposeInt('tokenCount'),
    durationMs: t.exposeInt('durationMs'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    lastAccessedAt: t.expose('lastAccessedAt', { type: 'DateTime', nullable: true }),
    contentExpiresAt: t.expose('contentExpiresAt', { type: 'DateTime', nullable: true }),

    // Relation: run
    run: t.field({
      type: RunRef,
      resolve: async (transcript, _args, ctx) => {
        const run = await ctx.loaders.run.load(transcript.runId);
        if (!run) {
          throw new Error(`Run not found for transcript ${transcript.id}`);
        }
        return run;
      },
    }),

    // Relation: scenario (optional)
    scenario: t.field({
      type: ScenarioRef,
      nullable: true,
      resolve: async (transcript, _args, ctx) => {
        if (!transcript.scenarioId) return null;
        return ctx.loaders.scenario.load(transcript.scenarioId);
      },
    }),

    // Computed: estimated cost from transcript content
    estimatedCost: t.float({
      nullable: true,
      description: 'Estimated cost in dollars based on token usage and model pricing',
      resolve: (transcript) => {
        const content = transcript.content as Record<string, unknown> | null;
        if (!content) return null;
        const costSnapshot = content.costSnapshot as Record<string, unknown> | null;
        if (!costSnapshot) return null;
        const cost = costSnapshot.estimatedCost;
        return typeof cost === 'number' ? cost : null;
      },
    }),
  }),
});

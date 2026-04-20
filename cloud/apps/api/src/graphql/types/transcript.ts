import { builder } from '../builder.js';
import { config } from '../../config.js';
import { AppError } from '@valuerank/shared';
import { resolveTranscriptDecisionModel } from '../queries/domain/shared.js';
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
    sampleIndex: t.exposeInt('sampleIndex', {
      description: 'Index within sample set for multi-sample runs (0 to N-1). Always 0 for single-sample runs.',
    }),
    definitionSnapshot: t.expose('definitionSnapshot', { type: 'JSON', nullable: true }),
    content: t.expose('content', { type: 'JSON' }),
    turnCount: t.exposeInt('turnCount'),
    tokenCount: t.exposeInt('tokenCount'),
    durationMs: t.exposeInt('durationMs'),
    decisionMetadata: t.expose('decisionMetadata', {
      type: 'JSON',
      nullable: true,
      description: 'Parser and adjudication metadata for the transcript decision',
    }),
    decisionModelV2: t.field({
      type: 'JSON',
      nullable: true,
      description: 'V2 decision envelope with raw evidence and canonical direction/strength decision',
      resolve: async (transcript, _args, ctx) => {
        if (!config.DECISION_MODEL_V2) {
          return null;
        }

        const scenario =
          transcript.scenarioId === null || transcript.scenarioId === undefined || transcript.scenarioId === ''
            ? null
            : await ctx.loaders.scenario.load(transcript.scenarioId);

        return resolveTranscriptDecisionModel({
          decisionMetadata: transcript.decisionMetadata,
          definitionSnapshot: transcript.definitionSnapshot,
          orientationFlipped: scenario?.orientationFlipped ?? null,
        });
      },
    }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    lastAccessedAt: t.expose('lastAccessedAt', { type: 'DateTime', nullable: true }),
    contentExpiresAt: t.expose('contentExpiresAt', { type: 'DateTime', nullable: true }),

    // Relation: run
    run: t.field({
      type: RunRef,
      resolve: async (transcript, _args, ctx) => {
        const run = await ctx.loaders.run.load(transcript.runId);
        if (run === null || run === undefined) {
          throw new AppError(`Run not found for transcript ${transcript.id}`, 'NOT_FOUND', 404);
        }
        return run;
      },
    }),

    // Relation: scenario (optional)
    scenario: t.field({
      type: ScenarioRef,
      nullable: true,
      resolve: async (transcript, _args, ctx) => {
        if (transcript.scenarioId === null || transcript.scenarioId === undefined || transcript.scenarioId === '') return null;
        return ctx.loaders.scenario.load(transcript.scenarioId);
      },
    }),

    // Derived: dimension values from scenario content (e.g. attribute levels for job-choice vignettes)
    dimensionValues: t.field({
      type: 'JSON',
      nullable: true,
      description: "Dimension values for this transcript's scenario (e.g. attribute levels for job-choice vignettes)",
      resolve: async (transcript, _args, ctx) => {
        if (transcript.scenarioId === null || transcript.scenarioId === undefined || transcript.scenarioId === '') return null;
        const scenario = await ctx.loaders.scenario.load(transcript.scenarioId);
        if (!scenario) return null;
        const content = scenario.content as { dimension_values?: Record<string, string | number> } | null;
        const dv = content?.dimension_values;
        if (!dv || typeof dv !== 'object' || Object.keys(dv).length === 0) return null;
        return dv;
      },
    }),

    // Computed: estimated cost from transcript content
    estimatedCost: t.float({
      nullable: true,
      description: 'Estimated cost in dollars based on token usage and model pricing',
      resolve: (transcript) => {
        const content = transcript.content as Record<string, unknown> | null;
        if (content === null || content === undefined) return null;
        const costSnapshot = content.costSnapshot as Record<string, unknown> | null;
        if (costSnapshot === null || costSnapshot === undefined) return null;
        const cost = costSnapshot.estimatedCost;
        return typeof cost === 'number' ? cost : null;
      },
    }),
  }),
});

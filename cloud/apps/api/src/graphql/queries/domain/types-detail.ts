import { builder } from '../../builder.js';
import { config } from '../../../config.js';
import type {
  DomainAnalysisValueDetailResult,
  DomainAnalysisValuePair,
} from './shared.js';
import { resolveTranscriptDecisionModel } from './decision-model.js';
import type { TranscriptDecisionModelResult } from './decision-model.js';

export type DomainAnalysisConditionDetail = {
  scenarioId: string | null;
  conditionName: string;
  dimensions: Record<string, string | number> | null;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalTrials: number;
  selectedValueWinRate: number | null;
  strongly: number;
  somewhat: number;
  opponentSomewhat: number;
  opponentStrongly: number;
  unknownCount: number;
};

export type DomainAnalysisVignetteDetail = {
  definitionId: string;
  definitionName: string;
  definitionVersion: number;
  aggregateRunId: string | null;
  otherValueKey: string;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalTrials: number;
  selectedValueWinRate: number | null;
  conditions: DomainAnalysisConditionDetail[];
};

export type DomainAnalysisConditionTranscript = {
  id: string;
  runId: string;
  scenarioId: string | null;
  modelId: string;
  decisionMetadata: unknown;
  definitionSnapshot?: unknown;
  pairOverride?: DomainAnalysisValuePair | null;
  decisionModelV2?: TranscriptDecisionModelResult | null;
  turnCount: number;
  tokenCount: number;
  durationMs: number;
  createdAt: Date;
  content: unknown;
};

export const DomainAnalysisConditionDetailRef = builder.objectRef<DomainAnalysisConditionDetail>('DomainAnalysisConditionDetail');
export const DomainAnalysisVignetteDetailRef = builder.objectRef<DomainAnalysisVignetteDetail>('DomainAnalysisVignetteDetail');
export const DomainAnalysisConditionTranscriptRef = builder.objectRef<DomainAnalysisConditionTranscript>('DomainAnalysisConditionTranscript');
export const DomainAnalysisValueDetailResultRef = builder.objectRef<DomainAnalysisValueDetailResult>('DomainAnalysisValueDetailResult');

builder.objectType(DomainAnalysisConditionDetailRef, {
  fields: (t) => ({
    scenarioId: t.exposeID('scenarioId', { nullable: true }),
    conditionName: t.exposeString('conditionName'),
    dimensions: t.expose('dimensions', { type: 'JSON', nullable: true }),
    prioritized: t.exposeInt('prioritized'),
    deprioritized: t.exposeInt('deprioritized'),
    neutral: t.exposeInt('neutral'),
    totalTrials: t.exposeInt('totalTrials'),
    selectedValueWinRate: t.exposeFloat('selectedValueWinRate', { nullable: true }),
    strongly: t.exposeInt('strongly'),
    somewhat: t.exposeInt('somewhat'),
    opponentSomewhat: t.exposeInt('opponentSomewhat'),
    opponentStrongly: t.exposeInt('opponentStrongly'),
    unknownCount: t.exposeInt('unknownCount'),
  }),
});

builder.objectType(DomainAnalysisVignetteDetailRef, {
  fields: (t) => ({
    definitionId: t.exposeID('definitionId'),
    definitionName: t.exposeString('definitionName'),
    definitionVersion: t.exposeInt('definitionVersion'),
    aggregateRunId: t.exposeID('aggregateRunId', { nullable: true }),
    otherValueKey: t.exposeString('otherValueKey'),
    prioritized: t.exposeInt('prioritized'),
    deprioritized: t.exposeInt('deprioritized'),
    neutral: t.exposeInt('neutral'),
    totalTrials: t.exposeInt('totalTrials'),
    selectedValueWinRate: t.exposeFloat('selectedValueWinRate', { nullable: true }),
    conditions: t.field({
      type: [DomainAnalysisConditionDetailRef],
      resolve: (parent) => parent.conditions,
    }),
  }),
});

builder.objectType(DomainAnalysisConditionTranscriptRef, {
  fields: (t) => ({
    id: t.exposeID('id'),
    runId: t.exposeID('runId'),
    scenarioId: t.exposeID('scenarioId', { nullable: true }),
    modelId: t.exposeString('modelId'),
    decisionModelV2: t.field({
      type: 'JSON',
      nullable: true,
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
          pairOverride: transcript.pairOverride,
        });
      },
    }),
    turnCount: t.exposeInt('turnCount'),
    tokenCount: t.exposeInt('tokenCount'),
    durationMs: t.exposeInt('durationMs'),
    createdAt: t.field({
      type: 'DateTime',
      resolve: (parent) => parent.createdAt,
    }),
    content: t.expose('content', { type: 'JSON' }),
  }),
});

builder.objectType(DomainAnalysisValueDetailResultRef, {
  fields: (t) => ({
    domainId: t.exposeID('domainId'),
    domainName: t.exposeString('domainName'),
    modelId: t.exposeString('modelId'),
    modelLabel: t.exposeString('modelLabel'),
    valueKey: t.exposeString('valueKey'),
    score: t.exposeFloat('score'),
    prioritized: t.exposeInt('prioritized'),
    deprioritized: t.exposeInt('deprioritized'),
    neutral: t.exposeInt('neutral'),
    totalTrials: t.exposeInt('totalTrials'),
    targetedDefinitions: t.exposeInt('targetedDefinitions'),
    coveredDefinitions: t.exposeInt('coveredDefinitions'),
    missingDefinitionIds: t.exposeIDList('missingDefinitionIds'),
    vignettes: t.field({
      type: [DomainAnalysisVignetteDetailRef],
      resolve: (parent) => parent.vignettes,
    }),
    generatedAt: t.field({
      type: 'DateTime',
      resolve: (parent) => parent.generatedAt,
    }),
  }),
});

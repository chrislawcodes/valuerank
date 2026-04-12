import { builder } from '../../builder.js';

export type LaunchAssumptionsTempZeroPayload = {
  startedRuns: number;
  totalVignettes: number;
  modelCount: number;
  runIds: string[];
  failedVignetteIds: string[];
};

export type ReviewOrderInvariancePairPayload = {
  pairId: string;
  reviewStatus: string;
  reviewedAt: Date;
};

export type LaunchOrderInvariancePayload = {
  startedRuns: number;
  runsByVariantType: Record<string, number>;
  approvedPairs: number;
  modelCount: number;
  runIds: string[];
  failedDefinitionIds: string[];
};

export type ExistingTranscriptRecord = {
  scenarioId: string | null;
  modelId: string;
  modelVersion: string | null;
  createdAt: Date;
  run: {
    config: unknown;
    tags: Array<{ tag: { name: string } }>;
  };
};

export type ScenarioRecord = {
  id: string;
  definitionId: string;
};

export type TranscriptRecord = {
  scenarioId: string | null;
  modelId: string;
  modelVersion: string | null;
  createdAt: Date;
};

export const LaunchAssumptionsTempZeroPayloadRef =
  builder.objectRef<LaunchAssumptionsTempZeroPayload>('LaunchAssumptionsTempZeroPayload');
export const ReviewOrderInvariancePairPayloadRef =
  builder.objectRef<ReviewOrderInvariancePairPayload>('ReviewOrderInvariancePairPayload');
export const LaunchOrderInvariancePayloadRef =
  builder.objectRef<LaunchOrderInvariancePayload>('LaunchOrderInvariancePayload');

builder.objectType(LaunchAssumptionsTempZeroPayloadRef, {
  fields: (t) => ({
    startedRuns: t.exposeInt('startedRuns'),
    totalVignettes: t.exposeInt('totalVignettes'),
    modelCount: t.exposeInt('modelCount'),
    runIds: t.exposeStringList('runIds'),
    failedVignetteIds: t.exposeStringList('failedVignetteIds'),
  }),
});

builder.objectType(ReviewOrderInvariancePairPayloadRef, {
  fields: (t) => ({
    pairId: t.exposeID('pairId'),
    reviewStatus: t.exposeString('reviewStatus'),
    reviewedAt: t.expose('reviewedAt', { type: 'DateTime' }),
  }),
});

builder.objectType(LaunchOrderInvariancePayloadRef, {
  fields: (t) => ({
    startedRuns: t.exposeInt('startedRuns'),
    runsByVariantType: t.field({
      type: 'JSON',
      resolve: (parent) => parent.runsByVariantType,
    }),
    approvedPairs: t.exposeInt('approvedPairs'),
    modelCount: t.exposeInt('modelCount'),
    runIds: t.exposeStringList('runIds'),
    failedDefinitionIds: t.exposeStringList('failedDefinitionIds'),
  }),
});

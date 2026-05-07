import { builder } from '../builder.js';

export type ModelGroupingSignificanceModelShape = {
  modelId: string;
  label: string;
};

export type ModelGroupingSignificanceRowShape = {
  modelAId: string;
  modelALabel: string;
  modelBId: string;
  modelBLabel: string;
  n: number;
  agreementRate: number;
  discordantAtoB: number;
  discordantBtoA: number;
  rawPValue: number | null;
  holmCorrectedPValue: number | null;
  oddsRatio: number | null;
  effectLabel: 'Weak' | 'Strong';
  confidenceIntervalLow: number | null;
  confidenceIntervalHigh: number | null;
  verdict: 'Significant' | 'Weak' | 'Not significant';
};

export type ModelGroupingSignificanceResultShape = {
  models: ModelGroupingSignificanceModelShape[];
  rows: ModelGroupingSignificanceRowShape[];
  // True when the underlying domain-analysis snapshot has not yet been built for
  // this scope/signature. The rebuild is queued automatically; the client should
  // show a "computing" state and retry after a short delay.
  pending: boolean;
};

const ModelGroupingSignificanceModelRef = builder.objectRef<ModelGroupingSignificanceModelShape>(
  'ModelGroupingSignificanceModel',
);
const ModelGroupingSignificanceRowRef = builder.objectRef<ModelGroupingSignificanceRowShape>(
  'ModelGroupingSignificanceRow',
);

export const ModelGroupingSignificanceResultRef = builder.objectRef<ModelGroupingSignificanceResultShape>(
  'ModelGroupingSignificanceResult',
);

builder.objectType(ModelGroupingSignificanceModelRef, {
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    label: t.exposeString('label'),
  }),
});

builder.objectType(ModelGroupingSignificanceRowRef, {
  fields: (t) => ({
    modelAId: t.exposeString('modelAId'),
    modelALabel: t.exposeString('modelALabel'),
    modelBId: t.exposeString('modelBId'),
    modelBLabel: t.exposeString('modelBLabel'),
    n: t.exposeInt('n'),
    agreementRate: t.exposeFloat('agreementRate'),
    discordantAtoB: t.exposeInt('discordantAtoB'),
    discordantBtoA: t.exposeInt('discordantBtoA'),
    rawPValue: t.exposeFloat('rawPValue', { nullable: true }),
    holmCorrectedPValue: t.exposeFloat('holmCorrectedPValue', { nullable: true }),
    oddsRatio: t.exposeFloat('oddsRatio', { nullable: true }),
    effectLabel: t.exposeString('effectLabel'),
    confidenceIntervalLow: t.exposeFloat('confidenceIntervalLow', { nullable: true }),
    confidenceIntervalHigh: t.exposeFloat('confidenceIntervalHigh', { nullable: true }),
    verdict: t.exposeString('verdict'),
  }),
});

builder.objectType(ModelGroupingSignificanceResultRef, {
  fields: (t) => ({
    models: t.expose('models', { type: [ModelGroupingSignificanceModelRef] }),
    rows: t.expose('rows', { type: [ModelGroupingSignificanceRowRef] }),
    pending: t.exposeBoolean('pending'),
  }),
});

import { builder } from '../builder.js';

export type ModelPairwiseWinRatesShape = {
  modelId: string;
  label: string;
  valueOrder: string[];
  winRateMatrix: Array<Array<number | null>>;
  trialCountMatrix: number[][];
};

export type PairwiseWinRatesResultShape = {
  models: ModelPairwiseWinRatesShape[];
};

const ModelPairwiseWinRatesRef = builder.objectRef<ModelPairwiseWinRatesShape>('ModelPairwiseWinRates');
export const PairwiseWinRatesResultRef = builder.objectRef<PairwiseWinRatesResultShape>('PairwiseWinRatesResult');

builder.objectType(ModelPairwiseWinRatesRef, {
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    label: t.exposeString('label'),
    valueOrder: t.exposeStringList('valueOrder'),
    winRateMatrix: t.field({
      type: [t.listRef('Float', { nullable: true })],
      resolve: (parent) => parent.winRateMatrix,
    }),
    trialCountMatrix: t.field({
      type: [t.listRef('Int')],
      resolve: (parent) => parent.trialCountMatrix,
    }),
  }),
});

builder.objectType(PairwiseWinRatesResultRef, {
  fields: (t) => ({
    models: t.expose('models', { type: [ModelPairwiseWinRatesRef] }),
  }),
});

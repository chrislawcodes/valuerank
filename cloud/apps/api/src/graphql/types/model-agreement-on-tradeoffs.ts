import { builder } from '../builder.js';

export type ModelInfoShape = {
  modelId: string;
  label: string;
};

export type UnavailableModelInfoShape = {
  modelId: string;
  label: string;
  reason: string;
};

export type PairwiseAgreementRowShape = {
  modelAId: string;
  modelALabel: string;
  modelBId: string;
  modelBLabel: string;
  totalCells: number;
  percentAgreement: number | null;
  cohensKappa: number | null;
  kappaInterpretation: string | null;
  meanAbsoluteDivergence: number | null;
};

export type ModelTrialConsistencyShape = {
  modelId: string;
  modelLabel: string;
  cellsObserved: number;
  meanTrialConsistency: number | null;
  noisy: boolean;
};

export type ModelAgreementResultShape = {
  pending: boolean;
  models: ModelInfoShape[];
  unavailableModels: UnavailableModelInfoShape[];
  excludedNonBinaryCells: number;
  excludedTiedCells: number;
  pairwiseAgreementMatrix: PairwiseAgreementRowShape[];
  trialConsistency: ModelTrialConsistencyShape[];
};

export type ValuePairDivergenceShape = {
  valueA: string;
  valueB: string;
  cellsCompared: number;
  meanAbsoluteDivergence: number | null;
  modelAProportionA: number | null;
  modelBProportionA: number | null;
};

export type PairDivergenceBreakdownShape = {
  pending: boolean;
  modelAId: string;
  modelALabel: string;
  modelBId: string;
  modelBLabel: string;
  perValuePair: ValuePairDivergenceShape[];
};

const ModelInfoRef = builder.objectRef<ModelInfoShape>('ModelInfo');
const UnavailableModelInfoRef = builder.objectRef<UnavailableModelInfoShape>('UnavailableModelInfo');
const PairwiseAgreementRowRef = builder.objectRef<PairwiseAgreementRowShape>('PairwiseAgreementRow');
const ModelTrialConsistencyRef = builder.objectRef<ModelTrialConsistencyShape>('ModelTrialConsistency');
export const ModelAgreementResultRef = builder.objectRef<ModelAgreementResultShape>('ModelAgreementResult');
const ValuePairDivergenceRef = builder.objectRef<ValuePairDivergenceShape>('ValuePairDivergence');
export const PairDivergenceBreakdownRef = builder.objectRef<PairDivergenceBreakdownShape>('PairDivergenceBreakdown');

builder.objectType(ModelInfoRef, {
  fields: (t) => ({
    modelId: t.exposeID('modelId'),
    label: t.exposeString('label'),
  }),
});

builder.objectType(UnavailableModelInfoRef, {
  fields: (t) => ({
    modelId: t.exposeID('modelId'),
    label: t.exposeString('label'),
    reason: t.exposeString('reason'),
  }),
});

builder.objectType(PairwiseAgreementRowRef, {
  fields: (t) => ({
    modelAId: t.exposeID('modelAId'),
    modelALabel: t.exposeString('modelALabel'),
    modelBId: t.exposeID('modelBId'),
    modelBLabel: t.exposeString('modelBLabel'),
    totalCells: t.exposeInt('totalCells'),
    percentAgreement: t.exposeFloat('percentAgreement', { nullable: true }),
    cohensKappa: t.exposeFloat('cohensKappa', { nullable: true }),
    kappaInterpretation: t.exposeString('kappaInterpretation', { nullable: true }),
    meanAbsoluteDivergence: t.exposeFloat('meanAbsoluteDivergence', { nullable: true }),
  }),
});

builder.objectType(ModelTrialConsistencyRef, {
  fields: (t) => ({
    modelId: t.exposeID('modelId'),
    modelLabel: t.exposeString('modelLabel'),
    cellsObserved: t.exposeInt('cellsObserved'),
    meanTrialConsistency: t.exposeFloat('meanTrialConsistency', { nullable: true }),
    noisy: t.exposeBoolean('noisy'),
  }),
});

builder.objectType(ModelAgreementResultRef, {
  fields: (t) => ({
    pending: t.exposeBoolean('pending'),
    models: t.expose('models', { type: [ModelInfoRef] }),
    unavailableModels: t.expose('unavailableModels', { type: [UnavailableModelInfoRef] }),
    excludedNonBinaryCells: t.exposeInt('excludedNonBinaryCells'),
    excludedTiedCells: t.exposeInt('excludedTiedCells'),
    pairwiseAgreementMatrix: t.expose('pairwiseAgreementMatrix', { type: [PairwiseAgreementRowRef] }),
    trialConsistency: t.expose('trialConsistency', { type: [ModelTrialConsistencyRef] }),
  }),
});

builder.objectType(ValuePairDivergenceRef, {
  fields: (t) => ({
    valueA: t.exposeString('valueA'),
    valueB: t.exposeString('valueB'),
    cellsCompared: t.exposeInt('cellsCompared'),
    meanAbsoluteDivergence: t.exposeFloat('meanAbsoluteDivergence', { nullable: true }),
    modelAProportionA: t.exposeFloat('modelAProportionA', { nullable: true }),
    modelBProportionA: t.exposeFloat('modelBProportionA', { nullable: true }),
  }),
});

builder.objectType(PairDivergenceBreakdownRef, {
  fields: (t) => ({
    pending: t.exposeBoolean('pending'),
    modelAId: t.exposeID('modelAId'),
    modelALabel: t.exposeString('modelALabel'),
    modelBId: t.exposeID('modelBId'),
    modelBLabel: t.exposeString('modelBLabel'),
    perValuePair: t.expose('perValuePair', { type: [ValuePairDivergenceRef] }),
  }),
});

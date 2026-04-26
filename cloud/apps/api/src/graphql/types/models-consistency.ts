import { builder } from '../builder.js';

export type ConsistencyPerScenarioShape = {
  scenarioId: string;
  matches: number;
  trials: number;
  p: number;
  ciLow: number;
  ciHigh: number;
};

export type ConsistencyPerDomainShape = {
  domainId: string;
  domainName: string;
  value: number;
  ciLow: number;
  ciHigh: number;
  scenariosMeasured: number;
};

export type RepeatabilityShape = {
  value: number;
  ciLow: number;
  ciHigh: number;
  withinScenarioSd: number;
  betweenScenarioSd: number;
  scenariosMeasured: number;
  perDomain: ConsistencyPerDomainShape[];
  perScenario: ConsistencyPerScenarioShape[];
};

export type ConsistencyPerConditionShape = {
  netPressureRank: number;
  winRate: number | null;
  matches: number;
  trials: number;
  scenarioId: string;
};

export type ConsistencyPerPairShape = {
  domainId: string;
  valueKey: string;
  rho: number | null;
  pValue: number | null;
  coherent: boolean;
  determinate: boolean;
  targetAnalysisRunId: string | null;
  targetCompanionRunId: string | null;
  primaryConditionIds: string[];
  companionConditionIds: string[];
  perCondition: ConsistencyPerConditionShape[];
};

export type CoherenceShape = {
  value: number;
  coherentPairs: number;
  determinatePairs: number;
  indeterminatePairs: number;
  perPair: ConsistencyPerPairShape[];
};

export type OrderEffectShape = {
  samePct: number;
  flippedPct: number;
  noisyPct: number;
  notApplicable: boolean;
};

export type ModelConsistencyShape = {
  modelId: string;
  label: string;
  providerName: string;
  repeatability: RepeatabilityShape;
  coherence: CoherenceShape;
  orderEffect: OrderEffectShape;
};

export type InsufficientModelShape = {
  modelId: string;
  label: string;
  providerName: string;
  reason: 'no-repeat-coverage' | 'invalid-summary-shape' | 'below-min-scenarios';
};

export type ModelsConsistencyShape = {
  models: ModelConsistencyShape[];
  insufficient: InsufficientModelShape[];
};

const ConsistencyPerScenarioRef = builder.objectRef<ConsistencyPerScenarioShape>('ConsistencyPerScenario');
const ConsistencyPerDomainRef = builder.objectRef<ConsistencyPerDomainShape>('ConsistencyPerDomain');
const RepeatabilityRef = builder.objectRef<RepeatabilityShape>('Repeatability');
const ConsistencyPerConditionRef = builder.objectRef<ConsistencyPerConditionShape>('ConsistencyPerCondition');
const ConsistencyPerPairRef = builder.objectRef<ConsistencyPerPairShape>('ConsistencyPerPair');
const CoherenceRef = builder.objectRef<CoherenceShape>('Coherence');
const OrderEffectRef = builder.objectRef<OrderEffectShape>('OrderEffect');
const ModelConsistencyRef = builder.objectRef<ModelConsistencyShape>('ModelConsistency');
const InsufficientModelRef = builder.objectRef<InsufficientModelShape>('InsufficientModel');

export const ModelsConsistencyResultRef = builder.objectRef<ModelsConsistencyShape>('ModelsConsistencyResult');

builder.objectType(ConsistencyPerScenarioRef, {
  fields: (t) => ({
    scenarioId: t.exposeString('scenarioId'),
    matches: t.exposeInt('matches'),
    trials: t.exposeInt('trials'),
    p: t.exposeFloat('p'),
    ciLow: t.exposeFloat('ciLow'),
    ciHigh: t.exposeFloat('ciHigh'),
  }),
});

builder.objectType(ConsistencyPerDomainRef, {
  fields: (t) => ({
    domainId: t.exposeString('domainId'),
    domainName: t.exposeString('domainName'),
    value: t.exposeFloat('value'),
    ciLow: t.exposeFloat('ciLow'),
    ciHigh: t.exposeFloat('ciHigh'),
    scenariosMeasured: t.exposeInt('scenariosMeasured'),
  }),
});

builder.objectType(RepeatabilityRef, {
  fields: (t) => ({
    value: t.exposeFloat('value'),
    ciLow: t.exposeFloat('ciLow'),
    ciHigh: t.exposeFloat('ciHigh'),
    withinScenarioSd: t.exposeFloat('withinScenarioSd'),
    betweenScenarioSd: t.exposeFloat('betweenScenarioSd'),
    scenariosMeasured: t.exposeInt('scenariosMeasured'),
    perDomain: t.expose('perDomain', { type: [ConsistencyPerDomainRef] }),
    perScenario: t.expose('perScenario', { type: [ConsistencyPerScenarioRef] }),
  }),
});

builder.objectType(ConsistencyPerConditionRef, {
  fields: (t) => ({
    netPressureRank: t.exposeInt('netPressureRank'),
    winRate: t.exposeFloat('winRate', { nullable: true }),
    matches: t.exposeInt('matches'),
    trials: t.exposeInt('trials'),
    scenarioId: t.exposeString('scenarioId'),
  }),
});

builder.objectType(ConsistencyPerPairRef, {
  fields: (t) => ({
    domainId: t.exposeString('domainId'),
    valueKey: t.exposeString('valueKey'),
    rho: t.exposeFloat('rho', { nullable: true }),
    pValue: t.exposeFloat('pValue', { nullable: true }),
    coherent: t.exposeBoolean('coherent'),
    determinate: t.exposeBoolean('determinate'),
    targetAnalysisRunId: t.exposeString('targetAnalysisRunId', { nullable: true }),
    targetCompanionRunId: t.exposeString('targetCompanionRunId', { nullable: true }),
    primaryConditionIds: t.exposeStringList('primaryConditionIds'),
    companionConditionIds: t.exposeStringList('companionConditionIds'),
    perCondition: t.expose('perCondition', { type: [ConsistencyPerConditionRef] }),
  }),
});

builder.objectType(CoherenceRef, {
  fields: (t) => ({
    value: t.exposeFloat('value'),
    coherentPairs: t.exposeInt('coherentPairs'),
    determinatePairs: t.exposeInt('determinatePairs'),
    indeterminatePairs: t.exposeInt('indeterminatePairs'),
    perPair: t.expose('perPair', { type: [ConsistencyPerPairRef] }),
  }),
});

builder.objectType(OrderEffectRef, {
  fields: (t) => ({
    samePct: t.exposeFloat('samePct'),
    flippedPct: t.exposeFloat('flippedPct'),
    noisyPct: t.exposeFloat('noisyPct'),
    notApplicable: t.exposeBoolean('notApplicable'),
  }),
});

builder.objectType(ModelConsistencyRef, {
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    label: t.exposeString('label'),
    providerName: t.exposeString('providerName'),
    repeatability: t.expose('repeatability', { type: RepeatabilityRef }),
    coherence: t.expose('coherence', { type: CoherenceRef }),
    orderEffect: t.expose('orderEffect', { type: OrderEffectRef }),
  }),
});

builder.objectType(InsufficientModelRef, {
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    label: t.exposeString('label'),
    providerName: t.exposeString('providerName'),
    reason: t.exposeString('reason'),
  }),
});

builder.objectType(ModelsConsistencyResultRef, {
  fields: (t) => ({
    models: t.expose('models', { type: [ModelConsistencyRef] }),
    insufficient: t.expose('insufficient', { type: [InsufficientModelRef] }),
  }),
});

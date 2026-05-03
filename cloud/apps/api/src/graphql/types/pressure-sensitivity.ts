import { builder } from '../builder.js';

export type SensitivityCellShape = {
  ownLevel: number;
  opponentLevel: number;
  n: number;
  successes: number;
  opponentSuccesses: number;
  unscoredCount: number;
  winRate: number | null;
  opponentWinRate: number | null;
  conviction: number | null;
  netScore: number | null;
  lowData: boolean;
};

export type PressureResponseShape = {
  value: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  baselineRate: number | null;
  pushTowardFirstRate: number | null;
  pushTowardSecondRate: number | null;
  qualifyingTrials: number;
  reason:
    | 'directional-thin'
    | 'inverted-thin'
    | 'baseline-thin'
    | 'directional-and-inverted-thin'
    | null;
};

export type PressureResponseSummaryShape = {
  mean: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  pairsMeasured: number;
};

export type PressureSensitivityValuePairShape = {
  pairKey: string;
  firstValueToken: string;
  firstValueLabel: string;
  secondValueToken: string;
  secondValueLabel: string;
  pressureResponse: PressureResponseShape;
  n: number;
  unscoredCount: number;
  grid: SensitivityCellShape[];
  definitionsMeasured: number;
  directionBalancedWinRate: number | null;
  directionBalancedOpponentWinRate: number | null;
  directionBalancedBalancedWinRate: number | null;
  directionBalancedBalancedOpponentWinRate: number | null;
  directionBalancedHighPressureOwnWinRate: number | null;
  directionBalancedHighPressureOwnOpponentWinRate: number | null;
  directionBalancedHighPressureOpponentWinRate: number | null;
  directionBalancedHighPressureOpponentOpponentWinRate: number | null;
};

export type PressureSensitivityModelShape = {
  modelId: string;
  label: string;
  providerName: string;
  pressureResponseSummary: PressureResponseSummaryShape;
  valuePairs: PressureSensitivityValuePairShape[];
  unscoredCount: number;
};

export type InsufficientPressureSensitivityModelShape = {
  modelId: string;
  label: string;
  providerName: string;
  reason: 'no-coverage';
};

export type ExcludedDefinitionShape = {
  definitionId: string;
  name: string;
  reason: string;
};

export type DirectionalSanityCheckEntryShape = {
  modelId: string;
  pairKey: string;
  pressureResponse: number;
  classification: 'positive' | 'flat' | 'negative';
};

export type DirectionalSanityCheckShape = {
  positivePct: number;
  flatPct: number;
  negativePct: number;
  measuredCount: number;
  unmeasurableCount: number;
  breakdown: DirectionalSanityCheckEntryShape[];
};

export type PressureSensitivityResultShape = {
  models: PressureSensitivityModelShape[];
  insufficient: InsufficientPressureSensitivityModelShape[];
  excludedDefinitions: ExcludedDefinitionShape[];
  pressureConditionExcludedCount: number;
  pressureConditionExclusionBreakdown: PressureConditionExclusionBreakdownShape;
  directionalSanityCheck: DirectionalSanityCheckShape;
  transcriptCapHit: boolean;
};

export type PressureConditionExclusionBreakdownShape = {
  sourceRunMapping: number;
  definitionMetadata: number;
  missingScenario: number;
  invalidMetadata: number;
  levelAssignment: number;
};

const SensitivityCellRef = builder.objectRef<SensitivityCellShape>('SensitivityCell');
const PressureResponseRef = builder.objectRef<PressureResponseShape>('PressureResponse');
const PressureResponseSummaryRef = builder.objectRef<PressureResponseSummaryShape>(
  'PressureResponseSummary',
);
const PressureSensitivityValuePairRef = builder.objectRef<PressureSensitivityValuePairShape>(
  'PressureSensitivityValuePair',
);
const PressureSensitivityModelRef = builder.objectRef<PressureSensitivityModelShape>(
  'PressureSensitivityModel',
);
const InsufficientPressureSensitivityModelRef = builder.objectRef<
  InsufficientPressureSensitivityModelShape
>('InsufficientPressureSensitivityModel');
const ExcludedDefinitionRef = builder.objectRef<ExcludedDefinitionShape>('ExcludedDefinition');
const DirectionalSanityCheckEntryRef = builder.objectRef<DirectionalSanityCheckEntryShape>(
  'DirectionalSanityCheckEntry',
);
const DirectionalSanityCheckRef = builder.objectRef<DirectionalSanityCheckShape>(
  'DirectionalSanityCheck',
);
const PressureConditionExclusionBreakdownRef = builder.objectRef<
  PressureConditionExclusionBreakdownShape
>('PressureConditionExclusionBreakdown');

export const PressureSensitivityResultRef = builder.objectRef<PressureSensitivityResultShape>(
  'PressureSensitivityResult',
);

builder.objectType(SensitivityCellRef, {
  fields: (t) => ({
    ownLevel: t.exposeInt('ownLevel'),
    opponentLevel: t.exposeInt('opponentLevel'),
    n: t.exposeInt('n'),
    successes: t.exposeInt('successes'),
    opponentSuccesses: t.exposeInt('opponentSuccesses'),
    unscoredCount: t.exposeInt('unscoredCount'),
    winRate: t.exposeFloat('winRate', { nullable: true }),
    opponentWinRate: t.exposeFloat('opponentWinRate', { nullable: true }),
    conviction: t.exposeFloat('conviction', { nullable: true }),
    netScore: t.exposeFloat('netScore', { nullable: true }),
    lowData: t.exposeBoolean('lowData'),
  }),
});

builder.objectType(PressureResponseRef, {
  fields: (t) => ({
    value: t.exposeFloat('value', { nullable: true }),
    ciLow: t.exposeFloat('ciLow', { nullable: true }),
    ciHigh: t.exposeFloat('ciHigh', { nullable: true }),
    baselineRate: t.exposeFloat('baselineRate', { nullable: true }),
    pushTowardFirstRate: t.exposeFloat('pushTowardFirstRate', { nullable: true }),
    pushTowardSecondRate: t.exposeFloat('pushTowardSecondRate', { nullable: true }),
    qualifyingTrials: t.exposeInt('qualifyingTrials'),
    reason: t.exposeString('reason', { nullable: true }),
  }),
});

builder.objectType(PressureResponseSummaryRef, {
  fields: (t) => ({
    mean: t.exposeFloat('mean', { nullable: true }),
    rangeMin: t.exposeFloat('rangeMin', { nullable: true }),
    rangeMax: t.exposeFloat('rangeMax', { nullable: true }),
    pairsMeasured: t.exposeInt('pairsMeasured'),
  }),
});

builder.objectType(PressureSensitivityValuePairRef, {
  fields: (t) => ({
    pairKey: t.exposeString('pairKey'),
    firstValueToken: t.exposeString('firstValueToken'),
    firstValueLabel: t.exposeString('firstValueLabel'),
    secondValueToken: t.exposeString('secondValueToken'),
    secondValueLabel: t.exposeString('secondValueLabel'),
    pressureResponse: t.expose('pressureResponse', { type: PressureResponseRef }),
    n: t.exposeInt('n'),
    unscoredCount: t.exposeInt('unscoredCount'),
    grid: t.expose('grid', { type: [SensitivityCellRef] }),
    definitionsMeasured: t.exposeInt('definitionsMeasured'),
    directionBalancedWinRate: t.exposeFloat('directionBalancedWinRate', { nullable: true }),
    directionBalancedOpponentWinRate: t.exposeFloat('directionBalancedOpponentWinRate', { nullable: true }),
    directionBalancedBalancedWinRate: t.exposeFloat('directionBalancedBalancedWinRate', { nullable: true }),
    directionBalancedBalancedOpponentWinRate: t.exposeFloat('directionBalancedBalancedOpponentWinRate', { nullable: true }),
    directionBalancedHighPressureOwnWinRate: t.exposeFloat('directionBalancedHighPressureOwnWinRate', { nullable: true }),
    directionBalancedHighPressureOwnOpponentWinRate: t.exposeFloat('directionBalancedHighPressureOwnOpponentWinRate', { nullable: true }),
    directionBalancedHighPressureOpponentWinRate: t.exposeFloat('directionBalancedHighPressureOpponentWinRate', { nullable: true }),
    directionBalancedHighPressureOpponentOpponentWinRate: t.exposeFloat('directionBalancedHighPressureOpponentOpponentWinRate', { nullable: true }),
  }),
});

builder.objectType(PressureSensitivityModelRef, {
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    label: t.exposeString('label'),
    providerName: t.exposeString('providerName'),
    pressureResponseSummary: t.expose('pressureResponseSummary', {
      type: PressureResponseSummaryRef,
    }),
    valuePairs: t.expose('valuePairs', { type: [PressureSensitivityValuePairRef] }),
    unscoredCount: t.exposeInt('unscoredCount'),
  }),
});

builder.objectType(InsufficientPressureSensitivityModelRef, {
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    label: t.exposeString('label'),
    providerName: t.exposeString('providerName'),
    reason: t.exposeString('reason'),
  }),
});

builder.objectType(ExcludedDefinitionRef, {
  fields: (t) => ({
    definitionId: t.exposeString('definitionId'),
    name: t.exposeString('name'),
    reason: t.exposeString('reason'),
  }),
});

builder.objectType(DirectionalSanityCheckEntryRef, {
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    pairKey: t.exposeString('pairKey'),
    pressureResponse: t.exposeFloat('pressureResponse'),
    classification: t.exposeString('classification'),
  }),
});

builder.objectType(DirectionalSanityCheckRef, {
  fields: (t) => ({
    positivePct: t.exposeFloat('positivePct'),
    flatPct: t.exposeFloat('flatPct'),
    negativePct: t.exposeFloat('negativePct'),
    measuredCount: t.exposeInt('measuredCount'),
    unmeasurableCount: t.exposeInt('unmeasurableCount'),
    breakdown: t.expose('breakdown', { type: [DirectionalSanityCheckEntryRef] }),
  }),
});

builder.objectType(PressureConditionExclusionBreakdownRef, {
  fields: (t) => ({
    sourceRunMapping: t.exposeInt('sourceRunMapping'),
    definitionMetadata: t.exposeInt('definitionMetadata'),
    missingScenario: t.exposeInt('missingScenario'),
    invalidMetadata: t.exposeInt('invalidMetadata'),
    levelAssignment: t.exposeInt('levelAssignment'),
  }),
});

builder.objectType(PressureSensitivityResultRef, {
  fields: (t) => ({
    models: t.expose('models', { type: [PressureSensitivityModelRef] }),
    insufficient: t.expose('insufficient', { type: [InsufficientPressureSensitivityModelRef] }),
    excludedDefinitions: t.expose('excludedDefinitions', { type: [ExcludedDefinitionRef] }),
    pressureConditionExcludedCount: t.exposeInt('pressureConditionExcludedCount'),
    pressureConditionExclusionBreakdown: t.expose('pressureConditionExclusionBreakdown', {
      type: PressureConditionExclusionBreakdownRef,
    }),
    directionalSanityCheck: t.expose('directionalSanityCheck', { type: DirectionalSanityCheckRef }),
    transcriptCapHit: t.exposeBoolean('transcriptCapHit'),
  }),
});

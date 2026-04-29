import { builder } from '../builder.js';

export type SensitivityCellShape = {
  ownLevel: number;
  opponentLevel: number;
  n: number;
  successes: number;
  unscoredCount: number;
  winRate: number | null;
  conviction: number | null;
  netScore: number | null;
  lowData: boolean;
};

export type WinRateDeltaShape = {
  value: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  lowBandMean: number | null;
  highBandMean: number | null;
  reason: 'low-band-thin' | 'high-band-thin' | 'both-bands-thin' | null;
};

export type WinRateDeltaSummaryShape = {
  mean: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  lowBandMean: number | null;
  highBandMean: number | null;
  pairsMeasured: number;
  pairsPositive: number;
};

export type PressureSensitivityValuePairShape = {
  pairKey: string;
  ownToken: string;
  opponentToken: string;
  winRateDelta: WinRateDeltaShape;
  qualifyingTrials: number;
  n: number;
  unscoredCount: number;
  grid: SensitivityCellShape[];
  definitionsMeasured: number;
  definitionsExcluded: number;
};

export type PressureSensitivityModelShape = {
  modelId: string;
  label: string;
  providerName: string;
  winRateDeltaSummary: WinRateDeltaSummaryShape;
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
  winRateDelta: number;
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
  excludedScenariosCount: number;
  directionalSanityCheck: DirectionalSanityCheckShape;
  transcriptCapHit: boolean;
};

const SensitivityCellRef = builder.objectRef<SensitivityCellShape>('SensitivityCell');
const WinRateDeltaRef = builder.objectRef<WinRateDeltaShape>('WinRateDelta');
const WinRateDeltaSummaryRef = builder.objectRef<WinRateDeltaSummaryShape>('WinRateDeltaSummary');
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

export const PressureSensitivityResultRef = builder.objectRef<PressureSensitivityResultShape>(
  'PressureSensitivityResult',
);

builder.objectType(SensitivityCellRef, {
  fields: (t) => ({
    ownLevel: t.exposeInt('ownLevel'),
    opponentLevel: t.exposeInt('opponentLevel'),
    n: t.exposeInt('n'),
    successes: t.exposeInt('successes'),
    unscoredCount: t.exposeInt('unscoredCount'),
    winRate: t.exposeFloat('winRate', { nullable: true }),
    conviction: t.exposeFloat('conviction', { nullable: true }),
    netScore: t.exposeFloat('netScore', { nullable: true }),
    lowData: t.exposeBoolean('lowData'),
  }),
});

builder.objectType(WinRateDeltaRef, {
  fields: (t) => ({
    value: t.exposeFloat('value', { nullable: true }),
    ciLow: t.exposeFloat('ciLow', { nullable: true }),
    ciHigh: t.exposeFloat('ciHigh', { nullable: true }),
    lowBandMean: t.exposeFloat('lowBandMean', { nullable: true }),
    highBandMean: t.exposeFloat('highBandMean', { nullable: true }),
    reason: t.exposeString('reason', { nullable: true }),
  }),
});

builder.objectType(WinRateDeltaSummaryRef, {
  fields: (t) => ({
    mean: t.exposeFloat('mean', { nullable: true }),
    ciLow: t.exposeFloat('ciLow', { nullable: true }),
    ciHigh: t.exposeFloat('ciHigh', { nullable: true }),
    lowBandMean: t.exposeFloat('lowBandMean', { nullable: true }),
    highBandMean: t.exposeFloat('highBandMean', { nullable: true }),
    pairsMeasured: t.exposeInt('pairsMeasured'),
    pairsPositive: t.exposeInt('pairsPositive'),
  }),
});

builder.objectType(PressureSensitivityValuePairRef, {
  fields: (t) => ({
    pairKey: t.exposeString('pairKey'),
    ownToken: t.exposeString('ownToken'),
    opponentToken: t.exposeString('opponentToken'),
    winRateDelta: t.expose('winRateDelta', { type: WinRateDeltaRef }),
    qualifyingTrials: t.exposeInt('qualifyingTrials'),
    n: t.exposeInt('n'),
    unscoredCount: t.exposeInt('unscoredCount'),
    grid: t.expose('grid', { type: [SensitivityCellRef] }),
    definitionsMeasured: t.exposeInt('definitionsMeasured'),
    definitionsExcluded: t.exposeInt('definitionsExcluded'),
  }),
});

builder.objectType(PressureSensitivityModelRef, {
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    label: t.exposeString('label'),
    providerName: t.exposeString('providerName'),
    winRateDeltaSummary: t.expose('winRateDeltaSummary', { type: WinRateDeltaSummaryRef }),
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
    winRateDelta: t.exposeFloat('winRateDelta'),
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

builder.objectType(PressureSensitivityResultRef, {
  fields: (t) => ({
    models: t.expose('models', { type: [PressureSensitivityModelRef] }),
    insufficient: t.expose('insufficient', { type: [InsufficientPressureSensitivityModelRef] }),
    excludedDefinitions: t.expose('excludedDefinitions', { type: [ExcludedDefinitionRef] }),
    excludedScenariosCount: t.exposeInt('excludedScenariosCount'),
    directionalSanityCheck: t.expose('directionalSanityCheck', { type: DirectionalSanityCheckRef }),
    transcriptCapHit: t.exposeBoolean('transcriptCapHit'),
  }),
});

import { builder } from '../builder.js';
import type { ValueKey } from '@valuerank/shared/schwartz';

export type CircumplexPerValueShape = {
  valueKey: ValueKey;
  trials: number;
};

export type CircumplexMdsCoordShape = {
  valueKey: ValueKey;
  x: number;
  y: number;
  theoreticalAngleDeg: number;
};

export type CircumplexResultShape = {
  modelId: string;
  modelLabel: string;
  providerName: string;
  signature: string;
  valueOrder: ValueKey[];
  profileCorrelationMatrix: Array<Array<number | null>>;
  pairTrialCounts: number[][];
  excludedValues: ValueKey[];
  spearmanRho: number | null;
  spearmanP: number | null;
  verdictBand: 'clear' | 'partial' | 'not_evident' | 'insufficient_data';
  mds2d: CircumplexMdsCoordShape[];
  mdsStress: number;
  mdsWarning: string | null;
  trialsPerValue: CircumplexPerValueShape[];
};

export type CircumplexInsufficientModelShape = {
  modelId: string;
  modelLabel: string;
  providerName: string;
  reason: 'no_transcripts_for_signature' | 'missing_values' | 'below_threshold';
  trialsPerValue: CircumplexPerValueShape[];
};

export type CircumplexAnalysisResultShape = {
  signature: string;
  models: CircumplexResultShape[];
  insufficient: CircumplexInsufficientModelShape[];
  eligibilityThreshold: number;
};

export type AvailableSignatureShape = {
  signature: string;
  mostRecentRunAt: Date | null;
};

const CircumplexPerValueRef = builder.objectRef<CircumplexPerValueShape>('CircumplexPerValue');
const CircumplexMdsCoordRef = builder.objectRef<CircumplexMdsCoordShape>('CircumplexMdsCoord');
const CircumplexResultRef = builder.objectRef<CircumplexResultShape>('CircumplexResult');
const CircumplexInsufficientModelRef = builder.objectRef<CircumplexInsufficientModelShape>('CircumplexInsufficientModel');
export const CircumplexAnalysisResultRef = builder.objectRef<CircumplexAnalysisResultShape>('CircumplexAnalysisResult');
export const AvailableSignatureRef = builder.objectRef<AvailableSignatureShape>('AvailableSignature');

builder.objectType(CircumplexPerValueRef, {
  fields: (t) => ({
    valueKey: t.exposeString('valueKey'),
    trials: t.exposeInt('trials'),
  }),
});

builder.objectType(CircumplexMdsCoordRef, {
  fields: (t) => ({
    valueKey: t.exposeString('valueKey'),
    x: t.exposeFloat('x'),
    y: t.exposeFloat('y'),
    theoreticalAngleDeg: t.exposeFloat('theoreticalAngleDeg'),
  }),
});

builder.objectType(CircumplexResultRef, {
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    modelLabel: t.exposeString('modelLabel'),
    providerName: t.exposeString('providerName'),
    signature: t.exposeString('signature'),
    valueOrder: t.exposeStringList('valueOrder'),
    profileCorrelationMatrix: t.field({
      type: [t.listRef('Float', { nullable: true })],
      resolve: (parent) => parent.profileCorrelationMatrix,
    }),
    pairTrialCounts: t.field({
      type: [t.listRef('Int')],
      resolve: (parent) => parent.pairTrialCounts,
    }),
    excludedValues: t.exposeStringList('excludedValues'),
    spearmanRho: t.exposeFloat('spearmanRho', { nullable: true }),
    spearmanP: t.exposeFloat('spearmanP', { nullable: true }),
    verdictBand: t.exposeString('verdictBand'),
    mds2d: t.expose('mds2d', { type: [CircumplexMdsCoordRef] }),
    mdsStress: t.exposeFloat('mdsStress'),
    mdsWarning: t.exposeString('mdsWarning', { nullable: true }),
    trialsPerValue: t.expose('trialsPerValue', { type: [CircumplexPerValueRef] }),
  }),
});

builder.objectType(CircumplexInsufficientModelRef, {
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    modelLabel: t.exposeString('modelLabel'),
    providerName: t.exposeString('providerName'),
    reason: t.exposeString('reason'),
    trialsPerValue: t.expose('trialsPerValue', { type: [CircumplexPerValueRef] }),
  }),
});

builder.objectType(CircumplexAnalysisResultRef, {
  fields: (t) => ({
    signature: t.exposeString('signature'),
    models: t.expose('models', { type: [CircumplexResultRef] }),
    insufficient: t.expose('insufficient', { type: [CircumplexInsufficientModelRef] }),
    eligibilityThreshold: t.exposeInt('eligibilityThreshold'),
  }),
});

builder.objectType(AvailableSignatureRef, {
  fields: (t) => ({
    signature: t.exposeString('signature'),
    mostRecentRunAt: t.expose('mostRecentRunAt', { type: 'DateTime', nullable: true }),
  }),
});

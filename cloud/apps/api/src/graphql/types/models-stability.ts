import { builder } from '../builder.js';

export type ModelsStabilitySkippedVignetteShape = {
  definitionId: string;
  vignetteName: string;
  reason: string;
};

export type ModelsStabilityVignetteResultShape = {
  definitionId: string;
  vignetteName: string;
  classifiedConditionCount: number;
  stableShare: number;
  softLeanShare: number;
  tornShare: number;
  unstableShare: number;
  avgDirectionalAgreement: number | null;
  avgExactAgreement: number | null;
};

export type ModelsStabilityModelResultShape = {
  modelId: string;
  label: string;
  qualifyingVignetteCount: number;
  avgDirectionalAgreement: number | null;
  avgExactAgreement: number | null;
  stableShare: number | null;
  softLeanShare: number | null;
  tornShare: number | null;
  unstableShare: number | null;
  vignettes: ModelsStabilityVignetteResultShape[];
};

export type ModelsStabilityResultShape = {
  models: ModelsStabilityModelResultShape[];
  skippedVignettes: ModelsStabilitySkippedVignetteShape[];
};

const ModelsStabilitySkippedVignetteRef = builder.objectRef<ModelsStabilitySkippedVignetteShape>('ModelsStabilitySkippedVignette');
const ModelsStabilityVignetteResultRef = builder.objectRef<ModelsStabilityVignetteResultShape>('ModelsStabilityVignetteResult');
const ModelsStabilityModelResultRef = builder.objectRef<ModelsStabilityModelResultShape>('ModelsStabilityModelResult');
export const ModelsStabilityResultRef = builder.objectRef<ModelsStabilityResultShape>('ModelsStabilityResult');

builder.objectType(ModelsStabilitySkippedVignetteRef, {
  fields: (t) => ({
    definitionId: t.exposeString('definitionId'),
    vignetteName: t.exposeString('vignetteName'),
    reason: t.exposeString('reason'),
  }),
});

builder.objectType(ModelsStabilityVignetteResultRef, {
  fields: (t) => ({
    definitionId: t.exposeString('definitionId'),
    vignetteName: t.exposeString('vignetteName'),
    classifiedConditionCount: t.exposeInt('classifiedConditionCount'),
    stableShare: t.exposeFloat('stableShare'),
    softLeanShare: t.exposeFloat('softLeanShare'),
    tornShare: t.exposeFloat('tornShare'),
    unstableShare: t.exposeFloat('unstableShare'),
    avgDirectionalAgreement: t.exposeFloat('avgDirectionalAgreement', { nullable: true }),
    avgExactAgreement: t.exposeFloat('avgExactAgreement', { nullable: true }),
  }),
});

builder.objectType(ModelsStabilityModelResultRef, {
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    label: t.exposeString('label'),
    qualifyingVignetteCount: t.exposeInt('qualifyingVignetteCount'),
    avgDirectionalAgreement: t.exposeFloat('avgDirectionalAgreement', { nullable: true }),
    avgExactAgreement: t.exposeFloat('avgExactAgreement', { nullable: true }),
    stableShare: t.exposeFloat('stableShare', { nullable: true }),
    softLeanShare: t.exposeFloat('softLeanShare', { nullable: true }),
    tornShare: t.exposeFloat('tornShare', { nullable: true }),
    unstableShare: t.exposeFloat('unstableShare', { nullable: true }),
    vignettes: t.expose('vignettes', { type: [ModelsStabilityVignetteResultRef] }),
  }),
});

builder.objectType(ModelsStabilityResultRef, {
  fields: (t) => ({
    models: t.expose('models', { type: [ModelsStabilityModelResultRef] }),
    skippedVignettes: t.expose('skippedVignettes', { type: [ModelsStabilitySkippedVignetteRef] }),
  }),
});

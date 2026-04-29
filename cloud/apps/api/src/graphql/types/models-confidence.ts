import { builder } from '../builder.js';

export type ModelsConfidenceValueResultShape = {
  valueKey: string;
  confidence: number | null;
  strongCount: number;
  leanCount: number;
};

export type ModelsConfidenceModelResultShape = {
  modelId: string;
  label: string;
  overallConfidence: number | null;
  overallStrongCount: number;
  overallLeanCount: number;
  values: ModelsConfidenceValueResultShape[];
};

export type ModelsConfidenceResultShape = {
  models: ModelsConfidenceModelResultShape[];
};

const ModelsConfidenceValueResultRef =
  builder.objectRef<ModelsConfidenceValueResultShape>('ModelsConfidenceValueResult');

const ModelsConfidenceModelResultRef =
  builder.objectRef<ModelsConfidenceModelResultShape>('ModelsConfidenceModelResult');

export const ModelsConfidenceResultRef =
  builder.objectRef<ModelsConfidenceResultShape>('ModelsConfidenceResult');

builder.objectType(ModelsConfidenceValueResultRef, {
  description: 'Confidence stats for a model/value pair',
  fields: (t) => ({
    valueKey: t.exposeString('valueKey'),
    confidence: t.field({
      type: 'Float',
      nullable: true,
      resolve: (v) => v.confidence,
    }),
    strongCount: t.exposeInt('strongCount'),
    leanCount: t.exposeInt('leanCount'),
  }),
});

builder.objectType(ModelsConfidenceModelResultRef, {
  description: 'Confidence stats for a model across all values',
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    label: t.exposeString('label'),
    overallConfidence: t.field({
      type: 'Float',
      nullable: true,
      resolve: (m) => m.overallConfidence,
    }),
    overallStrongCount: t.exposeInt('overallStrongCount'),
    overallLeanCount: t.exposeInt('overallLeanCount'),
    values: t.expose('values', {
      type: [ModelsConfidenceValueResultRef],
    }),
  }),
});

builder.objectType(ModelsConfidenceResultRef, {
  description: 'Cross-model confidence heatmap: strong% per model per value',
  fields: (t) => ({
    models: t.expose('models', {
      type: [ModelsConfidenceModelResultRef],
    }),
  }),
});

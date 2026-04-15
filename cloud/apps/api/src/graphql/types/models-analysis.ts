import { builder } from '../builder.js';

export type ModelsAnalysisDomainBreakdownShape = {
  domainId: string;
  domainName: string;
  evidenceWeight: number;
  winRate: number;
};

export type ModelsAnalysisValueResultShape = {
  valueKey: string;
  pooledWinRate: number | null;
  stabilityScore: number | null;
  eligibleDomainCount: number;
  domains: ModelsAnalysisDomainBreakdownShape[];
};

export type ModelsAnalysisModelResultShape = {
  label: string;
  modelId: string;
  values: ModelsAnalysisValueResultShape[];
};

export type ModelsAnalysisResultShape = {
  models: ModelsAnalysisModelResultShape[];
};

const ModelsAnalysisDomainBreakdownRef =
  builder.objectRef<ModelsAnalysisDomainBreakdownShape>('ModelsAnalysisDomainBreakdown');

const ModelsAnalysisValueResultRef =
  builder.objectRef<ModelsAnalysisValueResultShape>('ModelsAnalysisValueResult');

const ModelsAnalysisModelResultRef =
  builder.objectRef<ModelsAnalysisModelResultShape>('ModelsAnalysisModelResult');

export const ModelsAnalysisResultRef =
  builder.objectRef<ModelsAnalysisResultShape>('ModelsAnalysisResult');

builder.objectType(ModelsAnalysisDomainBreakdownRef, {
  description: 'A domain-level contribution for a model/value pair',
  fields: (t) => ({
    domainId: t.exposeString('domainId'),
    domainName: t.exposeString('domainName'),
    evidenceWeight: t.exposeInt('evidenceWeight'),
    winRate: t.exposeFloat('winRate'),
  }),
});

builder.objectType(ModelsAnalysisValueResultRef, {
  description: 'A model/value summary across eligible domains',
  fields: (t) => ({
    valueKey: t.exposeString('valueKey'),
    pooledWinRate: t.field({
      type: 'Float',
      nullable: true,
      resolve: (value) => value.pooledWinRate,
    }),
    stabilityScore: t.field({
      type: 'Float',
      nullable: true,
      resolve: (value) => value.stabilityScore,
    }),
    eligibleDomainCount: t.exposeInt('eligibleDomainCount'),
    domains: t.expose('domains', {
      type: [ModelsAnalysisDomainBreakdownRef],
    }),
  }),
});

builder.objectType(ModelsAnalysisModelResultRef, {
  description: 'A model row in the models analysis matrix',
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    label: t.exposeString('label'),
    values: t.expose('values', {
      type: [ModelsAnalysisValueResultRef],
    }),
  }),
});

builder.objectType(ModelsAnalysisResultRef, {
  description: 'Cross-domain model analysis matrix results',
  fields: (t) => ({
    models: t.expose('models', {
      type: [ModelsAnalysisModelResultRef],
    }),
  }),
});

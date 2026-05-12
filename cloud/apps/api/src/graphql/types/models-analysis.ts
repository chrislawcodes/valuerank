import { builder } from '../builder.js';

export type ModelsAnalysisDomainBreakdownShape = {
  domainId: string;
  domainName: string;
  /** Vignette count from v1.2.0+ snapshots. Null for older snapshots that predate this field. */
  evidenceWeight: number | null;
  winRate: number;
  winRateExcNeutral: number | null;
};

export type ModelsAnalysisValueResultShape = {
  valueKey: string;
  pooledWinRate: number | null;
  pooledWinRateExcNeutral: number | null;
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
    evidenceWeight: t.exposeInt('evidenceWeight', { nullable: true }),
    winRate: t.exposeFloat('winRate'),
    winRateExcNeutral: t.field({
      type: 'Float',
      nullable: true,
      resolve: (d) => d.winRateExcNeutral,
    }),
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
    pooledWinRateExcNeutral: t.field({
      type: 'Float',
      nullable: true,
      resolve: (value) => value.pooledWinRateExcNeutral,
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

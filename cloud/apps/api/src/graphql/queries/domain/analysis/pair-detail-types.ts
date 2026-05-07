import { builder } from '../../../builder.js';

export type DomainAnalysisPairFramingDirection = 'A_TO_B' | 'B_TO_A';

export type DomainAnalysisPairVignetteDetail = {
  definitionId: string;
  definitionName: string;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalTrials: number;
  selectedValueWinRate: number | null;
  winRateCI95Low: number | null;
  winRateCI95High: number | null;
  refusalRate: number | null;
  framingDirection: DomainAnalysisPairFramingDirection;
};

export type DomainAnalysisPairDetailResult = {
  rowValueKey: string;
  columnValueKey: string;
  modelId: string;
  modelLabel: string;
  domainId: string | null;
  domainName: string | null;
  vignettes: DomainAnalysisPairVignetteDetail[];
  pooledMin: number | null;
  pooledMean: number | null;
  pooledMax: number | null;
  pooledStdDev: number | null;
  vignetteCount: number;
  validEstimateCount: number;
};

export class PooledMeanDivergenceError extends Error {
  readonly code = 'POOLED_MEAN_DIVERGENCE';

  constructor(
    public readonly drawerMean: number,
    public readonly matrixMean: number,
    public readonly tolerance: number,
  ) {
    super(
      `Drawer pooledMean (${drawerMean}) diverges from matrix cell value (${matrixMean}) by more than ${tolerance}. This indicates a data-consistency bug between the new pair-detail resolver and the existing matrix aggregation.`,
    );
    this.name = 'PooledMeanDivergenceError';
  }
}

export const DomainAnalysisPairFramingDirectionEnum: ReturnType<
  typeof builder.enumType<'DomainAnalysisPairFramingDirection', readonly ['A_TO_B', 'B_TO_A']>
> = builder.enumType('DomainAnalysisPairFramingDirection', {
  values: ['A_TO_B', 'B_TO_A'] as const,
  description: 'Whether the vignette presents the queried pair in the requested order or reversed.',
});

export const DomainAnalysisPairVignetteDetailRef = builder.objectRef<DomainAnalysisPairVignetteDetail>('DomainAnalysisPairVignetteDetail');
export const DomainAnalysisPairDetailResultRef = builder.objectRef<DomainAnalysisPairDetailResult>('DomainAnalysisPairDetailResult');

builder.objectType(DomainAnalysisPairVignetteDetailRef, {
  fields: (t) => ({
    definitionId: t.exposeID('definitionId'),
    definitionName: t.exposeString('definitionName'),
    prioritized: t.exposeInt('prioritized'),
    deprioritized: t.exposeInt('deprioritized'),
    neutral: t.exposeInt('neutral'),
    totalTrials: t.exposeInt('totalTrials'),
    selectedValueWinRate: t.exposeFloat('selectedValueWinRate', { nullable: true }),
    winRateCI95Low: t.exposeFloat('winRateCI95Low', { nullable: true }),
    winRateCI95High: t.exposeFloat('winRateCI95High', { nullable: true }),
    refusalRate: t.exposeFloat('refusalRate', { nullable: true }),
    framingDirection: t.field({
      type: DomainAnalysisPairFramingDirectionEnum,
      resolve: (parent) => parent.framingDirection,
    }),
  }),
});

builder.objectType(DomainAnalysisPairDetailResultRef, {
  fields: (t) => ({
    rowValueKey: t.exposeString('rowValueKey'),
    columnValueKey: t.exposeString('columnValueKey'),
    modelId: t.exposeString('modelId'),
    modelLabel: t.exposeString('modelLabel'),
    domainId: t.exposeID('domainId', { nullable: true }),
    domainName: t.exposeString('domainName', { nullable: true }),
    vignettes: t.field({
      type: [DomainAnalysisPairVignetteDetailRef],
      resolve: (parent) => parent.vignettes,
    }),
    pooledMin: t.exposeFloat('pooledMin', { nullable: true }),
    pooledMean: t.exposeFloat('pooledMean', { nullable: true }),
    pooledMax: t.exposeFloat('pooledMax', { nullable: true }),
    pooledStdDev: t.exposeFloat('pooledStdDev', { nullable: true }),
    vignetteCount: t.exposeInt('vignetteCount'),
    validEstimateCount: t.exposeInt('validEstimateCount'),
  }),
});

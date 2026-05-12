import { builder } from '../../builder.js';
import {
  type RankingShape,
  type RankingShapeBenchmarks,
} from '../domain-shape.js';
import {
  type ClusterAnalysis,
  type DomainCluster,
  type ClusterMember,
  type ValueFaultLine,
  type ClusterPairFaultLines,
  type DendrogramMerge,
} from '../domain-clustering.js';
import type {
  DomainAnalysisMissingDefinition,
  DomainAnalysisUnavailableModel,
  DomainAnalysisValueScore,
  DomainAvailableSignature,
  DomainTrialModelStatus,
  DomainTrialPlanCellEstimate,
  DomainTrialPlanModel,
  DomainTrialPlanResult,
  DomainTrialPlanVignette,
  DomainEvaluationCostEstimate,
  DomainEvaluationEstimateDefinition,
  DomainEvaluationEstimateModel,
  DomainTrialRunStatus,
} from './shared.js';
import type {
  DomainAnalysisContributionSummary,
  DomainAnalysisExcludedDataSummary,
} from '../../../services/analysis/domain-analysis-cache-types.js';

export {
  DomainAnalysisConditionDetailRef,
  DomainAnalysisVignetteDetailRef,
  DomainAnalysisConditionTranscriptRef,
  DomainAnalysisValueDetailResultRef,
} from './types-detail.js';

export type KappaPair = {
  modelAId: string;
  modelBId: string;
  kappa: number | null;
};

export type KappaClusterPayload = {
  clusterAnalysis: ClusterAnalysis;
  kappaPairs: KappaPair[];
};

export type PairwiseWinRateModel = {
  valueOrder: string[];
  winRateMatrix: Array<Array<number | null>>;
  winRateExcNeutralMatrix: Array<Array<number | null>>;
  trialCountMatrix: number[][];
};

export type DomainAnalysisModel = {
  model: string;
  label: string;
  values: DomainAnalysisValueScore[];
  rankingShape: RankingShape;
  pairwiseWinRateModel: PairwiseWinRateModel | null;
};

export type DomainAnalysisCacheStatus = 'FRESH' | 'UPDATING' | 'OUT_OF_DATE';

export type DomainAnalysisRefreshProgress = {
  completedRuns: number;
  totalRuns: number;
};

export type DomainAnalysisResult = {
  domainId: string;
  domainName: string;
  contributionSummary: DomainAnalysisContributionSummary[];
  excludedDataSummary: DomainAnalysisExcludedDataSummary[];
  totalDefinitions: number;
  targetedDefinitions: number;
  coveredDefinitions: number;
  missingDefinitionIds: string[];
  missingDefinitions: DomainAnalysisMissingDefinition[];
  definitionsWithAnalysis: number;
  models: DomainAnalysisModel[];
  unavailableModels: DomainAnalysisUnavailableModel[];
  generatedAt: Date;
  cacheStatus: DomainAnalysisCacheStatus;
  rankingShapeBenchmarks: RankingShapeBenchmarks;
  clusterAnalysis: ClusterAnalysis;
  clusterAnalysisByMethod: Record<string, ClusterAnalysis>;
  refreshProgress: DomainAnalysisRefreshProgress | null;
};

export const DomainAnalysisRefreshProgressRef = builder.objectRef<DomainAnalysisRefreshProgress>('DomainAnalysisRefreshProgress');
export const RankingShapeRef = builder.objectRef<RankingShape>('RankingShape');
export const RankingShapeBenchmarksRef = builder.objectRef<RankingShapeBenchmarks>('RankingShapeBenchmarks');
export const ClusterMemberRef = builder.objectRef<ClusterMember>('ClusterMember');
export const DomainClusterRef = builder.objectRef<DomainCluster>('DomainCluster');
export const ValueFaultLineRef = builder.objectRef<ValueFaultLine>('ValueFaultLine');
export const ClusterPairFaultLinesRef = builder.objectRef<ClusterPairFaultLines>('ClusterPairFaultLines');
export const ClusterAnalysisRef = builder.objectRef<ClusterAnalysis>('ClusterAnalysis');
export const DendrogramMergeRef = builder.objectRef<DendrogramMerge>('DendrogramMerge');
export const KappaPairRef = builder.objectRef<KappaPair>('KappaPair');
export const KappaClusterPayloadRef = builder.objectRef<KappaClusterPayload>('KappaClusterPayload');
export const DomainAnalysisValueScoreRef = builder.objectRef<DomainAnalysisValueScore>('DomainAnalysisValueScore');
export const PairwiseWinRateModelRef = builder.objectRef<PairwiseWinRateModel>('PairwiseWinRateModel');
export const DomainAnalysisModelRef = builder.objectRef<DomainAnalysisModel>('DomainAnalysisModel');
export const DomainAnalysisUnavailableModelRef = builder.objectRef<DomainAnalysisUnavailableModel>('DomainAnalysisUnavailableModel');
export const DomainAnalysisMissingDefinitionRef = builder.objectRef<DomainAnalysisMissingDefinition>('DomainAnalysisMissingDefinition');
export const DomainAnalysisContributionSummaryRef = builder.objectRef<DomainAnalysisContributionSummary>('DomainAnalysisContributionSummary');
export const DomainAnalysisExcludedDataSummaryRef = builder.objectRef<DomainAnalysisExcludedDataSummary>('DomainAnalysisExcludedDataSummary');
export const DomainAnalysisResultRef = builder.objectRef<DomainAnalysisResult>('DomainAnalysisResult');
export const DomainAvailableSignatureRef = builder.objectRef<DomainAvailableSignature>('DomainAvailableSignature');
export const DomainTrialPlanModelRef = builder.objectRef<DomainTrialPlanModel>('DomainTrialPlanModel');
export const DomainTrialPlanVignetteRef = builder.objectRef<DomainTrialPlanVignette>('DomainTrialPlanVignette');
export const DomainTrialPlanCellEstimateRef = builder.objectRef<DomainTrialPlanCellEstimate>('DomainTrialPlanCellEstimate');
export const DomainTrialPlanResultRef = builder.objectRef<DomainTrialPlanResult>('DomainTrialPlanResult');
export const DomainEvaluationEstimateModelRef = builder.objectRef<DomainEvaluationEstimateModel>('DomainEvaluationEstimateModel');
export const DomainEvaluationEstimateDefinitionRef = builder.objectRef<DomainEvaluationEstimateDefinition>('DomainEvaluationEstimateDefinition');
export const DomainEvaluationCostEstimateRef = builder.objectRef<DomainEvaluationCostEstimate>('DomainEvaluationCostEstimate');
export const DomainTrialModelStatusRef = builder.objectRef<DomainTrialModelStatus>('DomainTrialModelStatus');
export const DomainTrialRunStatusRef = builder.objectRef<DomainTrialRunStatus>('DomainTrialRunStatus');
const resolveContributionSummary = (parent: DomainAnalysisResult): DomainAnalysisContributionSummary[] => parent.contributionSummary;
const resolveExcludedDataSummary = (parent: DomainAnalysisResult): DomainAnalysisExcludedDataSummary[] => parent.excludedDataSummary;

builder.objectType(RankingShapeRef, {
  fields: (t) => ({
    topStructure: t.exposeString('topStructure'),
    bottomStructure: t.exposeString('bottomStructure'),
    topGap: t.exposeFloat('topGap'),
    bottomGap: t.exposeFloat('bottomGap'),
    spread: t.exposeFloat('spread'),
    steepness: t.exposeFloat('steepness'),
    dominanceZScore: t.exposeFloat('dominanceZScore', { nullable: true }),
  }),
});

builder.objectType(RankingShapeBenchmarksRef, {
  fields: (t) => ({
    domainMeanTopGap: t.exposeFloat('domainMeanTopGap'),
    domainStdTopGap: t.exposeFloat('domainStdTopGap', { nullable: true }),
    medianSpread: t.exposeFloat('medianSpread'),
  }),
});

builder.objectType(ClusterMemberRef, {
  fields: (t) => ({
    model: t.exposeString('model'),
    label: t.exposeString('label'),
    silhouetteScore: t.exposeFloat('silhouetteScore'),
    isOutlier: t.exposeBoolean('isOutlier'),
    nearestClusterIds: t.exposeStringList('nearestClusterIds', { nullable: true }),
    distancesToNearestClusters: t.exposeFloatList('distancesToNearestClusters', { nullable: true }),
  }),
});

builder.objectType(DomainClusterRef, {
  fields: (t) => ({
    id: t.exposeString('id'),
    name: t.exposeString('name'),
    members: t.field({
      type: [ClusterMemberRef],
      resolve: (parent) => parent.members,
    }),
    centroid: t.expose('centroid', { type: 'JSON' }),
    definingValues: t.exposeStringList('definingValues'),
  }),
});

builder.objectType(ValueFaultLineRef, {
  fields: (t) => ({
    valueKey: t.exposeString('valueKey'),
    clusterAId: t.exposeString('clusterAId'),
    clusterBId: t.exposeString('clusterBId'),
    clusterAScore: t.exposeFloat('clusterAScore'),
    clusterBScore: t.exposeFloat('clusterBScore'),
    delta: t.exposeFloat('delta'),
    absDelta: t.exposeFloat('absDelta'),
  }),
});

builder.objectType(ClusterPairFaultLinesRef, {
  fields: (t) => ({
    clusterAId: t.exposeString('clusterAId'),
    clusterBId: t.exposeString('clusterBId'),
    distance: t.exposeFloat('distance'),
    faultLines: t.field({
      type: [ValueFaultLineRef],
      resolve: (parent) => parent.faultLines,
    }),
  }),
});

builder.objectType(ClusterAnalysisRef, {
  fields: (t) => ({
    clusters: t.field({
      type: [DomainClusterRef],
      resolve: (parent) => parent.clusters,
    }),
    faultLinesByPair: t.expose('faultLinesByPair', { type: 'JSON' }),
    defaultPair: t.exposeStringList('defaultPair', { nullable: true }),
    skipped: t.exposeBoolean('skipped'),
    skipReason: t.exposeString('skipReason', { nullable: true }),
    dendrogram: t.field({
      type: [DendrogramMergeRef],
      nullable: true,
      resolve: (parent) => parent.dendrogram ?? null,
    }),
    leafOrder: t.exposeStringList('leafOrder', { nullable: true }),
    clusterIdByModelId: t.expose('clusterIdByModelId', { type: 'JSON', nullable: true }),
  }),
});

builder.objectType(DendrogramMergeRef, {
  fields: (t) => ({
    leftMemberIds: t.exposeStringList('leftMemberIds'),
    rightMemberIds: t.exposeStringList('rightMemberIds'),
    height: t.exposeFloat('height'),
  }),
});

builder.objectType(KappaPairRef, {
  fields: (t) => ({
    modelAId: t.exposeString('modelAId'),
    modelBId: t.exposeString('modelBId'),
    kappa: t.exposeFloat('kappa', { nullable: true }),
  }),
});

builder.objectType(KappaClusterPayloadRef, {
  fields: (t) => ({
    clusterAnalysis: t.field({
      type: ClusterAnalysisRef,
      resolve: (parent) => parent.clusterAnalysis,
    }),
    kappaPairs: t.field({
      type: [KappaPairRef],
      resolve: (parent) => parent.kappaPairs,
    }),
  }),
});

builder.objectType(DomainAnalysisValueScoreRef, {
  fields: (t) => ({
    valueKey: t.exposeString('valueKey'),
    score: t.exposeFloat('score'),
    prioritized: t.exposeFloat('prioritized'),
    deprioritized: t.exposeFloat('deprioritized'),
    neutral: t.exposeFloat('neutral'),
    totalComparisons: t.exposeFloat('totalComparisons'),
    winRateExcNeutral: t.field({
      type: 'Float',
      nullable: true,
      resolve: (parent) => parent.winRateExcNeutral,
    }),
  }),
});

builder.objectType(PairwiseWinRateModelRef, {
  fields: (t) => ({
    valueOrder: t.exposeStringList('valueOrder'),
    winRateMatrix: t.field({
      type: [t.listRef('Float', { nullable: true })],
      resolve: (parent) => parent.winRateMatrix,
    }),
    winRateExcNeutralMatrix: t.field({
      type: [t.listRef('Float', { nullable: true })],
      nullable: true,
      resolve: (parent) => parent.winRateExcNeutralMatrix,
    }),
    trialCountMatrix: t.field({
      type: [t.listRef('Int')],
      resolve: (parent) => parent.trialCountMatrix,
    }),
  }),
});

builder.objectType(DomainAnalysisModelRef, {
  fields: (t) => ({
    model: t.exposeString('model'),
    label: t.exposeString('label'),
    values: t.field({
      type: [DomainAnalysisValueScoreRef],
      resolve: (parent) => parent.values,
    }),
    rankingShape: t.field({
      type: RankingShapeRef,
      resolve: (parent) => parent.rankingShape,
    }),
    pairwiseWinRateModel: t.field({
      type: PairwiseWinRateModelRef,
      nullable: true,
      resolve: (parent) => parent.pairwiseWinRateModel,
    }),
  }),
});

builder.objectType(DomainAnalysisUnavailableModelRef, {
  fields: (t) => ({
    model: t.exposeString('model'),
    label: t.exposeString('label'),
    reason: t.exposeString('reason'),
  }),
});

builder.objectType(DomainAnalysisMissingDefinitionRef, {
  fields: (t) => ({
    definitionId: t.exposeID('definitionId'),
    definitionName: t.exposeString('definitionName'),
    reasonCode: t.exposeString('reasonCode'),
    reasonLabel: t.exposeString('reasonLabel'),
    missingAllModels: t.exposeBoolean('missingAllModels'),
    missingModelIds: t.exposeStringList('missingModelIds'),
    missingModelLabels: t.exposeStringList('missingModelLabels'),
  }),
});

builder.objectType(DomainAnalysisContributionSummaryRef, {
  fields: (t) => ({
    domainId: t.exposeString('domainId'),
    domainName: t.exposeString('domainName'),
    rawTrialCount: t.exposeFloat('rawTrialCount'),
    share: t.exposeFloat('share'),
  }),
});

builder.objectType(DomainAnalysisExcludedDataSummaryRef, {
  fields: (t) => ({
    domainId: t.exposeString('domainId'),
    domainName: t.exposeString('domainName'),
    reasonCode: t.exposeString('reasonCode'),
    count: t.exposeFloat('count'),
  }),
});

builder.objectType(DomainAnalysisResultRef, {
  fields: (t) => ({
    domainId: t.exposeID('domainId'),
    domainName: t.exposeString('domainName'),
    contributionSummary: t.field({
      type: [DomainAnalysisContributionSummaryRef],
      resolve: resolveContributionSummary,
    }),
    excludedDataSummary: t.field({
      type: [DomainAnalysisExcludedDataSummaryRef],
      resolve: resolveExcludedDataSummary,
    }),
    totalDefinitions: t.exposeInt('totalDefinitions'),
    targetedDefinitions: t.exposeInt('targetedDefinitions'),
    coveredDefinitions: t.exposeInt('coveredDefinitions'),
    missingDefinitionIds: t.exposeIDList('missingDefinitionIds'),
    missingDefinitions: t.field({
      type: [DomainAnalysisMissingDefinitionRef],
      resolve: (parent) => parent.missingDefinitions,
    }),
    definitionsWithAnalysis: t.exposeInt('definitionsWithAnalysis'),
    models: t.field({
      type: [DomainAnalysisModelRef],
      resolve: (parent) => parent.models,
    }),
    unavailableModels: t.field({
      type: [DomainAnalysisUnavailableModelRef],
      resolve: (parent) => parent.unavailableModels,
    }),
    cacheStatus: t.exposeString('cacheStatus'),
    generatedAt: t.field({
      type: 'DateTime',
      resolve: (parent) => parent.generatedAt,
    }),
    refreshProgress: t.field({
      type: DomainAnalysisRefreshProgressRef,
      nullable: true,
      resolve: (parent) => parent.refreshProgress,
    }),
    rankingShapeBenchmarks: t.field({
      type: RankingShapeBenchmarksRef,
      resolve: (parent) => parent.rankingShapeBenchmarks,
    }),
    clusterAnalysis: t.field({
      type: ClusterAnalysisRef,
      resolve: (parent) => parent.clusterAnalysis,
    }),
    clusterAnalysisByMethod: t.expose('clusterAnalysisByMethod', { type: 'JSON' }),
  }),
});

builder.objectType(DomainAnalysisRefreshProgressRef, {
  fields: (t) => ({
    completedRuns: t.exposeInt('completedRuns'),
    totalRuns: t.exposeInt('totalRuns'),
  }),
});

builder.objectType(DomainAvailableSignatureRef, {
  fields: (t) => ({
    signature: t.exposeString('signature'),
    label: t.exposeString('label'),
    isVirtual: t.exposeBoolean('isVirtual'),
    temperature: t.exposeFloat('temperature', { nullable: true }),
  }),
});

builder.objectType(DomainTrialPlanModelRef, {
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    label: t.exposeString('label'),
    isDefault: t.exposeBoolean('isDefault'),
    supportsTemperature: t.exposeBoolean('supportsTemperature'),
  }),
});

builder.objectType(DomainTrialPlanVignetteRef, {
  fields: (t) => ({
    definitionId: t.exposeID('definitionId'),
    definitionName: t.exposeString('definitionName'),
    definitionVersion: t.exposeInt('definitionVersion'),
    signature: t.exposeString('signature'),
    scenarioCount: t.exposeInt('scenarioCount'),
    existingBatchCount: t.exposeInt('existingBatchCount'),
  }),
});

builder.objectType(DomainTrialPlanCellEstimateRef, {
  fields: (t) => ({
    definitionId: t.exposeID('definitionId'),
    modelId: t.exposeString('modelId'),
    estimatedCost: t.exposeFloat('estimatedCost'),
  }),
});

builder.objectType(DomainTrialPlanResultRef, {
  fields: (t) => ({
    domainId: t.exposeID('domainId'),
    domainName: t.exposeString('domainName'),
    vignettes: t.field({
      type: [DomainTrialPlanVignetteRef],
      resolve: (parent) => parent.vignettes,
    }),
    models: t.field({
      type: [DomainTrialPlanModelRef],
      resolve: (parent) => parent.models,
    }),
    cellEstimates: t.field({
      type: [DomainTrialPlanCellEstimateRef],
      resolve: (parent) => parent.cellEstimates,
    }),
    totalEstimatedCost: t.exposeFloat('totalEstimatedCost'),
    existingTemperatures: t.field({
      type: ['Float'],
      resolve: (parent) => parent.existingTemperatures,
    }),
    defaultTemperature: t.exposeFloat('defaultTemperature', { nullable: true }),
    temperatureWarning: t.exposeString('temperatureWarning', { nullable: true }),
  }),
});

builder.objectType(DomainEvaluationEstimateModelRef, {
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    label: t.exposeString('label'),
    isDefault: t.exposeBoolean('isDefault'),
    supportsTemperature: t.exposeBoolean('supportsTemperature'),
    estimatedCost: t.exposeFloat('estimatedCost'),
    basedOnSampleCount: t.exposeInt('basedOnSampleCount'),
    isUsingFallback: t.exposeBoolean('isUsingFallback'),
  }),
});

builder.objectType(DomainEvaluationEstimateDefinitionRef, {
  fields: (t) => ({
    definitionId: t.exposeID('definitionId'),
    definitionName: t.exposeString('definitionName'),
    definitionVersion: t.exposeInt('definitionVersion'),
    signature: t.exposeString('signature'),
    scenarioCount: t.exposeInt('scenarioCount'),
    estimatedCost: t.exposeFloat('estimatedCost'),
    basedOnSampleCount: t.exposeInt('basedOnSampleCount'),
    isUsingFallback: t.exposeBoolean('isUsingFallback'),
  }),
});

builder.objectType(DomainEvaluationCostEstimateRef, {
  fields: (t) => ({
    domainId: t.exposeID('domainId'),
    domainName: t.exposeString('domainName'),
    scopeCategory: t.exposeString('scopeCategory'),
    targetedDefinitions: t.exposeInt('targetedDefinitions'),
    totalScenarioCount: t.exposeInt('totalScenarioCount'),
    totalEstimatedCost: t.exposeFloat('totalEstimatedCost'),
    basedOnSampleCount: t.exposeInt('basedOnSampleCount'),
    isUsingFallback: t.exposeBoolean('isUsingFallback'),
    fallbackReason: t.exposeString('fallbackReason', { nullable: true }),
    estimateConfidence: t.exposeString('estimateConfidence'),
    knownExclusions: t.exposeStringList('knownExclusions'),
    models: t.field({
      type: [DomainEvaluationEstimateModelRef],
      resolve: (parent) => parent.models,
    }),
    definitions: t.field({
      type: [DomainEvaluationEstimateDefinitionRef],
      resolve: (parent) => parent.definitions,
    }),
    existingTemperatures: t.field({
      type: ['Float'],
      resolve: (parent) => parent.existingTemperatures,
    }),
    defaultTemperature: t.exposeFloat('defaultTemperature', { nullable: true }),
    temperatureWarning: t.exposeString('temperatureWarning', { nullable: true }),
  }),
});

builder.objectType(DomainTrialModelStatusRef, {
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    generationCompleted: t.exposeInt('generationCompleted'),
    generationFailed: t.exposeInt('generationFailed'),
    generationTotal: t.exposeInt('generationTotal'),
    summarizationCompleted: t.exposeInt('summarizationCompleted'),
    summarizationFailed: t.exposeInt('summarizationFailed'),
    summarizationTotal: t.exposeInt('summarizationTotal'),
    latestErrorMessage: t.exposeString('latestErrorMessage', { nullable: true }),
  }),
});

builder.objectType(DomainTrialRunStatusRef, {
  fields: (t) => ({
    runId: t.exposeID('runId'),
    definitionId: t.exposeID('definitionId'),
    status: t.exposeString('status'),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    stalledModels: t.exposeStringList('stalledModels'),
    analysisStatus: t.exposeString('analysisStatus', { nullable: true }),
    modelStatuses: t.field({
      type: [DomainTrialModelStatusRef],
      resolve: (parent) => parent.modelStatuses,
    }),
  }),
});

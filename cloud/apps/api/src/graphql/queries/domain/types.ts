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
} from '../domain-clustering.js';
import type {
  DomainAnalysisConditionDetail,
  DomainAnalysisConditionTranscript,
  DomainAnalysisMissingDefinition,
  DomainAnalysisUnavailableModel,
  DomainAnalysisValueDetailResult,
  DomainAnalysisValueScore,
  DomainAnalysisVignetteDetail,
  DomainAvailableSignature,
  DomainTrialModelStatus,
  DomainTrialPlanCellEstimate,
  DomainTrialPlanModel,
  DomainTrialPlanResult,
  DomainTrialPlanVignette,
  DomainTrialRunStatus,
} from './shared.js';

export type DomainAnalysisModel = {
  model: string;
  label: string;
  values: DomainAnalysisValueScore[];
  rankingShape: RankingShape;
};

export type DomainAnalysisResult = {
  domainId: string;
  domainName: string;
  totalDefinitions: number;
  targetedDefinitions: number;
  coveredDefinitions: number;
  missingDefinitionIds: string[];
  missingDefinitions: DomainAnalysisMissingDefinition[];
  definitionsWithAnalysis: number;
  models: DomainAnalysisModel[];
  unavailableModels: DomainAnalysisUnavailableModel[];
  generatedAt: Date;
  rankingShapeBenchmarks: RankingShapeBenchmarks;
  clusterAnalysis: ClusterAnalysis;
};

export const RankingShapeRef = builder.objectRef<RankingShape>('RankingShape');
export const RankingShapeBenchmarksRef = builder.objectRef<RankingShapeBenchmarks>('RankingShapeBenchmarks');
export const ClusterMemberRef = builder.objectRef<ClusterMember>('ClusterMember');
export const DomainClusterRef = builder.objectRef<DomainCluster>('DomainCluster');
export const ValueFaultLineRef = builder.objectRef<ValueFaultLine>('ValueFaultLine');
export const ClusterPairFaultLinesRef = builder.objectRef<ClusterPairFaultLines>('ClusterPairFaultLines');
export const ClusterAnalysisRef = builder.objectRef<ClusterAnalysis>('ClusterAnalysis');
export const DomainAnalysisValueScoreRef = builder.objectRef<DomainAnalysisValueScore>('DomainAnalysisValueScore');
export const DomainAnalysisModelRef = builder.objectRef<DomainAnalysisModel>('DomainAnalysisModel');
export const DomainAnalysisUnavailableModelRef = builder.objectRef<DomainAnalysisUnavailableModel>('DomainAnalysisUnavailableModel');
export const DomainAnalysisMissingDefinitionRef = builder.objectRef<DomainAnalysisMissingDefinition>('DomainAnalysisMissingDefinition');
export const DomainAnalysisResultRef = builder.objectRef<DomainAnalysisResult>('DomainAnalysisResult');
export const DomainAnalysisConditionDetailRef = builder.objectRef<DomainAnalysisConditionDetail>('DomainAnalysisConditionDetail');
export const DomainAnalysisVignetteDetailRef = builder.objectRef<DomainAnalysisVignetteDetail>('DomainAnalysisVignetteDetail');
export const DomainAnalysisValueDetailResultRef = builder.objectRef<DomainAnalysisValueDetailResult>('DomainAnalysisValueDetailResult');
export const DomainAnalysisConditionTranscriptRef = builder.objectRef<DomainAnalysisConditionTranscript>('DomainAnalysisConditionTranscript');
export const DomainAvailableSignatureRef = builder.objectRef<DomainAvailableSignature>('DomainAvailableSignature');
export const DomainTrialPlanModelRef = builder.objectRef<DomainTrialPlanModel>('DomainTrialPlanModel');
export const DomainTrialPlanVignetteRef = builder.objectRef<DomainTrialPlanVignette>('DomainTrialPlanVignette');
export const DomainTrialPlanCellEstimateRef = builder.objectRef<DomainTrialPlanCellEstimate>('DomainTrialPlanCellEstimate');
export const DomainTrialPlanResultRef = builder.objectRef<DomainTrialPlanResult>('DomainTrialPlanResult');
export const DomainTrialModelStatusRef = builder.objectRef<DomainTrialModelStatus>('DomainTrialModelStatus');
export const DomainTrialRunStatusRef = builder.objectRef<DomainTrialRunStatus>('DomainTrialRunStatus');

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
  }),
});

builder.objectType(DomainAnalysisValueScoreRef, {
  fields: (t) => ({
    valueKey: t.exposeString('valueKey'),
    score: t.exposeFloat('score'),
    prioritized: t.exposeInt('prioritized'),
    deprioritized: t.exposeInt('deprioritized'),
    neutral: t.exposeInt('neutral'),
    totalComparisons: t.exposeInt('totalComparisons'),
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

builder.objectType(DomainAnalysisResultRef, {
  fields: (t) => ({
    domainId: t.exposeID('domainId'),
    domainName: t.exposeString('domainName'),
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
    generatedAt: t.field({
      type: 'DateTime',
      resolve: (parent) => parent.generatedAt,
    }),
    rankingShapeBenchmarks: t.field({
      type: RankingShapeBenchmarksRef,
      resolve: (parent) => parent.rankingShapeBenchmarks,
    }),
    clusterAnalysis: t.field({
      type: ClusterAnalysisRef,
      resolve: (parent) => parent.clusterAnalysis,
    }),
  }),
});

builder.objectType(DomainAnalysisConditionDetailRef, {
  fields: (t) => ({
    scenarioId: t.exposeID('scenarioId', { nullable: true }),
    conditionName: t.exposeString('conditionName'),
    dimensions: t.expose('dimensions', { type: 'JSON', nullable: true }),
    prioritized: t.exposeInt('prioritized'),
    deprioritized: t.exposeInt('deprioritized'),
    neutral: t.exposeInt('neutral'),
    totalTrials: t.exposeInt('totalTrials'),
    selectedValueWinRate: t.exposeFloat('selectedValueWinRate', { nullable: true }),
    meanDecisionScore: t.exposeFloat('meanDecisionScore', { nullable: true }),
  }),
});

builder.objectType(DomainAnalysisVignetteDetailRef, {
  fields: (t) => ({
    definitionId: t.exposeID('definitionId'),
    definitionName: t.exposeString('definitionName'),
    definitionVersion: t.exposeInt('definitionVersion'),
    aggregateRunId: t.exposeID('aggregateRunId', { nullable: true }),
    otherValueKey: t.exposeString('otherValueKey'),
    prioritized: t.exposeInt('prioritized'),
    deprioritized: t.exposeInt('deprioritized'),
    neutral: t.exposeInt('neutral'),
    totalTrials: t.exposeInt('totalTrials'),
    selectedValueWinRate: t.exposeFloat('selectedValueWinRate', { nullable: true }),
    conditions: t.field({
      type: [DomainAnalysisConditionDetailRef],
      resolve: (parent) => parent.conditions,
    }),
  }),
});

builder.objectType(DomainAnalysisValueDetailResultRef, {
  fields: (t) => ({
    domainId: t.exposeID('domainId'),
    domainName: t.exposeString('domainName'),
    modelId: t.exposeString('modelId'),
    modelLabel: t.exposeString('modelLabel'),
    valueKey: t.exposeString('valueKey'),
    score: t.exposeFloat('score'),
    prioritized: t.exposeInt('prioritized'),
    deprioritized: t.exposeInt('deprioritized'),
    neutral: t.exposeInt('neutral'),
    totalTrials: t.exposeInt('totalTrials'),
    targetedDefinitions: t.exposeInt('targetedDefinitions'),
    coveredDefinitions: t.exposeInt('coveredDefinitions'),
    missingDefinitionIds: t.exposeIDList('missingDefinitionIds'),
    vignettes: t.field({
      type: [DomainAnalysisVignetteDetailRef],
      resolve: (parent) => parent.vignettes,
    }),
    generatedAt: t.field({
      type: 'DateTime',
      resolve: (parent) => parent.generatedAt,
    }),
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

builder.objectType(DomainAnalysisConditionTranscriptRef, {
  fields: (t) => ({
    id: t.exposeID('id'),
    runId: t.exposeID('runId'),
    scenarioId: t.exposeID('scenarioId', { nullable: true }),
    modelId: t.exposeString('modelId'),
    decisionCode: t.exposeString('decisionCode', { nullable: true }),
    decisionCodeSource: t.exposeString('decisionCodeSource', { nullable: true }),
    turnCount: t.exposeInt('turnCount'),
    tokenCount: t.exposeInt('tokenCount'),
    durationMs: t.exposeInt('durationMs'),
    createdAt: t.field({
      type: 'DateTime',
      resolve: (parent) => parent.createdAt,
    }),
    content: t.expose('content', { type: 'JSON' }),
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
    modelStatuses: t.field({
      type: [DomainTrialModelStatusRef],
      resolve: (parent) => parent.modelStatuses,
    }),
  }),
});

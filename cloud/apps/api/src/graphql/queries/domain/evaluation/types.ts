import { type Prisma, type DomainEvaluationScopeCategory, type DomainEvaluationStatus, type RunStatus } from '@valuerank/db';
import { builder } from '../../../builder.js';
import { resolveLaunchableDefinitions } from './helpers.js';

export type DomainEvaluationSnapshot = {
  startedRuns?: number;
  failedDefinitions?: number;
  skippedForBudget?: number;
  projectedCostUsd?: number;
  models?: string[];
  launchableDefinitionIds?: string[];
  samplePercentage?: number;
  samplesPerScenario?: number;
  targetBatchCount?: number | null;
  temperature?: number | null;
  maxBudgetUsd?: number | null;
};

export type DomainEvaluationLaunchableDefinitionShape = {
  definitionId: string;
  definitionName: string;
  pairKey: string | null;
};

export type DomainEvaluationMemberShape = {
  runId: string;
  definitionIdAtLaunch: string;
  definitionNameAtLaunch: string;
  domainIdAtLaunch: string;
  modelIds: string[];
  createdAt: Date;
  runStatus: string;
  runCategory: string;
  runStartedAt: Date | null;
  runCompletedAt: Date | null;
};

export type DomainEvaluationShape = {
  id: string;
  domainId: string;
  domainNameAtLaunch: string;
  scopeCategory: string;
  status: string;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  createdByUserId: string | null;
  startedRuns: number;
  failedDefinitions: number;
  skippedForBudget: number;
  projectedCostUsd: number;
  models: string[];
  launchableDefinitionIds: string[];
  samplePercentage: number | null;
  samplesPerScenario: number | null;
  targetBatchCount: number | null;
  temperature: number | null;
  maxBudgetUsd: number | null;
  memberCount: number;
  members: DomainEvaluationMemberShape[];
};

export type DomainEvaluationStatusShape = {
  id: string;
  status: string;
  totalRuns: number;
  pendingRuns: number;
  runningRuns: number;
  completedRuns: number;
  failedRuns: number;
  cancelledRuns: number;
};

export type DomainRunSummaryShape = {
  domainId: string;
  scopeCategory: string | null;
  totalEvaluations: number;
  pendingEvaluations: number;
  runningEvaluations: number;
  completedEvaluations: number;
  failedEvaluations: number;
  cancelledEvaluations: number;
  totalMemberRuns: number;
  pendingMemberRuns: number;
  runningMemberRuns: number;
  completedMemberRuns: number;
  failedMemberRuns: number;
  cancelledMemberRuns: number;
  pilotEvaluations: number;
  productionEvaluations: number;
  replicationEvaluations: number;
  validationEvaluations: number;
  latestEvaluationId: string | null;
  latestEvaluationStatus: string | null;
  latestScopeCategory: string | null;
  latestEvaluationCreatedAt: Date | null;
};

export type DomainFindingsEligibilityShape = {
  domainId: string;
  eligible: boolean;
  status: string;
  summary: string;
  reasons: string[];
  recommendedActions: string[];
  consideredScopeCategories: string[];
  completedEligibleEvaluationCount: number;
  latestEligibleEvaluationId: string | null;
  latestEligibleScopeCategory: string | null;
  latestEligibleCompletedAt: Date | null;
};

export type DomainEvaluationRecord = Prisma.DomainEvaluationGetPayload<{
  include: {
    members: {
      include: {
        run: {
          select: {
            id: true;
            status: true;
            runCategory: true;
            config: true;
            startedAt: true;
            completedAt: true;
          };
        };
      };
    };
  };
}>;

export const ACTIVE_RUN_STATUSES = new Set<RunStatus>(['PENDING', 'RUNNING', 'PAUSED', 'SUMMARIZING']);
export const SCOPE_CATEGORY_VALUES = new Set<DomainEvaluationScopeCategory>([
  'PILOT',
  'PRODUCTION',
  'REPLICATION',
  'VALIDATION',
]);
export const STATUS_VALUES = new Set<DomainEvaluationStatus>([
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

export const DomainEvaluationMemberRef = builder
  .objectRef<DomainEvaluationMemberShape>('DomainEvaluationMember')
  .implement({
    fields: (t) => ({
      runId: t.exposeID('runId'),
      definitionIdAtLaunch: t.exposeID('definitionIdAtLaunch'),
      definitionNameAtLaunch: t.exposeString('definitionNameAtLaunch'),
      domainIdAtLaunch: t.exposeID('domainIdAtLaunch'),
      modelIds: t.exposeStringList('modelIds'),
      createdAt: t.field({ type: 'DateTime', resolve: (parent) => parent.createdAt }),
      runStatus: t.exposeString('runStatus'),
      runCategory: t.exposeString('runCategory'),
      runStartedAt: t.field({ type: 'DateTime', nullable: true, resolve: (parent) => parent.runStartedAt }),
      runCompletedAt: t.field({ type: 'DateTime', nullable: true, resolve: (parent) => parent.runCompletedAt }),
    }),
  });

export const DomainEvaluationLaunchableDefinitionRef = builder
  .objectRef<DomainEvaluationLaunchableDefinitionShape>('DomainEvaluationLaunchableDefinition')
  .implement({
    fields: (t) => ({
      definitionId: t.exposeID('definitionId'),
      definitionName: t.exposeString('definitionName'),
      pairKey: t.exposeString('pairKey', { nullable: true }),
    }),
  });

export const DomainEvaluationRef = builder
  .objectRef<DomainEvaluationShape>('DomainEvaluation')
  .implement({
    fields: (t) => ({
      id: t.exposeID('id'),
      domainId: t.exposeID('domainId'),
      domainNameAtLaunch: t.exposeString('domainNameAtLaunch'),
      scopeCategory: t.exposeString('scopeCategory'),
      status: t.exposeString('status'),
      createdAt: t.field({ type: 'DateTime', resolve: (parent) => parent.createdAt }),
      startedAt: t.field({ type: 'DateTime', nullable: true, resolve: (parent) => parent.startedAt }),
      completedAt: t.field({ type: 'DateTime', nullable: true, resolve: (parent) => parent.completedAt }),
      createdByUserId: t.exposeID('createdByUserId', { nullable: true }),
      startedRuns: t.exposeInt('startedRuns'),
      failedDefinitions: t.exposeInt('failedDefinitions'),
      skippedForBudget: t.exposeInt('skippedForBudget'),
      projectedCostUsd: t.exposeFloat('projectedCostUsd'),
      models: t.exposeStringList('models'),
      launchableDefinitionIds: t.exposeIDList('launchableDefinitionIds'),
      samplePercentage: t.exposeInt('samplePercentage', { nullable: true }),
      samplesPerScenario: t.exposeInt('samplesPerScenario', { nullable: true }),
      targetBatchCount: t.exposeInt('targetBatchCount', { nullable: true }),
      temperature: t.exposeFloat('temperature', { nullable: true }),
      maxBudgetUsd: t.exposeFloat('maxBudgetUsd', { nullable: true }),
      memberCount: t.exposeInt('memberCount'),
      launchableDefinitions: t.field({
        type: [DomainEvaluationLaunchableDefinitionRef],
        resolve: async (parent) => resolveLaunchableDefinitions(parent.launchableDefinitionIds, parent.members),
      }),
      members: t.field({
        type: [DomainEvaluationMemberRef],
        resolve: (parent) => parent.members,
      }),
    }),
  });

export const DomainEvaluationStatusRef = builder
  .objectRef<DomainEvaluationStatusShape>('DomainEvaluationStatus')
  .implement({
    fields: (t) => ({
      id: t.exposeID('id'),
      status: t.exposeString('status'),
      totalRuns: t.exposeInt('totalRuns'),
      pendingRuns: t.exposeInt('pendingRuns'),
      runningRuns: t.exposeInt('runningRuns'),
      completedRuns: t.exposeInt('completedRuns'),
      failedRuns: t.exposeInt('failedRuns'),
      cancelledRuns: t.exposeInt('cancelledRuns'),
    }),
  });

export const DomainRunSummaryRef = builder
  .objectRef<DomainRunSummaryShape>('DomainRunSummary')
  .implement({
    fields: (t) => ({
      domainId: t.exposeID('domainId'),
      scopeCategory: t.exposeString('scopeCategory', { nullable: true }),
      totalEvaluations: t.exposeInt('totalEvaluations'),
      pendingEvaluations: t.exposeInt('pendingEvaluations'),
      runningEvaluations: t.exposeInt('runningEvaluations'),
      completedEvaluations: t.exposeInt('completedEvaluations'),
      failedEvaluations: t.exposeInt('failedEvaluations'),
      cancelledEvaluations: t.exposeInt('cancelledEvaluations'),
      totalMemberRuns: t.exposeInt('totalMemberRuns'),
      pendingMemberRuns: t.exposeInt('pendingMemberRuns'),
      runningMemberRuns: t.exposeInt('runningMemberRuns'),
      completedMemberRuns: t.exposeInt('completedMemberRuns'),
      failedMemberRuns: t.exposeInt('failedMemberRuns'),
      cancelledMemberRuns: t.exposeInt('cancelledMemberRuns'),
      pilotEvaluations: t.exposeInt('pilotEvaluations'),
      productionEvaluations: t.exposeInt('productionEvaluations'),
      replicationEvaluations: t.exposeInt('replicationEvaluations'),
      validationEvaluations: t.exposeInt('validationEvaluations'),
      latestEvaluationId: t.exposeID('latestEvaluationId', { nullable: true }),
      latestEvaluationStatus: t.exposeString('latestEvaluationStatus', { nullable: true }),
      latestScopeCategory: t.exposeString('latestScopeCategory', { nullable: true }),
      latestEvaluationCreatedAt: t.field({
        type: 'DateTime',
        nullable: true,
        resolve: (parent) => parent.latestEvaluationCreatedAt,
      }),
    }),
  });

export const DomainFindingsEligibilityRef = builder
  .objectRef<DomainFindingsEligibilityShape>('DomainFindingsEligibility')
  .implement({
    fields: (t) => ({
      domainId: t.exposeID('domainId'),
      eligible: t.exposeBoolean('eligible'),
      status: t.exposeString('status'),
      summary: t.exposeString('summary'),
      reasons: t.exposeStringList('reasons'),
      recommendedActions: t.exposeStringList('recommendedActions'),
      consideredScopeCategories: t.exposeStringList('consideredScopeCategories'),
      completedEligibleEvaluationCount: t.exposeInt('completedEligibleEvaluationCount'),
      latestEligibleEvaluationId: t.exposeID('latestEligibleEvaluationId', { nullable: true }),
      latestEligibleScopeCategory: t.exposeString('latestEligibleScopeCategory', { nullable: true }),
      latestEligibleCompletedAt: t.field({
        type: 'DateTime',
        nullable: true,
        resolve: (parent) => parent.latestEligibleCompletedAt,
      }),
    }),
  });

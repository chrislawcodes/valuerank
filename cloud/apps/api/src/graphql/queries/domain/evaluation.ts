import { Prisma, db, type DomainEvaluationScopeCategory, type DomainEvaluationStatus, type RunStatus } from '@valuerank/db';
import { AuthenticationError } from '@valuerank/shared';
import { builder } from '../../builder.js';

type DomainEvaluationSnapshot = {
  startedRuns?: number;
  failedDefinitions?: number;
  skippedForBudget?: number;
  projectedCostUsd?: number;
  models?: string[];
  temperature?: number | null;
  maxBudgetUsd?: number | null;
};

type DomainEvaluationMemberShape = {
  runId: string;
  definitionIdAtLaunch: string;
  definitionNameAtLaunch: string;
  domainIdAtLaunch: string;
  createdAt: Date;
  runStatus: string;
  runCategory: string;
  runStartedAt: Date | null;
  runCompletedAt: Date | null;
};

type DomainEvaluationShape = {
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
  temperature: number | null;
  maxBudgetUsd: number | null;
  memberCount: number;
  members: DomainEvaluationMemberShape[];
};

type DomainEvaluationStatusShape = {
  id: string;
  status: string;
  totalRuns: number;
  pendingRuns: number;
  runningRuns: number;
  completedRuns: number;
  failedRuns: number;
  cancelledRuns: number;
};

type DomainRunSummaryShape = {
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

type DomainFindingsEligibilityShape = {
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

type DomainEvaluationRecord = Prisma.DomainEvaluationGetPayload<{
  include: {
    members: {
      include: {
        run: {
          select: {
            id: true;
            status: true;
            runCategory: true;
            startedAt: true;
            completedAt: true;
          };
        };
      };
    };
  };
}>;

const ACTIVE_RUN_STATUSES = new Set<RunStatus>(['PENDING', 'RUNNING', 'PAUSED', 'SUMMARIZING']);
const TERMINAL_RUN_STATUSES = new Set<RunStatus>(['COMPLETED', 'FAILED', 'CANCELLED']);
const SCOPE_CATEGORY_VALUES = new Set<DomainEvaluationScopeCategory>([
  'PILOT',
  'PRODUCTION',
  'REPLICATION',
  'VALIDATION',
]);
const STATUS_VALUES = new Set<DomainEvaluationStatus>([
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

const DomainEvaluationMemberRef = builder
  .objectRef<DomainEvaluationMemberShape>('DomainEvaluationMember')
  .implement({
    fields: (t) => ({
      runId: t.exposeID('runId'),
      definitionIdAtLaunch: t.exposeID('definitionIdAtLaunch'),
      definitionNameAtLaunch: t.exposeString('definitionNameAtLaunch'),
      domainIdAtLaunch: t.exposeID('domainIdAtLaunch'),
      createdAt: t.field({ type: 'DateTime', resolve: (parent) => parent.createdAt }),
      runStatus: t.exposeString('runStatus'),
      runCategory: t.exposeString('runCategory'),
      runStartedAt: t.field({ type: 'DateTime', nullable: true, resolve: (parent) => parent.runStartedAt }),
      runCompletedAt: t.field({ type: 'DateTime', nullable: true, resolve: (parent) => parent.runCompletedAt }),
    }),
  });

const DomainEvaluationRef = builder
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
      temperature: t.exposeFloat('temperature', { nullable: true }),
      maxBudgetUsd: t.exposeFloat('maxBudgetUsd', { nullable: true }),
      memberCount: t.exposeInt('memberCount'),
      members: t.field({
        type: [DomainEvaluationMemberRef],
        resolve: (parent) => parent.members,
      }),
    }),
  });

const DomainEvaluationStatusRef = builder
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

const DomainRunSummaryRef = builder
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

const DomainFindingsEligibilityRef = builder
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

function parseScopeCategory(value: string | null | undefined): DomainEvaluationScopeCategory | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return SCOPE_CATEGORY_VALUES.has(value as DomainEvaluationScopeCategory)
    ? (value as DomainEvaluationScopeCategory)
    : undefined;
}

function parseStatus(value: string | null | undefined): DomainEvaluationStatus | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return STATUS_VALUES.has(value as DomainEvaluationStatus)
    ? (value as DomainEvaluationStatus)
    : undefined;
}

function getSnapshot(configSnapshot: unknown): DomainEvaluationSnapshot {
  if (!configSnapshot || typeof configSnapshot !== 'object' || Array.isArray(configSnapshot)) {
    return {};
  }
  const snapshot = configSnapshot as Record<string, unknown>;
  return {
    startedRuns: typeof snapshot.startedRuns === 'number' ? snapshot.startedRuns : undefined,
    failedDefinitions: typeof snapshot.failedDefinitions === 'number' ? snapshot.failedDefinitions : undefined,
    skippedForBudget: typeof snapshot.skippedForBudget === 'number' ? snapshot.skippedForBudget : undefined,
    projectedCostUsd: typeof snapshot.projectedCostUsd === 'number' ? snapshot.projectedCostUsd : undefined,
    models: Array.isArray(snapshot.models)
      ? snapshot.models.filter((value): value is string => typeof value === 'string')
      : undefined,
    temperature:
      typeof snapshot.temperature === 'number' || snapshot.temperature === null
        ? (snapshot.temperature as number | null)
        : undefined,
    maxBudgetUsd:
      typeof snapshot.maxBudgetUsd === 'number' || snapshot.maxBudgetUsd === null
        ? (snapshot.maxBudgetUsd as number | null)
        : undefined,
  };
}

function deriveEvaluationStatus(
  storedStatus: DomainEvaluationStatus,
  memberStatuses: RunStatus[],
  snapshot: DomainEvaluationSnapshot,
): DomainEvaluationStatus {
  if (memberStatuses.some((status) => ACTIVE_RUN_STATUSES.has(status))) {
    return 'RUNNING';
  }
  if (memberStatuses.length === 0) {
    if ((snapshot.failedDefinitions ?? 0) > 0) {
      return 'FAILED';
    }
    return storedStatus;
  }
  if (memberStatuses.every((status) => status === 'CANCELLED')) {
    return 'CANCELLED';
  }
  if (memberStatuses.some((status) => status === 'FAILED' || status === 'CANCELLED')) {
    return 'FAILED';
  }
  if ((snapshot.failedDefinitions ?? 0) > 0) {
    return 'FAILED';
  }
  if (memberStatuses.every((status) => status === 'COMPLETED')) {
    return 'COMPLETED';
  }
  if (memberStatuses.some((status) => status === 'COMPLETED')) {
    return 'COMPLETED';
  }
  return storedStatus;
}

function buildStatusSummary(
  id: string,
  storedStatus: DomainEvaluationStatus,
  memberStatuses: RunStatus[],
  snapshot: DomainEvaluationSnapshot,
): DomainEvaluationStatusShape {
  const counts = {
    totalRuns: memberStatuses.length,
    pendingRuns: memberStatuses.filter((status) => status === 'PENDING').length,
    runningRuns: memberStatuses.filter((status) => status === 'RUNNING' || status === 'PAUSED' || status === 'SUMMARIZING').length,
    completedRuns: memberStatuses.filter((status) => status === 'COMPLETED').length,
    failedRuns: memberStatuses.filter((status) => status === 'FAILED').length,
    cancelledRuns: memberStatuses.filter((status) => status === 'CANCELLED').length,
  };

  return {
    id,
    status: deriveEvaluationStatus(storedStatus, memberStatuses, snapshot),
    ...counts,
  };
}

function emptyRunSummary(domainId: string, scopeCategory: DomainEvaluationScopeCategory | undefined): DomainRunSummaryShape {
  return {
    domainId,
    scopeCategory: scopeCategory ?? null,
    totalEvaluations: 0,
    pendingEvaluations: 0,
    runningEvaluations: 0,
    completedEvaluations: 0,
    failedEvaluations: 0,
    cancelledEvaluations: 0,
    totalMemberRuns: 0,
    pendingMemberRuns: 0,
    runningMemberRuns: 0,
    completedMemberRuns: 0,
    failedMemberRuns: 0,
    cancelledMemberRuns: 0,
    pilotEvaluations: 0,
    productionEvaluations: 0,
    replicationEvaluations: 0,
    validationEvaluations: 0,
    latestEvaluationId: null,
    latestEvaluationStatus: null,
    latestScopeCategory: null,
    latestEvaluationCreatedAt: null,
  };
}

function hasAuditableFindingsSnapshot(runConfig: unknown): boolean {
  if (!runConfig || typeof runConfig !== 'object' || Array.isArray(runConfig)) {
    return false;
  }
  const config = runConfig as Record<string, unknown>;
  return typeof config.findingsSnapshotVersion === 'string'
    && config.findingsSnapshotVersion === 'v1'
    && config.resolvedContext != null
    && config.resolvedValueStatements != null
    && config.resolvedLevelWords != null
    && config.evaluatorConfig != null;
}

function toShape(
  evaluation: DomainEvaluationRecord,
): DomainEvaluationShape {
  const snapshot = getSnapshot(evaluation.configSnapshot);
  const members = evaluation.members.map((member) => ({
    runId: member.runId,
    definitionIdAtLaunch: member.definitionIdAtLaunch,
    definitionNameAtLaunch: member.definitionNameAtLaunch,
    domainIdAtLaunch: member.domainIdAtLaunch,
    createdAt: member.createdAt,
    runStatus: member.run.status,
    runCategory: member.run.runCategory,
    runStartedAt: member.run.startedAt,
    runCompletedAt: member.run.completedAt,
  }));
  const memberStatuses = evaluation.members.map((member) => member.run.status);
  const derivedStatus = deriveEvaluationStatus(evaluation.status, memberStatuses, snapshot);
  const completedAt =
    derivedStatus === 'COMPLETED' || derivedStatus === 'FAILED' || derivedStatus === 'CANCELLED'
      ? evaluation.completedAt ?? members.reduce<Date | null>((latest, member) => {
        if (member.runCompletedAt === null) return latest;
        if (latest === null || member.runCompletedAt > latest) return member.runCompletedAt;
        return latest;
      }, null)
      : null;

  return {
    id: evaluation.id,
    domainId: evaluation.domainId,
    domainNameAtLaunch: evaluation.domainNameAtLaunch,
    scopeCategory: evaluation.scopeCategory,
    status: derivedStatus,
    createdAt: evaluation.createdAt,
    startedAt: evaluation.startedAt,
    completedAt,
    createdByUserId: evaluation.createdByUserId,
    startedRuns: snapshot.startedRuns ?? members.length,
    failedDefinitions: snapshot.failedDefinitions ?? 0,
    skippedForBudget: snapshot.skippedForBudget ?? 0,
    projectedCostUsd: snapshot.projectedCostUsd ?? 0,
    models: snapshot.models ?? [],
    temperature: snapshot.temperature ?? null,
    maxBudgetUsd: snapshot.maxBudgetUsd ?? null,
    memberCount: members.length,
    members,
  };
}

const evaluationInclude = {
  members: {
    include: {
      run: {
        select: {
          id: true,
          status: true,
          runCategory: true,
          startedAt: true,
          completedAt: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
};

builder.queryField('domainEvaluations', (t) =>
  t.field({
    type: [DomainEvaluationRef],
    args: {
      domainId: t.arg.id({ required: true }),
      scopeCategory: t.arg.string({ required: false }),
      status: t.arg.string({ required: false }),
      limit: t.arg.int({ required: false }),
      offset: t.arg.int({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const limit = Math.min(args.limit ?? 20, 100);
      const offset = args.offset ?? 0;
      const scopeCategory = parseScopeCategory(args.scopeCategory);
      const requestedStatus = parseStatus(args.status);

      const evaluations = await db.domainEvaluation.findMany({
        where: {
          domainId: String(args.domainId),
          ...(scopeCategory ? { scopeCategory } : {}),
        },
        include: evaluationInclude,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      const shaped = evaluations.map(toShape);
      return requestedStatus
        ? shaped.filter((evaluation) => evaluation.status === requestedStatus)
        : shaped;
    },
  }),
);

builder.queryField('domainEvaluation', (t) =>
  t.field({
    type: DomainEvaluationRef,
    nullable: true,
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const evaluation = await db.domainEvaluation.findUnique({
        where: { id: String(args.id) },
        include: evaluationInclude,
      });

      return evaluation ? toShape(evaluation) : null;
    },
  }),
);

builder.queryField('domainEvaluationMembers', (t) =>
  t.field({
    type: [DomainEvaluationMemberRef],
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const evaluation = await db.domainEvaluation.findUnique({
        where: { id: String(args.id) },
        include: evaluationInclude,
      });

      return evaluation ? toShape(evaluation).members : [];
    },
  }),
);

builder.queryField('domainEvaluationStatus', (t) =>
  t.field({
    type: DomainEvaluationStatusRef,
    nullable: true,
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const evaluation = await db.domainEvaluation.findUnique({
        where: { id: String(args.id) },
        include: evaluationInclude,
      });
      if (!evaluation) return null;

      const snapshot = getSnapshot(evaluation.configSnapshot);
      const memberStatuses = evaluation.members.map((member) => member.run.status);
      return buildStatusSummary(evaluation.id, evaluation.status, memberStatuses, snapshot);
    },
  }),
);

builder.queryField('domainRunSummary', (t) =>
  t.field({
    type: DomainRunSummaryRef,
    args: {
      domainId: t.arg.id({ required: true }),
      scopeCategory: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const domainId = String(args.domainId);
      const scopeCategory = parseScopeCategory(args.scopeCategory);

      const evaluations = await db.domainEvaluation.findMany({
        where: {
          domainId,
          ...(scopeCategory ? { scopeCategory } : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          scopeCategory: true,
          status: true,
          createdAt: true,
          configSnapshot: true,
          members: {
            select: {
              run: {
                select: {
                  status: true,
                },
              },
            },
          },
        },
      });

      if (evaluations.length === 0) {
        return emptyRunSummary(domainId, scopeCategory);
      }

      const summary = emptyRunSummary(domainId, scopeCategory);
      summary.totalEvaluations = evaluations.length;

      const latestEvaluation = evaluations[0]!;
      const latestSnapshot = getSnapshot(latestEvaluation.configSnapshot);
      const latestStatuses = latestEvaluation.members.map((member) => member.run.status);
      const latestDerivedStatus = deriveEvaluationStatus(latestEvaluation.status, latestStatuses, latestSnapshot);
      summary.latestEvaluationId = latestEvaluation.id;
      summary.latestEvaluationStatus = latestDerivedStatus;
      summary.latestScopeCategory = latestEvaluation.scopeCategory;
      summary.latestEvaluationCreatedAt = latestEvaluation.createdAt;

      for (const evaluation of evaluations) {
        const snapshot = getSnapshot(evaluation.configSnapshot);
        const memberStatuses = evaluation.members.map((member) => member.run.status);
        const derivedStatus = deriveEvaluationStatus(evaluation.status, memberStatuses, snapshot);

        switch (derivedStatus) {
          case 'PENDING':
            summary.pendingEvaluations += 1;
            break;
          case 'RUNNING':
            summary.runningEvaluations += 1;
            break;
          case 'COMPLETED':
            summary.completedEvaluations += 1;
            break;
          case 'FAILED':
            summary.failedEvaluations += 1;
            break;
          case 'CANCELLED':
            summary.cancelledEvaluations += 1;
            break;
        }

        switch (evaluation.scopeCategory) {
          case 'PILOT':
            summary.pilotEvaluations += 1;
            break;
          case 'PRODUCTION':
            summary.productionEvaluations += 1;
            break;
          case 'REPLICATION':
            summary.replicationEvaluations += 1;
            break;
          case 'VALIDATION':
            summary.validationEvaluations += 1;
            break;
        }

        summary.totalMemberRuns += memberStatuses.length;
        for (const memberStatus of memberStatuses) {
          switch (memberStatus) {
            case 'PENDING':
              summary.pendingMemberRuns += 1;
              break;
            case 'RUNNING':
            case 'PAUSED':
            case 'SUMMARIZING':
              summary.runningMemberRuns += 1;
              break;
            case 'COMPLETED':
              summary.completedMemberRuns += 1;
              break;
            case 'FAILED':
              summary.failedMemberRuns += 1;
              break;
            case 'CANCELLED':
              summary.cancelledMemberRuns += 1;
              break;
          }
        }
      }

      return summary;
    },
  }),
);

builder.queryField('domainFindingsEligibility', (t) =>
  t.field({
    type: DomainFindingsEligibilityRef,
    args: {
      domainId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const domainId = String(args.domainId);
      const consideredScopeCategories: DomainEvaluationScopeCategory[] = ['PRODUCTION', 'REPLICATION'];
      const evaluations = await db.domainEvaluation.findMany({
        where: {
          domainId,
          scopeCategory: { in: consideredScopeCategories },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          scopeCategory: true,
          status: true,
          completedAt: true,
          configSnapshot: true,
          members: {
            select: {
              run: {
                select: {
                  status: true,
                  runCategory: true,
                  config: true,
                },
              },
            },
          },
        },
      });

      const completedEligibleEvaluations = evaluations.filter((evaluation) => {
        const snapshot = getSnapshot(evaluation.configSnapshot);
        const memberStatuses = evaluation.members.map((member) => member.run.status);
        return deriveEvaluationStatus(evaluation.status, memberStatuses, snapshot) === 'COMPLETED';
      });
      const latestEligibleEvaluation = completedEligibleEvaluations[0] ?? null;
      const hasAuditableSnapshot = completedEligibleEvaluations.some((evaluation) =>
        evaluation.members.length > 0
        && evaluation.members.every((member) =>
          (member.run.runCategory === 'PRODUCTION' || member.run.runCategory === 'REPLICATION')
          && hasAuditableFindingsSnapshot(member.run.config),
        ),
      );

      const reasons: string[] = [];
      const recommendedActions: string[] = [];

      if (completedEligibleEvaluations.length === 0) {
        reasons.push('No completed production or replication domain evaluation exists for this domain yet.');
        recommendedActions.push('Run a production domain evaluation before treating this surface as findings.');
      }

      if (!hasAuditableSnapshot) {
        reasons.push('Launch snapshot boundary is not complete for auditable findings yet, so this domain remains diagnostic-only.');
        recommendedActions.push('Treat current charts as diagnostics until resolved launch snapshots are captured for findings.');
      }

      const eligible = completedEligibleEvaluations.length > 0 && hasAuditableSnapshot;

      return {
        domainId,
        eligible,
        status: eligible ? 'ELIGIBLE' : 'DIAGNOSTIC_ONLY',
        summary: eligible
          ? 'This domain has at least one completed production-style evaluation with auditable launch snapshots.'
          : 'This domain can show diagnostic signals, but findings are not yet auditable.',
        reasons,
        recommendedActions,
        consideredScopeCategories,
        completedEligibleEvaluationCount: completedEligibleEvaluations.length,
        latestEligibleEvaluationId: latestEligibleEvaluation?.id ?? null,
        latestEligibleScopeCategory: latestEligibleEvaluation?.scopeCategory ?? null,
        latestEligibleCompletedAt: latestEligibleEvaluation?.completedAt ?? null,
      };
    },
  }),
);

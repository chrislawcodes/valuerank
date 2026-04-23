import { db, type DomainEvaluationScopeCategory } from '@valuerank/db';
import { AuthenticationError } from '@valuerank/shared';
import { builder } from '../../../builder.js';
import {
  parseScopeCategory,
  parseStatus,
  getSnapshot,
  deriveEvaluationStatus,
  buildStatusSummary,
  emptyRunSummary,
  hasAuditableFindingsSnapshot,
  toShape,
  evaluationInclude,
} from './helpers.js';
import {
  DomainEvaluationRef,
  DomainEvaluationMemberRef,
  DomainEvaluationStatusRef,
  DomainRunSummaryRef,
  DomainFindingsEligibilityRef,
} from './types.js';

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
          deletedAt: null,
          ...(scopeCategory ? { scopeCategory } : {}),
        },
        include: evaluationInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

      const evaluation = await db.domainEvaluation.findFirst({
        where: {
          id: String(args.id),
          deletedAt: null,
        },
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

      const evaluation = await db.domainEvaluation.findFirst({
        where: {
          id: String(args.id),
          deletedAt: null,
        },
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

      const evaluation = await db.domainEvaluation.findFirst({
        where: {
          id: String(args.id),
          deletedAt: null,
        },
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
          deletedAt: null,
          ...(scopeCategory ? { scopeCategory } : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
          deletedAt: null,
          scopeCategory: { in: consideredScopeCategories },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

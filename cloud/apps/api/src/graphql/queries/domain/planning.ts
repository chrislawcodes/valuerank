import { db, Prisma } from '@valuerank/db';
import { AuthenticationError } from '@valuerank/shared';
import { builder } from '../../builder.js';
import {
  DomainEvaluationCostEstimateRef,
  DomainAvailableSignatureRef,
  DomainTrialPlanResultRef,
  DomainTrialRunStatusRef,
} from './types.js';
import {
  buildAvailableSignatureOptions,
  buildTrialRunStatusRows,
} from './planning-utils.js';
import { resolveRunAnalysisStatuses } from '../../../services/run/analysis-status.js';
import { buildDomainEstimate } from './planning-estimate.js';
import { parseDomainAnalysisScope } from '../../../services/analysis/domain-analysis-scope.js';
import { resolveDomainAnalysisScopeDefinitions } from '../../../services/analysis/domain-analysis-scope-loader.js';

builder.queryField('domainTrialsPlan', (t) =>
  t.field({
    type: DomainTrialPlanResultRef,
    args: {
      domainId: t.arg.id({ required: true }),
      temperature: t.arg.float({ required: false }),
      definitionIds: t.arg.idList({ required: false }),
      scopeCategory: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }
      const requestedScope = String(args.scopeCategory ?? 'PRODUCTION').trim().toUpperCase();
      const scopeCategory = ['PILOT', 'PRODUCTION', 'REPLICATION', 'VALIDATION'].includes(requestedScope)
        ? requestedScope
        : 'PRODUCTION';
      const estimate = await buildDomainEstimate({
        domainId: String(args.domainId),
        definitionIds: args.definitionIds?.map(String) ?? [],
        temperature: args.temperature ?? null,
        scopeCategory,
      });
      return estimate.trialPlan;
    },
  }),
);

builder.queryField('estimateDomainEvaluationCost', (t) =>
  t.field({
    type: DomainEvaluationCostEstimateRef,
    args: {
      domainId: t.arg.id({ required: true }),
      definitionIds: t.arg.idList({ required: false }),
      modelIds: t.arg.stringList({ required: false }),
      temperature: t.arg.float({ required: false }),
      samplePercentage: t.arg.int({ required: false }),
      samplesPerScenario: t.arg.int({ required: false }),
      scopeCategory: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const estimate = await buildDomainEstimate({
        domainId: String(args.domainId),
        definitionIds: args.definitionIds?.map(String) ?? [],
        modelIds: args.modelIds?.map(String) ?? [],
        temperature: args.temperature ?? null,
        samplePercentage: args.samplePercentage ?? 100,
        samplesPerScenario: args.samplesPerScenario ?? 1,
        scopeCategory: args.scopeCategory ?? 'PRODUCTION',
      });

      return estimate.costEstimate;
    },
  }),
);

builder.queryField('domainTrialRunsStatus', (t) =>
  t.field({
    type: [DomainTrialRunStatusRef],
    args: {
      runIds: t.arg.idList({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }
      const runIds = args.runIds.map(String);
      if (runIds.length === 0) return [];

      const runs = await db.run.findMany({
        where: {
          id: { in: runIds },
          deletedAt: null,
        },
        select: {
          id: true,
          definitionId: true,
          status: true,
          updatedAt: true,
          stalledModels: true,
          completedAt: true,
          config: true,
        },
      });

      const probeRows = await db.probeResult.groupBy({
        by: ['runId', 'modelId', 'status'],
        where: { runId: { in: runIds } },
        _count: { _all: true },
      });
      const transcripts = await db.transcript.groupBy({
        by: ['runId', 'modelId'],
        where: { runId: { in: runIds }, deletedAt: null },
        _count: { _all: true },
      });
      const summarizedRows = await db.transcript.groupBy({
        by: ['runId', 'modelId'],
        where: { runId: { in: runIds }, deletedAt: null, summarizedAt: { not: null } },
        _count: { _all: true },
      });
      const summarizeFailedRows = await db.transcript.groupBy({
        by: ['runId', 'modelId'],
        where: {
          runId: { in: runIds },
          deletedAt: null,
          summarizedAt: { not: null },
          decisionMetadata: { equals: Prisma.DbNull },
        },
        _count: { _all: true },
      });
      const selectedScenarioCounts = await db.runScenarioSelection.groupBy({
        by: ['runId'],
        where: { runId: { in: runIds } },
        _count: { _all: true },
      });
      const failedProbeRows = await db.probeResult.findMany({
        where: {
          runId: { in: runIds },
          status: 'FAILED',
        },
        select: {
          runId: true,
          modelId: true,
          errorCode: true,
          errorMessage: true,
          completedAt: true,
          createdAt: true,
        },
        orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      });

      const analysisStatusByRunId = await resolveRunAnalysisStatuses(
        runs.map((run) => ({
          id: run.id,
          definitionId: run.definitionId,
          status: run.status,
          completedAt: run.completedAt,
          config: run.config,
        })),
      );
      return buildTrialRunStatusRows(
        runIds,
        runs,
        probeRows.map((row) => ({
          runId: row.runId,
          modelId: row.modelId,
          status: row.status,
          count: row._count._all,
        })),
        transcripts.map((row) => ({
          runId: row.runId,
          modelId: row.modelId,
          count: row._count._all,
        })),
        summarizedRows.map((row) => ({
          runId: row.runId,
          modelId: row.modelId,
          count: row._count._all,
        })),
        summarizeFailedRows.map((row) => ({
          runId: row.runId,
          modelId: row.modelId,
          count: row._count._all,
        })),
        selectedScenarioCounts.map((row) => ({
          runId: row.runId,
          count: row._count._all,
        })),
        failedProbeRows.map((row) => ({
          runId: row.runId,
          modelId: row.modelId,
          errorCode: row.errorCode,
          errorMessage: row.errorMessage,
        })),
        analysisStatusByRunId,
      );
    },
  }),
);

builder.queryField('domainAvailableSignatures', (t) =>
  t.field({
    type: [DomainAvailableSignatureRef],
    args: {
      domainId: t.arg.id({ required: true }),
      scope: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }
      const domainId = String(args.domainId);
      const scope = parseDomainAnalysisScope(args.scope);
      const scopeData = await resolveDomainAnalysisScopeDefinitions({ scope, domainId });
      if (scopeData.latestDefinitionIds.length === 0) return [];

      const runs = await db.run.findMany({
        where: {
          definitionId: { in: scopeData.latestDefinitionIds },
          status: 'COMPLETED',
          deletedAt: null,
        },
        select: {
          config: true,
        },
      });

      return buildAvailableSignatureOptions(runs);
    },
  }),
);

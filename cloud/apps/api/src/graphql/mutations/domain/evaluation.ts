import { builder } from '../../builder.js';
import { db } from '@valuerank/db';
import { AuthenticationError } from '@valuerank/shared';
import { createAuditLog } from '../../../services/audit/index.js';
import { startRun as startRunService } from '../../../services/run/index.js';
import { parseTemperature } from '../../../utils/temperature.js';
import {
  DOMAIN_TRIAL_DEFAULT_SAMPLE_PERCENTAGE,
  DOMAIN_TRIAL_DEFAULT_SAMPLES_PER_SCENARIO,
} from '../../../services/run/config.js';
import { launchDomainEvaluation } from './launch.js';
import {
  DomainTrialRunResultRef,
  RetryDomainTrialCellResultRef,
  type DomainEvaluationLaunchInput,
  normalizeModelSet,
} from './types.js';

builder.mutationField('runTrialsForDomain', (t) =>
  t.field({
    type: DomainTrialRunResultRef,
    args: {
      domainId: t.arg.id({ required: true }),
      temperature: t.arg.float({ required: false }),
      maxBudgetUsd: t.arg.float({ required: false }),
      definitionIds: t.arg.idList({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }
      return launchDomainEvaluation({
        domainId: String(args.domainId),
        scopeCategory: 'PRODUCTION',
        temperature: args.temperature ?? null,
        maxBudgetUsd: args.maxBudgetUsd ?? null,
        definitionIds: args.definitionIds?.map(String) ?? [],
        samplePercentage: DOMAIN_TRIAL_DEFAULT_SAMPLE_PERCENTAGE,
        samplesPerScenario: DOMAIN_TRIAL_DEFAULT_SAMPLES_PER_SCENARIO,
        userId: ctx.user.id,
        log: ctx.log,
        auditOperationType: 'run-trials-for-domain',
      });
    },
  })
);

builder.mutationField('startDomainEvaluation', (t) =>
  t.field({
    type: DomainTrialRunResultRef,
    args: {
      domainId: t.arg.id({ required: true }),
      scopeCategory: t.arg.string({ required: false }),
      temperature: t.arg.float({ required: false }),
      maxBudgetUsd: t.arg.float({ required: false }),
      definitionIds: t.arg.idList({ required: false }),
      modelIds: t.arg.stringList({ required: false }),
      samplePercentage: t.arg.int({ required: false }),
      samplesPerScenario: t.arg.int({ required: false }),
      targetBatchCount: t.arg.int({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const requestedScopeCategory = String(args.scopeCategory ?? 'PRODUCTION').trim().toUpperCase();
      const scopeCategory = ['PILOT', 'PRODUCTION', 'REPLICATION', 'VALIDATION'].includes(requestedScopeCategory)
        ? (requestedScopeCategory as DomainEvaluationLaunchInput['scopeCategory'])
        : 'PRODUCTION';

      const rawTargetBatchCount = args.targetBatchCount ?? null;
      const targetBatchCount =
        rawTargetBatchCount !== null && Number.isFinite(rawTargetBatchCount) && rawTargetBatchCount >= 1
          ? rawTargetBatchCount
          : null;

      return launchDomainEvaluation({
        domainId: String(args.domainId),
        scopeCategory,
        temperature: args.temperature ?? null,
        maxBudgetUsd: args.maxBudgetUsd ?? null,
        definitionIds: args.definitionIds?.map(String) ?? [],
        modelIds: args.modelIds?.map(String) ?? [],
        samplePercentage: args.samplePercentage ?? DOMAIN_TRIAL_DEFAULT_SAMPLE_PERCENTAGE,
        samplesPerScenario: args.samplesPerScenario ?? DOMAIN_TRIAL_DEFAULT_SAMPLES_PER_SCENARIO,
        targetBatchCount,
        userId: ctx.user.id,
        log: ctx.log,
        auditOperationType: 'start-domain-evaluation',
      });
    },
  }),
);

builder.mutationField('retryDomainTrialCell', (t) =>
  t.field({
    type: RetryDomainTrialCellResultRef,
    args: {
      domainId: t.arg.id({ required: true }),
      definitionId: t.arg.id({ required: true }),
      modelId: t.arg.string({ required: true }),
      temperature: t.arg.float({ required: false }),
      scopeCategory: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const userId = ctx.user.id;
      const domainId = String(args.domainId);
      const definitionId = String(args.definitionId);
      const modelId = String(args.modelId);
      const requestedScopeCategory = String(args.scopeCategory ?? 'PRODUCTION').trim().toUpperCase();
      const scopeCategory = ['PILOT', 'PRODUCTION', 'REPLICATION', 'VALIDATION'].includes(requestedScopeCategory)
        ? (requestedScopeCategory as DomainEvaluationLaunchInput['scopeCategory'])
        : 'PRODUCTION';

      const domain = await db.domain.findUnique({ where: { id: domainId } });
      if (!domain) throw new Error(`Domain not found: ${domainId}`);

      const definition = await db.definition.findFirst({
        where: { id: definitionId, domainId, deletedAt: null },
        select: { id: true },
      });
      if (!definition) {
        throw new Error('Selected vignette is not part of this domain.');
      }

      const model = await db.llmModel.findFirst({
        where: { modelId, status: 'ACTIVE' },
        select: { modelId: true },
      });
      if (!model) {
        throw new Error(`Model is not active: ${modelId}`);
      }

      const activeRuns = await db.run.findMany({
        where: {
          definitionId,
          runCategory: scopeCategory,
          status: { in: ['PENDING', 'RUNNING', 'PAUSED', 'SUMMARIZING'] },
          deletedAt: null,
        },
        select: { id: true, config: true },
      });
      const hasEquivalentActiveRun = activeRuns.some((run) => {
        const config = run.config as { models?: unknown; temperature?: unknown } | null;
        const runModels = normalizeModelSet(config?.models);
        const runTemperature = parseTemperature(config?.temperature);
        return runTemperature === (args.temperature ?? null)
          && runModels.length === 1
          && runModels[0] === modelId;
      });
      if (hasEquivalentActiveRun) {
        throw new Error('Retry blocked: this model/vignette cell already has an active run at the same temperature.');
      }

      const run = await startRunService({
        definitionId,
        models: [modelId],
        samplePercentage: DOMAIN_TRIAL_DEFAULT_SAMPLE_PERCENTAGE,
        samplesPerScenario: DOMAIN_TRIAL_DEFAULT_SAMPLES_PER_SCENARIO,
        temperature: args.temperature ?? undefined,
        priority: 'NORMAL',
        runCategory: scopeCategory,
        userId,
        finalTrial: false,
      });

      await createAuditLog({
        action: 'ACTION',
        entityType: 'Domain',
        entityId: domainId,
        userId,
        metadata: {
          operationType: 'retry-domain-trial-cell',
          domainName: domain.name,
          definitionId,
          modelId,
          scopeCategory,
          runId: run.run.id,
          temperature: args.temperature ?? null,
        },
      });

      return {
        success: true,
        definitionId,
        modelId,
        runId: run.run.id,
        message: null,
      };
    },
  })
);

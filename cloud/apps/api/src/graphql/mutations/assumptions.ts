import { db } from '@valuerank/db';
import { AuthenticationError } from '@valuerank/shared';
import { builder } from '../builder.js';
import { startRun as startRunService } from '../../services/run/index.js';
import { createAuditLog } from '../../services/audit/index.js';
import { parseTemperature } from '../../utils/temperature.js';
import { LOCKED_ASSUMPTION_VIGNETTES } from '../assumptions-constants.js';

type LaunchAssumptionsTempZeroPayload = {
  startedRuns: number;
  totalVignettes: number;
  modelCount: number;
  runIds: string[];
  failedVignetteIds: string[];
};

function normalizeModelSet(models: unknown): string[] {
  if (!Array.isArray(models)) return [];
  return models
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .slice()
    .sort((left, right) => left.localeCompare(right));
}

const LaunchAssumptionsTempZeroPayloadRef = builder.objectRef<LaunchAssumptionsTempZeroPayload>('LaunchAssumptionsTempZeroPayload');

builder.objectType(LaunchAssumptionsTempZeroPayloadRef, {
  fields: (t) => ({
    startedRuns: t.exposeInt('startedRuns'),
    totalVignettes: t.exposeInt('totalVignettes'),
    modelCount: t.exposeInt('modelCount'),
    runIds: t.exposeStringList('runIds'),
    failedVignetteIds: t.exposeStringList('failedVignetteIds'),
  }),
});

builder.mutationField('launchAssumptionsTempZero', (t) =>
  t.field({
    type: LaunchAssumptionsTempZeroPayloadRef,
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const userId = ctx.user.id;
      const domain = await db.domain.findFirst({
        where: { normalizedName: 'professional' },
        select: { id: true, name: true },
      });
      if (!domain) {
        throw new Error('Professional domain not found');
      }

      const definitions = await db.definition.findMany({
        where: {
          id: { in: LOCKED_ASSUMPTION_VIGNETTES.map((vignette) => vignette.id) },
          domainId: domain.id,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (definitions.length === 0) {
        throw new Error('No locked professional-domain vignettes are available for temp=0 confirmation.');
      }

      const activeModels = await db.llmModel.findMany({
        where: { status: 'ACTIVE' },
        select: { modelId: true, isDefault: true },
      });
      const defaultModels = activeModels.filter((model) => model.isDefault).map((model) => model.modelId);
      const fallbackModels = activeModels.map((model) => model.modelId);
      const models = (defaultModels.length > 0 ? defaultModels : fallbackModels).slice().sort((left, right) => left.localeCompare(right));
      if (models.length === 0) {
        throw new Error('No active models are configured. Add an active model before launching temp=0 confirmation runs.');
      }

      const activeRuns = await db.run.findMany({
        where: {
          definitionId: { in: definitions.map((definition) => definition.id) },
          status: { in: ['PENDING', 'RUNNING', 'PAUSED', 'SUMMARIZING'] },
          deletedAt: null,
        },
        select: {
          config: true,
        },
      });

      const hasActiveEquivalentRun = activeRuns.some((run) => {
        const config = run.config as { assumptionKey?: unknown; models?: unknown; temperature?: unknown } | null;
        return config?.assumptionKey === 'temp_zero_determinism'
          && parseTemperature(config.temperature) === 0
          && normalizeModelSet(config.models).length === models.length
          && normalizeModelSet(config.models).every((modelId, index) => modelId === models[index]);
      });
      if (hasActiveEquivalentRun) {
        throw new Error('Temp=0 confirmation launch blocked: matching dedicated runs are already active.');
      }

      const runIds: string[] = [];
      const failedVignetteIds: string[] = [];

      const results = await Promise.allSettled(
        definitions.map(async (definition) => {
          const result = await startRunService({
            definitionId: definition.id,
            models,
            samplePercentage: 100,
            samplesPerScenario: 3,
            temperature: 0,
            priority: 'NORMAL',
            userId,
            finalTrial: false,
            configExtras: {
              assumptionKey: 'temp_zero_determinism',
            },
          });

          return result.run.id;
        }),
      );

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          runIds.push(result.value);
          return;
        }
        failedVignetteIds.push(definitions[index]!.id);
        ctx.log.error(
          {
            definitionId: definitions[index]!.id,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          },
          'Failed to launch temp=0 confirmation run',
        );
      });

      void createAuditLog({
        action: 'ACTION',
        entityType: 'Domain',
        entityId: domain.id,
        userId,
        metadata: {
          operationType: 'launch-assumptions-temp-zero',
          domainName: domain.name,
          definitionIds: definitions.map((definition) => definition.id),
          startedRuns: runIds.length,
          failedVignetteIds,
          models,
          temperature: 0,
          samplesPerScenario: 3,
        },
      });

      return {
        startedRuns: runIds.length,
        totalVignettes: definitions.length,
        modelCount: models.length,
        runIds,
        failedVignetteIds,
      };
    },
  }),
);

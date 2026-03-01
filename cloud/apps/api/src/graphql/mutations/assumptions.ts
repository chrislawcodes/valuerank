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

function matchesAssumptionsTempZeroPackage(runConfig: unknown, modelIds: string[]): boolean {
  const config = runConfig as { assumptionKey?: unknown; models?: unknown; temperature?: unknown; samplePercentage?: unknown } | null;
  const configModels = normalizeModelSet(config?.models);

  if (config?.assumptionKey === 'temp_zero_determinism') {
    return parseTemperature(config.temperature) === 0
      && configModels.length === modelIds.length
      && configModels.every((modelId, index) => modelId === modelIds[index]);
  }

  const samplePercentage = typeof config?.samplePercentage === 'number'
    ? config.samplePercentage
    : typeof config?.samplePercentage === 'string'
      ? Number(config.samplePercentage)
      : null;

  return parseTemperature(config?.temperature) === 0
    && samplePercentage === 100
    && configModels.length === modelIds.length
    && configModels.every((modelId, index) => modelId === modelIds[index]);
}

type ScenarioRecord = {
  id: string;
  definitionId: string;
};

type TranscriptRecord = {
  scenarioId: string | null;
  modelId: string;
  modelVersion: string | null;
  createdAt: Date;
};

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
        select: {
          id: true,
          scenarios: {
            where: { deletedAt: null },
            select: {
              id: true,
              definitionId: true,
            },
          },
        },
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
        return matchesAssumptionsTempZeroPackage(run.config, models);
      });
      if (hasActiveEquivalentRun) {
        throw new Error('Temp=0 confirmation launch blocked: matching dedicated runs are already active.');
      }

      const completedRuns = await db.run.findMany({
        where: {
          definitionId: { in: definitions.map((definition) => definition.id) },
          status: 'COMPLETED',
          deletedAt: null,
        },
        select: {
          id: true,
          definitionId: true,
          config: true,
        },
      });
      const qualifyingCompletedRunIds = completedRuns
        .filter((run) => matchesAssumptionsTempZeroPackage(run.config, models))
        .map((run) => run.id);

      const transcripts = qualifyingCompletedRunIds.length > 0 ? await db.transcript.findMany({
        where: {
          runId: { in: qualifyingCompletedRunIds },
          modelId: { in: models },
          scenarioId: { not: null },
          deletedAt: null,
          decisionCode: { in: ['1', '2', '3', '4', '5'] },
        },
        select: {
          scenarioId: true,
          modelId: true,
          modelVersion: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }) : [];

      const transcriptGroups = new Map<string, TranscriptRecord[]>();
      for (const transcript of transcripts) {
        if (transcript.scenarioId === null) continue;
        const key = `${transcript.modelId}::${transcript.scenarioId}`;
        const existing = transcriptGroups.get(key) ?? [];
        existing.push(transcript);
        transcriptGroups.set(key, existing);
      }
      for (const [key, group] of transcriptGroups.entries()) {
        group.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
        const latestModelVersion = group[0]?.modelVersion ?? null;
        const sameVersionGroup = group.filter((transcript) => transcript.modelVersion === latestModelVersion);
        transcriptGroups.set(key, sameVersionGroup.slice(0, 3));
      }

      const definitionsWithTopUp = definitions.map((definition) => {
        const scenarios = definition.scenarios as ScenarioRecord[];
        let existingBatchFloor = 3;

        if (scenarios.length === 0 || models.length === 0) {
          existingBatchFloor = 0;
        } else {
          for (const scenario of scenarios) {
            for (const modelId of models) {
              const count = (transcriptGroups.get(`${modelId}::${scenario.id}`) ?? []).length;
              if (count < existingBatchFloor) {
                existingBatchFloor = count;
              }
              if (existingBatchFloor === 0) break;
            }
            if (existingBatchFloor === 0) break;
          }
        }

        return {
          definitionId: definition.id,
          samplesPerScenario: Math.max(0, 3 - Math.min(existingBatchFloor, 3)),
        };
      });

      const runIds: string[] = [];
      const failedVignetteIds: string[] = [];
      const skippedVignetteIds: string[] = [];

      const results = await Promise.allSettled(
        definitionsWithTopUp
          .filter((definition) => {
            if (definition.samplesPerScenario === 0) {
              skippedVignetteIds.push(definition.definitionId);
              return false;
            }
            return true;
          })
          .map(async (definition) => {
          const result = await startRunService({
            definitionId: definition.definitionId,
            models,
            samplePercentage: 100,
            samplesPerScenario: definition.samplesPerScenario,
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
        const launchedDefinitions = definitionsWithTopUp.filter((definition) => definition.samplesPerScenario > 0);
        failedVignetteIds.push(launchedDefinitions[index]!.definitionId);
        ctx.log.error(
          {
            definitionId: launchedDefinitions[index]!.definitionId,
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
          skippedVignetteIds,
          models,
          temperature: 0,
          launchedSamplesPerScenario: definitionsWithTopUp
            .filter((definition) => definition.samplesPerScenario > 0)
            .map((definition) => ({
              definitionId: definition.definitionId,
              samplesPerScenario: definition.samplesPerScenario,
            })),
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

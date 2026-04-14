import { randomUUID } from 'crypto';
import type { db } from '@valuerank/db';
import type { RunCategory } from '@valuerank/db';
import { startRun as startRunService } from '../../../../services/run/index.js';
import { getComponentTokens } from '../../../../utils/auto-pair.js';
import { runMatchesSingleModel } from './resolve-backfill.js';
import type {
  LaunchSlot,
  BackfillEvaluationSnapshot,
  BackfillLaunchGroupRepetition,
  DomainTrialRunEntry,
} from './types.js';
import { ACTIVE_RUN_STATUSES } from './types.js';

type PrismaTransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export async function executeLaunchRuns(params: {
  launchSlots: LaunchSlot[];
  selectedModels: string[];
  samplePercentage: number;
  samplesPerScenario: number;
  temperature: number | null;
  scopeCategory: RunCategory;
  userId: string;
  log: { error: (payload: Record<string, unknown>, message: string) => void };
  domainId: string;
}): Promise<{ startedRuns: number; failedDefinitions: number; runs: DomainTrialRunEntry[] }> {
  const {
    launchSlots,
    selectedModels,
    samplePercentage,
    samplesPerScenario,
    temperature,
    scopeCategory,
    userId,
    log,
    domainId,
  } = params;

  let startedRuns = 0;
  let failedDefinitions = 0;
  const runs: DomainTrialRunEntry[] = [];

  for (let offset = 0; offset < launchSlots.length; offset += 25) {
    const batch = launchSlots.slice(offset, offset + 25);
    if (batch.length === 0) {
      continue;
    }

    const runResults = await Promise.allSettled(
      batch.map(async (slot) => {
        const { definition, configExtras } = slot;
        return startRunService({
          definitionId: definition.id,
          models: selectedModels,
          samplePercentage,
          samplesPerScenario,
          temperature: temperature ?? undefined,
          priority: 'NORMAL',
          runCategory: scopeCategory,
          userId,
          ...(configExtras !== undefined ? { configExtras } : {}),
        });
      })
    );

    runResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        startedRuns += 1;
        runs.push({
          definitionId: result.value.run.definitionId,
          runId: result.value.run.id,
          modelIds: selectedModels,
        });
        return;
      }
      failedDefinitions += 1;
      const failedSlot = batch[index];
      log.error(
        {
          domainId,
          definitionId: failedSlot?.definition.id ?? null,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          scopeCategory,
        },
        'Failed to start domain evaluation member run'
      );
    });
  }

  return { startedRuns, failedDefinitions, runs };
}

export async function executeBackfillRuns(params: {
  backfillGroups: BackfillLaunchGroupRepetition[];
  snapshot: BackfillEvaluationSnapshot;
  scopeCategory: RunCategory;
  userId: string;
  log: { error: (payload: Record<string, unknown>, message: string) => void };
  domainEvaluationId: string;
  tx: PrismaTransactionClient;
}): Promise<{ startedRuns: number; failedDefinitions: number; runs: DomainTrialRunEntry[] }> {
  const { backfillGroups, snapshot, scopeCategory, userId, log, domainEvaluationId, tx } = params;

  let startedRuns = 0;
  let failedDefinitions = 0;
  const runs: DomainTrialRunEntry[] = [];

  for (const group of backfillGroups) {
    const activeEquivalentRuns = await tx.run.findMany({
      where: {
        definitionId: { in: group.definitions.map((definition) => definition.id) },
        runCategory: scopeCategory,
        status: { in: ACTIVE_RUN_STATUSES },
        deletedAt: null,
      },
      select: {
        definitionId: true,
        config: true,
      },
    });
    const hasActiveEquivalentRun = activeEquivalentRuns.some((run) => runMatchesSingleModel(run.config, group.modelId, snapshot.temperature));
    if (hasActiveEquivalentRun) {
      continue;
    }

    const batchGroupId = group.pairKey !== null ? randomUUID() : null;
    const runResults = await Promise.allSettled(
      group.definitions.map(async (definition) => {
        const tokens = group.pairKey !== null ? getComponentTokens(definition.content) : null;
        return startRunService({
          definitionId: definition.id,
          models: [group.modelId],
          samplePercentage: snapshot.samplePercentage,
          samplesPerScenario: snapshot.samplesPerScenario,
          temperature: snapshot.temperature ?? undefined,
          priority: 'NORMAL',
          runCategory: scopeCategory,
          userId,
          ...(group.pairKey !== null
            ? {
                configExtras: {
                jobChoiceLaunchMode: 'PAIRED_BATCH',
                jobChoiceBatchGroupId: batchGroupId,
                jobChoiceValueFirst: tokens?.value_first.token,
                methodologySafe: true,
              },
            }
            : {}),
        });
      }),
    );

    runResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        startedRuns += 1;
        runs.push({
          definitionId: result.value.run.definitionId,
          runId: result.value.run.id,
          modelIds: [group.modelId],
        });
        return;
      }

      failedDefinitions += 1;
      const failedDefinition = group.definitions[index];
      log.error(
        {
          domainEvaluationId,
          definitionId: failedDefinition?.id ?? null,
          modelId: group.modelId,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        },
        'Failed to start evaluation model backfill run',
      );
    });
  }

  return { startedRuns, failedDefinitions, runs };
}

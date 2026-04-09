import { randomUUID } from 'crypto';
import { db } from '@valuerank/db';
import type { RunCategory } from '@valuerank/db';
import { estimateCost as estimateCostService } from '../../../../services/cost/estimate.js';
import { normalizeModelSet } from '../types.js';
import { parseTemperature } from '../../../../utils/temperature.js';
import { getComponentTokens } from '../../../../utils/auto-pair.js';
import type { DefinitionRow, LaunchGroup, LaunchSlot } from './types.js';

export async function planLaunchSlots(params: {
  groups: LaunchGroup[];
  selectedModels: string[];
  latestDefinitionIds: string[];
  scopeCategory: RunCategory;
  temperature: number | null;
  samplePercentage: number;
  samplesPerScenario: number;
  targetBatchCount: number | null;
  budgetCap: number | null;
  normalizedModels: string[];
}): Promise<{
  launchSlots: LaunchSlot[];
  launchableDefinitions: DefinitionRow[];
  projectedCostUsd: number;
  skippedForBudget: number;
  estimatedCostByDefinitionId: Map<string, number>;
}> {
  const {
    groups,
    selectedModels,
    latestDefinitionIds,
    scopeCategory,
    temperature,
    samplePercentage,
    samplesPerScenario,
    targetBatchCount,
    budgetCap,
    normalizedModels,
  } = params;

  const existingBatchCountByDefinitionId = new Map<string, number>();
  if (targetBatchCount != null && targetBatchCount > 0) {
    const COUNTABLE_STATUSES = ['COMPLETED', 'PENDING', 'RUNNING', 'PAUSED', 'SUMMARIZING'] as const;
    const existingRuns = await db.run.findMany({
      where: {
        definitionId: { in: latestDefinitionIds },
        runCategory: scopeCategory,
        status: { in: [...COUNTABLE_STATUSES] },
        deletedAt: null,
      },
      select: { definitionId: true, config: true },
    });
    for (const run of existingRuns) {
      const runConfig = run.config as {
        temperature?: unknown;
        models?: unknown;
        samplesPerScenario?: unknown;
      } | null;
      const runTemperature = parseTemperature(runConfig?.temperature);
      if (runTemperature !== temperature) continue;
      const runModels = normalizeModelSet(runConfig?.models);
      if (
        runModels.length !== normalizedModels.length ||
        !runModels.every((modelId, index) => modelId === normalizedModels[index])
      ) continue;
      const runSamplesPerScenario =
        typeof runConfig?.samplesPerScenario === 'number' && Number.isFinite(runConfig.samplesPerScenario)
          ? runConfig.samplesPerScenario
          : 1;
      if (runSamplesPerScenario !== samplesPerScenario) continue;
      const prev = existingBatchCountByDefinitionId.get(run.definitionId) ?? 0;
      existingBatchCountByDefinitionId.set(run.definitionId, prev + 1);
    }
  }

  const launchSlots: LaunchSlot[] = [];
  const estimatedCostByDefinitionId = new Map<string, number>();
  let skippedForBudget = 0;
  let projectedCostUsd = 0;

  for (const group of groups) {
    let delta = 1;
    if (targetBatchCount != null && targetBatchCount > 0) {
      if (group.pairKey !== null) {
        const pairMin = group.definitions.reduce(
          (min, def) => Math.min(min, existingBatchCountByDefinitionId.get(def.id) ?? 0),
          Number.POSITIVE_INFINITY,
        );
        delta = Math.max(0, targetBatchCount - (Number.isFinite(pairMin) ? pairMin : 0));
      } else {
        const def = group.definitions[0];
        const existing = def !== undefined ? (existingBatchCountByDefinitionId.get(def.id) ?? 0) : 0;
        delta = Math.max(0, targetBatchCount - existing);
      }
    }

    if (delta === 0) continue;

    if (budgetCap !== null) {
      let groupBaseCost = 0;
      for (const definition of group.definitions) {
        const estimate = await estimateCostService({
          definitionId: definition.id,
          modelIds: selectedModels,
          samplePercentage,
          samplesPerScenario,
        });
        estimatedCostByDefinitionId.set(definition.id, estimate.total);
        groupBaseCost += estimate.total;
      }
      const groupCost = groupBaseCost * delta;
      if (projectedCostUsd + groupCost > budgetCap) {
        skippedForBudget += group.definitions.length * delta;
        continue;
      }
      projectedCostUsd += groupCost;
    }

    for (let i = 0; i < delta; i++) {
      if (group.pairKey !== null) {
        const batchGroupId = randomUUID();
        for (const def of group.definitions) {
          const tokens = getComponentTokens(def.content);
          launchSlots.push({
            definition: def,
            configExtras: {
              jobChoiceLaunchMode: 'PAIRED_BATCH',
              jobChoiceBatchGroupId: batchGroupId,
              jobChoiceValueFirst: tokens?.value_first.token,
              methodologySafe: true,
            },
          });
        }
      } else {
        for (const def of group.definitions) {
          launchSlots.push({ definition: def, configExtras: undefined });
        }
      }
    }
  }

  const launchableDefinitions: DefinitionRow[] = Array.from(
    new Map(launchSlots.map((slot) => [slot.definition.id, slot.definition])).values(),
  );

  return {
    launchSlots,
    launchableDefinitions,
    projectedCostUsd,
    skippedForBudget,
    estimatedCostByDefinitionId,
  };
}

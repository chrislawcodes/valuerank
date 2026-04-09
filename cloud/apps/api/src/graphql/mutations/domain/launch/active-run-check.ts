import { db } from '@valuerank/db';
import type { RunCategory } from '@valuerank/db';
import { normalizeModelSet } from '../types.js';
import { parseTemperature } from '../../../../utils/temperature.js';

export async function checkForActiveEquivalentRun(params: {
  latestDefinitionIds: string[];
  scopeCategory: RunCategory;
  temperature: number | null;
  normalizedModels: string[];
  samplePercentage: number;
  samplesPerScenario: number;
}): Promise<boolean> {
  const { latestDefinitionIds, scopeCategory, temperature, normalizedModels, samplePercentage, samplesPerScenario } = params;

  const activeRuns = await db.run.findMany({
    where: {
      definitionId: { in: latestDefinitionIds },
      runCategory: scopeCategory,
      status: { in: ['PENDING', 'RUNNING', 'PAUSED', 'SUMMARIZING'] },
      deletedAt: null,
    },
    select: {
      id: true,
      definitionId: true,
      config: true,
    },
  });
  const hasActiveEquivalentRun = activeRuns.some((run) => {
    const config = run.config as {
      models?: unknown;
      temperature?: unknown;
      samplePercentage?: unknown;
      samplesPerScenario?: unknown;
    } | null;
    const runModels = normalizeModelSet(config?.models);
    const runTemperature = parseTemperature(config?.temperature);
    const runSamplePercentage =
      typeof config?.samplePercentage === 'number' && Number.isFinite(config.samplePercentage)
        ? config.samplePercentage
        : null;
    const runSamplesPerScenario =
      typeof config?.samplesPerScenario === 'number' && Number.isFinite(config.samplesPerScenario)
        ? config.samplesPerScenario
        : null;

    return runTemperature === temperature
      && runModels.length === normalizedModels.length
      && runModels.every((modelId, index) => modelId === normalizedModels[index])
      && runSamplePercentage === samplePercentage
      && runSamplesPerScenario === samplesPerScenario;
  });

  return hasActiveEquivalentRun;
}

import { createLogger, ValidationError } from '@valuerank/shared';
import { sampleScenarios } from './start-helpers.js';

const log = createLogger('services:run:start');

export type RunJobPlanItem = {
  modelId: string;
  scenarioId: string;
  samples: number;
};

type BuildRunJobPlanInput = {
  definitionId: string;
  models: string[];
  definitionScenarioIds: string[];
  scenarioIds?: string[];
  samplePercentage: number;
  sampleSeed?: number;
  samplesPerScenario: number;
};

export async function buildRunJobPlan(input: BuildRunJobPlanInput): Promise<{
  selectedScenarioIds: string[];
  jobPlan: RunJobPlanItem[];
}> {
  const {
    definitionId,
    models,
    definitionScenarioIds,
    scenarioIds,
    samplePercentage,
    sampleSeed,
    samplesPerScenario,
  } = input;

  let selectedScenarioIds: string[] = [];
  const jobPlan: RunJobPlanItem[] = [];

  if (Array.isArray(scenarioIds) && scenarioIds.length > 0) {
    const allScenarioIdSet = new Set(definitionScenarioIds);
    selectedScenarioIds = Array.from(new Set(scenarioIds));

    const invalidScenarioIds = selectedScenarioIds.filter((scenarioId) => !allScenarioIdSet.has(scenarioId));
    if (invalidScenarioIds.length > 0) {
      throw new ValidationError(
        `Invalid scenarioIds for definition ${definitionId}: ${invalidScenarioIds.join(', ')}`
      );
    }

    for (const modelId of models) {
      for (const scenarioId of selectedScenarioIds) {
        jobPlan.push({
          modelId,
          scenarioId,
          samples: samplesPerScenario,
        });
      }
    }

    log.debug(
      { definitionId, selectedScenarios: selectedScenarioIds.length },
      'Using explicit scenario selection'
    );
    return { selectedScenarioIds, jobPlan };
  }

  selectedScenarioIds = sampleScenarios(definitionScenarioIds, samplePercentage, definitionId, sampleSeed);

  for (const modelId of models) {
    for (const scenarioId of selectedScenarioIds) {
      jobPlan.push({
        modelId,
        scenarioId,
        samples: samplesPerScenario,
      });
    }
  }

  log.debug(
    { definitionId, totalScenarios: definitionScenarioIds.length, sampledScenarios: selectedScenarioIds.length },
    'Scenarios sampled'
  );

  return { selectedScenarioIds, jobPlan };
}

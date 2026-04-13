import { createLogger, ValidationError } from '@valuerank/shared';
import { planFinalTrial } from './plan-final-trial.js';
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
  finalTrial: boolean;
  temperature?: number | null;
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
    finalTrial,
    temperature,
    scenarioIds,
    samplePercentage,
    sampleSeed,
    samplesPerScenario,
  } = input;

  let selectedScenarioIds: string[] = [];
  const jobPlan: RunJobPlanItem[] = [];

  if (finalTrial) {
    const plan = await planFinalTrial(definitionId, models, temperature ?? null);

    plan.models.forEach((modelPlan) => {
      modelPlan.conditions.forEach((condition) => {
        if (condition.neededSamples > 0) {
          jobPlan.push({
            modelId: modelPlan.modelId,
            scenarioId: condition.scenarioId,
            samples: condition.neededSamples,
          });
        }
      });
    });

    selectedScenarioIds = Array.from(new Set(jobPlan.map((job) => job.scenarioId)));

    log.info({ runPlanSize: jobPlan.length, scenariosInvolved: selectedScenarioIds.length }, 'Final Trial plan generated');
    return { selectedScenarioIds, jobPlan };
  }

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

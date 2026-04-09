import { normalizeModelSet } from '../types.js';
import { parseTemperature } from '../../../../utils/temperature.js';
import type { BackfillEvaluationSnapshot } from './types.js';

export function getBackfillSnapshot(configSnapshot: unknown): BackfillEvaluationSnapshot | null {
  if (configSnapshot == null || typeof configSnapshot !== 'object' || Array.isArray(configSnapshot)) {
    return null;
  }

  const snapshot = configSnapshot as Record<string, unknown>;
  const models = normalizeModelSet(snapshot.models);
  const launchableDefinitionIds = Array.isArray(snapshot.launchableDefinitionIds)
    ? snapshot.launchableDefinitionIds.filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    : [];
  const temperature = parseTemperature(snapshot.temperature);
  const samplePercentage = typeof snapshot.samplePercentage === 'number' && Number.isFinite(snapshot.samplePercentage)
    ? snapshot.samplePercentage
    : null;
  const samplesPerScenario = typeof snapshot.samplesPerScenario === 'number' && Number.isFinite(snapshot.samplesPerScenario)
    ? snapshot.samplesPerScenario
    : null;
  const startedRuns = typeof snapshot.startedRuns === 'number' && Number.isFinite(snapshot.startedRuns)
    ? snapshot.startedRuns
    : 0;
  const failedDefinitions = typeof snapshot.failedDefinitions === 'number' && Number.isFinite(snapshot.failedDefinitions)
    ? snapshot.failedDefinitions
    : 0;
  const skippedForBudget = typeof snapshot.skippedForBudget === 'number' && Number.isFinite(snapshot.skippedForBudget)
    ? snapshot.skippedForBudget
    : 0;
  const projectedCostUsd = typeof snapshot.projectedCostUsd === 'number' && Number.isFinite(snapshot.projectedCostUsd)
    ? snapshot.projectedCostUsd
    : 0;

  if (models.length === 0 || launchableDefinitionIds.length === 0 || samplePercentage === null || samplesPerScenario === null) {
    return null;
  }

  return {
    models,
    launchableDefinitionIds,
    temperature,
    samplePercentage,
    samplesPerScenario,
    startedRuns,
    failedDefinitions,
    skippedForBudget,
    projectedCostUsd,
  };
}

export function runMatchesSingleModel(config: unknown, modelId: string, temperature: number | null): boolean {
  const runConfig = config as { models?: unknown; temperature?: unknown } | null;
  const runModels = normalizeModelSet(runConfig?.models);
  const runTemperature = parseTemperature(runConfig?.temperature);
  return runTemperature === temperature && runModels.length === 1 && runModels[0] === modelId;
}

export function coverageKey(definitionId: string, modelId: string): string {
  return `${definitionId}::${modelId}`;
}

export function getCoverageCount(coverageCounts: Map<string, number>, definitionId: string, modelId: string): number {
  return coverageCounts.get(coverageKey(definitionId, modelId)) ?? 0;
}

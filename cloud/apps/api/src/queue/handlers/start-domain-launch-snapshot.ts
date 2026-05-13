import { type Prisma, type RunCategory } from '@valuerank/db';

export const BACKPRESSURE_THRESHOLD = 2000;
export const BACKPRESSURE_POLL_MS = 5_000;
export const INTER_LAUNCH_DELAY_MS = 1_000;
export const FLUSH_EVERY = 5;
export const MAX_CONSECUTIVE_QUEUE_ERRORS = 5;

const RUN_CATEGORIES: RunCategory[] = ['PILOT', 'PRODUCTION', 'REPLICATION', 'VALIDATION', 'UNKNOWN_LEGACY'];

export type LaunchSnapshot = {
  raw: Prisma.JsonObject;
  launchableDefinitionIds: string[];
  models: string[];
  temperature: number | null;
  samplePercentage: number;
  samplesPerScenario: number;
  scopeCategory: RunCategory;
};

function asJsonObject(value: unknown): Prisma.JsonObject | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Prisma.JsonObject;
}

export function parseLaunchSnapshot(configSnapshot: unknown): LaunchSnapshot | null {
  const raw = asJsonObject(configSnapshot);
  if (raw === null) {
    return null;
  }

  const launchableDefinitionIds = Array.isArray(raw.launchableDefinitionIds)
    ? raw.launchableDefinitionIds.filter(
      (value): value is string => typeof value === 'string' && value.trim() !== '',
    )
    : [];
  const models = Array.isArray(raw.models)
    ? raw.models.filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    : [];
  const temperature =
    typeof raw.temperature === 'number' || raw.temperature === null
      ? raw.temperature
      : undefined;
  const samplePercentage =
    typeof raw.samplePercentage === 'number' && Number.isFinite(raw.samplePercentage)
      ? raw.samplePercentage
      : undefined;
  const samplesPerScenario =
    typeof raw.samplesPerScenario === 'number' && Number.isFinite(raw.samplesPerScenario)
      ? raw.samplesPerScenario
      : undefined;
  const runCategory = typeof raw.runCategory === 'string' ? raw.runCategory : undefined;

  if (
    launchableDefinitionIds.length === 0 ||
    models.length === 0 ||
    temperature === undefined ||
    samplePercentage === undefined ||
    samplesPerScenario === undefined ||
    runCategory === undefined ||
    !RUN_CATEGORIES.includes(runCategory as RunCategory)
  ) {
    return null;
  }

  return {
    raw,
    launchableDefinitionIds,
    models,
    temperature,
    samplePercentage,
    samplesPerScenario,
    scopeCategory: runCategory as RunCategory,
  };
}

export function buildSnapshotUpdate(
  raw: Prisma.JsonObject,
  startedRuns: number,
  failedDefinitions: number,
): Prisma.InputJsonValue {
  return {
    ...raw,
    startedRuns,
    failedDefinitions,
  } as Prisma.InputJsonValue;
}

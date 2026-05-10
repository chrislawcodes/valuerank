import type { RunStatus } from '@valuerank/db';

export type {
  DomainTrialRunEntry,
  DomainTrialRunResult,
} from '../types.js';

export type DefinitionRow = {
  id: string;
  name: string;
  parentId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId?: string | null;
  content: unknown;
};

export type LaunchGroup = {
  definitions: DefinitionRow[];
};

export const ACTIVE_RUN_STATUSES: RunStatus[] = ['PENDING', 'RUNNING', 'PAUSED', 'SUMMARIZING'];
export const COUNTABLE_RUN_STATUSES: RunStatus[] = ['COMPLETED', ...ACTIVE_RUN_STATUSES];

export type BackfillEvaluationSnapshot = {
  models: string[];
  launchableDefinitionIds: string[];
  temperature: number | null;
  samplePercentage: number;
  samplesPerScenario: number;
  startedRuns: number;
  failedDefinitions: number;
  skippedForBudget: number;
  projectedCostUsd: number;
};

export type BackfillLaunchGroupRepetition = {
  definitions: DefinitionRow[];
  modelId: string;
};

export type LaunchSlot = {
  definition: DefinitionRow;
  configExtras: Record<string, unknown> | undefined;
};

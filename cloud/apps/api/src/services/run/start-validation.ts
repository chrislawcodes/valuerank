import { ValidationError } from '@valuerank/shared';
import type { RunCategory } from '@valuerank/db';

export type StartRunInput = {
  definitionId: string;
  models: string[];
  samplePercentage?: number;
  sampleSeed?: number;
  samplesPerScenario?: number; // Number of samples per scenario-model pair (1-100, default 1)
  temperature?: number;
  priority?: string;
  runCategory?: RunCategory;
  experimentId?: string;
  userId?: string | null;
  scenarioIds?: string[];
  configExtras?: Record<string, unknown>;
};

const VALID_PRIORITIES = ['LOW', 'NORMAL', 'HIGH'] as const;

export function validateStartRunInput(input: StartRunInput): void {
  const { models, samplePercentage = 100, samplesPerScenario = 1, temperature, priority = 'NORMAL' } = input;

  if (models.length === 0) {
    throw new ValidationError('At least one model must be specified');
  }

  if (samplePercentage < 1 || samplePercentage > 100) {
    throw new ValidationError('samplePercentage must be between 1 and 100');
  }

  if (samplesPerScenario < 1 || samplesPerScenario > 100) {
    throw new ValidationError('samplesPerScenario must be between 1 and 100');
  }

  if (temperature !== undefined && (temperature < 0 || temperature > 2)) {
    throw new ValidationError('temperature must be between 0 and 2');
  }

  if (!VALID_PRIORITIES.includes(priority as typeof VALID_PRIORITIES[number])) {
    throw new ValidationError(`Invalid priority: ${priority}. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }
}

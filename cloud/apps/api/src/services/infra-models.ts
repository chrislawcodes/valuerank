/**
 * Infrastructure Model Service
 *
 * Provides helpers for fetching configured infrastructure models
 * used for internal tasks like scenario expansion.
 */

import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('infra-models');

export type InfraModelPurpose = 'scenario_expansion' | 'summarizer';

export type InfraModelConfig = {
  modelId: string;
  providerId: string;
  providerName: string;
  displayName: string;
  apiConfig?: Record<string, unknown> | null;
};

/**
 * Get the configured infrastructure model for a specific purpose.
 *
 * @param purpose - The purpose key (e.g., "scenario_expansion")
 * @returns The model configuration or null if not configured
 */
export async function getInfraModel(purpose: InfraModelPurpose): Promise<InfraModelConfig | null> {
  const key = `infra_model_${purpose}`;

  log.debug({ purpose, key }, 'Fetching infrastructure model');

  const setting = await db.systemSetting.findUnique({
    where: { key },
  });

  if (!setting) {
    log.debug({ purpose }, 'No infrastructure model configured');
    return null;
  }

  const value = setting.value as { modelId?: string; providerId?: string };
  if (!value.modelId || !value.providerId) {
    log.warn({ purpose, value }, 'Invalid infrastructure model configuration');
    return null;
  }

  // Find the provider by name
  const provider = await db.llmProvider.findUnique({
    where: { name: value.providerId },
  });

  if (!provider) {
    log.warn({ purpose, providerId: value.providerId }, 'Provider not found for infrastructure model');
    return null;
  }

  // Find the model
  const model = await db.llmModel.findUnique({
    where: {
      providerId_modelId: {
        providerId: provider.id,
        modelId: value.modelId,
      },
    },
  });

  if (!model) {
    log.warn({ purpose, modelId: value.modelId }, 'Model not found for infrastructure model');
    return null;
  }

  log.info({ purpose, modelId: model.modelId, provider: provider.name }, 'Infrastructure model resolved');

  return {
    modelId: model.modelId,
    providerId: provider.id,
    providerName: provider.name,
    displayName: model.displayName,
    apiConfig: model.apiConfig as Record<string, unknown> | null,
  };
}

/**
 * Get the default infrastructure model for scenario expansion.
 * Falls back to a hardcoded default if not configured.
 */
export async function getScenarioExpansionModel(): Promise<InfraModelConfig> {
  const configured = await getInfraModel('scenario_expansion');

  if (configured) {
    return configured;
  }

  // Default fallback - use Anthropic Claude 3.5 Haiku for cost efficiency
  log.info('Using default scenario expansion model (claude-3-5-haiku)');

  return {
    modelId: 'claude-3-5-haiku-20241022',
    providerId: 'anthropic',
    providerName: 'anthropic',
    displayName: 'Claude 3.5 Haiku (Default)',
    apiConfig: null,
  };
}

/**
 * Get the configured infrastructure model for transcript summarization.
 * Falls back to the lowest cost active model if not configured.
 */
export async function getSummarizerModel(): Promise<InfraModelConfig> {
  const configured = await getInfraModel('summarizer');

  if (configured) {
    return configured;
  }

  // Fall back to the lowest cost active model
  log.info('No summarizer model configured, finding lowest cost model');

  const lowestCostModel = await db.llmModel.findFirst({
    where: {
      status: 'ACTIVE',
      provider: {
        isEnabled: true,
      },
    },
    orderBy: [
      { costInputPerMillion: 'asc' },
      { costOutputPerMillion: 'asc' },
    ],
    include: {
      provider: true,
    },
  });

  if (lowestCostModel) {
    log.info(
      { modelId: lowestCostModel.modelId, provider: lowestCostModel.provider.name },
      'Using lowest cost model for summarization'
    );

    return {
      modelId: lowestCostModel.modelId,
      providerId: lowestCostModel.provider.id,
      providerName: lowestCostModel.provider.name,
      displayName: `${lowestCostModel.displayName} (Lowest Cost)`,
      apiConfig: lowestCostModel.apiConfig as Record<string, unknown> | null,
    };
  }

  // Ultimate fallback if no models exist
  log.warn('No active models found, using hardcoded default');

  return {
    modelId: 'claude-3-5-haiku-20241022',
    providerId: 'anthropic',
    providerName: 'anthropic',
    displayName: 'Claude 3.5 Haiku (Default)',
    apiConfig: null,
  };
}

/**
 * Check if code-based scenario expansion is enabled.
 * When enabled, scenarios are generated using combinatorial logic
 * instead of calling an LLM.
 */
export async function isCodeGenerationEnabled(): Promise<boolean> {
  const key = 'scenario_expansion_use_code_generation';

  const setting = await db.systemSetting.findUnique({
    where: { key },
  });

  if (!setting) {
    log.debug('Code generation setting not found, defaulting to false');
    return false;
  }

  const value = setting.value as { enabled?: boolean };
  const enabled = value?.enabled === true;

  log.debug({ enabled }, 'Code generation setting');
  return enabled;
}

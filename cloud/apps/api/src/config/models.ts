/**
 * Available Models Configuration
 *
 * Defines all supported LLM providers and models for evaluation runs.
 * Models are available if the corresponding API key is configured.
 */

import { getEnvOptional } from '@valuerank/shared';

export type AvailableModel = {
  id: string;
  providerId: string;
  displayName: string;
  versions: string[];
  defaultVersion: string | null;
  isAvailable: boolean;
};

export type LLMProvider = {
  id: string;
  name: string;
  envKey: string;
  models: Array<{
    id: string;
    displayName: string;
    versions?: string[];
    defaultVersion?: string;
  }>;
};

/**
 * Supported LLM providers and their models.
 * Environment variable names define which API key is needed.
 */
export const LLM_PROVIDERS: LLMProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    models: [
      { id: 'gpt-4o', displayName: 'GPT-4o', versions: ['gpt-4o-2024-11-20', 'gpt-4o-2024-08-06'], defaultVersion: 'gpt-4o-2024-11-20' },
      { id: 'gpt-4o-mini', displayName: 'GPT-4o Mini', versions: ['gpt-4o-mini-2024-07-18'], defaultVersion: 'gpt-4o-mini-2024-07-18' },
      { id: 'gpt-4-turbo', displayName: 'GPT-4 Turbo', versions: ['gpt-4-turbo-2024-04-09'], defaultVersion: 'gpt-4-turbo-2024-04-09' },
      { id: 'o1', displayName: 'o1', versions: ['o1-2024-12-17'], defaultVersion: 'o1-2024-12-17' },
      { id: 'o1-mini', displayName: 'o1 Mini', versions: ['o1-mini-2024-09-12'], defaultVersion: 'o1-mini-2024-09-12' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    models: [
      { id: 'claude-sonnet-4', displayName: 'Claude Sonnet 4', versions: ['claude-sonnet-4-20250514'], defaultVersion: 'claude-sonnet-4-20250514' },
      { id: 'claude-3-5-sonnet', displayName: 'Claude 3.5 Sonnet', versions: ['claude-3-5-sonnet-20241022', 'claude-3-5-sonnet-20240620'], defaultVersion: 'claude-3-5-sonnet-20241022' },
      { id: 'claude-3-5-haiku', displayName: 'Claude 3.5 Haiku', versions: ['claude-3-5-haiku-20241022'], defaultVersion: 'claude-3-5-haiku-20241022' },
      { id: 'claude-3-opus', displayName: 'Claude 3 Opus', versions: ['claude-3-opus-20240229'], defaultVersion: 'claude-3-opus-20240229' },
    ],
  },
  {
    id: 'google',
    name: 'Google',
    envKey: 'GOOGLE_API_KEY',
    models: [
      { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', versions: ['gemini-2.0-flash-exp'], defaultVersion: 'gemini-2.0-flash-exp' },
      { id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', versions: ['gemini-1.5-pro-002', 'gemini-1.5-pro-001'], defaultVersion: 'gemini-1.5-pro-002' },
      { id: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', versions: ['gemini-1.5-flash-002', 'gemini-1.5-flash-001'], defaultVersion: 'gemini-1.5-flash-002' },
    ],
  },
  {
    id: 'xai',
    name: 'xAI',
    envKey: 'XAI_API_KEY',
    models: [
      { id: 'grok-2', displayName: 'Grok 2', versions: ['grok-2-1212'], defaultVersion: 'grok-2-1212' },
      { id: 'grok-2-mini', displayName: 'Grok 2 Mini', versions: ['grok-2-mini'], defaultVersion: 'grok-2-mini' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    models: [
      { id: 'deepseek-chat', displayName: 'DeepSeek Chat', versions: ['deepseek-chat'], defaultVersion: 'deepseek-chat' },
      { id: 'deepseek-reasoner', displayName: 'DeepSeek Reasoner', versions: ['deepseek-reasoner'], defaultVersion: 'deepseek-reasoner' },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    envKey: 'MISTRAL_API_KEY',
    models: [
      { id: 'mistral-large', displayName: 'Mistral Large', versions: ['mistral-large-latest'], defaultVersion: 'mistral-large-latest' },
      { id: 'mistral-small', displayName: 'Mistral Small', versions: ['mistral-small-latest'], defaultVersion: 'mistral-small-latest' },
    ],
  },
];

/**
 * Check if a provider's API key is configured.
 */
export function isProviderConfigured(envKey: string): boolean {
  const key = getEnvOptional(envKey);
  return key !== undefined && key.length > 0;
}

/**
 * Get all available models with availability status.
 * Returns models from all providers, marking unavailable those without API keys.
 */
export function getAvailableModels(): AvailableModel[] {
  const models: AvailableModel[] = [];

  for (const provider of LLM_PROVIDERS) {
    const isAvailable = isProviderConfigured(provider.envKey);

    for (const model of provider.models) {
      models.push({
        id: model.id,
        providerId: provider.id,
        displayName: model.displayName,
        versions: model.versions ?? [model.id],
        defaultVersion: model.defaultVersion ?? null,
        isAvailable,
      });
    }
  }

  return models;
}

/**
 * Get provider information by ID.
 */
export function getProvider(providerId: string): LLMProvider | undefined {
  return LLM_PROVIDERS.find((p) => p.id === providerId);
}

/**
 * Get model info with full model ID (provider:model format).
 */
export function parseModelId(fullModelId: string): { providerId: string; modelId: string } | null {
  // Handle format "provider:model" or just "model"
  if (fullModelId.includes(':')) {
    const [providerId, modelId] = fullModelId.split(':');
    if (providerId && modelId) {
      return { providerId, modelId };
    }
  }

  // Try to find the model in any provider
  for (const provider of LLM_PROVIDERS) {
    for (const model of provider.models) {
      if (model.id === fullModelId || model.versions?.includes(fullModelId)) {
        return { providerId: provider.id, modelId: model.id };
      }
    }
  }

  return null;
}

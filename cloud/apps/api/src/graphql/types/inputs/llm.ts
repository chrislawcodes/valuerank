/**
 * LLM Input Types
 *
 * Input types for LLM provider and model mutations.
 */

import { builder } from '../../builder.js';

/**
 * Input for creating a new LLM model.
 */
export const CreateLlmModelInput = builder.inputType('CreateLlmModelInput', {
  description: 'Input for creating a new LLM model',
  fields: (t) => ({
    providerId: t.string({
      required: true,
      description: 'Provider ID this model belongs to',
    }),
    modelId: t.string({
      required: true,
      description: 'API model identifier (e.g., "gpt-4o-mini")',
    }),
    displayName: t.string({
      required: true,
      description: 'Human-readable display name',
    }),
    costInputPerMillion: t.float({
      required: true,
      description: 'Cost per 1M input tokens in USD',
    }),
    costOutputPerMillion: t.float({
      required: true,
      description: 'Cost per 1M output tokens in USD',
    }),
    setAsDefault: t.boolean({
      required: false,
      description: 'Set as default for this provider',
    }),
  }),
});

/**
 * Input for updating an LLM model.
 */
export const UpdateLlmModelInput = builder.inputType('UpdateLlmModelInput', {
  description: 'Input for updating an LLM model (model ID cannot be changed)',
  fields: (t) => ({
    displayName: t.string({
      required: false,
      description: 'Updated display name',
    }),
    costInputPerMillion: t.float({
      required: false,
      description: 'Updated cost per 1M input tokens',
    }),
    costOutputPerMillion: t.float({
      required: false,
      description: 'Updated cost per 1M output tokens',
    }),
    apiConfig: t.field({
      type: 'JSON',
      required: false,
      description: 'Provider-specific API configuration (e.g., {"maxTokensParam": "max_completion_tokens"}). Set to null to clear.',
    }),
  }),
});

/**
 * Input for updating provider settings.
 */
export const UpdateLlmProviderInput = builder.inputType('UpdateLlmProviderInput', {
  description: 'Input for updating LLM provider settings',
  fields: (t) => ({
    maxParallelRequests: t.int({
      required: false,
      description: 'Max concurrent API requests',
    }),
    requestsPerMinute: t.int({
      required: false,
      description: 'Rate limit (requests per minute)',
    }),
    isEnabled: t.boolean({
      required: false,
      description: 'Whether provider is enabled',
    }),
  }),
});

/**
 * Input for updating a system setting.
 */
export const UpdateSystemSettingInput = builder.inputType('UpdateSystemSettingInput', {
  description: 'Input for updating a system setting',
  fields: (t) => ({
    key: t.string({
      required: true,
      description: 'Setting key',
    }),
    value: t.field({
      type: 'JSON',
      required: true,
      description: 'New value (JSON)',
    }),
  }),
});

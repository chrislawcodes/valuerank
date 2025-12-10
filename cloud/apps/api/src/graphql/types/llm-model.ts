/**
 * LlmModel GraphQL Type
 *
 * Represents a specific LLM model with pricing and lifecycle status.
 */

import { db } from '@valuerank/db';
import { builder } from '../builder.js';
import { LlmModelRef, LlmProviderRef } from './refs.js';
import { UserRef } from './user.js';
import { getAvailableProviders } from '../../config/models.js';

LlmModelRef.implement({
  description: 'An LLM model with pricing and lifecycle status',
  fields: (t) => ({
    id: t.exposeID('id'),
    providerId: t.exposeID('providerId', {
      description: 'Provider this model belongs to',
    }),
    modelId: t.exposeString('modelId', {
      description: 'API model identifier (e.g., "gpt-4o-mini")',
    }),
    displayName: t.exposeString('displayName', {
      description: 'Human-readable name (e.g., "GPT-4o Mini")',
    }),
    costInputPerMillion: t.field({
      type: 'Float',
      description: 'Cost per 1M input tokens in USD',
      resolve: (model) => Number(model.costInputPerMillion),
    }),
    costOutputPerMillion: t.field({
      type: 'Float',
      description: 'Cost per 1M output tokens in USD',
      resolve: (model) => Number(model.costOutputPerMillion),
    }),
    status: t.exposeString('status', {
      description: 'Lifecycle status (ACTIVE or DEPRECATED)',
    }),
    isDefault: t.exposeBoolean('isDefault', {
      description: 'Whether this is the default model for its provider',
    }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),

    // Audit field: who created this model
    createdBy: t.field({
      type: UserRef,
      nullable: true,
      description: 'User who created this LLM model',
      resolve: async (model) => {
        if (!model.createdByUserId) return null;
        return db.user.findUnique({
          where: { id: model.createdByUserId },
        });
      },
    }),

    // Relations
    provider: t.field({
      type: LlmProviderRef,
      description: 'The provider this model belongs to',
      resolve: async (model) => {
        const provider = await db.llmProvider.findUnique({
          where: { id: model.providerId },
        });
        if (!provider) {
          throw new Error(`Provider not found for model ${model.id}`);
        }
        return provider;
      },
    }),

    // Computed field
    isAvailable: t.field({
      type: 'Boolean',
      description: 'Whether this model is available (provider has API key configured)',
      resolve: async (model) => {
        const provider = await db.llmProvider.findUnique({
          where: { id: model.providerId },
        });
        if (!provider) return false;

        // Check if provider has API key configured
        const availableProviders = getAvailableProviders();
        return availableProviders.includes(provider.name);
      },
    }),

    // API configuration
    apiConfig: t.field({
      type: 'JSON',
      nullable: true,
      description: 'Provider-specific API configuration (e.g., {"maxTokensParam": "max_completion_tokens"})',
      resolve: (model) => model.apiConfig,
    }),
  }),
});

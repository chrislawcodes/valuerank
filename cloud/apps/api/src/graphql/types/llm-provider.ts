/**
 * LlmProvider GraphQL Type
 *
 * Represents an LLM API provider (e.g., OpenAI, Anthropic) with rate limiting settings.
 */

import { db } from '@valuerank/db';
import { LlmProviderRef, LlmModelRef } from './refs.js';

LlmProviderRef.implement({
  description: 'An LLM API provider with rate limiting and parallelism settings',
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name', {
      description: 'Provider identifier (e.g., "openai", "anthropic")',
    }),
    displayName: t.exposeString('displayName', {
      description: 'Human-readable name (e.g., "OpenAI")',
    }),
    maxParallelRequests: t.exposeInt('maxParallelRequests', {
      description: 'Maximum concurrent API requests allowed',
    }),
    requestsPerMinute: t.exposeInt('requestsPerMinute', {
      description: 'Rate limit (requests per minute)',
    }),
    isEnabled: t.exposeBoolean('isEnabled', {
      description: 'Whether the provider is available for use',
    }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),

    // Relations
    models: t.field({
      type: [LlmModelRef],
      description: 'All models belonging to this provider',
      resolve: async (provider) => {
        return db.llmModel.findMany({
          where: { providerId: provider.id },
          orderBy: { displayName: 'asc' },
        });
      },
    }),

    activeModels: t.field({
      type: [LlmModelRef],
      description: 'Active models only (excludes deprecated)',
      resolve: async (provider) => {
        return db.llmModel.findMany({
          where: { providerId: provider.id, status: 'ACTIVE' },
          orderBy: { displayName: 'asc' },
        });
      },
    }),

    defaultModel: t.field({
      type: LlmModelRef,
      nullable: true,
      description: 'The default model for this provider',
      resolve: async (provider) => {
        return db.llmModel.findFirst({
          where: { providerId: provider.id, isDefault: true },
        });
      },
    }),
  }),
});

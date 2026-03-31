/**
 * LlmProvider GraphQL Type
 *
 * Represents an LLM API provider (e.g., OpenAI, Anthropic) with rate limiting settings.
 */

import { db } from '@valuerank/db';
import { LlmProviderRef, LlmModelRef, ProviderBalanceSyncLogRef } from './refs.js';

// ProviderBalanceSyncLog GQL object type
ProviderBalanceSyncLogRef.implement({
  description: 'A record of a manual balance sync for a provider',
  fields: (t) => ({
    id: t.exposeID('id'),
    providerId: t.exposeString('providerId'),
    systemBalanceAtSync: t.field({
      type: 'Float',
      description: 'System-tracked balance at the time of sync',
      resolve: (log) => log.systemBalanceAtSync.toNumber(),
    }),
    enteredBalance: t.field({
      type: 'Float',
      description: 'Real balance entered by the user',
      resolve: (log) => log.enteredBalance.toNumber(),
    }),
    delta: t.field({
      type: 'Float',
      description: 'Difference: enteredBalance - systemBalanceAtSync',
      resolve: (log) => log.delta.toNumber(),
    }),
    syncedAt: t.expose('syncedAt', { type: 'DateTime' }),
    createdByUserId: t.exposeString('createdByUserId', { nullable: true }),
  }),
});

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
    balance: t.field({
      type: 'Float',
      nullable: true,
      description: 'Remaining budget balance in dollars (null = budget tracking disabled)',
      resolve: (provider) => (provider.balance !== null ? provider.balance.toNumber() : null),
    }),
    lastSyncedAt: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'Timestamp of the most recent manual balance sync (null = never synced)',
      resolve: async (provider) => {
        const latest = await db.providerBalanceSyncLog.findFirst({
          where: { providerId: provider.id },
          orderBy: { syncedAt: 'desc' },
          select: { syncedAt: true },
        });
        return latest?.syncedAt ?? null;
      },
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

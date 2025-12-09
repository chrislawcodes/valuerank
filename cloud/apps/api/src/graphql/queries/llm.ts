/**
 * LLM Provider & Model Queries
 *
 * GraphQL queries for LLM providers, models, and system settings.
 */

import { db } from '@valuerank/db';
import { builder } from '../builder.js';
import { LlmProviderRef, LlmModelRef, SystemSettingRef } from '../types/refs.js';
import type { LlmModelStatus } from '@prisma/client';

// Query: llmProviders - List all LLM providers
builder.queryField('llmProviders', (t) =>
  t.field({
    type: [LlmProviderRef],
    description: 'List all LLM providers with their models and availability status',
    resolve: async (_root, _args, ctx) => {
      ctx.log.debug('Fetching LLM providers');

      const providers = await db.llmProvider.findMany({
        orderBy: { displayName: 'asc' },
      });

      ctx.log.debug({ count: providers.length }, 'LLM providers fetched');
      return providers;
    },
  })
);

// Query: llmProvider - Get a specific provider by ID
builder.queryField('llmProvider', (t) =>
  t.field({
    type: LlmProviderRef,
    nullable: true,
    description: 'Get a specific LLM provider by ID',
    args: {
      id: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ id: args.id }, 'Fetching LLM provider');

      return db.llmProvider.findUnique({
        where: { id: args.id },
      });
    },
  })
);

// Query: llmModels - List all LLM models with optional filters
builder.queryField('llmModels', (t) =>
  t.field({
    type: [LlmModelRef],
    description: 'List all LLM models, optionally filtered by provider or status',
    args: {
      providerId: t.arg.string({ required: false, description: 'Filter by provider ID' }),
      status: t.arg.string({ required: false, description: 'Filter by status (ACTIVE or DEPRECATED)' }),
      availableOnly: t.arg.boolean({ required: false, description: 'Only show available models' }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ providerId: args.providerId, status: args.status }, 'Fetching LLM models');

      const where: {
        providerId?: string;
        status?: LlmModelStatus;
      } = {};

      if (args.providerId) where.providerId = args.providerId;
      if (args.status) where.status = args.status as LlmModelStatus;

      const models = await db.llmModel.findMany({
        where,
        orderBy: [{ provider: { displayName: 'asc' } }, { displayName: 'asc' }],
        include: { provider: true },
      });

      ctx.log.debug({ count: models.length }, 'LLM models fetched');
      return models;
    },
  })
);

// Query: llmModel - Get a specific model by ID
builder.queryField('llmModel', (t) =>
  t.field({
    type: LlmModelRef,
    nullable: true,
    description: 'Get a specific LLM model by ID',
    args: {
      id: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ id: args.id }, 'Fetching LLM model');

      return db.llmModel.findUnique({
        where: { id: args.id },
      });
    },
  })
);

// Query: llmModelByIdentifier - Get model by provider name and model ID
builder.queryField('llmModelByIdentifier', (t) =>
  t.field({
    type: LlmModelRef,
    nullable: true,
    description: 'Get a model by provider name and model ID (e.g., "openai" and "gpt-4o-mini")',
    args: {
      providerName: t.arg.string({ required: true, description: 'Provider name (e.g., "openai")' }),
      modelId: t.arg.string({ required: true, description: 'Model ID (e.g., "gpt-4o-mini")' }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ providerName: args.providerName, modelId: args.modelId }, 'Fetching LLM model by identifier');

      const provider = await db.llmProvider.findUnique({
        where: { name: args.providerName },
      });

      if (!provider) return null;

      return db.llmModel.findUnique({
        where: {
          providerId_modelId: {
            providerId: provider.id,
            modelId: args.modelId,
          },
        },
      });
    },
  })
);

// Query: systemSettings - List all system settings
builder.queryField('systemSettings', (t) =>
  t.field({
    type: [SystemSettingRef],
    description: 'List all system settings',
    resolve: async (_root, _args, ctx) => {
      ctx.log.debug('Fetching system settings');

      const settings = await db.systemSetting.findMany({
        orderBy: { key: 'asc' },
      });

      ctx.log.debug({ count: settings.length }, 'System settings fetched');
      return settings;
    },
  })
);

// Query: systemSetting - Get a specific setting by key
builder.queryField('systemSetting', (t) =>
  t.field({
    type: SystemSettingRef,
    nullable: true,
    description: 'Get a specific system setting by key',
    args: {
      key: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ key: args.key }, 'Fetching system setting');

      return db.systemSetting.findUnique({
        where: { key: args.key },
      });
    },
  })
);

// Query: infraModel - Get the configured infrastructure model for a purpose
builder.queryField('infraModel', (t) =>
  t.field({
    type: LlmModelRef,
    nullable: true,
    description: 'Get the configured infrastructure model for a specific purpose (e.g., "scenario_expansion")',
    args: {
      purpose: t.arg.string({ required: true, description: 'Purpose key (e.g., "scenario_expansion")' }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ purpose: args.purpose }, 'Fetching infrastructure model');

      const key = `infra_model_${args.purpose}`;
      const setting = await db.systemSetting.findUnique({
        where: { key },
      });

      if (!setting) return null;

      const value = setting.value as { modelId?: string; providerId?: string };
      if (!value.modelId || !value.providerId) return null;

      const provider = await db.llmProvider.findUnique({
        where: { name: value.providerId },
      });

      if (!provider) return null;

      return db.llmModel.findUnique({
        where: {
          providerId_modelId: {
            providerId: provider.id,
            modelId: value.modelId,
          },
        },
      });
    },
  })
);

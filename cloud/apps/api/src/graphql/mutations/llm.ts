/**
 * LLM Provider & Model Mutations
 *
 * GraphQL mutations for managing LLM providers, models, and system settings.
 */

import { builder } from '../builder.js';
import { LlmModelRef, LlmProviderRef, SystemSettingRef } from '../types/refs.js';
import {
  CreateLlmModelInput,
  UpdateLlmModelInput,
  UpdateLlmProviderInput,
  UpdateSystemSettingInput,
} from '../types/inputs/llm.js';
import type { LlmModel } from '@valuerank/db';
import {
  createModel,
  updateModel,
  deprecateModel,
  reactivateModel,
  setDefaultModel,
  updateProvider,
  upsertSetting,
} from '@valuerank/db';
import { createAuditLog } from '../../services/audit/index.js';
import { getBoss, isBossRunning } from '../../queue/boss.js';
import { reregisterProviderHandler } from '../../queue/handlers/index.js';

// Result type for model deprecation
type DeprecateModelResultShape = {
  model: LlmModel;
  newDefault: LlmModel | null;
};

const DeprecateModelResultRef = builder.objectRef<DeprecateModelResultShape>('DeprecateModelResult');

builder.objectType(DeprecateModelResultRef, {
  description: 'Result of deprecating a model',
  fields: (t) => ({
    model: t.field({
      type: LlmModelRef,
      description: 'The deprecated model',
      resolve: (parent) => parent.model,
    }),
    newDefault: t.field({
      type: LlmModelRef,
      nullable: true,
      description: 'The new default model (if previous default was deprecated)',
      resolve: (parent) => parent.newDefault,
    }),
  }),
});

// Result type for setting default model
type SetDefaultResultShape = {
  model: LlmModel;
  previousDefault: LlmModel | null;
};

const SetDefaultResultRef = builder.objectRef<SetDefaultResultShape>('SetDefaultModelResult');

builder.objectType(SetDefaultResultRef, {
  description: 'Result of setting a default model',
  fields: (t) => ({
    model: t.field({
      type: LlmModelRef,
      description: 'The new default model',
      resolve: (parent) => parent.model,
    }),
    previousDefault: t.field({
      type: LlmModelRef,
      nullable: true,
      description: 'The previous default model (now cleared)',
      resolve: (parent) => parent.previousDefault,
    }),
  }),
});

// Mutation: createLlmModel
builder.mutationField('createLlmModel', (t) =>
  t.field({
    type: LlmModelRef,
    description: 'Create a new LLM model under a provider',
    args: {
      input: t.arg({ type: CreateLlmModelInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ providerId: args.input.providerId, modelId: args.input.modelId }, 'Creating LLM model');

      const model = await createModel({
        providerId: args.input.providerId,
        modelId: args.input.modelId,
        displayName: args.input.displayName,
        costInputPerMillion: args.input.costInputPerMillion,
        costOutputPerMillion: args.input.costOutputPerMillion,
        setAsDefault: args.input.setAsDefault ?? false,
        createdByUserId: ctx.user?.id ?? null,
      });

      ctx.log.info({ modelId: model.id, apiModelId: model.modelId }, 'LLM model created');

      // Audit log (non-blocking)
      void createAuditLog({
        action: 'CREATE',
        entityType: 'LlmModel',
        entityId: model.id,
        userId: ctx.user?.id ?? null,
        metadata: { modelId: model.modelId, displayName: model.displayName },
      });

      return model;
    },
  })
);

// Mutation: updateLlmModel
builder.mutationField('updateLlmModel', (t) =>
  t.field({
    type: LlmModelRef,
    description: 'Update an LLM model (display name, costs, API config)',
    args: {
      id: t.arg.string({ required: true, description: 'Model ID to update' }),
      input: t.arg({ type: UpdateLlmModelInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ id: args.id }, 'Updating LLM model');

      // Build update data - only include fields that were provided
      const updateData: {
        displayName?: string;
        costInputPerMillion?: number;
        costOutputPerMillion?: number;
        apiConfig?: Record<string, unknown> | null;
      } = {};

      if (args.input.displayName !== undefined && args.input.displayName !== null) {
        updateData.displayName = args.input.displayName;
      }
      if (args.input.costInputPerMillion !== undefined && args.input.costInputPerMillion !== null) {
        updateData.costInputPerMillion = args.input.costInputPerMillion;
      }
      if (args.input.costOutputPerMillion !== undefined && args.input.costOutputPerMillion !== null) {
        updateData.costOutputPerMillion = args.input.costOutputPerMillion;
      }
      // For apiConfig, explicitly allow null to clear the value
      if (args.input.apiConfig !== undefined) {
        updateData.apiConfig = args.input.apiConfig as Record<string, unknown> | null;
      }

      const model = await updateModel(args.id, updateData);

      ctx.log.info({ modelId: model.id }, 'LLM model updated');

      // Audit log (non-blocking)
      void createAuditLog({
        action: 'UPDATE',
        entityType: 'LlmModel',
        entityId: model.id,
        userId: ctx.user?.id ?? null,
        metadata: { updatedFields: Object.keys(updateData) },
      });

      return model;
    },
  })
);

// Mutation: deprecateLlmModel
builder.mutationField('deprecateLlmModel', (t) =>
  t.field({
    type: DeprecateModelResultRef,
    description: 'Deprecate an LLM model (mark as no longer recommended for new runs)',
    args: {
      id: t.arg.string({ required: true, description: 'Model ID to deprecate' }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ id: args.id }, 'Deprecating LLM model');

      const result = await deprecateModel(args.id);

      ctx.log.info(
        { modelId: result.model.id, newDefaultId: result.newDefault?.id },
        'LLM model deprecated'
      );

      // Audit log (non-blocking)
      void createAuditLog({
        action: 'ACTION',
        entityType: 'LlmModel',
        entityId: result.model.id,
        userId: ctx.user?.id ?? null,
        metadata: { action: 'deprecate', newDefaultId: result.newDefault?.id },
      });

      return result;
    },
  })
);

// Mutation: reactivateLlmModel
builder.mutationField('reactivateLlmModel', (t) =>
  t.field({
    type: LlmModelRef,
    description: 'Reactivate a deprecated LLM model',
    args: {
      id: t.arg.string({ required: true, description: 'Model ID to reactivate' }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ id: args.id }, 'Reactivating LLM model');

      const model = await reactivateModel(args.id);

      ctx.log.info({ modelId: model.id }, 'LLM model reactivated');

      // Audit log (non-blocking)
      void createAuditLog({
        action: 'ACTION',
        entityType: 'LlmModel',
        entityId: model.id,
        userId: ctx.user?.id ?? null,
        metadata: { action: 'reactivate' },
      });

      return model;
    },
  })
);

// Mutation: setDefaultLlmModel
builder.mutationField('setDefaultLlmModel', (t) =>
  t.field({
    type: SetDefaultResultRef,
    description: 'Set a model as the default for its provider',
    args: {
      id: t.arg.string({ required: true, description: 'Model ID to set as default' }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ id: args.id }, 'Setting default LLM model');

      const result = await setDefaultModel(args.id);

      ctx.log.info(
        { modelId: result.model.id, previousDefaultId: result.previousDefault?.id },
        'Default LLM model set'
      );

      // Audit log (non-blocking)
      void createAuditLog({
        action: 'ACTION',
        entityType: 'LlmModel',
        entityId: result.model.id,
        userId: ctx.user?.id ?? null,
        metadata: { action: 'setDefault', previousDefaultId: result.previousDefault?.id },
      });

      return result;
    },
  })
);

// Mutation: updateLlmProvider
builder.mutationField('updateLlmProvider', (t) =>
  t.field({
    type: LlmProviderRef,
    description: 'Update LLM provider settings (rate limits, enabled status)',
    args: {
      id: t.arg.string({ required: true, description: 'Provider ID to update' }),
      input: t.arg({ type: UpdateLlmProviderInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ id: args.id }, 'Updating LLM provider');

      const provider = await updateProvider(args.id, {
        maxParallelRequests: args.input.maxParallelRequests ?? undefined,
        requestsPerMinute: args.input.requestsPerMinute ?? undefined,
        isEnabled: args.input.isEnabled ?? undefined,
      });

      ctx.log.info({ providerId: provider.id }, 'LLM provider updated');

      // Re-register queue handler if parallelism settings changed
      const parallelismChanged =
        args.input.maxParallelRequests !== undefined ||
        args.input.requestsPerMinute !== undefined;

      if (parallelismChanged && isBossRunning()) {
        try {
          const boss = getBoss();
          await reregisterProviderHandler(boss, provider.name);
          ctx.log.info(
            { providerName: provider.name },
            'Queue handler re-registered with new parallelism settings'
          );
        } catch (err) {
          // Log but don't fail - settings are saved, restart will apply them
          ctx.log.error(
            { err, providerName: provider.name },
            'Failed to re-register queue handler (settings saved, restart required)'
          );
        }
      }

      // Audit log (non-blocking)
      void createAuditLog({
        action: 'UPDATE',
        entityType: 'LlmProvider',
        entityId: provider.id,
        userId: ctx.user?.id ?? null,
        metadata: { name: provider.name },
      });

      return provider;
    },
  })
);

// Mutation: updateSystemSetting
builder.mutationField('updateSystemSetting', (t) =>
  t.field({
    type: SystemSettingRef,
    description: 'Update a system setting (creates if not exists)',
    args: {
      input: t.arg({ type: UpdateSystemSettingInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ key: args.input.key }, 'Updating system setting');

      const setting = await upsertSetting(args.input.key, args.input.value as Record<string, unknown>);

      ctx.log.info({ key: setting.key }, 'System setting updated');

      // Hot-reload summarize handler if parallelism setting changed
      if (args.input.key === 'infra_max_parallel_summarizations' && isBossRunning()) {
        try {
          const { reregisterSummarizeHandler } = await import('../../queue/handlers/index.js');
          const { clearSummarizationCache } = await import(
            '../../services/summarization-parallelism/index.js'
          );

          // Clear cache to ensure fresh value is used
          clearSummarizationCache();

          const boss = getBoss();
          await reregisterSummarizeHandler(boss);
          ctx.log.info('Summarize handler re-registered with new parallelism setting');
        } catch (err) {
          // Log but don't fail - settings are saved, restart will apply them
          ctx.log.error(
            { err },
            'Failed to re-register summarize handler (settings saved, restart required)'
          );
        }
      }

      // Audit log (non-blocking)
      void createAuditLog({
        action: 'UPDATE',
        entityType: 'SystemSetting',
        entityId: setting.id,
        userId: ctx.user?.id ?? null,
        metadata: { key: setting.key },
      });

      return setting;
    },
  })
);

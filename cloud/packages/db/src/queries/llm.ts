/**
 * LLM provider and model query helpers.
 * Handles CRUD operations for LLM provider metadata.
 */

import { createLogger, NotFoundError } from '@valuerank/shared';
import { db } from '../client.js';
import { Prisma } from '@prisma/client';
import type { LlmProvider, LlmModel, LlmModelStatus, SystemSetting } from '@prisma/client';

const log = createLogger('db:llm');

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export type LlmProviderWithModels = LlmProvider & {
  models: LlmModel[];
};

export type LlmModelWithProvider = LlmModel & {
  provider: LlmProvider;
};

// ============================================================================
// PROVIDER QUERIES
// ============================================================================

/**
 * Get all LLM providers.
 */
export async function getAllProviders(): Promise<LlmProvider[]> {
  log.debug('Fetching all providers');
  return db.llmProvider.findMany({
    orderBy: { displayName: 'asc' },
  });
}

/**
 * Get all providers with their models.
 */
export async function getAllProvidersWithModels(): Promise<LlmProviderWithModels[]> {
  log.debug('Fetching all providers with models');
  return db.llmProvider.findMany({
    include: { models: { orderBy: { displayName: 'asc' } } },
    orderBy: { displayName: 'asc' },
  });
}

/**
 * Get a provider by ID.
 */
export async function getProviderById(id: string): Promise<LlmProvider> {
  log.debug({ id }, 'Fetching provider');
  const provider = await db.llmProvider.findUnique({ where: { id } });
  if (!provider) {
    throw new NotFoundError('LlmProvider', id);
  }
  return provider;
}

/**
 * Get a provider by name.
 */
export async function getProviderByName(name: string): Promise<LlmProvider | null> {
  log.debug({ name }, 'Fetching provider by name');
  return db.llmProvider.findUnique({ where: { name } });
}

/**
 * Get a provider with its models.
 */
export async function getProviderWithModels(id: string): Promise<LlmProviderWithModels> {
  log.debug({ id }, 'Fetching provider with models');
  const provider = await db.llmProvider.findUnique({
    where: { id },
    include: { models: { orderBy: { displayName: 'asc' } } },
  });
  if (!provider) {
    throw new NotFoundError('LlmProvider', id);
  }
  return provider;
}

/**
 * Update provider settings.
 */
export async function updateProvider(
  id: string,
  data: {
    maxParallelRequests?: number;
    requestsPerMinute?: number;
    isEnabled?: boolean;
  }
): Promise<LlmProvider> {
  log.info({ id, ...data }, 'Updating provider');
  await getProviderById(id); // Verify exists
  return db.llmProvider.update({ where: { id }, data });
}

// ============================================================================
// MODEL QUERIES
// ============================================================================

/**
 * Get all models with optional filters.
 */
export async function getAllModels(filters?: {
  providerId?: string;
  status?: LlmModelStatus;
}): Promise<LlmModel[]> {
  log.debug({ filters }, 'Fetching all models');

  const where: Prisma.LlmModelWhereInput = {};
  if (filters?.providerId) where.providerId = filters.providerId;
  if (filters?.status) where.status = filters.status;

  return db.llmModel.findMany({
    where,
    orderBy: [{ providerId: 'asc' }, { displayName: 'asc' }],
  });
}

/**
 * Get all models with their providers.
 */
export async function getAllModelsWithProvider(filters?: {
  providerId?: string;
  status?: LlmModelStatus;
}): Promise<LlmModelWithProvider[]> {
  log.debug({ filters }, 'Fetching all models with providers');

  const where: Prisma.LlmModelWhereInput = {};
  if (filters?.providerId) where.providerId = filters.providerId;
  if (filters?.status) where.status = filters.status;

  return db.llmModel.findMany({
    where,
    include: { provider: true },
    orderBy: [{ provider: { displayName: 'asc' } }, { displayName: 'asc' }],
  });
}

/**
 * Get a model by ID.
 */
export async function getModelById(id: string): Promise<LlmModel> {
  log.debug({ id }, 'Fetching model');
  const model = await db.llmModel.findUnique({ where: { id } });
  if (!model) {
    throw new NotFoundError('LlmModel', id);
  }
  return model;
}

/**
 * Get a model by ID with provider.
 */
export async function getModelWithProvider(id: string): Promise<LlmModelWithProvider> {
  log.debug({ id }, 'Fetching model with provider');
  const model = await db.llmModel.findUnique({
    where: { id },
    include: { provider: true },
  });
  if (!model) {
    throw new NotFoundError('LlmModel', id);
  }
  return model;
}

/**
 * Get a model by provider name and model ID.
 */
export async function getModelByIdentifier(
  providerName: string,
  modelId: string
): Promise<LlmModelWithProvider | null> {
  log.debug({ providerName, modelId }, 'Fetching model by identifier');

  const provider = await getProviderByName(providerName);
  if (!provider) return null;

  return db.llmModel.findUnique({
    where: { providerId_modelId: { providerId: provider.id, modelId } },
    include: { provider: true },
  });
}

/**
 * Get the default model for a provider.
 */
export async function getDefaultModel(providerId: string): Promise<LlmModel | null> {
  log.debug({ providerId }, 'Fetching default model');
  return db.llmModel.findFirst({
    where: { providerId, isDefault: true },
  });
}

/**
 * Get all default models (one per provider).
 */
export async function getAllDefaultModels(): Promise<LlmModelWithProvider[]> {
  log.debug('Fetching all default models');
  return db.llmModel.findMany({
    where: { isDefault: true, status: 'ACTIVE' },
    include: { provider: true },
  });
}

/**
 * Create a new model.
 */
export async function createModel(data: {
  providerId: string;
  modelId: string;
  displayName: string;
  costInputPerMillion: number;
  costOutputPerMillion: number;
  setAsDefault?: boolean;
}): Promise<LlmModel> {
  log.info({ providerId: data.providerId, modelId: data.modelId }, 'Creating model');

  // Verify provider exists
  await getProviderById(data.providerId);

  // If setting as default, clear existing default in a transaction
  if (data.setAsDefault) {
    return db.$transaction(async (tx) => {
      await tx.llmModel.updateMany({
        where: { providerId: data.providerId, isDefault: true },
        data: { isDefault: false },
      });
      return tx.llmModel.create({
        data: {
          providerId: data.providerId,
          modelId: data.modelId,
          displayName: data.displayName,
          costInputPerMillion: data.costInputPerMillion,
          costOutputPerMillion: data.costOutputPerMillion,
          isDefault: true,
        },
      });
    });
  }

  return db.llmModel.create({
    data: {
      providerId: data.providerId,
      modelId: data.modelId,
      displayName: data.displayName,
      costInputPerMillion: data.costInputPerMillion,
      costOutputPerMillion: data.costOutputPerMillion,
    },
  });
}

/**
 * Update a model.
 */
export async function updateModel(
  id: string,
  data: {
    displayName?: string;
    costInputPerMillion?: number;
    costOutputPerMillion?: number;
    apiConfig?: Record<string, unknown> | null;
  }
): Promise<LlmModel> {
  log.info({ id, ...data }, 'Updating model');
  await getModelById(id); // Verify exists

  // Build Prisma-compatible update data
  // For nullable JSON fields, Prisma requires special handling of null values
  const updateData: Prisma.LlmModelUpdateInput = {
    displayName: data.displayName,
    costInputPerMillion: data.costInputPerMillion,
    costOutputPerMillion: data.costOutputPerMillion,
  };

  // Handle apiConfig specially - undefined means don't update, null means set to null
  if (data.apiConfig !== undefined) {
    updateData.apiConfig = data.apiConfig === null
      ? Prisma.DbNull
      : (data.apiConfig as Prisma.InputJsonValue);
  }

  return db.llmModel.update({ where: { id }, data: updateData });
}

/**
 * Deprecate a model.
 */
export async function deprecateModel(id: string): Promise<{
  model: LlmModel;
  newDefault: LlmModel | null;
}> {
  log.info({ id }, 'Deprecating model');

  const model = await getModelById(id);

  // If this was the default, we need to promote another model
  let newDefault: LlmModel | null = null;

  if (model.isDefault) {
    // Find another active model to make default
    const nextModel = await db.llmModel.findFirst({
      where: {
        providerId: model.providerId,
        id: { not: id },
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'asc' },
    });

    if (nextModel) {
      await db.$transaction([
        db.llmModel.update({ where: { id }, data: { status: 'DEPRECATED', isDefault: false } }),
        db.llmModel.update({ where: { id: nextModel.id }, data: { isDefault: true } }),
      ]);
      newDefault = await getModelById(nextModel.id);
    } else {
      // No other active models, just deprecate
      await db.llmModel.update({ where: { id }, data: { status: 'DEPRECATED', isDefault: false } });
    }
  } else {
    await db.llmModel.update({ where: { id }, data: { status: 'DEPRECATED' } });
  }

  return { model: await getModelById(id), newDefault };
}

/**
 * Reactivate a deprecated model.
 */
export async function reactivateModel(id: string): Promise<LlmModel> {
  log.info({ id }, 'Reactivating model');
  await getModelById(id); // Verify exists
  return db.llmModel.update({ where: { id }, data: { status: 'ACTIVE' } });
}

/**
 * Set a model as default for its provider.
 */
export async function setDefaultModel(id: string): Promise<{
  model: LlmModel;
  previousDefault: LlmModel | null;
}> {
  log.info({ id }, 'Setting default model');

  const model = await getModelById(id);

  // Find current default
  const previousDefault = await getDefaultModel(model.providerId);

  // Update in transaction
  await db.$transaction(async (tx) => {
    // Clear existing default
    await tx.llmModel.updateMany({
      where: { providerId: model.providerId, isDefault: true },
      data: { isDefault: false },
    });
    // Set new default
    await tx.llmModel.update({ where: { id }, data: { isDefault: true } });
  });

  return {
    model: await getModelById(id),
    previousDefault: previousDefault?.id !== id ? previousDefault : null,
  };
}

// ============================================================================
// SYSTEM SETTINGS QUERIES
// ============================================================================

/**
 * Get all system settings.
 */
export async function getAllSettings(): Promise<SystemSetting[]> {
  log.debug('Fetching all settings');
  return db.systemSetting.findMany({ orderBy: { key: 'asc' } });
}

/**
 * Get a setting by key.
 */
export async function getSettingByKey(key: string): Promise<SystemSetting | null> {
  log.debug({ key }, 'Fetching setting');
  return db.systemSetting.findUnique({ where: { key } });
}

/**
 * Update or create a setting.
 */
export async function upsertSetting(key: string, value: unknown): Promise<SystemSetting> {
  log.info({ key }, 'Upserting setting');
  return db.systemSetting.upsert({
    where: { key },
    update: { value: value as Prisma.InputJsonValue },
    create: { key, value: value as Prisma.InputJsonValue },
  });
}

/**
 * Get the infrastructure model for a specific purpose.
 */
export async function getInfraModel(purpose: string): Promise<LlmModelWithProvider | null> {
  const key = `infra_model_${purpose}`;
  log.debug({ key }, 'Fetching infra model');

  const setting = await getSettingByKey(key);
  if (!setting) return null;

  const value = setting.value as { modelId?: string; providerId?: string };
  if (!value.modelId || !value.providerId) return null;

  const provider = await getProviderByName(value.providerId);
  if (!provider) return null;

  return db.llmModel.findUnique({
    where: { providerId_modelId: { providerId: provider.id, modelId: value.modelId } },
    include: { provider: true },
  });
}

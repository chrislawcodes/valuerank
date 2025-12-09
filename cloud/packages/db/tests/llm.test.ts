/**
 * Integration tests for LLM provider and model query helpers.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  getAllProviders,
  getAllProvidersWithModels,
  getProviderById,
  getProviderByName,
  getProviderWithModels,
  updateProvider,
  getAllModels,
  getAllModelsWithProvider,
  getModelById,
  getModelWithProvider,
  getModelByIdentifier,
  getDefaultModel,
  getAllDefaultModels,
  createModel,
  updateModel,
  deprecateModel,
  reactivateModel,
  setDefaultModel,
  getAllSettings,
  getSettingByKey,
  upsertSetting,
  getInfraModel,
} from '../src/queries/llm.js';

const prisma = new PrismaClient();

// Skip tests if no database URL
const skipIfNoDb = process.env.DATABASE_URL ? describe : describe.skip;

// Helper to create a test provider
async function createTestProvider(name = 'test-provider') {
  return prisma.llmProvider.create({
    data: {
      name,
      displayName: `Test Provider (${name})`,
      maxParallelRequests: 3,
      requestsPerMinute: 30,
    },
  });
}

// Helper to create a test model
async function createTestModel(providerId: string, modelId = 'test-model', isDefault = false) {
  return prisma.llmModel.create({
    data: {
      providerId,
      modelId,
      displayName: `Test Model (${modelId})`,
      costInputPerMillion: 1.5,
      costOutputPerMillion: 3.0,
      isDefault,
    },
  });
}

skipIfNoDb('LLM Queries (Integration)', () => {
  beforeEach(async () => {
    // Clean up test data
    await prisma.systemSetting.deleteMany();
    await prisma.llmModel.deleteMany();
    await prisma.llmProvider.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Provider Queries', () => {
    describe('getAllProviders', () => {
      it('returns all providers', async () => {
        await createTestProvider('provider1');
        await createTestProvider('provider2');

        const result = await getAllProviders();

        expect(result).toHaveLength(2);
      });

      it('returns empty array when no providers', async () => {
        const result = await getAllProviders();

        expect(result).toHaveLength(0);
      });
    });

    describe('getAllProvidersWithModels', () => {
      it('returns providers with their models', async () => {
        const provider = await createTestProvider();
        await createTestModel(provider.id, 'model1');
        await createTestModel(provider.id, 'model2');

        const result = await getAllProvidersWithModels();

        expect(result).toHaveLength(1);
        expect(result[0].models).toHaveLength(2);
      });
    });

    describe('getProviderById', () => {
      it('returns provider when exists', async () => {
        const provider = await createTestProvider();

        const result = await getProviderById(provider.id);

        expect(result.id).toBe(provider.id);
        expect(result.name).toBe(provider.name);
      });

      it('throws NotFoundError when not exists', async () => {
        await expect(getProviderById('non-existent')).rejects.toThrow('LlmProvider not found');
      });
    });

    describe('getProviderByName', () => {
      it('returns provider when exists', async () => {
        await createTestProvider('my-provider');

        const result = await getProviderByName('my-provider');

        expect(result?.name).toBe('my-provider');
      });

      it('returns null when not exists', async () => {
        const result = await getProviderByName('non-existent');

        expect(result).toBeNull();
      });
    });

    describe('getProviderWithModels', () => {
      it('returns provider with models', async () => {
        const provider = await createTestProvider();
        await createTestModel(provider.id, 'model1');

        const result = await getProviderWithModels(provider.id);

        expect(result.id).toBe(provider.id);
        expect(result.models).toHaveLength(1);
      });
    });

    describe('updateProvider', () => {
      it('updates provider settings', async () => {
        const provider = await createTestProvider();

        const result = await updateProvider(provider.id, {
          maxParallelRequests: 10,
          requestsPerMinute: 100,
        });

        expect(result.maxParallelRequests).toBe(10);
        expect(result.requestsPerMinute).toBe(100);
      });

      it('updates isEnabled', async () => {
        const provider = await createTestProvider();

        const result = await updateProvider(provider.id, { isEnabled: false });

        expect(result.isEnabled).toBe(false);
      });
    });
  });

  describe('Model Queries', () => {
    describe('getAllModels', () => {
      it('returns all models', async () => {
        const provider = await createTestProvider();
        await createTestModel(provider.id, 'model1');
        await createTestModel(provider.id, 'model2');

        const result = await getAllModels();

        expect(result).toHaveLength(2);
      });

      it('filters by providerId', async () => {
        const provider1 = await createTestProvider('provider1');
        const provider2 = await createTestProvider('provider2');
        await createTestModel(provider1.id, 'model1');
        await createTestModel(provider2.id, 'model2');

        const result = await getAllModels({ providerId: provider1.id });

        expect(result).toHaveLength(1);
        expect(result[0].providerId).toBe(provider1.id);
      });

      it('filters by status', async () => {
        const provider = await createTestProvider();
        await createTestModel(provider.id, 'active-model');
        const deprecated = await createTestModel(provider.id, 'deprecated-model');
        await prisma.llmModel.update({
          where: { id: deprecated.id },
          data: { status: 'DEPRECATED' },
        });

        const result = await getAllModels({ status: 'ACTIVE' });

        expect(result).toHaveLength(1);
        expect(result[0].status).toBe('ACTIVE');
      });
    });

    describe('getModelById', () => {
      it('returns model when exists', async () => {
        const provider = await createTestProvider();
        const model = await createTestModel(provider.id);

        const result = await getModelById(model.id);

        expect(result.id).toBe(model.id);
      });

      it('throws NotFoundError when not exists', async () => {
        await expect(getModelById('non-existent')).rejects.toThrow('LlmModel not found');
      });
    });

    describe('getModelByIdentifier', () => {
      it('returns model by provider name and model ID', async () => {
        const provider = await createTestProvider('openai');
        await createTestModel(provider.id, 'gpt-4o');

        const result = await getModelByIdentifier('openai', 'gpt-4o');

        expect(result?.modelId).toBe('gpt-4o');
        expect(result?.provider.name).toBe('openai');
      });

      it('returns null when provider not exists', async () => {
        const result = await getModelByIdentifier('non-existent', 'model');

        expect(result).toBeNull();
      });

      it('returns null when model not exists', async () => {
        await createTestProvider('openai');

        const result = await getModelByIdentifier('openai', 'non-existent');

        expect(result).toBeNull();
      });
    });

    describe('getDefaultModel', () => {
      it('returns default model when exists', async () => {
        const provider = await createTestProvider();
        await createTestModel(provider.id, 'non-default', false);
        const defaultModel = await createTestModel(provider.id, 'default', true);

        const result = await getDefaultModel(provider.id);

        expect(result?.id).toBe(defaultModel.id);
        expect(result?.isDefault).toBe(true);
      });

      it('returns null when no default', async () => {
        const provider = await createTestProvider();
        await createTestModel(provider.id, 'non-default', false);

        const result = await getDefaultModel(provider.id);

        expect(result).toBeNull();
      });
    });

    describe('createModel', () => {
      it('creates a new model', async () => {
        const provider = await createTestProvider();

        const result = await createModel({
          providerId: provider.id,
          modelId: 'new-model',
          displayName: 'New Model',
          costInputPerMillion: 2.0,
          costOutputPerMillion: 4.0,
        });

        expect(result.modelId).toBe('new-model');
        expect(result.displayName).toBe('New Model');
      });

      it('creates model as default when setAsDefault is true', async () => {
        const provider = await createTestProvider();
        const existingDefault = await createTestModel(provider.id, 'existing', true);

        const result = await createModel({
          providerId: provider.id,
          modelId: 'new-default',
          displayName: 'New Default',
          costInputPerMillion: 2.0,
          costOutputPerMillion: 4.0,
          setAsDefault: true,
        });

        expect(result.isDefault).toBe(true);

        // Old default should be cleared
        const oldDefault = await getModelById(existingDefault.id);
        expect(oldDefault.isDefault).toBe(false);
      });
    });

    describe('updateModel', () => {
      it('updates model properties', async () => {
        const provider = await createTestProvider();
        const model = await createTestModel(provider.id);

        const result = await updateModel(model.id, {
          displayName: 'Updated Name',
          costInputPerMillion: 5.0,
        });

        expect(result.displayName).toBe('Updated Name');
        expect(Number(result.costInputPerMillion)).toBe(5.0);
      });
    });

    describe('deprecateModel', () => {
      it('deprecates a model', async () => {
        const provider = await createTestProvider();
        const model = await createTestModel(provider.id);

        const { model: deprecatedModel } = await deprecateModel(model.id);

        expect(deprecatedModel.status).toBe('DEPRECATED');
      });

      it('promotes another model to default when deprecating default', async () => {
        const provider = await createTestProvider();
        const defaultModel = await createTestModel(provider.id, 'default', true);
        const otherModel = await createTestModel(provider.id, 'other', false);

        const { model: deprecated, newDefault } = await deprecateModel(defaultModel.id);

        expect(deprecated.status).toBe('DEPRECATED');
        expect(deprecated.isDefault).toBe(false);
        expect(newDefault?.id).toBe(otherModel.id);
      });
    });

    describe('reactivateModel', () => {
      it('reactivates a deprecated model', async () => {
        const provider = await createTestProvider();
        const model = await createTestModel(provider.id);
        await prisma.llmModel.update({
          where: { id: model.id },
          data: { status: 'DEPRECATED' },
        });

        const result = await reactivateModel(model.id);

        expect(result.status).toBe('ACTIVE');
      });
    });

    describe('setDefaultModel', () => {
      it('sets a model as default', async () => {
        const provider = await createTestProvider();
        const model = await createTestModel(provider.id);

        const { model: newDefault, previousDefault } = await setDefaultModel(model.id);

        expect(newDefault.isDefault).toBe(true);
        expect(previousDefault).toBeNull();
      });

      it('clears previous default', async () => {
        const provider = await createTestProvider();
        const oldDefault = await createTestModel(provider.id, 'old', true);
        const newModel = await createTestModel(provider.id, 'new', false);

        const { model: newDefault, previousDefault } = await setDefaultModel(newModel.id);

        expect(newDefault.isDefault).toBe(true);
        expect(previousDefault?.id).toBe(oldDefault.id);

        const updated = await getModelById(oldDefault.id);
        expect(updated.isDefault).toBe(false);
      });
    });
  });

  describe('System Settings', () => {
    describe('getAllSettings', () => {
      it('returns all settings', async () => {
        await prisma.systemSetting.create({
          data: { key: 'setting1', value: { test: 1 } },
        });
        await prisma.systemSetting.create({
          data: { key: 'setting2', value: { test: 2 } },
        });

        const result = await getAllSettings();

        expect(result).toHaveLength(2);
      });
    });

    describe('getSettingByKey', () => {
      it('returns setting when exists', async () => {
        await prisma.systemSetting.create({
          data: { key: 'my-setting', value: { foo: 'bar' } },
        });

        const result = await getSettingByKey('my-setting');

        expect(result?.key).toBe('my-setting');
        expect(result?.value).toEqual({ foo: 'bar' });
      });

      it('returns null when not exists', async () => {
        const result = await getSettingByKey('non-existent');

        expect(result).toBeNull();
      });
    });

    describe('upsertSetting', () => {
      it('creates new setting', async () => {
        const result = await upsertSetting('new-key', { value: 123 });

        expect(result.key).toBe('new-key');
        expect(result.value).toEqual({ value: 123 });
      });

      it('updates existing setting', async () => {
        await prisma.systemSetting.create({
          data: { key: 'existing', value: { old: true } },
        });

        const result = await upsertSetting('existing', { new: true });

        expect(result.value).toEqual({ new: true });
      });
    });

    describe('getInfraModel', () => {
      it('returns infra model when configured', async () => {
        const provider = await createTestProvider('openai');
        await createTestModel(provider.id, 'gpt-4o-mini');
        await prisma.systemSetting.create({
          data: {
            key: 'infra_model_scenario_expansion',
            value: { modelId: 'gpt-4o-mini', providerId: 'openai' },
          },
        });

        const result = await getInfraModel('scenario_expansion');

        expect(result?.modelId).toBe('gpt-4o-mini');
        expect(result?.provider.name).toBe('openai');
      });

      it('returns null when not configured', async () => {
        const result = await getInfraModel('scenario_expansion');

        expect(result).toBeNull();
      });
    });
  });
});

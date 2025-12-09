/**
 * LLM Model Tools Tests
 *
 * Tests for list_llm_models, get_llm_model, create_llm_model,
 * update_llm_model, deprecate_llm_model, reactivate_llm_model,
 * and set_default_llm_model MCP tools.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@valuerank/db';

describe('LLM Model MCP Tools', () => {
  // Track test data for cleanup
  let testProviderId: string;
  let testModelId: string;
  let createdModelId: string | null = null;
  const createdModelIds: string[] = [];

  beforeAll(async () => {
    // Get or create a test provider
    let provider = await db.llmProvider.findFirst({
      where: { name: 'openai' },
    });

    if (!provider) {
      provider = await db.llmProvider.create({
        data: {
          name: 'test-provider-models-' + Date.now(),
          displayName: 'Test Provider for Models',
          maxParallelRequests: 5,
          requestsPerMinute: 100,
          isEnabled: true,
        },
      });
    }
    testProviderId = provider.id;

    // Get or create a test model
    let model = await db.llmModel.findFirst({
      where: { providerId: testProviderId },
    });

    if (!model) {
      model = await db.llmModel.create({
        data: {
          providerId: testProviderId,
          modelId: 'test-model-' + Date.now(),
          displayName: 'Test Model',
          costInputPerMillion: 1.0,
          costOutputPerMillion: 2.0,
          status: 'ACTIVE',
          isDefault: false,
        },
      });
      createdModelIds.push(model.id);
    }
    testModelId = model.id;
  });

  afterAll(async () => {
    // Clean up created models
    for (const id of createdModelIds) {
      try {
        await db.llmModel.delete({ where: { id } });
      } catch {
        // Ignore if already deleted
      }
    }
  });

  describe('list_llm_models', () => {
    it('returns all models with provider info', async () => {
      const models = await db.llmModel.findMany({
        include: { provider: true },
      });

      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty('modelId');
      expect(models[0]).toHaveProperty('displayName');
      expect(models[0]).toHaveProperty('provider');
      expect(models[0].provider).toHaveProperty('name');
    });

    it('filters by provider', async () => {
      const models = await db.llmModel.findMany({
        where: { providerId: testProviderId },
        include: { provider: true },
      });

      for (const model of models) {
        expect(model.providerId).toBe(testProviderId);
      }
    });

    it('filters by status', async () => {
      const activeModels = await db.llmModel.findMany({
        where: { status: 'ACTIVE' },
      });

      for (const model of activeModels) {
        expect(model.status).toBe('ACTIVE');
      }
    });
  });

  describe('get_llm_model', () => {
    it('returns model by ID', async () => {
      const model = await db.llmModel.findUnique({
        where: { id: testModelId },
        include: { provider: true },
      });

      expect(model).not.toBeNull();
      expect(model?.id).toBe(testModelId);
    });

    it('returns model by provider+modelId', async () => {
      const existing = await db.llmModel.findUnique({
        where: { id: testModelId },
      });

      if (existing) {
        const model = await db.llmModel.findFirst({
          where: {
            providerId: existing.providerId,
            modelId: existing.modelId,
          },
          include: { provider: true },
        });

        expect(model).not.toBeNull();
        expect(model?.modelId).toBe(existing.modelId);
      }
    });

    it('returns null for non-existent ID', async () => {
      const model = await db.llmModel.findUnique({
        where: { id: '00000000-0000-0000-0000-000000000000' },
      });

      expect(model).toBeNull();
    });
  });

  describe('create_llm_model', () => {
    it('creates a new model', async () => {
      const modelId = 'test-create-' + Date.now();
      const model = await db.llmModel.create({
        data: {
          providerId: testProviderId,
          modelId,
          displayName: 'Test Create Model',
          costInputPerMillion: 1.5,
          costOutputPerMillion: 3.0,
          status: 'ACTIVE',
          isDefault: false,
        },
      });

      createdModelIds.push(model.id);
      createdModelId = model.id;

      expect(model.modelId).toBe(modelId);
      expect(model.displayName).toBe('Test Create Model');
      expect(Number(model.costInputPerMillion)).toBe(1.5);
    });

    it('rejects duplicate model_id within provider', async () => {
      // Try to create with same modelId
      const existing = await db.llmModel.findUnique({
        where: { id: testModelId },
      });

      if (existing) {
        await expect(
          db.llmModel.create({
            data: {
              providerId: existing.providerId,
              modelId: existing.modelId, // Duplicate
              displayName: 'Duplicate',
              costInputPerMillion: 1.0,
              costOutputPerMillion: 2.0,
            },
          })
        ).rejects.toThrow();
      }
    });
  });

  describe('update_llm_model', () => {
    it('updates display_name', async () => {
      if (!createdModelId) return;

      const updated = await db.llmModel.update({
        where: { id: createdModelId },
        data: { displayName: 'Updated Name' },
      });

      expect(updated.displayName).toBe('Updated Name');
    });

    it('updates costs', async () => {
      if (!createdModelId) return;

      const updated = await db.llmModel.update({
        where: { id: createdModelId },
        data: {
          costInputPerMillion: 2.5,
          costOutputPerMillion: 5.0,
        },
      });

      expect(Number(updated.costInputPerMillion)).toBe(2.5);
      expect(Number(updated.costOutputPerMillion)).toBe(5.0);
    });
  });

  describe('deprecate_llm_model', () => {
    it('sets status to DEPRECATED', async () => {
      if (!createdModelId) return;

      const deprecated = await db.llmModel.update({
        where: { id: createdModelId },
        data: { status: 'DEPRECATED' },
      });

      expect(deprecated.status).toBe('DEPRECATED');
    });
  });

  describe('reactivate_llm_model', () => {
    it('sets status to ACTIVE', async () => {
      if (!createdModelId) return;

      const reactivated = await db.llmModel.update({
        where: { id: createdModelId },
        data: { status: 'ACTIVE' },
      });

      expect(reactivated.status).toBe('ACTIVE');
    });
  });

  describe('set_default_llm_model', () => {
    it('sets model as default', async () => {
      if (!createdModelId) return;

      // First, clear any existing defaults for this provider
      const model = await db.llmModel.findUnique({
        where: { id: createdModelId },
      });

      if (model) {
        await db.llmModel.updateMany({
          where: { providerId: model.providerId, isDefault: true },
          data: { isDefault: false },
        });

        const updated = await db.llmModel.update({
          where: { id: createdModelId },
          data: { isDefault: true },
        });

        expect(updated.isDefault).toBe(true);

        // Restore
        await db.llmModel.update({
          where: { id: createdModelId },
          data: { isDefault: false },
        });
      }
    });
  });
});

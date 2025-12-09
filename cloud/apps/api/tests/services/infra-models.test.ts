/**
 * Infrastructure Model Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '@valuerank/db';
import { getInfraModel, getScenarioExpansionModel } from '../../src/services/infra-models.js';

describe('InfraModels Service', () => {
  const TEST_PROVIDER_NAME = 'test-provider';
  const TEST_MODEL_ID = 'test-model-v1';
  let testProviderId: string;

  beforeEach(async () => {
    // Clean up any existing test data
    await db.systemSetting.deleteMany({
      where: { key: { startsWith: 'infra_model_' } },
    });

    // Create a test provider
    const provider = await db.llmProvider.upsert({
      where: { name: TEST_PROVIDER_NAME },
      create: {
        name: TEST_PROVIDER_NAME,
        displayName: 'Test Provider',
        isEnabled: true,
        requestsPerMinute: 60,
        maxParallelRequests: 10,
      },
      update: {},
    });
    testProviderId = provider.id;

    // Create a test model
    await db.llmModel.upsert({
      where: {
        providerId_modelId: {
          providerId: testProviderId,
          modelId: TEST_MODEL_ID,
        },
      },
      create: {
        providerId: testProviderId,
        modelId: TEST_MODEL_ID,
        displayName: 'Test Model V1',
        status: 'ACTIVE',
        costInputPerMillion: 1.0,
        costOutputPerMillion: 2.0,
      },
      update: {},
    });
  });

  afterEach(async () => {
    // Clean up
    await db.systemSetting.deleteMany({
      where: { key: { startsWith: 'infra_model_' } },
    });
    await db.llmModel.deleteMany({
      where: { providerId: testProviderId },
    });
    await db.llmProvider.deleteMany({
      where: { name: TEST_PROVIDER_NAME },
    });
  });

  describe('getInfraModel', () => {
    it('returns null when no setting exists', async () => {
      const result = await getInfraModel('scenario_expansion');
      expect(result).toBeNull();
    });

    it('returns null when setting has invalid modelId', async () => {
      await db.systemSetting.create({
        data: {
          key: 'infra_model_scenario_expansion',
          value: { providerId: TEST_PROVIDER_NAME },
        },
      });

      const result = await getInfraModel('scenario_expansion');
      expect(result).toBeNull();
    });

    it('returns null when setting has invalid providerId', async () => {
      await db.systemSetting.create({
        data: {
          key: 'infra_model_scenario_expansion',
          value: { modelId: TEST_MODEL_ID },
        },
      });

      const result = await getInfraModel('scenario_expansion');
      expect(result).toBeNull();
    });

    it('returns null when provider does not exist', async () => {
      await db.systemSetting.create({
        data: {
          key: 'infra_model_scenario_expansion',
          value: { modelId: TEST_MODEL_ID, providerId: 'nonexistent-provider' },
        },
      });

      const result = await getInfraModel('scenario_expansion');
      expect(result).toBeNull();
    });

    it('returns null when model does not exist', async () => {
      await db.systemSetting.create({
        data: {
          key: 'infra_model_scenario_expansion',
          value: { modelId: 'nonexistent-model', providerId: TEST_PROVIDER_NAME },
        },
      });

      const result = await getInfraModel('scenario_expansion');
      expect(result).toBeNull();
    });

    it('returns model config when properly configured', async () => {
      await db.systemSetting.create({
        data: {
          key: 'infra_model_scenario_expansion',
          value: { modelId: TEST_MODEL_ID, providerId: TEST_PROVIDER_NAME },
        },
      });

      const result = await getInfraModel('scenario_expansion');

      expect(result).not.toBeNull();
      expect(result?.modelId).toBe(TEST_MODEL_ID);
      expect(result?.providerName).toBe(TEST_PROVIDER_NAME);
      expect(result?.displayName).toBe('Test Model V1');
    });
  });

  describe('getScenarioExpansionModel', () => {
    it('returns configured model when available', async () => {
      await db.systemSetting.create({
        data: {
          key: 'infra_model_scenario_expansion',
          value: { modelId: TEST_MODEL_ID, providerId: TEST_PROVIDER_NAME },
        },
      });

      const result = await getScenarioExpansionModel();

      expect(result.modelId).toBe(TEST_MODEL_ID);
      expect(result.providerName).toBe(TEST_PROVIDER_NAME);
    });

    it('returns default model when not configured', async () => {
      const result = await getScenarioExpansionModel();

      expect(result.modelId).toBe('claude-3-5-haiku-20241022');
      expect(result.providerName).toBe('anthropic');
      expect(result.displayName).toBe('Claude 3.5 Haiku (Default)');
    });
  });
});

/**
 * Integration tests for LLM GraphQL mutations.
 *
 * Tests the mutations for managing providers, models, and settings.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../src/server.js';
import { db } from '@valuerank/db';
import { generateApiKey, hashApiKey, getKeyPrefix } from '../../src/auth/api-keys.js';

const app = createServer();

describe('LLM GraphQL Mutations', () => {
  let testUser: { id: string; email: string };
  let apiKey: string;
  const testPrefix = `llm-m-${Date.now()}`; // Unique prefix for this test run
  const createdProviderIds: string[] = [];
  const createdModelIds: string[] = [];
  const createdSettingKeys: string[] = [];

  beforeAll(async () => {
    // Create test user
    testUser = await db.user.create({
      data: {
        email: `llm-mutation-test-${Date.now()}@example.com`,
        passwordHash: 'test-hash',
      },
    });

    // Create API key for authentication
    apiKey = generateApiKey();
    await db.apiKey.create({
      data: {
        userId: testUser.id,
        name: 'Test Key',
        keyHash: hashApiKey(apiKey),
        keyPrefix: getKeyPrefix(apiKey),
      },
    });
  });

  afterAll(async () => {
    // Clean up test-specific data
    if (createdSettingKeys.length > 0) {
      await db.systemSetting.deleteMany({ where: { key: { in: createdSettingKeys } } });
    }
    if (createdModelIds.length > 0) {
      await db.llmModel.deleteMany({ where: { id: { in: createdModelIds } } });
    }
    if (createdProviderIds.length > 0) {
      await db.llmProvider.deleteMany({ where: { id: { in: createdProviderIds } } });
    }
    await db.apiKey.deleteMany({ where: { userId: testUser.id } });
    await db.user.delete({ where: { id: testUser.id } });
  });

  beforeEach(async () => {
    // Clean up data created in previous test (within same file)
    if (createdSettingKeys.length > 0) {
      await db.systemSetting.deleteMany({ where: { key: { in: createdSettingKeys } } });
      createdSettingKeys.length = 0;
    }
    if (createdModelIds.length > 0) {
      await db.llmModel.deleteMany({ where: { id: { in: createdModelIds } } });
      createdModelIds.length = 0;
    }
    if (createdProviderIds.length > 0) {
      await db.llmProvider.deleteMany({ where: { id: { in: createdProviderIds } } });
      createdProviderIds.length = 0;
    }
  });

  // Helper to create provider with unique name
  async function createTestProvider(name: string, displayName: string) {
    const provider = await db.llmProvider.create({
      data: { name: `${testPrefix}-${name}`, displayName },
    });
    createdProviderIds.push(provider.id);
    return provider;
  }

  // Helper to create model
  async function createTestModel(providerId: string, modelId: string, displayName: string, extra?: object) {
    const model = await db.llmModel.create({
      data: {
        providerId,
        modelId: `${testPrefix}-${modelId}`,
        displayName,
        costInputPerMillion: 1.0,
        costOutputPerMillion: 2.0,
        ...extra,
      },
    });
    createdModelIds.push(model.id);
    return model;
  }

  describe('createLlmModel mutation', () => {
    it('creates a new model', async () => {
      const provider = await createTestProvider('create-model', 'OpenAI');
      const newModelId = `${testPrefix}-new-gpt-4o-mini`;

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            mutation CreateModel($input: CreateLlmModelInput!) {
              createLlmModel(input: $input) {
                id
                modelId
                displayName
                costInputPerMillion
                costOutputPerMillion
                isDefault
                status
              }
            }
          `,
          variables: {
            input: {
              providerId: provider.id,
              modelId: newModelId,
              displayName: 'GPT-4o Mini',
              costInputPerMillion: 0.15,
              costOutputPerMillion: 0.6,
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const model = response.body.data.createLlmModel;
      createdModelIds.push(model.id); // Track for cleanup
      expect(model.modelId).toBe(newModelId);
      expect(model.displayName).toBe('GPT-4o Mini');
      expect(model.costInputPerMillion).toBe(0.15);
      expect(model.costOutputPerMillion).toBe(0.6);
      expect(model.status).toBe('ACTIVE');
      expect(model.isDefault).toBe(false);
    });

    it('creates model as default when setAsDefault is true', async () => {
      const provider = await createTestProvider('create-default', 'OpenAI');
      // Create existing default
      const existingModel = await createTestModel(provider.id, 'existing-gpt-4o', 'GPT-4o', {
        costInputPerMillion: 2.5,
        costOutputPerMillion: 10.0,
        isDefault: true,
      });
      const newModelId = `${testPrefix}-new-default-model`;

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            mutation CreateModel($input: CreateLlmModelInput!) {
              createLlmModel(input: $input) {
                id
                modelId
                isDefault
              }
            }
          `,
          variables: {
            input: {
              providerId: provider.id,
              modelId: newModelId,
              displayName: 'GPT-4o Mini',
              costInputPerMillion: 0.15,
              costOutputPerMillion: 0.6,
              setAsDefault: true,
            },
          },
        });

      expect(response.status).toBe(200);
      const model = response.body.data.createLlmModel;
      createdModelIds.push(model.id); // Track for cleanup
      expect(model.isDefault).toBe(true);

      // Verify old default was cleared
      const oldDefault = await db.llmModel.findUnique({
        where: { id: existingModel.id },
      });
      expect(oldDefault?.isDefault).toBe(false);
    });
  });

  describe('updateLlmModel mutation', () => {
    it('updates model properties', async () => {
      const provider = await createTestProvider('update-model', 'OpenAI');
      const model = await createTestModel(provider.id, 'update-gpt-4o', 'GPT-4o', {
        costInputPerMillion: 2.5,
        costOutputPerMillion: 10.0,
      });

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            mutation UpdateModel($id: String!, $input: UpdateLlmModelInput!) {
              updateLlmModel(id: $id, input: $input) {
                id
                displayName
                costInputPerMillion
              }
            }
          `,
          variables: {
            id: model.id,
            input: {
              displayName: 'GPT-4o (Updated)',
              costInputPerMillion: 3.0,
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.updateLlmModel.displayName).toBe('GPT-4o (Updated)');
      expect(response.body.data.updateLlmModel.costInputPerMillion).toBe(3.0);
    });
  });

  describe('deprecateLlmModel mutation', () => {
    it('deprecates a model', async () => {
      const provider = await createTestProvider('deprecate-model', 'OpenAI');
      const model = await createTestModel(provider.id, 'deprecate-gpt-4o', 'GPT-4o', {
        costInputPerMillion: 2.5,
        costOutputPerMillion: 10.0,
      });

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            mutation DeprecateModel($id: String!) {
              deprecateLlmModel(id: $id) {
                model {
                  id
                  status
                  isDefault
                }
                newDefault {
                  id
                }
              }
            }
          `,
          variables: { id: model.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.deprecateLlmModel.model.status).toBe('DEPRECATED');
      expect(response.body.data.deprecateLlmModel.newDefault).toBeNull();
    });

    it('promotes new default when deprecating the default model', async () => {
      const provider = await createTestProvider('deprecate-default', 'OpenAI');
      const defaultModel = await createTestModel(provider.id, 'deprecate-def-gpt-4o', 'GPT-4o', {
        costInputPerMillion: 2.5,
        costOutputPerMillion: 10.0,
        isDefault: true,
      });
      const otherModel = await createTestModel(provider.id, 'deprecate-other-gpt', 'GPT-4o Mini', {
        costInputPerMillion: 0.15,
        costOutputPerMillion: 0.6,
      });

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            mutation DeprecateModel($id: String!) {
              deprecateLlmModel(id: $id) {
                model {
                  id
                  status
                  isDefault
                }
                newDefault {
                  id
                  modelId
                }
              }
            }
          `,
          variables: { id: defaultModel.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.deprecateLlmModel.model.status).toBe('DEPRECATED');
      expect(response.body.data.deprecateLlmModel.model.isDefault).toBe(false);
      expect(response.body.data.deprecateLlmModel.newDefault.id).toBe(otherModel.id);
    });
  });

  describe('reactivateLlmModel mutation', () => {
    it('reactivates a deprecated model', async () => {
      const provider = await createTestProvider('reactivate-model', 'OpenAI');
      const model = await createTestModel(provider.id, 'reactivate-gpt-4o', 'GPT-4o', {
        costInputPerMillion: 2.5,
        costOutputPerMillion: 10.0,
        status: 'DEPRECATED',
      });

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            mutation ReactivateModel($id: String!) {
              reactivateLlmModel(id: $id) {
                id
                status
              }
            }
          `,
          variables: { id: model.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.reactivateLlmModel.status).toBe('ACTIVE');
    });
  });

  describe('setDefaultLlmModel mutation', () => {
    it('sets a model as default', async () => {
      const provider = await createTestProvider('set-default', 'OpenAI');
      const model = await createTestModel(provider.id, 'setdef-gpt-4o', 'GPT-4o', {
        costInputPerMillion: 2.5,
        costOutputPerMillion: 10.0,
      });

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            mutation SetDefault($id: String!) {
              setDefaultLlmModel(id: $id) {
                model {
                  id
                  isDefault
                }
                previousDefault {
                  id
                }
              }
            }
          `,
          variables: { id: model.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.setDefaultLlmModel.model.isDefault).toBe(true);
      expect(response.body.data.setDefaultLlmModel.previousDefault).toBeNull();
    });

    it('clears previous default when setting new default', async () => {
      const provider = await createTestProvider('set-new-default', 'OpenAI');
      const oldDefault = await createTestModel(provider.id, 'old-def-gpt-4o', 'GPT-4o', {
        costInputPerMillion: 2.5,
        costOutputPerMillion: 10.0,
        isDefault: true,
      });
      const newModel = await createTestModel(provider.id, 'new-def-gpt-4o-mini', 'GPT-4o Mini', {
        costInputPerMillion: 0.15,
        costOutputPerMillion: 0.6,
      });

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            mutation SetDefault($id: String!) {
              setDefaultLlmModel(id: $id) {
                model {
                  id
                  isDefault
                }
                previousDefault {
                  id
                  modelId
                }
              }
            }
          `,
          variables: { id: newModel.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.setDefaultLlmModel.model.isDefault).toBe(true);
      expect(response.body.data.setDefaultLlmModel.previousDefault.id).toBe(oldDefault.id);

      // Verify old default was cleared in DB
      const updated = await db.llmModel.findUnique({ where: { id: oldDefault.id } });
      expect(updated?.isDefault).toBe(false);
    });
  });

  describe('updateLlmProvider mutation', () => {
    it('updates provider settings', async () => {
      const provider = await createTestProvider('update-provider', 'OpenAI');

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            mutation UpdateProvider($id: String!, $input: UpdateLlmProviderInput!) {
              updateLlmProvider(id: $id, input: $input) {
                id
                maxParallelRequests
                requestsPerMinute
                isEnabled
              }
            }
          `,
          variables: {
            id: provider.id,
            input: {
              maxParallelRequests: 5,
              requestsPerMinute: 100,
              isEnabled: false,
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.updateLlmProvider.maxParallelRequests).toBe(5);
      expect(response.body.data.updateLlmProvider.requestsPerMinute).toBe(100);
      expect(response.body.data.updateLlmProvider.isEnabled).toBe(false);
    });
  });

  describe('updateSystemSetting mutation', () => {
    it('creates new setting', async () => {
      const settingKey = `${testPrefix}-test_setting`;

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            mutation UpdateSetting($input: UpdateSystemSettingInput!) {
              updateSystemSetting(input: $input) {
                key
                value
              }
            }
          `,
          variables: {
            input: {
              key: settingKey,
              value: { foo: 'bar', number: 42 },
            },
          },
        });

      createdSettingKeys.push(settingKey); // Track for cleanup
      expect(response.status).toBe(200);
      expect(response.body.data.updateSystemSetting.key).toBe(settingKey);
      expect(response.body.data.updateSystemSetting.value).toEqual({ foo: 'bar', number: 42 });
    });

    it('updates existing setting', async () => {
      const settingKey = `${testPrefix}-existing_setting`;
      await db.systemSetting.create({
        data: { key: settingKey, value: { old: true } },
      });
      createdSettingKeys.push(settingKey);

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            mutation UpdateSetting($input: UpdateSystemSettingInput!) {
              updateSystemSetting(input: $input) {
                key
                value
              }
            }
          `,
          variables: {
            input: {
              key: settingKey,
              value: { new: true },
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.updateSystemSetting.value).toEqual({ new: true });
    });
  });
});

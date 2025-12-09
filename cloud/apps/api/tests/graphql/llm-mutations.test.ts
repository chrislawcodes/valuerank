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
    // Clean up
    await db.apiKey.deleteMany({ where: { userId: testUser.id } });
    await db.user.delete({ where: { id: testUser.id } });
  });

  beforeEach(async () => {
    // Clean LLM data before each test
    await db.systemSetting.deleteMany();
    await db.llmModel.deleteMany();
    await db.llmProvider.deleteMany();
  });

  describe('createLlmModel mutation', () => {
    it('creates a new model', async () => {
      const provider = await db.llmProvider.create({
        data: { name: 'openai', displayName: 'OpenAI' },
      });

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
              modelId: 'gpt-4o-mini',
              displayName: 'GPT-4o Mini',
              costInputPerMillion: 0.15,
              costOutputPerMillion: 0.6,
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const model = response.body.data.createLlmModel;
      expect(model.modelId).toBe('gpt-4o-mini');
      expect(model.displayName).toBe('GPT-4o Mini');
      expect(model.costInputPerMillion).toBe(0.15);
      expect(model.costOutputPerMillion).toBe(0.6);
      expect(model.status).toBe('ACTIVE');
      expect(model.isDefault).toBe(false);
    });

    it('creates model as default when setAsDefault is true', async () => {
      const provider = await db.llmProvider.create({
        data: { name: 'openai', displayName: 'OpenAI' },
      });
      // Create existing default
      await db.llmModel.create({
        data: {
          providerId: provider.id,
          modelId: 'gpt-4o',
          displayName: 'GPT-4o',
          costInputPerMillion: 2.5,
          costOutputPerMillion: 10.0,
          isDefault: true,
        },
      });

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
              modelId: 'gpt-4o-mini',
              displayName: 'GPT-4o Mini',
              costInputPerMillion: 0.15,
              costOutputPerMillion: 0.6,
              setAsDefault: true,
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.createLlmModel.isDefault).toBe(true);

      // Verify old default was cleared
      const oldDefault = await db.llmModel.findFirst({
        where: { modelId: 'gpt-4o' },
      });
      expect(oldDefault?.isDefault).toBe(false);
    });
  });

  describe('updateLlmModel mutation', () => {
    it('updates model properties', async () => {
      const provider = await db.llmProvider.create({
        data: { name: 'openai', displayName: 'OpenAI' },
      });
      const model = await db.llmModel.create({
        data: {
          providerId: provider.id,
          modelId: 'gpt-4o',
          displayName: 'GPT-4o',
          costInputPerMillion: 2.5,
          costOutputPerMillion: 10.0,
        },
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
      const provider = await db.llmProvider.create({
        data: { name: 'openai', displayName: 'OpenAI' },
      });
      const model = await db.llmModel.create({
        data: {
          providerId: provider.id,
          modelId: 'gpt-4o',
          displayName: 'GPT-4o',
          costInputPerMillion: 2.5,
          costOutputPerMillion: 10.0,
        },
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
      const provider = await db.llmProvider.create({
        data: { name: 'openai', displayName: 'OpenAI' },
      });
      const defaultModel = await db.llmModel.create({
        data: {
          providerId: provider.id,
          modelId: 'gpt-4o',
          displayName: 'GPT-4o',
          costInputPerMillion: 2.5,
          costOutputPerMillion: 10.0,
          isDefault: true,
        },
      });
      const otherModel = await db.llmModel.create({
        data: {
          providerId: provider.id,
          modelId: 'gpt-4o-mini',
          displayName: 'GPT-4o Mini',
          costInputPerMillion: 0.15,
          costOutputPerMillion: 0.6,
        },
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
      const provider = await db.llmProvider.create({
        data: { name: 'openai', displayName: 'OpenAI' },
      });
      const model = await db.llmModel.create({
        data: {
          providerId: provider.id,
          modelId: 'gpt-4o',
          displayName: 'GPT-4o',
          costInputPerMillion: 2.5,
          costOutputPerMillion: 10.0,
          status: 'DEPRECATED',
        },
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
      const provider = await db.llmProvider.create({
        data: { name: 'openai', displayName: 'OpenAI' },
      });
      const model = await db.llmModel.create({
        data: {
          providerId: provider.id,
          modelId: 'gpt-4o',
          displayName: 'GPT-4o',
          costInputPerMillion: 2.5,
          costOutputPerMillion: 10.0,
        },
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
      const provider = await db.llmProvider.create({
        data: { name: 'openai', displayName: 'OpenAI' },
      });
      const oldDefault = await db.llmModel.create({
        data: {
          providerId: provider.id,
          modelId: 'gpt-4o',
          displayName: 'GPT-4o',
          costInputPerMillion: 2.5,
          costOutputPerMillion: 10.0,
          isDefault: true,
        },
      });
      const newModel = await db.llmModel.create({
        data: {
          providerId: provider.id,
          modelId: 'gpt-4o-mini',
          displayName: 'GPT-4o Mini',
          costInputPerMillion: 0.15,
          costOutputPerMillion: 0.6,
        },
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
      const provider = await db.llmProvider.create({
        data: { name: 'openai', displayName: 'OpenAI' },
      });

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
              key: 'test_setting',
              value: { foo: 'bar', number: 42 },
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.updateSystemSetting.key).toBe('test_setting');
      expect(response.body.data.updateSystemSetting.value).toEqual({ foo: 'bar', number: 42 });
    });

    it('updates existing setting', async () => {
      await db.systemSetting.create({
        data: { key: 'existing_setting', value: { old: true } },
      });

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
              key: 'existing_setting',
              value: { new: true },
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.updateSystemSetting.value).toEqual({ new: true });
    });
  });
});

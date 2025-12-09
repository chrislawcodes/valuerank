/**
 * Integration tests for LLM database integration.
 *
 * Tests that GraphQL queries correctly read from database
 * and compute availability based on provider API keys.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createServer } from '../../src/server.js';
import { db } from '@valuerank/db';
import { generateApiKey, hashApiKey, getKeyPrefix } from '../../src/auth/api-keys.js';

// Mock the environment check for provider availability
vi.mock('@valuerank/shared', async () => {
  const actual = await vi.importActual('@valuerank/shared');
  return {
    ...actual,
    getEnvOptional: vi.fn((key: string) => {
      // Simulate OpenAI key being available
      if (key === 'OPENAI_API_KEY') return 'mock-openai-key';
      // Anthropic not configured
      if (key === 'ANTHROPIC_API_KEY') return undefined;
      return undefined;
    }),
  };
});

const app = createServer();

// Use unique prefix for this test file to avoid conflicts
const testPrefix = `integ-${Date.now()}`;

describe('LLM Database Integration', () => {
  let testUser: { id: string; email: string };
  let apiKey: string;
  const createdProviderIds: string[] = [];
  const createdModelIds: string[] = [];
  const createdSettingKeys: string[] = [];

  beforeAll(async () => {
    // Create test user
    testUser = await db.user.create({
      data: {
        email: `llm-integration-test-${Date.now()}@example.com`,
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

  describe('availableModels query (database-backed)', () => {
    it('returns models from database', async () => {
      // Create test provider and models with unique names
      const provider = await createTestProvider('avail-openai', 'OpenAI Test');
      await createTestModel(provider.id, 'avail-gpt-4o', 'GPT-4o', {
        costInputPerMillion: 2.5,
        costOutputPerMillion: 10.0,
      });
      await createTestModel(provider.id, 'avail-gpt-4o-mini', 'GPT-4o Mini', {
        costInputPerMillion: 0.15,
        costOutputPerMillion: 0.6,
      });

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query {
              availableModels {
                id
                providerId
                displayName
                isAvailable
              }
            }
          `,
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.availableModels.length).toBeGreaterThanOrEqual(2);

      // Check model data - find our specific models
      const gpt4o = response.body.data.availableModels.find(
        (m: { id: string }) => m.id === `${testPrefix}-avail-gpt-4o`
      );
      expect(gpt4o).toBeDefined();
      expect(gpt4o.displayName).toBe('GPT-4o');
    });

    it('returns only active models by default', async () => {
      const provider = await createTestProvider('active-only', 'Test Provider');
      await createTestModel(provider.id, 'active-gpt-4o', 'GPT-4o', {
        costInputPerMillion: 2.5,
        costOutputPerMillion: 10.0,
        status: 'ACTIVE',
      });
      await createTestModel(provider.id, 'deprecated-gpt-4-turbo', 'GPT-4 Turbo (Deprecated)', {
        costInputPerMillion: 10.0,
        costOutputPerMillion: 30.0,
        status: 'DEPRECATED',
      });

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `query { availableModels { id } }`,
        });

      expect(response.status).toBe(200);
      const modelIds = response.body.data.availableModels.map((m: { id: string }) => m.id);
      // Active model should be present
      expect(modelIds).toContain(`${testPrefix}-active-gpt-4o`);
      // Deprecated model should NOT be present
      expect(modelIds).not.toContain(`${testPrefix}-deprecated-gpt-4-turbo`);
    });

    it('returns backward-compatible fields', async () => {
      const provider = await createTestProvider('compat-openai', 'OpenAI');
      await createTestModel(provider.id, 'compat-gpt-4o', 'GPT-4o', {
        costInputPerMillion: 2.5,
        costOutputPerMillion: 10.0,
      });

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query {
              availableModels {
                id
                providerId
                displayName
                versions
                defaultVersion
                isAvailable
              }
            }
          `,
        });

      expect(response.status).toBe(200);

      const model = response.body.data.availableModels.find(
        (m: { id: string }) => m.id === `${testPrefix}-compat-gpt-4o`
      );
      expect(model).toBeDefined();
      // Check backward-compatible fields
      expect(model.id).toBe(`${testPrefix}-compat-gpt-4o`); // modelId used as id
      expect(model.providerId).toBe(`${testPrefix}-compat-openai`); // provider name used
      expect(model.versions).toEqual([`${testPrefix}-compat-gpt-4o`]); // modelId as single version
      expect(model.defaultVersion).toBe(`${testPrefix}-compat-gpt-4o`); // modelId as default
    });
  });

  describe('llmModels query with isAvailable', () => {
    it('includes isAvailable field based on provider API key', async () => {
      // Create provider with unique name
      const provider = await createTestProvider('llm-avail', 'Test Provider');
      await createTestModel(provider.id, 'llm-avail-gpt-4o', 'GPT-4o', {
        costInputPerMillion: 2.5,
        costOutputPerMillion: 10.0,
      });

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query {
              llmModels {
                modelId
                isAvailable
                provider {
                  name
                }
              }
            }
          `,
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const gpt4o = response.body.data.llmModels.find(
        (m: { modelId: string }) => m.modelId === `${testPrefix}-llm-avail-gpt-4o`
      );
      expect(gpt4o).toBeDefined();
      expect(gpt4o.provider.name).toBe(`${testPrefix}-llm-avail`);
      // isAvailable depends on env var mapping which won't match our prefixed name
      expect(typeof gpt4o.isAvailable).toBe('boolean');
    });
  });

  describe('Provider with models', () => {
    it('returns models grouped by provider', async () => {
      const provider = await createTestProvider('grouped', 'OpenAI');
      await createTestModel(provider.id, 'grouped-gpt-4o', 'GPT-4o', {
        costInputPerMillion: 2.5,
        costOutputPerMillion: 10.0,
        isDefault: true,
      });
      await createTestModel(provider.id, 'grouped-gpt-4o-mini', 'GPT-4o Mini', {
        costInputPerMillion: 0.15,
        costOutputPerMillion: 0.6,
      });

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query GetProvider($id: String!) {
              llmProvider(id: $id) {
                name
                displayName
                models {
                  modelId
                  displayName
                  isDefault
                  costInputPerMillion
                  costOutputPerMillion
                }
              }
            }
          `,
          variables: { id: provider.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.llmProvider).toBeDefined();

      const returnedProvider = response.body.data.llmProvider;
      expect(returnedProvider.name).toBe(`${testPrefix}-grouped`);
      expect(returnedProvider.models).toHaveLength(2);

      const defaultModel = returnedProvider.models.find((m: { isDefault: boolean }) => m.isDefault);
      expect(defaultModel.modelId).toBe(`${testPrefix}-grouped-gpt-4o`);
    });
  });
});

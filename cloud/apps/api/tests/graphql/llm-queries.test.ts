/**
 * Integration tests for LLM GraphQL queries.
 *
 * Tests the GraphQL API for providers, models, and system settings.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../src/server.js';
import { db } from '@valuerank/db';
import { generateApiKey, hashApiKey, getKeyPrefix } from '../../src/auth/api-keys.js';

const app = createServer();

describe('LLM GraphQL Queries', () => {
  let testUser: { id: string; email: string };
  let apiKey: string;
  const testPrefix = `llm-q-${Date.now()}`; // Unique prefix for this test run
  const createdProviderIds: string[] = [];
  const createdModelIds: string[] = [];
  const createdSettingKeys: string[] = [];

  beforeAll(async () => {
    // Create test user
    testUser = await db.user.create({
      data: {
        email: `llm-query-test-${Date.now()}@example.com`,
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

  // Helper to create setting
  async function createTestSetting(key: string, value: unknown) {
    const setting = await db.systemSetting.create({
      data: { key: `${testPrefix}-${key}`, value: value as any },
    });
    createdSettingKeys.push(setting.key);
    return setting;
  }

  describe('llmProviders query', () => {
    it('returns all providers', async () => {
      // Create test providers using helpers with unique names
      await createTestProvider('openai', 'OpenAI');
      await createTestProvider('anthropic', 'Anthropic');

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query {
              llmProviders {
                id
                name
                displayName
                isEnabled
                maxParallelRequests
                requestsPerMinute
              }
            }
          `,
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.llmProviders.length).toBeGreaterThanOrEqual(2);

      const names = response.body.data.llmProviders.map((p: { name: string }) => p.name);
      expect(names).toContain(`${testPrefix}-openai`);
      expect(names).toContain(`${testPrefix}-anthropic`);
    });

    it('returns providers when they exist', async () => {
      // Just test the query works - don't test for empty since other tests may create data
      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `query { llmProviders { id name } }`,
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(Array.isArray(response.body.data.llmProviders)).toBe(true);
    });
  });

  describe('llmProvider query', () => {
    it('returns provider by ID', async () => {
      const provider = await db.llmProvider.create({
        data: {
          name: `${testPrefix}-provider-byid`,
          displayName: 'Test Provider',
          maxParallelRequests: 5,
          requestsPerMinute: 100,
        },
      });
      createdProviderIds.push(provider.id);

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query GetProvider($id: String!) {
              llmProvider(id: $id) {
                id
                name
                displayName
                maxParallelRequests
                requestsPerMinute
              }
            }
          `,
          variables: { id: provider.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.llmProvider.name).toBe(`${testPrefix}-provider-byid`);
      expect(response.body.data.llmProvider.maxParallelRequests).toBe(5);
    });

    it('returns null for non-existent provider', async () => {
      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query {
              llmProvider(id: "non-existent") {
                id
                name
              }
            }
          `,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.llmProvider).toBeNull();
    });
  });

  describe('llmModels query', () => {
    it('returns all models with provider', async () => {
      const provider = await createTestProvider('models-all', 'Test Provider');
      await createTestModel(provider.id, 'gpt-4o', 'GPT-4o', {
        costInputPerMillion: 2.5,
        costOutputPerMillion: 10.0,
      });
      await createTestModel(provider.id, 'gpt-4o-mini', 'GPT-4o Mini', {
        costInputPerMillion: 0.15,
        costOutputPerMillion: 0.6,
      });

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query {
              llmModels {
                id
                modelId
                displayName
                costInputPerMillion
                costOutputPerMillion
                status
                isDefault
                provider {
                  name
                }
              }
            }
          `,
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.llmModels.length).toBeGreaterThanOrEqual(2);

      const model = response.body.data.llmModels.find(
        (m: { modelId: string }) => m.modelId === `${testPrefix}-gpt-4o`
      );
      expect(model.displayName).toBe('GPT-4o');
      expect(model.costInputPerMillion).toBe(2.5);
      expect(model.provider.name).toBe(`${testPrefix}-models-all`);
    });

    it('filters by provider ID', async () => {
      const openai = await createTestProvider('filter-openai', 'OpenAI');
      const anthropic = await createTestProvider('filter-anthropic', 'Anthropic');
      await createTestModel(openai.id, 'filter-gpt-4o', 'GPT-4o', {
        costInputPerMillion: 2.5,
        costOutputPerMillion: 10.0,
      });
      await createTestModel(anthropic.id, 'filter-claude-3-opus', 'Claude 3 Opus', {
        costInputPerMillion: 15.0,
        costOutputPerMillion: 75.0,
      });

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query FilterModels($providerId: String) {
              llmModels(providerId: $providerId) {
                modelId
              }
            }
          `,
          variables: { providerId: openai.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.llmModels).toHaveLength(1);
      expect(response.body.data.llmModels[0].modelId).toBe(`${testPrefix}-filter-gpt-4o`);
    });

    it('filters by status', async () => {
      const provider = await createTestProvider('status-test', 'Test Provider');
      await createTestModel(provider.id, 'status-active', 'GPT-4o', {
        costInputPerMillion: 2.5,
        costOutputPerMillion: 10.0,
        status: 'ACTIVE',
      });
      await createTestModel(provider.id, 'status-deprecated', 'GPT-4 Turbo (Deprecated)', {
        costInputPerMillion: 10.0,
        costOutputPerMillion: 30.0,
        status: 'DEPRECATED',
      });

      // Filter by our provider to get only our test models
      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query FilterByStatus($status: String, $providerId: String) {
              llmModels(status: $status, providerId: $providerId) {
                modelId
                status
              }
            }
          `,
          variables: { status: 'ACTIVE', providerId: provider.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.llmModels).toHaveLength(1);
      expect(response.body.data.llmModels[0].modelId).toBe(`${testPrefix}-status-active`);
      expect(response.body.data.llmModels[0].status).toBe('ACTIVE');
    });
  });

  describe('llmModel query', () => {
    it('returns model by ID', async () => {
      const provider = await createTestProvider('model-byid', 'Test Provider');
      const model = await createTestModel(provider.id, 'model-byid-gpt', 'GPT-4o', {
        costInputPerMillion: 2.5,
        costOutputPerMillion: 10.0,
        isDefault: true,
      });

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query GetModel($id: String!) {
              llmModel(id: $id) {
                id
                modelId
                displayName
                isDefault
              }
            }
          `,
          variables: { id: model.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.llmModel.modelId).toBe(`${testPrefix}-model-byid-gpt`);
      expect(response.body.data.llmModel.isDefault).toBe(true);
    });

    it('returns null for non-existent model', async () => {
      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query {
              llmModel(id: "non-existent") {
                id
              }
            }
          `,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.llmModel).toBeNull();
    });
  });

  describe('llmModelByIdentifier query', () => {
    it('returns model by provider name and model ID', async () => {
      const provider = await createTestProvider('ident-openai', 'OpenAI');
      await createTestModel(provider.id, 'ident-gpt-4o', 'GPT-4o', {
        costInputPerMillion: 2.5,
        costOutputPerMillion: 10.0,
      });

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query GetByIdentifier($providerName: String!, $modelId: String!) {
              llmModelByIdentifier(providerName: $providerName, modelId: $modelId) {
                modelId
                displayName
              }
            }
          `,
          variables: { providerName: `${testPrefix}-ident-openai`, modelId: `${testPrefix}-ident-gpt-4o` },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.llmModelByIdentifier.modelId).toBe(`${testPrefix}-ident-gpt-4o`);
    });

    it('returns null for non-existent provider', async () => {
      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query {
              llmModelByIdentifier(providerName: "non-existent", modelId: "gpt-4o") {
                id
              }
            }
          `,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.llmModelByIdentifier).toBeNull();
    });

    it('returns null for non-existent model', async () => {
      const provider = await createTestProvider('ident-nomodel', 'OpenAI');

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query GetByIdentifier($providerName: String!, $modelId: String!) {
              llmModelByIdentifier(providerName: $providerName, modelId: $modelId) {
                id
              }
            }
          `,
          variables: { providerName: `${testPrefix}-ident-nomodel`, modelId: 'non-existent' },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.llmModelByIdentifier).toBeNull();
    });
  });

  describe('systemSettings query', () => {
    it('returns system settings', async () => {
      await createTestSetting('setting1', { test: 1 });
      await createTestSetting('setting2', { test: 2 });

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query {
              systemSettings {
                key
                value
              }
            }
          `,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.systemSettings.length).toBeGreaterThanOrEqual(2);

      const keys = response.body.data.systemSettings.map((s: { key: string }) => s.key);
      expect(keys).toContain(`${testPrefix}-setting1`);
      expect(keys).toContain(`${testPrefix}-setting2`);
    });
  });

  describe('systemSetting query', () => {
    it('returns setting by key', async () => {
      await createTestSetting('my_setting', { foo: 'bar' });

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query GetSetting($key: String!) {
              systemSetting(key: $key) {
                key
                value
              }
            }
          `,
          variables: { key: `${testPrefix}-my_setting` },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.systemSetting.key).toBe(`${testPrefix}-my_setting`);
      expect(response.body.data.systemSetting.value).toEqual({ foo: 'bar' });
    });

    it('returns null for non-existent setting', async () => {
      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query {
              systemSetting(key: "non-existent") {
                key
              }
            }
          `,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.systemSetting).toBeNull();
    });
  });

  describe('infraModel query', () => {
    it('returns configured infrastructure model', async () => {
      const provider = await createTestProvider('infra-openai', 'OpenAI');
      await createTestModel(provider.id, 'infra-gpt-4o-mini', 'GPT-4o Mini', {
        costInputPerMillion: 0.15,
        costOutputPerMillion: 0.6,
      });
      // Use unique key for this test
      const settingKey = `${testPrefix}-infra_model_scenario_expansion`;
      await db.systemSetting.create({
        data: {
          key: settingKey,
          value: { modelId: `${testPrefix}-infra-gpt-4o-mini`, providerId: `${testPrefix}-infra-openai` },
        },
      });
      createdSettingKeys.push(settingKey);

      // Note: infraModel uses hardcoded key 'infra_model_scenario_expansion'
      // So we need to create with the exact key the resolver expects
      await db.systemSetting.upsert({
        where: { key: 'infra_model_scenario_expansion' },
        update: { value: { modelId: `${testPrefix}-infra-gpt-4o-mini`, providerId: `${testPrefix}-infra-openai` } },
        create: {
          key: 'infra_model_scenario_expansion',
          value: { modelId: `${testPrefix}-infra-gpt-4o-mini`, providerId: `${testPrefix}-infra-openai` },
        },
      });
      createdSettingKeys.push('infra_model_scenario_expansion');

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query GetInfraModel($purpose: String!) {
              infraModel(purpose: $purpose) {
                modelId
                displayName
              }
            }
          `,
          variables: { purpose: 'scenario_expansion' },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.infraModel.modelId).toBe(`${testPrefix}-infra-gpt-4o-mini`);
    });

    it('returns null when not configured with unknown purpose', async () => {
      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query {
              infraModel(purpose: "unknown_purpose_xyz") {
                modelId
              }
            }
          `,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.infraModel).toBeNull();
    });
  });

  describe('Provider models field', () => {
    it('returns models for a provider', async () => {
      const provider = await createTestProvider('prov-models', 'Test Provider');
      await createTestModel(provider.id, 'prov-gpt-4o', 'GPT-4o', {
        costInputPerMillion: 2.5,
        costOutputPerMillion: 10.0,
      });
      await createTestModel(provider.id, 'prov-gpt-4o-mini', 'GPT-4o Mini', {
        costInputPerMillion: 0.15,
        costOutputPerMillion: 0.6,
      });

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query GetProviderWithModels($id: String!) {
              llmProvider(id: $id) {
                name
                models {
                  modelId
                  displayName
                }
              }
            }
          `,
          variables: { id: provider.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.llmProvider.models).toHaveLength(2);

      const modelIds = response.body.data.llmProvider.models.map(
        (m: { modelId: string }) => m.modelId
      );
      expect(modelIds).toContain(`${testPrefix}-prov-gpt-4o`);
      expect(modelIds).toContain(`${testPrefix}-prov-gpt-4o-mini`);
    });
  });
});

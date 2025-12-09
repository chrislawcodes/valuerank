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
const TEST_PREFIX = `integ-${Date.now()}-`;

describe('LLM Database Integration', () => {
  let testUser: { id: string; email: string };
  let apiKey: string;

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

  describe('availableModels query (database-backed)', () => {
    it('returns models from database', async () => {
      // Create test provider and models
      const provider = await db.llmProvider.create({
        data: {
          name: 'openai', // Using standard name for env key mapping
          displayName: `OpenAI (${TEST_PREFIX})`,
        },
      });
      await db.llmModel.create({
        data: {
          providerId: provider.id,
          modelId: 'gpt-4o',
          displayName: 'GPT-4o',
          costInputPerMillion: 2.5,
          costOutputPerMillion: 10.0,
        },
      });
      await db.llmModel.create({
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
      expect(response.body.data.availableModels).toHaveLength(2);

      // Check model data
      const gpt4o = response.body.data.availableModels.find(
        (m: { id: string }) => m.id === 'gpt-4o'
      );
      expect(gpt4o).toBeDefined();
      expect(gpt4o.providerId).toBe('openai');
      expect(gpt4o.displayName).toBe('GPT-4o');
      expect(gpt4o.isAvailable).toBe(true); // OpenAI key is mocked as available
    });

    it('returns only active models by default', async () => {
      const provider = await db.llmProvider.create({
        data: { name: 'openai', displayName: 'OpenAI' },
      });
      await db.llmModel.create({
        data: {
          providerId: provider.id,
          modelId: 'gpt-4o',
          displayName: 'GPT-4o',
          costInputPerMillion: 2.5,
          costOutputPerMillion: 10.0,
          status: 'ACTIVE',
        },
      });
      await db.llmModel.create({
        data: {
          providerId: provider.id,
          modelId: 'gpt-4-turbo',
          displayName: 'GPT-4 Turbo (Deprecated)',
          costInputPerMillion: 10.0,
          costOutputPerMillion: 30.0,
          status: 'DEPRECATED',
        },
      });

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `query { availableModels { id } }`,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.availableModels).toHaveLength(1);
      expect(response.body.data.availableModels[0].id).toBe('gpt-4o');
    });

    it('filters by availability when availableOnly is true', async () => {
      // Create OpenAI provider (API key available via mock)
      const openai = await db.llmProvider.create({
        data: { name: 'openai', displayName: 'OpenAI' },
      });
      await db.llmModel.create({
        data: {
          providerId: openai.id,
          modelId: 'gpt-4o',
          displayName: 'GPT-4o',
          costInputPerMillion: 2.5,
          costOutputPerMillion: 10.0,
        },
      });

      // Create Anthropic provider (API key NOT available via mock)
      const anthropic = await db.llmProvider.create({
        data: { name: 'anthropic', displayName: 'Anthropic' },
      });
      await db.llmModel.create({
        data: {
          providerId: anthropic.id,
          modelId: 'claude-3-opus',
          displayName: 'Claude 3 Opus',
          costInputPerMillion: 15.0,
          costOutputPerMillion: 75.0,
        },
      });

      // Without filter - should return all
      const allResponse = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `query { availableModels { id isAvailable } }`,
        });

      expect(allResponse.body.data.availableModels).toHaveLength(2);

      // With availableOnly filter - should only return OpenAI
      const filteredResponse = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query {
              availableModels(availableOnly: true) {
                id
                providerId
                isAvailable
              }
            }
          `,
        });

      expect(filteredResponse.status).toBe(200);
      expect(filteredResponse.body.data.availableModels).toHaveLength(1);
      expect(filteredResponse.body.data.availableModels[0].id).toBe('gpt-4o');
      expect(filteredResponse.body.data.availableModels[0].isAvailable).toBe(true);
    });

    it('returns backward-compatible fields', async () => {
      const provider = await db.llmProvider.create({
        data: { name: 'openai', displayName: 'OpenAI' },
      });
      await db.llmModel.create({
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

      const model = response.body.data.availableModels[0];
      // Check backward-compatible fields
      expect(model.id).toBe('gpt-4o'); // modelId used as id
      expect(model.providerId).toBe('openai'); // provider name used
      expect(model.versions).toEqual(['gpt-4o']); // modelId as single version
      expect(model.defaultVersion).toBe('gpt-4o'); // modelId as default
    });
  });

  describe('llmModels query with isAvailable', () => {
    it('includes isAvailable field based on provider API key', async () => {
      // Create OpenAI provider (API key available via mock)
      const openai = await db.llmProvider.create({
        data: { name: 'openai', displayName: 'OpenAI' },
      });
      await db.llmModel.create({
        data: {
          providerId: openai.id,
          modelId: 'gpt-4o',
          displayName: 'GPT-4o',
          costInputPerMillion: 2.5,
          costOutputPerMillion: 10.0,
        },
      });

      // Create Anthropic provider (API key NOT available via mock)
      const anthropic = await db.llmProvider.create({
        data: { name: 'anthropic', displayName: 'Anthropic' },
      });
      await db.llmModel.create({
        data: {
          providerId: anthropic.id,
          modelId: 'claude-3-opus',
          displayName: 'Claude 3 Opus',
          costInputPerMillion: 15.0,
          costOutputPerMillion: 75.0,
        },
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
        (m: { modelId: string }) => m.modelId === 'gpt-4o'
      );
      expect(gpt4o.isAvailable).toBe(true);
      expect(gpt4o.provider.name).toBe('openai');

      const claude = response.body.data.llmModels.find(
        (m: { modelId: string }) => m.modelId === 'claude-3-opus'
      );
      expect(claude.isAvailable).toBe(false);
      expect(claude.provider.name).toBe('anthropic');
    });
  });

  describe('Provider with models', () => {
    it('returns models grouped by provider', async () => {
      const openai = await db.llmProvider.create({
        data: { name: 'openai', displayName: 'OpenAI' },
      });
      await db.llmModel.create({
        data: {
          providerId: openai.id,
          modelId: 'gpt-4o',
          displayName: 'GPT-4o',
          costInputPerMillion: 2.5,
          costOutputPerMillion: 10.0,
          isDefault: true,
        },
      });
      await db.llmModel.create({
        data: {
          providerId: openai.id,
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
            query {
              llmProviders {
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
        });

      expect(response.status).toBe(200);
      expect(response.body.data.llmProviders).toHaveLength(1);

      const provider = response.body.data.llmProviders[0];
      expect(provider.name).toBe('openai');
      expect(provider.models).toHaveLength(2);

      const defaultModel = provider.models.find((m: { isDefault: boolean }) => m.isDefault);
      expect(defaultModel.modelId).toBe('gpt-4o');
    });
  });
});

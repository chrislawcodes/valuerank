/**
 * Integration tests for available models query
 *
 * Tests availableModels query returns supported LLM models.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { getAuthHeader } from '../../test-utils.js';
import { db } from '@valuerank/db';

// Mock PgBoss
vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => ({
    send: vi.fn().mockResolvedValue('mock-job-id'),
  })),
  createBoss: vi.fn(() => ({
    send: vi.fn().mockResolvedValue('mock-job-id'),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
  startBoss: vi.fn().mockResolvedValue(undefined),
  stopBoss: vi.fn().mockResolvedValue(undefined),
  isBossRunning: vi.fn().mockReturnValue(false),
}));

const app = createServer();

describe('Available Models Query', () => {
  const modelsQuery = `
    query AvailableModels {
      availableModels {
        id
        providerId
        displayName
        versions
        defaultVersion
        isAvailable
      }
    }
  `;

  const testPrefix = `models-q-${Date.now()}`;
  const createdProviderIds: string[] = [];
  const createdModelIds: string[] = [];

  // Store original env values
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    // Create test providers and models for this test suite
    const openai = await db.llmProvider.create({
      data: { name: `${testPrefix}-openai`, displayName: 'OpenAI Test' },
    });
    createdProviderIds.push(openai.id);

    const model1 = await db.llmModel.create({
      data: {
        providerId: openai.id,
        modelId: `${testPrefix}-gpt-4o`,
        displayName: 'GPT-4o Test',
        costInputPerMillion: 2.5,
        costOutputPerMillion: 10.0,
      },
    });
    createdModelIds.push(model1.id);

    const anthropic = await db.llmProvider.create({
      data: { name: `${testPrefix}-anthropic`, displayName: 'Anthropic Test' },
    });
    createdProviderIds.push(anthropic.id);

    const model2 = await db.llmModel.create({
      data: {
        providerId: anthropic.id,
        modelId: `${testPrefix}-claude-3-opus`,
        displayName: 'Claude 3 Opus Test',
        costInputPerMillion: 15.0,
        costOutputPerMillion: 75.0,
      },
    });
    createdModelIds.push(model2.id);
  });

  afterAll(async () => {
    // Clean up test data
    if (createdModelIds.length > 0) {
      await db.llmModel.deleteMany({ where: { id: { in: createdModelIds } } });
    }
    if (createdProviderIds.length > 0) {
      await db.llmProvider.deleteMany({ where: { id: { in: createdProviderIds } } });
    }
  });

  beforeEach(() => {
    // Reset env to test state
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  it('returns list of available models', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query: modelsQuery });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();

    const models = response.body.data.availableModels;
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
  });

  it('each model has required fields', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query: modelsQuery });

    expect(response.status).toBe(200);

    const models = response.body.data.availableModels;
    for (const model of models) {
      expect(typeof model.id).toBe('string');
      expect(typeof model.providerId).toBe('string');
      expect(typeof model.displayName).toBe('string');
      expect(Array.isArray(model.versions)).toBe(true);
      expect(model.versions.length).toBeGreaterThan(0);
      expect(typeof model.isAvailable).toBe('boolean');
      // defaultVersion can be string or null
      expect(model.defaultVersion === null || typeof model.defaultVersion === 'string').toBe(true);
    }
  });

  it('includes test models from our created providers', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query: modelsQuery });

    expect(response.status).toBe(200);

    const models = response.body.data.availableModels;
    const providerIds = new Set(models.map((m: { providerId: string }) => m.providerId));

    // Should include our test providers (created in beforeAll)
    expect(providerIds.has(`${testPrefix}-openai`)).toBe(true);
    expect(providerIds.has(`${testPrefix}-anthropic`)).toBe(true);
  });

  it('marks test models as unavailable when no matching API key exists', async () => {
    // Our test providers use prefixed names that won't map to any env var
    // So they should all be unavailable
    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query: modelsQuery });

    expect(response.status).toBe(200);

    const models = response.body.data.availableModels;
    const testModels = models.filter((m: { providerId: string }) =>
      m.providerId.startsWith(testPrefix)
    );

    // Test models should be unavailable (no API key maps to prefixed provider names)
    expect(testModels.length).toBe(2);
    for (const model of testModels) {
      expect(model.isAvailable).toBe(false);
    }
  });

  it('marks our test models as unavailable when API keys are not configured', async () => {
    // Clear all API keys
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.MISTRAL_API_KEY;

    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query: modelsQuery });

    expect(response.status).toBe(200);

    const models = response.body.data.availableModels;
    const testModels = models.filter((m: { providerId: string }) =>
      m.providerId.startsWith(testPrefix)
    );

    // Our test models should be unavailable
    for (const model of testModels) {
      expect(model.isAvailable).toBe(false);
    }
  });

  it('requires authentication', async () => {
    const response = await request(app).post('/graphql').send({ query: modelsQuery });

    expect(response.status).toBe(401);
  });

  it('returns versions as non-empty arrays', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query: modelsQuery });

    expect(response.status).toBe(200);

    const models = response.body.data.availableModels;
    for (const model of models) {
      expect(model.versions.length).toBeGreaterThan(0);
      // Each version should be a non-empty string
      for (const version of model.versions) {
        expect(typeof version).toBe('string');
        expect(version.length).toBeGreaterThan(0);
      }
    }
  });

  it('returns consistent provider grouping', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query: modelsQuery });

    expect(response.status).toBe(200);

    const models = response.body.data.availableModels;

    // Group by provider and check consistency
    const byProvider = new Map<string, Array<{ id: string; isAvailable: boolean }>>();
    for (const model of models) {
      const existing = byProvider.get(model.providerId) ?? [];
      existing.push(model);
      byProvider.set(model.providerId, existing);
    }

    // Each provider should have consistent isAvailable across all models
    for (const [providerId, providerModels] of byProvider) {
      const availabilities = new Set(providerModels.map((m) => m.isAvailable));
      expect(availabilities.size).toBe(1);
    }
  });
});

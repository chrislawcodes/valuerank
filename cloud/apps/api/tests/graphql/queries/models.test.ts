/**
 * Integration tests for available models query
 *
 * Tests availableModels query returns supported LLM models.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { getAuthHeader } from '../../test-utils.js';

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

  // Store original env values
  const originalEnv = { ...process.env };

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

  it('includes models from known providers', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query: modelsQuery });

    expect(response.status).toBe(200);

    const models = response.body.data.availableModels;
    const providerIds = new Set(models.map((m: { providerId: string }) => m.providerId));

    // Should include at least some known providers
    const knownProviders = ['openai', 'anthropic', 'google', 'xai', 'deepseek', 'mistral'];
    const hasKnownProvider = knownProviders.some((p) => providerIds.has(p));
    expect(hasKnownProvider).toBe(true);
  });

  it('marks models as available when API key is configured', async () => {
    // Set an API key for testing
    process.env.OPENAI_API_KEY = 'test-key';

    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query: modelsQuery });

    expect(response.status).toBe(200);

    const models = response.body.data.availableModels;
    const openaiModels = models.filter((m: { providerId: string }) => m.providerId === 'openai');

    // OpenAI models should be available
    expect(openaiModels.length).toBeGreaterThan(0);
    for (const model of openaiModels) {
      expect(model.isAvailable).toBe(true);
    }
  });

  it('marks models as unavailable when API key is not configured', async () => {
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

    // All models should be unavailable
    for (const model of models) {
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

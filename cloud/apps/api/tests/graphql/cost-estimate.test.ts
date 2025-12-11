/**
 * Integration tests for Cost Estimate GraphQL queries.
 *
 * Tests the GraphQL API for cost estimation and token statistics.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../src/server.js';
import { db } from '@valuerank/db';
import { generateApiKey, hashApiKey, getKeyPrefix } from '../../src/auth/api-keys.js';

const app = createServer();

describe('Cost Estimate GraphQL Queries', () => {
  let testUser: { id: string; email: string };
  let apiKey: string;
  const testPrefix = `cost-${Date.now()}`;
  const createdProviderIds: string[] = [];
  const createdModelIds: string[] = [];
  const createdDefinitionIds: string[] = [];
  const createdStatsIds: string[] = [];

  beforeAll(async () => {
    // Create test user
    testUser = await db.user.create({
      data: {
        email: `cost-test-${Date.now()}@example.com`,
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
    // Clean up in reverse order of dependencies
    if (createdStatsIds.length > 0) {
      await db.modelTokenStatistics.deleteMany({ where: { id: { in: createdStatsIds } } });
    }
    // Clean up scenarios first (they reference definitions)
    if (createdDefinitionIds.length > 0) {
      await db.scenario.deleteMany({ where: { definitionId: { in: createdDefinitionIds } } });
      await db.definition.deleteMany({ where: { id: { in: createdDefinitionIds } } });
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

  afterEach(async () => {
    // Clean up stats after each test
    if (createdStatsIds.length > 0) {
      await db.modelTokenStatistics.deleteMany({ where: { id: { in: createdStatsIds } } });
      createdStatsIds.length = 0;
    }
  });

  // Helper to create provider
  async function createTestProvider(name: string, displayName: string) {
    const provider = await db.llmProvider.create({
      data: { name: `${testPrefix}-${name}`, displayName },
    });
    createdProviderIds.push(provider.id);
    return provider;
  }

  // Helper to create model
  async function createTestModel(
    providerId: string,
    modelId: string,
    displayName: string,
    extra?: object
  ) {
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

  // Helper to create definition with scenarios
  async function createTestDefinition(name: string, scenarioCount: number) {
    const definition = await db.definition.create({
      data: {
        name: `${testPrefix}-${name}`,
        content: { schema_version: 1, preamble: 'Test preamble' },
      },
    });
    createdDefinitionIds.push(definition.id);

    // Create scenarios
    for (let i = 0; i < scenarioCount; i++) {
      await db.scenario.create({
        data: {
          definitionId: definition.id,
          name: `Scenario ${i + 1}`,
          content: {
            body: `Test scenario body ${i + 1}`,
            dimensionValues: {},
          },
        },
      });
    }

    return definition;
  }

  // Helper to create token statistics
  async function createTestStats(
    modelId: string,
    avgInput: number,
    avgOutput: number,
    sampleCount: number
  ) {
    const stats = await db.modelTokenStatistics.create({
      data: {
        modelId,
        definitionId: null,
        avgInputTokens: avgInput,
        avgOutputTokens: avgOutput,
        sampleCount,
      },
    });
    createdStatsIds.push(stats.id);
    return stats;
  }

  describe('estimateCost query', () => {
    it('returns cost estimate with per-model breakdown', async () => {
      const provider = await createTestProvider('estimate-provider', 'Test Provider');
      const model = await createTestModel(provider.id, 'estimate-model', 'Test Model', {
        costInputPerMillion: 10.0,
        costOutputPerMillion: 30.0,
      });
      const definition = await createTestDefinition('estimate-def', 10);

      // Create token stats for the model
      await createTestStats(model.id, 500, 1500, 100);

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query EstimateCost($definitionId: ID!, $models: [String!]!) {
              estimateCost(definitionId: $definitionId, models: $models) {
                total
                scenarioCount
                basedOnSampleCount
                isUsingFallback
                fallbackReason
                perModel {
                  modelId
                  displayName
                  scenarioCount
                  inputTokens
                  outputTokens
                  inputCost
                  outputCost
                  totalCost
                  avgInputPerProbe
                  avgOutputPerProbe
                  sampleCount
                  isUsingFallback
                }
              }
            }
          `,
          variables: { definitionId: definition.id, models: [model.id] },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const estimate = response.body.data.estimateCost;
      expect(estimate.scenarioCount).toBe(10);
      expect(estimate.basedOnSampleCount).toBe(100);
      expect(estimate.isUsingFallback).toBe(false);
      expect(estimate.fallbackReason).toBeNull();

      expect(estimate.perModel).toHaveLength(1);
      const modelEstimate = estimate.perModel[0];
      // modelId is now the model identifier string, not the database UUID
      expect(modelEstimate.modelId).toBe(model.modelId);
      expect(modelEstimate.displayName).toBe('Test Model');
      expect(modelEstimate.scenarioCount).toBe(10);
      expect(modelEstimate.avgInputPerProbe).toBe(500);
      expect(modelEstimate.avgOutputPerProbe).toBe(1500);
      expect(modelEstimate.sampleCount).toBe(100);
      expect(modelEstimate.isUsingFallback).toBe(false);

      // Verify cost calculation
      // 10 scenarios × 500 input tokens = 5000 total input
      // 10 scenarios × 1500 output tokens = 15000 total output
      expect(modelEstimate.inputTokens).toBe(5000);
      expect(modelEstimate.outputTokens).toBe(15000);

      // Cost: (5000 × 10) / 1,000,000 = 0.05 input
      // Cost: (15000 × 30) / 1,000,000 = 0.45 output
      expect(modelEstimate.inputCost).toBeCloseTo(0.05, 4);
      expect(modelEstimate.outputCost).toBeCloseTo(0.45, 4);
      expect(modelEstimate.totalCost).toBeCloseTo(0.5, 4);
      expect(estimate.total).toBeCloseTo(0.5, 4);
    });

    it('uses fallback when model has no statistics', async () => {
      const provider = await createTestProvider('fallback-provider', 'Test Provider');
      const model = await createTestModel(provider.id, 'fallback-model', 'Test Model');
      const definition = await createTestDefinition('fallback-def', 5);

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query EstimateCost($definitionId: ID!, $models: [String!]!) {
              estimateCost(definitionId: $definitionId, models: $models) {
                total
                isUsingFallback
                fallbackReason
                perModel {
                  isUsingFallback
                  avgInputPerProbe
                  avgOutputPerProbe
                  sampleCount
                }
              }
            }
          `,
          variables: { definitionId: definition.id, models: [model.id] },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const estimate = response.body.data.estimateCost;
      expect(estimate.isUsingFallback).toBe(true);
      expect(estimate.fallbackReason).toContain('No historical token data');

      const modelEstimate = estimate.perModel[0];
      expect(modelEstimate.isUsingFallback).toBe(true);
      expect(modelEstimate.sampleCount).toBe(0);
      // Should use system defaults (100 input, 900 output)
      expect(modelEstimate.avgInputPerProbe).toBe(100);
      expect(modelEstimate.avgOutputPerProbe).toBe(900);
    });

    it('supports sample percentage', async () => {
      const provider = await createTestProvider('sample-provider', 'Test Provider');
      const model = await createTestModel(provider.id, 'sample-model', 'Test Model');
      const definition = await createTestDefinition('sample-def', 100);

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query EstimateCost($definitionId: ID!, $models: [String!]!, $samplePercentage: Int) {
              estimateCost(definitionId: $definitionId, models: $models, samplePercentage: $samplePercentage) {
                scenarioCount
                perModel {
                  scenarioCount
                }
              }
            }
          `,
          variables: { definitionId: definition.id, models: [model.id], samplePercentage: 10 },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const estimate = response.body.data.estimateCost;
      expect(estimate.scenarioCount).toBe(10); // 10% of 100
      expect(estimate.perModel[0].scenarioCount).toBe(10);
    });

    it('supports provider:modelId format', async () => {
      const provider = await createTestProvider('format-provider', 'Test Provider');
      const model = await createTestModel(provider.id, 'format-model', 'Test Model');
      const definition = await createTestDefinition('format-def', 5);

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query EstimateCost($definitionId: ID!, $models: [String!]!) {
              estimateCost(definitionId: $definitionId, models: $models) {
                perModel {
                  displayName
                }
              }
            }
          `,
          variables: {
            definitionId: definition.id,
            models: [`${testPrefix}-format-provider:${testPrefix}-format-model`],
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.estimateCost.perModel[0].displayName).toBe('Test Model');
    });

    it('returns error for non-existent definition', async () => {
      const provider = await createTestProvider('nodef-provider', 'Test Provider');
      const model = await createTestModel(provider.id, 'nodef-model', 'Test Model');

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query EstimateCost($definitionId: ID!, $models: [String!]!) {
              estimateCost(definitionId: $definitionId, models: $models) {
                total
              }
            }
          `,
          variables: { definitionId: 'non-existent-id', models: [model.id] },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('not found');
    });

    it('handles multiple models', async () => {
      const provider = await createTestProvider('multi-provider', 'Test Provider');
      const model1 = await createTestModel(provider.id, 'multi-model-1', 'Model 1', {
        costInputPerMillion: 10.0,
        costOutputPerMillion: 30.0,
      });
      const model2 = await createTestModel(provider.id, 'multi-model-2', 'Model 2', {
        costInputPerMillion: 5.0,
        costOutputPerMillion: 15.0,
      });
      const definition = await createTestDefinition('multi-def', 10);

      // Create stats for both models
      await createTestStats(model1.id, 500, 1500, 100);
      await createTestStats(model2.id, 800, 2000, 50);

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query EstimateCost($definitionId: ID!, $models: [String!]!) {
              estimateCost(definitionId: $definitionId, models: $models) {
                total
                perModel {
                  modelId
                  displayName
                  totalCost
                }
              }
            }
          `,
          variables: { definitionId: definition.id, models: [model1.id, model2.id] },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const estimate = response.body.data.estimateCost;
      expect(estimate.perModel).toHaveLength(2);

      // Total should be sum of both models
      const totalFromModels = estimate.perModel.reduce(
        (sum: number, m: { totalCost: number }) => sum + m.totalCost,
        0
      );
      expect(estimate.total).toBeCloseTo(totalFromModels, 4);
    });
  });

  describe('modelTokenStats query', () => {
    it('returns all token statistics when no filter', async () => {
      const provider = await createTestProvider('stats-all-provider', 'Test Provider');
      const model1 = await createTestModel(provider.id, 'stats-all-1', 'Model 1');
      const model2 = await createTestModel(provider.id, 'stats-all-2', 'Model 2');

      await createTestStats(model1.id, 500, 1500, 100);
      await createTestStats(model2.id, 800, 2000, 50);

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query {
              modelTokenStats {
                modelId
                avgInputTokens
                avgOutputTokens
                sampleCount
                lastUpdatedAt
              }
            }
          `,
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const stats = response.body.data.modelTokenStats;
      expect(stats.length).toBeGreaterThanOrEqual(2);

      // Find our test models - modelId is now the model identifier string
      const model1Stats = stats.find((s: { modelId: string }) => s.modelId === model1.modelId);
      const model2Stats = stats.find((s: { modelId: string }) => s.modelId === model2.modelId);

      expect(model1Stats).toBeDefined();
      expect(model1Stats.avgInputTokens).toBe(500);
      expect(model1Stats.avgOutputTokens).toBe(1500);
      expect(model1Stats.sampleCount).toBe(100);

      expect(model2Stats).toBeDefined();
      expect(model2Stats.avgInputTokens).toBe(800);
    });

    it('returns filtered stats by model IDs', async () => {
      const provider = await createTestProvider('stats-filter-provider', 'Test Provider');
      const model1 = await createTestModel(provider.id, 'stats-filter-1', 'Model 1');
      const model2 = await createTestModel(provider.id, 'stats-filter-2', 'Model 2');

      await createTestStats(model1.id, 500, 1500, 100);
      await createTestStats(model2.id, 800, 2000, 50);

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query GetStats($modelIds: [String!]) {
              modelTokenStats(modelIds: $modelIds) {
                modelId
                avgInputTokens
              }
            }
          `,
          variables: { modelIds: [model1.id] },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const stats = response.body.data.modelTokenStats;
      expect(stats).toHaveLength(1);
      // modelId is now the model identifier string, not the database UUID
      expect(stats[0].modelId).toBe(model1.modelId);
      expect(stats[0].avgInputTokens).toBe(500);
    });

    it('returns empty array for models without stats', async () => {
      const provider = await createTestProvider('stats-empty-provider', 'Test Provider');
      const model = await createTestModel(provider.id, 'stats-empty-model', 'Model');

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query GetStats($modelIds: [String!]) {
              modelTokenStats(modelIds: $modelIds) {
                modelId
              }
            }
          `,
          variables: { modelIds: [model.id] },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.modelTokenStats).toHaveLength(0);
    });
  });

  describe('allModelTokenAverage query', () => {
    it('returns average across all models', async () => {
      const provider = await createTestProvider('avg-provider', 'Test Provider');
      const model1 = await createTestModel(provider.id, 'avg-model-1', 'Model 1');
      const model2 = await createTestModel(provider.id, 'avg-model-2', 'Model 2');

      // Clear any existing stats to get predictable results
      await db.modelTokenStatistics.deleteMany({});

      await createTestStats(model1.id, 400, 1200, 100);
      await createTestStats(model2.id, 600, 1800, 100);

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query {
              allModelTokenAverage {
                modelId
                avgInputTokens
                avgOutputTokens
                sampleCount
              }
            }
          `,
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const avg = response.body.data.allModelTokenAverage;
      expect(avg).not.toBeNull();
      expect(avg.modelId).toBe('all-model-average');
      // Average of 400 and 600 = 500
      expect(avg.avgInputTokens).toBe(500);
      // Average of 1200 and 1800 = 1500
      expect(avg.avgOutputTokens).toBe(1500);
      expect(avg.sampleCount).toBe(200);
    });

    it('returns null when no stats exist', async () => {
      // Clear all stats
      await db.modelTokenStatistics.deleteMany({});

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query {
              allModelTokenAverage {
                avgInputTokens
              }
            }
          `,
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.allModelTokenAverage).toBeNull();
    });
  });
});

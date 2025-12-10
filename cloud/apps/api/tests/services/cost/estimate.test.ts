/**
 * Unit tests for cost estimation service
 *
 * Tests cost calculation, fallback logic, and actual cost computation.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { db } from '@valuerank/db';
import { estimateCost, computeActualCost, formatCost } from '../../../src/services/cost/estimate.js';
import { NotFoundError, ValidationError } from '@valuerank/shared';
import { TEST_USER } from '../../test-utils.js';

describe('cost estimation service', () => {
  // Track test data for cleanup
  const createdDefinitionIds: string[] = [];
  const createdModelIds: string[] = [];
  const createdProviderIds: string[] = [];
  const createdStatsIds: string[] = [];

  // Test provider and models
  let testProviderId: string;
  let testModel1Id: string;
  let testModel2Id: string;

  beforeAll(async () => {
    // Ensure test user exists - use email as the unique constraint for upsert
    await db.user.upsert({
      where: { email: TEST_USER.email },
      create: {
        id: TEST_USER.id,
        email: TEST_USER.email,
        passwordHash: 'test-hash',
      },
      update: {},
    });

    // Create test provider
    const provider = await db.llmProvider.create({
      data: {
        name: `test-provider-${Date.now()}`,
        displayName: 'Test Provider',
      },
    });
    testProviderId = provider.id;
    createdProviderIds.push(provider.id);

    // Create test models with different pricing
    const model1 = await db.llmModel.create({
      data: {
        providerId: provider.id,
        modelId: `test-model-1-${Date.now()}`,
        displayName: 'Test Model 1',
        costInputPerMillion: 10.0,    // $10 per million input tokens
        costOutputPerMillion: 30.0,   // $30 per million output tokens
      },
    });
    testModel1Id = model1.id;
    createdModelIds.push(model1.id);

    const model2 = await db.llmModel.create({
      data: {
        providerId: provider.id,
        modelId: `test-model-2-${Date.now()}`,
        displayName: 'Test Model 2',
        costInputPerMillion: 5.0,     // $5 per million input tokens
        costOutputPerMillion: 15.0,   // $15 per million output tokens
      },
    });
    testModel2Id = model2.id;
    createdModelIds.push(model2.id);
  });

  beforeEach(async () => {
    // Clean up stats before each test
    if (createdStatsIds.length > 0) {
      await db.modelTokenStatistics.deleteMany({
        where: { id: { in: createdStatsIds } },
      });
      createdStatsIds.length = 0;
    }
  });

  afterEach(async () => {
    // Clean up definitions
    if (createdDefinitionIds.length > 0) {
      await db.scenario.deleteMany({
        where: { definitionId: { in: createdDefinitionIds } },
      });
      await db.definition.deleteMany({
        where: { id: { in: createdDefinitionIds } },
      });
      createdDefinitionIds.length = 0;
    }

    // Clean up stats
    if (createdStatsIds.length > 0) {
      await db.modelTokenStatistics.deleteMany({
        where: { id: { in: createdStatsIds } },
      });
      createdStatsIds.length = 0;
    }
  });

  describe('formatCost', () => {
    it('formats sub-cent amounts with 4 decimals', () => {
      expect(formatCost(0.0012)).toBe('$0.0012');
      expect(formatCost(0.0099)).toBe('$0.0099');
    });

    it('formats cents with 3 decimals', () => {
      expect(formatCost(0.012)).toBe('$0.012');
      expect(formatCost(0.99)).toBe('$0.990');
    });

    it('formats dollars with 2 decimals', () => {
      expect(formatCost(1.5)).toBe('$1.50');
      expect(formatCost(12.99)).toBe('$12.99');
      expect(formatCost(100)).toBe('$100.00');
    });
  });

  describe('estimateCost', () => {
    describe('calculation accuracy', () => {
      it('calculates cost correctly with known token statistics', async () => {
        // Create definition with 10 scenarios
        const definition = await db.definition.create({
          data: {
            name: 'Cost Calc Test',
            content: { schema_version: 1, preamble: 'Test' },
          },
        });
        createdDefinitionIds.push(definition.id);

        await db.scenario.createMany({
          data: Array.from({ length: 10 }, (_, i) => ({
            definitionId: definition.id,
            name: `Scenario ${i + 1}`,
            content: { test: i + 1 },
          })),
        });

        // Create token statistics for model 1: 1000 input, 2000 output per probe
        const stats = await db.modelTokenStatistics.create({
          data: {
            modelId: testModel1Id,
            definitionId: null,
            avgInputTokens: 1000,
            avgOutputTokens: 2000,
            sampleCount: 100,
          },
        });
        createdStatsIds.push(stats.id);

        const result = await estimateCost({
          definitionId: definition.id,
          modelIds: [testModel1Id],
          samplePercentage: 100,
        });

        // 10 scenarios * 1000 input tokens = 10,000 input tokens
        // 10 scenarios * 2000 output tokens = 20,000 output tokens
        // Cost: (10,000 * $10/M) + (20,000 * $30/M) = $0.10 + $0.60 = $0.70
        expect(result.total).toBeCloseTo(0.70, 4);
        expect(result.perModel.length).toBe(1);
        expect(result.perModel[0]?.totalCost).toBeCloseTo(0.70, 4);
        expect(result.perModel[0]?.inputCost).toBeCloseTo(0.10, 4);
        expect(result.perModel[0]?.outputCost).toBeCloseTo(0.60, 4);
        expect(result.isUsingFallback).toBe(false);
      });

      it('applies sample percentage correctly', async () => {
        const definition = await db.definition.create({
          data: {
            name: 'Sample Test',
            content: { schema_version: 1, preamble: 'Test' },
          },
        });
        createdDefinitionIds.push(definition.id);

        await db.scenario.createMany({
          data: Array.from({ length: 100 }, (_, i) => ({
            definitionId: definition.id,
            name: `Scenario ${i + 1}`,
            content: { test: i + 1 },
          })),
        });

        // With 100 scenarios at 25%, we expect cost for 25 scenarios
        const result = await estimateCost({
          definitionId: definition.id,
          modelIds: [testModel1Id],
          samplePercentage: 25,
        });

        expect(result.scenarioCount).toBe(25);
      });
    });

    describe('fallback logic', () => {
      it('uses model-specific stats when available', async () => {
        const definition = await db.definition.create({
          data: {
            name: 'Fallback Test - Model Stats',
            content: { schema_version: 1, preamble: 'Test' },
          },
        });
        createdDefinitionIds.push(definition.id);

        await db.scenario.create({
          data: {
            definitionId: definition.id,
            name: 'Test Scenario',
            content: { test: 1 },
          },
        });

        // Create stats for model 1
        const stats = await db.modelTokenStatistics.create({
          data: {
            modelId: testModel1Id,
            definitionId: null,
            avgInputTokens: 500,
            avgOutputTokens: 1500,
            sampleCount: 50,
          },
        });
        createdStatsIds.push(stats.id);

        const result = await estimateCost({
          definitionId: definition.id,
          modelIds: [testModel1Id],
        });

        expect(result.perModel[0]?.avgInputPerProbe).toBe(500);
        expect(result.perModel[0]?.avgOutputPerProbe).toBe(1500);
        expect(result.perModel[0]?.sampleCount).toBe(50);
        expect(result.perModel[0]?.isUsingFallback).toBe(false);
      });

      it('falls back to all-model average when model has no stats', async () => {
        // Clean up ALL stats to ensure isolation
        await db.modelTokenStatistics.deleteMany({});

        const definition = await db.definition.create({
          data: {
            name: 'Fallback Test - All Model Avg',
            content: { schema_version: 1, preamble: 'Test' },
          },
        });
        createdDefinitionIds.push(definition.id);

        await db.scenario.create({
          data: {
            definitionId: definition.id,
            name: 'Test Scenario',
            content: { test: 1 },
          },
        });

        // Create stats only for model 2 (not the one we're querying)
        const stats = await db.modelTokenStatistics.create({
          data: {
            modelId: testModel2Id,
            definitionId: null,
            avgInputTokens: 800,
            avgOutputTokens: 1600,
            sampleCount: 100,
          },
        });
        createdStatsIds.push(stats.id);

        // Query for model 1 (which has no stats) - should use all-model average
        const result = await estimateCost({
          definitionId: definition.id,
          modelIds: [testModel1Id],
        });

        // All-model average is just model2's stats (800/1600)
        expect(result.perModel[0]?.avgInputPerProbe).toBe(800);
        expect(result.perModel[0]?.avgOutputPerProbe).toBe(1600);
        expect(result.perModel[0]?.isUsingFallback).toBe(true);
        expect(result.isUsingFallback).toBe(true);
      });

      it('falls back to system default when DB is empty', async () => {
        // First, clean up any existing stats
        await db.modelTokenStatistics.deleteMany({});

        const definition = await db.definition.create({
          data: {
            name: 'Fallback Test - System Default',
            content: { schema_version: 1, preamble: 'Test' },
          },
        });
        createdDefinitionIds.push(definition.id);

        await db.scenario.create({
          data: {
            definitionId: definition.id,
            name: 'Test Scenario',
            content: { test: 1 },
          },
        });

        const result = await estimateCost({
          definitionId: definition.id,
          modelIds: [testModel1Id],
        });

        // System default: 100 input, 900 output
        expect(result.perModel[0]?.avgInputPerProbe).toBe(100);
        expect(result.perModel[0]?.avgOutputPerProbe).toBe(900);
        expect(result.perModel[0]?.isUsingFallback).toBe(true);
        expect(result.isUsingFallback).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('returns zero cost for definition with no scenarios', async () => {
        const definition = await db.definition.create({
          data: {
            name: 'Empty Definition',
            content: { schema_version: 1, preamble: 'Test' },
          },
        });
        createdDefinitionIds.push(definition.id);

        const result = await estimateCost({
          definitionId: definition.id,
          modelIds: [testModel1Id],
        });

        expect(result.total).toBe(0);
        expect(result.scenarioCount).toBe(0);
        expect(result.perModel.length).toBe(0);
      });

      it('throws NotFoundError for non-existent definition', async () => {
        await expect(
          estimateCost({
            definitionId: 'non-existent-id',
            modelIds: [testModel1Id],
          })
        ).rejects.toThrow(NotFoundError);
      });

      it('throws ValidationError for empty models list', async () => {
        const definition = await db.definition.create({
          data: {
            name: 'Validation Test',
            content: { schema_version: 1, preamble: 'Test' },
          },
        });
        createdDefinitionIds.push(definition.id);

        await expect(
          estimateCost({
            definitionId: definition.id,
            modelIds: [],
          })
        ).rejects.toThrow(ValidationError);
      });

      it('throws ValidationError for invalid sample percentage', async () => {
        const definition = await db.definition.create({
          data: {
            name: 'Sample Validation Test',
            content: { schema_version: 1, preamble: 'Test' },
          },
        });
        createdDefinitionIds.push(definition.id);

        await expect(
          estimateCost({
            definitionId: definition.id,
            modelIds: [testModel1Id],
            samplePercentage: 0,
          })
        ).rejects.toThrow(ValidationError);

        await expect(
          estimateCost({
            definitionId: definition.id,
            modelIds: [testModel1Id],
            samplePercentage: 101,
          })
        ).rejects.toThrow(ValidationError);
      });

      it('handles multiple models with mixed stats availability', async () => {
        const definition = await db.definition.create({
          data: {
            name: 'Mixed Stats Test',
            content: { schema_version: 1, preamble: 'Test' },
          },
        });
        createdDefinitionIds.push(definition.id);

        await db.scenario.create({
          data: {
            definitionId: definition.id,
            name: 'Test Scenario',
            content: { test: 1 },
          },
        });

        // Create stats only for model 1
        const stats = await db.modelTokenStatistics.create({
          data: {
            modelId: testModel1Id,
            definitionId: null,
            avgInputTokens: 500,
            avgOutputTokens: 1500,
            sampleCount: 100,
          },
        });
        createdStatsIds.push(stats.id);

        // Query both models - model2 should use fallback
        const result = await estimateCost({
          definitionId: definition.id,
          modelIds: [testModel1Id, testModel2Id],
        });

        expect(result.perModel.length).toBe(2);

        const model1Result = result.perModel.find((m) => m.modelId === testModel1Id);
        const model2Result = result.perModel.find((m) => m.modelId === testModel2Id);

        expect(model1Result?.isUsingFallback).toBe(false);
        expect(model2Result?.isUsingFallback).toBe(true);
        expect(result.isUsingFallback).toBe(true); // Any model using fallback
      });
    });
  });

  describe('computeActualCost', () => {
    it('computes cost from transcript costSnapshot data', async () => {
      const transcripts = [
        {
          modelId: testModel1Id,
          content: {
            costSnapshot: {
              estimatedCost: 0.05,
              inputTokens: 500,
              outputTokens: 1000,
            },
          },
        },
        {
          modelId: testModel1Id,
          content: {
            costSnapshot: {
              estimatedCost: 0.08,
              inputTokens: 800,
              outputTokens: 1200,
            },
          },
        },
      ];

      const result = await computeActualCost(transcripts);

      expect(result.total).toBeCloseTo(0.13, 4);
      expect(result.perModel[testModel1Id]?.cost).toBeCloseTo(0.13, 4);
      expect(result.perModel[testModel1Id]?.probeCount).toBe(2);
      expect(result.perModel[testModel1Id]?.inputTokens).toBe(1300);
      expect(result.perModel[testModel1Id]?.outputTokens).toBe(2200);
    });

    it('calculates cost from tokens when estimatedCost not available', async () => {
      const transcripts = [
        {
          modelId: testModel1Id,
          content: {
            costSnapshot: {
              inputTokens: 1000,
              outputTokens: 2000,
            },
          },
        },
      ];

      const result = await computeActualCost(transcripts);

      // (1000 * $10/M) + (2000 * $30/M) = $0.01 + $0.06 = $0.07
      expect(result.total).toBeCloseTo(0.07, 4);
    });

    it('handles missing costSnapshot gracefully', async () => {
      const transcripts = [
        {
          modelId: testModel1Id,
          content: {},
        },
      ];

      const result = await computeActualCost(transcripts);

      expect(result.total).toBe(0);
      expect(result.perModel[testModel1Id]?.probeCount).toBe(1);
      expect(result.perModel[testModel1Id]?.cost).toBe(0);
    });

    it('groups costs by model', async () => {
      const transcripts = [
        {
          modelId: testModel1Id,
          content: {
            costSnapshot: { estimatedCost: 0.10 },
          },
        },
        {
          modelId: testModel2Id,
          content: {
            costSnapshot: { estimatedCost: 0.05 },
          },
        },
        {
          modelId: testModel1Id,
          content: {
            costSnapshot: { estimatedCost: 0.10 },
          },
        },
      ];

      const result = await computeActualCost(transcripts);

      expect(result.total).toBeCloseTo(0.25, 4);
      expect(result.perModel[testModel1Id]?.cost).toBeCloseTo(0.20, 4);
      expect(result.perModel[testModel1Id]?.probeCount).toBe(2);
      expect(result.perModel[testModel2Id]?.cost).toBeCloseTo(0.05, 4);
      expect(result.perModel[testModel2Id]?.probeCount).toBe(1);
    });
  });
});

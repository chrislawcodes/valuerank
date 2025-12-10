/**
 * Unit tests for token statistics service
 *
 * Tests statistics queries and updates.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { db } from '@valuerank/db';
import {
  getTokenStatsForModels,
  getAllModelAverage,
  upsertTokenStats,
} from '../../../src/services/cost/statistics.js';
import { TEST_USER } from '../../test-utils.js';

describe('token statistics service', () => {
  // Track test data for cleanup
  const createdModelIds: string[] = [];
  const createdProviderIds: string[] = [];

  // Test provider and models
  let testProviderId: string;
  let testModel1Id: string;
  let testModel2Id: string;
  let testModel3Id: string;

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
        name: `test-stats-provider-${Date.now()}`,
        displayName: 'Test Stats Provider',
      },
    });
    testProviderId = provider.id;
    createdProviderIds.push(provider.id);

    // Create test models
    const model1 = await db.llmModel.create({
      data: {
        providerId: provider.id,
        modelId: `test-stats-model-1-${Date.now()}`,
        displayName: 'Test Stats Model 1',
        costInputPerMillion: 10.0,
        costOutputPerMillion: 30.0,
      },
    });
    testModel1Id = model1.id;
    createdModelIds.push(model1.id);

    const model2 = await db.llmModel.create({
      data: {
        providerId: provider.id,
        modelId: `test-stats-model-2-${Date.now()}`,
        displayName: 'Test Stats Model 2',
        costInputPerMillion: 5.0,
        costOutputPerMillion: 15.0,
      },
    });
    testModel2Id = model2.id;
    createdModelIds.push(model2.id);

    const model3 = await db.llmModel.create({
      data: {
        providerId: provider.id,
        modelId: `test-stats-model-3-${Date.now()}`,
        displayName: 'Test Stats Model 3',
        costInputPerMillion: 2.0,
        costOutputPerMillion: 6.0,
      },
    });
    testModel3Id = model3.id;
    createdModelIds.push(model3.id);
  });

  afterEach(async () => {
    // Clean up all stats for our test models after each test
    await db.modelTokenStatistics.deleteMany({
      where: {
        modelId: { in: [testModel1Id, testModel2Id, testModel3Id] },
      },
    });
  });

  describe('getTokenStatsForModels', () => {
    it('returns empty map for empty model list', async () => {
      const result = await getTokenStatsForModels([]);
      expect(result.size).toBe(0);
    });

    it('returns stats for models that have them', async () => {
      // Create stats for model 1
      await db.modelTokenStatistics.create({
        data: {
          modelId: testModel1Id,
          definitionId: null,
          avgInputTokens: 500,
          avgOutputTokens: 1500,
          sampleCount: 100,
        },
      });

      const result = await getTokenStatsForModels([testModel1Id]);

      expect(result.size).toBe(1);
      expect(result.get(testModel1Id)).toBeDefined();
      expect(result.get(testModel1Id)?.avgInputTokens).toBe(500);
      expect(result.get(testModel1Id)?.avgOutputTokens).toBe(1500);
      expect(result.get(testModel1Id)?.sampleCount).toBe(100);
    });

    it('returns empty map for models without stats', async () => {
      const result = await getTokenStatsForModels([testModel1Id]);
      expect(result.size).toBe(0);
    });

    it('returns only global stats (not definition-specific)', async () => {
      // Create global stats
      await db.modelTokenStatistics.create({
        data: {
          modelId: testModel1Id,
          definitionId: null,
          avgInputTokens: 500,
          avgOutputTokens: 1500,
          sampleCount: 100,
        },
      });

      // Create a dummy definition to associate stats with
      const definition = await db.definition.create({
        data: {
          name: 'Test Definition for Stats',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });

      try {
        // Create definition-specific stats (should be ignored)
        await db.modelTokenStatistics.create({
          data: {
            modelId: testModel1Id,
            definitionId: definition.id,
            avgInputTokens: 800,
            avgOutputTokens: 2000,
            sampleCount: 50,
          },
        });

        const result = await getTokenStatsForModels([testModel1Id]);

        // Should only return global stats
        expect(result.size).toBe(1);
        expect(result.get(testModel1Id)?.avgInputTokens).toBe(500);
      } finally {
        // Cleanup definition
        await db.definition.delete({ where: { id: definition.id } });
      }
    });

    it('returns stats for multiple models', async () => {
      // Create stats for both models
      await db.modelTokenStatistics.create({
        data: {
          modelId: testModel1Id,
          definitionId: null,
          avgInputTokens: 500,
          avgOutputTokens: 1500,
          sampleCount: 100,
        },
      });

      await db.modelTokenStatistics.create({
        data: {
          modelId: testModel2Id,
          definitionId: null,
          avgInputTokens: 800,
          avgOutputTokens: 2000,
          sampleCount: 200,
        },
      });

      const result = await getTokenStatsForModels([testModel1Id, testModel2Id]);

      expect(result.size).toBe(2);
      expect(result.get(testModel1Id)?.avgInputTokens).toBe(500);
      expect(result.get(testModel2Id)?.avgInputTokens).toBe(800);
    });
  });

  describe('getAllModelAverage', () => {
    it('returns null when DB is empty', async () => {
      // Ensure no stats exist for our test models
      await db.modelTokenStatistics.deleteMany({
        where: { modelId: { in: [testModel1Id, testModel2Id, testModel3Id] } },
      });

      // Also need to ensure no other stats exist (other tests might leave data)
      await db.modelTokenStatistics.deleteMany({});

      const result = await getAllModelAverage();
      expect(result).toBeNull();
    });

    it('returns average across all models with stats', async () => {
      // Create stats for multiple models
      await db.modelTokenStatistics.create({
        data: {
          modelId: testModel1Id,
          definitionId: null,
          avgInputTokens: 400,
          avgOutputTokens: 1200,
          sampleCount: 100,
        },
      });

      await db.modelTokenStatistics.create({
        data: {
          modelId: testModel2Id,
          definitionId: null,
          avgInputTokens: 600,
          avgOutputTokens: 1800,
          sampleCount: 100,
        },
      });

      const result = await getAllModelAverage();

      expect(result).not.toBeNull();
      // Average of 400 and 600 = 500
      expect(result?.input).toBe(500);
      // Average of 1200 and 1800 = 1500
      expect(result?.output).toBe(1500);
      expect(result?.sampleCount).toBe(200);
    });

    it('ignores models with zero sample count', async () => {
      // Create stats with samples
      await db.modelTokenStatistics.create({
        data: {
          modelId: testModel1Id,
          definitionId: null,
          avgInputTokens: 500,
          avgOutputTokens: 1500,
          sampleCount: 100,
        },
      });

      // Create stats with zero samples (should be ignored)
      await db.modelTokenStatistics.create({
        data: {
          modelId: testModel2Id,
          definitionId: null,
          avgInputTokens: 10000,  // Would skew average if included
          avgOutputTokens: 30000,
          sampleCount: 0,
        },
      });

      const result = await getAllModelAverage();

      expect(result).not.toBeNull();
      // Should only include model1's stats
      expect(result?.input).toBe(500);
      expect(result?.output).toBe(1500);
    });

    it('only includes global stats in average', async () => {
      // Create global stats
      await db.modelTokenStatistics.create({
        data: {
          modelId: testModel1Id,
          definitionId: null,
          avgInputTokens: 500,
          avgOutputTokens: 1500,
          sampleCount: 100,
        },
      });

      // Create a dummy definition
      const definition = await db.definition.create({
        data: {
          name: 'Test Definition',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });

      try {
        // Create definition-specific stats (should be ignored in average)
        await db.modelTokenStatistics.create({
          data: {
            modelId: testModel2Id,
            definitionId: definition.id,
            avgInputTokens: 10000,
            avgOutputTokens: 30000,
            sampleCount: 100,
          },
        });

        const result = await getAllModelAverage();

        // Should only include global stats
        expect(result?.input).toBe(500);
        expect(result?.output).toBe(1500);
      } finally {
        // Cleanup definition
        await db.definition.delete({ where: { id: definition.id } });
      }
    });
  });

  describe('upsertTokenStats', () => {
    it('creates new record when none exists', async () => {
      await upsertTokenStats({
        modelId: testModel1Id,
        definitionId: null,
        avgInputTokens: 500,
        avgOutputTokens: 1500,
        sampleCount: 100,
      });

      // Use findFirst instead of findUnique because Prisma doesn't support null in compound keys
      const stats = await db.modelTokenStatistics.findFirst({
        where: {
          modelId: testModel1Id,
          definitionId: null,
        },
      });

      expect(stats).not.toBeNull();
      expect(Number(stats?.avgInputTokens)).toBe(500);
      expect(Number(stats?.avgOutputTokens)).toBe(1500);
      expect(stats?.sampleCount).toBe(100);
    });

    it('updates existing record', async () => {
      // Create initial stats
      await db.modelTokenStatistics.create({
        data: {
          modelId: testModel1Id,
          definitionId: null,
          avgInputTokens: 500,
          avgOutputTokens: 1500,
          sampleCount: 100,
        },
      });

      // Update with new values
      await upsertTokenStats({
        modelId: testModel1Id,
        definitionId: null,
        avgInputTokens: 600,
        avgOutputTokens: 1800,
        sampleCount: 150,
      });

      // Use findFirst instead of findUnique because Prisma doesn't support null in compound keys
      const stats = await db.modelTokenStatistics.findFirst({
        where: {
          modelId: testModel1Id,
          definitionId: null,
        },
      });

      expect(Number(stats?.avgInputTokens)).toBe(600);
      expect(Number(stats?.avgOutputTokens)).toBe(1800);
      expect(stats?.sampleCount).toBe(150);
    });

    it('creates separate records for global and definition-specific stats', async () => {
      // Create a definition
      const definition = await db.definition.create({
        data: {
          name: 'Test Definition for Upsert',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });

      try {
        // Create global stats
        await upsertTokenStats({
          modelId: testModel1Id,
          definitionId: null,
          avgInputTokens: 500,
          avgOutputTokens: 1500,
          sampleCount: 100,
        });

        // Create definition-specific stats
        await upsertTokenStats({
          modelId: testModel1Id,
          definitionId: definition.id,
          avgInputTokens: 800,
          avgOutputTokens: 2000,
          sampleCount: 50,
        });

        // Use findFirst instead of findUnique because Prisma doesn't support null in compound keys
        const globalStats = await db.modelTokenStatistics.findFirst({
          where: {
            modelId: testModel1Id,
            definitionId: null,
          },
        });

        // Definition-specific stats can use findUnique since definitionId is not null
        const defStats = await db.modelTokenStatistics.findUnique({
          where: {
            modelId_definitionId: {
              modelId: testModel1Id,
              definitionId: definition.id,
            },
          },
        });

        expect(globalStats).not.toBeNull();
        expect(defStats).not.toBeNull();
        expect(Number(globalStats?.avgInputTokens)).toBe(500);
        expect(Number(defStats?.avgInputTokens)).toBe(800);
      } finally {
        // Cleanup definition
        await db.definition.delete({ where: { id: definition.id } });
      }
    });
  });
});

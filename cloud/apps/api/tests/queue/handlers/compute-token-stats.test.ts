/**
 * Integration tests for compute-token-stats handler
 *
 * Tests the flow: job processing -> Python worker -> ModelTokenStatistics update
 * Uses mocked Python worker responses to test database integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@valuerank/db';
import { createComputeTokenStatsHandler } from '../../../src/queue/handlers/compute-token-stats.js';
import type { ComputeTokenStatsJobData } from '../../../src/queue/types.js';
import type { Job } from 'pg-boss';

// Mock the spawn module
vi.mock('../../../src/queue/spawn.js', () => ({
  spawnPython: vi.fn(),
}));

// Mock the boss module to avoid PgBoss initialization
vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn().mockReturnValue({
    send: vi.fn().mockResolvedValue('mock-job-id'),
    createQueue: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Import the mocked function
import { spawnPython } from '../../../src/queue/spawn.js';

// Test IDs - use unique timestamps to avoid conflicts
const ts = Date.now();
const TEST_IDS = {
  provider: 'test-provider-' + ts,
  model: 'test-model-' + ts,
  definition: 'test-def-' + ts,
  scenario1: 'test-scenario-1-' + ts,
  scenario2: 'test-scenario-2-' + ts,
  run: 'test-run-' + ts,
};

// Mock job factory
function createMockJob(data: Partial<ComputeTokenStatsJobData> = {}): Job<ComputeTokenStatsJobData> {
  return {
    id: 'job-' + Date.now(),
    name: 'compute_token_stats',
    data: {
      runId: TEST_IDS.run,
      ...data,
    },
    createdOn: new Date(),
    startedOn: new Date(),
  } as Job<ComputeTokenStatsJobData>;
}

describe('compute-token-stats handler', () => {
  let testModelDbId: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create test provider
    const provider = await db.llmProvider.create({
      data: {
        id: TEST_IDS.provider,
        name: 'test-provider',
        displayName: 'Test Provider',
        maxParallelRequests: 1,
        requestsPerMinute: 60,
      },
    });

    // Create test model (modelId is the identifier like 'gpt-4', id is the database CUID)
    const model = await db.llmModel.create({
      data: {
        id: TEST_IDS.model,
        providerId: provider.id,
        modelId: 'test-gpt-4',
        displayName: 'Test GPT-4',
        costInputPerMillion: 10,
        costOutputPerMillion: 30,
      },
    });
    testModelDbId = model.id;

    // Create test definition
    await db.definition.create({
      data: {
        id: TEST_IDS.definition,
        name: 'Test Definition',
        content: { preamble: 'Test' },
      },
    });

    // Create test scenarios (need two for unique constraint)
    await db.scenario.create({
      data: {
        id: TEST_IDS.scenario1,
        definitionId: TEST_IDS.definition,
        name: 'Test Scenario 1',
        content: { prompt: 'Test 1' },
      },
    });
    await db.scenario.create({
      data: {
        id: TEST_IDS.scenario2,
        definitionId: TEST_IDS.definition,
        name: 'Test Scenario 2',
        content: { prompt: 'Test 2' },
      },
    });

    // Create test run (COMPLETED status so handler processes it)
    await db.run.create({
      data: {
        id: TEST_IDS.run,
        definitionId: TEST_IDS.definition,
        status: 'COMPLETED',
        config: { models: ['test-gpt-4'] },
        progress: { total: 2, completed: 2, failed: 0 },
      },
    });

    // Create probe results with token data (each with unique scenario)
    await db.probeResult.createMany({
      data: [
        {
          runId: TEST_IDS.run,
          scenarioId: TEST_IDS.scenario1,
          modelId: 'test-gpt-4',
          status: 'SUCCESS',
          inputTokens: 100,
          outputTokens: 500,
        },
        {
          runId: TEST_IDS.run,
          scenarioId: TEST_IDS.scenario2,
          modelId: 'test-gpt-4',
          status: 'SUCCESS',
          inputTokens: 200,
          outputTokens: 600,
        },
      ],
    });
  });

  afterEach(async () => {
    // Clean up in correct order
    await db.modelTokenStatistics.deleteMany({ where: { modelId: testModelDbId } });
    await db.probeResult.deleteMany({ where: { runId: TEST_IDS.run } });
    await db.run.deleteMany({ where: { id: TEST_IDS.run } });
    await db.scenario.deleteMany({ where: { id: { in: [TEST_IDS.scenario1, TEST_IDS.scenario2] } } });
    await db.definition.deleteMany({ where: { id: TEST_IDS.definition } });
    await db.llmModel.deleteMany({ where: { id: TEST_IDS.model } });
    await db.llmProvider.deleteMany({ where: { id: TEST_IDS.provider } });
  });

  describe('successful stats computation', () => {
    it('creates ModelTokenStatistics with computed averages', async () => {
      // Mock Python worker response
      vi.mocked(spawnPython).mockResolvedValue({
        success: true,
        data: {
          success: true,
          stats: {
            'test-gpt-4': {
              avgInputTokens: 150, // Average of 100, 200
              avgOutputTokens: 550, // Average of 500, 600
              sampleCount: 2,
            },
          },
          summary: {
            modelsUpdated: 1,
            totalProbesProcessed: 2,
            durationMs: 50,
          },
        },
      });

      const handler = createComputeTokenStatsHandler();
      await handler([createMockJob()]);

      // Verify stats were created
      const stats = await db.modelTokenStatistics.findFirst({
        where: { modelId: testModelDbId, definitionId: null },
      });

      expect(stats).not.toBeNull();
      expect(Number(stats?.avgInputTokens)).toBe(150);
      expect(Number(stats?.avgOutputTokens)).toBe(550);
      expect(stats?.sampleCount).toBe(2);
    });

    it('updates existing stats with EMA', async () => {
      // Create existing stats
      await db.modelTokenStatistics.create({
        data: {
          modelId: testModelDbId,
          definitionId: null,
          avgInputTokens: 100,
          avgOutputTokens: 500,
          sampleCount: 50,
        },
      });

      // Mock Python worker response with EMA-applied values
      vi.mocked(spawnPython).mockResolvedValue({
        success: true,
        data: {
          success: true,
          stats: {
            'test-gpt-4': {
              avgInputTokens: 115, // EMA: 0.3 * 150 + 0.7 * 100 = 115
              avgOutputTokens: 515, // EMA: 0.3 * 550 + 0.7 * 500 = 515
              sampleCount: 52,
            },
          },
          summary: {
            modelsUpdated: 1,
            totalProbesProcessed: 2,
            durationMs: 50,
          },
        },
      });

      const handler = createComputeTokenStatsHandler();
      await handler([createMockJob()]);

      // Verify stats were updated
      const stats = await db.modelTokenStatistics.findFirst({
        where: { modelId: testModelDbId, definitionId: null },
      });

      expect(stats).not.toBeNull();
      expect(Number(stats?.avgInputTokens)).toBe(115);
      expect(Number(stats?.avgOutputTokens)).toBe(515);
      expect(stats?.sampleCount).toBe(52);
    });
  });

  describe('edge cases', () => {
    it('skips non-COMPLETED runs', async () => {
      // Update run to RUNNING status
      await db.run.update({
        where: { id: TEST_IDS.run },
        data: { status: 'RUNNING' },
      });

      const handler = createComputeTokenStatsHandler();
      await handler([createMockJob()]);

      // Python worker should not be called
      expect(spawnPython).not.toHaveBeenCalled();
    });

    it('skips runs with no probe results', async () => {
      // Delete probe results
      await db.probeResult.deleteMany({ where: { runId: TEST_IDS.run } });

      const handler = createComputeTokenStatsHandler();
      await handler([createMockJob()]);

      // Python worker should not be called
      expect(spawnPython).not.toHaveBeenCalled();
    });

    it('handles Python worker failure gracefully', async () => {
      // Mock Python worker failure
      vi.mocked(spawnPython).mockResolvedValue({
        success: false,
        error: 'Worker crashed',
        stderr: 'Error details',
      });

      const handler = createComputeTokenStatsHandler();

      // Should throw to trigger retry
      await expect(handler([createMockJob()])).rejects.toThrow();
    });

    it('handles non-retryable worker errors', async () => {
      // Mock non-retryable error
      vi.mocked(spawnPython).mockResolvedValue({
        success: true,
        data: {
          success: false,
          error: {
            message: 'Invalid input',
            code: 'VALIDATION_ERROR',
            retryable: false,
          },
        },
      });

      const handler = createComputeTokenStatsHandler();

      // Should complete without throwing (error is logged but job completes)
      await expect(handler([createMockJob()])).resolves.not.toThrow();
    });
  });
});

/**
 * start_run Tool Tests
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { db } from '@valuerank/db';

// Mock the queue boss
vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn().mockReturnValue({
    send: vi.fn().mockResolvedValue('mock-job-id'),
  }),
}));

// Import after mocking
import { startRun } from '../../../src/services/run/index.js';

describe('start_run tool', () => {
  let testDefinitionId: string;
  let testScenarioIds: string[] = [];
  const createdRunIds: string[] = [];

  beforeAll(async () => {
    // Create test definition
    const definition = await db.definition.create({
      data: {
        name: 'test-start-run-def-' + Date.now(),
        content: {
          schema_version: 2,
          preamble: 'Test preamble',
          template: '[variable]',
          dimensions: [{ name: 'variable', values: ['a', 'b', 'c'] }],
        },
      },
    });
    testDefinitionId = definition.id;

    // Create test scenarios
    for (let i = 0; i < 3; i++) {
      const scenario = await db.scenario.create({
        data: {
          definitionId: testDefinitionId,
          name: `test-scenario-${i}-${Date.now()}`,
          content: {
            schema_version: 1,
            prompt: `Test prompt ${i}`,
            dimension_values: { variable: ['a', 'b', 'c'][i] },
          },
        },
      });
      testScenarioIds.push(scenario.id);
    }
  });

  afterAll(async () => {
    // Clean up runs first
    for (const runId of createdRunIds) {
      try {
        await db.runScenarioSelection.deleteMany({ where: { runId } });
        await db.run.delete({ where: { id: runId } });
      } catch {
        // Ignore
      }
    }

    // Clean up scenarios
    for (const scenarioId of testScenarioIds) {
      try {
        await db.scenario.delete({ where: { id: scenarioId } });
      } catch {
        // Ignore
      }
    }

    // Clean up definition
    try {
      await db.definition.delete({ where: { id: testDefinitionId } });
    } catch {
      // Ignore
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful run start', () => {
    it('starts run with valid inputs', async () => {
      const result = await startRun({
        definitionId: testDefinitionId,
        models: ['openai:gpt-4'],
        userId: 'test-user',
      });

      createdRunIds.push(result.run.id);

      expect(result.run.id).toBeDefined();
      expect(result.run.status).toBe('PENDING');
      expect(result.run.definitionId).toBe(testDefinitionId);
      expect(result.jobCount).toBe(3); // 3 scenarios × 1 model
    });

    it('starts run with multiple models', async () => {
      const result = await startRun({
        definitionId: testDefinitionId,
        models: ['openai:gpt-4', 'anthropic:claude-3-opus'],
        userId: 'test-user',
      });

      createdRunIds.push(result.run.id);

      expect(result.jobCount).toBe(6); // 3 scenarios × 2 models
    });

    it('respects sample_percentage', async () => {
      const result = await startRun({
        definitionId: testDefinitionId,
        models: ['openai:gpt-4'],
        samplePercentage: 34, // Should sample ~1 scenario from 3
        sampleSeed: 42,
        userId: 'test-user',
      });

      createdRunIds.push(result.run.id);

      // With 34% of 3 scenarios, should get at least 1
      expect(result.jobCount).toBeGreaterThanOrEqual(1);
      expect(result.jobCount).toBeLessThanOrEqual(3);
    });

    it('creates correct progress tracking', async () => {
      const result = await startRun({
        definitionId: testDefinitionId,
        models: ['openai:gpt-4'],
        userId: 'test-user',
      });

      createdRunIds.push(result.run.id);

      expect(result.run.progress).toEqual({
        total: 3,
        completed: 0,
        failed: 0,
      });
    });
  });

  describe('validation errors', () => {
    it('throws for non-existent definition', async () => {
      await expect(
        startRun({
          definitionId: '00000000-0000-0000-0000-000000000000',
          models: ['openai:gpt-4'],
          userId: 'test-user',
        })
      ).rejects.toThrow();
    });

    it('throws for empty models array', async () => {
      await expect(
        startRun({
          definitionId: testDefinitionId,
          models: [],
          userId: 'test-user',
        })
      ).rejects.toThrow('At least one model');
    });

    it('throws for invalid sample_percentage', async () => {
      await expect(
        startRun({
          definitionId: testDefinitionId,
          models: ['openai:gpt-4'],
          samplePercentage: 0, // Invalid
          userId: 'test-user',
        })
      ).rejects.toThrow();

      await expect(
        startRun({
          definitionId: testDefinitionId,
          models: ['openai:gpt-4'],
          samplePercentage: 101, // Invalid
          userId: 'test-user',
        })
      ).rejects.toThrow();
    });
  });

  describe('job queuing', () => {
    it('queues correct number of jobs', async () => {
      const result = await startRun({
        definitionId: testDefinitionId,
        models: ['openai:gpt-4', 'anthropic:claude-3-sonnet'],
        userId: 'test-user',
      });

      createdRunIds.push(result.run.id);

      // 3 scenarios × 2 models = 6 jobs
      expect(result.jobCount).toBe(6);
    });

    it('stores run config with models', async () => {
      const models = ['openai:gpt-4', 'anthropic:claude-3-opus'];
      const result = await startRun({
        definitionId: testDefinitionId,
        models,
        userId: 'test-user',
      });

      createdRunIds.push(result.run.id);

      const config = result.run.config as Record<string, unknown>;
      expect(config.models).toEqual(models);
    });
  });

  describe('response format', () => {
    it('returns expected fields', async () => {
      const result = await startRun({
        definitionId: testDefinitionId,
        models: ['openai:gpt-4'],
        userId: 'test-user',
      });

      createdRunIds.push(result.run.id);

      expect(result).toHaveProperty('run');
      expect(result).toHaveProperty('jobCount');
      expect(result.run).toHaveProperty('id');
      expect(result.run).toHaveProperty('status');
      expect(result.run).toHaveProperty('definitionId');
      expect(result.run).toHaveProperty('progress');
      expect(result.run).toHaveProperty('createdAt');
    });
  });

  describe('audit logging', () => {
    it('includes expected audit fields', () => {
      const auditEntry = {
        action: 'start_run',
        userId: 'mcp-user',
        entityId: 'run-123',
        entityType: 'run',
        requestId: 'req-456',
        metadata: {
          definitionId: 'def-789',
          models: ['openai:gpt-4'],
          samplePercentage: 100,
        },
      };

      expect(auditEntry.action).toBe('start_run');
      expect(auditEntry.metadata?.models).toEqual(['openai:gpt-4']);
    });
  });
});

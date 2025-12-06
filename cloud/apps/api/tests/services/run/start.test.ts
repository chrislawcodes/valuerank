/**
 * Unit tests for startRun service
 *
 * Tests run creation and job queuing logic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@valuerank/db';
import { startRun } from '../../../src/services/run/start.js';
import { NotFoundError, ValidationError } from '@valuerank/shared';

// Mock PgBoss
vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => ({
    send: vi.fn().mockResolvedValue('mock-job-id'),
  })),
}));

describe('startRun service', () => {
  const testUserId = 'test-user-id';
  const createdDefinitionIds: string[] = [];
  const createdExperimentIds: string[] = [];
  const createdRunIds: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up runs first (foreign key constraint)
    if (createdRunIds.length > 0) {
      await db.runScenarioSelection.deleteMany({
        where: { runId: { in: createdRunIds } },
      });
      await db.run.deleteMany({
        where: { id: { in: createdRunIds } },
      });
      createdRunIds.length = 0;
    }

    // Clean up experiments
    if (createdExperimentIds.length > 0) {
      await db.experiment.deleteMany({
        where: { id: { in: createdExperimentIds } },
      });
      createdExperimentIds.length = 0;
    }

    // Clean up definitions (cascades scenarios)
    if (createdDefinitionIds.length > 0) {
      await db.scenario.deleteMany({
        where: { definitionId: { in: createdDefinitionIds } },
      });
      await db.definition.deleteMany({
        where: { id: { in: createdDefinitionIds } },
      });
      createdDefinitionIds.length = 0;
    }
  });

  describe('job creation count', () => {
    it('creates correct number of jobs for model × scenario combinations', async () => {
      // Create definition with 3 scenarios
      const definition = await db.definition.create({
        data: {
          name: 'Test Definition',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      createdDefinitionIds.push(definition.id);

      // Create scenarios
      await db.scenario.createMany({
        data: [
          { definitionId: definition.id, name: 'Scenario 1', content: { test: 1 } },
          { definitionId: definition.id, name: 'Scenario 2', content: { test: 2 } },
          { definitionId: definition.id, name: 'Scenario 3', content: { test: 3 } },
        ],
      });

      const models = ['gpt-4', 'claude-3'];

      const result = await startRun({
        definitionId: definition.id,
        models,
        userId: testUserId,
      });

      createdRunIds.push(result.run.id);

      // 3 scenarios × 2 models = 6 jobs
      expect(result.jobCount).toBe(6);
      expect(result.run.progress.total).toBe(6);
      expect(result.run.progress.completed).toBe(0);
      expect(result.run.progress.failed).toBe(0);
    });

    it('creates jobs for single model and many scenarios', async () => {
      // Create definition with 10 scenarios
      const definition = await db.definition.create({
        data: {
          name: 'Large Definition',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      createdDefinitionIds.push(definition.id);

      const scenarioData = Array.from({ length: 10 }, (_, i) => ({
        definitionId: definition.id,
        name: `Scenario ${i + 1}`,
        content: { test: i + 1 },
      }));

      await db.scenario.createMany({ data: scenarioData });

      const result = await startRun({
        definitionId: definition.id,
        models: ['gpt-4'],
        userId: testUserId,
      });

      createdRunIds.push(result.run.id);

      // 10 scenarios × 1 model = 10 jobs
      expect(result.jobCount).toBe(10);
      expect(result.run.progress.total).toBe(10);
    });
  });

  describe('sampling with deterministic seed', () => {
    it('samples scenarios based on percentage', async () => {
      // Create definition with 10 scenarios
      const definition = await db.definition.create({
        data: {
          name: 'Sampling Test Definition',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      createdDefinitionIds.push(definition.id);

      const scenarioData = Array.from({ length: 10 }, (_, i) => ({
        definitionId: definition.id,
        name: `Scenario ${i + 1}`,
        content: { test: i + 1 },
      }));

      await db.scenario.createMany({ data: scenarioData });

      const result = await startRun({
        definitionId: definition.id,
        models: ['gpt-4'],
        samplePercentage: 50,
        sampleSeed: 12345,
        userId: testUserId,
      });

      createdRunIds.push(result.run.id);

      // 50% of 10 = 5 scenarios × 1 model = 5 jobs
      expect(result.jobCount).toBe(5);
      expect(result.run.progress.total).toBe(5);
    });

    it('produces deterministic results with same seed', async () => {
      // Create definition with scenarios
      const definition = await db.definition.create({
        data: {
          name: 'Deterministic Sampling Test',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      createdDefinitionIds.push(definition.id);

      const scenarioData = Array.from({ length: 20 }, (_, i) => ({
        definitionId: definition.id,
        name: `Scenario ${i + 1}`,
        content: { test: i + 1 },
      }));

      await db.scenario.createMany({ data: scenarioData });

      const seed = 42;

      // Run twice with same seed
      const result1 = await startRun({
        definitionId: definition.id,
        models: ['gpt-4'],
        samplePercentage: 30,
        sampleSeed: seed,
        userId: testUserId,
      });
      createdRunIds.push(result1.run.id);

      const result2 = await startRun({
        definitionId: definition.id,
        models: ['gpt-4'],
        samplePercentage: 30,
        sampleSeed: seed,
        userId: testUserId,
      });
      createdRunIds.push(result2.run.id);

      // Both should have same job count
      expect(result1.jobCount).toBe(result2.jobCount);

      // Check that scenario selections are the same
      const selections1 = await db.runScenarioSelection.findMany({
        where: { runId: result1.run.id },
        orderBy: { scenarioId: 'asc' },
      });
      const selections2 = await db.runScenarioSelection.findMany({
        where: { runId: result2.run.id },
        orderBy: { scenarioId: 'asc' },
      });

      const scenarioIds1 = selections1.map((s) => s.scenarioId);
      const scenarioIds2 = selections2.map((s) => s.scenarioId);

      expect(scenarioIds1).toEqual(scenarioIds2);
    });

    it('samples at least one scenario even at very low percentage', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Min Sampling Test',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      createdDefinitionIds.push(definition.id);

      const scenarioData = Array.from({ length: 100 }, (_, i) => ({
        definitionId: definition.id,
        name: `Scenario ${i + 1}`,
        content: { test: i + 1 },
      }));

      await db.scenario.createMany({ data: scenarioData });

      const result = await startRun({
        definitionId: definition.id,
        models: ['gpt-4'],
        samplePercentage: 1,
        userId: testUserId,
      });

      createdRunIds.push(result.run.id);

      // 1% of 100 = 1 scenario minimum
      expect(result.jobCount).toBeGreaterThanOrEqual(1);
    });

    it('includes all scenarios at 100%', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Full Sampling Test',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      createdDefinitionIds.push(definition.id);

      const scenarioData = Array.from({ length: 5 }, (_, i) => ({
        definitionId: definition.id,
        name: `Scenario ${i + 1}`,
        content: { test: i + 1 },
      }));

      await db.scenario.createMany({ data: scenarioData });

      const result = await startRun({
        definitionId: definition.id,
        models: ['gpt-4'],
        samplePercentage: 100,
        userId: testUserId,
      });

      createdRunIds.push(result.run.id);

      // All 5 scenarios should be included
      expect(result.jobCount).toBe(5);
    });
  });

  describe('validation errors', () => {
    it('throws NotFoundError for non-existent definition', async () => {
      await expect(
        startRun({
          definitionId: 'non-existent-id',
          models: ['gpt-4'],
          userId: testUserId,
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError for definition with no scenarios', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Empty Definition',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      createdDefinitionIds.push(definition.id);

      await expect(
        startRun({
          definitionId: definition.id,
          models: ['gpt-4'],
          userId: testUserId,
        })
      ).rejects.toThrow(ValidationError);

      await expect(
        startRun({
          definitionId: definition.id,
          models: ['gpt-4'],
          userId: testUserId,
        })
      ).rejects.toThrow('no scenarios');
    });

    it('throws ValidationError for empty models list', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Models Test Definition',
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

      await expect(
        startRun({
          definitionId: definition.id,
          models: [],
          userId: testUserId,
        })
      ).rejects.toThrow(ValidationError);

      await expect(
        startRun({
          definitionId: definition.id,
          models: [],
          userId: testUserId,
        })
      ).rejects.toThrow('At least one model');
    });

    it('throws ValidationError for invalid samplePercentage', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Sample Percentage Test',
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

      // Too low
      await expect(
        startRun({
          definitionId: definition.id,
          models: ['gpt-4'],
          samplePercentage: 0,
          userId: testUserId,
        })
      ).rejects.toThrow(ValidationError);

      // Too high
      await expect(
        startRun({
          definitionId: definition.id,
          models: ['gpt-4'],
          samplePercentage: 101,
          userId: testUserId,
        })
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for invalid priority', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Priority Test Definition',
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

      await expect(
        startRun({
          definitionId: definition.id,
          models: ['gpt-4'],
          priority: 'INVALID',
          userId: testUserId,
        })
      ).rejects.toThrow(ValidationError);

      await expect(
        startRun({
          definitionId: definition.id,
          models: ['gpt-4'],
          priority: 'INVALID',
          userId: testUserId,
        })
      ).rejects.toThrow('Invalid priority');
    });

    it('throws NotFoundError for non-existent experiment', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Experiment Test Definition',
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

      await expect(
        startRun({
          definitionId: definition.id,
          models: ['gpt-4'],
          experimentId: 'non-existent-experiment',
          userId: testUserId,
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('progress initialization', () => {
    it('initializes progress with correct total and zero counts', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Progress Test Definition',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      createdDefinitionIds.push(definition.id);

      await db.scenario.createMany({
        data: [
          { definitionId: definition.id, name: 'Scenario 1', content: { test: 1 } },
          { definitionId: definition.id, name: 'Scenario 2', content: { test: 2 } },
        ],
      });

      const result = await startRun({
        definitionId: definition.id,
        models: ['gpt-4', 'claude-3', 'gemini-pro'],
        userId: testUserId,
      });

      createdRunIds.push(result.run.id);

      // 2 scenarios × 3 models = 6 total
      expect(result.run.progress).toEqual({
        total: 6,
        completed: 0,
        failed: 0,
      });
    });

    it('persists progress in database', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Progress Persist Test',
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

      const result = await startRun({
        definitionId: definition.id,
        models: ['gpt-4'],
        userId: testUserId,
      });

      createdRunIds.push(result.run.id);

      // Verify in database
      const dbRun = await db.run.findUnique({
        where: { id: result.run.id },
      });

      expect(dbRun).toBeDefined();
      expect(dbRun?.progress).toEqual({
        total: 1,
        completed: 0,
        failed: 0,
      });
    });
  });

  describe('run record creation', () => {
    it('creates run with PENDING status', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Status Test Definition',
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

      const result = await startRun({
        definitionId: definition.id,
        models: ['gpt-4'],
        userId: testUserId,
      });

      createdRunIds.push(result.run.id);

      expect(result.run.status).toBe('PENDING');
    });

    it('stores config with models and sampling info', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Config Test Definition',
          content: { schema_version: 1, preamble: 'Test', custom: 'field' },
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

      const result = await startRun({
        definitionId: definition.id,
        models: ['gpt-4', 'claude-3'],
        samplePercentage: 75,
        sampleSeed: 42,
        priority: 'HIGH',
        userId: testUserId,
      });

      createdRunIds.push(result.run.id);

      const config = result.run.config as Record<string, unknown>;
      expect(config.models).toEqual(['gpt-4', 'claude-3']);
      expect(config.samplePercentage).toBe(75);
      expect(config.sampleSeed).toBe(42);
      expect(config.priority).toBe('HIGH');
      expect(config.definitionSnapshot).toBeDefined();
    });

    it('links run to experiment when provided', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Experiment Link Test',
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

      const experiment = await db.experiment.create({
        data: {
          name: 'Test Experiment',
          hypothesis: 'Test hypothesis',
        },
      });
      createdExperimentIds.push(experiment.id);

      const result = await startRun({
        definitionId: definition.id,
        models: ['gpt-4'],
        experimentId: experiment.id,
        userId: testUserId,
      });

      createdRunIds.push(result.run.id);

      expect(result.run.experimentId).toBe(experiment.id);
    });

    it('creates RunScenarioSelection records', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Selection Test Definition',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      createdDefinitionIds.push(definition.id);

      await db.scenario.createMany({
        data: [
          { definitionId: definition.id, name: 'Scenario 1', content: { test: 1 } },
          { definitionId: definition.id, name: 'Scenario 2', content: { test: 2 } },
          { definitionId: definition.id, name: 'Scenario 3', content: { test: 3 } },
        ],
      });

      const result = await startRun({
        definitionId: definition.id,
        models: ['gpt-4'],
        userId: testUserId,
      });

      createdRunIds.push(result.run.id);

      const selections = await db.runScenarioSelection.findMany({
        where: { runId: result.run.id },
      });

      expect(selections.length).toBe(3);
    });
  });
});

/**
 * Integration tests for run query helpers.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  createRun,
  getRunById,
  getRunWithTranscripts,
  getRunWithProgress,
  listRuns,
  getRunsForDefinitionTree,
  updateRunStatus,
  updateRunProgress,
  incrementRunProgress,
  touchRun,
  touchRuns,
} from '../src/queries/runs.js';
import { createDefinition, forkDefinition } from '../src/queries/definitions.js';
import { createTranscript } from '../src/queries/transcripts.js';
import type { DefinitionContent, RunConfig, TranscriptContent } from '../src/types.js';

const prisma = new PrismaClient();

// Skip tests if no database URL
const skipIfNoDb = process.env.DATABASE_URL ? describe : describe.skip;

// Helper to create a definition for tests
async function createTestDefinition(name = 'Test Definition') {
  const content: DefinitionContent = {
    schema_version: 1,
    preamble: 'Test preamble',
    template: 'Test template',
    dimensions: [],
  };
  return createDefinition({ name, content });
}

// Helper to create valid run config
function createRunConfig(): RunConfig {
  return {
    schema_version: 1,
    models: ['gpt-4', 'claude-3'],
  };
}

skipIfNoDb('Run Queries (Integration)', () => {
  beforeEach(async () => {
    // Clean up test data in correct FK order
    await prisma.analysisResult.deleteMany();
    await prisma.runComparison.deleteMany();
    await prisma.runScenarioSelection.deleteMany();
    await prisma.transcript.deleteMany();
    await prisma.scenario.deleteMany();
    await prisma.run.deleteMany();
    await prisma.experiment.deleteMany();
    await prisma.definition.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('createRun', () => {
    it('creates a run with valid data', async () => {
      const definition = await createTestDefinition();

      const result = await createRun({
        definitionId: definition.id,
        config: createRunConfig(),
      });

      expect(result.id).toBeDefined();
      expect(result.definitionId).toBe(definition.id);
      expect(result.status).toBe('PENDING');
    });

    it('creates a run with experiment ID', async () => {
      const definition = await createTestDefinition();
      const experiment = await prisma.experiment.create({
        data: { name: 'Test Experiment' },
      });

      const result = await createRun({
        definitionId: definition.id,
        config: createRunConfig(),
        experimentId: experiment.id,
      });

      expect(result.experimentId).toBe(experiment.id);
    });

    it('initializes progress to zeros', async () => {
      const definition = await createTestDefinition();

      const result = await createRun({
        definitionId: definition.id,
        config: createRunConfig(),
      });

      const progress = result.progress as { total: number; completed: number; failed: number };
      expect(progress.total).toBe(0);
      expect(progress.completed).toBe(0);
      expect(progress.failed).toBe(0);
    });

    it('throws on missing definition ID', async () => {
      await expect(
        createRun({
          definitionId: '',
          config: createRunConfig(),
        })
      ).rejects.toThrow('Definition ID is required');
    });

    it('throws on missing config', async () => {
      const definition = await createTestDefinition();

      await expect(
        createRun({
          definitionId: definition.id,
          config: undefined as unknown as RunConfig,
        })
      ).rejects.toThrow('Run config is required');
    });
  });

  describe('getRunById', () => {
    it('returns run when exists', async () => {
      const definition = await createTestDefinition();
      const created = await createRun({
        definitionId: definition.id,
        config: createRunConfig(),
      });

      const result = await getRunById(created.id);

      expect(result.id).toBe(created.id);
    });

    it('throws NotFoundError when not exists', async () => {
      await expect(getRunById('non-existent-id')).rejects.toThrow(
        'Run not found: non-existent-id'
      );
    });
  });

  describe('getRunWithTranscripts', () => {
    it('returns run with transcripts', async () => {
      const definition = await createTestDefinition();
      const run = await createRun({
        definitionId: definition.id,
        config: createRunConfig(),
      });

      const content: TranscriptContent = {
        schema_version: 1,
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await createTranscript({
        runId: run.id,
        modelId: 'gpt-4',
        content,
        turnCount: 1,
        tokenCount: 50,
        durationMs: 300,
      });

      const result = await getRunWithTranscripts(run.id);

      expect(result.id).toBe(run.id);
      expect(result.transcripts).toHaveLength(1);
      expect(result.parsedConfig.models).toContain('gpt-4');
    });

    it('throws NotFoundError when run not exists', async () => {
      await expect(getRunWithTranscripts('non-existent')).rejects.toThrow(
        'Run not found: non-existent'
      );
    });
  });

  describe('getRunWithProgress', () => {
    it('returns run with parsed config and progress', async () => {
      const definition = await createTestDefinition();
      const run = await createRun({
        definitionId: definition.id,
        config: createRunConfig(),
      });

      const result = await getRunWithProgress(run.id);

      expect(result.id).toBe(run.id);
      expect(result.parsedConfig.models).toEqual(['gpt-4', 'claude-3']);
      expect(result.parsedProgress?.total).toBe(0);
    });
  });

  describe('listRuns', () => {
    it('returns all runs without filters', async () => {
      const definition = await createTestDefinition();
      await createRun({ definitionId: definition.id, config: createRunConfig() });
      await createRun({ definitionId: definition.id, config: createRunConfig() });

      const result = await listRuns();

      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('filters by definitionId', async () => {
      const def1 = await createTestDefinition('Def1');
      const def2 = await createTestDefinition('Def2');

      await createRun({ definitionId: def1.id, config: createRunConfig() });
      await createRun({ definitionId: def2.id, config: createRunConfig() });

      const result = await listRuns({ definitionId: def1.id });

      expect(result.every((r) => r.definitionId === def1.id)).toBe(true);
    });

    it('filters by status', async () => {
      const definition = await createTestDefinition();
      const run = await createRun({ definitionId: definition.id, config: createRunConfig() });
      await updateRunStatus(run.id, 'RUNNING');

      const pending = await listRuns({ status: 'PENDING' });
      const running = await listRuns({ status: 'RUNNING' });

      expect(pending.every((r) => r.status === 'PENDING')).toBe(true);
      expect(running.some((r) => r.id === run.id)).toBe(true);
    });

    it('filters by experimentId', async () => {
      const definition = await createTestDefinition();
      const experiment = await prisma.experiment.create({
        data: { name: 'Test Experiment' },
      });

      await createRun({
        definitionId: definition.id,
        config: createRunConfig(),
        experimentId: experiment.id,
      });
      await createRun({ definitionId: definition.id, config: createRunConfig() });

      const result = await listRuns({ experimentId: experiment.id });

      expect(result.every((r) => r.experimentId === experiment.id)).toBe(true);
    });

    it('supports pagination', async () => {
      const definition = await createTestDefinition();
      for (let i = 0; i < 5; i++) {
        await createRun({ definitionId: definition.id, config: createRunConfig() });
      }

      const page1 = await listRuns({ limit: 2, offset: 0 });
      const page2 = await listRuns({ limit: 2, offset: 2 });

      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
    });
  });

  describe('getRunsForDefinitionTree', () => {
    it('returns runs for definition and descendants', async () => {
      const root = await createTestDefinition('Root');
      const child = await forkDefinition(root.id, { name: 'Child' });
      const grandchild = await forkDefinition(child.id, { name: 'Grandchild' });

      await createRun({ definitionId: root.id, config: createRunConfig() });
      await createRun({ definitionId: child.id, config: createRunConfig() });
      await createRun({ definitionId: grandchild.id, config: createRunConfig() });

      const result = await getRunsForDefinitionTree(root.id);

      expect(result.length).toBe(3);
    });
  });

  describe('updateRunStatus', () => {
    it('updates status to RUNNING and sets startedAt', async () => {
      const definition = await createTestDefinition();
      const run = await createRun({ definitionId: definition.id, config: createRunConfig() });

      const result = await updateRunStatus(run.id, 'RUNNING');

      expect(result.status).toBe('RUNNING');
      expect(result.startedAt).not.toBeNull();
    });

    it('updates status to COMPLETED and sets completedAt', async () => {
      const definition = await createTestDefinition();
      const run = await createRun({ definitionId: definition.id, config: createRunConfig() });

      const result = await updateRunStatus(run.id, 'COMPLETED');

      expect(result.status).toBe('COMPLETED');
      expect(result.completedAt).not.toBeNull();
    });

    it('updates status to FAILED and sets completedAt', async () => {
      const definition = await createTestDefinition();
      const run = await createRun({ definitionId: definition.id, config: createRunConfig() });

      const result = await updateRunStatus(run.id, 'FAILED');

      expect(result.status).toBe('FAILED');
      expect(result.completedAt).not.toBeNull();
    });

    it('updates status to CANCELLED and sets completedAt', async () => {
      const definition = await createTestDefinition();
      const run = await createRun({ definitionId: definition.id, config: createRunConfig() });

      const result = await updateRunStatus(run.id, 'CANCELLED');

      expect(result.status).toBe('CANCELLED');
      expect(result.completedAt).not.toBeNull();
    });

    it('throws NotFoundError for non-existent run', async () => {
      await expect(updateRunStatus('non-existent', 'RUNNING')).rejects.toThrow(
        'Run not found'
      );
    });
  });

  describe('updateRunProgress', () => {
    it('updates progress values', async () => {
      const definition = await createTestDefinition();
      const run = await createRun({ definitionId: definition.id, config: createRunConfig() });

      const result = await updateRunProgress(run.id, { total: 10, completed: 5, failed: 1 });

      const progress = result.progress as { total: number; completed: number; failed: number };
      expect(progress.total).toBe(10);
      expect(progress.completed).toBe(5);
      expect(progress.failed).toBe(1);
    });

    it('throws NotFoundError for non-existent run', async () => {
      await expect(
        updateRunProgress('non-existent', { total: 10, completed: 5, failed: 1 })
      ).rejects.toThrow('Run not found');
    });
  });

  describe('incrementRunProgress', () => {
    it('increments completed count', async () => {
      const definition = await createTestDefinition();
      const run = await createRun({ definitionId: definition.id, config: createRunConfig() });

      await incrementRunProgress(run.id, { completed: 1 });
      await incrementRunProgress(run.id, { completed: 2 });

      const updated = await getRunById(run.id);
      const progress = updated.progress as { completed: number };
      expect(progress.completed).toBe(3);
    });

    it('increments failed count', async () => {
      const definition = await createTestDefinition();
      const run = await createRun({ definitionId: definition.id, config: createRunConfig() });

      await incrementRunProgress(run.id, { failed: 1 });

      const updated = await getRunById(run.id);
      const progress = updated.progress as { failed: number };
      expect(progress.failed).toBe(1);
    });

    it('increments both completed and failed', async () => {
      const definition = await createTestDefinition();
      const run = await createRun({ definitionId: definition.id, config: createRunConfig() });

      await incrementRunProgress(run.id, { completed: 5, failed: 2 });

      const updated = await getRunById(run.id);
      const progress = updated.progress as { completed: number; failed: number };
      expect(progress.completed).toBe(5);
      expect(progress.failed).toBe(2);
    });
  });

  describe('Access Tracking', () => {
    it('touchRun updates lastAccessedAt', async () => {
      const definition = await createTestDefinition();
      const run = await createRun({ definitionId: definition.id, config: createRunConfig() });

      expect(run.lastAccessedAt).toBeNull();

      await touchRun(run.id);

      const updated = await getRunById(run.id);
      expect(updated.lastAccessedAt).not.toBeNull();
    });

    it('touchRuns updates multiple runs', async () => {
      const definition = await createTestDefinition();
      const run1 = await createRun({ definitionId: definition.id, config: createRunConfig() });
      const run2 = await createRun({ definitionId: definition.id, config: createRunConfig() });

      await touchRuns([run1.id, run2.id]);

      const updated1 = await getRunById(run1.id);
      const updated2 = await getRunById(run2.id);

      expect(updated1.lastAccessedAt).not.toBeNull();
      expect(updated2.lastAccessedAt).not.toBeNull();
    });

    it('touchRuns handles empty array', async () => {
      await touchRuns([]);
      // Should not throw
    });
  });
});
